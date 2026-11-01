import { useDesk } from "@/lib/gate/desk";
import {
  BROKER,
  DESK_DATE,
  classify,
  formatCny,
  formatQty,
  holdOf,
  positionNotional,
  type Position,
  type Tone,
} from "@/lib/gate/engine";
import { toneClass } from "@/components/gate/bits";

const RANK: Record<Tone, number> = { cinnabar: 0, brass: 1, moss: 2, dim: 3 };

export function Book() {
  const { state, loadPosition } = useDesk();
  const rows = [...state.positions].sort((a, b) => RANK[classify(a).tone] - RANK[classify(b).tone]);
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="text-2xl font-semibold">持仓底稿</h2>
        <p className="mt-1 text-sm leading-6 text-dim">
          每张仓有一个买入支点。平仓草案会把这个支点带进卖出；你改了价或改了那句话，章就是不一致。
        </p>
      </header>
      <ul className="flex flex-col gap-2">
        {rows.map((pos) => (
          <Row key={pos.id} pos={pos} onClose={() => loadPosition(pos.id, "close")} onAdd={() => loadPosition(pos.id, "add")} />
        ))}
      </ul>
    </div>
  );
}

function Row({ pos, onClose, onAdd }: { pos: Position; onClose: () => void; onAdd: () => void }) {
  const pocket = classify(pos);
  const hold = holdOf(pos, DESK_DATE);
  return (
    <li className="rounded-xl bg-panel p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-lg text-paper">{pos.symbol}</p>
          <p className="text-sm text-dim">
            {pos.name} · {BROKER[pos.broker].short} · {pos.market === "A" ? "A股" : pos.market === "HK" ? "港股" : "美股"}
          </p>
        </div>
        <p className={`shrink-0 text-sm ${toneClass(pocket.tone)}`}>{pocket.label}</p>
      </div>
      <p className="mt-3 text-sm leading-6 text-paper">
        逻辑支点 {pos.pivotNote || "还没写"}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-sm tabular-nums">
        <p><span className="block text-xs text-dim">持有</span>{hold <= 0 ? "当日" : `${hold}日`}</p>
        <p><span className="block text-xs text-dim">数量</span>{formatQty(pos.qty)}</p>
        <p><span className="block text-xs text-dim">名义</span>{formatCny(positionNotional(pos))}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg bg-moss text-sm font-medium text-ink">
          平仓草案
        </button>
        <button type="button" onClick={onAdd} className="min-h-11 rounded-lg border border-line text-sm text-paper">
          试加仓
        </button>
      </div>
    </li>
  );
}
