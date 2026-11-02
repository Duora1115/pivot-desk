import { useDesk } from "@/lib/gate/desk";
import {
  BROKER,
  classify,
  formatCny,
  formatQty,
  holdOf,
  positionNotional,
  type Position,
  type Strategy,
  type Tone,
} from "@/lib/gate/engine";
import { strategySummaries, shanghaiDate } from "@/lib/gate/ledger";
import { positionOpenRisk } from "@/lib/gate/risk";
import { Field, Panel, TextInput, toneClass } from "@/components/gate/bits";

const RANK: Record<Tone, number> = { cinnabar: 0, brass: 1, moss: 2, dim: 3 };

export function Book() {
  const { state, verdict, loadPosition } = useDesk();
  const rows = [...state.positions].sort((a, b) => RANK[classify(a, shanghaiDate(new Date())).tone] - RANK[classify(b, shanghaiDate(new Date())).tone]);
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="text-2xl font-semibold">持仓底稿</h2>
        <p className="mt-1 text-sm leading-6 text-dim">成本、当前价、失效价和费用分开维护。未知数据不会按零计入开放风险。</p>
      </header>
      <Panel>
        <h3 className="text-base font-medium">开放风险</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-sm tabular-nums sm:grid-cols-4">
          <p><span className="block text-xs text-dim">现有仓位</span>{money(verdict.open.positionCny)}</p>
          <p><span className="block text-xs text-dim">预留委托</span>{money(verdict.open.reservedCny)}</p>
          <p><span className="block text-xs text-dim">本笔新增</span>{money(verdict.risk.riskCny)}</p>
          <p><span className="block text-xs text-dim">未知项</span>{verdict.open.unknown.length}</p>
        </div>
      </Panel>
      <StrategyLedger />
      <ul className="flex flex-col gap-2">
        {rows.map((pos) => (
          <Row key={pos.id} pos={pos} onClose={() => loadPosition(pos.id, "close")} onAdd={() => loadPosition(pos.id, "add")} />
        ))}
      </ul>
    </div>
  );
}

function StrategyLedger() {
  const { state } = useDesk();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {strategySummaries(state).map((row) => (
        <Panel key={row.strategy}>
          <h3 className="text-base font-medium">{strategyLabel(row.strategy)}</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
            <p><span className="block text-dim">实现毛盈亏</span>{money(row.grossRealizedCny)}</p>
            <p><span className="block text-dim">费后实现</span>{money(row.feeNetRealizedCny)}</p>
            <p><span className="block text-dim">未实现</span>{money(row.unrealizedCny)}</p>
            <p><span className="block text-dim">已知费用</span>{money(row.knownFeesCny)}</p>
            <p className="col-span-2"><span className="block text-dim">费用覆盖</span>{(row.feeCoverage * 100).toFixed(0)}%</p>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function Row({ pos, onClose, onAdd }: { pos: Position; onClose: () => void; onAdd: () => void }) {
  const { state } = useDesk();
  const pocket = classify(pos, shanghaiDate(new Date()));
  const hold = holdOf(pos, shanghaiDate(new Date()));
  return (
    <li className="rounded-xl bg-panel p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-lg text-paper">{pos.symbol}</p>
          <p className="text-sm text-dim">{pos.name} · {BROKER[pos.broker].short} · {pos.market === "A" ? "A股" : pos.market === "HK" ? "港股" : "美股"}</p>
        </div>
        <p className={`shrink-0 text-sm ${toneClass(pocket.tone)}`}>{pocket.label}</p>
      </div>
      <p className="mt-3 text-sm leading-6 text-paper">逻辑支点 {pos.pivotNote || "还没写"}</p>
      <div className="mt-3 grid grid-cols-4 gap-2 font-mono text-sm tabular-nums">
        <p><span className="block text-xs text-dim">持有</span>{hold <= 0 ? "当日" : `${hold}日`}</p>
        <p><span className="block text-xs text-dim">数量</span>{formatQty(pos.qty)}</p>
        <p><span className="block text-xs text-dim">名义</span>{formatCny(positionNotional(pos))}</p>
        <p><span className="block text-xs text-dim">开放R</span>{money(positionOpenRisk(pos, state))}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg bg-moss text-sm font-medium text-ink">平仓草案</button>
        <button type="button" onClick={onAdd} className="min-h-11 rounded-lg border border-line text-sm text-paper">试加仓</button>
      </div>
      <PositionEditor pos={pos} />
    </li>
  );
}

function PositionEditor({ pos }: { pos: Position }) {
  const { updatePosition } = useDesk();
  return (
    <details className="mt-3 border-t border-line pt-2">
      <summary className="min-h-11 cursor-pointer text-sm text-dim">风险与账本字段</summary>
      <div className="grid gap-3 pt-2 sm:grid-cols-2">
        <Field label="策略身份">
          <select
            aria-label={`${pos.symbol}策略`}
            value={pos.strategy ?? ""}
            disabled={Boolean(pos.strategy)}
            onChange={(event) => updatePosition(pos.id, { strategy: (event.target.value || null) as Strategy | null })}
            className="min-h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm disabled:opacity-50"
          >
            <option value="">未分类</option>
            <option value="intraday">日内</option>
            <option value="swing">波段</option>
            <option value="core">配置</option>
            <option value="event">事件</option>
          </select>
        </Field>
        <Field label="关联主题">
          <TextInput aria-label={`${pos.symbol}关联主题`} mono={false} defaultValue={pos.correlationGroup ?? ""} onBlur={(event) => updatePosition(pos.id, { correlationGroup: event.target.value.trim() || null })} />
        </Field>
        <Field label="当前价">
          <TextInput aria-label={`${pos.symbol}当前价`} inputMode="decimal" defaultValue={pos.currentPrice ?? ""} onBlur={(event) => updatePosition(pos.id, { currentPrice: positiveOrNull(event.target.value) })} />
        </Field>
        <Field label="报价日期">
          <TextInput aria-label={`${pos.symbol}报价日期`} type="date" value={pos.priceAt ?? ""} onChange={(event) => updatePosition(pos.id, { priceAt: event.target.value || null })} />
        </Field>
        <Field label="失效价">
          <TextInput aria-label={`${pos.symbol}失效价`} inputMode="decimal" defaultValue={pos.invalidation ?? ""} onBlur={(event) => updatePosition(pos.id, { invalidation: positiveOrNull(event.target.value) })} />
        </Field>
        <Field label="剩余费用预算">
          <TextInput aria-label={`${pos.symbol}剩余费用预算`} inputMode="decimal" defaultValue={pos.feeBudget ?? ""} onBlur={(event) => updatePosition(pos.id, { feeBudget: positiveOrNull(event.target.value) })} />
        </Field>
        <Field label="FX → CNY">
          <TextInput aria-label={`${pos.symbol}汇率`} inputMode="decimal" defaultValue={pos.fxRate ?? ""} onBlur={(event) => updatePosition(pos.id, { fxRate: positiveOrNull(event.target.value) })} />
        </Field>
        <Field label="汇率日期">
          <TextInput aria-label={`${pos.symbol}汇率日期`} type="date" value={pos.fxAsOf ?? ""} onChange={(event) => updatePosition(pos.id, { fxAsOf: event.target.value || null })} />
        </Field>
      </div>
      {pos.strategy && <p className="mt-2 text-xs text-dim">策略已锁定；如需纠正，请通过平仓和新合同另建记录。</p>}
    </details>
  );
}

function positiveOrNull(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function money(value: number | null): string {
  return value === null ? "未知" : formatCny(value);
}

function strategyLabel(strategy: Strategy): string {
  if (strategy === "intraday") return "日内分账";
  if (strategy === "swing") return "波段分账";
  if (strategy === "core") return "配置分账";
  return "事件分账";
}
