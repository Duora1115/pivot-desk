import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeSeed, settle, type DeskState, type LedgerItem } from "./engine.ts";
import { deskReducer, migrateDeskState } from "./desk-state.ts";
import { riskFixture, validPresetState } from "./test-fixtures.ts";

function item(partial: Partial<LedgerItem> = {}): LedgerItem {
  return {
    id: "order-1",
    at: "2026-10-21T01:00:00.000Z",
    decision: "pass",
    status: "delivered",
    confirmed: false,
    broker: "ht",
    market: "US",
    symbol: "AVGO",
    name: "博通",
    asset: "stock",
    side: "sell",
    intent: "close",
    qty: 20,
    price: 175,
    currency: "USD",
    notionalCny: 24920,
    hold: 12,
    pivotPrice: 170,
    pivotNote: "跌破就走，不加仓",
    stamp: "test",
    hits: [],
    ...partial,
  };
}

describe("migrateDeskState", () => {
  it("preserves v2 records while adding v3 defaults", () => {
    const seed = makeSeed();
    const legacy = {
      ...seed,
      version: 2 as const,
      settings: { q5Cny: seed.settings.q5Cny, autoConfirm: seed.settings.autoConfirm, rules: seed.settings.rules },
    } as DeskState;
    const migrated = migrateDeskState(legacy, "2026-11-02T00:00:00.000Z");
    assert.ok(migrated);
    assert.equal(migrated.version, 3);
    assert.equal(migrated.positions.length, legacy.positions.length);
    assert.equal(migrated.closes.length, legacy.closes.length);
    assert.equal(migrated.settings.presetId, "conservative-90");
    assert.equal(migrated.settings.netAssetCny, null);
    assert.equal(migrated.settings.fx.CNY.rate, 1);
    assert.equal(migrated.settings.regimes["conservative-90"].startedAt, "2026-11-02T00:00:00.000Z");
  });

  it("rekeys duplicate legacy IDs without dropping orders", () => {
    const legacy = { ...makeSeed(), version: 2 as const, ledger: [item(), item()] };
    const migrated = migrateDeskState(legacy, "2026-11-02T00:00:00.000Z");
    assert.ok(migrated);
    assert.equal(migrated.ledger.length, 2);
    assert.deepEqual(migrated.ledger.map((row) => row.id), ["order-1", "order-1-DUP2"]);
  });
});

describe("deskReducer settlement integrity", () => {
  it("rejects a stale close without changing the current book", () => {
    const seed = makeSeed();
    const stale = item();
    const reduced = settle(seed.positions, seed.closes, item({ id: "reduce-10", intent: "reduce", qty: 10 }));
    const state: DeskState = {
      ...seed,
      positions: reduced.positions,
      closes: reduced.closes,
      ledger: [stale],
      settings: { ...seed.settings, autoConfirm: false },
    };
    const next = deskReducer(state, { type: "confirm", id: stale.id });
    assert.equal(next.positions.find((position) => position.id === "p-avgo")?.qty, 10);
    assert.equal(next.closes.length, state.closes.length);
    assert.equal(next.ledger[0]?.confirmed, false);
    assert.notEqual(next.flash, "");
  });

  it("updates only the selected row even if duplicate IDs enter state", () => {
    const seed = makeSeed();
    const first = item({ id: "duplicate", status: "queued", intent: "open", side: "buy" });
    const second = item({ id: "duplicate", status: "queued", intent: "open", side: "buy" });
    const state = { ...seed, ledger: [first, second], settings: { ...seed.settings, autoConfirm: false } };
    const next = deskReducer(state, { type: "deliver", id: "duplicate", ticket: "T-1" });
    assert.equal(next.ledger[0]?.status, "delivered");
    assert.equal(next.ledger[1]?.status, "queued");
  });

  it("does not settle the same delivery twice", () => {
    const seed = makeSeed();
    const queued = item({ status: "queued" });
    const state = { ...seed, ledger: [queued], settings: { ...seed.settings, autoConfirm: true } };
    const delivered = deskReducer(state, { type: "deliver", id: queued.id, ticket: "T-1" });
    const closes = delivered.closes.length;
    const again = deskReducer(delivered, { type: "deliver", id: queued.id, ticket: "T-2" });
    assert.equal(again, delivered);
    assert.equal(again.closes.length, closes);
  });

  it("starts a new regime while archiving violations and preserving the ledger", () => {
    const seed = makeSeed();
    const state = {
      ...seed,
      ledger: [item()],
      settings: {
        ...seed.settings,
        regimes: {
          ...seed.settings.regimes,
          "conservative-90": {
            startedAt: "2026-09-01T00:00:00.000Z",
            violations: [{ id: "v1", at: "2026-09-02T00:00:00.000Z", kind: "external", detail: "无合同交易" }],
          },
        },
      },
    };
    const next = deskReducer(state, { type: "regime-reset", id: "conservative-90", at: "2026-11-03T00:00:00.000Z" });
    assert.equal(next.ledger.length, 1);
    assert.equal(next.settings.regimes["conservative-90"].violations.length, 0);
    assert.equal(next.settings.regimes["conservative-90"].startedAt, "2026-11-03T00:00:00.000Z");
    assert.equal(next.settings.regimes["conservative-90"].history?.[0]?.violations[0]?.id, "v1");
  });

  it("updates fees only for the selected duplicate and its own records", () => {
    const seed = makeSeed();
    const first = item({ id: "duplicate", planId: "plan-1", positionId: "p-avgo", confirmed: true, actualFee: null });
    const second = item({ id: "duplicate", planId: "plan-2", positionId: "p-700", confirmed: true, actualFee: null });
    const state = {
      ...seed,
      ledger: [first, second],
      positions: seed.positions.map((position, index) => ({ ...position, actualFee: null, planId: index === 0 ? "plan-1" : index === 1 ? "plan-2" : null })),
      closes: [
        { ...seed.closes[0]!, id: "c-duplicate", planId: "plan-1", actualFee: null },
        { ...seed.closes[0]!, id: "c-duplicate", planId: "plan-2", actualFee: null },
      ],
    };
    const next = deskReducer(state, { type: "fee", id: "duplicate", value: 9 });
    assert.equal(next.ledger[0]?.actualFee, 9);
    assert.equal(next.ledger[1]?.actualFee, null);
    assert.equal(next.positions[0]?.actualFee, 9);
    assert.equal(next.positions[1]?.actualFee, null);
    assert.equal(next.closes[0]?.actualFee, 9);
    assert.equal(next.closes[1]?.actualFee, null);
  });

  it("applies a stale tab action to the latest persisted state", () => {
    const seed = makeSeed();
    const committed = deskReducer(seed, { type: "commit", item: item(), flash: "committed" });
    const fromOtherTab = deskReducer(committed, { type: "q5", value: 123456 });
    assert.equal(fromOtherTab.ledger.length, 1);
    assert.equal(fromOtherTab.settings.q5Cny, 123456);
    assert.ok(fromOtherTab.revision > committed.revision);
  });

  it("re-gates submission against the freshly selected state", () => {
    const { draft } = riskFixture();
    const state = validPresetState("conservative-90");
    state.draft = draft;
    state.ledger = ["2026-11-02T01:00:00.000Z", "2026-11-02T02:00:00.000Z"].map((at, index) => item({
      id: `reserved-${index}`,
      at,
      status: "queued",
      intent: "open",
      side: "buy",
      plannedRiskCny: 100,
    }));
    const next = deskReducer(state, { type: "submit", id: "fresh-order", at: "2026-11-02T12:00:00.000Z" });
    assert.equal(next.ledger[0]?.id, "fresh-order");
    assert.equal(next.ledger[0]?.decision, "block");
    assert.equal(next.ledger[0]?.status, "blocked");
    assert.ok(next.ledger[0]?.hits.some((hit) => hit.ruleId === "frequency-day"));
  });

  it("renews plan identity for presets and economic identity edits", () => {
    const seed = makeSeed();
    const previous = seed.draft.plan.id;
    const preset = deskReducer(seed, { type: "preset", id: "baba-plan", at: "2026-11-02T12:00:00.000Z" });
    assert.notEqual(preset.draft.plan.id, previous);
    assert.equal(preset.draft.plan.createdAt, "2026-11-02T12:00:00.000Z");
    const renamed = deskReducer(preset, { type: "draft", patch: { symbol: "MSFT" }, at: "2026-11-02T12:01:00.000Z" });
    assert.notEqual(renamed.draft.plan.id, preset.draft.plan.id);
    assert.equal(renamed.draft.plan.createdAt, "2026-11-02T12:01:00.000Z");
    assert.ok(renamed.contracts[renamed.draft.plan.id!]);
  });
});
