import {
  exchangeOpenAICodexAuthorizationCode,
  startOpenAICodexAuthorizationFlow,
} from "../../openai-codex/connect-flow.js";
import {
  buildOpenAICodexConnectStatus,
  canManageOpenAICodex,
  deleteOpenAICodexPendingConnect,
  disconnectOpenAICodex,
  readOpenAICodexPendingConnect,
  writeOpenAICodexPendingConnect,
} from "../../openai-codex/connect-store.js";
import { writeOAuthCredentials } from "../../plugins/provider-auth-helpers.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function readRedirectUri(params: Record<string, unknown>): string | null {
  const redirectUri = typeof params.redirectUri === "string" ? params.redirectUri.trim() : "";
  if (!redirectUri) {
    return null;
  }
  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function requireOwnerScope(client: { connect?: { scopes?: string[] } } | null) {
  if (!canManageOpenAICodex(client)) {
    return errorShape(ErrorCodes.UNAUTHORIZED, "OpenAI Codex connect requires tenant owner access");
  }
  return null;
}

export const codexHandlers: GatewayRequestHandlers = {
  "codex.connect.status": async ({ client, respond }) => {
    const pending = await readOpenAICodexPendingConnect();
    respond(true, buildOpenAICodexConnectStatus({ pending, client }), undefined);
  },
  "codex.connect.start": async ({ params, client, respond }) => {
    const unauthorized = requireOwnerScope(client);
    if (unauthorized) {
      respond(false, undefined, unauthorized);
      return;
    }
    const redirectUri = readRedirectUri(params);
    if (!redirectUri) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "redirectUri must be a valid http(s) URL"),
      );
      return;
    }
    const flow = await startOpenAICodexAuthorizationFlow({ redirectUri });
    await writeOpenAICodexPendingConnect({
      version: 1,
      redirectUri,
      state: flow.state,
      codeVerifier: flow.codeVerifier,
      startedAt: new Date().toISOString(),
      requestedBy:
        typeof client?.connect?.client?.displayName === "string"
          ? client.connect.client.displayName
          : null,
    });
    respond(true, { authorizeUrl: flow.authorizeUrl, state: flow.state }, undefined);
  },
  "codex.connect.complete": async ({ params, client, respond }) => {
    const unauthorized = requireOwnerScope(client);
    if (unauthorized) {
      respond(false, undefined, unauthorized);
      return;
    }
    const code = typeof params.code === "string" ? params.code.trim() : "";
    const state = typeof params.state === "string" ? params.state.trim() : "";
    if (!code || !state) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "code and state are required"),
      );
      return;
    }
    const pending = await readOpenAICodexPendingConnect();
    if (!pending || pending.state !== state) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "missing or mismatched pending OpenAI Codex state"),
      );
      return;
    }
    const credentials = await exchangeOpenAICodexAuthorizationCode({
      code,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri,
    });
    await writeOAuthCredentials("openai-codex", credentials);
    await deleteOpenAICodexPendingConnect();
    respond(true, buildOpenAICodexConnectStatus({ pending: null, client }), undefined);
  },
  "codex.connect.disconnect": async ({ client, respond }) => {
    const unauthorized = requireOwnerScope(client);
    if (unauthorized) {
      respond(false, undefined, unauthorized);
      return;
    }
    await Promise.all([disconnectOpenAICodex(), deleteOpenAICodexPendingConnect()]);
    respond(true, buildOpenAICodexConnectStatus({ pending: null, client }), undefined);
  },
};
