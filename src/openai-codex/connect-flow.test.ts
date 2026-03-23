import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALHOST_CLIENT_ID, startOpenAICodexAuthorizationFlow } from "./connect-flow.js";

describe("openai-codex connect flow", () => {
  it("falls back to localhost manual completion when no portal client id is configured", async () => {
    const flow = await startOpenAICodexAuthorizationFlow({
      browserReturnTo: "https://labs-openclaw.mctl.ai/overview?codex_oauth=1",
      env: {},
    });

    expect(flow.completionMode).toBe("manual_input");
    expect(flow.redirectUri).toBe("http://localhost:1455/auth/callback");
    expect(flow.clientId).toBe(DEFAULT_LOCALHOST_CLIENT_ID);
    expect(flow.state).not.toContain("labs-openclaw");
  });

  it("uses the control-plane callback when a dedicated client id is configured", async () => {
    const returnTo = "https://labs-openclaw.mctl.ai/overview?codex_oauth=1";
    const flow = await startOpenAICodexAuthorizationFlow({
      browserReturnTo: returnTo,
      env: {
        OPENCLAW_OPENAI_CODEX_CLIENT_ID: "app_test_browser_only",
        OPENCLAW_OPENAI_CODEX_PORTAL_CALLBACK_URL:
          "https://app.mctl.ai/api/oidc-provider/openai-codex/callback",
      },
    });

    expect(flow.completionMode).toBe("browser_callback");
    expect(flow.redirectUri).toBe("https://app.mctl.ai/api/oidc-provider/openai-codex/callback");
    expect(flow.clientId).toBe("app_test_browser_only");

    const encoded = JSON.parse(Buffer.from(flow.state, "base64url").toString("utf8")) as {
      nonce?: unknown;
      returnTo?: unknown;
    };
    expect(encoded.returnTo).toBe(returnTo);
    expect(typeof encoded.nonce).toBe("string");
  });
});
