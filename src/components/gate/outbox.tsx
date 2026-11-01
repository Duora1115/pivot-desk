import { useState } from "react";
import { clsx } from "clsx";
import { useDesk } from "@/lib/gate/desk";
import {
  BROKER,
  envelopeText,
  formatAt,
  formatCny,
  formatQty,
  intentLabel,
  sideLabel,
  type LedgerItem,
} from "@/lib/gate/engine";
import { decisionTone, decisionWord } from "@/components/gate/bits";

type Filter = "all" | "delivered" | "blocked" | "parked";

export function Outbox() {
  const { state, requeue, confirm } = useDesk();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const rows = state.ledger.filter((row) => {
    if (filter === "all") return true;
    if (filter === "delivered") return row.status === "delivered" || row.status === "queued";
    if (filter === "blocked") return row.status === "blocked";
    return row.status === "parked";
  });

  const copy = async (item: LedgerItem) => {
    const text = envelopeText(item);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(item.id);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="text-2xl font-semibold">转发簿</h2>
        <p className="mt-1 text-sm leading-6 text-dim">
          过闸的委托记成信封。你再到已登录的券商 App 里手工下。这里的回执不是成交，也没有送出。拦截的单子留在这里。
        </p>
      </header>
      <div className="grid grid-cols-4 gap-1.5">
        {(
          [
            ["all", "全部"],
            ["delivered", "已记"],
            ["blocked", "拦截"],
            ["parked", "待挂"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={clsx(
              "min-h-11 rounded-lg border text-sm",
              filter === id ? "border-paper bg-raise text-paper" : "border-line text-dim",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-dim">
          还没有记录。回下单页过一道闸。
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {rows.map((item) => {
          const expanded = open === item.id;
          const status = statusLabel(item);
          return (
            <li key={item.id} className="rounded-xl bg-panel shadow-card">
              <button type="button" onClick={() => setOpen(expanded ? null : item.id)} className="w-full px-4 py-3 text-left">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-base">{item.symbol}</p>
                  <p className={`text-sm ${decisionTone(item.decision)}`}>{decisionWord(item.decision)}</p>
                </div>
                <p className="mt-1 text-sm text-dim">
                  {BROKER[item.broker].app} · {sideLabel(item.side)} {formatQty(item.qty)} @ {item.price} · {intentLabel(item.intent)}
                </p>
                <p className="mt-1 flex justify-between gap-3 font-mono text-xs text-dim">
                  <span>{status}</span>
                  <span>{formatAt(item.at)}</span>
                </p>
              </button>
              {expanded && (
                <div className="border-t border-line px-4 py-3">
                  <p className="text-sm leading-6">{item.stamp}</p>
                  <p className="mt-1 font-mono text-xs text-dim">名义 {formatCny(item.notionalCny)} · {item.ticket ?? item.id}</p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {item.hits.filter((h) => h.severity !== "info").slice(0, 4).map((h) => (
                      <li key={h.ruleId + h.title} className="font-mono text-xs text-dim">{h.clause}</li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => copy(item)} className="min-h-11 rounded-lg border border-line px-3 text-sm">
                      {copied === item.id ? "已复制" : "复制信封"}
                    </button>
                    {item.status === "parked" && (
                      <button type="button" onClick={() => requeue(item.id)} className="min-h-11 rounded-lg bg-moss px-3 text-sm font-medium text-ink">
                        重新排队
                      </button>
                    )}
                    {item.status === "delivered" && !item.confirmed && item.decision === "pass" && (
                      <button type="button" onClick={() => confirm(item.id)} className="min-h-11 rounded-lg bg-moss px-3 text-sm font-medium text-ink">
                        我已在券商确认
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function statusLabel(item: LedgerItem): string {
  if (item.status === "blocked") return "未送出";
  if (item.status === "parked") return "待挂起";
  if (item.status === "queued") return "排队中 · 未送出";
  if (item.confirmed) return item.intent === "t0" ? "已记下 · 不改隔夜底稿" : "已记下 · 请到 App 手工下单";
  return "已记下 · 等你确认底稿";
}
