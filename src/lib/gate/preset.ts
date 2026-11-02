import {
  evaluate,
  canonicalGroup,
  findPosition,
  multiplier,
  normSymbol,
  ccyOf,
  type DeskState,
  type Draft,
  type Hit,
  type Verdict,
} from "./engine.ts";
import {
  dailyNet,
  drawdown,
  lossTimestamp,
  prospectiveFills,
  marksBetween,
  shanghaiDate,
  shanghaiMinutes,
} from "./ledger.ts";
import { assessContract, isPendingNewRisk, openRisk, riskUnit, type ContractAssessment, type OpenRisk } from "./risk.ts";

export interface PresetVerdict extends Verdict {
  risk: ContractAssessment;
  open: OpenRisk;
}

function gateHit(ruleId: string, title: string, detail: string): Hit {
  return { ruleId, severity: "block", gate: "KILL", title, detail, clause: ruleId };
}

function monday(date: string): string {
  const time = Date.parse(`${date}T00:00:00Z`);
  const day = (new Date(time).getUTCDay() + 6) % 7;
  return new Date(time - day * 86_400_000).toISOString().slice(0, 10);
}

function accountMarks(state: DeskState, start: string, end: string) {
  return marksBetween(state.settings.dailyMarks.filter((mark) => (mark.strategy ?? null) === null), start, end);
}

function conservativeHits(draft: Draft, state: DeskState, now: Date, risk: ContractAssessment, open: OpenRisk): Hit[] {
  const hits: Hit[] = [];
  const add = (id: string, title: string, detail: string) => hits.push(gateHit(id, title, detail));
  const regime = state.settings.regimes["conservative-90"];
  const startedAt = Date.parse(regime.startedAt);
  if (!Number.isFinite(startedAt)) add("regime-start", "周期起点未知", "重新设置90天周期起点后才能新增风险。");
  const elapsed = Number.isFinite(startedAt) ? Math.floor((now.getTime() - startedAt) / 86_400_000) : 0;
  if (elapsed < 30) add("clean-phase", "首30天止血期", "当前周期仍在首30天，只允许复核和降低风险。");
  if (elapsed >= 90) add("regime-ended", "90天周期已结束", "完成验收并显式开始下一周期后才能新增风险。");
  if (elapsed >= 30 && regime.violations.some((violation) => Date.parse(violation.at) < startedAt + 30 * 86_400_000)) {
    add("clean-phase", "首30天存在违规", "首30天未做到零违规，本周期不开放新增风险。");
  }
  if (regime.violations.length >= 2) add("violation-lock", "二次违规·只减不开", "第二次违规后，本90天周期剩余时间只允许减仓和退出。");
  if (regime.violations.length === 1) {
    const violation = regime.violations[0]!;
    const violationDate = shanghaiDate(new Date(Date.parse(violation.at)));
    const recovered = new Set(state.settings.dailyMarks.filter((mark) => mark.tradingDay && mark.date > violationDate).map((mark) => mark.date)).size;
    if (recovered < 5) add("violation-freeze", "违规后5个交易日停买", `当前只有 ${recovered} 个已记录交易日，满5个后才解除。`);
  }

  const unit = riskUnit(state);
  if (unit === null) add("net-asset", "缺少净资产", "90天保守版必须先填写净资产，不能使用隐式fallback。");
  if (risk.riskCny === null) add("risk-unknown", "计划风险不可计算", "补齐合同、费用和汇率后才可新增风险。");
  if (unit !== null && risk.riskCny !== null && risk.riskCny > unit) {
    add("order-r", "单笔超过0.25%净资产", `本笔计划风险 ${risk.riskCny.toFixed(2)}，上限 ${unit.toFixed(2)}。`);
  }
  if (open.totalCny === null) add("open-risk-unknown", "开放风险数据不完整", open.unknown.join("、") || "现有持仓或预留委托缺少风险输入。");
  const net = state.settings.netAssetCny;
  if (net && open.totalCny !== null && risk.riskCny !== null && open.totalCny + risk.riskCny > net * 0.01) {
    add("portfolio-risk", "组合新增风险超过1%", "现有、预留和本笔风险合并后超过净资产1%。");
  }
  if (draft.tag === "credit") add("no-leverage", "修复期禁止新增杠杆", "任何新增信用或杠杆风险都不进入90天保守版。");
  const position = findPosition(state.positions, draft);
  if (draft.intent === "add" && position) {
    if (position.currentPrice === null || position.currentPrice === undefined) add("loss-add", "浮亏加仓无法判定", "先填写当前价；未知不会按浮盈处理。");
    else if (position.currentPrice < position.price) add("loss-add", "浮亏不加仓", "当前价低于持仓成本，90天保守版禁止加仓。");
  }

  const draftGroup = canonicalGroup(draft.plan.correlationGroup);
  for (const loss of state.closes.filter((close) => typeof close.pnlCny === "number" && close.pnlCny < 0)) {
    const at = lossTimestamp(loss);
    const age = now.getTime() - at;
    if (age < 0 || age >= 48 * 3_600_000) continue;
    const sameSymbol = normSymbol(loss.market, loss.symbol) === normSymbol(draft.market, draft.symbol);
    const lossGroup = canonicalGroup(loss.correlationGroup);
    if (sameSymbol || (draftGroup && lossGroup === draftGroup)) {
      add("cooldown-48", "止损后48小时冷却", "同标的或同关联主题仍在48小时冷却期，降险单不受影响。");
    } else if (!lossGroup) {
      add("correlation-unknown", "近期亏损关联主题未知", "无法排除同主题换仓，先补齐近期亏损的关联主题。");
    }
  }

  const { fills, unknown } = prospectiveFills(state);
  if (unknown > 0) add("frequency-unknown", "历史成交时间不完整", "有已确认委托缺少确认时间，无法核验频率。");
  const inRegime = fills.filter((fill) => fill.at >= startedAt && fill.at <= now.getTime());
  const today = shanghaiDate(now);
  const dayCount = inRegime.filter((fill) => fill.date === today).length;
  if (dayCount + 1 > 2) add("frequency-day", "每日最多2笔", "本笔会成为今天第3笔主动成交。");
  if (inRegime.length + 1 > 12) add("frequency-total", "90天最多12笔", "本笔会超过90天主动成交上限。");
  const days = new Set(inRegime.map((fill) => fill.date));
  days.add(today);
  if (days.size > 6) add("frequency-days", "最多6个主动操作日", "本笔会开启第7个主动操作日。");
  const inWindow = state.settings.calendarWindows.some((window) => {
    const created = Date.parse(window.createdAt);
    const start = Date.parse(window.start);
    const end = Date.parse(window.end);
    return created < now.getTime() && start <= now.getTime() && now.getTime() <= end;
  });
  if (!inWindow) add("calendar-window", "不在事前日历窗口", "只有订单前已创建且覆盖当前时间的窗口才允许新增风险。");
  return hits;
}

function contractFingerprint(draft: Draft): string {
  return JSON.stringify({
    ...draft,
    plan: Object.fromEntries(Object.entries(draft.plan).sort(([a], [b]) => a.localeCompare(b))),
  });
}

function unchangedPreplannedContract(state: DeskState, draft: Draft, lossAt: number): boolean {
  const snapshot = state.contracts[draft.plan.id ?? ""];
  if (!snapshot) return false;
  const recordedAt = Date.parse(snapshot.recordedAt);
  const createdAt = Date.parse(snapshot.draft.plan.createdAt ?? "");
  return Number.isFinite(recordedAt) && recordedAt < lossAt && Number.isFinite(createdAt) && createdAt < lossAt &&
    contractFingerprint(snapshot.draft) === contractFingerprint(draft);
}

function acceptanceHits(draft: Draft, state: DeskState, now: Date, risk: ContractAssessment, open: OpenRisk): Hit[] {
  const hits: Hit[] = [];
  const add = (id: string, title: string, detail: string) => hits.push(gateHit(id, title, detail));
  const unit = riskUnit(state)!;
  const stage4 = draft.plan.marketStage === "4";
  const bounce = stage4 && draft.plan.setup === "stage4-bounce";
  const orderCap = bounce ? unit * 0.5 : unit;
  if (risk.riskCny === null) add("risk-unknown", "计划风险不可计算", "补齐合同、费用和汇率后才可新增风险。");
  if (risk.riskCny !== null && risk.riskCny > orderCap) add("order-r", "单笔风险超过R", `本笔计划风险 ${risk.riskCny.toFixed(2)}，上限 ${orderCap.toFixed(2)}。`);
  if (draft.plan.marketStage === "3" && draft.plan.setup === "bottom-fishing") add("stage-3-bottom", "阶段三抄底暂停", "20日验收版暂停阶段三抄底新开仓。");
  if (stage4 && !bounce) add("stage-4-setup", "阶段四仅限独立反弹策略", "阶段四新风险必须标记stage4-bounce并使用0.5R。");

  const symbol = normSymbol(draft.market, draft.symbol);
  const symbolRisk = openRisk(state, { symbol });
  const group = canonicalGroup(draft.plan.correlationGroup);
  const groupRisk = openRisk(state, { correlationGroup: group });
  if (open.totalCny === null || symbolRisk.totalCny === null || groupRisk.totalCny === null) {
    add("open-risk-unknown", "开放风险数据不完整", [...open.unknown, ...symbolRisk.unknown, ...groupRisk.unknown].join("、") || "缺少风险输入。");
  } else {
    if (risk.riskCny !== null && symbolRisk.totalCny + risk.riskCny > unit) add("symbol-risk", "单标的风险超限", "单标的开放风险、预留风险和本笔合并后超过预算。");
    if (risk.riskCny !== null && groupRisk.totalCny + risk.riskCny > 4 * unit) add("theme-risk", "关联主题超过4R", "同主题跨券商和币种合并后超过4R。");
    if (risk.riskCny !== null && open.totalCny + risk.riskCny > 6 * unit) add("portfolio-risk", "组合超过6R", "全部开放风险和本笔合并后超过6R。");
  }

  if (risk.costCny === null) add("cost-unknown", "新单成本不可计算", "缺少价格、数量或汇率。");
  let existingCost = 0;
  let costUnknown = false;
  for (const position of state.positions.filter((row) => normSymbol(row.market, row.symbol) === symbol)) {
    const fx = position.fxRate ?? state.settings.fx[ccyOf(position.market)].rate;
    if (fx === null) costUnknown = true;
    else existingCost += Math.abs(position.qty) * position.price * multiplier(position.asset) * fx;
  }
  const net = state.settings.netAssetCny;
  for (const item of state.ledger.filter((row) => isPendingNewRisk(row) && normSymbol(row.market, row.symbol) === symbol)) {
    const fx = item.fxRate ?? state.settings.fx[ccyOf(item.market)].rate;
    if (fx === null) costUnknown = true;
    else existingCost += item.qty * item.price * multiplier(item.asset) * fx;
  }
  const costCap = net ? Math.min(net * 0.1, 100_000) : 100_000;
  if (costUnknown) add("cost-unknown", "存量成本汇率缺失", "无法合并计算单标的成本上限。");
  if (!costUnknown && risk.costCny !== null && existingCost + risk.costCny > costCap) {
    add("symbol-cost", "单标的成本超过上限", `合并成本超过 ${costCap.toFixed(2)} 元。`);
  }

  const today = shanghaiDate(now);
  for (const close of state.closes.filter((row) => typeof row.pnlCny === "number" && row.pnlCny < 0)) {
    const at = lossTimestamp(close);
    const age = now.getTime() - at;
    const sameSymbol = normSymbol(close.market, close.symbol) === symbol;
    if (sameSymbol && shanghaiDate(new Date(at)) === today) add("same-day-reentry", "止损当日禁止重入", "同标的当日止损后不能重新开仓。");
    const sameGroup = group && canonicalGroup(close.correlationGroup) === group;
    const preplanned = unchangedPreplannedContract(state, draft, at);
    if (!sameSymbol && sameGroup && age >= 0 && age < 24 * 3_600_000 && !preplanned) {
      add("correlated-switch", "24小时关联换仓冷却", "同主题换仓需要止损前已创建的独立计划。");
    }
  }

  const { fills, unknown } = prospectiveFills(state);
  if (unknown > 0) add("frequency-unknown", "历史成交时间不完整", "有已确认委托缺少确认时间，无法核验20日频率。");
  const dates = [...new Set([today, ...fills.map((fill) => fill.date)])].slice(0, 20);
  const active = new Set(dates);
  const count = fills.filter((fill) => active.has(fill.date)).length;
  if ((count + 1) / dates.length > 4 || count + 1 > 80) add("frequency-20", "20日频率超限", "本笔会超过日均4笔或20个主动日80笔上限。");
  if (shanghaiMinutes(now) > 23 * 60 + 30) add("late-night", "23:30后禁止新开仓", "风险降低单不受影响。");

  let marksMissing = false;
  const todayMarks = accountMarks(state, today, today);
  const todayNet = todayMarks?.length === 1 ? dailyNet(todayMarks[0]!) : null;
  if (todayNet === null || todayNet === undefined) marksMissing = true;
  const dayCap = net ? Math.min(2 * unit, net * 0.0075) : 2 * unit;
  if (todayNet !== null && todayNet !== undefined && -todayNet >= dayCap) add("breaker-day", "单日熔断", "当日净亏损达到日熔断线。");

  const week = accountMarks(state, monday(today), today);
  const weekDrawdown = week ? drawdown(week) : null;
  if (weekDrawdown === null || weekDrawdown === undefined) marksMissing = true;
  if (weekDrawdown !== null && weekDrawdown !== undefined && weekDrawdown >= 4 * unit) add("breaker-week", "单周熔断", "周内高点回撤达到4R。");

  const trading = state.settings.dailyMarks
    .filter((mark) => (mark.strategy ?? null) === null && mark.tradingDay && mark.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (trading.length < 20) marksMissing = true;
  const rolling = trading.length >= 20 ? accountMarks(state, trading[19]!.date, today) : null;
  const rollingDrawdown = rolling ? drawdown(rolling) : null;
  if (rollingDrawdown === null || rollingDrawdown === undefined) marksMissing = true;
  const rollingCap = net ? Math.min(8 * unit, net * 0.02) : 8 * unit;
  if (rollingDrawdown !== null && rollingDrawdown !== undefined && rollingDrawdown >= rollingCap) add("breaker-20", "20日滚动熔断", "20日滚动峰谷回撤达到熔断线。");

  if (draft.plan.strategy === "intraday" || draft.plan.strategy === "swing") {
    const mark = state.settings.dailyMarks.find((row) => row.date === today && row.strategy === draft.plan.strategy);
    const strategyNet = mark ? dailyNet(mark) : null;
    if (strategyNet === null || strategyNet === undefined) marksMissing = true;
    const cap = draft.plan.strategy === "intraday" ? unit : 2 * unit;
    if (strategyNet !== null && strategyNet !== undefined && -strategyNet >= cap) add("strategy-day-stop", "策略日内停止", `${draft.plan.strategy} 当日亏损达到策略停止线。`);
  }
  if (marksMissing) add("marks-missing", "净值记录不连续", "日、周、20日或策略daily marks缺失/含未知项，不能新增风险。");
  return hits;
}

export function evaluateWithPreset(draft: Draft, state: DeskState, now = new Date()): PresetVerdict {
  const base = evaluate(draft, state, shanghaiDate(now));
  const open = openRisk(state);
  if (draft.intent === "reduce" || draft.intent === "close") {
    return { ...base, risk: { riskCny: 0, costCny: 0, riskR: 0, missing: [] }, open };
  }

  const risk = assessContract(draft, state, now);
  const extra: Hit[] = [];
  if (risk.missing.length > 0) extra.push(gateHit("contract-missing", "事前合同不完整", risk.missing.join("、")));
  const position = findPosition(state.positions, draft);
  if (draft.intent === "add" && position?.strategy && position.strategy !== draft.plan.strategy) {
    extra.push(gateHit("strategy-immutable", "策略身份不可事后改写", "加仓必须与已有仓位保持同一策略身份。"));
  }
  if (draft.plan.strategy === "intraday" && base.hold > 0) {
    extra.push(gateHit("intraday-overnight", "日内不得隔夜", "日内策略必须在当日退出，不能留成波段。"));
  }
  extra.push(...(state.settings.presetId === "conservative-90"
    ? conservativeHits(draft, state, now, risk, open)
    : acceptanceHits(draft, state, now, risk, open)));
  const hits = [...extra, ...base.hits];
  const decision = hits.some((hit) => hit.severity === "block") ? "block" : hits.some((hit) => hit.severity === "review") ? "review" : "pass";
  const primary = extra.find((hit) => hit.severity === decision) ?? base.primary;
  return { ...base, decision, hits, primary, risk, open };
}
