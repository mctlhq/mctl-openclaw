import crypto from "node:crypto";

export const DEFAULT_LOCALHOST_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const DEFAULT_SCOPE = "openid profile email offline_access";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
const DEFAULT_LOCAL_CALLBACK_URL = "http://localhost:1455/auth/callback";

export type OpenAICodexConnectCompletionMode = "manual_input" | "browser_callback";

function createState(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function toBase64Url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifier = toBase64Url(crypto.randomBytes(32));
  const challenge = toBase64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }
    return JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function extractAccountId(accessToken: string): string | null {
  const payload = decodeJwtPayload(accessToken);
  const auth = payload?.[JWT_CLAIM_PATH];
  if (!auth || typeof auth !== "object") {
    return null;
  }
  const accountId = (auth as { chatgpt_account_id?: unknown }).chatgpt_account_id;
  return typeof accountId === "string" && accountId.trim() ? accountId.trim() : null;
}

export type OpenAICodexPendingConnect = {
  authorizeUrl: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  completionMode: OpenAICodexConnectCompletionMode;
};

export type OpenAICodexOAuthCredentials = {
  access: string;
  refresh: string;
  expires: number;
  accountId: string;
};

function resolveConfiguredPortalCallbackUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.OPENCLAW_OPENAI_CODEX_PORTAL_CALLBACK_URL?.trim();
  if (!value) {
    return null;
  }
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("OPENCLAW_OPENAI_CODEX_PORTAL_CALLBACK_URL must be a valid http(s) URL");
  }
  return parsed.toString();
}

function resolveConfiguredPortalClientId(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.OPENCLAW_OPENAI_CODEX_CLIENT_ID?.trim();
  return value ? value : null;
}

export function resolveOpenAICodexClientIdForRedirectUri(params: {
  redirectUri: string;
  env?: NodeJS.ProcessEnv;
}): string {
  void params.redirectUri;
  const env = params.env ?? process.env;
  const portalClientId = resolveConfiguredPortalClientId(env);
  if (portalClientId) {
    return portalClientId;
  }
  return DEFAULT_LOCALHOST_CLIENT_ID;
}

function encodeBrowserCallbackState(params: { nonce: string; returnTo: string }): string {
  return Buffer.from(
    JSON.stringify({
      nonce: params.nonce,
      returnTo: params.returnTo,
    }),
    "utf8",
  ).toString("base64url");
}

function resolveAuthorizationTarget(params: { browserReturnTo: string; env?: NodeJS.ProcessEnv }): {
  redirectUri: string;
  clientId: string;
  completionMode: OpenAICodexConnectCompletionMode;
  state: string;
} {
  const env = params.env ?? process.env;
  const portalCallbackUrl = resolveConfiguredPortalCallbackUrl(env);
  const portalClientId = resolveConfiguredPortalClientId(env);
  if (portalCallbackUrl && portalClientId) {
    return {
      redirectUri: portalCallbackUrl,
      clientId: portalClientId,
      completionMode: "browser_callback",
      state: encodeBrowserCallbackState({
        nonce: createState(),
        returnTo: params.browserReturnTo,
      }),
    };
  }
  return {
    redirectUri: DEFAULT_LOCAL_CALLBACK_URL,
    clientId: DEFAULT_LOCALHOST_CLIENT_ID,
    completionMode: "manual_input",
    state: createState(),
  };
}

export async function startOpenAICodexAuthorizationFlow(params: {
  browserReturnTo: string;
  originator?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<OpenAICodexPendingConnect> {
  const { verifier, challenge } = await generatePKCE();
  const target = resolveAuthorizationTarget({
    browserReturnTo: params.browserReturnTo,
    env: params.env,
  });
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", target.clientId);
  url.searchParams.set("redirect_uri", target.redirectUri);
  url.searchParams.set("scope", DEFAULT_SCOPE);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", target.state);
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("originator", params.originator?.trim() || "openclaw");
  return {
    authorizeUrl: url.toString(),
    state: target.state,
    codeVerifier: verifier,
    redirectUri: target.redirectUri,
    clientId: target.clientId,
    completionMode: target.completionMode,
  };
}

export async function exchangeOpenAICodexAuthorizationCode(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
}): Promise<OpenAICodexOAuthCredentials> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: params.clientId,
      code: params.code,
      code_verifier: params.codeVerifier,
      redirect_uri: params.redirectUri,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `OpenAI token exchange failed (${response.status})`);
  }
  const json = (await response.json()) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  };
  const access = typeof json.access_token === "string" ? json.access_token.trim() : "";
  const refresh = typeof json.refresh_token === "string" ? json.refresh_token.trim() : "";
  const expiresIn =
    typeof json.expires_in === "number" && Number.isFinite(json.expires_in) ? json.expires_in : 0;
  if (!access || !refresh || expiresIn <= 0) {
    throw new Error("OpenAI token response missing required fields");
  }
  const accountId = extractAccountId(access);
  if (!accountId) {
    throw new Error("Failed to extract OpenAI Codex account id");
  }
  return {
    access,
    refresh,
    expires: Date.now() + expiresIn * 1000,
    accountId,
  };
}
