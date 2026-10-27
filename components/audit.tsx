"use client";
import type { AuditRecord } from "@/types";
import { ACTOR_LABEL, AGENTS, EVENT_LABEL } from "@/lib/constants";
import { ago, fmtDay, fmtStamp } from "@/lib/time";
import { cls } from "@/lib/format";
import { AgentAvatar } from "@/components/ui";
import { AgentIcon } from "@/components/agent-icon";
import type { AgentId } from "@/types";

const isAgent = (a: string): a is AgentId => a in AGENTS;

export function AuditTable({ rows, compact, empty = "لا توجد سجلات بعد" }: { rows: AuditRecord[]; compact?: boolean; empty?: string }) {
  if (!rows.length) return <div className="py-8 text-center text-[13px] text-tx3">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-right text-[12.5px]">
        <thead>
          <tr className="border-b hairline text-[11.5px] text-tx3">
            <th className="py-2.5 pl-3 font-medium">الوقت</th>
            <th className="py-2.5 pl-3 font-medium">الحدث</th>
            <th className="py-2.5 pl-3 font-medium">المنفّذ</th>
            <th className="py-2.5 pl-3 font-medium">الإجراء</th>
            <th className="py-2.5 font-medium">النتيجة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-white/[0.04] align-top last:border-0">
              <td className="whitespace-nowrap py-2.5 pl-3 text-tx3"><span className="latin num">{fmtStamp(r.at)}</span>{!compact && <div className="text-[11px]">{fmtDay(r.at)}</div>}</td>
              <td className="py-2.5 pl-3"><span className="whitespace-nowrap rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[11.5px] text-tx2">{EVENT_LABEL[r.event] ?? r.event}</span></td>
              <td className="whitespace-nowrap py-2.5 pl-3">
                <span className="inline-flex items-center gap-1.5" style={{ color: isAgent(r.actor) ? AGENTS[r.actor].color : undefined }}>
                  {isAgent(r.actor) && <AgentIcon id={r.actor} size={13} />}
                  <span className={isAgent(r.actor) ? "" : "text-tx2"}>{ACTOR_LABEL[r.actor] ?? r.actor}</span>
                </span>
              </td>
              <td className="py-2.5 pl-3 text-tx">{r.action}</td>
              <td className="py-2.5 text-tx2">{r.outcome}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EventFeed({ rows, limit = 8 }: { rows: AuditRecord[]; limit?: number }) {
  return (
    <ol className="relative space-y-0">
      {rows.slice(0, limit).map((r, i) => (
        <li key={r.id} className="relative flex gap-3 pb-4 last:pb-0">
          {i < Math.min(limit, rows.length) - 1 && <span className="absolute right-[17px] top-9 h-[calc(100%-28px)] w-px bg-white/[0.06]" />}
          {isAgent(r.actor) ? <AgentAvatar id={r.actor} size={34} /> : <span className={cls("grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl border border-line2 bg-s2 text-[11px] text-tx2")}>{(ACTOR_LABEL[r.actor] ?? "؟").slice(0, 2)}</span>}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13px] font-medium">{r.action}</span>
              <span className="shrink-0 text-[11px] text-tx3">{ago(r.at)}</span>
            </div>
            <div className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-tx3">{ACTOR_LABEL[r.actor]} · {r.outcome}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
