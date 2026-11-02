/**
 * Target checks shared by the Playwright capture scripts.
 *
 * Both run Chromium with `--no-sandbox` as root and take their URL and output
 * path from argv, so unchecked they will render `file:///root/.grok/auth.json`
 * into a PNG the agent can read, and write it anywhere.
 */
import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** http/https loopback only, else exit 1. `BROWSER_ALLOW_EXTERNAL_HOST=1` opts out. */
export function checkedUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail(`not a valid URL: ${url}`);
  }
  // Rules out file:, data:, chrome:, view-source:.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail(`only http/https URLs are allowed, got ${parsed.protocol} in ${url}`);
  }
  if (!LOOPBACK_HOSTNAMES.has(parsed.hostname) && process.env.BROWSER_ALLOW_EXTERNAL_HOST !== "1") {
    fail(
      `${parsed.hostname} is not a loopback host; these scripts screenshot the ` +
        `local dev server. Set BROWSER_ALLOW_EXTERNAL_HOST=1 to override.`,
    );
  }
  return url;
}

/** Absolute canonical `target` if it is strictly inside `allowedDirs`, else exit 1. */
export function checkedOutputPath(target, allowedDirs, label = "screenshot") {
  try {
    const abs = canonicalPath(target);
    const allowed = allowedDirs.map((dir) => canonicalPath(dir)).some((root) => {
      const rest = relative(root, abs);
      return rest !== "" && rest !== ".." && !rest.startsWith(`..${sep}`) && !isAbsolute(rest);
    });
    if (!allowed) {
      fail(`${label} path must be under ${allowedDirs.join(" or ")}, got ${abs}`);
    }
    return abs;
  } catch {
    fail(`${label} path could not be resolved safely: ${target}`);
  }
}

function canonicalPath(target) {
  const abs = resolve(target);
  const missing = [];
  let ancestor = abs;
  while (!pathEntryExists(ancestor)) {
    missing.unshift(basename(ancestor));
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  return join(realpathSync(ancestor), ...missing);
}

function pathEntryExists(target) {
  try {
    lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
}
