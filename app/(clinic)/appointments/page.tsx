"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarPlus, Search } from "lucide-react";
import type { Appointment } from "@/types";
import { useData } from "@/lib/store";
import { kpis } from "@/lib/engine/kpis";
import { SPECIALTY } from "@/lib/constants";
import { fmtDayTime, sameDay, startOfDay } from "@/lib/time";
import { cls, num } from "@/lib/format";
import { ApptBadge, Badge, Button, Card, PageHeader, Tabs, inputCls } from "@/components/ui";
import { ApptActionsDialog, NewAppointmentDialog, sourceLabel } from "@/components/operations/appt-dialogs";

type F = "upcoming" | "today" | "pending" | "cancelled" | "recovered" | "completed" | "all";

export default function Wrap() {
  return <Suspense><AppointmentsPage /></Suspense>;
}

function AppointmentsPage() {
  const d = useData();
  const params = useSearchParams();
  const k = useMemo(() => kpis(d), [d]);
  const [f, setF] = useState<F>(params.get("q") ? "all" : "upcoming");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [doc, setDoc] = useState("");
  const [limit, setLimit] = useState(60);
  const [sel, setSel] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  useEffect(() => { if (params.get("new") === "1") setNewOpen(true); }, [params]);

  const today0 = startOfDay(new Date());
  const pName = (id: string) => d.patients.find((p) => p.id === id)?.name ?? "";
  const rows = useMemo(() => {
    const test = (a: Appointment) => {
      if (doc && a.doctorId !== doc) return false;
      if (q.trim() && !pName(a.patientId).includes(q.trim())) return false;
      switch (f) {
        case "upcoming": return new Date(a.start) >= today0 && !["cancelled", "completed", "no_show"].includes(a.status);
        case "today": return sameDay(a.start, today0);
        case "pending": return a.status === "pending";
        case "cancelled": return a.status === "cancelled";
        case "recovered": return !!a.recovered || !!a.rescheduledFrom;
        case "completed": return a.status === "completed";
        default: return true;
      }
    };
    const list = d.appointments.filter(test);
    return f === "upcoming" || f === "today" || f === "pending" ? list : [...list].reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, f, q, doc]);

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="TAWD Operate"
        title="المواعيد"
        subtitle={<>كل حجز من الاستقبال أو سُرى أو تطبيق المريض أو وكيل الاسترداد يمر بنفس حارس منع الحجز المزدوج. {num(k.total)} موعدًا في الفترة.</>}
        actions={<Button variant="primary" icon={<CalendarPlus size={15} />} onClick={() => setNewOpen(true)}>موعد جديد</Button>}
      />
      <Card bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b hairline p-4">
          <Tabs value={f} onChange={(v) => { setF(v); setLimit(60); }} items={[
            { id: "upcoming", label: `القادمة` },
            { id: "today", label: "اليوم" },
            { id: "pending", label: `بانتظار التأكيد · ${k.pending}` },
            { id: "cancelled", label: `ملغاة · ${k.cancelled}` },
            { id: "recovered", label: `مستردة · ${k.recovered}` },
            { id: "completed", label: "مكتملة" },
            { id: "all", label: "الكل" },
          ]} />
          <div className="relative mr-auto">
            <Search size={14} className="absolute right-3 top-3 text-tx3" />
            <input className={cls(inputCls, "w-56 pr-8")} placeholder="بحث باسم المريض" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={cls(inputCls, "w-48")} value={doc} onChange={(e) => setDoc(e.target.value)}>
            <option value="">كل الأطباء</option>
            {d.doctors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-right text-[13px]">
            <thead>
              <tr className="border-b hairline text-[11.5px] text-tx3">
                <th className="px-4 py-3 font-medium">المريض</th>
                <th className="px-3 font-medium">الطبيب</th>
                <th className="px-3 font-medium">الموعد</th>
                <th className="px-3 font-medium">الحالة</th>
                <th className="px-3 font-medium">المصدر</th>
                <th className="px-3 font-medium">التأكيد</th>
                <th className="px-3 font-medium">القيمة</th>
                <th className="px-4" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((a) => {
                const dr = d.doctors.find((x) => x.id === a.doctorId)!;
                return (
                  <tr key={a.id} onClick={() => setSel(a.id)} className={cls("cursor-pointer border-b border-white/[0.04] hover:bg-white/[0.02]", a.demo && "bg-acc/[0.03]")}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{pName(a.patientId)}</div>
                      <div className="mt-0.5 flex gap-1">{a.recovered && <Badge tone="warn">مُسترد</Badge>}{a.rescheduledFrom && <Badge tone="info">إعادة جدولة</Badge>}{a.demo && <Badge tone="acc">رحلة العرض</Badge>}</div>
                    </td>
                    <td className="px-3"><div>{dr.name}</div><div className="text-[11.5px] text-tx3">{SPECIALTY[dr.specialty]}</div></td>
                    <td className="whitespace-nowrap px-3">{fmtDayTime(a.start)}</td>
                    <td className="px-3"><ApptBadge status={a.status} /></td>
                    <td className="px-3 text-tx2">{sourceLabel(a.source)}</td>
                    <td className="px-3 text-[12px] text-tx2">{{ not_sent: "—", sent: "مُرسل", confirmed: "مؤكد", declined: "معتذر" }[a.confirmation]}</td>
                    <td className="latin px-3 text-tx2">{a.price} OMR</td>
                    <td className="px-4 text-left text-[12px] text-acc">إدارة</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <div className="py-12 text-center text-[13px] text-tx3">لا مواعيد مطابقة</div>}
        </div>
        <div className="flex items-center justify-between p-4 text-[12px] text-tx3">
          <span>{Math.min(limit, rows.length)} من {rows.length}</span>
          {rows.length > limit && <Button size="sm" onClick={() => setLimit(limit + 60)}>عرض المزيد</Button>}
        </div>
      </Card>
      {newOpen && <NewAppointmentDialog open onClose={() => setNewOpen(false)} />}
      <ApptActionsDialog id={sel} onClose={() => setSel(null)} />
    </div>
  );
}
