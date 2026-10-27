"use client";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Watch, CalendarPlus } from "lucide-react";
import type { Patient } from "@/types";
import { useData } from "@/lib/store";
import { CHANNEL, SPECIALTY } from "@/lib/constants";
import { fmtDate, fmtDayTime, fmtTime } from "@/lib/time";
import { cls, num } from "@/lib/format";
import { ApptBadge, Badge, Button, Card, Drawer, PageHeader, Stat, Tabs, inputCls } from "@/components/ui";
import { AuditTable } from "@/components/audit";
import { ApptActionsDialog, NewAppointmentDialog, sourceLabel } from "@/components/operations/appt-dialogs";

type F = "all" | "active" | "inactive" | "lead" | "care";
const STATUS = { active: { label: "نشط", tone: "ok" as const }, inactive: { label: "غير نشط", tone: "muted" as const }, lead: { label: "عميل محتمل", tone: "info" as const } };

export default function Wrap() {
  return <Suspense><PatientsPage /></Suspense>;
}

function PatientsPage() {
  const d = useData();
  const params = useSearchParams();
  const router = useRouter();
  const [f, setF] = useState<F>("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const openId = params.get("id");
  const camp = (src: string) => d.campaigns.find((c) => c.id === src)?.name ?? (src === "referral" ? "إحالة" : "مباشر");

  const rows = useMemo(() => {
    const list = d.patients.filter((p) => {
      if (q.trim() && !p.name.includes(q.trim()) && !p.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))) return false;
      if (f === "care") return !!p.deviceId;
      if (f !== "all") return p.status === f;
      return true;
    });
    /* newest leads and featured records first, then by last visit */
    return list.sort((a, b) => Number(b.status === "lead") - Number(a.status === "lead") || Number(!!b.featured) - Number(!!a.featured) || (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""));
  }, [d.patients, f, q]);

  const counts = { all: d.patients.length, active: d.patients.filter((p) => p.status === "active").length, inactive: d.patients.filter((p) => p.status === "inactive").length, lead: d.patients.filter((p) => p.status === "lead").length, care: d.devices.length };

  return (
    <div className="fade-up">
      <PageHeader eyebrow="TAWD Operate" title="المرضى" subtitle="سجل موحد لكل مريض: المواعيد، المحادثات، الفواتير، قراءات السوار، ومهام المتابعة — مرضى وهميون بالكامل." />
      <Card bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b hairline p-4">
          <Tabs value={f} onChange={(v) => { setF(v); setLimit(50); }} items={[
            { id: "all", label: `الكل · ${counts.all}` },
            { id: "active", label: `نشطون · ${counts.active}` },
            { id: "inactive", label: `غير نشطين · ${counts.inactive}` },
            { id: "lead", label: `محتملون · ${counts.lead}` },
            { id: "care", label: `الرعاية المتصلة · ${counts.care}` },
          ]} />
          <div className="relative mr-auto">
            <Search size={14} className="absolute right-3 top-3 text-tx3" />
            <input className={cls(inputCls, "w-64 pr-8")} placeholder="بحث بالاسم أو الهاتف" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-right text-[13px]">
            <thead>
              <tr className="border-b hairline text-[11.5px] text-tx3">
                <th className="px-4 py-3 font-medium">المريض</th><th className="px-3 font-medium">الهاتف</th><th className="px-3 font-medium">الحالة</th><th className="px-3 font-medium">المصدر</th><th className="px-3 font-medium">آخر زيارة</th><th className="px-3 font-medium">الموعد القادم</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((p) => {
                const next = d.appointments.find((a) => a.patientId === p.id && new Date(a.start) > new Date() && !["cancelled", "completed"].includes(a.status));
                return (
                  <tr key={p.id} onClick={() => router.push(`/patients?id=${p.id}`, { scroll: false })} className="cursor-pointer border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-3"><div className="flex items-center gap-2 font-medium">{p.name}{p.deviceId && <Watch size={13} className="text-acc" />}</div>{p.careProgram && <div className="text-[11.5px] text-tx3">{p.careProgram}</div>}</td>
                    <td className="latin px-3 text-tx2" dir="ltr">{p.phone}</td>
                    <td className="px-3"><Badge tone={STATUS[p.status].tone} dot>{STATUS[p.status].label}</Badge></td>
                    <td className="px-3 text-tx2">{camp(p.source)}</td>
                    <td className="px-3 text-tx2">{p.lastVisit ? fmtDate(p.lastVisit) : "—"}</td>
                    <td className="px-3 text-tx2">{next ? fmtDayTime(next.start) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-4 text-[12px] text-tx3">
          <span>{Math.min(limit, rows.length)} من {rows.length}</span>
          {rows.length > limit && <Button size="sm" onClick={() => setLimit(limit + 50)}>عرض المزيد</Button>}
        </div>
      </Card>
      {openId && <PatientDrawer id={openId} onClose={() => router.push("/patients", { scroll: false })} />}
    </div>
  );
}

function PatientDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useData();
  const p = d.patients.find((x) => x.id === id) as Patient | undefined;
  const [sel, setSel] = useState<string | null>(null);
  const [book, setBook] = useState(false);
  if (!p) return null;
  const appts = d.appointments.filter((a) => a.patientId === p.id).slice().reverse();
  const inv = d.invoices.filter((i) => i.patientId === p.id);
  const inq = d.inquiries.filter((q) => q.patientId === p.id);
  const msgs = d.messages.filter((m) => inq.some((q) => q.id === m.threadId)).slice(-6);
  const audit = d.audit.filter((a) => a.patientId === p.id).slice(0, 10);
  const last = d.readings.filter((r) => r.patientId === p.id).at(-1);
  const review = d.reviews.find((r) => r.patientId === p.id && r.status !== "completed");
  const fus = d.followups.filter((f) => f.patientId === p.id && f.status === "open");
  const camp = d.campaigns.find((c) => c.id === p.source);
  return (
    <Drawer open onClose={onClose} title={p.name} subtitle={<span className="latin" dir="ltr">{p.phone}</span>}>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={STATUS[p.status].tone} dot>{STATUS[p.status].label}</Badge>
        {p.age > 0 && <Badge>{p.age} سنة</Badge>}
        <Badge>المصدر: {camp?.name ?? (p.source === "referral" ? "إحالة" : "مباشر")}</Badge>
        {p.careProgram && <Badge tone="acc">{p.careProgram}</Badge>}
      </div>
      {p.note && <p className="mt-3 text-[12.5px] text-tx2">{p.note}</p>}
      <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-white/[0.03] p-3">
        <Stat label="زيارات مكتملة" value={appts.filter((a) => a.status === "completed").length} />
        <Stat label="مواعيد قادمة" value={appts.filter((a) => new Date(a.start) > new Date() && !["cancelled", "completed"].includes(a.status)).length} />
        <Stat label="إجمالي الفواتير" value={<span>{num(inv.reduce((n, i) => n + i.amount, 0))} <span className="text-[12px] text-tx3">OMR</span></span>} />
      </div>
      <div className="mt-3 flex gap-2"><Button size="sm" variant="primary" icon={<CalendarPlus size={14} />} onClick={() => setBook(true)}>حجز موعد</Button>{p.deviceId && <Link href={`/doctor?id=${p.id}`}><Button size="sm" icon={<Watch size={14} />}>لوحة الطبيب</Button></Link>}</div>

      {p.deviceId && (
        <Section title="الرعاية المتصلة">
          <div className={cls("rounded-xl border p-3 text-[12.5px]", review?.status === "open" ? "border-bad/30 bg-bad/[0.05]" : "hairline bg-s2")}>
            <div className="latin">HR {last?.hr ?? "—"} · SpO₂ {last?.spo2 ?? "—"}% · {last?.temp ?? "—"}°</div>
            <div className="mt-1 text-tx3">{review ? (review.status === "open" ? `إشارة مراجعة مفتوحة: ${review.reasons[0]}` : "اطّلع الطبيب — متابعة") : "لا إشارة مراجعة"}</div>
          </div>
        </Section>
      )}

      <Section title="المواعيد">
        <div className="space-y-1.5">
          {appts.slice(0, 8).map((a) => (
            <button key={a.id} onClick={() => setSel(a.id)} className="flex w-full items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-right text-[12.5px] hover:bg-white/[0.05]">
              <span><span>{fmtDayTime(a.start)}</span><span className="block text-[11px] text-tx3">{d.doctors.find((x) => x.id === a.doctorId)?.name} · {SPECIALTY[d.doctors.find((x) => x.id === a.doctorId)!.specialty]} · {sourceLabel(a.source)}</span></span>
              <span className="flex items-center gap-1.5">{a.recovered && <Badge tone="warn">مُسترد</Badge>}{a.rescheduledFrom && <Badge tone="info">إعادة جدولة</Badge>}<ApptBadge status={a.status} /></span>
            </button>
          ))}
          {!appts.length && <div className="text-[12.5px] text-tx3">لا مواعيد</div>}
        </div>
      </Section>

      {msgs.length > 0 && (
        <Section title={`المحادثات · ${inq.map((q) => CHANNEL[q.channel]).filter((v, i, a) => a.indexOf(v) === i).join("، ")}`}>
          <div className="space-y-1.5">
            {msgs.map((m) => <div key={m.id} className={cls("rounded-xl px-3 py-2 text-[12.5px] leading-6", m.from === "patient" ? "bg-s3" : m.from === "system" ? "text-[11.5px] text-tx3" : "border border-acc/15 bg-acc/[0.05]")}>{m.text}{m.card && <span className="text-acc"> — {m.card.lines.join(" · ")}</span>}<span className="latin mr-2 text-[10.5px] text-tx3">{fmtTime(m.at)}</span></div>)}
          </div>
        </Section>
      )}

      {fus.length > 0 && (
        <Section title="مهام المتابعة المفتوحة">
          {fus.map((f) => <div key={f.id} className="py-1 text-[12.5px]">• {f.title} <span className="text-tx3">— {fmtDayTime(f.due)}</span></div>)}
        </Section>
      )}

      {inv.length > 0 && (
        <Section title="الفواتير">
          {inv.slice(0, 5).map((i) => <div key={i.id} className="flex justify-between py-1 text-[12.5px]"><span className="latin text-tx3">{i.id.toUpperCase()} · {fmtDate(i.issuedAt)}</span><span className="flex items-center gap-2"><span className="latin">{i.amount} OMR</span><Badge tone={i.status === "paid" ? "ok" : "warn"}>{i.status === "paid" ? "مدفوعة" : "غير مدفوعة"}</Badge></span></div>)}
        </Section>
      )}

      <Section title="سجل التدقيق للمريض">
        <AuditTable rows={audit} compact empty="لا سجلات" />
      </Section>
      <ApptActionsDialog id={sel} onClose={() => setSel(null)} />
      {book && <NewAppointmentDialog open onClose={() => setBook(false)} preset={{ patientId: p.id }} />}
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="mb-2 text-[12.5px] font-semibold text-tx2">{title}</div>
      {children}
    </div>
  );
}
