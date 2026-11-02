import {
  ccyOf,
  canonicalGroup,
  multiplier,
  normSymbol,
  type DeskState,
  type Draft,
  type LedgerItem,
  type Position,
} from "./engine.ts";

export interface ContractAssessment {
  riskCny: number | null;
  costCny: number | null;
  riskR: number | null;
  missing: string[];
}

export interface OpenRisk {
  positionCny: number | null;
  reservedCny: number | null;
  totalCny: number | null;
  unknown: string[];
}

export function riskUnit(state: DeskState): number | null {
  const net = state.settings.netAssetCny;
  if (state.settings.presetId === "conservative-90") {
    return net && net > 0 ? net * 0.0025 : null;
  }
  return net && net > 0 ? Math.min(2000, net * 0.0025) : 2000;
}

export function assessContract(draft: Draft, state: DeskState, now: Date): ContractAssessment {
  const plan = draft.plan;
  const missing: string[] = [];
  if (!plan.id) missing.push("计划编号");
  const createdAt = Date.parse(plan.createdAt ?? "");
  if (!Number.isFinite(createdAt) || createdAt >= now.getTime()) missing.push("事前时间戳");
  if (!plan.strategy) missing.push("策略身份");
  if ((plan.thesis ?? "").trim().length < 4) missing.push("开仓依据");
  if (!(plan.counterargument ?? "").trim()) missing.push("反方论据");
  if (!plan.marketStage || plan.marketStage === "unknown") missing.push("市场阶段");
  if (!(plan.addConditions ?? "").trim()) missing.push("加仓条件");
  if (!(plan.exitConditions ?? "").trim()) missing.push("退出条件");
  if (!(plan.correlationGroup ?? "").trim()) missing.push("关联主题");
  if (plan.strategy === "event" && !(plan.eventDate ?? "").trim()) missing.push("事件日期");

  const qty = Number(draft.qty);
  const price = Number(draft.price);
  const invalidation = Number(plan.invalidation);
  const maxDays = Number(plan.maxDays);
  const feeBudget = Number(plan.feeBudget);
  const fxRate = state.settings.fx[ccyOf(draft.market)].rate;
  if (!Number.isFinite(qty) || qty <= 0) missing.push("数量");
  if (!Number.isFinite(price) || price <= 0) missing.push("入场价");
  if (!Number.isFinite(invalidation) || invalidation <= 0 ||
    (draft.side === "buy" && invalidation >= price) || (draft.side === "sell" && invalidation <= price)) {
    missing.push("有效失效价");
  }
  if (!Number.isFinite(maxDays) || maxDays <= 0) missing.push("预期持有期");
  if (!(plan.feeBudget ?? "").trim() || !Number.isFinite(feeBudget) || feeBudget < 0) missing.push("费用预算");
  if (fxRate === null || !Number.isFinite(fxRate) || fxRate <= 0) missing.push("汇率");

  const costCny = Number.isFinite(qty) && qty > 0 && Number.isFinite(price) && price > 0 && fxRate !== null
    ? qty * price * multiplier(draft.asset) * fxRate
    : null;
  const riskCny = missing.length === 0
    ? (Math.abs(price - invalidation) * qty * multiplier(draft.asset) + feeBudget) * fxRate!
    : null;
  const unit = riskUnit(state);
  return { riskCny, costCny, riskR: riskCny !== null && unit ? riskCny / unit : null, missing };
}

export function isPendingNewRisk(item: LedgerItem): boolean {
  return !item.confirmed && item.decision === "pass" &&
    (item.status === "parked" || item.status === "queued" || item.status === "delivered") &&
    (item.intent === "open" || item.intent === "add" || item.intent === "t0");
}

export function positionOpenRisk(position: Position, state: DeskState): number | null {
  const currentPrice = position.currentPrice;
  const invalidation = position.invalidation;
  const feeBudget = position.feeBudget;
  const fxRate = position.fxRate ?? state.settings.fx[ccyOf(position.market)].rate;
  if (currentPrice === null || currentPrice === undefined || !Number.isFinite(currentPrice)) return null;
  if (invalidation === null || invalidation === undefined || !Number.isFinite(invalidation)) return null;
  if (feeBudget === null || feeBudget === undefined || !Number.isFinite(feeBudget)) return null;
  if (fxRate === null || !Number.isFinite(fxRate) || fxRate <= 0) return null;
  return (Math.max(0, currentPrice - invalidation) * Math.abs(position.qty) * multiplier(position.asset) + feeBudget) * fxRate;
}

export function orderOpenRisk(item: LedgerItem): number | null {
  if (!isPendingNewRisk(item)) return 0;
  return typeof item.plannedRiskCny === "number" && Number.isFinite(item.plannedRiskCny)
    ? item.plannedRiskCny
    : null;
}

export function openRisk(
  state: DeskState,
  selector: { symbol?: string; correlationGroup?: string } = {},
): OpenRisk {
  const unknown: string[] = [];
  const targetGroup = selector.correlationGroup === undefined ? undefined : canonicalGroup(selector.correlationGroup);
  const matches = (row: Position | LedgerItem): boolean => {
    if (selector.symbol && normSymbol(row.market, row.symbol) !== selector.symbol) return false;
    if (targetGroup !== undefined) {
      const group = canonicalGroup(row.correlationGroup);
      if (!group) {
        unknown.push(`${row.symbol} 关联主题未知`);
        return true;
      }
      if (group !== targetGroup) return false;
    }
    return true;
  };
  const positions = state.positions.filter(matches);
  const orders = state.ledger.filter((item) => isPendingNewRisk(item) && matches(item));
  let positionCny = 0;
  let reservedCny = 0;
  for (const position of positions) {
    const risk = positionOpenRisk(position, state);
    if (risk === null) unknown.push(`持仓 ${position.symbol}`);
    else positionCny += risk;
  }
  for (const item of orders) {
    const risk = orderOpenRisk(item);
    if (risk === null) unknown.push(`委托 ${item.symbol}`);
    else reservedCny += risk;
  }
  const complete = unknown.length === 0;
  return {
    positionCny: complete ? positionCny : null,
    reservedCny: complete ? reservedCny : null,
    totalCny: complete ? positionCny + reservedCny : null,
    unknown,
  };
}
