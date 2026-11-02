import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPopupMessageFor } from "./popup-message.ts";

describe("isPopupMessageFor", () => {
  const popup = { name: "expected" } as Window;
  const other = { name: "other" } as Window;
  const data = { source: "grok-auth-popup", token: "token" };

  it("accepts a same-origin message from the initiating popup", () => {
    assert.equal(isPopupMessageFor({ origin: "https://app.example", source: popup, data }, "https://app.example", popup), true);
  });

  it("rejects a same-origin message from another window", () => {
    assert.equal(isPopupMessageFor({ origin: "https://app.example", source: other, data }, "https://app.example", popup), false);
  });

  it("rejects another origin and malformed payloads", () => {
    assert.equal(isPopupMessageFor({ origin: "https://evil.example", source: popup, data }, "https://app.example", popup), false);
    assert.equal(isPopupMessageFor({ origin: "https://app.example", source: popup, data: null }, "https://app.example", popup), false);
    assert.equal(isPopupMessageFor({ origin: "https://app.example", source: popup, data: { source: "other", token: "token" } }, "https://app.example", popup), false);
  });
});
