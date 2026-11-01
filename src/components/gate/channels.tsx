import { clsx } from "clsx";
import { useDesk } from "@/lib/gate/desk";
import { BROKER, formatCny, type BrokerId } from "@/lib/gate/engine";
import { Panel } from "@/components/gate/bits";

const COPY: Record<BrokerId, { line: string; why: string }> = {
  gf: {
    line: "易淘金没有公开的代下单接口。过闸后这里生成信封，由你在已登录的 App 里确认。",
    why: "本金主场。2025 年 ETF 把它翻正。费用绝对额最大，单位摩擦仍为正。",
  },
  ht: {
    line: "涨乐全球通同样只收已过闸的信封。支点交易不保存资金密码，也不替你点确认。",
    why: "成交约占七成，投资口径却是负的。日内为正，过夜和期权把账打穿。不是费率问题。",
  },
  futu: {
    line: "真要接到牛牛，下一步是你自己机器上的 OpenD。这个预览不连接网关，不发真单。",
    why: "笔数少、贡献大。日内和期权一起抬。追涨和回本式加仓不因账户为正而免责。",
  },
};

const FACTS: { broker: BrokerId; pnl: number; trades: string }[] = [
  { broker: "gf", pnl: 49467, trades: "498 笔" },
  { broker: "ht", pnl: -74220, trades: "2,241 笔" },
  { broker: "futu", pnl: 145371, trades: "373 笔" },
];

export function Channels() {
  const { state, toggleSession, toggleAuto, reset } = useDesk();
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="text-2xl font-semibold">三家通道</h2>
        <p className="mt-1 text-sm leading-6 text-dim">
          会话开关只表示你标记这台设备上的券商 App 已登录。过闸之后这里只留下信封，不会替你下单。
        </p>
      </header>
      <ul className="grid gap-2">
        {FACTS.map((row) => (
          <li key={row.broker} className="flex items-baseline justify-between rounded-xl bg-panel px-4 py-3 shadow-card">
            <span className="text-sm">{BROKER[row.broker].short} · {row.trades}</span>
            <span className={clsx("font-mono text-sm tabular-nums", row.pnl < 0 ? "text-cinnabar" : "text-moss")}>
              {formatCny(row.pnl, true)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm leading-6 text-dim">三家费用定义不同，不要用费率横比谁更会做。华泰是负期望策略还在付摩擦。</p>
      {(Object.keys(BROKER) as BrokerId[]).map((id) => {
        const on = state.sessions[id];
        return (
          <Panel key={id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-medium">{BROKER[id].name}</h3>
                <p className="text-sm text-dim">{BROKER[id].app}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => toggleSession(id)}
                className={clsx("min-h-11 rounded-lg px-3 text-sm", on ? "bg-moss text-ink" : "border border-line text-dim")}
              >
                {on ? "会话在线" : "未挂起"}
              </button>
            </div>
            <p className="mt-3 text-sm leading-6">{COPY[id].line}</p>
            <p className="mt-2 text-sm leading-6 text-dim">{COPY[id].why}</p>
          </Panel>
        );
      })}
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-medium">记下之后更新底稿</h3>
            <p className="mt-1 text-sm leading-6 text-dim">关掉的话，信封记下后，要你点「我已在券商确认」，持仓镜像才变。确认也不是成交回报。</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={state.settings.autoConfirm}
            onClick={toggleAuto}
            className={clsx("min-h-11 shrink-0 rounded-lg px-3 text-sm", state.settings.autoConfirm ? "bg-moss text-ink" : "border border-line text-dim")}
          >
            {state.settings.autoConfirm ? "自动" : "手动"}
          </button>
        </div>
      </Panel>
      <button type="button" onClick={reset} className="min-h-11 rounded-lg border border-line text-sm text-dim">
        恢复样本镜像
      </button>
    </div>
  );
}
