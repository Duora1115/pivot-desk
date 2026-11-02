import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { authPopupRequestHeaders } from "./auth-popup-request.mjs";

describe("authPopupRequestHeaders", () => {
  it("replaces an internal Host with the forwarded public host", () => {
    const headers = authPopupRequestHeaders({
      host: "127.0.0.1:8080",
      "x-forwarded-host": "preview.grok-sandbox.com",
      "x-test": ["one", "two"],
    }, "preview.grok-sandbox.com");
    assert.equal(headers.get("host"), "preview.grok-sandbox.com");
    assert.equal(headers.get("x-forwarded-host"), "preview.grok-sandbox.com");
    assert.equal(headers.get("x-test"), "one, two");
  });
});
