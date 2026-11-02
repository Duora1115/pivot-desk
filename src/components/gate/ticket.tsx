import { Ban, ChevronDown, Send } from "lucide-react";
import { useDesk } from "@/lib/gate/desk";
import {
  BROKER,
  PRESETS,
  assetLabel,
  ccyOf,
  compareCloseRecency,
  daysBetween,
  findPosition,
  formatCny,
  intentLabel,
  needsPlanPanel,
  type Asset,
  type BrokerId,
  type Hit,
  type Intent,
  type Market,
  type MarketStage,
  type Setup,
  type Strategy,
  type Tag,
  DESK_DATE,
} from "@/lib/gate/engine";
import { Field, Panel, Seg, StampButton, TextInput, decisionTone, decisionWord } from "@/components/gate/bits";

const HOLDS = [
  { value: 0, label: "当日" },
  { value: 1, label: "1日" },
  { value: 2, label: "2日" },
  { value: 3, label: "3日" },
  { value: 7, label: "7日" },
  { value: 14, label: "14日" },
  { value: 30, label: "30日" },
  { value: 31, label: "31日" },
];

const control =
  "min-h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm text-paper outline-none focus:border-brass";

export function Ticket() {
  const { state, verdict, setDraft, setPlan, applyPreset } = useDesk();
  const d = state.draft;
  const opening = d.intent === "open" || d.intent === "add" || d.intent === "t0";
  const bookPos = findPosition(state.positions, d);
  const anchor = state.closes
    .filter((c) => {
      if (typeof c.pnlCny !== "number" || c.pnlCny >= 0) return false;
      const age = daysBetween(c.closedAt, DESK_DATE);
      return Number.isFinite(age) && age >= 0 && age <= 3;
    })
    .sort(compareCloseRecency)[0];
  const sample = PRESETS.find(
    (p) =>
      p.draft.broker === d.broker &&
      p.draft.symbol === d.symbol &&
      p.draft.intent === d.intent &&
      p.draft.pivotNote === d.pivotNote &&
      p.draft.pivotState === d.pivotState &&
      p.draft.qty === d.qty,
  );

  const setIntent = (intent: Intent) => {
    const side = intent === "reduce" || intent === "close" ? "sell" : "buy";
    setDraft({ intent, side, holdDays: intent === "t0" ? 0 : d.holdDays });
  };

  const needsPlan = needsPlanPanel(d, verdict);

  return (
    <div className="flex flex-col gap-4">
      <div className="lg:hidden" aria-live="polite" data-decision={verdict.decision}>
        <p className={`text-4xl font-semibold ${decisionTone(verdict.decision)}`}>{decisionWord(verdict.decision)}</p>
        <p className="mt-1 text-sm text-paper">{verdict.primary?.title ?? "写下一笔"}</p>
      </div>

      {anchor && opening && (
        <p className="text-sm text-dim">
          三日内亏过 {anchor.symbol}，新开不要超过 {formatCny(anchor.notionalCny)}。
        </p>
      )}

      <Panel>
        <div className="flex flex-col gap-5">
          <Field label="样本">
            <select
              aria-label="样本"
              className={control}
              value={sample?.id ?? ""}
              onChange={(e) => {
                if (e.target.value) applyPreset(e.target.value);
              }}
            >
              <option value="">自定义</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="代码">
              <TextInput aria-label="代码" value={d.symbol} onChange={(e) => setDraft({ symbol: e.target.value })} autoCapitalize="characters" autoComplete="off" />
            </Field>
            <Field label="名称">
              <TextInput aria-label="名称" mono={false} value={d.name} onChange={(e) => setDraft({ name: e.target.value })} autoComplete="off" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={`数量 · ${d.asset === "option" ? "张" : "股"}`}>
              <TextInput aria-label="数量" inputMode="decimal" value={d.qty} onChange={(e) => setDraft({ qty: e.target.value })} />
            </Field>
            <Field label={`价格 · ${ccyOf(d.market)}`}>
              <TextInput aria-label="价格" inputMode="decimal" value={d.price} onChange={(e) => setDraft({ price: e.target.value })} />
            </Field>
          </div>

          <Field label="逻辑支点">
            <TextInput aria-label="逻辑支点" mono={false} value={d.pivotNote} onChange={(e) => setDraft({ pivotNote: e.target.value })} />
          </Field>
          {bookPos && (
            <Field label="这一句还在吗">
              <Seg<"holds" | "gone">
                value={d.pivotState}
                onChange={(pivotState) => setDraft({ pivotState })}
                columns={2}
                options={[
                  { value: "holds", label: "还在" },
                  { value: "gone", label: "崩了" },
                ]}
              />
            </Field>
          )}
          <p className="-mt-2 text-sm text-dim">
            {bookPos && bookPos.pivotNote
              ? `账上是「${bookPos.pivotNote}」。还在就加，崩了才出。`
              : "写下为什么买。以后只问这一句还在不在。"}
          </p>

          <Field label="做什么">
            <Seg<Intent>
              value={d.intent}
              onChange={setIntent}
              columns={5}
              options={[
                { value: "open", label: "开仓" },
                { value: "add", label: "加仓" },
                { value: "reduce", label: "减仓" },
                { value: "close", label: "平仓" },
                { value: "t0", label: "T0" },
              ]}
            />
          </Field>

          <p className="font-mono text-xs tracking-wide text-dim">
            {BROKER[d.broker].short} · {d.market === "A" ? "A股" : d.market === "HK" ? "港股" : "美股"} · {assetLabel(d.asset)} · 有效{" "}
            {verdict.hold <= 0 ? "当日" : `${verdict.hold}日`} · {formatCny(verdict.orderNotionalCny)}
          </p>

          <details className="border-t border-line pt-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm text-dim [&::-webkit-details-marker]:hidden">
              券商、期限、标签
              <ChevronDown className="size-4" />
            </summary>
            <div className="flex flex-col gap-4 pt-3">
              <Field label="券商">
                <Seg<BrokerId>
                  value={d.broker}
                  onChange={(broker) => setDraft({ broker })}
                  columns={3}
                  options={(Object.keys(BROKER) as BrokerId[]).map((id) => ({ value: id, label: BROKER[id].short }))}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="市场">
                  <Seg<Market>
                    value={d.market}
                    onChange={(market) => setDraft({ market })}
                    columns={3}
                    options={[
                      { value: "A", label: "A股" },
                      { value: "HK", label: "港股" },
                      { value: "US", label: "美股" },
                    ]}
                  />
                </Field>
                <Field label="品种">
                  <Seg<Asset>
                    value={d.asset}
                    onChange={(asset) => setDraft({ asset })}
                    columns={4}
                    options={[
                      { value: "stock", label: "正股" },
                      { value: "etf", label: "ETF" },
                      { value: "option", label: "期权" },
                      { value: "bond", label: "转债" },
                    ]}
                  />
                </Field>
              </div>
              <Field label="新开仓打算拿多久">
                <Seg value={d.holdDays} onChange={(holdDays) => setDraft({ holdDays })} columns={4} options={HOLDS} />
              </Field>
              <p className="text-sm text-dim">{bookPos ? "已有仓按开仓日算，上面的按钮不改时钟。" : "没有旧仓时，按你选的期限。"}</p>
              <Field label="标签">
                <Seg<Tag>
                  value={d.tag}
                  onChange={(tag) => setDraft({ tag })}
                  columns={5}
                  options={[
                    { value: "none", label: "无" },
                    { value: "intraday", label: "日内" },
                    { value: "average", label: "摊平" },
                    { value: "chase", label: "追涨" },
                    { value: "credit", label: "信用" },
                  ]}
                />
              </Field>
            </div>
          </details>
        </div>
      </Panel>

      <ContractPanel />

      {needsPlan && (
        <Panel>
          <h3 className="text-base font-medium">历史限额审批</h3>
          <p className="mt-1 text-sm text-dim">本笔名义上限与例外审批。Q5 不能靠它豁免。</p>
          <div className="mt-3">
            <Field label="本笔上限 CNY">
              <TextInput aria-label="本笔上限" inputMode="decimal" value={d.plan.maxNotional} onChange={(e) => setPlan({ maxNotional: e.target.value })} />
            </Field>
          </div>
          <button
            type="button"
            aria-pressed={d.plan.approved}
            onClick={() => setPlan({ approved: !d.plan.approved })}
            className={`mt-3 min-h-11 rounded-lg border px-3 text-sm ${d.plan.approved ? "border-moss text-moss" : "border-line text-dim"}`}
          >
            {d.plan.approved ? "限额审批已开" : "打开限额审批"}
          </button>
        </Panel>
      )}

      {d.asset === "option" && verdict.hold >= 4 && opening && (
        <Panel>
          <h3 className="text-base font-medium">期权退出</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="退出条件">
              <TextInput aria-label="退出条件" mono={false} value={d.optionExit} onChange={(e) => setDraft({ optionExit: e.target.value })} />
            </Field>
            <Field label="最大亏损 CNY">
              <TextInput aria-label="最大亏损" inputMode="decimal" value={d.optionMaxLoss} onChange={(e) => setDraft({ optionMaxLoss: e.target.value })} />
            </Field>
          </div>
        </Panel>
      )}

      {d.market === "A" && verdict.hold >= 4 && verdict.hold <= 30 && opening && d.intent !== "t0" && (
        <Panel>
          <Field label="第 4 天：错在哪，什么价减">
            <TextInput aria-label="复盘" mono={false} value={d.reviewNote} onChange={(e) => setDraft({ reviewNote: e.target.value })} />
          </Field>
        </Panel>
      )}

      <div className="lg:hidden">
        <HitList />
      </div>
    </div>
  );
}

function ContractPanel() {
  const { state, verdict, setPlan } = useDesk();
  const d = state.draft;
  const reducing = d.intent === "reduce" || d.intent === "close";
  if (reducing) {
    return (
      <Panel>
        <h3 className="text-base font-medium">降险单</h3>
        <p className="mt-1 text-sm leading-6 text-dim">减仓和平仓不因冷却、频率、预算或熔断被阻止；确认时仍会核对当前仓位。</p>
      </Panel>
    );
  }
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-medium">事前合同</h3>
          <p className="mt-1 break-all font-mono text-xs text-dim">{d.plan.id} · {d.plan.createdAt}</p>
        </div>
        <p className="shrink-0 font-mono text-sm text-paper">
          {verdict.risk.riskCny === null ? "R 未知" : `R ${formatCny(verdict.risk.riskCny)}`}
        </p>
      </div>
      {verdict.risk.missing.length > 0 && (
        <div role="alert" tabIndex={-1} className="mt-3 rounded-lg border border-cinnabar p-3 text-sm text-cinnabar">
          待补：{verdict.risk.missing.join("、")}
        </div>
      )}
      <div className="mt-4 flex flex-col gap-4">
        <Field label="策略身份 · 成交后不可改">
          <Seg<Strategy | "">
            value={d.plan.strategy ?? ""}
            onChange={(strategy) => setPlan({ strategy: strategy || null })}
            columns={4}
            options={[
              { value: "", label: "未选" },
              { value: "intraday", label: "日内" },
              { value: "swing", label: "波段" },
              { value: "core", label: "配置" },
              { value: "event", label: "事件" },
            ]}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="市场阶段">
            <Seg<MarketStage>
              value={d.plan.marketStage ?? "unknown"}
              onChange={(marketStage) => setPlan({ marketStage })}
              columns={5}
              options={[
                { value: "1", label: "1" },
                { value: "2", label: "2" },
                { value: "3", label: "3" },
                { value: "4", label: "4" },
                { value: "unknown", label: "未知" },
              ]}
            />
          </Field>
          <Field label="交易设置">
            <Seg<Setup>
              value={d.plan.setup ?? "standard"}
              onChange={(setup) => setPlan({ setup })}
              columns={4}
              options={[
                { value: "standard", label: "标准" },
                { value: "bottom-fishing", label: "抄底" },
                { value: "stage4-bounce", label: "四段反弹" },
                { value: "event", label: "事件" },
              ]}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="失效价">
            <TextInput aria-label="失效价" inputMode="decimal" value={d.plan.invalidation} onChange={(e) => setPlan({ invalidation: e.target.value })} />
          </Field>
          <Field label="预期持有天数">
            <TextInput aria-label="预期持有天数" inputMode="numeric" value={d.plan.maxDays} onChange={(e) => setPlan({ maxDays: e.target.value })} />
          </Field>
          <Field label={`费用预算 · ${ccyOf(d.market)}`}>
            <TextInput aria-label="费用预算" inputMode="decimal" value={d.plan.feeBudget ?? ""} onChange={(e) => setPlan({ feeBudget: e.target.value })} />
          </Field>
        </div>
        <Field label="开仓依据">
          <TextInput aria-label="开仓依据" mono={false} value={d.plan.thesis} onChange={(e) => setPlan({ thesis: e.target.value })} />
        </Field>
        <Field label="反方论据">
          <TextInput aria-label="反方论据" mono={false} value={d.plan.counterargument ?? ""} onChange={(e) => setPlan({ counterargument: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="加仓条件">
            <TextInput aria-label="加仓条件" mono={false} value={d.plan.addConditions ?? ""} onChange={(e) => setPlan({ addConditions: e.target.value })} />
          </Field>
          <Field label="退出条件">
            <TextInput aria-label="退出条件" mono={false} value={d.plan.exitConditions ?? ""} onChange={(e) => setPlan({ exitConditions: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="关联主题">
            <TextInput aria-label="关联主题" mono={false} value={d.plan.correlationGroup ?? ""} onChange={(e) => setPlan({ correlationGroup: e.target.value })} />
          </Field>
          {d.plan.strategy === "event" && (
            <Field label="事件日期">
              <TextInput aria-label="事件日期" type="date" value={d.plan.eventDate ?? ""} onChange={(e) => setPlan({ eventDate: e.target.value })} />
            </Field>
          )}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 font-mono text-xs text-dim">
        <p>计划R {verdict.risk.riskR === null ? "未知" : verdict.risk.riskR.toFixed(3)}</p>
        <p>现有开放风险 {verdict.open.totalCny === null ? `未知 ${verdict.open.unknown.length} 项` : formatCny(verdict.open.totalCny)}</p>
      </div>
    </Panel>
  );
}

function HitCard({ hit }: { hit: Hit }) {
  return (
    <li className="rounded-xl bg-panel px-3 py-3 shadow-card">
      <p className={`text-sm font-medium ${hit.severity === "block" ? "text-cinnabar" : hit.severity === "review" ? "text-brass" : "text-paper"}`}>
        {hit.title}
      </p>
      <p className="mt-1 text-sm leading-6 text-dim">{hit.detail}</p>
    </li>
  );
}

export function HitList() {
  const { verdict } = useDesk();
  const primary = verdict.primary;
  const rest = verdict.hits.filter((h) => h !== primary);
  if (!primary && rest.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {primary && (
        <ul>
          <HitCard hit={primary} />
        </ul>
      )}
      {rest.length > 0 && (
        <details>
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm text-dim [&::-webkit-details-marker]:hidden">
            另外 {rest.length} 条
          </summary>
          <ul className="flex flex-col gap-2">
            {rest.map((h) => (
              <HitCard key={`${h.ruleId}-${h.severity}-${h.title}`} hit={h} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function GateAction({ compact = false }: { compact?: boolean }) {
  const { state, verdict, submit } = useDesk();
  const linked = state.sessions[state.draft.broker];
  const word = decisionWord(verdict.decision);
  const app = BROKER[state.draft.broker].app;
  let label = `${word} · 写进拦截簿`;
  if (verdict.decision === "review") label = "补完复盘才能记下";
  else if (verdict.decision === "pass") label = linked ? `记下信封 · ${app}` : "章过了 · 通道未挂起";
  return (
    <div className="flex flex-col gap-2">
      {compact && (
        <p className={`text-sm ${decisionTone(verdict.decision)}`}>
          <span className="font-medium">{word}</span>
          <span className="text-dim"> · {verdict.primary?.title}</span>
        </p>
      )}
      <StampButton decision={verdict.decision} disabled={verdict.decision === "review"} onClick={submit}>
        {verdict.decision === "block" ? <Ban className="size-4" /> : <Send className="size-4" />}
        {label}
      </StampButton>
    </div>
  );
}

export function VerdictAside() {
  const { state, verdict } = useDesk();
  return (
    <aside className="hidden w-80 shrink-0 lg:block">
      <div className="sticky top-4 flex flex-col gap-4">
        <Panel>
          <p className="font-mono text-xs tracking-widest text-dim">闸门</p>
          <h2 className={`mt-1 text-5xl font-semibold ${decisionTone(verdict.decision)}`} data-decision={verdict.decision}>
            {decisionWord(verdict.decision)}
          </h2>
          <p className="mt-2 text-sm leading-6">{verdict.primary?.title}</p>
          <div className="mt-4">
            <GateAction />
          </div>
          <p className="mt-3 font-mono text-xs leading-5 text-dim">
            {intentLabel(state.draft.intent)} · 有效 {verdict.hold <= 0 ? "当日" : `${verdict.hold}日`} · {formatCny(verdict.orderNotionalCny)}
          </p>
        </Panel>
        <HitList />
      </div>
    </aside>
  );
}
