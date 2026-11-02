import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  emptyPlan,
  holdOf,
  makeSeed,
  nid,
  ticketNo,
  type BrokerId,
  type CalendarWindow,
  type Ccy,
  type DailyMark,
  type DeskState,
  type Draft,
  type Plan,
  type Position,
  type RulePresetId,
} from "@/lib/gate/engine";
import { deskReducer, migrateDeskState, type DeskAction } from "@/lib/gate/desk-state";
import { evaluateWithPreset, type PresetVerdict } from "@/lib/gate/preset";
import { shanghaiDate } from "@/lib/gate/ledger";

const KEY = "pivot-desk-v2";

export type Tab = "ticket" | "book" | "outbox" | "rules" | "channels";

function readLatest(): DeskState | null {
  try {
    return migrateDeskState(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    return null;
  }
}

async function withDeskLock(run: () => void): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    await navigator.locks.request(`${KEY}-write`, run);
    return;
  }
  const lockKey = `${KEY}-lock`;
  const owner = crypto.randomUUID();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const now = Date.now();
    let current: { owner: string; expires: number } | null = null;
    try { current = JSON.parse(localStorage.getItem(lockKey) || "null"); } catch { /* replace malformed lease */ }
    if (!current || current.expires < now) {
      localStorage.setItem(lockKey, JSON.stringify({ owner, expires: now + 2000 }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const confirmed = JSON.parse(localStorage.getItem(lockKey) || "null") as { owner?: string } | null;
      if (confirmed?.owner === owner) {
        try {
          run();
          return;
        } finally {
          const latest = JSON.parse(localStorage.getItem(lockKey) || "null") as { owner?: string } | null;
          if (latest?.owner === owner) localStorage.removeItem(lockKey);
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("desk write lock timed out");
}

interface DeskApi {
  state: DeskState;
  verdict: PresetVerdict;
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
  setRulePreset: (id: RulePresetId) => void;
  setNetAsset: (value: number | null) => void;
  setFx: (ccy: Ccy, rate: number | null, asOf: string) => void;
  updatePosition: (id: string, patch: Partial<Position>) => void;
  setActualFee: (id: string, value: number | null) => void;
  addCalendarWindow: (window: CalendarWindow) => void;
  removeCalendarWindow: (id: string) => void;
  saveDailyMark: (mark: DailyMark) => void;
  removeDailyMark: (date: string, strategy?: DailyMark["strategy"]) => void;
  recordViolation: (kind: string, detail: string) => void;
  resetRegime: (id: RulePresetId) => void;
}

const Ctx = createContext<DeskApi | null>(null);

export function DeskProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DeskState>(makeSeed);
  const stateRef = useRef(state);
  const [tab, setTab] = useState<Tab>("ticket");
  const timers = useRef(new Map<string, number>());
  const busy = useRef(false);

  const commit = useCallback((next: DeskState, persist = true) => {
    const mutated = persist ? { ...next, mutationId: crypto.randomUUID() } : next;
    stateRef.current = mutated;
    setState(mutated);
    if (!persist) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...mutated, flash: "" }));
    } catch {
      /* private mode or quota */
    }
  }, []);

  const send = useCallback(async (action: DeskAction) => {
    try {
      await withDeskLock(() => {
        const current = stateRef.current;
        const stored = readLatest();
        const base = stored && stored.revision >= current.revision ? stored : current;
        const next = deskReducer(base, action);
        if (next !== base) commit(next);
      });
    } catch {
      commit({ ...stateRef.current, flash: "暂时无法取得账本写入锁，请稍后重试。" }, false);
    }
  }, [commit]);

  const arm = useCallback((id: string, broker: BrokerId) => {
    if (timers.current.has(id)) return;
    const ticket = ticketNo(broker);
    const timer = window.setTimeout(() => {
      timers.current.delete(id);
      busy.current = false;
      send({ type: "deliver", id, ticket, at: new Date().toISOString() });
    }, 680);
    timers.current.set(id, timer);
  }, [send]);

  useEffect(() => {
    const activeTimers = timers.current;
    const saved = readLatest();
    commit(saved ?? stateRef.current);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== KEY || !event.newValue) return;
      try {
        const incoming = migrateDeskState(JSON.parse(event.newValue));
        if (incoming && (incoming.revision > stateRef.current.revision ||
          (incoming.revision === stateRef.current.revision && incoming.mutationId !== stateRef.current.mutationId))) {
          commit(incoming, false);
        }
      } catch {
        /* ignore malformed writes from another tab */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      activeTimers.forEach((timer) => window.clearTimeout(timer));
      activeTimers.clear();
    };
  }, [commit]);

  useEffect(() => {
    for (const item of state.ledger) {
      if (item.status === "queued") arm(item.id, item.broker);
    }
  }, [state.ledger, arm]);

  useEffect(() => {
    if (!state.flash) return;
    const timer = window.setTimeout(() => send({ type: "flash", text: "" }), 3400);
    return () => window.clearTimeout(timer);
  }, [state.flash, send]);

  const verdict = useMemo(() => evaluateWithPreset(state.draft, state), [state]);

  const api = useMemo<DeskApi>(() => ({
    state,
    verdict,
    tab,
    setTab,
    setDraft: (patch) => send({ type: "draft", patch }),
    setPlan: (patch) => send({ type: "plan", patch }),
    applyPreset: (id) => send({ type: "preset", id }),
    toggleRule: (id) => send({ type: "rule", id }),
    setQ5: (value) => send({ type: "q5", value }),
    toggleAuto: () => send({ type: "auto" }),
    toggleSession: (broker) => send({ type: "session", broker }),
    confirm: (id) => send({ type: "confirm", id, at: new Date().toISOString() }),
    reset: () => send({ type: "reset" }),
    setRulePreset: (id) => send({ type: "preset-risk", id }),
    setNetAsset: (value) => send({ type: "capital", value }),
    setFx: (ccy, rate, asOf) => send({ type: "fx", ccy, rate, asOf }),
    updatePosition: (id, patch) => send({ type: "position-patch", id, patch }),
    setActualFee: (id, value) => send({ type: "fee", id, value }),
    addCalendarWindow: (window) => send({ type: "window-add", window }),
    removeCalendarWindow: (id) => send({ type: "window-remove", id }),
    saveDailyMark: (mark) => send({ type: "mark-save", mark }),
    removeDailyMark: (date, strategy) => send({ type: "mark-remove", date, strategy }),
    recordViolation: (kind, detail) => send({
      type: "violation",
      violation: { id: crypto.randomUUID(), at: new Date().toISOString(), kind, detail },
    }),
    resetRegime: (id) => send({ type: "regime-reset", id, at: new Date().toISOString() }),
    requeue: async (id) => {
      const item = state.ledger.find((row) => row.id === id);
      if (!item || item.status !== "parked" || busy.current) return;
      if (!state.sessions[item.broker]) {
        await send({ type: "flash", text: "会话还没挂上。" });
        return;
      }
      busy.current = true;
      await send({ type: "requeue", id });
      if (stateRef.current.ledger.some((row) => row.id === id && row.status === "queued")) arm(id, item.broker);
      else busy.current = false;
    },
    submit: async () => {
      if (busy.current) return;
      const id = nid();
      await send({ type: "submit", id, at: new Date().toISOString() });
      const item = stateRef.current.ledger.find((row) => row.id === id);
      if (!item) return;
      if (item.status === "blocked" || item.status === "parked") {
        busy.current = true;
        window.setTimeout(() => { busy.current = false; }, 400);
        return;
      }
      busy.current = true;
      arm(item.id, item.broker);
    },
    loadPosition: (id, mode) => {
      const pos = state.positions.find((p) => p.id === id);
      if (!pos) return;
      const held = holdOf(pos, shanghaiDate(new Date()));
      send({
        type: "draft",
        patch: {
          positionId: pos.id,
          broker: pos.broker,
          market: pos.market,
          symbol: pos.symbol,
          name: pos.name,
          asset: pos.asset,
          side: mode === "close" ? "sell" : "buy",
          intent: mode === "close" ? "close" : "add",
          qty: mode === "close" ? String(pos.qty) : pos.asset === "option" ? "1" : "100",
          price: String(pos.currentPrice ?? pos.price),
          holdDays: mode === "close" ? 0 : held <= 0 ? 0 : held <= 3 ? held : held <= 30 ? held : 45,
          tag: "none",
          plan: {
            ...emptyPlan(),
            strategy: pos.strategy ?? null,
            correlationGroup: pos.correlationGroup ?? "",
            marketStage: pos.marketStage ?? "unknown",
            setup: pos.setup ?? "standard",
            invalidation: pos.invalidation ? String(pos.invalidation) : "",
          },
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
  }), [state, tab, verdict, send, arm]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDesk(): DeskApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Desk missing");
  return ctx;
}
