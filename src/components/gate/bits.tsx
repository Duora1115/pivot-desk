import { clsx } from "clsx";
import type { InputHTMLAttributes, ReactNode } from "react";
import type { Decision, Tone } from "@/lib/gate/engine";

export function decisionWord(decision: Decision): string {
  if (decision === "pass") return "放行";
  if (decision === "block") return "拦截";
  return "复盘";
}

export function decisionTone(decision: Decision): string {
  if (decision === "pass") return "text-moss";
  if (decision === "block") return "text-cinnabar";
  return "text-brass";
}

export function toneClass(tone: Tone): string {
  if (tone === "moss") return "text-moss";
  if (tone === "cinnabar") return "text-cinnabar";
  if (tone === "brass") return "text-brass";
  return "text-dim";
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx("rounded-xl bg-panel p-4 shadow-card", className)}>{children}</section>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="block min-w-0">
      <span className="mb-1.5 block font-mono text-xs tracking-widest text-dim">{label}</span>
      {children}
    </div>
  );
}

const control =
  "min-h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm text-paper outline-none placeholder:text-dim focus:border-brass";

export function TextInput({
  mono = true,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input {...props} className={clsx(control, mono && "font-mono tabular-nums", className)} />;
}

const COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  columns = 2,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <div className={clsx("grid gap-1.5", COLS[columns] ?? "grid-cols-2")}>
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(opt.value)}
            className={clsx(
              "min-h-11 rounded-lg border px-1 text-sm transition-colors",
              on ? "border-paper bg-raise text-paper" : "border-line bg-ink text-dim hover:text-paper",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function StampButton({
  decision,
  disabled,
  children,
  onClick,
}: {
  decision: Decision;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-base font-medium disabled:opacity-40",
        decision === "pass" && "bg-moss text-ink",
        decision === "block" && "bg-cinnabar text-ink",
        decision === "review" && "bg-brass text-ink",
      )}
    >
      {children}
    </button>
  );
}
