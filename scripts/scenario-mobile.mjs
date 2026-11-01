#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "/workspace/screenshots/scenario";
mkdirSync(OUT, { recursive: true });
const results = [];
const rec = (id, ok, actual, expect) => {
  results.push({ id, ok, actual, expect });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${actual}`);
};

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "zh-CN" });
  await context.addInitScript(() => localStorage.removeItem("pivot-desk-v2"));
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded" });
  await page.locator("[data-decision]").locator("visible=true").first().waitFor();
  await page.waitForTimeout(1000);
  await page.getByLabel("逻辑支点").fill("买");
  await page.getByRole("button", { name: /写进拦截簿/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^军规/ }).first().click();
  await page.getByRole("heading", { name: "华泰美股禁止过夜" }).locator("xpath=ancestor::li[1]").getByRole("switch").click();
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("pivot-desk-v2")));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-decision]").locator("visible=true").first().waitFor();
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("pivot-desk-v2")));
  rec(
    "reload-keeps-ledger-and-toggle",
    after.ledger.length === 1 && after.ledger[0].status === "blocked" && after.settings.rules["ht-overnight"] === false && before.ledger.length === 1,
    `ledger ${before.ledger.length}->${after.ledger.length} ht-overnight=${after.settings.rules["ht-overnight"]} positions=${after.positions.length}`,
    "blocked row and a switched-off 军规 survive reload",
  );
  rec("desktop-console-2", errors.length === 0, errors.join(" || ") || "clean", "clean console");
  await context.close();

  const mc = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
  await mc.addInitScript(() => localStorage.removeItem("pivot-desk-v2"));
  const mp = await mc.newPage();
  const merr = [];
  mp.on("console", (m) => { if (m.type() === "error") merr.push(m.text()); });
  mp.on("pageerror", (e) => merr.push(String(e)));
  await mp.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded" });
  await mp.locator("[data-decision]").first().waitFor();
  await mp.waitForTimeout(1000);
  const word = (await mp.locator("[data-decision]").first().innerText()).replace(/\s+/g, " ");
  const ov = await mp.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  const dock = await mp.locator("nav").last().boundingBox();
  const stamp = mp.getByRole("button", { name: /记下信封/ });
  const stampBox = await stamp.boundingBox();
  rec(
    "mobile-landing",
    word.includes("放行") && word.includes("支点崩了") && !ov.overflow && dock && stampBox && stampBox.y + stampBox.height <= 844,
    `${word} overflow=${ov.overflow} ${ov.sw}/${ov.cw} stampY=${stampBox && Math.round(stampBox.y)} dockY=${dock && Math.round(dock.y)}`,
    "mobile shows 放行, no horizontal overflow, stamp sits above the dock",
  );
  await mp.screenshot({ path: `${OUT}/08-mobile-pass.png` });
  await mp.getByLabel("逻辑支点").fill("随便");
  await mp.waitForTimeout(200);
  const t2 = (await mp.locator("[data-decision]").first().innerText()).replace(/\s+/g, " ");
  rec("mobile-two-char-blocks", t2.includes("拦截") && t2.includes("还没有逻辑支点"), t2, "two characters block");
  await mp.getByLabel("逻辑支点").fill("随便写写");
  await mp.waitForTimeout(200);
  const t3 = (await mp.locator("[data-decision]").first().innerText()).replace(/\s+/g, " ");
  rec("mobile-placeholder-drift", t3.includes("拦截") && /换了|理由/.test(t3), t3, "four-character replacement is still a block");
  await mp.screenshot({ path: `${OUT}/09-mobile-placeholder.png` });
  await mp.locator("summary", { hasText: "券商、期限、标签" }).click();
  await mp.waitForTimeout(300);
  const ov2 = await mp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  await mp.screenshot({ path: `${OUT}/10-mobile-details.png` });
  rec("mobile-details-overflow", ov2 === false, `overflow=${ov2}`, "expanded details stay inside 390px");
  await mp.getByRole("button", { name: "持仓" }).click();
  await mp.waitForTimeout(300);
  const ov3 = await mp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  await mp.screenshot({ path: `${OUT}/11-mobile-book.png` });
  rec("mobile-book", ov3 === false, `overflow=${ov3}`, "book has no horizontal overflow");
  rec("mobile-console", merr.length === 0, merr.join(" || ") || "clean", "clean console");
  await mc.close();
} catch (err) {
  rec("crash", false, String(err.message || err).split("\n")[0], "finish");
  console.error(err);
  process.exitCode = 1;
} finally {
  writeFileSync(`${OUT}/mobile.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
