import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DESK_DATE,
  PRESETS,
  applyToBook,
  classify,
  compareCloseRecency,
  daysBetween,
  evaluate,
  holdOf,
  makeSeed,
  needsPlanPanel,
  nid,
  settle,
  type DeskState,
  type Draft,
  type LedgerItem,
} from "./engine.ts";

const EXPECTED: Record<string, { decision: "pass" | "block" | "review"; ruleId: string; hold: number }> = {
  "pivot-gone": { decision: "pass", ruleId: "pivot-gone", hold: 12 },
  "pivot-live": { decision: "block", ruleId: "pivot-live", hold: 12 },
  "pivot-drift": { decision: "block", ruleId: "pivot-drift", hold: 12 },
  "aapl-day": { decision: "pass", ruleId: "us-0", hold: 0 },
  "avgo-ht": { decision: "block", ruleId: "ht-overnight", hold: 12 },
  revenge: { decision: "block", ruleId: "revenge", hold: 0 },
  tencent: { decision: "block", ruleId: "hk-31", hold: 66 },
  "baba-plan": { decision: "pass", ruleId: "us-1-3", hold: 2 },
  "option-d5": { decision: "review", ruleId: "option-d4", hold: 5 },
  "etf-t0": { decision: "pass", ruleId: "pivot-hold", hold: 0 },
  q5: { decision: "block", ruleId: "us-q5", hold: 2 },
  "hk-ali": { decision: "pass", ruleId: "hk-short", hold: 8 },
  maotai: { decision: "review", ruleId: "a-day4", hold: 7 },
};

function gateOf(draft: Draft, state: DeskState = makeSeed()) {
  return evaluate(draft, state);
}

function item(partial: Partial<LedgerItem> & Pick<LedgerItem, "intent" | "qty" | "decision">): LedgerItem {
  return {
    id: "t-1",
    at: "2026-10-21T01:00:00.000Z",
    status: "delivered",
    confirmed: true,
    broker: "ht",
    market: "US",
    symbol: "AVGO",
    name: "博通",
    asset: "stock",
    side: "sell",
    price: 175,
    currency: "USD",
    notionalCny: 0,
    hold: 12,
    pivotPrice: 170,
    pivotNote: "跌破就走，不加仓",
    stamp: "test",
    hits: [],
    ...partial,
  };
}

describe("presets against the seed book", () => {
  const seed = makeSeed();

  for (const preset of PRESETS) {
    const expected = EXPECTED[preset.id];
    it(`${preset.label} → ${expected?.decision ?? "?"} ${expected?.ruleId ?? "?"}`, () => {
      assert.ok(expected, `missing expected row for ${preset.id}`);
      const before = structuredClone(seed.positions);
      const verdict = evaluate(preset.draft, seed);
      assert.equal(verdict.decision, expected.decision);
      assert.equal(verdict.primary?.ruleId, expected.ruleId);
      assert.equal(verdict.hold, expected.hold);
      assert.deepEqual(seed.positions, before);
    });
  }

  it("富途当日 carries futu-us but does not let it stamp", () => {
    const preset = PRESETS.find((p) => p.id === "aapl-day");
    assert.ok(preset);
    const verdict = gateOf(preset.draft, seed);
    assert.equal(verdict.primary?.ruleId, "us-0");
    assert.ok(verdict.hits.some((h) => h.ruleId === "futu-us" && h.severity === "info" && h.gate === "WATCH"));
  });

  it("隔夜大名义仍被 Q5 拦住，计划书不能豁免", () => {
    const preset = PRESETS.find((p) => p.id === "q5");
    assert.ok(preset);
    const verdict = gateOf(preset.draft, seed);
    assert.equal(verdict.decision, "block");
    assert.equal(verdict.primary?.ruleId, "us-q5");
    assert.ok(verdict.hits.some((h) => h.ruleId === "us-1-3" && h.severity === "info"));
  });

  it("广发 T0 放行，且同时留下 t0-ok", () => {
    const preset = PRESETS.find((p) => p.id === "etf-t0");
    assert.ok(preset);
    const verdict = gateOf(preset.draft, seed);
    assert.equal(verdict.decision, "pass");
    assert.ok(verdict.hits.some((h) => h.ruleId === "t0-ok"));
    assert.equal(verdict.hold, 0);
  });
});

describe("review regressions", () => {
  const seed = makeSeed();

  it("平仓数量不等于持仓时拦截，底稿行还在", () => {
    const avgo = seed.positions.find((p) => p.symbol === "AVGO");
    assert.ok(avgo);
    const draft: Draft = {
      ...structuredClone(PRESETS[0].draft),
      qty: "5",
    };
    const before = structuredClone(seed.positions);
    const verdict = evaluate(draft, seed);
    assert.equal(verdict.decision, "block");
    assert.equal(verdict.primary?.ruleId, "close-qty");
    assert.deepEqual(seed.positions, before);

    const next = applyToBook(seed.positions, item({ intent: "close", qty: 5, decision: "pass" }));
    const left = next.find((p) => p.id === avgo.id);
    assert.ok(left);
    assert.equal(left.qty, avgo.qty - 5);
    assert.equal(seed.positions.find((p) => p.id === avgo.id)?.qty, avgo.qty);
  });

  it("博通一次平掉才放行，并记一笔平仓", () => {
    const draft = PRESETS.find((p) => p.id === "pivot-gone")!.draft;
    const verdict = evaluate(draft, seed);
    assert.equal(verdict.decision, "pass");
    const closing = item({ intent: "close", qty: 20, decision: "pass", price: 175 });
    const next = applyToBook(seed.positions, closing);
    assert.equal(next.some((p) => p.symbol === "AVGO" && p.broker === "ht"), false);
    const settled = settle(seed.positions, seed.closes, closing);
    assert.equal(settled.positions.some((p) => p.id === "p-avgo"), false);
    assert.equal(settled.closes[0]?.id, "c-t-1");
    assert.equal(settled.closes[0]?.closedAt, DESK_DATE);
    assert.ok(Math.abs(settled.closes[0]!.pnlCny! - (175 - 178) * 20 * 7.12) < 1e-6);
    const again = settle(settled.positions, settled.closes, closing);
    assert.equal(again.closes.length, settled.closes.length);
  });

  it("减仓只减数量，不把出血仓的时钟整行抹掉", () => {
    const closing = item({ intent: "reduce", qty: 5, decision: "pass", price: 175 });
    const draft: Draft = { ...structuredClone(PRESETS[0].draft), intent: "reduce", qty: "5" };
    const verdict = evaluate(draft, seed);
    assert.equal(verdict.decision, "pass");
    assert.equal(verdict.primary?.ruleId, "pivot-gone");
    const settled = settle(seed.positions, seed.closes, closing);
    const left = settled.positions.find((p) => p.id === "p-avgo");
    assert.equal(left?.qty, 15);
    assert.equal(left?.openedAt, "2026-10-09");
    assert.equal(holdOf(left!, DESK_DATE), 12);
    assert.equal(settled.closes[0]?.symbol, "AVGO");
  });

  it("已有仓位时，更长的期限按钮不能改写开仓日", () => {
    const ali = PRESETS.find((p) => p.id === "hk-ali")!.draft;
    const wished = evaluate({ ...ali, holdDays: 31 }, seed);
    assert.equal(wished.hold, 8);
    assert.equal(wished.decision, "pass");
    assert.equal(wished.primary?.ruleId, "hk-short");
    assert.equal(wished.hits.some((h) => h.ruleId === "hk-31" && h.severity === "block"), false);

    const apple = seed.positions.find((p) => p.symbol === "AAPL")!;
    const add: Draft = {
      ...structuredClone(PRESETS.find((p) => p.id === "aapl-day")!.draft),
      intent: "add",
      qty: "5",
      holdDays: 7,
      pivotPrice: String(apple.pivotPrice),
      pivotNote: apple.pivotNote,
    };
    const verdict = evaluate(add, seed);
    assert.equal(verdict.hold, 0);
    assert.equal(verdict.decision, "pass");
    assert.equal(verdict.primary?.ruleId, "us-0");
    assert.equal(verdict.hits.some((h) => h.ruleId === "us-4-30"), false);
  });

  it("关掉 T0 看板之后，华泰隔夜仍然拦截", () => {
    const state: DeskState = {
      ...seed,
      settings: { ...seed.settings, rules: { ...seed.settings.rules, "t0-lane": false } },
    };
    const draft: Draft = {
      ...structuredClone(PRESETS.find((p) => p.id === "avgo-ht")!.draft),
      intent: "t0",
      side: "buy",
      holdDays: 0,
    };
    const verdict = evaluate(draft, state);
    assert.equal(verdict.hold, 12);
    assert.equal(verdict.decision, "block");
    assert.ok(verdict.hits.some((h) => h.ruleId === "ht-overnight" && h.severity === "block"));
    assert.ok(verdict.hits.some((h) => h.ruleId === "us-4-30" && h.severity === "block"));
    const lane = verdict.hits.find((h) => h.ruleId === "t0-lane");
    assert.equal(lane?.severity, "info");
  });

  it("非法平仓日不会被当成当天，进不了报复窗", () => {
    assert.ok(Number.isNaN(daysBetween("not-a-date", DESK_DATE)));
    const state: DeskState = {
      ...seed,
      closes: [
        {
          id: "bad",
          broker: "ht",
          market: "US",
          symbol: "ORCL",
          name: "甲骨文",
          closedAt: "not-a-date",
          pnlCny: -18420,
          notionalCny: 1,
        },
      ],
    };
    const verdict = evaluate(PRESETS.find((p) => p.id === "revenge")!.draft, state);
    assert.equal(verdict.hits.some((h) => h.ruleId === "revenge"), false);
  });

  it("1–3 日没计划时，摊平闸仍然单独盖章", () => {
    const draft: Draft = {
      ...structuredClone(PRESETS.find((p) => p.id === "baba-plan")!.draft),
      tag: "average",
      plan: { invalidation: "", maxNotional: "", maxDays: "", thesis: "", approved: false },
    };
    const verdict = evaluate(draft, seed);
    assert.equal(verdict.decision, "block");
    assert.ok(verdict.hits.some((h) => h.ruleId === "us-1-3" && h.severity === "block"));
    assert.ok(verdict.hits.some((h) => h.ruleId === "avg-plan" && h.severity === "block"));
  });

  it("未放行的委托不改底稿", () => {
    const next = applyToBook(seed.positions, item({ intent: "close", qty: 20, decision: "block" }));
    assert.equal(next, seed.positions);
  });
});

describe("review defect regressions", () => {
  it("同日亏损锚点比较返回相等并保留最新优先输入顺序", () => {
    const seed = makeSeed();
    const low = { ...seed.closes[0]!, id: "low", closedAt: DESK_DATE, notionalCny: 100, pnlCny: -1 };
    const high = { ...seed.closes[0]!, id: "high", closedAt: DESK_DATE, notionalCny: 100000, pnlCny: -2 };
    assert.equal(compareCloseRecency(low, high), 0);
    assert.deepEqual([low, high].sort(compareCloseRecency).map((close) => close.id), ["low", "high"]);
  });

  it("30 日过夜计划不能覆盖 50 日真实持仓", () => {
    const state = makeSeed();
    const position = state.positions.find((p) => p.symbol === "AVGO")!;
    position.openedAt = "2026-09-01";
    const draft: Draft = {
      ...structuredClone(PRESETS.find((p) => p.id === "avgo-ht")!.draft),
      plan: { invalidation: "170", maxNotional: "20000", maxDays: "30", thesis: "华泰过夜测试计划", approved: true },
    };
    const verdict = evaluate(draft, state);
    assert.equal(verdict.hold, 50);
    assert.equal(verdict.hits.find((hit) => hit.ruleId === "ht-overnight")?.severity, "block");

    position.openedAt = "2026-09-21";
    const boundary = evaluate(draft, state);
    assert.equal(boundary.hold, 30);
    assert.equal(boundary.hits.find((hit) => hit.ruleId === "ht-overnight")?.severity, "info");
  });

  it("US 4–30 正股规则不误伤 ETF 和债券", () => {
    for (const asset of ["etf", "bond"] as const) {
      const draft: Draft = {
        ...structuredClone(PRESETS.find((p) => p.id === "avgo-ht")!.draft),
        broker: "gf",
        symbol: asset === "etf" ? "SPY" : "TLT",
        name: asset === "etf" ? "标普ETF" : "长债ETF",
        asset,
        intent: "open",
        qty: "1",
        price: "100",
        holdDays: 12,
      };
      const verdict = evaluate(draft, makeSeed());
      assert.equal(verdict.hits.some((hit) => hit.ruleId === "us-4-30" && hit.severity === "block"), false);
      assert.equal(needsPlanPanel(draft, verdict), false);
      const position = { ...makeSeed().positions.find((p) => p.symbol === "AVGO")!, ...draft, id: `p-${asset}`, asset, broker: "gf" as const, qty: 1, price: 100, openedAt: "2026-10-09", pivotPrice: 170 };
      assert.notEqual(classify(position).label, "出血 · 4–30日");
    }
  });

  it("US 1–3 日计划面板仍适用于 ETF", () => {
    const draft: Draft = {
      ...structuredClone(PRESETS.find((p) => p.id === "avgo-ht")!.draft),
      broker: "gf",
      asset: "etf",
      intent: "open",
      qty: "1",
      price: "100",
      holdDays: 2,
    };
    const verdict = evaluate(draft, makeSeed());
    assert.equal(verdict.hold, 2);
    assert.equal(needsPlanPanel(draft, verdict), true);
  });

  it("使用订单快照汇率计算实现盈亏，未知汇率保持未知", () => {
    const closing = item({ intent: "close", qty: 20, decision: "pass", price: 175, fxRate: 7 });
    const settled = settle(makeSeed().positions, makeSeed().closes, closing);
    assert.equal(settled.closes[0]?.pnlCny, -420);
    const unknown = settle(makeSeed().positions, makeSeed().closes, item({ intent: "close", qty: 20, decision: "pass", price: 175, fxRate: null }));
    assert.equal(unknown.closes[0]?.pnlCny, null);
  });

  it("结算使用注入的真实日期而非样本日期", () => {
    const opened = settle([], [], item({ intent: "open", side: "buy", qty: 1, decision: "pass" }), "2026-11-02");
    assert.equal(opened.positions[0]?.openedAt, "2026-11-02");
    const closed = settle(makeSeed().positions, makeSeed().closes, item({ intent: "close", qty: 20, decision: "pass" }), "2026-11-03");
    assert.equal(closed.closes[0]?.closedAt, "2026-11-03");
  });

  it("新账本 ID 使用注入的 UUID", () => {
    assert.equal(nid(() => "123e4567-e89b-42d3-a456-426614174000"), "NS-123E4567-E89B-42D3-A456-426614174000");
  });
});
