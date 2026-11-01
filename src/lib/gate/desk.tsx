import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import {
  DESK_DATE,
  emptyPlan,
  evaluate,
  holdOf,
  makeSeed,
  nid,
  settle,
  ticketNo,
  type BrokerId,
  type DeskState,
  type Draft,
  type LedgerItem,
  type Plan,
  type Verdict,
  PRESETS,
} from "@/lib/gate/engine";

const KEY = "pivot-desk-v2";

export type Tab = "ticket" | "book" | "outbox" | "rules" | "channels";

type Action =
  | { type: "hydrate"; state: DeskState }
  | { type: "draft"; patch: Partial<Draft> }
  | { type: "plan"; patch: Partial<Plan> }
  | { type: "preset"; id: string }
  | { type: "rule"; id: string }
  | { type: "q5"; value: number }
  | { type: "auto" }
  | { type: "session"; broker: BrokerId }
  | { type: "flash"; text: string }
  | { type: "commit"; item: LedgerItem; flash: string }
  | { type: "deliver"; id: string; ticket: string }
  | { type: "requeue"; id: string }
  | { type: "confirm"; id: string }
  | { type: "reset" };

function patchDraft(draft: Draft, patch: Partial<Draft>): Draft {
  const next = { ...draft, ...patch };
  if (patch.plan) next.plan = { ...draft.plan, ...patch.plan };
  return next;
}

function reducer(state: DeskState, action: Action): DeskState {
  switch (action.type) {
    case "hydrate":
      return { ...action.state, flash: "" };
    case "draft":
      return { ...state, draft: patchDraft(state.draft, action.patch) };
    case "plan":
      return { ...state, draft: { ...state.draft, plan: { ...state.draft.plan, ...action.patch } } };
    case "preset": {
      const preset = PRESETS.find((p) => p.id === action.id);
      return preset ? { ...state, draft: structuredClone(preset.draft) } : state;
    }
    case "rule":
      return {
        ...state,
        settings: {
          ...state.settings,
          rules: { ...state.settings.rules, [action.id]: state.settings.rules[action.id] === false },
        },
      };
    case "q5":
      return { ...state, settings: { ...state.settings, q5Cny: action.value } };
    case "auto":
      return { ...state, settings: { ...state.settings, autoConfirm: !state.settings.autoConfirm } };
    case "session":
      return { ...state, sessions: { ...state.sessions, [action.broker]: !state.sessions[action.broker] } };
    case "flash":
      return { ...state, flash: action.text };
    case "commit":
      return { ...state, ledger: [action.item, ...state.ledger], flash: action.flash };
    case "deliver": {
      const item = state.ledger.find((row) => row.id === action.id);
      if (!item || item.status !== "queued") return state;
      const app = item.broker === "gf" ? "易淘金" : item.broker === "ht" ? "涨乐全球通" : "牛牛";
      if (!state.sessions[item.broker]) {
        return {
          ...state,
          ledger: state.ledger.map((row) => (row.id === action.id ? { ...row, status: "parked" } : row)),
          flash: `${item.symbol} 闸已过，${app}会话掉线，改停在待挂起。`,
        };
      }
      const delivered: LedgerItem = {
        ...item,
        status: "delivered",
        ticket: action.ticket,
        confirmed: state.settings.autoConfirm,
      };
      const settled = state.settings.autoConfirm
        ? settle(state.positions, state.closes, delivered)
        : { positions: state.positions, closes: state.closes };
      return {
        ...state,
        ledger: state.ledger.map((row) => (row.id === action.id ? delivered : row)),
        positions: settled.positions,
        closes: settled.closes,
        flash: state.settings.autoConfirm
          ? `信封已记入转发簿。请到${app}里手工下单。`
          : `信封已记下。你在这里确认后，底稿才变。券商里还要自己下。`,
      };
    }
    case "requeue": {
      const item = state.ledger.find((row) => row.id === action.id);
      if (!item || item.status !== "parked") return state;
      return {
        ...state,
        ledger: state.ledger.map((row) => (row.id === action.id ? { ...row, status: "queued", confirmed: false, ticket: undefined } : row)),
        flash: "这封信封重新排队。还没送到券商。",
      };
    }
    case "confirm": {
      const item = state.ledger.find((row) => row.id === action.id);
      if (!item || item.status !== "delivered" || item.confirmed || item.decision !== "pass") return state;
      const next = { ...item, confirmed: true };
      const settled = settle(state.positions, state.closes, next);
      return {
        ...state,
        ledger: state.ledger.map((row) => (row.id === action.id ? next : row)),
        positions: settled.positions,
        closes: settled.closes,
        flash: "底稿已按确认更新。券商里的成交以你手工下的那笔为准。",
      };
    }
    case "reset":
      return { ...makeSeed(), flash: "已恢复审计样本镜像。" };
    default:
      return state;
  }
}

function sanitize(raw: unknown): DeskState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as DeskState;
  if (s.version !== 2 || !s.draft?.plan || !s.settings || !Array.isArray(s.positions) || !Array.isArray(s.ledger)) return null;
  if (!s.sessions || !Array.isArray(s.closes) || typeof s.settings.rules !== "object" || s.settings.rules === null) return null;
  if (!Number.isFinite(Number(s.settings.q5Cny))) return null;
  s.settings.q5Cny = Number(s.settings.q5Cny);
  s.draft.pivotPrice = typeof s.draft.pivotPrice === "string" ? s.draft.pivotPrice : "";
  s.draft.pivotNote = typeof s.draft.pivotNote === "string" ? s.draft.pivotNote : "";
  s.draft.pivotState = s.draft.pivotState === "gone" ? "gone" : "holds";
  s.positions = s.positions.map((p) => ({
    ...p,
    pivotPrice: Number(p.pivotPrice) || 0,
    pivotNote: typeof p.pivotNote === "string" ? p.pivotNote : "",
  }));
  return s;
}

interface DeskApi {
  state: DeskState;
  verdict: Verdict;
  tab: Tab;
  setTab: (tab: Tab) => void;
  setDraft: (patch: Partial<Draft>) => void;
  setPlan: (patch: Partial<Plan>) => void;
  applyPreset: (id: string) => void;
  toggleRule: (id: string) => void;
  setQ5: (value: number) => void;
  toggleAuto: () => void;
  toggleSession: (broker: BrokerId) => void;
  submit: () => void;
  requeue: (id: string) => void;
  confirm: (id: string) => void;
  reset: () => void;
  loadPosition: (id: string, mode: "close" | "add") => void;
}

const Ctx = createContext<DeskApi | null>(null);

export function DeskProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, makeSeed);
  const [tab, setTab] = useReducer((_: Tab, next: Tab) => next, "ticket" as Tab);
  const [ready, setReady] = useState(false);
  const timers = useRef<number[]>([]);
  const busy = useRef(false);

  useEffect(() => {
    try {
      const saved = sanitize(JSON.parse(localStorage.getItem(KEY) || "null"));
      if (saved) dispatch({ type: "hydrate", state: saved });
    } catch {
      /* bad JSON falls through; the next effect replaces it with the seed */
    }
    setReady(true);
    return () => timers.current.forEach((id) => window.clearTimeout(id));
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...state, flash: "" }));
    } catch {
      /* private mode or quota */
    }
  }, [state, ready]);

  useEffect(() => {
    if (!state.flash) return;
    const timer = window.setTimeout(() => dispatch({ type: "flash", text: "" }), 3400);
    return () => window.clearTimeout(timer);
  }, [state.flash]);

  const verdict = useMemo(() => evaluate(state.draft, state), [state]);

  const api = useMemo<DeskApi>(() => {
    const arm = (id: string, broker: BrokerId) => {
      busy.current = true;
      const ticket = ticketNo(broker);
      const timer = window.setTimeout(() => {
        busy.current = false;
        dispatch({ type: "deliver", id, ticket });
      }, 680);
      timers.current.push(timer);
    };
    return {
      state,
      verdict,
      tab,
      setTab,
      setDraft: (patch) => dispatch({ type: "draft", patch }),
      setPlan: (patch) => dispatch({ type: "plan", patch }),
      applyPreset: (id) => dispatch({ type: "preset", id }),
      toggleRule: (id) => dispatch({ type: "rule", id }),
      setQ5: (value) => dispatch({ type: "q5", value }),
      toggleAuto: () => dispatch({ type: "auto" }),
      toggleSession: (broker) => dispatch({ type: "session", broker }),
      confirm: (id) => dispatch({ type: "confirm", id }),
      reset: () => dispatch({ type: "reset" }),
      requeue: (id) => {
        const item = state.ledger.find((row) => row.id === id);
        if (!item || item.status !== "parked" || busy.current) return;
        if (!state.sessions[item.broker]) {
          dispatch({ type: "flash", text: "会话还没挂上。" });
          return;
        }
        dispatch({ type: "requeue", id });
        arm(id, item.broker);
      },
      submit: () => {
        if (busy.current) return;
        const v = evaluate(state.draft, state);
        if (v.decision === "review") {
          dispatch({ type: "flash", text: "复盘没写完，不能记入转发簿。" });
          return;
        }
        const d = state.draft;
        const linked = state.sessions[d.broker];
        const item: LedgerItem = {
          id: nid(),
          at: new Date().toISOString(),
          decision: v.decision,
          status: v.decision === "block" ? "blocked" : linked ? "queued" : "parked",
          confirmed: false,
          broker: d.broker,
          market: d.market,
          symbol: v.symbol,
          name: d.name.trim() || v.symbol,
          asset: d.asset,
          side: d.side,
          intent: d.intent,
          qty: v.qty,
          price: v.price,
          currency: v.currency,
          notionalCny: v.orderNotionalCny,
          hold: v.hold,
          pivotPrice: Number(d.pivotPrice) || 0,
          pivotNote: d.pivotNote.trim(),
          stamp: v.primary?.title ?? "无戳记",
          hits: v.hits.map(({ ruleId, title, severity, clause }) => ({ ruleId, title, severity, clause })),
        };
        if (item.status === "blocked") {
          busy.current = true;
          window.setTimeout(() => {
            busy.current = false;
          }, 400);
          dispatch({ type: "commit", item, flash: `已拦截 · ${item.stamp}` });
          return;
        }
        if (item.status === "parked") {
          busy.current = true;
          window.setTimeout(() => {
            busy.current = false;
          }, 400);
          dispatch({ type: "commit", item, flash: "章过了。通道没挂上，信封停在待挂起。还没送到券商。" });
          return;
        }
        dispatch({ type: "commit", item, flash: "信封已记下，尚未送出。请到券商 App 里手工下单。" });
        arm(item.id, item.broker);
      },
      loadPosition: (id, mode) => {
        const pos = state.positions.find((p) => p.id === id);
        if (!pos) return;
        const held = holdOf(pos, DESK_DATE);
        dispatch({
          type: "draft",
          patch: {
            broker: pos.broker,
            market: pos.market,
            symbol: pos.symbol,
            name: pos.name,
            asset: pos.asset,
            side: mode === "close" ? "sell" : "buy",
            intent: mode === "close" ? "close" : "add",
            qty: mode === "close" ? String(pos.qty) : pos.asset === "option" ? "1" : "100",
            price: String(pos.price),
            holdDays: mode === "close" ? 0 : held <= 0 ? 0 : held <= 3 ? held : held <= 30 ? held : 45,
            tag: "none",
            plan: emptyPlan(),
            optionExit: "",
            optionMaxLoss: "",
            reviewNote: "",
            pivotPrice: pos.pivotPrice ? String(pos.pivotPrice) : "",
            pivotNote: pos.pivotNote ?? "",
            pivotState: mode === "close" ? "gone" : "holds",
          },
        });
        setTab("ticket");
      },
    };
  }, [state, tab, verdict]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDesk(): DeskApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Desk missing");
  return ctx;
}
