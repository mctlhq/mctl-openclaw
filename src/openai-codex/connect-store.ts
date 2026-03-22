import fs from "node:fs";
import path from "node:path";
import { resolveOpenClawAgentDir } from "../agents/agent-paths.js";
import { ensureAuthProfileStore, saveAuthProfileStore } from "../agents/auth-profiles.js";
import type { OAuthCredential } from "../agents/auth-profiles.js";
import { resolveStateDir } from "../config/paths.js";
import { readJsonFileWithFallback, writeJsonFileAtomically } from "../plugin-sdk/json-store.js";

const OPENAI_CODEX_AUTH_SUBDIR = path.join("oauth-connect", "openai-codex");
const OPENAI_CODEX_PENDING_FILE = "pending-connect.json";
export const MCTL_OWNER_SCOPE = "mctl.owner";

export type OpenAICodexPendingRecord = {
  version: 1;
  redirectUri: string;
  state: string;
  codeVerifier: string;
  startedAt: string;
  requestedBy: string | null;
};

export type OpenAICodexConnectStatus = {
  state: "connected" | "pending" | "expired" | "disconnected";
  connected: boolean;
  pending: boolean;
  accountLabel: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
  startedAt: string | null;
  requestedBy: string | null;
  canManage: boolean;
  teamRole: string | null;
};

function resolveOpenAICodexAuthDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), OPENAI_CODEX_AUTH_SUBDIR);
}

function resolveOpenAICodexPendingPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveOpenAICodexAuthDir(env), OPENAI_CODEX_PENDING_FILE);
}

function readMainOpenAICodexProfile(): { profileId: string; credential: OAuthCredential } | null {
  const store = ensureAuthProfileStore(resolveOpenClawAgentDir());
  for (const [profileId, credential] of Object.entries(store.profiles)) {
    if (credential?.type === "oauth" && credential.provider === "openai-codex") {
      return { profileId, credential };
    }
  }
  return null;
}

function resolveAccountLabel(profileId: string, credential: OAuthCredential): string | null {
  const [, suffix] = profileId.split(":", 2);
  if (suffix && suffix !== "default") {
    return suffix;
  }
  if (typeof credential.accountId === "string" && credential.accountId.trim()) {
    return credential.accountId.trim();
  }
  return null;
}

export function canManageOpenAICodex(client: { connect?: { scopes?: string[] } } | null): boolean {
  const scopes = Array.isArray(client?.connect?.scopes) ? client.connect.scopes : [];
  return scopes.includes(MCTL_OWNER_SCOPE);
}

export function resolveTrustedProxyTeamRole(
  client: { connect?: { scopes?: string[] } } | null,
): string | null {
  const scopes = Array.isArray(client?.connect?.scopes) ? client.connect.scopes : [];
  const roleScope = scopes.find((scope) => scope.startsWith("mctl.role:"));
  const role = roleScope?.slice("mctl.role:".length).trim();
  return role || null;
}

export async function readOpenAICodexPendingConnect(
  env: NodeJS.ProcessEnv = process.env,
): Promise<OpenAICodexPendingRecord | null> {
  const { value, exists } = await readJsonFileWithFallback<OpenAICodexPendingRecord | null>(
    resolveOpenAICodexPendingPath(env),
    null,
  );
  if (!exists || !value || typeof value !== "object") {
    return null;
  }
  return value;
}

export async function writeOpenAICodexPendingConnect(
  record: OpenAICodexPendingRecord,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await writeJsonFileAtomically(resolveOpenAICodexPendingPath(env), record);
}

export async function deleteOpenAICodexPendingConnect(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await fs.promises.rm(resolveOpenAICodexPendingPath(env), { force: true });
}

export async function disconnectOpenAICodex(): Promise<void> {
  const agentDir = resolveOpenClawAgentDir();
  const store = ensureAuthProfileStore(agentDir);
  let dirty = false;
  for (const [profileId, credential] of Object.entries(store.profiles)) {
    if (credential?.provider === "openai-codex") {
      delete store.profiles[profileId];
      dirty = true;
    }
  }
  if (dirty) {
    const nextOrder = Array.isArray(store.order?.["openai-codex"])
      ? store.order["openai-codex"].filter((profileId) => profileId in store.profiles)
      : [];
    store.order = { ...store.order, "openai-codex": nextOrder };
    saveAuthProfileStore(store, agentDir);
  }
}

export function buildOpenAICodexConnectStatus(params: {
  pending: OpenAICodexPendingRecord | null;
  client: { connect?: { scopes?: string[] } } | null;
  now?: number;
}): OpenAICodexConnectStatus {
  const profile = readMainOpenAICodexProfile();
  const now = params.now ?? Date.now();
  const expiresAtMs = profile?.credential.expires ?? null;
  const expired =
    typeof expiresAtMs === "number" && Number.isFinite(expiresAtMs) && expiresAtMs <= now;
  const expiresAt =
    typeof expiresAtMs === "number" && Number.isFinite(expiresAtMs)
      ? new Date(expiresAtMs).toISOString()
      : null;
  const teamRole = resolveTrustedProxyTeamRole(params.client);
  if (params.pending) {
    return {
      state: "pending",
      connected: false,
      pending: true,
      accountLabel: profile ? resolveAccountLabel(profile.profileId, profile.credential) : null,
      expiresAt,
      updatedAt: expiresAt,
      startedAt: params.pending.startedAt,
      requestedBy: params.pending.requestedBy,
      canManage: canManageOpenAICodex(params.client),
      teamRole,
    };
  }
  if (profile) {
    return {
      state: expired ? "expired" : "connected",
      connected: !expired,
      pending: false,
      accountLabel: resolveAccountLabel(profile.profileId, profile.credential),
      expiresAt,
      updatedAt: expiresAt,
      startedAt: null,
      requestedBy: null,
      canManage: canManageOpenAICodex(params.client),
      teamRole,
    };
  }
  return {
    state: "disconnected",
    connected: false,
    pending: false,
    accountLabel: null,
    expiresAt: null,
    updatedAt: null,
    startedAt: null,
    requestedBy: null,
    canManage: canManageOpenAICodex(params.client),
    teamRole,
  };
}
