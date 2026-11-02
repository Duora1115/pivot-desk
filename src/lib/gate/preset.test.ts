import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeSeed, type DeskState, type LedgerItem } from "./engine.ts";
import { evaluateWithPreset } from "./preset.ts";
import { riskFixture, validPresetState } from "./test-fixtures.ts";

const NOW = new Date("2026-11-02T12:00:00.000Z");

function validState(preset: "conservative-90" | "acceptance-20"): DeskState {
  const { state } = riskFixture();
  state.settings.presetId = preset;
  state.settings.regimes[preset].startedAt = "2026-09-01T00:00:00.000Z";
  state.settings.calendarWindows = [{ id: "window", start: "2026-11-02T00:00:00.000Z", end: "2026-11-03T00:00:00.000Z", createdAt: "2026-11-01T00:00:00.000Z" }];
  state.settings.dailyMarks = Array.from({ length: 45 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 9, 1 + index)).toISOString().slice(0, 10);
    return { date, tradingDay: true, realizedCny: 0, unrealizedCny: 0, feesCny: 0, fxImpactCny: 0 };
  });
  state.settings.dailyMarks.push({ date: "2026-11-02", tradingDay: true, strategy: "swing", realizedCny: 0, unrealizedCny: 0, feesCny: 0, fxImpactCny: 0 });
  return state;
}

function confirmed(at: string, strategy: "swing" | "intraday" = "swing"): LedgerItem {
  return {
    ...makeSeed().ledger[0]!,
    id: `fill-${at}`,
    at,
    confirmedAt: at,
    confirmed: true,
    status: "delivered",
    decision: "pass",
    strategy,
    intent: "open",
  } as LedgerItem;
}

describe("conservative-90", () => {
  it("passes a complete in-window contract after the clean phase", () => {
    const { draft } = riskFixture();
    const verdict = evaluateWithPreset(draft, validState("conservative-90"), NOW);
    assert.equal(verdict.decision, "pass");
    assert.equal(verdict.risk.riskCny, 735);
  });

  it("blocks new risk during the first 30 days", () => {
    const { draft } = riskFixture();
    const state = validState("conservative-90");
    state.settings.regimes["conservative-90"].startedAt = "2026-11-01T00:00:00.000Z";
    const verdict = evaluateWithPreset(draft, state, NOW);
    assert.equal(verdict.decision, "block");
    assert.ok(verdict.hits.some((hit) => hit.ruleId === "clean-phase"));
  });

  it("enforces per-order risk and the preplanned window", () => {
    const { draft } = riskFixture();
    const state = validState("conservative-90");
    state.settings.netAssetCny = 100_000;
    assert.ok(evaluateWithPreset(draft, state, NOW).hits.some((hit) => hit.ruleId === "order-r" && hit.severity === "block"));
    state.settings.netAssetCny = 1_000_000;
    state.settings.calendarWindows = [];
    assert.ok(evaluateWithPreset(draft, state, NOW).hits.some((hit) => hit.ruleId === "calendar-window" && hit.severity === "block"));
  });

  it("blocks a third same-day active fill", () => {
    const { draft } = riskFixture();
    const state = validState("conservative-90");
    state.ledger = [confirmed("2026-11-02T01:00:00.000Z"), confirmed("2026-11-02T02:00:00.000Z")];
    assert.ok(evaluateWithPreset(draft, state, NOW).hits.some((hit) => hit.ruleId === "frequency-day" && hit.severity === "block"));
  });

  it("blocks correlated re-entry inside 48 hours but never blocks reduction", () => {
    const { draft } = riskFixture();
    const state = validState("conservative-90");
    state.closes = [{ ...makeSeed().closes[0]!, symbol: draft.symbol, correlationGroup: "technology", pnlCny: -100, closedAt: "2026-11-02", closedAtTime: "2026-11-02T10:00:00.000Z" }];
    assert.ok(evaluateWithPreset(draft, state, NOW).hits.some((hit) => hit.ruleId === "cooldown-48" && hit.severity === "block"));
    const reducing = { ...draft, intent: "close" as const, side: "sell" as const, plan: { ...draft.plan, createdAt: undefined } };
    assert.ok(!evaluateWithPreset(reducing, state, NOW).hits.some((hit) => hit.ruleId === "cooldown-48"));
  });
});

describe("acceptance-20", () => {
  it("uses CNY 2000 fallback R and enforces it", () => {
    const { draft } = riskFixture();
    const state = validState("acceptance-20");
    state.settings.netAssetCny = null;
    assert.equal(evaluateWithPreset(draft, state, NOW).decision, "pass");
    draft.plan.invalidation = "50";
    assert.ok(evaluateWithPreset(draft, state, NOW).hits.some((hit) => hit.ruleId === "order-r" && hit.severity === "block"));
  });

  it("blocks stage-three bottom fishing and post-23:30 new risk", () => {
    const { draft } = riskFixture();
    draft.plan.marketStage = "3";
    draft.plan.setup = "bottom-fishing";
    assert.ok(evaluateWithPreset(draft, validState("acceptance-20"), NOW).hits.some((hit) => hit.ruleId === "stage-3-bottom" && hit.severity === "block"));
    draft.plan.marketStage = "2";
    draft.plan.setup = "standard";
    assert.ok(evaluateWithPreset(draft, validState("acceptance-20"), new Date("2026-11-02T15:31:00.000Z")).hits.some((hit) => hit.ruleId === "late-night"));
    assert.ok(!evaluateWithPreset(draft, validState("acceptance-20"), new Date("2026-11-02T15:30:00.000Z")).hits.some((hit) => hit.ruleId === "late-night"));
  });

  it("fails closed when continuous account marks are unavailable", () => {
    const { draft } = riskFixture();
    const state = validState("acceptance-20");
    state.settings.dailyMarks = [];
    assert.ok(evaluateWithPreset(draft, state, NOW).hits.some((hit) => hit.ruleId === "marks-missing" && hit.severity === "block"));
  });
});

describe("final review risk regressions", () => {
  it("keeps an applicable cooldown when an unrelated loss is newer", () => {
    const { draft } = riskFixture();
    draft.plan.correlationGroup = " technology ";
    const state = validState("conservative-90");
    state.closes = [
      { ...makeSeed().closes[0]!, id: "applicable", symbol: draft.symbol, correlationGroup: "technology", pnlCny: -100, closedAt: "2026-11-02", closedAtTime: "2026-11-02T10:00:00.000Z" },
      { ...makeSeed().closes[0]!, id: "unrelated", symbol: "OTHER", correlationGroup: "other", pnlCny: -100, closedAt: "2026-11-02", closedAtTime: "2026-11-02T11:00:00.000Z" },
    ];
    assert.ok(evaluateWithPreset(draft, state, NOW).hits.some((hit) => hit.ruleId === "cooldown-48" && hit.severity === "block"));
  });

  it("fails closed when a recent loss has an unknown correlation group", () => {
    const { draft } = riskFixture();
    const state = validState("conservative-90");
    state.closes = [{ ...makeSeed().closes[0]!, symbol: "OTHER", correlationGroup: null, pnlCny: -100, closedAt: "2026-11-02", closedAtTime: "2026-11-02T10:00:00.000Z" }];
    assert.ok(evaluateWithPreset(draft, state, NOW).hits.some((hit) => hit.ruleId === "correlation-unknown" && hit.severity === "block"));
  });

  it("reserves daily frequency for unconfirmed passing orders", () => {
    const { draft } = riskFixture();
    const state = validState("conservative-90");
    state.ledger = ["2026-11-02T01:00:00.000Z", "2026-11-02T02:00:00.000Z"].map((at) => ({
      ...confirmed(at), confirmed: false, confirmedAt: null, status: "queued" as const, plannedRiskCny: 100,
    }));
    assert.ok(evaluateWithPreset(draft, state, NOW).hits.some((hit) => hit.ruleId === "frequency-day" && hit.severity === "block"));
  });

  it("reserves same-symbol cost for unconfirmed passing orders", () => {
    const { draft } = riskFixture();
    const state = validState("acceptance-20");
    state.ledger = [{
      ...confirmed("2026-11-02T01:00:00.000Z"), confirmed: false, confirmedAt: null, status: "parked" as const,
      symbol: draft.symbol, market: draft.market, qty: 150, price: 100, fxRate: 7, plannedRiskCny: 1000,
    }];
    assert.ok(evaluateWithPreset(draft, state, NOW).hits.some((hit) => hit.ruleId === "symbol-cost" && hit.severity === "block"));
  });

  it("requires an unchanged persisted pre-loss contract for correlated switches", () => {
    const { draft } = riskFixture();
    const state = validPresetState("acceptance-20");
    state.closes = [{ ...makeSeed().closes[0]!, symbol: "INTC", correlationGroup: "technology", pnlCny: -100, closedAt: "2026-11-02", closedAtTime: "2026-11-02T10:00:00.000Z" }];
    draft.plan.createdAt = "2026-11-02T09:00:00.000Z";
    assert.ok(evaluateWithPreset(draft, state, NOW).hits.some((hit) => hit.ruleId === "correlated-switch" && hit.severity === "block"));

    state.contracts[draft.plan.id!] = { draft: structuredClone(draft), recordedAt: "2026-11-02T11:00:00.000Z" };
    assert.ok(evaluateWithPreset(draft, state, NOW).hits.some((hit) => hit.ruleId === "correlated-switch" && hit.severity === "block"));

    state.contracts[draft.plan.id!] = { draft: structuredClone(draft), recordedAt: "2026-11-02T09:00:00.000Z" };
    assert.ok(!evaluateWithPreset(draft, state, NOW).hits.some((hit) => hit.ruleId === "correlated-switch"));
  });

  it("uses 1R rather than 0.5R for total stage-four symbol risk", () => {
    const { draft } = riskFixture();
    draft.plan.marketStage = "4";
    draft.plan.setup = "stage4-bounce";
    const state = validState("acceptance-20");
    state.positions = [{
      ...makeSeed().positions[0]!, symbol: draft.symbol, market: "US", qty: 80, price: 100,
      currentPrice: 110, invalidation: 100, feeBudget: 0, fxRate: 1, correlationGroup: "technology", strategy: "swing",
    }];
    const verdict = evaluateWithPreset(draft, state, NOW);
    assert.ok(!verdict.hits.some((hit) => hit.ruleId === "symbol-risk" && hit.severity === "block"));
    assert.equal(verdict.decision, "pass");
  });
});
