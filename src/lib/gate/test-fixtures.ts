import { makeSeed, PRESETS, type DeskState, type Draft, type RulePresetId } from "./engine.ts";

export function riskFixture(): { state: DeskState; draft: Draft } {
  const state = makeSeed();
  state.positions = [];
  state.closes = [];
  state.ledger = [];
  state.settings.netAssetCny = 1_000_000;
  state.settings.fx.USD = { rate: 7, asOf: "2026-11-01" };
  const draft = structuredClone(PRESETS.find((preset) => preset.id === "baba-plan")!.draft);
  draft.qty = "10";
  draft.price = "100";
  draft.plan = {
    ...draft.plan,
    createdAt: "2026-11-01T00:00:00.000Z",
    strategy: "swing",
    counterargument: "若跌破失效价则原判断不成立",
    marketStage: "2",
    setup: "standard",
    feeBudget: "5",
    addConditions: "只有浮盈且新支点成立才加",
    exitConditions: "跌破失效价立即退出",
    correlationGroup: "technology",
    invalidation: "90",
    maxNotional: "10000",
    maxDays: "5",
    thesis: "突破后回踩仍成立",
  };
  return { state, draft };
}

export function validPresetState(preset: RulePresetId, now = new Date("2026-11-02T12:00:00.000Z")): DeskState {
  const { state } = riskFixture();
  state.settings.presetId = preset;
  state.settings.regimes[preset].startedAt = "2026-09-01T00:00:00.000Z";
  state.settings.calendarWindows = [{ id: "window", start: "2026-11-02T00:00:00.000Z", end: "2026-11-03T00:00:00.000Z", createdAt: "2026-11-01T00:00:00.000Z" }];
  state.settings.dailyMarks = Array.from({ length: 45 }, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - (44 - index));
    return { date: date.toISOString().slice(0, 10), tradingDay: true, realizedCny: 0, unrealizedCny: 0, feesCny: 0, fxImpactCny: 0 };
  });
  state.settings.dailyMarks.push({ date: "2026-11-02", tradingDay: true, strategy: "swing", realizedCny: 0, unrealizedCny: 0, feesCny: 0, fxImpactCny: 0 });
  return state;
}
