import {
  ccyOf,
  multiplier,
  type CloseRecord,
  type DailyMark,
  type DeskState,
  type LedgerItem,
  type Strategy,
} from "./engine.ts";
import { isPendingNewRisk } from "./risk.ts";

export interface StrategySummary {
  strategy: Strategy;
  grossRealizedCny: number | null;
  knownFeesCny: number;
  feeNetRealizedCny: number | null;
  feeCoverage: number;
  unrealizedCny: number | null;
}

export function strategySummaries(state: DeskState): StrategySummary[] {
  return (["intraday", "swing", "core", "event"] as Strategy[]).map((strategy) => {
    const closes = state.closes.filter((close) => close.strategy === strategy);
    const positions = state.positions.filter((position) => position.strategy === strategy);
    const grossRealizedCny = closes.some((close) => close.pnlCny === null)
      ? null
      : closes.reduce((sum, close) => sum + (close.pnlCny ?? 0), 0);
    const feeRows = [...closes, ...positions];
    const knownFeesCny = feeRows.reduce((sum, row) => sum + (row.actualFee ?? 0), 0);
    const allFeesKnown = feeRows.every((row) => typeof row.actualFee === "number");
    let unrealizedCny = 0;
    for (const position of positions) {
      const fxRate = position.fxRate ?? state.settings.fx[ccyOf(position.market)].rate;
      if (position.currentPrice === null || position.currentPrice === undefined || fxRate === null) {
        unrealizedCny = Number.NaN;
        break;
      }
      unrealizedCny += (position.currentPrice - position.price) * position.qty * multiplier(position.asset) * fxRate;
    }
    return {
      strategy,
      grossRealizedCny,
      knownFeesCny,
      feeNetRealizedCny: allFeesKnown && grossRealizedCny !== null ? grossRealizedCny - knownFeesCny : null,
      feeCoverage: feeRows.length === 0 ? 1 : feeRows.filter((row) => typeof row.actualFee === "number").length / feeRows.length,
      unrealizedCny: Number.isNaN(unrealizedCny) ? null : unrealizedCny,
    };
  });
}

export function dailyNet(mark: DailyMark): number | null {
  if (mark.realizedCny === null || mark.unrealizedCny === null || mark.feesCny === null || mark.fxImpactCny === null) return null;
  return mark.realizedCny + mark.unrealizedCny - mark.feesCny + mark.fxImpactCny;
}

export function drawdown(marks: DailyMark[]): number | null {
  const ordered = [...marks].sort((a, b) => a.date.localeCompare(b.date));
  let cumulative = 0;
  let peak = 0;
  let maximum = 0;
  for (const mark of ordered) {
    const net = dailyNet(mark);
    if (net === null) return null;
    cumulative += net;
    peak = Math.max(peak, cumulative);
    maximum = Math.max(maximum, peak - cumulative);
  }
  return maximum;
}

export function shanghaiDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function shanghaiMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
}

export interface ConfirmedFill {
  item: LedgerItem;
  at: number;
  date: string;
}

export function confirmedFills(state: DeskState): { fills: ConfirmedFill[]; unknown: number } {
  const fills: ConfirmedFill[] = [];
  let unknown = 0;
  for (const item of state.ledger) {
    if (!item.confirmed) continue;
    const at = Date.parse(item.confirmedAt ?? "");
    if (!Number.isFinite(at)) {
      unknown += 1;
      continue;
    }
    fills.push({ item, at, date: shanghaiDate(new Date(at)) });
  }
  fills.sort((a, b) => b.at - a.at);
  return { fills, unknown };
}

export function prospectiveFills(state: DeskState): { fills: ConfirmedFill[]; unknown: number } {
  const confirmed = confirmedFills(state);
  const fills = [...confirmed.fills];
  let unknown = confirmed.unknown;
  for (const item of state.ledger.filter(isPendingNewRisk)) {
    const at = Date.parse(item.at);
    if (!Number.isFinite(at)) {
      unknown += 1;
      continue;
    }
    fills.push({ item, at, date: shanghaiDate(new Date(at)) });
  }
  fills.sort((a, b) => b.at - a.at);
  return { fills, unknown };
}

export function lossTimestamp(close: CloseRecord): number {
  const exact = Date.parse(close.closedAtTime ?? "");
  if (Number.isFinite(exact)) return exact;
  return Date.parse(`${close.closedAt}T23:59:59.999Z`);
}

export function latestLoss(state: DeskState): CloseRecord | null {
  return state.closes
    .filter((close) => typeof close.pnlCny === "number" && close.pnlCny < 0 && Number.isFinite(lossTimestamp(close)))
    .sort((a, b) => lossTimestamp(b) - lossTimestamp(a))[0] ?? null;
}

export function marksBetween(marks: DailyMark[], startDate: string, endDate: string): DailyMark[] | null {
  const byDate = new Map(marks.map((mark) => [mark.date, mark]));
  const result: DailyMark[] = [];
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;
  for (let time = start; time <= end; time += 86_400_000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const mark = byDate.get(date);
    if (!mark) return null;
    result.push(mark);
  }
  return result;
}
