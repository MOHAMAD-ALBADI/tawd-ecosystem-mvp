"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarPlus, CheckCheck, CircleDollarSign, DoorOpen, Hourglass, ShieldCheck, Users, X, Receipt, ClipboardList } from "lucide-react";
import { useData } from "@/lib/store";
import { act } from "@/lib/store/actions";
import { kpis } from "@/lib/engine/kpis";
import { SPECIALTY } from "@/lib/constants";
import { SLOT_TIMES, at, ago, fmtDay, fmtDayTime, fmtTime, sameDay, startOfDay } from "@/lib/time";
import { cls, num, omr } from "@/lib/format";
import { AgentAvatar, Badge, Button, Card, Kpi, PageHeader, Tabs } from "@/components/ui";
import { ApptActionsDialog, NewAppointmentDialog } from "@/components/operations/appt-dialogs";

const CELL: Record<string, string> = {
  pending: "border-warn/30 bg-warn/[0.08] text-warn",
  confirmed: "border-ok/25 bg-ok/[0.07] text-ok",
  checked_in: "border-info/35 bg-info/[0.1] text-info",
  in_room: "border-acc/40 bg-acc/[0.14] text-acc",
  completed: "border-line2 bg-white/[0.03] text-tx3",
  no_show: "border-bad/25 bg-bad/[0.06] text-bad",
};

export default function OperationsPage() {
  const d = useData();
  const k = useMemo(() => kpis(d), [d]);
  const [newOpen, setNewOpen] = useState<{ doctorId?: string; start?: string } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const today = startOfDay(new Date());
  const todays = d.appointments.filter((a) => sameDay(a.start, today) && a.status !== "cancelled");
  const queue = todays.filter((a) => a.status === "checked_in" || a.status === "in_room").sort((a, b) => (a.status === "in_room" ? -1 : b.status === "in_room" ? 1 : (a.checkInAt ?? "").localeCompare(b.checkInAt ?? "")));
  const arrivals = todays.filter((a) => ["confirmed", "pending"].includes(a.status)).slice(0, 6);
  const approvals = d.tasks.filter((t) => t.status === "requires_approval");
  const [billTab, setBillTab] = useState<"unpaid" | "paid">("unpaid");
  const invoices = d.invoices.filter((i) => i.status === billTab).slice(0, 7);
  const tasks = d.followups.filter((f) => f.status === "open" && f.owner !== "doctor").slice(0, 6);
  const name = (id: string) => d.patients.find((p) => p.id === id)?.name ?? "—";

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="TAWD Operate"
        title="العمليات الذكية للعيادة"
        subtitle="جدول اليوم، الطابور، توفر الأطباء، الفوترة، والقرارات التي تنتظر اعتمادك — كلها على نفس البيانات التي يعمل عليها الوكلاء."
        actions={<><Button variant="primary" icon={<CalendarPlus size={15} />} onClick={() => setNewOpen({})}>موعد جديد</Button><Link href="/appointments"><Button>كل المواعيد</Button></Link></>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="مواعيد اليوم" value={k.todayTotal} icon={<Users size={16} />} tone="muted" hint={`${k.todayDone} مكتملة`} />
        <Kpi label="في الانتظار" value={k.waiting} icon={<Hourglass size={16} />} tone="info" hint="سجّلوا وصولهم" />
        <Kpi label="مع الطبيب" value={k.inRoom} icon={<DoorOpen size={16} />} tone="acc" hint="الآن" />
        <Kpi label="فواتير غير مدفوعة" value={k.unpaid} icon={<Receipt size={16} />} tone="warn" hint={omr(k.revenueDue)} />
        <Kpi label="محصّل" value={<span>{num(k.revenueRealized)}<span className="mr-1 text-[14px] text-tx3">ر.ع.</span></span>} icon={<CircleDollarSign size={16} />} tone="ok" hint="بيانات تجريبية" />
        <Kpi label="بانتظار اعتمادك" value={approvals.length} icon={<ShieldCheck size={16} />} tone={approvals.length ? "warn" : "ok"} hint="قرارات الوكلاء" />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-8" title={`جدول اليوم — ${fmtDay(today)}`} subtitle="اضغط موعدًا لإدارته، أو خانة فارغة لحجزها" bodyClass="p-0">
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full min-w-[680px] table-fixed border-separate border-spacing-[3px] text-[11px]">
              <thead>
                <tr>
                  <th className="w-[118px]" />
                  {SLOT_TIMES.map((t) => <th key={t} className="latin pb-1 text-center text-[10px] font-normal text-tx3">{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.doctors.map((doc) => (
                  <tr key={doc.id}>
                    <td className="pl-2">
                      <div className="truncate text-[12.5px] font-medium">{doc.name}</div>
                      <div className="flex items-center gap-1.5 text-[11px] text-tx3"><span className={cls("h-1.5 w-1.5 rounded-full", doc.available ? "bg-ok" : "bg-tx3")} />{SPECIALTY[doc.specialty]}</div>
                    </td>
                    {SLOT_TIMES.map((t) => {
                      const iso = at(today, t);
                      const a = todays.find((x) => x.doctorId === doc.id && x.start === iso);
                      const past = new Date(iso).getTime() < Date.now() - 30 * 60000;
                      if (a) {
                        const p = d.patients.find((x) => x.id === a.patientId);
                        return (
                          <td key={t}>
                            <button onClick={() => setSel(a.id)} title={`${p?.name} · ${fmtTime(a.start)}`} className={cls("h-11 w-full truncate rounded-lg border px-0.5 text-[10.5px] leading-4 hover:brightness-125", CELL[a.status])}>
                              {p?.name.split(" ")[0]}
                              {a.recovered && <span className="block text-[9.5px] opacity-80">مُسترد</span>}
                            </button>
                          </td>
                        );
                      }
                      return (
                        <td key={t}>
                          <button disabled={past || !doc.available} onClick={() => setNewOpen({ doctorId: doc.id, start: iso })} className="h-11 w-full rounded-lg border border-dashed border-white/[0.06] text-tx3 hover:border-acc/40 hover:text-acc disabled:cursor-default disabled:opacity-30 disabled:hover:border-white/[0.06]">+</button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-tx3">
              {(["pending", "confirmed", "checked_in", "in_room", "completed"] as const).map((s) => <span key={s} className="flex items-center gap-1.5"><span className={cls("h-2.5 w-2.5 rounded border", CELL[s])} /><ApptLabel s={s} /></span>)}
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-4" title="طابور الانتظار المباشر" subtitle="يظهر نفسه في تطبيق المريض" tag={<Badge tone="info" dot pulse>{queue.length}</Badge>}>
          <div className="space-y-2">
            {queue.map((a, i) => (
              <div key={a.id} className={cls("flex items-center gap-3 rounded-xl border px-3 py-2.5", a.status === "in_room" ? "border-acc/30 bg-acc/[0.06]" : "hairline bg-s2")}>
                <span className="latin grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-[12px] font-semibold">{a.status === "in_room" ? "●" : i}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{name(a.patientId)}</div>
                  <div className="truncate text-[11px] text-tx3">{d.doctors.find((x) => x.id === a.doctorId)?.name} · {fmtTime(a.start)}{a.checkInAt && ` · وصل ${ago(a.checkInAt)}`}</div>
                </div>
                {a.status === "checked_in" ? <Button size="sm" onClick={() => act.callIn(a.id)}>إدخال</Button> : <Button size="sm" variant="primary" onClick={() => act.complete(a.id)}>إنهاء</Button>}
              </div>
            ))}
            {!queue.length && <div className="py-4 text-center text-[12.5px] text-tx3">لا أحد في الانتظار</div>}
          </div>
          <div className="mt-4 border-t hairline pt-3">
            <div className="mb-2 text-[12px] text-tx3">الوصول المتوقع</div>
            {arrivals.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 py-1.5 text-[12.5px]">
                <span className="truncate">{name(a.patientId)} <span className="latin text-tx3">{fmtTime(a.start)}</span></span>
                <Button size="sm" variant="ghost" onClick={() => act.checkIn(a.id)}>تسجيل وصول</Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card title="توفر الأطباء" subtitle="الإيقاف يمنع وكيل الجدولة من الحجز">
          <div className="space-y-2">
            {d.doctors.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                <div className="min-w-0"><div className="truncate text-[12.5px] font-medium">{doc.name}</div><div className="text-[11px] text-tx3">{SPECIALTY[doc.specialty]} · {doc.room}</div></div>
                <button role="switch" aria-checked={doc.available} onClick={() => act.toggleDoctor(doc.id)} className={cls("relative h-6 w-11 shrink-0 rounded-full transition-colors", doc.available ? "bg-acc" : "bg-white/15")}>
                  <span className={cls("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-[right]", doc.available ? "right-0.5" : "right-[22px]")} />
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card title="قرارات بانتظار الاعتماد" subtitle="اقتراحات الوكلاء لا تُنفذ دونك" tag={approvals.length ? <Badge tone="warn">{approvals.length}</Badge> : undefined}>
          <div className="space-y-2">
            {approvals.slice(0, 3).map((t) => (
              <div key={t.id} className="rounded-xl border border-warn/20 bg-warn/[0.04] p-3">
                <div className="flex items-center gap-2"><AgentAvatar id={t.agent} size={24} /><span className="truncate text-[12.5px] font-medium">{t.title}</span></div>
                <div className="mt-1 line-clamp-2 text-[11.5px] text-tx2">{t.outcome}</div>
                <div className="mt-2 flex gap-1.5">
                  <button onClick={() => act.approve(t.id)} className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg bg-brand text-[11.5px] font-medium text-white"><ShieldCheck size={12} />اعتماد</button>
                  <button onClick={() => act.decline(t.id)} className="flex h-7 items-center gap-1 rounded-lg border border-line2 px-2 text-[11.5px] text-tx2"><X size={12} />رفض</button>
                </div>
              </div>
            ))}
            {!approvals.length && <div className="py-6 text-center text-[12.5px] text-tx3">لا قرارات معلقة</div>}
          </div>
        </Card>

        <Card title="الفوترة" subtitle="فواتير الزيارات المكتملة" action={<Tabs value={billTab} onChange={setBillTab} items={[{ id: "unpaid", label: "غير مدفوعة" }, { id: "paid", label: "مدفوعة" }]} />}>
          <div className="space-y-1.5">
            {invoices.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 py-1 text-[12.5px]">
                <div className="min-w-0"><div className="truncate">{name(i.patientId)}</div><div className="latin text-[10.5px] text-tx3">{i.id.toUpperCase()} · {fmtDay(i.issuedAt)}</div></div>
                <div className="flex items-center gap-2"><span className="latin">{i.amount} OMR</span>{i.status === "unpaid" && <Button size="sm" variant="ghost" onClick={() => act.pay(i.id)}>دفع</Button>}</div>
              </div>
            ))}
            {!invoices.length && <div className="py-6 text-center text-[12.5px] text-tx3">لا فواتير</div>}
          </div>
        </Card>

        <Card title="مهام تشغيلية" subtitle="متابعات أنشأها وكيل النمو بعد الزيارات">
          <div className="space-y-2">
            {tasks.map((f) => (
              <div key={f.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                <ClipboardList size={14} className="shrink-0 text-tx3" />
                <div className="min-w-0 flex-1"><div className="truncate text-[12.5px]">{f.title}</div><div className="truncate text-[11px] text-tx3">{name(f.patientId)} · {fmtDayTime(f.due)}</div></div>
                <button aria-label="إنجاز" onClick={() => act.completeFollowUp(f.id)} className="grid h-7 w-7 place-items-center rounded-lg border border-line2 text-tx3 hover:text-acc"><CheckCheck size={14} /></button>
              </div>
            ))}
            {!tasks.length && <div className="py-6 text-center text-[12.5px] text-tx3">لا مهام مفتوحة</div>}
          </div>
        </Card>
      </div>

      {newOpen && <NewAppointmentDialog open onClose={() => setNewOpen(null)} preset={newOpen} />}
      <ApptActionsDialog id={sel} onClose={() => setSel(null)} />
    </div>
  );
}

function ApptLabel({ s }: { s: "pending" | "confirmed" | "checked_in" | "in_room" | "completed" }) {
  return <>{{ pending: "بانتظار التأكيد", confirmed: "مؤكد", checked_in: "في الانتظار", in_room: "مع الطبيب", completed: "مكتمل" }[s]}</>;
}

