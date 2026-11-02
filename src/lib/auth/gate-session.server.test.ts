import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emitSessionCookie, handleGateIdentitySession } from "./gate-session.server.ts";

function harness(overrides: Record<string, unknown> = {}) {
  const inbound = new Headers({
    cookie: "session_token=old; session_data=cached; other=keep",
    "x-grok-identity": "present",
  });
  const expired: string[] = [];
  const deleted: string[] = [];
  const deps = {
    gateIdentityEnabled: () => true,
    gateIdentityFromHeaders: async () => ({ sub: "user-b" }),
    getSessionFromCtx: async () => null,
    handleOAuthUserInfo: async () => ({
      data: { session: { token: "new-token" }, user: { id: "user-b" } },
    }),
    setSessionCookie: async () => {},
    emitSessionCookie: async () => "new-value",
    expireCookie: async (_ctx: unknown, cookie: { name: string }) => { expired.push(cookie.name); },
    writeMarker: async () => {},
    ...overrides,
  };
  const ctx = {
    request: { headers: inbound },
    context: {
      authCookies: {
        sessionToken: { name: "session_token", attributes: { path: "/", secure: true } },
        sessionData: { name: "session_data", attributes: { path: "/", secure: true } },
      },
      internalAdapter: {
        findAccounts: async () => [],
        deleteSession: async (token: string) => { deleted.push(token); },
      },
    },
  };
  return { ctx, deps, expired, deleted, inbound };
}

function requestHeaders(result: unknown): Headers {
  return (result as { context: { headers: Headers } }).context.headers;
}

describe("emitSessionCookie", () => {
  it("fails when neither response-cookie channel accepts the session", async () => {
    const ctx = {
      context: {
        authCookies: { sessionToken: { attributes: { path: "/", secure: true } } },
        sessionConfig: { expiresIn: 300 },
        secret: "secret",
        responseHeaders: undefined,
      },
      setSignedCookie: async (name: string) => `${name}=signed-value; Path=/; HttpOnly`,
    };
    const value = await emitSessionCookie(ctx as never, "session_token", "token", () => {
      throw new Error("no response store");
    });
    assert.equal(value, null);
  });
});

describe("handleGateIdentitySession failure closing", () => {
  it("removes and expires the previous session when identity verification fails", async () => {
    const h = harness({ gateIdentityFromHeaders: async () => null });
    const result = await handleGateIdentitySession(h.ctx as never, h.deps as never);
    assert.equal(requestHeaders(result).get("cookie"), "other=keep");
    assert.deepEqual(h.expired, ["session_token", "session_data"]);
  });

  it("fails closed when the existing user's accounts cannot be loaded", async () => {
    const h = harness({
      getSessionFromCtx: async () => ({ session: { token: "old" }, user: { id: "user-a" } }),
    });
    h.ctx.context.internalAdapter.findAccounts = async () => { throw new Error("database down"); };
    const result = await handleGateIdentitySession(h.ctx as never, h.deps as never);
    assert.equal(requestHeaders(result).get("cookie"), "other=keep");
    assert.deepEqual(h.expired, ["session_token", "session_data"]);
  });

  it("fails closed when OAuth identity materialization fails", async () => {
    const h = harness({ handleOAuthUserInfo: async () => ({ error: new Error("oauth"), data: null }) });
    const result = await handleGateIdentitySession(h.ctx as never, h.deps as never);
    assert.equal(requestHeaders(result).get("cookie"), "other=keep");
    assert.deepEqual(h.expired, ["session_token", "session_data"]);
  });

  it("removes the old session and cleans up a new session whose cookie cannot be emitted", async () => {
    const h = harness({ emitSessionCookie: async () => null });
    const result = await handleGateIdentitySession(h.ctx as never, h.deps as never);
    assert.equal(requestHeaders(result).get("cookie"), "other=keep");
    assert.deepEqual(h.deleted, ["new-token"]);
    assert.deepEqual(h.expired, ["session_token", "session_data"]);
  });

  it("preserves intentional non-gate and bearer sessions", async () => {
    const noGate = harness();
    noGate.inbound.delete("x-grok-identity");
    assert.equal(await handleGateIdentitySession(noGate.ctx as never, noGate.deps as never), undefined);
    assert.equal(noGate.inbound.get("cookie"), "session_token=old; session_data=cached; other=keep");
    assert.deepEqual(noGate.expired, []);

    const bearer = harness();
    bearer.inbound.set("authorization", "Bearer token");
    assert.equal(await handleGateIdentitySession(bearer.ctx as never, bearer.deps as never), undefined);
    assert.equal(bearer.inbound.get("cookie"), "session_token=old; session_data=cached; other=keep");
    assert.deepEqual(bearer.expired, []);
  });
});
