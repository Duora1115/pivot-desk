import {
  PRESETS,
  canonicalGroup,
  emptyPlan,
  findPosition,
  makeSeed,
  riskDefaults,
  settle,
  type BrokerId,
  type Ccy,
  type CalendarWindow,
  type DailyMark,
  type DeskState,
  type Draft,
  type LedgerItem,
  type Plan,
  type Position,
  type RiskMetadata,
  type RulePresetId,
  type ViolationRecord,
} from "./engine.ts";
import { evaluateWithPreset } from "./preset.ts";
import { shanghaiDate } from "./ledger.ts";

export type DeskAction =
  | { type: "hydrate"; state: DeskState }
  | { type: "draft"; patch: Partial<Draft>; at?: string }
  | { type: "plan"; patch: Partial<Plan>; at?: string }
  | { type: "preset"; id: string; at?: string }
  | { type: "rule"; id: string }
  | { type: "q5"; value: number }
  | { type: "auto" }
  | { type: "session"; broker: BrokerId }
  | { type: "flash"; text: string }
  | { type: "commit"; item: LedgerItem; flash: string }
  | { type: "submit"; id: string; at: string }
  | { type: "deliver"; id: string; ticket: string; at?: string }
  | { type: "requeue"; id: string }
  | { type: "confirm"; id: string; at?: string }
  | { type: "preset-risk"; id: RulePresetId }
  | { type: "capital"; value: number | null }
  | { type: "fx"; ccy: Ccy; rate: number | null; asOf: string }
  | { type: "position-patch"; id: string; patch: Partial<Position> }
  | { type: "fee"; id: string; value: number | null }
  | { type: "window-add"; window: CalendarWindow }
  | { type: "window-remove"; id: string }
  | { type: "mark-save"; mark: DailyMark }
  | { type: "mark-remove"; date: string; strategy?: DailyMark["strategy"] }
  | { type: "violation"; violation: ViolationRecord }
  | { type: "regime-reset"; id: RulePresetId; at: string }
  | { type: "reset"; at?: string };

function patchDraft(draft: Draft, patch: Partial<Draft>, at: string): Draft {
  const next = { ...draft, ...patch };
  if (patch.plan) next.plan = { ...draft.plan, ...patch.plan };
  const identityChanged = (["broker", "market", "symbol", "asset"] as const).some(
    (key) => patch[key] !== undefined && patch[key] !== draft[key],
  );
  const newRiskIntent = patch.intent !== undefined && patch.intent !== draft.intent &&
    (patch.intent === "open" || patch.intent === "add" || patch.intent === "t0");
  if (identityChanged) next.positionId = null;
  if (identityChanged || newRiskIntent) {
    next.plan = { ...next.plan, id: `PLAN-${crypto.randomUUID().toUpperCase()}`, createdAt: at };
  }
  return next;
}

function recordContract(state: DeskState, draft: Draft, recordedAt: string): DeskState["contracts"] {
  if (!draft.plan.id) return state.contracts;
  return { ...state.contracts, [draft.plan.id]: { draft: structuredClone(draft), recordedAt } };
}

function settlementMismatch(state: DeskState, item: LedgerItem): string | null {
  if (item.intent !== "close" && item.intent !== "reduce") return null;
  const position = findPosition(state.positions, item);
  if (!position) return `${item.symbol} 当前仓位已不存在，这笔旧委托不能重复记账。`;
  if (item.strategy && position.strategy && item.strategy !== position.strategy) {
    return `${item.symbol} 的策略身份已变化，请核对后再确认。`;
  }
  if (item.intent === "close" && Math.abs(position.qty - item.qty) > 1e-9) {
    return `${item.symbol} 当前剩 ${position.qty}，旧平仓单数量为 ${item.qty}，请重新生成平仓草案。`;
  }
  if (item.intent === "reduce" && item.qty > position.qty + 1e-9) {
    return `${item.symbol} 当前只剩 ${position.qty}，旧减仓单数量为 ${item.qty}，请重新生成减仓草案。`;
  }
  return null;
}

function createSubmission(state: DeskState, id: string, at: string): { item: LedgerItem; flash: string } | null {
  const v = evaluateWithPreset(state.draft, state, new Date(at));
  if (v.decision === "review") return null;
  const d = state.draft;
  const linked = state.sessions[d.broker];
  const position = findPosition(state.positions, d);
  const feeBudget = Number(d.plan.feeBudget);
  const invalidation = Number(d.plan.invalidation);
  const item: LedgerItem = {
    id,
    at,
    decision: v.decision,
    status: v.decision === "block" ? "blocked" : linked ? "queued" : "parked",
    confirmed: false,
    confirmedAt: null,
    broker: d.broker,
    market: d.market,
    symbol: v.symbol,
    name: d.name.trim() || v.symbol,
    asset: d.asset,
    side: d.side,
    intent: d.intent,
    qty: v.qty,
    price: v.price,
    currency: v.currency,
    notionalCny: v.orderNotionalCny,
    hold: v.hold,
    pivotPrice: Number(d.pivotPrice) || 0,
    pivotNote: d.pivotNote.trim(),
    positionId: position?.id ?? (d.intent === "open" || d.intent === "add" ? `p-${id}` : null),
    planId: d.plan.id ?? null,
    planCreatedAt: d.plan.createdAt ?? null,
    strategy: d.plan.strategy ?? null,
    correlationGroup: canonicalGroup(d.plan.correlationGroup) || null,
    setup: d.plan.setup ?? "standard",
    marketStage: d.plan.marketStage ?? "unknown",
    feeBudget: d.plan.feeBudget?.trim() && Number.isFinite(feeBudget) ? feeBudget : null,
    actualFee: null,
    invalidation: Number.isFinite(invalidation) && invalidation > 0 ? invalidation : null,
    plannedRiskCny: v.risk.riskCny,
    plannedRiskR: v.risk.riskR,
    fxRate: state.settings.fx[v.currency].rate,
    fxAsOf: state.settings.fx[v.currency].asOf || null,
    stamp: v.primary?.title ?? "无戳记",
    hits: v.hits.map(({ ruleId, title, severity, clause }) => ({ ruleId, title, severity, clause })),
  };
  const flash = item.status === "blocked"
    ? `已拦截 · ${item.stamp}`
    : item.status === "parked"
      ? "章过了。通道没挂上，信封停在待挂起。还没送到券商。"
      : "信封已记下，尚未送出。请到券商 App 里手工下单。";
  return { item, flash };
}

function reduce(state: DeskState, action: DeskAction): DeskState {
  switch (action.type) {
    case "draft": {
      const draft = patchDraft(state.draft, action.patch, action.at ?? new Date().toISOString());
      return { ...state, draft, contracts: recordContract(state, draft, action.at ?? new Date().toISOString()) };
    }
    case "plan": {
      const draft = { ...state.draft, plan: { ...state.draft.plan, ...action.patch } };
      return { ...state, draft, contracts: recordContract(state, draft, action.at ?? new Date().toISOString()) };
    }
    case "preset": {
      const preset = PRESETS.find((p) => p.id === action.id);
      if (!preset) return state;
      const at = action.at ?? new Date().toISOString();
      const draft = structuredClone(preset.draft);
      draft.plan = { ...draft.plan, id: `PLAN-${crypto.randomUUID().toUpperCase()}`, createdAt: at };
      return { ...state, draft, contracts: recordContract(state, draft, at) };
    }
    case "rule":
      return {
        ...state,
        settings: {
          ...state.settings,
          rules: { ...state.settings.rules, [action.id]: state.settings.rules[action.id] === false },
        },
      };
    case "q5":
      return { ...state, settings: { ...state.settings, q5Cny: action.value } };
    case "auto":
      return { ...state, settings: { ...state.settings, autoConfirm: !state.settings.autoConfirm } };
    case "session":
      return { ...state, sessions: { ...state.sessions, [action.broker]: !state.sessions[action.broker] } };
    case "flash":
      return { ...state, flash: action.text };
    case "commit":
      return { ...state, ledger: [action.item, ...state.ledger], flash: action.flash };
    case "submit": {
      const submitted = createSubmission(state, action.id, action.at);
      if (!submitted) return { ...state, flash: "复盘没写完，不能记入转发簿。" };
      return {
        ...state,
        ledger: [submitted.item, ...state.ledger],
        contracts: recordContract(state, state.draft, action.at),
        flash: submitted.flash,
      };
    }
    case "deliver": {
      const item = state.ledger.find((row) => row.id === action.id);
      if (!item || item.status !== "queued") return state;
      const app = item.broker === "gf" ? "易淘金" : item.broker === "ht" ? "涨乐全球通" : "牛牛";
      if (!state.sessions[item.broker]) {
        return {
          ...state,
          ledger: state.ledger.map((row) => (row === item ? { ...row, status: "parked" } : row)),
          flash: `${item.symbol} 闸已过，${app}会话掉线，改停在待挂起。`,
        };
      }
      const mismatch = settlementMismatch(state, item);
      const confirmed = state.settings.autoConfirm && !mismatch;
      const delivered: LedgerItem = {
        ...item,
        status: "delivered",
        ticket: action.ticket,
        confirmed,
        confirmedAt: confirmed ? action.at ?? item.at : null,
      };
      const settled = confirmed
        ? settle(state.positions, state.closes, delivered, shanghaiDate(new Date(action.at ?? item.at)))
        : { positions: state.positions, closes: state.closes };
      return {
        ...state,
        ledger: state.ledger.map((row) => (row === item ? delivered : row)),
        positions: settled.positions,
        closes: settled.closes,
        flash: mismatch ?? (confirmed
          ? `信封已记入转发簿。请到${app}里手工下单。`
          : `信封已记下。你在这里确认后，底稿才变。券商里还要自己下。`),
      };
    }
    case "requeue": {
      const item = state.ledger.find((row) => row.id === action.id);
      if (!item || item.status !== "parked") return state;
      return {
        ...state,
        ledger: state.ledger.map((row) => (row === item ? { ...row, status: "queued", confirmed: false, confirmedAt: null, ticket: undefined } : row)),
        flash: "这封信封重新排队。还没送到券商。",
      };
    }
    case "confirm": {
      const item = state.ledger.find((row) => row.id === action.id);
      if (!item || item.status !== "delivered" || item.confirmed || item.decision !== "pass") return state;
      const mismatch = settlementMismatch(state, item);
      if (mismatch) return { ...state, flash: mismatch };
      const next = { ...item, confirmed: true, confirmedAt: action.at ?? new Date().toISOString() };
      const settled = settle(state.positions, state.closes, next, shanghaiDate(new Date(action.at ?? item.at)));
      return {
        ...state,
        ledger: state.ledger.map((row) => (row === item ? next : row)),
        positions: settled.positions,
        closes: settled.closes,
        flash: "底稿已按确认更新。券商里的成交以你手工下的那笔为准。",
      };
    }
    case "preset-risk":
      return { ...state, settings: { ...state.settings, presetId: action.id } };
    case "capital":
      return { ...state, settings: { ...state.settings, netAssetCny: action.value } };
    case "fx":
      return {
        ...state,
        settings: {
          ...state.settings,
          fx: { ...state.settings.fx, [action.ccy]: { rate: action.rate, asOf: action.asOf } },
        },
      };
    case "position-patch": {
      const position = state.positions.find((row) => row.id === action.id);
      if (!position) return state;
      const patch = position.strategy && action.patch.strategy && position.strategy !== action.patch.strategy
        ? { ...action.patch, strategy: position.strategy }
        : action.patch;
      return { ...state, positions: state.positions.map((row) => (row === position ? { ...row, ...patch } : row)) };
    }
    case "fee": {
      const item = state.ledger.find((row) => row.id === action.id);
      if (!item) return state;
      return {
        ...state,
        ledger: state.ledger.map((row) => (row === item ? { ...row, actualFee: action.value } : row)),
        positions: state.positions.map((row) => (row.id === item.positionId || (item.planId && row.planId === item.planId) ? { ...row, actualFee: action.value } : row)),
        closes: state.closes.map((row) => {
          if (item.planId && row.planId) return row.planId === item.planId ? { ...row, actualFee: action.value } : row;
          return row.id === `c-${item.id}` && row.planId === item.planId ? { ...row, actualFee: action.value } : row;
        }),
      };
    }
    case "regime-reset": {
      const regime = state.settings.regimes[action.id];
      return {
        ...state,
        settings: {
          ...state.settings,
          regimes: {
            ...state.settings.regimes,
            [action.id]: {
              startedAt: action.at,
              violations: [],
              history: [...(regime.history ?? []), { startedAt: regime.startedAt, endedAt: action.at, violations: regime.violations }],
            },
          },
        },
      };
    }
    case "window-add":
      if (state.settings.calendarWindows.some((window) => window.id === action.window.id)) return state;
      return { ...state, settings: { ...state.settings, calendarWindows: [action.window, ...state.settings.calendarWindows] } };
    case "window-remove":
      return { ...state, settings: { ...state.settings, calendarWindows: state.settings.calendarWindows.filter((window) => window.id !== action.id) } };
    case "mark-save": {
      const strategy = action.mark.strategy ?? null;
      const without = state.settings.dailyMarks.filter((mark) => mark.date !== action.mark.date || (mark.strategy ?? null) !== strategy);
      return { ...state, settings: { ...state.settings, dailyMarks: [...without, action.mark] } };
    }
    case "mark-remove": {
      const strategy = action.strategy ?? null;
      return { ...state, settings: { ...state.settings, dailyMarks: state.settings.dailyMarks.filter((mark) => mark.date !== action.date || (mark.strategy ?? null) !== strategy) } };
    }
    case "violation": {
      const presetId = state.settings.presetId;
      const regime = state.settings.regimes[presetId];
      return {
        ...state,
        settings: {
          ...state.settings,
          regimes: { ...state.settings.regimes, [presetId]: { ...regime, violations: [...regime.violations, action.violation] } },
        },
      };
    }
    case "reset": {
      const at = action.at ?? new Date().toISOString();
      const seed = makeSeed();
      const draft = { ...seed.draft, plan: { ...seed.draft.plan, id: `PLAN-${crypto.randomUUID().toUpperCase()}`, createdAt: at } };
      return { ...seed, draft, contracts: recordContract(seed, draft, at), flash: "已恢复审计样本镜像。" };
    }
    default:
      return state;
  }
}

export function deskReducer(state: DeskState, action: DeskAction): DeskState {
  if (action.type === "hydrate") return { ...action.state, flash: "" };
  const next = reduce(state, action);
  return next === state ? state : { ...next, revision: state.revision + 1 };
}

function normalizeRisk<T extends RiskMetadata>(row: T): T {
  return {
    ...row,
    strategy: row.strategy ?? null,
    correlationGroup: row.correlationGroup ?? null,
    planId: row.planId ?? null,
    planCreatedAt: row.planCreatedAt ?? null,
    setup: row.setup ?? "standard",
    marketStage: row.marketStage ?? "unknown",
    plannedRiskCny: row.plannedRiskCny ?? null,
    plannedRiskR: row.plannedRiskR ?? null,
    feeBudget: row.feeBudget ?? null,
    actualFee: row.actualFee ?? null,
    fxRate: row.fxRate ?? null,
    fxAsOf: row.fxAsOf ?? null,
    invalidation: row.invalidation ?? null,
  };
}

function dedupeIds<T extends { id: string }>(rows: T[]): T[] {
  const used = new Set<string>();
  return rows.map((row) => {
    let id = row.id;
    let suffix = 2;
    while (used.has(id)) {
      id = `${row.id}-DUP${suffix}`;
      suffix += 1;
    }
    used.add(id);
    return id === row.id ? row : { ...row, id };
  });
}

export function migrateDeskState(raw: unknown, now = new Date().toISOString()): DeskState | null {
  if (!raw || typeof raw !== "object") return null;
  const source = structuredClone(raw) as DeskState;
  if ((source.version !== 2 && source.version !== 3) || !source.draft?.plan || !source.settings) return null;
  if (!Array.isArray(source.positions) || !Array.isArray(source.ledger) || !Array.isArray(source.closes)) return null;
  if (!source.sessions || typeof source.settings.rules !== "object" || source.settings.rules === null) return null;
  if (!Number.isFinite(Number(source.settings.q5Cny))) return null;

  const defaults = riskDefaults(now);
  const fx = Object.fromEntries((["CNY", "HKD", "USD"] as Ccy[]).map((ccy) => {
    const snapshot = source.settings.fx?.[ccy];
    if (!snapshot) return [ccy, defaults.fx[ccy]];
    const rate = Number(snapshot.rate);
    return [ccy, {
      rate: snapshot?.rate === null || !Number.isFinite(rate) || rate <= 0 ? null : rate,
      asOf: typeof snapshot?.asOf === "string" ? snapshot.asOf : defaults.fx[ccy].asOf,
    }];
  })) as DeskState["settings"]["fx"];
  const settings: DeskState["settings"] = {
    ...defaults,
    ...source.settings,
    q5Cny: Number(source.settings.q5Cny),
    netAssetCny: Number.isFinite(Number(source.settings.netAssetCny)) && Number(source.settings.netAssetCny) > 0
      ? Number(source.settings.netAssetCny)
      : null,
    fx,
    regimes: {
      "conservative-90": {
        startedAt: source.settings.regimes?.["conservative-90"]?.startedAt ?? now,
        violations: source.settings.regimes?.["conservative-90"]?.violations ?? [],
        history: source.settings.regimes?.["conservative-90"]?.history ?? [],
      },
      "acceptance-20": {
        startedAt: source.settings.regimes?.["acceptance-20"]?.startedAt ?? now,
        violations: source.settings.regimes?.["acceptance-20"]?.violations ?? [],
        history: source.settings.regimes?.["acceptance-20"]?.history ?? [],
      },
    },
    calendarWindows: source.settings.calendarWindows ?? [],
    dailyMarks: source.settings.dailyMarks ?? [],
  };
  const plan = { ...emptyPlan(), ...source.draft.plan };
  if (!source.draft.plan.createdAt) plan.createdAt = now;
  const draft: Draft = {
    ...source.draft,
    positionId: source.draft.positionId ?? null,
    pivotPrice: typeof source.draft.pivotPrice === "string" ? source.draft.pivotPrice : "",
    pivotNote: typeof source.draft.pivotNote === "string" ? source.draft.pivotNote : "",
    pivotState: source.draft.pivotState === "gone" ? "gone" : "holds",
    plan,
  };
  const positions = dedupeIds(source.positions.map((position) => ({
    ...normalizeRisk(position),
    pivotPrice: Number(position.pivotPrice) || 0,
    pivotNote: typeof position.pivotNote === "string" ? position.pivotNote : "",
    currentPrice: position.currentPrice ?? null,
    priceAt: position.priceAt ?? null,
    invalidation: position.invalidation ?? (Number(position.pivotPrice) || null),
  })));
  const ledger = dedupeIds(source.ledger.map((row) => ({
    ...normalizeRisk(row),
    positionId: row.positionId ?? null,
    confirmedAt: row.confirmedAt ?? null,
  })));
  const closes = dedupeIds(source.closes.map((row) => ({
    ...normalizeRisk(row),
    closedAtTime: row.closedAtTime ?? null,
  })));
  return {
    ...source,
    version: 3,
    revision: Number.isFinite(Number(source.revision)) ? Number(source.revision) : 0,
    mutationId: typeof source.mutationId === "string" ? source.mutationId : "",
    contracts: source.contracts ?? {},
    positions,
    closes,
    ledger,
    settings,
    draft,
    flash: typeof source.flash === "string" ? source.flash : "",
  };
}
