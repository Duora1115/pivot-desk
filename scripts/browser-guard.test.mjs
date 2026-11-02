import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { checkedOutputPath } from "./browser-guard.mjs";

const guardUrl = pathToFileURL(join(process.cwd(), "scripts/browser-guard.mjs")).href;

function rejectionFor(target, allowed) {
  return spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    `import { checkedOutputPath } from ${JSON.stringify(guardUrl)}; checkedOutputPath(${JSON.stringify(target)}, ${JSON.stringify(allowed)});`,
  ], { encoding: "utf8" });
}

describe("checkedOutputPath", () => {
  it("allows a new nested output under a canonical allowed root", () => {
    const root = mkdtempSync(join(tmpdir(), "browser-guard-"));
    const canonical = realpathSync(root);
    const target = join(root, "new", "nested", "shot.png");
    assert.equal(checkedOutputPath(target, [root]), join(canonical, "new", "nested", "shot.png"));
  });

  it("allows an allowed root that will be created later", () => {
    const root = mkdtempSync(join(tmpdir(), "browser-guard-"));
    const allowed = join(root, "allowed");
    const result = rejectionFor(join(allowed, "nested", "shot.png"), [allowed]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  it("rejects an output-file symlink that escapes the allowed root", () => {
    const root = mkdtempSync(join(tmpdir(), "browser-guard-"));
    const outside = mkdtempSync(join(tmpdir(), "browser-guard-outside-"));
    const secret = join(outside, "secret.json");
    writeFileSync(secret, "keep");
    const output = join(root, "shot.json");
    symlinkSync(secret, output);
    const result = rejectionFor(output, [root]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
  });

  it("rejects an allowed-directory symlink that escapes the allowed root", () => {
    const root = mkdtempSync(join(tmpdir(), "browser-guard-"));
    const outside = mkdtempSync(join(tmpdir(), "browser-guard-outside-"));
    mkdirSync(join(outside, "nested"));
    symlinkSync(join(outside, "nested"), join(root, "linked"));
    const result = rejectionFor(join(root, "linked", "shot.png"), [root]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
  });
});
