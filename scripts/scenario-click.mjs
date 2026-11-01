#!/usr/bin/env node
/**
 * One-shot click scenarios against the live preview.
 * Writes /workspace/screenshots/scenario/report.json and PNGs.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const URL = process.env.SCENARIO_URL || "http://127.0.0.1:8080/";
const OUT = "/workspace/screenshots/scenario";
mkdirSync(OUT, { recursive: true });

const results = [];

function rec(id, ok, actual, expect, extra = {}) {
  results.push({ id, ok, actual, expect, ...extra });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${id}  ${actual}`);
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

async function overflow(page) {
  return page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
}

async function store(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("pivot-desk-v2") || "null"));
}

async function decisionText(page) {
  const node = page.locator("[data-decision]").first();
  const word = (await node.innerText()).trim();
  const decision = await node.getAttribute("data-decision");
  const title = (await page.locator("[data-decision]").first().locator("xpath=following-sibling::p[1]").innerText().catch(() => "")).trim();
  const asideTitle = await page.locator("aside h2 + p").first().innerText().catch(() => "");
  return { word, decision, title: (asideTitle || title).replace(/\s+/g, " ").trim() };
}

async function stamp(page) {
  const btn = page.getByRole("button", { name: /记下信封|写进拦截簿|通道未挂起|补完复盘/ }).first();
  const label = (await btn.innerText()).replace(/\s+/g, " ").trim();
  const disabled = await btn.isDisabled();
  return { btn, label, disabled };
}

async function pick(page, label) {
  await page.locator("select[aria-label='样本']").selectOption({ label });
  await page.waitForTimeout(200);
}

async function go(page, name) {
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  await page.waitForTimeout(250);
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

async function boot(width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: "zh-CN",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addInitScript(() => localStorage.removeItem("pivot-desk-v2"));
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.getByText("支点交易").first().waitFor();
  await page.waitForTimeout(500);
  return { page, context, errors };
}

try {
  const { page, context, errors } = await boot(1280, 800);

  // S1 landing = preset 支点崩了
  {
    const d = await decisionText(page);
    const logic = await page.getByLabel("逻辑支点").inputValue();
    const sample = await page.locator("select[aria-label='样本']").inputValue();
    const st = await stamp(page);
    const ov = await overflow(page);
    rec(
      "desktop-landing-pivot-gone",
      d.decision === "pass" && logic.includes("跌破就走") && sample === "pivot-gone" && st.label.includes("记下信封") && st.label.includes("涨乐") && !ov.overflow,
      `${d.decision} ${d.word} / ${d.title} / btn=${st.label} / overflow=${ov.overflow}`,
      "pass 放行, title 支点崩了，退出, button 记下信封·涨乐, no overflow",
    );
    await shot(page, "01-desktop-pass");
  }

  // S2 short reason blocks before any book write
  {
    await page.getByLabel("逻辑支点").fill("买");
    await page.waitForTimeout(150);
    const d = await decisionText(page);
    const st = await stamp(page);
    const before = await store(page);
    await st.btn.click();
    await page.waitForTimeout(500);
    const after = await store(page);
    const avgo = after.positions.find((p) => p.symbol === "AVGO");
    rec(
      "short-reason-blocks",
      d.decision === "block" && d.title.includes("还没有逻辑支点") && st.label.includes("拦截") && after.ledger.length === before.ledger.length + 1 && after.ledger[0].status === "blocked" && after.ledger[0].decision === "block" && avgo?.qty === 20,
      `${d.decision} ${d.title} / ledger ${before.ledger.length}->${after.ledger.length} status=${after.ledger[0]?.status} avgo=${avgo?.qty}`,
      "block 还没有逻辑支点, ledger blocked, AVGO qty stays 20",
    );
  }

  // S3 still-holds sell
  {
    await pick(page, "还在却卖");
    const d = await decisionText(page);
    const st = await stamp(page);
    await st.btn.click();
    await page.waitForTimeout(400);
    const s = await store(page);
    const avgo = s.positions.find((p) => p.symbol === "AVGO");
    rec(
      "pivot-live-blocks-sell",
      d.decision === "block" && d.title.includes("支点还在") && s.ledger[0].status === "blocked" && avgo?.qty === 20,
      `${d.decision} ${d.title} / ${s.ledger[0].status} avgo=${avgo?.qty}`,
      "block 支点还在，先别走; position untouched",
    );
    await shot(page, "02-desktop-block-live");
  }

  // S4 drift
  {
    await pick(page, "换逻辑加仓");
    const d = await decisionText(page);
    rec(
      "pivot-drift-blocks-add",
      d.decision === "block" && d.title.includes("逻辑换了"),
      `${d.decision} ${d.title}`,
      "block 逻辑换了还在加",
    );
  }

  // S5 partial close
  {
    await pick(page, "支点崩了");
    await page.getByLabel("数量").fill("5");
    await page.waitForTimeout(150);
    const d = await decisionText(page);
    const before = (await store(page)).positions.find((p) => p.symbol === "AVGO")?.qty;
    const st = await stamp(page);
    await st.btn.click();
    await page.waitForTimeout(400);
    const after = (await store(page)).positions.find((p) => p.symbol === "AVGO")?.qty;
    rec(
      "partial-close-blocked",
      d.decision === "block" && d.title.includes("一次清掉") && before === 20 && after === 20,
      `${d.decision} ${d.title} qty ${before}->${after}`,
      "block 平仓必须一次清掉, qty unchanged",
    );
  }

  // S6 军规: 华泰隔夜 on living pivot
  {
    await pick(page, "华泰隔夜");
    const d = await decisionText(page);
    const s0 = await store(page);
    const st = await stamp(page);
    await st.btn.click();
    await page.waitForTimeout(400);
    const s1 = await store(page);
    const avgo = s1.positions.find((p) => p.symbol === "AVGO");
    rec(
      "junGui-ht-overnight",
      d.decision === "block" && /华泰|过夜/.test(d.title) && s1.ledger[0].status === "blocked" && avgo?.qty === s0.positions.find((p) => p.symbol === "AVGO")?.qty,
      `${d.decision} ${d.title}`,
      "block 华泰美股不准留过夜, book unchanged",
    );
  }

  // S7 revenge
  {
    await pick(page, "亏后放大");
    const d = await decisionText(page);
    rec(
      "junGui-revenge",
      d.decision === "block" && /亏|报复|放大/.test(d.title + (await page.locator("body").innerText())),
      `${d.decision} ${d.title}`,
      "block revenge sizing",
    );
  }

  // S8 Q5
  {
    await pick(page, "隔夜大名义");
    const d = await decisionText(page);
    rec(
      "junGui-q5",
      d.decision === "block" && /名义|隔夜/.test(d.title),
      `${d.decision} ${d.title}`,
      "block overnight notional cap",
    );
  }

  // S9 腾讯加仓 long hold
  {
    await pick(page, "腾讯加仓");
    const d = await decisionText(page);
    rec(
      "junGui-hk31",
      d.decision === "block" && /腾讯|31|港股/.test(d.title),
      `${d.decision} ${d.title}`,
      "block HK day-31 add",
    );
  }

  // S10 option day 5 is review, button disabled, ledger unchanged
  {
    await pick(page, "期权第五天");
    const d = await decisionText(page);
    const st = await stamp(page);
    const n0 = (await store(page)).ledger.length;
    await st.btn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
    const n1 = (await store(page)).ledger.length;
    rec(
      "option-d4-review-disabled",
      d.decision === "review" && st.disabled && st.label.includes("复盘") && n1 === n0,
      `${d.decision} ${d.title} disabled=${st.disabled} label=${st.label} ledger ${n0}->${n1}`,
      "review, stamp disabled, nothing written",
    );
    await page.getByLabel("退出条件").fill("权利金腰斩就平掉");
    await page.getByLabel("最大亏损").fill("2000");
    await page.waitForTimeout(200);
    const d2 = await decisionText(page);
    const st2 = await stamp(page);
    rec(
      "option-d4-filled-can-stamp",
      d2.decision === "pass" && !st2.disabled,
      `${d2.decision} ${d2.title} disabled=${st2.disabled} label=${st2.label}`,
      "after exit+loss filled, pass and button enabled",
    );
  }

  // S11 茅台 day 6 review
  {
    await pick(page, "茅台第六天");
    const d = await decisionText(page);
    const st = await stamp(page);
    rec(
      "a-day4-review",
      d.decision === "review" && st.disabled,
      `${d.decision} ${d.title} disabled=${st.disabled}`,
      "A-share day 4+ is review until note written",
    );
    await page.getByLabel("复盘").fill("错在惯性加仓，1480减");
    await page.waitForTimeout(200);
    const d2 = await decisionText(page);
    rec(
      "a-day4-note-releases",
      d2.decision === "pass",
      `${d2.decision} ${d2.title}`,
      "review note releases the stamp",
    );
  }

  // S12 阿里有计划: numbers filled, approval still off
  {
    await pick(page, "阿里有计划");
    const d = await decisionText(page);
    const approved = await page.getByRole("button", { name: /限额审批/ }).getAttribute("aria-pressed");
    rec(
      "baba-plan-without-approval",
      d.decision === "pass" && approved === "false",
      `${d.decision} ${d.title} approved=${approved}`,
      "record whether 1-3 day plan passes with 限额审批 still off",
    );
  }

  // S13 广发 T0 pass, confirm must NOT change ETF qty (execution layer)
  {
    await pick(page, "广发 T0");
    const d = await decisionText(page);
    const before = (await store(page)).positions.find((p) => p.symbol === "159915")?.qty;
    const st = await stamp(page);
    await st.btn.click();
    await page.waitForTimeout(900);
    const s = await store(page);
    const after = s.positions.find((p) => p.symbol === "159915")?.qty;
    const item = s.ledger[0];
    rec(
      "etf-t0-pass-no-book-change",
      d.decision === "pass" && before === after && item?.intent === "t0" && (item.status === "delivered" || item.status === "queued") && item.decision === "pass",
      `${d.decision} ${d.title} qty ${before}->${after} status=${item?.status} confirmed=${item?.confirmed}`,
      "pass, envelope delivered, overnight ETF qty unchanged",
    );
  }

  // S14 full close data flow: reset via channel, turn auto off, stamp, confirm, book
  {
    await go(page, "通道");
    await page.getByRole("button", { name: "恢复样本镜像" }).click();
    await page.waitForTimeout(200);
    const autoBtn = page.getByRole("switch", { name: "自动" });
    await autoBtn.click();
    await page.waitForTimeout(150);
    const manual = await page.getByRole("switch", { name: "手动" }).count();
    await go(page, "下单");
    await pick(page, "支点崩了");
    const d = await decisionText(page);
    const st = await stamp(page);
    const qty0 = (await store(page)).positions.find((p) => p.symbol === "AVGO")?.qty;
    await st.btn.click();
    await page.waitForTimeout(900);
    const mid = await store(page);
    const avgoMid = mid.positions.find((p) => p.symbol === "AVGO")?.qty;
    const item = mid.ledger[0];
    await go(page, "转发");
    await page.getByRole("button", { name: "AVGO", exact: false }).first().click();
    await page.waitForTimeout(200);
    const body = await page.locator("body").innerText();
    await page.getByRole("button", { name: "复制信封" }).click();
    await page.waitForTimeout(200);
    let clip = "";
    try {
      clip = await page.evaluate(() => navigator.clipboard.readText());
    } catch (e) {
      clip = `clipboard-error ${e}`;
    }
    const copied = await page.getByRole("button", { name: "已复制" }).count();
    await page.getByRole("button", { name: "我已在券商确认" }).click();
    await page.waitForTimeout(300);
    const end = await store(page);
    const avgoEnd = end.positions.find((p) => p.symbol === "AVGO");
    const close = end.closes.find((c) => c.symbol === "AVGO");
    rec(
      "close-flow-manual-confirm",
      d.decision === "pass" && manual === 1 && qty0 === 20 && avgoMid === 20 && item.status === "delivered" && item.confirmed === false && !avgoEnd && close && clip.includes("跌破就走") && clip.includes("涨乐") && copied === 1 && body.includes("已记下"),
      `decision=${d.decision} manual=${manual} qty ${qty0}->mid ${avgoMid}->end ${avgoEnd?.qty ?? "gone"} status=${item.status} confirmed=${item.confirmed} closePnl=${close?.pnlCny} clip=${clip.split("\n")[0]}`,
      "pass envelope delivered but book waits for 我已在券商确认; then AVGO removed and close recorded; clipboard has logic",
    );
    await shot(page, "03-desktop-outbox");
    await go(page, "持仓");
    const book = await page.locator("body").innerText();
    rec(
      "book-after-close",
      !book.includes("AVGO") && book.includes("逻辑支点") && book.includes("00700"),
      `has AVGO=${book.includes("AVGO")} has logic=${book.includes("逻辑支点")} header=${book.split("\n").slice(0, 8).join(" / ")}`,
      "AVGO gone from book, remaining rows show 逻辑支点",
    );
    await shot(page, "04-desktop-book");
  }

  // S15 平仓草案 from book pre-fills collapse
  {
    await go(page, "持仓");
    const card = page.locator("li", { hasText: "00700" });
    await card.getByRole("button", { name: "平仓草案" }).click();
    await page.waitForTimeout(300);
    const note = await page.getByLabel("逻辑支点").inputValue();
    const gonePressed = await page.getByRole("button", { name: "崩了" }).getAttribute("aria-pressed");
    const d = await decisionText(page);
    rec(
      "book-close-draft-prefills-collapse",
      note.includes("回到区间下沿") && gonePressed === "true",
      `note=${note} 崩了=${gonePressed} ${d.decision} ${d.title}`,
      "平仓草案 loads stored sentence and pre-selects 崩了",
    );
  }

  // S16 试加仓 keeps holds; 腾讯 long hold still blocked by 军规
  {
    await go(page, "持仓");
    const card = page.locator("li", { hasText: "AAPL" }).first();
    const sym = "AAPL";
    await page.locator("li", { hasText: sym }).getByRole("button", { name: "试加仓" }).click();
    await page.waitForTimeout(300);
    const holds = await page.getByRole("button", { name: "还在" }).getAttribute("aria-pressed");
    const d = await decisionText(page);
    const note = await page.getByLabel("逻辑支点").inputValue();
    rec(
      "book-add-draft",
      holds === "true" && note.includes("收盘前走"),
      `还在=${holds} note=${note} ${d.decision} ${d.title}`,
      "试加仓 loads the same sentence with 还在",
    );
  }

  // S17 富途当日 open-on-existing: what the stamp does to qty
  {
    await go(page, "通道");
    await page.getByRole("button", { name: "恢复样本镜像" }).click();
    await page.waitForTimeout(200);
    await go(page, "下单");
    await pick(page, "富途当日");
    const d = await decisionText(page);
    const before = (await store(page)).positions.find((p) => p.symbol === "AAPL");
    const st = await stamp(page);
    await st.btn.click();
    await page.waitForTimeout(900);
    const after = (await store(page)).positions.find((p) => p.symbol === "AAPL" && p.asset === "stock");
    rec(
      "aapl-open-on-existing",
      true,
      `${d.decision} ${d.title} btn=${st.label} qty ${before?.qty}->${after?.qty} price ${before?.price}->${after?.price} intent stays open`,
      "observe: open against an existing lot",
    );
  }

  // S18 session off parks envelope, book unchanged, requeue
  {
    await go(page, "通道");
    await page.getByRole("button", { name: "恢复样本镜像" }).click();
    await page.waitForTimeout(150);
    // 华泰 session switch: first broker card. Identify by nearby heading.
    const htCard = page.locator("section, div").filter({ has: page.getByRole("heading", { name: "华泰证券" }) }).first();
    // Panel may not be section. Use heading then button.
    const htHeading = page.getByRole("heading", { name: "华泰证券" });
    await htHeading.locator("xpath=following::button[@role='switch'][1]").click();
    await page.waitForTimeout(150);
    await go(page, "下单");
    await pick(page, "支点崩了");
    const st = await stamp(page);
    const qty0 = (await store(page)).positions.find((p) => p.symbol === "AVGO")?.qty;
    await st.btn.click();
    await page.waitForTimeout(400);
    const s = await store(page);
    rec(
      "session-off-parks",
      st.label.includes("未挂起") && s.ledger[0].status === "parked" && s.positions.find((p) => p.symbol === "AVGO")?.qty === qty0,
      `btn=${st.label} status=${s.ledger[0].status} qty=${s.positions.find((p) => p.symbol === "AVGO")?.qty}`,
      "channel not linked → parked, position unchanged",
    );
    await go(page, "转发");
    await page.getByRole("button", { name: "待挂", exact: true }).click();
    await page.getByRole("button", { name: /AVGO/ }).first().click();
    await page.getByRole("button", { name: "重新排队" }).click();
    await page.waitForTimeout(200);
    const flash = await page.locator("[role='status']").innerText().catch(() => "");
    const status = (await store(page)).ledger[0].status;
    rec(
      "requeue-without-session",
      status === "parked" && /挂/.test(flash),
      `status=${status} flash=${flash}`,
      "requeue while session off stays parked and says so",
    );
    await go(page, "通道");
    await page.getByRole("heading", { name: "华泰证券" }).locator("xpath=following::button[@role='switch'][1]").click();
    await page.waitForTimeout(150);
    await go(page, "转发");
    await page.getByRole("button", { name: /AVGO/ }).first().click();
    const idsBefore = (await store(page)).ledger.map((r) => r.id);
    await page.getByRole("button", { name: "重新排队" }).click();
    await page.waitForTimeout(900);
    const led = (await store(page)).ledger;
    rec(
      "requeue-same-id",
      led.length === idsBefore.length && led[0].id === idsBefore[0] && led[0].status === "delivered",
      `count ${idsBefore.length}->${led.length} id ${idsBefore[0]}->${led[0].id} status=${led[0].status}`,
      "requeue keeps the same id and reaches delivered",
    );
    await shot(page, "05-desktop-requeue");
  }

  // S19 toggle 华泰过夜 off, verdict changes; pivot still blocks 还在却卖
  {
    await go(page, "通道");
    await page.getByRole("button", { name: "恢复样本镜像" }).click();
    await page.waitForTimeout(150);
    await go(page, "军规");
    const sw = page.getByRole("heading", { name: "华泰美股禁止过夜" }).locator("xpath=ancestor::li[1]").getByRole("switch");
    const was = await sw.getAttribute("aria-checked");
    await sw.click();
    await page.waitForTimeout(150);
    const now = await sw.getAttribute("aria-checked");
    await go(page, "下单");
    await pick(page, "华泰隔夜");
    const d = await decisionText(page);
    await go(page, "军规");
    const pivotSwitch = await page.getByRole("heading", { name: /支点/ }).count();
    rec(
      "toggle-ht-changes-verdict",
      was === "true" && now === "false" && d.decision === "block",
      `switch ${was}->${now} verdict ${d.decision} ${d.title} pivotHeadings=${pivotSwitch}`,
      "turning off 华泰过夜 changes the stamp; another kill may still block",
    );
    await go(page, "下单");
    await pick(page, "还在却卖");
    const live = await decisionText(page);
    rec(
      "pivot-not-cleared-by-rule-toggle",
      live.decision === "block" && live.title.includes("支点还在"),
      `${live.decision} ${live.title}`,
      "支点 block survives a 军规 toggle",
    );
    await shot(page, "06-desktop-rules");
  }

  // S20 reload keeps ledger
  {
    const before = await store(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("支点交易").first().waitFor();
    await page.waitForTimeout(600);
    const after = await store(page);
    rec(
      "reload-persists",
      after && after.ledger.length === before.ledger.length && after.positions.length === before.positions.length && after.version === 2,
      `ledger ${before.ledger.length}->${after?.ledger?.length} positions ${before.positions.length}->${after?.positions?.length} ver ${after?.version}`,
      "localStorage version 2 survives reload and is not replaced by seed",
    );
  }

  // S21 channels honesty + rules page
  {
    await go(page, "通道");
    const t = await page.locator("body").innerText();
    rec(
      "channels-honest",
      t.includes("不会替你下单") && t.includes("不发真单") && t.includes("没有公开的代下单接口") && !/已送达|已推到|下单成功/.test(t),
      t.includes("不会替你下单") ? "honest copy present" : "missing honest copy",
      "channels do not claim a real send",
    );
    await shot(page, "07-desktop-channels");
    await go(page, "军规");
    const rules = await page.locator("body").innerText();
    rec(
      "rules-page",
      rules.includes("美股当日必平") && rules.includes("关不掉") && rules.includes("华泰美股禁止过夜"),
      `has us-0=${rules.includes("美股当日必平")} pivot-locked=${rules.includes("关不掉")}`,
      "军规 catalog visible and pivot called out as not toggleable",
    );
  }

  // S22 book stale price-match copy
  {
    await go(page, "持仓");
    const t = await page.locator("body").innerText();
    rec(
      "book-copy-matches-logic-model",
      !t.includes("改了价") && !t.includes("买卖支点一致"),
      t.split("\n").slice(0, 6).join(" | "),
      "持仓说明不应再讲价格是否一致",
    );
  }

  // S23 double submit
  {
    await go(page, "通道");
    await page.getByRole("button", { name: "恢复样本镜像" }).click();
    await page.waitForTimeout(200);
    await go(page, "下单");
    await pick(page, "还在却卖");
    const btn = (await stamp(page)).btn;
    await Promise.all([btn.click(), btn.click()]);
    await page.waitForTimeout(700);
    const led = (await store(page)).ledger;
    rec(
      "double-click-one-row",
      led.length === 1,
      `ledger=${led.length} statuses=${led.map((r) => r.status).join(",")}`,
      "two fast clicks write one intercept row",
    );
  }

  rec(
    "desktop-console",
    errors.length === 0,
    errors.join(" || ") || "clean",
    "no console or page errors",
  );

  await context.close();

  // Mobile pass
  const mob = await boot(390, 844);
  {
    const d = await decisionText(mob.page);
    const ov = await overflow(mob.page);
    const dock = await mob.page.locator("nav").last().boundingBox();
    const action = await mob.page.locator(".fixed").first().boundingBox();
    rec(
      "mobile-landing",
      d.decision === "pass" && !ov.overflow && dock && action,
      `${d.decision} ${d.word} / ${d.title} overflow=${ov.overflow} ${ov.scrollW}x${ov.clientW}`,
      "mobile pass, no horizontal overflow, dock present",
    );
    await shot(mob.page, "08-mobile-pass");
    await mob.page.getByLabel("逻辑支点").fill("随便");
    await mob.page.waitForTimeout(150);
    const d2 = await decisionText(mob.page);
    rec(
      "mobile-two-char-reason-blocks",
      d2.decision === "block" && d2.title.includes("还没有逻辑支点"),
      `${d2.decision} ${d2.title}`,
      "two characters are not a reason",
    );
    await mob.page.getByLabel("逻辑支点").fill("随便写写");
    await mob.page.waitForTimeout(200);
    const d3 = await decisionText(mob.page);
    rec(
      "mobile-placeholder-sentence-is-drift",
      d3.decision === "block" && /换了|理由/.test(d3.title),
      `${d3.decision} ${d3.title}`,
      "四个字的另一句不能拿来平掉已有仓",
    );
    await shot(mob.page, "09-mobile-placeholder");
    // intent row overflow inside details
    await mob.page.locator("summary", { hasText: "券商、期限、标签" }).click();
    await mob.page.waitForTimeout(200);
    const ov2 = await overflow(mob.page);
    rec(
      "mobile-details-overflow",
      !ov2.overflow,
      `overflow=${ov2.overflow} ${ov2.scrollW}/${ov2.clientW}`,
      "expanded 券商/期限/标签 does not overflow 390px",
    );
    await shot(mob.page, "10-mobile-details");
    rec(
      "mobile-console",
      mob.errors.length === 0,
      mob.errors.join(" || ") || "clean",
      "no console errors",
    );
    await mob.context.close();
  }

  const failed = results.filter((r) => !r.ok);
  const summary = { url: URL, total: results.length, failed: failed.length, results };
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`${OUT}/report.json`, JSON.stringify(summary, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
} catch (err) {
  rec("suite-crash", false, String(err && err.message ? err.message : err).split("\n")[0], "suite runs to the end");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ url: URL, total: results.length, failed: results.filter((r) => !r.ok).length, results }, null, 2));
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
