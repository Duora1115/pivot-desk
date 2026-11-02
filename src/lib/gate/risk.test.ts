import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeSeed, settle, type LedgerItem, type Position } from "./engine.ts";
import { assessContract, openRisk, riskUnit } from "./risk.ts";
import { riskFixture } from "./test-fixtures.ts";

describe("assessContract", () => {
  it("computes native fee and FX into the hand-checked CNY risk", () => {
    const { state, draft } = riskFixture();
    const assessment = assessContract(draft, state, new Date("2026-11-02T00:00:00.000Z"));
    assert.deepEqual(assessment.missing, []);
    assert.equal(assessment.riskCny, 735);
    assert.equal(assessment.costCny, 7000);
  });

  it("keeps risk unknown when fee or FX is missing", () => {
    const { state, draft } = riskFixture();
    draft.plan.feeBudget = "";
    assert.equal(assessContract(draft, state, new Date("2026-11-02T00:00:00.000Z")).riskCny, null);
    draft.plan.feeBudget = "5";
    state.settings.fx.USD.rate = null;
    assert.equal(assessContract(draft, state, new Date("2026-11-02T00:00:00.000Z")).riskCny, null);
  });
});

describe("openRisk", () => {
  it("includes positions and unconfirmed opens but excludes pending reductions", () => {
    const { state } = riskFixture();
    const position: Position = {
      ...makeSeed().positions[0]!,
      qty: 2,
      currentPrice: 110,
      invalidation: 90,
      feeBudget: 5,
      fxRate: 7,
    };
    const pending: LedgerItem = {
      ...makeSeed().ledger[0]!,
      id: "pending",
      status: "queued",
      decision: "pass",
      confirmed: false,
      intent: "open",
      plannedRiskCny: 200,
    } as LedgerItem;
    state.positions = [position];
    state.ledger = [pending, { ...pending, id: "reduce", intent: "reduce", plannedRiskCny: 999 }];
    const risk = openRisk(state);
    assert.equal(risk.positionCny, 315);
    assert.equal(risk.reservedCny, 200);
    assert.equal(risk.totalCny, 515);
  });

  it("keeps contract invalidation distinct from the pivot through settlement", () => {
    const { state } = riskFixture();
    const order = {
      ...makeSeed().ledger[0]!,
      id: "open-risk-invalidation",
      decision: "pass",
      status: "delivered",
      confirmed: true,
      broker: "ht",
      market: "US",
      symbol: "AVGO",
      name: "博通",
      asset: "stock",
      side: "buy",
      intent: "open",
      qty: 20,
      price: 100,
      pivotPrice: 99,
      invalidation: 90,
      feeBudget: 5,
      fxRate: 7,
      at: "2026-11-02T00:00:00.000Z",
    } as LedgerItem;
    const settled = settle([], [], order);
    state.positions = settled.positions;
    assert.equal(state.positions[0]?.invalidation, 90);
    assert.equal(openRisk(state).totalCny, 1435);
  });

  it("does not turn unknown position inputs into zero", () => {
    const { state } = riskFixture();
    state.positions = [{ ...makeSeed().positions[0]!, currentPrice: null }];
    assert.equal(openRisk(state).totalCny, null);
    assert.ok(openRisk(state).unknown.length > 0);
  });
  it("fails closed on unknown groups when evaluating a theme", () => {
    const { state } = riskFixture();
    state.positions = [{ ...makeSeed().positions[0]!, correlationGroup: null, currentPrice: 110, invalidation: 90, feeBudget: 5, fxRate: 7 }];
    assert.equal(openRisk(state, { correlationGroup: "technology" }).totalCny, null);
  });
});

describe("riskUnit", () => {
  it("uses the conservative net-asset leg and acceptance fallback separately", () => {
    const { state } = riskFixture();
    state.settings.presetId = "conservative-90";
    assert.equal(riskUnit(state), 2500);
    state.settings.presetId = "acceptance-20";
    assert.equal(riskUnit(state), 2000);
    state.settings.netAssetCny = null;
    assert.equal(riskUnit(state), 2000);
  });
});
