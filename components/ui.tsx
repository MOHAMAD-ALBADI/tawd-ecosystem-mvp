"use client";
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";
import type { AgentId, ApptStatus, TaskStatus } from "@/types";
import { AGENTS, APPT_STATUS, TASK_STATUS, type Tone } from "@/lib/constants";
import { cls } from "@/lib/format";
import { AgentIcon } from "@/components/agent-icon";

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="latin mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-acc">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold leading-tight md:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-3xl text-[14px] leading-7 text-tx2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:flex-nowrap">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, action, children, className, bodyClass, tag }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; tag?: ReactNode }) {
  return (
    <section className={cls("card min-w-0", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold">{title}</h2>
              {tag}
            </div>
            {subtitle && <p className="mt-1 text-[12.5px] leading-6 text-tx3">{subtitle}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cls("p-5", bodyClass)}>{children}</div>
    </section>
  );
}

const TONE: Record<Tone, string> = {
  ok: "bg-ok/10 text-ok border-ok/20",
  warn: "bg-warn/10 text-warn border-warn/25",
  bad: "bg-bad/10 text-bad border-bad/25",
  info: "bg-info/10 text-info border-info/20",
  acc: "bg-acc/10 text-acc border-acc/25",
  muted: "bg-white/[0.04] text-tx2 border-line2",
};
const DOT: Record<Tone, string> = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-info", acc: "bg-acc", muted: "bg-tx3" };

export function Badge({ tone = "muted", children, dot, pulse, className }: { tone?: Tone; children: ReactNode; dot?: boolean; pulse?: boolean; className?: string }) {
  return (
    <span className={cls("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[3px] text-[11.5px] font-medium leading-4", TONE[tone], className)}>
      {dot && <span className={cls("h-1.5 w-1.5 rounded-full", DOT[tone], pulse && "pulse-dot")} />}
      {children}
    </span>
  );
}

export const ApptBadge = ({ status }: { status: ApptStatus }) => <Badge tone={APPT_STATUS[status].tone} dot>{APPT_STATUS[status].label}</Badge>;
export const TaskBadge = ({ status }: { status: TaskStatus }) => <Badge tone={TASK_STATUS[status].tone} dot pulse={status === "processing"}>{TASK_STATUS[status].label}</Badge>;

export const DemoTag = ({ label = "بيانات تجريبية" }: { label?: string }) => (
  <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-line2 px-1.5 py-[1px] text-[10.5px] text-tx3">{label}</span>
);
export const SimTag = ({ label = "محاكاة" }: { label?: string }) => (
  <span className="inline-flex items-center rounded-md bg-warn/10 px-1.5 py-[1px] text-[10.5px] font-medium text-warn">{label}</span>
);

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "light"; size?: "sm" | "md" | "lg"; icon?: ReactNode };
export function Button({ variant = "secondary", size = "md", icon, className, children, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cls(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-[background,border-color,opacity] duration-200 disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-8 px-3 text-[12.5px]" : size === "lg" ? "h-12 px-6 text-[15px]" : "h-10 px-4 text-[13.5px]",
        variant === "primary" && "bg-brand text-white hover:bg-brand2",
        variant === "light" && "bg-paper text-ink hover:bg-white",
        variant === "secondary" && "border border-line2 bg-s2 text-tx hover:border-white/25 hover:bg-s3",
        variant === "ghost" && "text-tx2 hover:bg-white/[0.05] hover:text-tx",
        variant === "danger" && "border border-bad/30 bg-bad/10 text-bad hover:bg-bad/15",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function Kpi({ label, value, hint, icon, tone = "acc", delta, big, foot }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: Tone; delta?: { value: string; good?: boolean }; big?: boolean; foot?: ReactNode }) {
  return (
    <div className="card flex min-w-0 flex-col justify-between p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] leading-5 text-tx2">{label}</span>
        {icon && <span className={cls("grid h-8 w-8 shrink-0 place-items-center rounded-lg", TONE[tone])}>{icon}</span>}
      </div>
      <div className={cls("latin num mt-3 font-semibold tracking-tight", big ? "text-[38px] leading-none" : "text-[30px] leading-none")}>{value}</div>
      <div className="mt-3 flex min-h-5 flex-wrap items-center gap-2 text-[11.5px] text-tx3">
        {delta && <span className={cls("latin num rounded-md px-1.5 py-0.5 font-semibold", delta.good === false ? "bg-bad/10 text-bad" : "bg-ok/10 text-ok")}>{delta.value}</span>}
        {hint}
      </div>
      {foot}
    </div>
  );
}

export function AgentAvatar({ id, size = 36, active }: { id: AgentId | "orchestrator"; size?: number; active?: boolean }) {
  const color = id === "orchestrator" ? "#f2f1ec" : AGENTS[id].color;
  return (
    <span className="relative grid shrink-0 place-items-center rounded-xl border" style={{ width: size, height: size, borderColor: `${color}55`, background: `${color}14`, color }}>
      <AgentIcon id={id} size={Math.round(size * 0.46)} />
      {active && <span className="pulse-dot absolute -left-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg" style={{ background: color }} />}
    </span>
  );
}

export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal aria-label={title} className={cls("fade-up max-h-[90vh] w-full overflow-auto rounded-2xl border border-line2 bg-s1 shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="flex items-center justify-between border-b hairline px-5 py-4">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="إغلاق" className="grid h-8 w-8 place-items-center rounded-lg text-tx3 hover:bg-white/5 hover:text-tx"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t hairline px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, subtitle }: { open: boolean; onClose: () => void; title: string; subtitle?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-label={title} className="absolute inset-y-0 left-0 flex w-full max-w-[560px] flex-col border-r border-line2 bg-s1 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b hairline px-6 py-5">
          <div className="min-w-0">
            <h3 className="truncate text-[18px] font-semibold">{title}</h3>
            {subtitle && <div className="mt-1 text-[12.5px] text-tx3">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-tx3 hover:bg-white/5 hover:text-tx"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] text-tx2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-tx3">{hint}</span>}
    </label>
  );
}

export const inputCls = "h-10 w-full rounded-xl border border-line2 bg-s2 px-3 text-[13.5px] text-tx outline-none placeholder:text-tx3 focus:border-acc/60";

export function Tabs<T extends string>({ items, value, onChange, className }: { items: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cls("inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-s1 p-1", className)}>
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={value === it.id} onClick={() => onChange(it.id)} className={cls("h-8 whitespace-nowrap rounded-lg px-3 text-[12.5px] transition-colors", value === it.id ? "bg-s4 text-tx" : "text-tx3 hover:text-tx")}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, text, action }: { icon?: ReactNode; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line2 px-4 py-10 text-center text-[13px] text-tx3">
      {icon}
      <span>{text}</span>
      {action}
    </div>
  );
}

export function Sparkline({ values, color = "#2e7bd6", height = 34, width = 120 }: { values: number[]; color?: string; height?: number; width?: number }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 3 - ((v - min) / span) * (height - 6)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Meter({ value, tone = "acc", className }: { value: number; tone?: Tone; className?: string }) {
  return (
    <div className={cls("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]", className)}>
      <div className={cls("h-full rounded-full", DOT[tone])} style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] text-tx3">{label}</div>
      <div className="latin num mt-1 text-[20px] font-semibold leading-none">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-tx3">{sub}</div>}
    </div>
  );
}
