"use client";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CheckCheck, ClipboardPlus, Eye, ShieldAlert, Clock, CircleCheck, Watch } from "lucide-react";
import type { CareReview, Data, Patient } from "@/types";
import { useData } from "@/lib/store";
import { act } from "@/lib/store/actions";
import { CARE_DOCTOR } from "@/lib/data/seed";
import { ago, fmtDayTime, fmtTime, hhmm } from "@/lib/time";
import { cls, num } from "@/lib/format";
import { Badge, Button, Card, Dialog, Field, Kpi, PageHeader, Sparkline, inputCls } from "@/components/ui";
import { Lines } from "@/components/charts";
import { AuditTable } from "@/components/audit";

type Group = "review" | "routine" | "none";

function groupOf(d: Data, p: Patient): Group {
  if (d.reviews.some((r) => r.patientId === p.id && r.status === "open")) return "review";
  if (d.reviews.some((r) => r.patientId === p.id && r.status === "acknowledged") || d.followups.some((f) => f.patientId === p.id && f.owner === "doctor" && f.status === "open")) return "routine";
  return "none";
}

const GROUPS: { id: Group; title: string; tone: "bad" | "warn" | "ok"; icon: React.ReactNode }[] = [
  { id: "review", title: "تتطلب مراجعة", tone: "bad", icon: <ShieldAlert size={14} /> },
  { id: "routine", title: "متابعة روتينية", tone: "warn", icon: <Clock size={14} /> },
  { id: "none", title: "لا توجد إشارة مراجعة", tone: "ok", icon: <CircleCheck size={14} /> },
];

export default function DoctorPageWrap() {
  return <Suspense><DoctorPage /></Suspense>;
}

function DoctorPage() {
  const d = useData();
  const params = useSearchParams();
  const doc = d.doctors.find((x) => x.id === CARE_DOCTOR)!;
  const enrolled = d.devices.map((dv) => d.patients.find((p) => p.id === dv.patientId)!);
  const firstReview = enrolled.find((p) => groupOf(d, p) === "review");
  const [sel, setSel] = useState<string>(params.get("id") ?? firstReview?.id ?? enrolled[0].id);
  const p = enrolled.find((x) => x.id === sel) ?? enrolled[0];
  const r24 = d.readings.filter((r) => Date.now() - new Date(r.at).getTime() < 86400000).length;

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="Doctor Monitoring"
        title={`لوحة متابعة الطبيب — ${doc.name}`}
        subtitle="مرضى برنامج الرعاية المتصلة مرتبون حسب الحاجة للمراجعة. الإشارات ناتجة عن قواعد توضيحية لا عن تشخيص؛ القرار السريري للطبيب."
        actions={<Badge tone="muted">{doc.title}</Badge>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="مرضى مسجّلون في البرنامج" value={enrolled.length} icon={<Watch size={16} />} tone="muted" hint="أسورة نموذج تطوير" />
        <Kpi label="تتطلب مراجعة" value={enrolled.filter((x) => groupOf(d, x) === "review").length} icon={<ShieldAlert size={16} />} tone="bad" hint="إشارات مفتوحة" />
        <Kpi label="متابعة روتينية" value={enrolled.filter((x) => groupOf(d, x) === "routine").length} icon={<Clock size={16} />} tone="warn" hint={`${d.followups.filter((f) => f.owner === "doctor" && f.status === "open").length} مهام متابعة مفتوحة`} />
        <Kpi label="قراءات آخر 24 ساعة" value={num(r24)} icon={<CheckCheck size={16} />} tone="acc" hint="بيانات تجريبية" />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-5">
          {GROUPS.map((g) => {
            const list = enrolled.filter((x) => groupOf(d, x) === g.id);
            return (
              <Card key={g.id} title={<span className="flex items-center gap-2">{g.title}</span>} tag={<Badge tone={g.tone} dot pulse={g.id === "review" && list.length > 0}>{list.length}</Badge>} bodyClass="px-3 pb-3 pt-3">
                {list.length ? (
                  <div className="space-y-2">
                    {list.map((x) => <PatientRow key={x.id} p={x} active={x.id === p.id} onClick={() => setSel(x.id)} tone={g.tone} />)}
                  </div>
                ) : <div className="px-2 py-3 text-[12.5px] text-tx3">لا مرضى في هذه المجموعة</div>}
              </Card>
            );
          })}
        </div>
        <div className="xl:col-span-7">
          <PatientDetail key={p.id} p={p} />
        </div>
      </div>
    </div>
  );
}

function PatientRow({ p, active, onClick, tone }: { p: Patient; active: boolean; onClick: () => void; tone: "bad" | "warn" | "ok" }) {
  const d = useData();
  const rs = d.readings.filter((r) => r.patientId === p.id).slice(-24);
  const last = rs.at(-1);
  const color = tone === "bad" ? "#e07f74" : tone === "warn" ? "#d6a85c" : "#5c9de8";
  return (
    <button onClick={onClick} className={cls("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-right transition-colors", active ? "border-white/20 bg-white/[0.05]" : "hairline bg-s2 hover:border-white/12")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><span className="truncate text-[13px] font-medium">{p.name}</span><span className="latin text-[10.5px] text-tx3">#{p.id.toUpperCase()}</span></div>
        <div className="mt-0.5 truncate text-[11.5px] text-tx3">{p.careProgram} · آخر قراءة {last ? ago(last.at) : "—"}</div>
      </div>
      <div className="hidden text-left sm:block">
        <div dir="ltr" className="latin text-[12px] text-tx2">{last?.hr ?? "—"} <span className="text-tx3">bpm</span> · {last?.spo2 ?? "—"}%</div>
      </div>
      <Sparkline values={rs.map((r) => r.hr)} color={color} width={84} height={28} />
    </button>
  );
}

function PatientDetail({ p }: { p: Patient }) {
  const d = useData();
  const rs = useMemo(() => d.readings.filter((r) => r.patientId === p.id).slice(-48), [d.readings, p.id]);
  const chart = rs.map((r) => ({ label: hhmm(r.at), hr: r.hr, spo2: r.spo2, temp: r.temp }));
  const review: CareReview | undefined = d.reviews.find((r) => r.patientId === p.id && r.status !== "completed");
  const closed = d.reviews.filter((r) => r.patientId === p.id && r.status === "completed").slice(0, 2);
  const fus = d.followups.filter((f) => f.patientId === p.id);
  const audit = d.audit.filter((a) => a.patientId === p.id && ["care", "doctor"].includes(a.actor)).slice(0, 6);
  const upcoming = d.appointments.find((a) => a.patientId === p.id && new Date(a.start) > new Date() && a.status !== "cancelled");
  const [fu, setFu] = useState(false);
  const [done, setDone] = useState(false);
  const [title, setTitle] = useState("اتصال هاتفي لمراجعة القراءات مع المريض");
  const [due, setDue] = useState(1);
  const [note, setNote] = useState("راجعت القراءات؛ متابعة هاتفية وإعادة القياس بعد 48 ساعة.");
  const dv = d.devices.find((x) => x.patientId === p.id);
  const th = d.thresholds;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b hairline p-5">
        <div>
          <div className="flex items-center gap-2"><h2 className="text-[19px] font-semibold">{p.name}</h2><span className="latin text-[11px] text-tx3">#{p.id.toUpperCase()}</span></div>
          <div className="mt-1 text-[12.5px] text-tx3">{p.age} سنة · {p.careProgram} · {dv?.model} · آخر مزامنة {dv ? ago(dv.lastSync) : "—"}</div>
          {upcoming && <div className="mt-1 text-[12px] text-tx2">الموعد القادم: {fmtDayTime(upcoming.start)}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Eye size={14} />} disabled={review?.status !== "open"} onClick={() => review && act.acknowledgeReview(review.id)}>تأكيد الاطلاع</Button>
          <Button size="sm" icon={<ClipboardPlus size={14} />} onClick={() => setFu(true)}>مهمة متابعة</Button>
          <Button size="sm" variant="primary" icon={<CheckCheck size={14} />} disabled={!review} onClick={() => setDone(true)}>إغلاق المراجعة</Button>
        </div>
      </div>

      <div className="p-5">
        {review ? (
          <div className={cls("rounded-2xl border p-4", review.status === "open" ? "border-bad/30 bg-bad/[0.06]" : "border-warn/25 bg-warn/[0.05]")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className={cls("flex items-center gap-2 text-[13.5px] font-semibold", review.status === "open" ? "text-bad" : "text-warn")}>
                <ShieldAlert size={16} /> {review.status === "open" ? "إشارة مراجعة مفتوحة" : "اطّلع الطبيب — قيد المتابعة"}
              </div>
              <span className="text-[11.5px] text-tx3">أنشأها وكيل الرعاية المتصلة {ago(review.createdAt)} · {review.readingIds.length} قراءة</span>
            </div>
            <ul className="mt-2 space-y-1 text-[12.5px] text-tx">
              {review.reasons.map((r) => <li key={r}>• {r}</li>)}
            </ul>
            <div className="mt-2 text-[11.5px] text-tx3">قاعدة توضيحية تتطلب اعتمادًا سريريًا — ليست تشخيصًا. {review.acknowledgedAt && `اطّلع الطبيب ${fmtTime(review.acknowledgedAt)}.`}</div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl border border-ok/20 bg-ok/[0.05] px-4 py-3 text-[13px] text-ok"><CircleCheck size={16} /> لا توجد إشارة مراجعة مفتوحة لهذا المريض.</div>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="card-2 p-3">
            <div className="mb-1 flex items-center justify-between text-[12px]"><span className="text-tx2">نبض القلب</span><span className="latin text-tx3">bpm</span></div>
            <Lines data={chart} height={150} domain={[40, 140]} series={[{ key: "hr", name: "النبض", color: "#e07f74" }]} refLines={[{ y: th.hrHigh, label: `${th.hrHigh}` }]} />
          </div>
          <div className="card-2 p-3">
            <div className="mb-1 flex items-center justify-between text-[12px]"><span className="text-tx2">تشبّع الأكسجين</span><span className="latin text-tx3">SpO₂ %</span></div>
            <Lines data={chart} height={150} domain={[86, 100]} series={[{ key: "spo2", name: "SpO₂", color: "#8ea8c3" }]} refLines={[{ y: th.spo2Low, label: `${th.spo2Low}%` }]} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <div className="mb-2 text-[12.5px] font-medium">مهام المتابعة</div>
            <div className="space-y-2">
              {fus.length ? fus.slice(0, 4).map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-xl border hairline bg-s2 px-3 py-2">
                  <div className="min-w-0 flex-1"><div className={cls("truncate text-[12.5px]", f.status === "done" && "text-tx3 line-through")}>{f.title}</div><div className="text-[11px] text-tx3">{f.owner === "doctor" ? "الطبيب" : "العيادة"} · استحقاق {fmtDayTime(f.due)}</div></div>
                  {f.status === "open" ? <Button size="sm" variant="ghost" onClick={() => act.completeFollowUp(f.id)}>إنجاز</Button> : <Badge tone="ok">منجزة</Badge>}
                </div>
              )) : <div className="text-[12px] text-tx3">لا مهام</div>}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[12.5px] font-medium">آخر القراءات</div>
            <div className="overflow-hidden rounded-xl border hairline">
              <table className="w-full text-[12px]">
                <thead className="bg-white/[0.03] text-tx3"><tr><th className="px-3 py-1.5 text-right font-medium">الوقت</th><th className="px-2 font-medium">نبض</th><th className="px-2 font-medium">SpO₂</th><th className="px-2 font-medium">حرارة</th></tr></thead>
                <tbody>
                  {rs.slice(-6).reverse().map((r) => (
                    <tr key={r.id} className={cls("border-t border-white/[0.04] text-center", r.flagged?.length && "bg-bad/[0.06]")}>
                      <td className="latin px-3 py-1.5 text-right text-tx3">{hhmm(r.at)}</td>
                      <td className={cls("latin", r.flagged?.includes("hr") && "text-bad")}>{r.hr}</td>
                      <td className={cls("latin", r.flagged?.includes("spo2") && "text-bad")}>{r.spo2}%</td>
                      <td className={cls("latin", r.flagged?.includes("temp") && "text-bad")}>{r.temp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-[12.5px] font-medium">سجل الرعاية</div>
          <AuditTable rows={audit} compact empty="لا سجلات" />
          {closed.length > 0 && <div className="mt-2 text-[11.5px] text-tx3">مراجعات مغلقة: {closed.map((c) => c.note ?? "—").join(" · ")}</div>}
        </div>
      </div>

      <Dialog open={fu} onClose={() => setFu(false)} title="إنشاء مهمة متابعة" footer={<><Button variant="ghost" onClick={() => setFu(false)}>إلغاء</Button><Button variant="primary" onClick={() => { act.createFollowUp({ patientId: p.id, title, dueDays: due, reviewId: review?.id }); setFu(false); }}>إنشاء</Button></>}>
        <div className="space-y-3">
          <Field label="نوع المتابعة">
            <select className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)}>
              {["اتصال هاتفي لمراجعة القراءات مع المريض", "حجز زيارة متابعة في العيادة", "إعادة القياس وإرسال القراءات خلال 48 ساعة", "مراجعة الأدوية الحالية في الزيارة القادمة"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="الاستحقاق خلال (أيام)"><input type="number" min={0} max={30} className={inputCls} value={due} onChange={(e) => setDue(Number(e.target.value))} /></Field>
          <p className="text-[12px] text-tx3">إنشاء المهمة يسجّل اطلاع الطبيب على الإشارة ويظهر في سجل التدقيق.</p>
        </div>
      </Dialog>
      <Dialog open={done} onClose={() => setDone(false)} title="إغلاق مهمة المراجعة" footer={<><Button variant="ghost" onClick={() => setDone(false)}>إلغاء</Button><Button variant="primary" onClick={() => { if (review) act.completeReview(review.id, note); setDone(false); }}>إغلاق المراجعة</Button></>}>
        <Field label="ملاحظة الطبيب"><textarea className={cls(inputCls, "h-24 py-2 leading-6")} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Dialog>
    </section>
  );
}
