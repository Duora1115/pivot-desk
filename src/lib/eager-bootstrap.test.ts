import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { observeEagerBootstrap } from "./eager-bootstrap.ts";

describe("observeEagerBootstrap", () => {
  it("contains an eager rejection without changing the original caller rejection", async () => {
    const error = new Error("bootstrap failed");
    const original = Promise.reject(error);
    const observed = observeEagerBootstrap(original, () => {});
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      await observed;
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(unhandled, []);
      await assert.rejects(original, error);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
