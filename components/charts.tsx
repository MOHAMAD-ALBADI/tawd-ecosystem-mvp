"use client";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { num } from "@/lib/format";

/* Recharts wrappers in the TAWD dark palette. Charts sit in an LTR box so axes read left-to-right. */

const AXIS = { stroke: "#5a5a5a", fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />;

function Tip({ active, payload, label, unit }: { active?: boolean; payload?: { name?: string; value?: number; color?: string; payload?: Record<string, unknown> }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div dir="rtl" className="rounded-xl border border-line2 bg-[#141414]/95 px-3 py-2 text-[12px] shadow-xl">
      {label && <div className="mb-1 text-tx3">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 leading-6">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-tx2">{p.name}</span>
          <span className="latin mr-auto font-semibold text-tx">{num(Number(p.value ?? 0))}{unit ? ` ${unit}` : ""}</span>
        </div>
      ))}
    </div>
  );
}

export type Series = { key: string; name: string; color: string };

export function AreaTrend({ data, series, height = 240, xKey = "label", todayLabel }: { data: object[]; series: Series[]; height?: number; xKey?: string; todayLabel?: string }) {
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {GRID}
          <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={14} />
          <YAxis {...AXIS} allowDecimals={false} width={44} />
          {todayLabel && <ReferenceLine x={todayLabel} stroke="rgba(242,241,236,0.35)" strokeDasharray="3 4" label={{ value: "اليوم", fill: "#a1a1a1", fontSize: 10, position: "insideTopRight" }} />}
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.12)" }} />
          {series.map((s) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={1.8} fill={`url(#g-${s.key})`} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars({ data, series, height = 220, xKey = "label", stacked, unit, radius = 4, layout = "horizontal" }: { data: object[]; series: Series[]; height?: number; xKey?: string; stacked?: boolean; unit?: string; radius?: number; layout?: "horizontal" | "vertical" }) {
  const vertical = layout === "vertical";
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={layout} margin={{ top: 8, right: 8, left: vertical ? 8 : -18, bottom: 0 }} barCategoryGap={vertical ? 8 : "22%"}>
          {GRID}
          {vertical ? (
            <>
              <XAxis type="number" {...AXIS} hide />
              <YAxis type="category" dataKey={xKey} {...AXIS} width={110} tick={{ fill: "#a1a1a1", fontSize: 11 }} orientation="right" />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} {...AXIS} interval={0} tick={{ fill: "#7a7a7a", fontSize: 10.5 }} />
              <YAxis {...AXIS} allowDecimals={false} width={44} />
            </>
          )}
          <Tooltip content={<Tip unit={unit} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stacked ? "a" : undefined} radius={stacked && i < series.length - 1 ? 0 : radius} isAnimationActive={false} maxBarSize={34} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ColoredBars({ data, height = 220, unit }: { data: { name: string; value: number; tone: string }[]; height?: number; unit?: string }) {
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }} barCategoryGap="24%">
          {GRID}
          <XAxis dataKey="name" {...AXIS} interval={0} tick={{ fill: "#8a8a8a", fontSize: 10.5 }} />
          <YAxis {...AXIS} width={52} />
          <Tooltip content={<Tip unit={unit} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Bar dataKey="value" name="القيمة" radius={[5, 5, 0, 0]} isAnimationActive={false} maxBarSize={42}>
            {data.map((d) => <Cell key={d.name} fill={d.tone} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Donut({ data, height = 200, colors, center }: { data: { name: string; value: number }[]; height?: number; colors: string[]; center?: { value: string; label: string } }) {
  return (
    <div dir="ltr" className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={<Tip />} />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={2} stroke="none" isAnimationActive={false}>
            {data.map((d, i) => <Cell key={d.name} fill={colors[i % colors.length]} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {center && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="latin text-[24px] font-semibold leading-none">{center.value}</div>
            <div dir="rtl" className="mt-1 text-[11px] text-tx3">{center.label}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Lines({ data, series, height = 200, xKey = "label", domain, refLines }: { data: object[]; series: Series[]; height?: number; xKey?: string; domain?: [number | "auto", number | "auto"]; refLines?: { y: number; label: string; color?: string }[] }) {
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
          {GRID}
          <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...AXIS} domain={domain ?? ["auto", "auto"]} width={44} />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.12)" }} />
          {refLines?.map((r) => (
            <ReferenceLine key={r.label} y={r.y} stroke={r.color ?? "rgba(214,168,92,0.6)"} strokeDasharray="4 4" label={{ value: r.label, fill: r.color ?? "#d6a85c", fontSize: 10, position: "insideTopLeft" }} />
          ))}
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={1.8} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* stage-by-stage funnel drawn in HTML: widths are proportional, labels stay Arabic and right-aligned */
export function Funnel({ data, color = "#2e7bd6" }: { data: { stage: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const prev = i ? data[i - 1].value : 0;
        return (
          <div key={d.stage}>
            <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
              <span className="text-tx2">{d.stage}</span>
              <span className="flex items-baseline gap-2">
                {i > 0 && prev > 0 && <span className="latin text-[11px] text-tx3">{Math.round((d.value / prev) * 100)}%</span>}
                <span className="latin num text-[15px] font-semibold">{num(d.value)}</span>
              </span>
            </div>
            <div className="h-7 overflow-hidden rounded-lg bg-white/[0.03]">
              <div className="h-full rounded-lg" style={{ width: `${(d.value / max) * 100}%`, background: color, opacity: 1 - i * 0.18 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
