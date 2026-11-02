import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { useDesk } from "@/lib/gate/desk";
import { IMPACT, RULE_CATALOG, formatCny, type Ccy, type RulePresetId, type Strategy } from "@/lib/gate/engine";
import { Field, Panel, Seg, TextInput } from "@/components/gate/bits";

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
      <RiskSettings />
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
            aria-label="隔夜名义上限 CNY"
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

function RiskSettings() {
  const { state, setRulePreset, resetRegime } = useDesk();
  const preset = state.settings.presetId;
  return (
    <>
      <Panel>
        <h3 className="text-base font-medium">风控周期</h3>
        <p className="mt-1 text-sm text-dim">两套参数独立切换；历史违规和净值记录不会因切换而删除。</p>
        <div className="mt-3">
          <Seg<RulePresetId>
            value={preset}
            onChange={setRulePreset}
            columns={2}
            options={[
              { value: "conservative-90", label: "90天保守版" },
              { value: "acceptance-20", label: "20日验收版" },
            ]}
          />
        </div>
        <p className="mt-3 text-sm leading-6 text-dim">
          {preset === "conservative-90"
            ? "首30天冻结新增风险；之后单笔≤0.25%、总开放风险≤1%，每日≤2笔、90天≤12笔/6个主动日，48小时冷却。"
            : "R=min(2000元,0.25%净资产)；标的1R/主题4R/组合6R，20日≤80笔，23:30后停新仓，日/周/滚动熔断。"}
        </p>
        <p className="mt-2 font-mono text-xs text-dim">周期起点 {state.settings.regimes[preset].startedAt}</p>
        <button type="button" onClick={() => resetRegime(preset)} className="mt-3 min-h-11 rounded-lg border border-line px-3 text-sm text-paper">
          开始下一周期（保留账本并归档违规）
        </button>
      </Panel>
      <CapitalFx />
      <CalendarSettings />
      <MarkSettings />
      <ViolationSettings />
    </>
  );
}

function CapitalFx() {
  const { state, setNetAsset, setFx } = useDesk();
  return (
    <Panel>
      <h3 className="text-base font-medium">资本与汇率</h3>
      <p className="mt-1 text-sm text-dim">空白表示未知，不会按零计算。90天保守版需要净资产；20日版缺净资产时使用2000元R。</p>
      <div className="mt-3">
        <NumberField label="净流动资产 CNY" value={state.settings.netAssetCny} onCommit={setNetAsset} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {(Object.keys(state.settings.fx) as Ccy[]).map((ccy) => (
          <div key={ccy} className="rounded-lg border border-line p-3">
            <p className="mb-2 font-mono text-xs text-dim">{ccy} → CNY</p>
            <NumberField
              label="汇率"
              value={state.settings.fx[ccy].rate}
              onCommit={(rate) => setFx(ccy, rate, state.settings.fx[ccy].asOf)}
            />
            <label className="mt-2 block">
              <span className="mb-1 block font-mono text-xs text-dim">汇率日期</span>
              <TextInput
                aria-label={`${ccy}汇率日期`}
                type="date"
                value={state.settings.fx[ccy].asOf}
                onChange={(event) => setFx(ccy, state.settings.fx[ccy].rate, event.target.value)}
              />
            </label>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CalendarSettings() {
  const { state, addCalendarWindow, removeCalendarWindow } = useDesk();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  return (
    <Panel>
      <h3 className="text-base font-medium">事前日历窗口</h3>
      <p className="mt-1 text-sm text-dim">窗口创建时间必须早于订单。90天保守版只在窗口内允许新增风险。</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="开始">
          <TextInput aria-label="窗口开始" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} />
        </Field>
        <Field label="结束">
          <TextInput aria-label="窗口结束" type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} />
        </Field>
      </div>
      <button
        type="button"
        disabled={!start || !end}
        onClick={() => {
          const now = new Date().toISOString();
          addCalendarWindow({ id: crypto.randomUUID(), start: new Date(start).toISOString(), end: new Date(end).toISOString(), createdAt: now });
          setStart("");
          setEnd("");
        }}
        className="mt-3 min-h-11 rounded-lg bg-moss px-4 text-sm font-medium text-ink disabled:opacity-40"
      >
        记录窗口
      </button>
      <ul className="mt-3 flex flex-col gap-2">
        {state.settings.calendarWindows.map((window) => (
          <li key={window.id} className="flex items-center justify-between gap-3 rounded-lg bg-ink p-3 text-xs">
            <span className="min-w-0 break-all font-mono">{window.start} → {window.end}</span>
            <button type="button" aria-label={`删除窗口${window.start}`} onClick={() => removeCalendarWindow(window.id)} className="min-h-11 shrink-0 px-2 text-cinnabar">删除</button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function MarkSettings() {
  const { state, saveDailyMark, removeDailyMark } = useDesk();
  const marks = [...state.settings.dailyMarks].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  return (
    <Panel>
      <h3 className="text-base font-medium">Daily marks</h3>
      <p className="mt-1 text-sm text-dim">账户行不选策略；策略行用于日内/波段停止线。非交易日也要连续记录，数值空白即未知。</p>
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const strategy = String(form.get("strategy") || "") as Strategy | "";
          saveDailyMark({
            date: String(form.get("date")),
            tradingDay: form.get("tradingDay") === "on",
            strategy: strategy || null,
            realizedCny: nullableNumber(form, "realized"),
            unrealizedCny: nullableNumber(form, "unrealized"),
            feesCny: nullableNumber(form, "fees"),
            fxImpactCny: nullableNumber(form, "fxImpact"),
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="日期"><TextInput aria-label="净值日期" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
          <Field label="策略">
            <select aria-label="净值策略" name="strategy" defaultValue="" className="min-h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm">
              <option value="">账户</option>
              <option value="intraday">日内</option>
              <option value="swing">波段</option>
              <option value="core">配置</option>
              <option value="event">事件</option>
            </select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="已实现 CNY"><TextInput aria-label="mark已实现" name="realized" inputMode="decimal" /></Field>
          <Field label="未实现变动 CNY"><TextInput aria-label="mark未实现" name="unrealized" inputMode="decimal" /></Field>
          <Field label="费用 CNY"><TextInput aria-label="mark费用" name="fees" inputMode="decimal" /></Field>
          <Field label="汇率影响 CNY"><TextInput aria-label="mark汇率影响" name="fxImpact" inputMode="decimal" /></Field>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="tradingDay" defaultChecked /> 交易日</label>
        <button type="submit" className="min-h-11 rounded-lg bg-moss px-4 text-sm font-medium text-ink">保存净值记录</button>
      </form>
      <ul className="mt-3 flex flex-col gap-2">
        {marks.map((mark) => (
          <li key={`${mark.date}-${mark.strategy ?? "account"}`} className="flex items-center justify-between gap-2 rounded-lg bg-ink p-3 font-mono text-xs">
            <span>{mark.date} · {mark.strategy ?? "账户"} · {mark.tradingDay ? "交易日" : "非交易日"}</span>
            <button type="button" onClick={() => removeDailyMark(mark.date, mark.strategy)} className="min-h-11 px-2 text-cinnabar">删除</button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ViolationSettings() {
  const { state, recordViolation } = useDesk();
  const [kind, setKind] = useState("external");
  const [detail, setDetail] = useState("");
  const regime = state.settings.regimes[state.settings.presetId];
  return (
    <Panel>
      <h3 className="text-base font-medium">违规记录 · {regime.violations.length}</h3>
      <p className="mt-1 text-sm text-dim">只记录已发生或券商侧已确认的违规；被闸门拦截的尝试不在这里记违规。</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="类型"><TextInput aria-label="违规类型" mono={false} value={kind} onChange={(event) => setKind(event.target.value)} /></Field>
        <Field label="事实说明"><TextInput aria-label="违规说明" mono={false} value={detail} onChange={(event) => setDetail(event.target.value)} /></Field>
      </div>
      <button
        type="button"
        disabled={!kind.trim() || !detail.trim()}
        onClick={() => { recordViolation(kind.trim(), detail.trim()); setDetail(""); }}
        className="mt-3 min-h-11 rounded-lg border border-cinnabar px-4 text-sm text-cinnabar disabled:opacity-40"
      >
        登记已发生违规
      </button>
    </Panel>
  );
}

function NumberField({ label, value, onCommit }: { label: string; value: number | null; onCommit: (value: number | null) => void }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-xs text-dim">{label}</span>
      <TextInput
        aria-label={label}
        inputMode="decimal"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (!text.trim()) return onCommit(null);
          const parsed = Number(text);
          onCommit(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
        }}
      />
    </label>
  );
}

function nullableNumber(form: FormData, name: string): number | null {
  const raw = String(form.get(name) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
