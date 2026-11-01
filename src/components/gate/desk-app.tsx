import { clsx } from "clsx";
import { Layers, PenLine, Radio, Scale, Send } from "lucide-react";
import { DeskProvider, useDesk, type Tab } from "@/lib/gate/desk";
import { BROKER, DESK_DATE, type BrokerId } from "@/lib/gate/engine";
import { Book } from "@/components/gate/book";
import { Channels } from "@/components/gate/channels";
import { Outbox } from "@/components/gate/outbox";
import { Rules } from "@/components/gate/rules";
import { GateAction, Ticket, VerdictAside } from "@/components/gate/ticket";

const NAV: { id: Tab; label: string; icon: typeof PenLine }[] = [
  { id: "ticket", label: "下单", icon: PenLine },
  { id: "book", label: "持仓", icon: Layers },
  { id: "outbox", label: "转发", icon: Send },
  { id: "rules", label: "军规", icon: Scale },
  { id: "channels", label: "通道", icon: Radio },
];

export function DeskApp() {
  return (
    <DeskProvider>
      <Shell />
    </DeskProvider>
  );
}

function Shell() {
  const { tab, setTab, state } = useDesk();
  const blocked = state.ledger.filter((row) => row.status === "blocked").length;
  const sent = state.ledger.filter((row) => row.status === "delivered" || row.status === "queued").length;
  return (
    <div className="min-h-dvh bg-ink text-paper lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line lg:flex">
        <Brand />
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map((item) => (
            <NavButton key={item.id} item={item} current={tab} onSelect={setTab} count={item.id === "outbox" ? sent + blocked : 0} />
          ))}
        </nav>
        <div className="mt-auto px-4 py-4">
          <Sessions />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="h-1 bg-cinnabar" />
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 lg:px-6">
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <p className="hidden text-sm text-dim lg:block">先写下逻辑。它还在就拿着，崩了才退出。</p>
          <p className="font-mono text-xs tabular-nums text-dim">
            拦截 {blocked} · 转发 {sent}
          </p>
        </header>
        {state.flash && (
          <p className="border-b border-line bg-raise px-4 py-2 text-sm text-paper" role="status">{state.flash}</p>
        )}
        <div className="lg:flex lg:items-start lg:gap-6 lg:px-6">
          <main className={clsx("min-w-0 flex-1 px-4 py-4", tab === "ticket" ? "pb-48" : "pb-28", "lg:px-0 lg:pb-10")}>
            {tab === "ticket" && <Ticket />}
            {tab === "book" && <Book />}
            {tab === "outbox" && <Outbox />}
            {tab === "rules" && <Rules />}
            {tab === "channels" && <Channels />}
            <p className="mt-6 text-xs leading-5 text-dim">
              {tab === "ticket" ? "章只记在这里。到券商 App 里自己下。" : `闸门日 ${DESK_DATE} · 样本 2021-03-04 至 2026-10-09 · 结构审计，非投资建议。预览回执不是成交，也不连接真实账户。`}
            </p>
          </main>
          {tab === "ticket" && <VerdictAside />}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
        {tab === "ticket" && (
          <div className="border-t border-line bg-ink px-4 py-3">
            <GateAction />
          </div>
        )}
        <nav className="safe-nav grid grid-cols-5 border-t border-line bg-panel">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={clsx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs", tab === item.id ? "text-paper" : "text-dim")}
            >
              <item.icon className="size-5" />
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={clsx("flex items-center gap-3", !compact && "px-4 py-5")}>
      <span className="grid size-10 place-items-center rounded-lg bg-cinnabar text-lg font-semibold text-ink">支</span>
      <span>
        <span className="block text-lg font-semibold leading-none">支点交易</span>
        {!compact && <span className="mt-1 block font-mono text-xs tracking-widest text-dim">PIVOT</span>}
      </span>
    </div>
  );
}

function Sessions() {
  const { state } = useDesk();
  return (
    <ul className="flex flex-col gap-1">
      {(Object.keys(BROKER) as BrokerId[]).map((id) => (
        <li key={id} className="flex items-center justify-between text-sm">
          <span className="text-dim">{BROKER[id].short}</span>
          <span className={state.sessions[id] ? "text-moss" : "text-cinnabar"}>{state.sessions[id] ? "在线" : "未挂"}</span>
        </li>
      ))}
    </ul>
  );
}

function NavButton({
  item,
  current,
  onSelect,
  count,
}: {
  item: (typeof NAV)[number];
  current: Tab;
  onSelect: (tab: Tab) => void;
  count: number;
}) {
  const on = current === item.id;
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={clsx(
        "flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm",
        on ? "bg-raise text-paper" : "text-dim hover:text-paper",
      )}
    >
      <Icon className="size-4" />
      <span className="flex-1">{item.label}</span>
      {item.id === "outbox" && count > 0 && <span className="font-mono text-xs tabular-nums">{count}</span>}
    </button>
  );
}
