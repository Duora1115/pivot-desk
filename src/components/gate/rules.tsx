import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { useDesk } from "@/lib/gate/desk";
import { IMPACT, RULE_CATALOG, formatCny } from "@/lib/gate/engine";
import { Panel } from "@/components/gate/bits";

const MAX = 169350;

export function Rules() {
  const { state, toggleRule, setQ5 } = useDesk();
  const [cap, setCap] = useState(String(state.settings.q5Cny));
  useEffect(() => setCap(String(state.settings.q5Cny)), [state.settings.q5Cny]);
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="text-2xl font-semibold">军规</h2>
        <p className="mt-1 text-sm leading-6 text-dim">
          支点不在这张表里，也关不掉。它是一句逻辑：还在才能加，崩了才退出，换一套说法继续加会被拦住。关掉一条军规只撤掉这一条。样本窗到 2026-10-09，10 月整月还没并进主账。
        </p>
      </header>
      <Panel>
        <p className="text-sm leading-6">
          不要整桶杀掉美股非日内。1–3 日写了计划就留。只砍 4–30 日、隔夜大名义、华泰过夜。也不要停掉所有中概：BABA 正股短线和 09988 短腿是另一格。
        </p>
        <p className="mt-2 text-sm leading-6 text-dim">下面的条是历史盈亏，供血和抽血有重叠，禁止加总。</p>
        <ul className="mt-4 flex flex-col gap-2">
          {IMPACT.map((row) => {
            const width = Math.max(8, Math.round((Math.abs(row.pnl) / MAX) * 100));
            const neg = row.pnl < 0;
            return (
              <li key={row.label} className="flex items-center gap-3">
                <span className="shrink-0 whitespace-nowrap text-xs text-dim">{row.label}</span>
                <span className="block h-2 flex-1 rounded-full bg-raise">
                  <span
                    className={clsx("block h-2 rounded-full", neg ? "bg-cinnabar" : "bg-moss")}
                    style={{ width: `${width}%` }}
                  />
                </span>
                <span className={clsx("w-16 shrink-0 text-right font-mono text-xs tabular-nums", neg ? "text-cinnabar" : "text-moss")}>
                  {formatCny(row.pnl, true)}
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>
      <Panel>
        <label className="block">
          <span className="font-mono text-xs tracking-widest text-dim">隔夜名义上限 CNY</span>
          <input
            inputMode="numeric"
            value={cap}
            onChange={(e) => setCap(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={() => {
              const n = Number(cap);
              if (Number.isFinite(n) && n >= 10000) setQ5(n);
              else setCap(String(state.settings.q5Cny));
            }}
            className="mt-2 min-h-11 w-full rounded-lg border border-line bg-ink px-3 font-mono text-paper outline-none focus:border-brass"
          />
        </label>
        <p className="mt-2 text-sm leading-6 text-dim">
          五分位的平均名义大约 46.6 万。默认 30 万是执行用硬顶，不是统计分位边界。日内不吃这条。
        </p>
      </Panel>
      <ul className="flex flex-col gap-2">
        {RULE_CATALOG.map((rule) => {
          const armed = rule.toggle && state.settings.rules[rule.id] !== false;
          return (
            <li key={rule.id} className="rounded-xl bg-panel p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-dim">{rule.gate} · {rule.level}</p>
                  <h3 className="mt-1 text-base font-medium">{rule.title}</h3>
                </div>
                {rule.toggle && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={armed}
                    onClick={() => toggleRule(rule.id)}
                    className={clsx("relative h-7 w-12 shrink-0 rounded-full", armed ? "bg-cinnabar" : "bg-line")}
                  >
                    <span className={clsx("absolute top-0.5 size-6 rounded-full bg-paper transition-transform", armed ? "translate-x-5" : "translate-x-0.5")} />
                    <span className="sr-only">{armed ? "关闭" : "打开"}{rule.title}</span>
                  </button>
                )}
              </div>
              <p className="mt-2 font-mono text-xs text-dim">{rule.clause}</p>
              <p className="mt-2 text-sm leading-6">{rule.history}</p>
              <p className="text-sm leading-6 text-dim">{rule.ci}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
