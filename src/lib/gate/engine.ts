/** 支点交易。支点是一句逻辑：写下，验证它还在不在，崩了才退出。军规在这之后。 */

export const DESK_DATE = "2026-10-21";

export const FX = { CNY: 1, HKD: 0.92, USD: 7.12 } as const;

export type BrokerId = "gf" | "ht" | "futu";
export type Market = "A" | "HK" | "US";
export type Asset = "stock" | "etf" | "option" | "bond";
export type Side = "buy" | "sell";
export type Intent = "open" | "add" | "reduce" | "close" | "t0";
export type Tag = "none" | "intraday" | "average" | "chase" | "credit";
export type Ccy = keyof typeof FX;
export type Decision = "pass" | "block" | "review";
export type Severity = "block" | "review" | "info";
export type GateKind = "KEEP" | "KILL" | "WATCH" | "EXIT" | "SEQ";

export interface Plan {
  invalidation: string;
  maxNotional: string;
  maxDays: string;
  thesis: string;
  approved: boolean;
}

export type PivotState = "holds" | "gone";

export interface Draft {
  broker: BrokerId;
  market: Market;
  symbol: string;
  name: string;
  asset: Asset;
  side: Side;
  intent: Intent;
  qty: string;
  price: string;
  holdDays: number;
  tag: Tag;
  plan: Plan;
  optionExit: string;
  optionMaxLoss: string;
  reviewNote: string;
  pivotPrice: string;
  pivotNote: string;
  pivotState: PivotState;
}

export interface Position {
  id: string;
  broker: BrokerId;
  market: Market;
  symbol: string;
  name: string;
  asset: Asset;
  qty: number;
  price: number;
  openedAt: string;
  pivotPrice: number;
  pivotNote: string;
}

export interface CloseRecord {
  id: string;
  broker: BrokerId;
  market: Market;
  symbol: string;
  name: string;
  closedAt: string;
  pnlCny: number;
  notionalCny: number;
}

export interface Settings {
  q5Cny: number;
  autoConfirm: boolean;
  rules: Record<string, boolean>;
}

export interface Hit {
  ruleId: string;
  severity: Severity;
  gate: GateKind;
  title: string;
  detail: string;
  clause: string;
}

export interface Verdict {
  decision: Decision;
  hits: Hit[];
  primary: Hit | null;
  orderNotionalCny: number;
  exposureCny: number;
  hold: number;
  currency: Ccy;
  qty: number;
  price: number;
  symbol: string;
}

export interface LedgerItem {
  id: string;
  at: string;
  decision: Decision;
  status: "blocked" | "parked" | "queued" | "delivered";
  confirmed: boolean;
  broker: BrokerId;
  market: Market;
  symbol: string;
  name: string;
  asset: Asset;
  side: Side;
  intent: Intent;
  qty: number;
  price: number;
  currency: Ccy;
  notionalCny: number;
  hold: number;
  pivotPrice: number;
  pivotNote: string;
  stamp: string;
  ticket?: string;
  hits: Pick<Hit, "ruleId" | "title" | "severity" | "clause">[];
}

export interface DeskState {
  version: 2;
  positions: Position[];
  closes: CloseRecord[];
  ledger: LedgerItem[];
  settings: Settings;
  sessions: Record<BrokerId, boolean>;
  draft: Draft;
  flash: string;
}

export const BROKER: Record<BrokerId, { name: string; app: string; short: string; prefix: string }> = {
  gf: { name: "广发证券", app: "易淘金", short: "广发", prefix: "GF" },
  ht: { name: "华泰证券", app: "涨乐全球通", short: "华泰", prefix: "HT" },
  futu: { name: "富途证券", app: "牛牛", short: "富途", prefix: "FT" },
};

export const TOGGLE_IDS = [
  "us-q5",
  "us-4-30",
  "ht-overnight",
  "hk-31",
  "revenge",
  "a-31",
  "a-day4",
  "option-d4",
  "us-1-3",
  "avg-plan",
  "credit-on",
  "t0-lane",
] as const;

export interface RuleMeta {
  id: string;
  gate: "KEEP" | "KILL" | "WATCH";
  level: string;
  title: string;
  clause: string;
  history: string;
  ci: string;
  toggle: boolean;
}

export const RULE_CATALOG: RuleMeta[] = [
  {
    id: "us-0",
    gate: "KEEP",
    level: "硬供血",
    title: "美股当日必平",
    clause: "mkt==US & hold≤0 & 正股",
    history: "+13.97万 · 1,729 笔",
    ci: "月块 [+3.6万, +25.4万]。2021–22 为负，不是永动机。",
    toggle: false,
  },
  {
    id: "a-le3",
    gate: "KEEP",
    level: "硬供血",
    title: "A 股 ≤3 天",
    clause: "mkt==A & hold≤3",
    history: "+10.40万 · 176 笔",
    ci: "月块 [+5.8万, +15.4万]。第 4 天强制复盘。",
    toggle: false,
  },
  {
    id: "futu-us",
    gate: "KEEP",
    level: "账户",
    title: "富途美股优先",
    clause: "broker==futu & mkt==US",
    history: "账户层 +13.99万",
    ci: "与日内重叠，禁止和日内盈亏加总。追涨与回本不加免责。",
    toggle: false,
  },
  {
    id: "us-1-3",
    gate: "KEEP",
    level: "软",
    title: "美股 1–3 日须有计划",
    clause: "US & 1≤hold≤3 & 错误价+上限+天数+一句话",
    history: "1–3 日桶 +7.22万",
    ci: "无预写错误价的短持，不进供血口袋。",
    toggle: true,
  },
  {
    id: "avg-plan",
    gate: "KEEP",
    level: "软",
    title: "摊平必须预写错误价",
    clause: "tag==摊平 & 错误价+上限+天数+一句话",
    history: "有计划摊平 +8.97万",
    ci: "月块跨零。回本加码不是摊平。",
    toggle: true,
  },
  {
    id: "us-q5",
    gate: "KILL",
    level: "硬",
    title: "隔夜名义不得进 Q5",
    clause: "US & hold>0 & 敞口≥上限",
    history: "−16.94万 · 165 笔",
    ci: "月块 [−32.4万, −3.6万]，样本里最硬的一条。无豁免。",
    toggle: true,
  },
  {
    id: "us-4-30",
    gate: "KILL",
    level: "硬默认",
    title: "美股 4–30 天",
    clause: "US & 4≤hold≤30 & 正股",
    history: "−13.96万 · 268 笔",
    ci: "月块跨到小幅正值。硬默认，不是 CI 钉死。例外要计划书+限额审批。",
    toggle: true,
  },
  {
    id: "ht-overnight",
    gate: "KILL",
    level: "硬默认",
    title: "华泰美股禁止过夜",
    clause: "broker==ht & US & hold>0",
    history: "非日内 −10.03万",
    ci: "含期权。不要推广成「所有美股过夜都违规」。日内留下。",
    toggle: true,
  },
  {
    id: "hk-31",
    gate: "KILL",
    level: "硬",
    title: "港股持仓满 31 天",
    clause: "HK & hold≥31",
    history: "−6.60万 · 17 笔",
    ci: "月块 [−11.5万, −2.2万]。勿误杀 09988 短腿，也别停掉全部中概。",
    toggle: true,
  },
  {
    id: "revenge",
    gate: "KILL",
    level: "冷静期",
    title: "亏后 3 日禁止放大名义",
    clause: "亏平≤3日 & 新开名义更高",
    history: "−6.64万 · 370 笔，胜率仍 58%",
    ci: "月块跨零。金额杀伤可讲，不要说 CI 已证明期望为负。",
    toggle: true,
  },
  {
    id: "a-31",
    gate: "WATCH",
    level: "软默认",
    title: "A 股满 31 天禁止加仓",
    clause: "A & hold≥31",
    history: "−6.32万 · 88 笔",
    ci: "月块很宽，2025 年有异号。默认减，不升成港股同级硬闸。",
    toggle: true,
  },
  {
    id: "a-day4",
    gate: "WATCH",
    level: "复盘",
    title: "A 股第 4 天强制复盘",
    clause: "A & 4≤hold≤30",
    history: "短持供血，拉长就反号",
    ci: "未写复盘不能加仓。减仓与平仓放行。",
    toggle: true,
  },
  {
    id: "option-d4",
    gate: "WATCH",
    level: "监测",
    title: "期权 D+4 强制复盘",
    clause: "option & hold≥4",
    history: "4–7 日桶 −5.14万 · 48 笔",
    ci: "尚无 bootstrap。先做复盘窗，不升硬闸。",
    toggle: true,
  },
  {
    id: "credit-on",
    gate: "KILL",
    level: "硬",
    title: "信用仓不得过夜",
    clause: "tag==信用 & hold>0",
    history: "信用平仓样本为负",
    ci: "低确定性上的杠杆。日内信用不拦。",
    toggle: true,
  },
  {
    id: "t0-lane",
    gate: "WATCH",
    level: "分账",
    title: "广发 T0 单独看板",
    clause: "gf & A & ETF & intent==T0",
    history: "T0 roundtrip +8.72万",
    ci: "禁止与平仓盈亏加总。别的券商、别的品种不走这条。",
    toggle: true,
  },
];

export const IMPACT: { label: string; pnl: number; kind: "keep" | "kill" | "watch" }[] = [
  { label: "美股日内", pnl: 139694, kind: "keep" },
  { label: "富途美股", pnl: 139872, kind: "keep" },
  { label: "A股 ≤3天", pnl: 103973, kind: "keep" },
  { label: "有计划摊平", pnl: 89672, kind: "keep" },
  { label: "A股 ≥31", pnl: -63217, kind: "watch" },
  { label: "报复加仓", pnl: -66410, kind: "kill" },
  { label: "港股 ≥31", pnl: -65992, kind: "kill" },
  { label: "华泰过夜", pnl: -100253, kind: "kill" },
  { label: "美股 4–30天", pnl: -139558, kind: "kill" },
  { label: "非日内 × Q5", pnl: -169350, kind: "kill" },
];

export function emptyPlan(): Plan {
  return { invalidation: "", maxNotional: "", maxDays: "", thesis: "", approved: false };
}

export function defaultRules(): Record<string, boolean> {
  return Object.fromEntries(TOGGLE_IDS.map((id) => [id, true]));
}

const RANK: Record<string, number> = {
  incomplete: 0,
  "pivot-miss": 0,
  "pivot-diff": 0,
  "pivot-drift": 0,
  "pivot-none": 0,
  "pivot-live": 0,
  "pivot-dead": 0,
  side: 1,
  "no-pos": 2,
  "over-qty": 3,
  "close-qty": 3,
  "us-q5": 4,
  "ht-overnight": 5,
  "us-4-30": 6,
  "hk-31": 7,
  revenge: 8,
  "a-31": 9,
  "credit-on": 10,
  "avg-plan": 11,
  "us-1-3": 12,
  "t0-lane": 13,
  "a-day4": 14,
  "option-d4": 15,
};

export function ccyOf(market: Market): Ccy {
  if (market === "HK") return "HKD";
  if (market === "US") return "USD";
  return "CNY";
}

export function normSymbol(market: Market, symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (market === "HK" && /^\d+$/.test(s)) return s.padStart(5, "0");
  return s;
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86400000);
}

export function holdOf(pos: Position, today = DESK_DATE): number {
  const d = daysBetween(pos.openedAt, today);
  return Number.isFinite(d) ? Math.max(0, d) : 0;
}

export function multiplier(asset: Asset): number {
  return asset === "option" ? 100 : 1;
}

export function notionalCny(qty: number, price: number, market: Market, asset: Asset): number {
  return qty * price * multiplier(asset) * FX[ccyOf(market)];
}

export function positionNotional(pos: Position): number {
  return notionalCny(pos.qty, pos.price, pos.market, pos.asset);
}

export function findPosition(positions: Position[], draft: Pick<Draft, "broker" | "market" | "symbol" | "asset">): Position | undefined {
  const sym = normSymbol(draft.market, draft.symbol);
  return positions.find(
    (p) => p.broker === draft.broker && p.market === draft.market && p.asset === draft.asset && normSymbol(p.market, p.symbol) === sym,
  );
}

export function formatCny(n: number, signed = false): string {
  const neg = n < 0;
  const abs = Math.abs(n);
  const body = abs >= 10000 ? `${(abs / 10000).toFixed(abs >= 1000000 ? 1 : 2)}万` : Math.round(abs).toLocaleString("zh-CN");
  if (signed) {
    if (n > 0) return `+${body}`;
    if (n < 0) return `−${body}`;
    return "0";
  }
  return neg ? `−${body}` : body;
}

export function formatQty(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("zh-CN") : n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

export function holdLabel(n: number): string {
  if (n <= 0) return "当日";
  if (n >= 31) return `${n}日`;
  return `${n}日`;
}

export function intentLabel(intent: Intent): string {
  if (intent === "open") return "开仓";
  if (intent === "add") return "加仓";
  if (intent === "reduce") return "减仓";
  if (intent === "close") return "平仓";
  return "T0";
}

export function sideLabel(side: Side): string {
  return side === "buy" ? "买入" : "卖出";
}

export function assetLabel(asset: Asset): string {
  if (asset === "stock") return "正股";
  if (asset === "etf") return "ETF";
  if (asset === "option") return "期权";
  return "转债";
}

export function formatAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export type Tone = "moss" | "cinnabar" | "brass" | "dim";

export function classify(pos: Position, today = DESK_DATE): { label: string; tone: Tone } {
  const hold = holdOf(pos, today);
  if (pos.broker === "ht" && pos.market === "US" && hold > 0) return { label: "出血 · 华泰过夜", tone: "cinnabar" };
  if (pos.market === "US" && pos.asset !== "option" && hold >= 4 && hold <= 30) return { label: "出血 · 4–30日", tone: "cinnabar" };
  if (pos.market === "HK" && hold >= 31) return { label: "出血 · 港股长持", tone: "cinnabar" };
  if (pos.asset === "option" && hold >= 4) return { label: "监测 · 期权", tone: "brass" };
  if (pos.market === "A" && hold >= 31) return { label: "监测 · A股长持", tone: "brass" };
  if (pos.market === "US" && pos.asset !== "option" && hold === 0) return { label: "供血 · 日内", tone: "moss" };
  if (pos.market === "A" && hold <= 3) return { label: "供血 · 短持", tone: "moss" };
  if (pos.market === "HK" && normSymbol("HK", pos.symbol) === "09988" && hold <= 30) return { label: "短腿 · 09988", tone: "moss" };
  if (pos.market === "HK" && hold <= 30) return { label: "港股短炒", tone: "moss" };
  if (pos.market === "US" && hold > 0 && hold <= 3) return { label: "短持 · 1–3日", tone: "brass" };
  return { label: "观察", tone: "dim" };
}

function on(settings: Settings, id: string): boolean {
  return settings.rules[id] !== false;
}

function planBits(draft: Draft) {
  return {
    invalidation: Number(draft.plan.invalidation),
    cap: Number(draft.plan.maxNotional),
    maxDays: Number(draft.plan.maxDays),
    thesis: draft.plan.thesis.trim(),
  };
}

function shortPlanOk(draft: Draft, orderNotional: number, hold: number): boolean {
  const p = planBits(draft);
  return p.invalidation > 0 && p.cap >= orderNotional && p.maxDays >= hold && p.thesis.length >= 4;
}

function logicOf(note: string): string | null {
  const text = note.trim();
  return text.length >= 4 ? text : null;
}

function pivotHits(draft: Draft, pos: Position | undefined): Hit[] {
  const written = logicOf(draft.pivotNote);
  if (!written) {
    return [hit({
      ruleId: "pivot-miss",
      severity: "block",
      gate: "SEQ",
      title: "还没有逻辑支点",
      detail: "支点是一句投资逻辑，不是一个价格。先写下为什么买，至少四个字。",
      clause: "pivot note",
    })];
  }
  const reducing = draft.intent === "reduce" || draft.intent === "close";
  const adding = draft.intent === "open" || draft.intent === "add" || draft.intent === "t0";
  if (!pos) {
    if (!adding) return [];
    return [hit({
      ruleId: "pivot-write",
      severity: "info",
      gate: "SEQ",
      title: "逻辑支点已写下",
      detail: `「${written}」。之后只验证这一句还在不在。它崩了才退出，盈亏不论。`,
      clause: "open writes logic",
    })];
  }
  const stored = logicOf(pos.pivotNote);
  if (!stored) {
    return [hit({
      ruleId: "pivot-none",
      severity: "block",
      gate: "SEQ",
      title: "这张仓没有逻辑支点",
      detail: "没有事先写下的逻辑，不能另起一个故事来加仓或退出。",
      clause: "pos.pivot exists",
    })];
  }
  if (written !== stored) {
    return [hit({
      ruleId: "pivot-drift",
      severity: "block",
      gate: "SEQ",
      title: reducing ? "退出理由换了" : "逻辑换了还在加",
      detail: reducing
        ? `当初是「${stored}」。退出只因为这一句崩了，不能改成「${written}」。`
        : `当初是「${stored}」。改成「${written}」还继续加，这是把逻辑推翻了。`,
      clause: "note == stored logic",
    })];
  }
  if (reducing) {
    if (draft.pivotState !== "gone") {
      return [hit({
        ruleId: "pivot-live",
        severity: "block",
        gate: "SEQ",
        title: "支点还在，先别走",
        detail: `「${stored}」还成立。退出只发生在它崩了之后。赚了亏了都不是理由。`,
        clause: "exit requires collapse",
      })];
    }
    return [hit({
      ruleId: "pivot-gone",
      severity: "info",
      gate: "SEQ",
      title: "支点崩了，退出",
      detail: `「${stored}」已经不成立。止盈和止损是同一件事。`,
      clause: "exit on collapse",
    })];
  }
  if (draft.pivotState === "gone") {
    return [hit({
      ruleId: "pivot-dead",
      severity: "block",
      gate: "SEQ",
      title: "支点没了，不能再加",
      detail: `「${stored}」已经崩了。该退出，而不是加仓。`,
      clause: "add requires living pivot",
    })];
  }
  return [hit({
    ruleId: "pivot-hold",
    severity: "info",
    gate: "SEQ",
    title: "支点还在",
    detail: `「${stored}」。沿用这一句，不另起故事。`,
    clause: "logic still holds",
  })];
}

function exceptionOk(draft: Draft, orderNotional: number, hold: number): boolean {
  const p = planBits(draft);
  return shortPlanOk(draft, orderNotional, hold) && draft.plan.approved && p.maxDays <= 30;
}

function hit(partial: Hit): Hit {
  return partial;
}

function sortHits(hits: Hit[]): Hit[] {
  const sev = (s: Severity) => (s === "block" ? 0 : s === "review" ? 1 : 2);
  return [...hits].sort((a, b) => sev(a.severity) - sev(b.severity) || (RANK[a.ruleId] ?? 50) - (RANK[b.ruleId] ?? 50));
}

function decide(hits: Hit[]): Decision {
  if (hits.some((h) => h.severity === "block")) return "block";
  if (hits.some((h) => h.severity === "review")) return "review";
  return "pass";
}

function primaryOf(hits: Hit[], decision: Decision): Hit | null {
  if (decision === "block") return hits.find((h) => h.severity === "block") ?? null;
  if (decision === "review") return hits.find((h) => h.severity === "review") ?? null;
  return hits.find((h) => h.gate === "KEEP") ?? hits[0] ?? null;
}

function emptyVerdict(draft: Draft): Verdict {
  return {
    decision: "block",
    hits: [],
    primary: null,
    orderNotionalCny: 0,
    exposureCny: 0,
    hold: draft.holdDays,
    currency: ccyOf(draft.market),
    qty: 0,
    price: 0,
    symbol: normSymbol(draft.market, draft.symbol),
  };
}

export function evaluate(draft: Draft, state: Pick<DeskState, "positions" | "closes" | "settings">, today = DESK_DATE): Verdict {
  const symbol = normSymbol(draft.market, draft.symbol);
  const qty = Number(draft.qty);
  const price = Number(draft.price);
  const base = emptyVerdict(draft);
  base.symbol = symbol;
  if (!symbol || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
    const h = hit({
      ruleId: "incomplete",
      severity: "block",
      gate: "EXIT",
      title: "委托不完整",
      detail: "代码、数量、价格都要是正数，闸门才受理。",
      clause: "qty>0 & price>0 & symbol",
    });
    return { ...base, hits: [h], primary: h };
  }

  const pos = findPosition(state.positions, draft);
  const orderNotional = notionalCny(qty, price, draft.market, draft.asset);
  const t0Lane = draft.intent === "t0" && draft.broker === "gf" && draft.market === "A" && draft.asset === "etf";
  const opening = draft.intent === "open" || draft.intent === "add" || draft.intent === "t0";
  const addsRisk = draft.intent === "open" || draft.intent === "add" || (draft.intent === "t0" && !t0Lane);
  const exposure = addsRisk ? (pos ? positionNotional(pos) : 0) + orderNotional : orderNotional;
  let hold = pos ? holdOf(pos, today) : draft.holdDays;
  if (t0Lane) hold = 0;

  const hits: Hit[] = [];
  const wantBuy = draft.intent === "open" || draft.intent === "add";
  const wantSell = draft.intent === "reduce" || draft.intent === "close";
  if ((wantBuy && draft.side !== "buy") || (wantSell && draft.side !== "sell")) {
    hits.push(hit({
      ruleId: "side",
      severity: "block",
      gate: "EXIT",
      title: "方向与意图不符",
      detail: "开仓、加仓用买；减仓、平仓用卖。T0 两个方向都可以。",
      clause: "intent ↔ side",
    }));
  }

  hits.push(...pivotHits(draft, pos));

  const reducing = draft.intent === "reduce" || draft.intent === "close";
  if (reducing) {
    if (!pos) {
      hits.push(hit({
        ruleId: "no-pos",
        severity: "block",
        gate: "EXIT",
        title: "账上没有这张仓",
        detail: "平仓和减仓只针对已有持仓。换券商或换期权/正股，对闸门是不同的仓。",
        clause: "pos exists",
      }));
    } else if (draft.intent === "reduce" && qty > pos.qty + 1e-9) {
      hits.push(hit({
        ruleId: "over-qty",
        severity: "block",
        gate: "EXIT",
        title: "减仓数量超过持仓",
        detail: `镜像里还有 ${formatQty(pos.qty)}。要清掉就改成平仓。`,
        clause: "reduce qty ≤ pos",
      }));
    } else if (draft.intent === "close" && Math.abs(qty - pos.qty) > 1e-9) {
      hits.push(hit({
        ruleId: "close-qty",
        severity: "block",
        gate: "EXIT",
        title: "平仓必须一次清掉",
        detail: `镜像里还有 ${formatQty(pos.qty)}。只卖一部分请改成减仓，否则这张仓的时钟会被整行抹掉。`,
        clause: "close qty == pos",
      }));
    } else {
      const pocket = classify(pos, today);
      hits.push(hit({
        ruleId: "exit-ok",
        severity: "info",
        gate: "EXIT",
        title: "减仓与平仓放行",
        detail: pocket.tone === "cinnabar"
          ? "这格在出血。出场不拦，拦截只针对继续加风险。"
          : pocket.tone === "moss"
            ? "这是供血口袋。闸门放行，但确认不是一时情绪砍掉。"
            : "出场默认放行。杀伤规则不管卖出。",
        clause: "intent==reduce|close",
      }));
    }
    const sorted = sortHits(hits);
    const decision = decide(sorted);
    return {
      decision,
      hits: sorted,
      primary: primaryOf(sorted, decision),
      orderNotionalCny: orderNotional,
      exposureCny: exposure,
      hold: pos ? holdOf(pos, today) : hold,
      currency: ccyOf(draft.market),
      qty,
      price,
      symbol,
    };
  }

  if (t0Lane) {
    hits.push(hit({
      ruleId: "t0-ok",
      severity: "info",
      gate: "WATCH",
      title: "广发 T0 · 执行看板",
      detail: "同日回转可以过闸。这笔只进执行层，禁止与平仓盈亏加总。",
      clause: "gf & A & etf & t0",
    }));
  } else if (draft.intent === "t0") {
    if (on(state.settings, "t0-lane")) {
      hits.push(hit({
        ruleId: "t0-lane",
        severity: "block",
        gate: "WATCH",
        title: "T0 只走广发 A 股 ETF",
        detail: "执行层和盈亏层分开。其他券商、正股、期权不从这条缝过去。",
        clause: "broker==gf & mkt==A & etf & t0",
      }));
    } else {
      hits.push(hit({
        ruleId: "t0-lane",
        severity: "info",
        gate: "WATCH",
        title: "T0 分账闸已关",
        detail: "这张不是广发 A 股 ETF。关掉看板之后，仍按普通委托看持仓天数，别的拦截不跟着关。",
        clause: "t0-lane off",
      }));
    }
  }
  if (!t0Lane && draft.market === "US" && draft.asset !== "option") {
    if (hold <= 0) {
      hits.push(hit({
        ruleId: "us-0",
        severity: "info",
        gate: "KEEP",
        title: "美股当日 · 供血口袋",
        detail: draft.broker === "ht"
          ? "华泰日内历史是正的。留下当天走完的，过夜另算。"
          : draft.broker === "futu"
            ? "富途美股是利润中心之一，但 2021–22 日内为负。当日走完，不是神化账户。"
            : "当日平仓是美股正期望口袋。关掉它，样本总账会翻负。",
        clause: "mkt==US & hold≤0",
      }));
      if (exposure >= state.settings.q5Cny) {
        hits.push(hit({
          ruleId: "q5-day",
          severity: "info",
          gate: "KEEP",
          title: "日内大名义不触发 Q5",
          detail: "隔夜才看名义五档。当天走完的大单不按隔夜出血格拦截。",
          clause: "hold≤0 → skip Q5",
        }));
      }
    } else if (hold <= 3) {
      const planned = shortPlanOk(draft, orderNotional, hold);
      if (on(state.settings, "us-1-3") && !planned) {
        hits.push(hit({
          ruleId: "us-1-3",
          severity: "block",
          gate: "KEEP",
          title: "1–3 日短持没有计划书",
          detail: "要留这个口袋：写上错误价、本笔名义上限、最长天数和一句话理由。没有这些，就是即兴过夜。",
          clause: "US & 1≤hold≤3 & plan",
        }));
      } else if (planned) {
        hits.push(hit({
          ruleId: "us-1-3",
          severity: "info",
          gate: "KEEP",
          title: "有计划的 1–3 日短持",
          detail: "错误价和上限都在。这是保留项，不是 4–30 日那一格。",
          clause: "US & hold≤3 & plan",
        }));
      } else {
        hits.push(hit({
          ruleId: "us-1-3",
          severity: "info",
          gate: "KEEP",
          title: "短持计划闸已关",
          detail: "1–3 日现在不用计划书也能过。这是你拆掉的软闸。",
          clause: "us-1-3 off",
        }));
      }
    } else if (hold <= 30) {
      if (!on(state.settings, "us-4-30")) {
        hits.push(hit({
          ruleId: "us-4-30",
          severity: "info",
          gate: "KILL",
          title: "美股 4–30 日闸已关",
          detail: "这条是样本里第二大的持仓出血格。关掉之后，本笔不再因此拦截。",
          clause: "us-4-30 off",
        }));
      } else if (exceptionOk(draft, orderNotional, hold)) {
        hits.push(hit({
          ruleId: "us-4-30",
          severity: "info",
          gate: "KILL",
          title: "4–30 日例外已审批",
          detail: "计划书、限额审批、上限都盖过了本笔。隔夜 Q5 仍然不能豁免。",
          clause: "US & 4≤hold≤30 & approved",
        }));
      } else {
        hits.push(hit({
          ruleId: "us-4-30",
          severity: "block",
          gate: "KILL",
          title: "美股 4–30 日硬默认禁止",
          detail: "波段桶在抽血。要例外：错误价、名义上限盖过本笔、最长不超过 30 日，并打开限额审批。",
          clause: "US & 4≤hold≤30",
        }));
      }
    } else {
      hits.push(hit({
        ruleId: "us-long",
        severity: "info",
        gate: "WATCH",
        title: "已超出 4–30 日硬桶",
        detail: "美股超过 30 日不是那一格出血桶，不自动硬杀。隔夜大名义和华泰过夜仍然有效。",
        clause: "US & hold>30",
      }));
    }
  } else if (draft.asset === "option") {
    if (hold >= 4) {
      const exit = draft.optionExit.trim();
      const maxLoss = Number(draft.optionMaxLoss);
      const satisfied = exit.length >= 4 && Number.isFinite(maxLoss) && maxLoss > 0;
      if (!on(state.settings, "option-d4")) {
        hits.push(hit({
          ruleId: "option-d4",
          severity: "info",
          gate: "WATCH",
          title: "期权复盘窗已关",
          detail: "D+4 不再强制填写退出。4–7 日桶历史是负的。",
          clause: "option-d4 off",
        }));
      } else if (!satisfied) {
        hits.push(hit({
          ruleId: "option-d4",
          severity: "review",
          gate: "WATCH",
          title: "期权持有到第 4 天",
          detail: "写下退出条件，并填最大可接受亏损（元）。补完才转发。这一格还没有置信区间，所以是复盘，不是硬杀。",
          clause: "option & hold≥4",
        }));
      } else {
        hits.push(hit({
          ruleId: "option-d4",
          severity: "info",
          gate: "WATCH",
          title: "期权复盘已写下",
          detail: "退出和亏损上限在。监测窗放行，不代表这是供血口袋。",
          clause: "option & hold≥4 & exit",
        }));
      }
    } else {
      hits.push(hit({
        ruleId: "option-young",
        severity: "info",
        gate: "WATCH",
        title: "期权未到 D+4",
        detail: "四天以内先不进复盘窗。无退出规则的买方尾部，仍然不要拿去摊薄成本。",
        clause: "option & hold<4",
      }));
    }
    if (symbol === "BABA" || symbol.startsWith("BABA")) {
      hits.push(hit({
        ruleId: "baba-opt",
        severity: "info",
        gate: "WATCH",
        title: "BABA 期权与正股分开",
        detail: "同名异号：期权样本为负，正股短线为正。不要把正股的供血算到期权头上。",
        clause: "BABA option ≠ BABA stock",
      }));
    }
  }

  if (!t0Lane && draft.market === "HK") {
    const sym = symbol;
    if (hold >= 31) {
      if (!on(state.settings, "hk-31")) {
        hits.push(hit({
          ruleId: "hk-31",
          severity: "info",
          gate: "KILL",
          title: "港股长持闸已关",
          detail: "≥31 日是港股整市场被打穿的那 17 笔。关掉后不再拦截。",
          clause: "hk-31 off",
        }));
      } else {
        hits.push(hit({
          ruleId: "hk-31",
          severity: "block",
          gate: "KILL",
          title: sym === "00700" ? "腾讯长持，禁止加仓" : "港股持仓满 31 天",
          detail: sym === "00700"
            ? "00700 是港股长持主场。Kill 的是长持，不是中概。短线腿不要一起杀掉。"
            : "港股 ≤30 日短炒样本为正，≥31 日单独把市场打穿。这里只停加仓。",
          clause: "HK & hold≥31",
        }));
      }
    } else if (sym === "09988") {
      hits.push(hit({
        ruleId: "hk-short",
        severity: "info",
        gate: "KEEP",
        title: "09988 短腿留下",
        detail: "阿里港股短持在样本里是正的。不要写成「停掉所有中概」。满 31 天才适用长持闸。",
        clause: "09988 & hold≤30",
      }));
    } else if (sym === "00700") {
      hits.push(hit({
        ruleId: "hk-short",
        severity: "info",
        gate: "WATCH",
        title: "腾讯仍在 30 日以内",
        detail: "短炒口袋历史为正。时钟一到 31 日，加仓会被掐掉。",
        clause: "00700 & hold≤30",
      }));
    } else {
      hits.push(hit({
        ruleId: "hk-short",
        severity: "info",
        gate: "KEEP",
        title: "港股短炒窗口",
        detail: "≤30 日合计为正。长持才是 Kill。样本只有 46 笔，方向可讲，别当成定律。",
        clause: "HK & hold≤30",
      }));
    }
  }

  if (!t0Lane && draft.market === "A") {
    if (hold <= 3) {
      hits.push(hit({
        ruleId: "a-le3",
        severity: "info",
        gate: "KEEP",
        title: "A 股三天内 · 供血",
        detail: "短持是 A 股正口袋。第 4 天起要复盘，不能靠惯性加。",
        clause: "A & hold≤3",
      }));
    } else if (hold <= 30) {
      const noted = draft.reviewNote.trim().length >= 4;
      if (!on(state.settings, "a-day4")) {
        hits.push(hit({
          ruleId: "a-day4",
          severity: "info",
          gate: "WATCH",
          title: "A 股第四天复盘已关",
          detail: "不加复盘也能加仓。这是你拆掉的强制复盘。",
          clause: "a-day4 off",
        }));
      } else if (!noted) {
        hits.push(hit({
          ruleId: "a-day4",
          severity: "review",
          gate: "WATCH",
          title: "A 股已过第 3 天",
          detail: "写一笔复盘再加：错在哪、什么价减。没写完不转发。减仓和平仓不受这一条限制。",
          clause: "A & 4≤hold≤30",
        }));
      } else {
        hits.push(hit({
          ruleId: "a-day4",
          severity: "info",
          gate: "WATCH",
          title: "第 4 天复盘已写",
          detail: "复盘在，加仓放行。这仍不是长持许可。",
          clause: "A & hold≥4 & note",
        }));
      }
    } else if (!on(state.settings, "a-31")) {
      hits.push(hit({
        ruleId: "a-31",
        severity: "info",
        gate: "WATCH",
        title: "A 股长持闸已关",
        detail: "≥31 日历史为负，但 2025 有异号。你选择不再默认禁止加仓。",
        clause: "a-31 off",
      }));
    } else {
      hits.push(hit({
        ruleId: "a-31",
        severity: "block",
        gate: "WATCH",
        title: "A 股长持，禁止加仓",
        detail: "软默认：到了 31 天没有把仓当短持管理，就不要再加。减仓放行。2025 年 ETF 年不构成豁免。",
        clause: "A & hold≥31",
      }));
    }
  }

  if (!t0Lane && draft.market === "US" && hold > 0 && exposure >= state.settings.q5Cny) {
    if (on(state.settings, "us-q5")) {
      hits.push(hit({
        ruleId: "us-q5",
        severity: "block",
        gate: "KILL",
        title: "隔夜敞口撞上名义上限",
        detail: `隔夜敞口 ${formatCny(exposure)}，上限 ${formatCny(state.settings.q5Cny)}。这是置信区间最硬的一格，计划书也不能豁免。日内大单不走这条。`,
        clause: "US & hold>0 & exposure≥Q5",
      }));
    } else {
      hits.push(hit({
        ruleId: "us-q5",
        severity: "info",
        gate: "KILL",
        title: "隔夜 Q5 闸已关",
        detail: "名义上限不再拦截。这是样本里最硬的出血格。",
        clause: "us-q5 off",
      }));
    }
  }

  if (!t0Lane && draft.broker === "ht" && draft.market === "US" && hold > 0) {
    if (!on(state.settings, "ht-overnight")) {
      hits.push(hit({
        ruleId: "ht-overnight",
        severity: "info",
        gate: "KILL",
        title: "华泰过夜闸已关",
        detail: "涨乐全球通的美股隔夜历史在抽血。你暂时不拦。",
        clause: "ht-overnight off",
      }));
    } else if (draft.asset !== "option" && exceptionOk(draft, orderNotional, Math.min(hold, 30))) {
      hits.push(hit({
        ruleId: "ht-overnight",
        severity: "info",
        gate: "KILL",
        title: "华泰过夜例外已审批",
        detail: "只对这一笔。不要写成全美股「凡过夜即违规」。Q5 仍然有效。",
        clause: "ht & US & hold>0 & approved",
      }));
    } else {
      hits.push(hit({
        ruleId: "ht-overnight",
        severity: "block",
        gate: "KILL",
        title: "华泰美股不准留过夜",
        detail: draft.asset === "option"
          ? "含期权。华泰侧期权是拖累段。要过夜，先换通道或当天走完。例外审批不覆盖期权。"
          : "首仓禁止留在涨乐过夜。日内可以做。例外需要计划书和限额审批，且盖得住本笔。",
        clause: "broker==ht & US & hold>0",
      }));
    }
  }

  const anchors = state.closes
    .filter((c) => {
      if (c.pnlCny >= 0) return false;
      const age = daysBetween(c.closedAt, today);
      return Number.isFinite(age) && age >= 0 && age <= 3;
    })
    .sort((a, b) => (a.closedAt < b.closedAt ? 1 : -1));
  if (opening && anchors.length > 0 && on(state.settings, "revenge")) {
    const latest = anchors[0];
    if (orderNotional > latest.notionalCny) {
      hits.push(hit({
        ruleId: "revenge",
        severity: "block",
        gate: "SEQ",
        title: "亏后三日内名义放大",
        detail: `锚点 ${latest.closedAt} ${latest.symbol} 亏损 ${formatCny(latest.pnlCny, true)}，名义 ${formatCny(latest.notionalCny)}。本笔 ${formatCny(orderNotional)} 更高。胜率可以仍过半，闸看的是金额。这不是「CI 已证明期望为负」。`,
        clause: "loss≤3d & notional↑",
      }));
    } else if (orderNotional >= latest.notionalCny * 0.7) {
      hits.push(hit({
        ruleId: "revenge",
        severity: "info",
        gate: "SEQ",
        title: "冷静期内，名义没有放大",
        detail: `最近一笔亏损名义 ${formatCny(latest.notionalCny)}。本笔没有超过它，报复闸放行。`,
        clause: "loss≤3d & notional≤anchor",
      }));
    }
  } else if (opening && anchors.length > 0 && !on(state.settings, "revenge") && orderNotional > anchors[0].notionalCny) {
    hits.push(hit({
      ruleId: "revenge",
      severity: "info",
      gate: "SEQ",
      title: "报复冷静期已关",
      detail: "按规则这是亏后放大。你关掉了这条，所以不拦。",
      clause: "revenge off",
    }));
  }

  if (draft.tag === "average" && opening) {
    const planned = shortPlanOk(draft, orderNotional, Math.max(hold, 1));
    if (on(state.settings, "avg-plan") && !planned) {
      hits.push(hit({
        ruleId: "avg-plan",
        severity: "block",
        gate: "KEEP",
        title: "摊平没有错误价",
        detail: "有计划的摊平可以留。没写错误价和上限的，按回本加码拦截。",
        clause: "tag==摊平 & plan",
      }));
    } else if (planned) {
      hits.push(hit({
        ruleId: "avg-plan",
        severity: "info",
        gate: "KEEP",
        title: "摊平计划在",
        detail: "错误价和上限写了。软闸放行，不代表可以改成回本梭哈。",
        clause: "tag==摊平 & plan",
      }));
    }
  }

  if (draft.tag === "chase" && opening) {
    hits.push(hit({
      ruleId: "chase",
      severity: "info",
      gate: "WATCH",
      title: "追涨只是过滤信号",
      detail: "样本约 −1.2 万，置信区间跨零。闸门提示，不硬杀。",
      clause: "tag==追涨",
    }));
  }

  if (draft.tag === "credit" && hold > 0 && opening && !t0Lane) {
    if (on(state.settings, "credit-on")) {
      hits.push(hit({
        ruleId: "credit-on",
        severity: "block",
        gate: "KILL",
        title: "信用仓不准过夜",
        detail: "融资融券加在未验证的隔夜上，是低确定性的高仓位。当天走完不拦。",
        clause: "tag==信用 & hold>0",
      }));
    } else {
      hits.push(hit({
        ruleId: "credit-on",
        severity: "info",
        gate: "KILL",
        title: "信用过夜闸已关",
        detail: "本笔带信用且留过夜。这条闸被关掉了。",
        clause: "credit-on off",
      }));
    }
  }

  if (symbol === "BABA" && draft.asset === "stock" && draft.market === "US" && hold <= 3) {
    const plannedOrDay = hold <= 0 || shortPlanOk(draft, orderNotional, hold);
    if (plannedOrDay) {
      hits.push(hit({
        ruleId: "baba-stock",
        severity: "info",
        gate: "KEEP",
        title: "BABA 正股短线可留",
        detail: "正股与期权分开记账。留下的是短线腿，不是回本结构。",
        clause: "BABA stock & hold≤3",
      }));
    }
  }

  if (draft.broker === "futu" && draft.market === "US") {
    hits.push(hit({
      ruleId: "futu-us",
      severity: "info",
      gate: "WATCH",
      title: "富途美股优先",
      detail: "账户层供血，和日内重叠，不能再加总一次。追涨和回本不加免责。",
      clause: "broker==futu & mkt==US",
    }));
  }

  const sorted = sortHits(hits);
  const decision = decide(sorted);
  return {
    decision,
    hits: sorted,
    primary: primaryOf(sorted, decision),
    orderNotionalCny: orderNotional,
    exposureCny: exposure,
    hold,
    currency: ccyOf(draft.market),
    qty,
    price,
    symbol,
  };
}

export function applyToBook(positions: Position[], item: LedgerItem): Position[] {
  if (item.decision !== "pass" || item.intent === "t0") return positions;
  const sym = normSymbol(item.market, item.symbol);
  const match = (p: Position) =>
    p.broker === item.broker && p.market === item.market && p.asset === item.asset && normSymbol(p.market, p.symbol) === sym;
  const pos = positions.find(match);
  if (item.intent === "close" || item.intent === "reduce") {
    if (!pos) return positions;
    const qty = pos.qty - item.qty;
    if (qty <= 1e-9) return positions.filter((p) => !match(p));
    return positions.map((p) => (match(p) ? { ...p, qty } : p));
  }
  if (!pos) {
    return [
      ...positions,
      {
        id: `p-${item.id}`,
        broker: item.broker,
        market: item.market,
        symbol: sym,
        name: item.name || sym,
        asset: item.asset,
        qty: item.qty,
        price: item.price,
        openedAt: DESK_DATE,
        pivotPrice: item.pivotPrice,
        pivotNote: item.pivotNote,
      },
    ];
  }
  const qty = pos.qty + item.qty;
  const price = (pos.qty * pos.price + item.qty * item.price) / qty;
  return positions.map((p) => (match(p) ? { ...p, qty, price } : p));
}

export function settle(
  positions: Position[],
  closes: CloseRecord[],
  item: LedgerItem,
): { positions: Position[]; closes: CloseRecord[] } {
  const before = findPosition(positions, item);
  const next = applyToBook(positions, item);
  if (!before || item.decision !== "pass" || (item.intent !== "reduce" && item.intent !== "close")) {
    return { positions: next, closes };
  }
  const qty = Math.min(item.qty, before.qty);
  const pnl = (item.price - before.price) * qty * multiplier(item.asset) * FX[ccyOf(item.market)];
  return {
    positions: next,
    closes: [
      {
        id: `c-${item.id}`,
        broker: item.broker,
        market: item.market,
        symbol: normSymbol(item.market, item.symbol),
        name: item.name,
        closedAt: DESK_DATE,
        pnlCny: pnl,
        notionalCny: notionalCny(qty, item.price, item.market, item.asset),
      },
      ...closes,
    ],
  };
}

export function nid(): string {
  return `NS-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function ticketNo(broker: BrokerId): string {
  return `${BROKER[broker].prefix}-${Math.floor(10000 + Math.random() * 90000)}`;
}

function draft(partial: Omit<Draft, "plan" | "optionExit" | "optionMaxLoss" | "reviewNote" | "pivotPrice" | "pivotNote" | "pivotState"> & Partial<Pick<Draft, "plan" | "optionExit" | "optionMaxLoss" | "reviewNote" | "pivotPrice" | "pivotNote" | "pivotState">>): Draft {
  return {
    optionExit: "",
    optionMaxLoss: "",
    reviewNote: "",
    pivotPrice: "",
    pivotNote: "",
    pivotState: "holds",
    ...partial,
    plan: partial.plan ?? emptyPlan(),
  };
}

export interface Preset {
  id: string;
  label: string;
  draft: Draft;
}

export const PRESETS: Preset[] = [
  {
    id: "pivot-gone",
    label: "支点崩了",
    draft: draft({
      broker: "ht", market: "US", symbol: "AVGO", name: "博通", asset: "stock",
      side: "sell", intent: "close", qty: "20", price: "175", holdDays: 0, tag: "none",
      pivotNote: "跌破就走，不加仓", pivotState: "gone",
    }),
  },
  {
    id: "pivot-live",
    label: "还在却卖",
    draft: draft({
      broker: "ht", market: "US", symbol: "AVGO", name: "博通", asset: "stock",
      side: "sell", intent: "close", qty: "20", price: "175", holdDays: 0, tag: "none",
      pivotNote: "跌破就走，不加仓", pivotState: "holds",
    }),
  },
  {
    id: "pivot-drift",
    label: "换逻辑加仓",
    draft: draft({
      broker: "ht", market: "US", symbol: "AVGO", name: "博通", asset: "stock",
      side: "buy", intent: "add", qty: "10", price: "180", holdDays: 10, tag: "none",
      pivotNote: "它会是长期核心资产", pivotState: "holds",
    }),
  },
  {
    id: "aapl-day",
    label: "富途当日",
    draft: draft({
      broker: "futu", market: "US", symbol: "AAPL", name: "苹果", asset: "stock",
      side: "buy", intent: "open", qty: "20", price: "228", holdDays: 0, tag: "intraday",
      pivotPrice: "226", pivotNote: "当日，收盘前走",
    }),
  },
  {
    id: "avgo-ht",
    label: "华泰隔夜",
    draft: draft({
      broker: "ht", market: "US", symbol: "AVGO", name: "博通", asset: "stock",
      side: "buy", intent: "add", qty: "10", price: "180", holdDays: 10, tag: "none",
      pivotPrice: "170", pivotNote: "跌破就走，不加仓",
    }),
  },
  {
    id: "revenge",
    label: "亏后放大",
    draft: draft({
      broker: "futu", market: "US", symbol: "NVDA", name: "英伟达", asset: "stock",
      side: "buy", intent: "open", qty: "50", price: "200", holdDays: 0, tag: "none",
      pivotPrice: "188", pivotNote: "跌破就走",
    }),
  },
  {
    id: "tencent",
    label: "腾讯加仓",
    draft: draft({
      broker: "ht", market: "HK", symbol: "00700", name: "腾讯", asset: "stock",
      side: "buy", intent: "add", qty: "100", price: "370", holdDays: 45, tag: "none",
      pivotPrice: "360", pivotNote: "回到区间下沿就走",
    }),
  },
  {
    id: "baba-plan",
    label: "阿里有计划",
    draft: draft({
      broker: "futu", market: "US", symbol: "BABA", name: "阿里巴巴", asset: "stock",
      side: "buy", intent: "open", qty: "80", price: "95", holdDays: 2, tag: "none",
      pivotPrice: "88", pivotNote: "错了就走",
      plan: { invalidation: "88", maxNotional: "80000", maxDays: "3", thesis: "正股短线，错了就走，不加期权。", approved: false },
    }),
  },
  {
    id: "option-d5",
    label: "期权第五天",
    draft: draft({
      broker: "futu", market: "US", symbol: "BABA", name: "阿里巴巴", asset: "option",
      side: "buy", intent: "add", qty: "1", price: "2.6", holdDays: 5, tag: "none",
      pivotPrice: "2.2", pivotNote: "权利金腰斩就平",
    }),
  },
  {
    id: "etf-t0",
    label: "广发 T0",
    draft: draft({
      broker: "gf", market: "A", symbol: "159915", name: "创业板ETF", asset: "etf",
      side: "buy", intent: "t0", qty: "8000", price: "1.8", holdDays: 0, tag: "intraday",
      pivotPrice: "1.75", pivotNote: "只做当日回转",
    }),
  },
  {
    id: "q5",
    label: "隔夜大名义",
    draft: draft({
      broker: "futu", market: "US", symbol: "AMZN", name: "亚马逊", asset: "stock",
      side: "buy", intent: "open", qty: "400", price: "180", holdDays: 2, tag: "none",
      pivotPrice: "170", pivotNote: "跌破就走",
      plan: { invalidation: "170", maxNotional: "600000", maxDays: "2", thesis: "两日计划在，但名义已经进了隔夜大档。", approved: false },
    }),
  },
  {
    id: "hk-ali",
    label: "港股短腿",
    draft: draft({
      broker: "futu", market: "HK", symbol: "09988", name: "阿里巴巴-W", asset: "stock",
      side: "buy", intent: "add", qty: "50", price: "96", holdDays: 2, tag: "none",
      pivotPrice: "92", pivotNote: "短腿，破位就走",
    }),
  },
  {
    id: "maotai",
    label: "茅台第六天",
    draft: draft({
      broker: "gf", market: "A", symbol: "600519", name: "贵州茅台", asset: "stock",
      side: "buy", intent: "open", qty: "30", price: "1480", holdDays: 7, tag: "none",
      pivotPrice: "1420", pivotNote: "跌破前低就走",
    }),
  },
];

export function makeSeed(): DeskState {
  const positions: Position[] = [
    { id: "p-avgo", broker: "ht", market: "US", symbol: "AVGO", name: "博通", asset: "stock", qty: 20, price: 178, openedAt: "2026-10-09", pivotPrice: 170, pivotNote: "跌破就走，不加仓" },
    { id: "p-700", broker: "ht", market: "HK", symbol: "00700", name: "腾讯", asset: "stock", qty: 200, price: 372, openedAt: "2026-08-16", pivotPrice: 360, pivotNote: "回到区间下沿就走" },
    { id: "p-513", broker: "gf", market: "A", symbol: "513050", name: "中概互联", asset: "etf", qty: 30000, price: 1.12, openedAt: "2026-05-13", pivotPrice: 1.05, pivotNote: "跌破就不拿" },
    { id: "p-baba-o", broker: "futu", market: "US", symbol: "BABA", name: "阿里巴巴", asset: "option", qty: 3, price: 2.8, openedAt: "2026-10-16", pivotPrice: 2.2, pivotNote: "权利金腰斩就平" },
    { id: "p-aapl", broker: "futu", market: "US", symbol: "AAPL", name: "苹果", asset: "stock", qty: 15, price: 229, openedAt: "2026-10-21", pivotPrice: 226, pivotNote: "当日，收盘前走" },
    { id: "p-159", broker: "gf", market: "A", symbol: "159915", name: "创业板ETF", asset: "etf", qty: 8000, price: 1.79, openedAt: "2026-10-19", pivotPrice: 1.75, pivotNote: "只做当日回转" },
    { id: "p-tsla", broker: "ht", market: "US", symbol: "TSLA", name: "特斯拉", asset: "option", qty: 2, price: 4.1, openedAt: "2026-10-15", pivotPrice: 3.5, pivotNote: "跌破就平" },
    { id: "p-9988", broker: "futu", market: "HK", symbol: "09988", name: "阿里巴巴-W", asset: "stock", qty: 150, price: 98, openedAt: "2026-10-13", pivotPrice: 92, pivotNote: "短腿，破位就走" },
    { id: "p-568", broker: "gf", market: "A", symbol: "000568", name: "泸州老窖", asset: "stock", qty: 400, price: 128, openedAt: "2026-09-01", pivotPrice: 120, pivotNote: "跌破前低就走" },
  ];
  const closes: CloseRecord[] = [
    { id: "c1", broker: "ht", market: "US", symbol: "ORCL", name: "甲骨文", closedAt: "2026-10-20", pnlCny: -18420, notionalCny: 62000 },
    { id: "c2", broker: "futu", market: "US", symbol: "SMCI", name: "超微电脑", closedAt: "2026-10-19", pnlCny: -3600, notionalCny: 22000 },
    { id: "c3", broker: "gf", market: "A", symbol: "159792", name: "港股通互联", closedAt: "2026-10-17", pnlCny: 8200, notionalCny: 40000 },
  ];
  return {
    version: 2,
    positions,
    closes,
    ledger: [],
    settings: { q5Cny: 300000, autoConfirm: true, rules: defaultRules() },
    sessions: { gf: true, ht: true, futu: true },
    draft: PRESETS[0].draft,
    flash: "",
  };
}

export function envelopeText(item: LedgerItem): string {
  return [
    `支点交易 · ${BROKER[item.broker].app}`,
    `${sideLabel(item.side)} ${item.symbol} ${item.name} · ${assetLabel(item.asset)}`,
    `${formatQty(item.qty)} @ ${item.price} ${item.currency}`,
    `逻辑 ${item.pivotNote}`,
    `${intentLabel(item.intent)} · 有效持有 ${item.hold <= 0 ? "当日" : `${item.hold}日`}`,
    `名义 ${formatCny(item.notionalCny)}`,
    `戳 ${item.id}${item.ticket ? ` · ${item.ticket}` : ""}`,
    item.stamp,
  ].join("\n");
}
