import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveParentEmbedderOrigin } from "./preview-embedder-origin.ts";

describe("resolveParentEmbedderOrigin", () => {
  it("rejects an arbitrary parent of a sandbox preview", () => {
    assert.equal(
      resolveParentEmbedderOrigin(false, "https://attacker.example/embed", null, "app.grok-sandbox.com"),
      null,
    );
  });

  it("accepts a Grok parent of a sandbox preview", () => {
    assert.equal(
      resolveParentEmbedderOrigin(false, "https://grok.com/embed", null, "app.grok-sandbox.com"),
      "https://grok.com",
    );
  });

  it("accepts only the matching Remint preview parent", () => {
    assert.equal(
      resolveParentEmbedderOrigin(false, "https://example.com/embed", null, "abc.preview.example.com"),
      "https://example.com",
    );
    assert.equal(
      resolveParentEmbedderOrigin(false, "https://attacker.example/embed", null, "abc.preview.example.com"),
      null,
    );
  });
});
