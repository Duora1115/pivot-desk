#!/usr/bin/env node
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(() => {
  if (sessionStorage.getItem("keep-desk") !== "1") localStorage.removeItem("pivot-desk-v2");
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded" });
await page.locator("h2[data-decision]").waitFor();
await page.waitForTimeout(800);
await page.getByLabel("逻辑支点").fill("买");
await page.waitForTimeout(200);
await page.getByRole("button", { name: /写进拦截簿/ }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /^军规/ }).click();
await page.getByRole("heading", { name: "华泰美股禁止过夜" }).locator("xpath=ancestor::li[1]").getByRole("switch").click();
await page.waitForTimeout(300);
await page.evaluate(() => sessionStorage.setItem("keep-desk", "1"));
const before = await page.evaluate(() => JSON.parse(localStorage.getItem("pivot-desk-v2")));
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator("h2[data-decision]").waitFor();
await page.waitForTimeout(800);
const after = await page.evaluate(() => JSON.parse(localStorage.getItem("pivot-desk-v2")));
const word = await page.locator("h2[data-decision]").innerText();
console.log(JSON.stringify({
  errors,
  beforeLedger: before.ledger.length,
  afterLedger: after.ledger.length,
  status: after.ledger[0]?.status,
  stamp: after.ledger[0]?.stamp,
  ht: after.settings.rules["ht-overnight"],
  note: after.draft.pivotNote,
  word,
  positions: after.positions.length,
}, null, 2));
await browser.close();
