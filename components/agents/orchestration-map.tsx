"use client";
import { asset } from "@/lib/asset";
import type { AgentId } from "@/types";
import { useData } from "@/lib/store";
import { agentStats } from "@/lib/engine/kpis";
import { AGENTS, EVENT_LABEL } from "@/lib/constants";
import { ago } from "@/lib/time";
import { cls } from "@/lib/format";
import { AgentAvatar } from "@/components/ui";

/* positions in % of the map box; the orchestrator sits in the middle */
const POS: Record<AgentId, [number, number]> = {
  sura: [84, 18],
  scheduling: [88, 50],
  attendance: [84, 82],
  recovery: [16, 18],
  growth: [12, 50],
  care: [16, 82],
};

export function OrchestrationMap() {
  const d = useData();
  const recentEvents = [...d.events].filter((e) => e.processed && e.agent).slice(-7).reverse();
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2 xl:hidden">
        <div className="rounded-xl border border-paper/20 bg-[#141414] p-3 sm:col-span-2">
          <div className="latin text-[13px] font-semibold">TAWD Intelligence</div>
          <div className="text-[11.5px] text-tx3">موجّه الأحداث · فرض الصلاحيات · منع التكرار · سجل التدقيق — {d.events.filter((e) => e.processed).length} حدث معالج</div>
        </div>
        {(Object.keys(POS) as AgentId[]).map((a) => {
          const st = agentStats(d, a);
          return (
            <div key={a} className="flex items-center gap-2.5 rounded-xl border hairline bg-s2 p-3">
              <AgentAvatar id={a} size={30} active={st.approvals > 0} />
              <div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-semibold">{AGENTS[a].name}</div><div className="truncate text-[11px] text-tx3">{st.completed} مكتملة{st.approvals ? ` · ${st.approvals} بانتظار اعتماد` : ""}</div></div>
            </div>
          );
        })}
      </div>
      <div className="relative hidden h-[380px] overflow-hidden rounded-xl border hairline bg-[#0c0c0c] xl:block">
        <div className="grid-bg absolute inset-0 opacity-70" />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {(Object.keys(POS) as AgentId[]).map((a) => {
            const st = agentStats(d, a);
            const live = (st.last && Date.now() - new Date(st.last.createdAt).getTime() < 15 * 60000) || st.approvals > 0;
            return (
              <line key={a} x1={50} y1={50} x2={POS[a][0]} y2={POS[a][1]} stroke={live ? AGENTS[a].color : "rgba(255,255,255,0.12)"} strokeOpacity={live ? 0.75 : 1} strokeWidth={1.2} vectorEffect="non-scaling-stroke" className={live ? "flow-line" : undefined} />
            );
          })}
        </svg>
        <div className="absolute left-1/2 top-1/2 w-[230px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-paper/20 bg-[#141414] p-4 text-center shadow-2xl">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-paper"><img src={asset("/brand/tawd-mark-white.png")} alt="" className="h-5 w-auto invert" /></div>
          <div className="latin mt-2 text-[14px] font-semibold">TAWD Intelligence</div>
          <div className="mt-1 text-[11.5px] leading-5 text-tx3">موجّه الأحداث · فرض الصلاحيات · منع التكرار · سجل التدقيق</div>
          <div className="mt-2 flex justify-center gap-3 text-[11px] text-tx2">
            <span><span className="latin font-semibold text-tx">{d.events.filter((e) => e.processed).length}</span> حدث</span>
            <span><span className="latin font-semibold text-tx">{d.events.filter((e) => !e.processed).length}</span> معلّق</span>
          </div>
        </div>
        {(Object.keys(POS) as AgentId[]).map((a) => {
          const st = agentStats(d, a);
          const [x, y] = POS[a];
          return (
            <div key={a} className="absolute w-[230px] -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
              <div className={cls("rounded-xl border bg-[#131313]/95 p-3", st.approvals ? "border-warn/30" : "hairline")}>
                <div className="flex items-center gap-2.5">
                  <AgentAvatar id={a} size={30} active={st.approvals > 0} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold">{AGENTS[a].name}</div>
                    <div className="truncate text-[10.5px] text-tx3">{st.last ? `${st.last.title} · ${ago(st.last.createdAt)}` : "لا مهام بعد"}</div>
                  </div>
                </div>
                <div className="mt-2 flex gap-3 text-[10.5px] text-tx3">
                  <span><span className="latin font-semibold text-tx2">{st.completed}</span> مكتملة</span>
                  {st.approvals > 0 && <span className="text-warn"><span className="latin font-semibold">{st.approvals}</span> بانتظار اعتماد</span>}
                  {st.failed > 0 && <span><span className="latin font-semibold text-bad">{st.failed}</span> تعذّرت</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="ml-1 text-[11.5px] text-tx3">آخر الأحداث الموجّهة:</span>
        {recentEvents.map((e) => (
          <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full border border-line2 px-2.5 py-1 text-[11px] text-tx2">
            {EVENT_LABEL[e.type]} <span className="text-tx3">←</span> <span style={{ color: AGENTS[e.agent!].color }}>{AGENTS[e.agent!].name}</span>
            {e.error && <span className="text-bad">· تعذّر</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
