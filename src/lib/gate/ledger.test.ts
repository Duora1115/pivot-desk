import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeSeed, type CloseRecord, type DailyMark, type Position } from "./engine.ts";
import { dailyNet, drawdown, strategySummaries } from "./ledger.ts";

describe("strategySummaries", () => {
  it("separates gross, fees, fee coverage and unrealized without inventing zero fees", () => {
    const state = makeSeed();
    const closes: CloseRecord[] = [
      { ...state.closes[0]!, strategy: "swing", pnlCny: 100, actualFee: 10 },
      { ...state.closes[1]!, id: "unknown-fee", strategy: "swing", pnlCny: -20, actualFee: null },
    ];
    const position: Position = {
      ...state.positions[0]!,
      strategy: "swing",
      qty: 2,
      price: 50,
      currentPrice: 60,
      fxRate: 1,
    };
    state.closes = closes;
    state.positions = [position];
    const summary = strategySummaries(state).find((row) => row.strategy === "swing")!;
    assert.equal(summary.grossRealizedCny, 80);
    assert.equal(summary.knownFeesCny, 10);
    assert.equal(summary.feeNetRealizedCny, null);
    assert.equal(summary.feeCoverage, 1 / 3);
    assert.equal(summary.unrealizedCny, 20);
  });
  it("includes open-position fees in coverage and known totals", () => {
    const state = makeSeed();
    state.closes = [
      { ...state.closes[0]!, strategy: "swing", pnlCny: 100, actualFee: 10 },
      { ...state.closes[1]!, strategy: "swing", pnlCny: -20, actualFee: null },
    ];
    state.positions = [{ ...state.positions[0]!, strategy: "swing", actualFee: null, currentPrice: 60, fxRate: 1 }];
    const unknown = strategySummaries(state).find((row) => row.strategy === "swing")!;
    assert.equal(unknown.feeCoverage, 1 / 3);
    assert.equal(unknown.knownFeesCny, 10);
    assert.equal(unknown.feeNetRealizedCny, null);
    state.positions[0]!.actualFee = 5;
    const known = strategySummaries(state).find((row) => row.strategy === "swing")!;
    assert.equal(known.feeCoverage, 2 / 3);
    assert.equal(known.knownFeesCny, 15);
  });
});

describe("daily marks", () => {
  it("computes daily net only when every component is known", () => {
    const mark: DailyMark = { date: "2026-11-02", tradingDay: true, realizedCny: 100, unrealizedCny: 50, feesCny: 10, fxImpactCny: 5 };
    assert.equal(dailyNet(mark), 145);
    assert.equal(dailyNet({ ...mark, feesCny: null }), null);
  });

  it("computes peak-to-current drawdown across daily marks", () => {
    const marks = [100, -150, 50].map((net, index) => ({
      date: `2026-11-0${index + 1}`,
      tradingDay: true,
      realizedCny: net,
      unrealizedCny: 0,
      feesCny: 0,
      fxImpactCny: 0,
    }));
    assert.equal(drawdown(marks), 150);
  });
});
