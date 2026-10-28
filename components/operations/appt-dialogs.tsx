"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Appointment } from "@/types";
import { useData } from "@/lib/store";
import { act } from "@/lib/store/actions";
import { freeSlots } from "@/lib/engine/core";
import { SPECIALTY } from "@/lib/constants";
import { addDays, fmtDay, fmtDayTime, hhmm, sameDay, startOfDay } from "@/lib/time";
import { cls } from "@/lib/format";
import { ApptBadge, Badge, Button, Dialog, Field, inputCls } from "@/components/ui";

const SOURCE: Record<Appointment["source"], string> = { sura: "سُرى (محادثة)", staff: "الاستقبال", patient_app: "تطبيق المريض", recovery: "وكيل الاسترداد", phone: "هاتف" };
export const sourceLabel = (s: Appointment["source"]) => SOURCE[s];

export function NewAppointmentDialog({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: { doctorId?: string; start?: string; patientId?: string } }) {
  const d = useData();
  const [q, setQ] = useState("");
  const [patientId, setPatientId] = useState(preset?.patientId ?? "");
  const [doctorId, setDoctorId] = useState(preset?.doctorId ?? d.doctors[0].id);
  const days = useMemo(() => Array.from({ length: 10 }, (_, i) => addDays(startOfDay(new Date()), i)), []);
  const [day, setDay] = useState(preset?.start ? Math.max(0, days.findIndex((x) => sameDay(x, preset.start!))) : 1);
  const [slot, setSlot] = useState(preset?.start ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const slots = freeSlots(d, doctorId, { from: days[day], days: 1 });
  const matches = q.trim() ? d.patients.filter((p) => p.name.includes(q.trim()) || p.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))).slice(0, 6) : [];
  const chosen = d.patients.find((p) => p.id === patientId);
  const submit = () => {
    if (!patientId || !slot) return;
    if (act.createAppointment({ patientId, doctorId, start: slot, confirmed })) onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title="موعد جديد" footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button variant="primary" disabled={!patientId || !slot} onClick={submit}>إنشاء الموعد</Button></>}>
      <div className="space-y-4">
        <Field label="المريض">
          {chosen ? (
            <div className="flex items-center justify-between rounded-xl border border-acc/30 bg-acc/[0.06] px-3 py-2 text-[13px]"><span>{chosen.name} <span className="latin text-tx3">{chosen.phone}</span></span><button className="text-[12px] text-tx3 hover:text-tx" onClick={() => setPatientId("")}>تغيير</button></div>
          ) : (
            <>
              <input className={inputCls} placeholder="ابحث بالاسم أو الهاتف…" value={q} onChange={(e) => setQ(e.target.value)} />
              {matches.length > 0 && (
                <div className="mt-1.5 overflow-hidden rounded-xl border hairline">
                  {matches.map((p) => <button key={p.id} onClick={() => { setPatientId(p.id); setQ(""); }} className="flex w-full items-center justify-between px-3 py-2 text-right text-[13px] hover:bg-white/[0.04]"><span>{p.name}</span><span className="latin text-[11.5px] text-tx3">{p.phone}</span></button>)}
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5">{d.patients.filter((p) => p.featured).slice(0, 5).map((p) => <button key={p.id} onClick={() => setPatientId(p.id)} className="rounded-full border border-line2 px-2.5 py-0.5 text-[11.5px] text-tx2 hover:text-tx">{p.name.split(" ")[0]} {p.name.split(" ").at(-1)}</button>)}</div>
            </>
          )}
        </Field>
        <Field label="الطبيب">
          <select className={inputCls} value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setSlot(""); }}>
            {d.doctors.map((x) => <option key={x.id} value={x.id}>{x.name} — {SPECIALTY[x.specialty]}{x.available ? "" : " (غير متاح)"}</option>)}
          </select>
        </Field>
        <Field label="اليوم">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {days.map((x, i) => <button key={i} onClick={() => { setDay(i); setSlot(""); }} className={cls("shrink-0 rounded-lg border px-2.5 py-1.5 text-[12px]", day === i ? "border-acc bg-acc/10 text-acc" : "hairline text-tx2")}>{fmtDay(x)}</button>)}
          </div>
        </Field>
        <Field label="الوقت المتاح" hint="الأوقات المحجوزة مستبعدة تلقائيًا — لا حجز مزدوج">
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {slots.length ? slots.map((s) => <button key={s} onClick={() => setSlot(s)} className={cls("latin h-9 rounded-lg border text-[12.5px]", slot === s ? "border-acc bg-brand text-white" : "hairline bg-s2")}>{hhmm(s)}</button>) : <span className="col-span-6 text-[12.5px] text-tx3">لا أوقات متاحة في هذا اليوم</span>}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-tx2"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="accent-[#2e7bd6]" /> أكّد المريض الحضور هاتفيًا (لا حاجة لطلب تأكيد)</label>
      </div>
    </Dialog>
  );
}

export function ApptActionsDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const d = useData();
  const a = d.appointments.find((x) => x.id === id);
  const [mode, setMode] = useState<"view" | "cancel" | "resched">("view");
  const [reason, setReason] = useState("طلب من المريض");
  const [slot, setSlot] = useState("");
  const close = () => { setMode("view"); setSlot(""); onClose(); };
  if (!a) return null;
  const doc = d.doctors.find((x) => x.id === a.doctorId)!;
  const p = d.patients.find((x) => x.id === a.patientId)!;
  const isToday = sameDay(a.start, new Date());
  const alts = mode === "resched" ? freeSlots(d, a.doctorId, { from: new Date(), days: 7, limit: 18 }) : [];
  const run = (ok: boolean) => ok && close();
  return (
    <Dialog open={!!a} onClose={close} title="تفاصيل الموعد">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={`/patients?id=${p.id}`} className="text-[16px] font-semibold hover:text-acc">{p.name}</Link>
          <div className="mt-1 text-[12.5px] text-tx2">{doc.name} · {SPECIALTY[doc.specialty]} · {doc.room}</div>
          <div className="mt-1 text-[13px]">{fmtDayTime(a.start)}</div>
        </div>
        <ApptBadge status={a.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge>المصدر: {SOURCE[a.source]}</Badge>
        <Badge tone={a.confirmation === "confirmed" ? "ok" : a.confirmation === "sent" ? "warn" : "muted"}>التأكيد: {{ not_sent: "لم يُرسل", sent: "مُرسل (محاكاة)", confirmed: "مؤكد", declined: "معتذر" }[a.confirmation]}</Badge>
        <Badge>{a.price} ر.ع.</Badge>
        {a.recovered && <Badge tone="warn">مُسترد من إلغاء</Badge>}
        {a.rescheduledFrom && <Badge tone="info">إعادة جدولة</Badge>}
        {a.cancelReason && <Badge tone="bad">{a.cancelReason}</Badge>}
      </div>

      {mode === "view" && (
        <div className="mt-5 flex flex-wrap gap-2">
          {a.status === "pending" && <Button variant="primary" onClick={() => run(act.confirm(a.id))}>تأكيد الموعد</Button>}
          {isToday && ["pending", "confirmed"].includes(a.status) && <Button onClick={() => run(act.checkIn(a.id))}>تسجيل الوصول</Button>}
          {a.status === "checked_in" && <Button variant="primary" onClick={() => run(act.callIn(a.id))}>إدخال للطبيب</Button>}
          {["checked_in", "in_room"].includes(a.status) && <Button variant={a.status === "in_room" ? "primary" : "secondary"} onClick={() => run(act.complete(a.id))}>إنهاء الزيارة وإصدار فاتورة</Button>}
          {["pending", "confirmed"].includes(a.status) && <Button onClick={() => setMode("resched")}>إعادة جدولة</Button>}
          {["pending", "confirmed", "checked_in"].includes(a.status) && <Button variant="danger" onClick={() => setMode("cancel")}>إلغاء</Button>}
          {a.status === "confirmed" && new Date(a.start) < new Date() && <Button variant="ghost" onClick={() => run(act.noShow(a.id))}>لم يحضر</Button>}
          {["completed", "cancelled", "no_show"].includes(a.status) && <span className="text-[12.5px] text-tx3">لا إجراءات متاحة لهذه الحالة.</span>}
        </div>
      )}
      {mode === "cancel" && (
        <div className="mt-5 space-y-3">
          <Field label="سبب الإلغاء">
            <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
              {["طلب من المريض", "ظرف طارئ", "تعارض مع العمل", "غياب الطبيب"].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <p className="text-[12px] text-tx3">سيصل حدث الإلغاء إلى وكيل الاسترداد ليقترح بديلًا ينتظر اعتمادك.</p>
          <div className="flex gap-2"><Button variant="danger" onClick={() => run(act.cancel(a.id, reason))}>تأكيد الإلغاء</Button><Button variant="ghost" onClick={() => setMode("view")}>رجوع</Button></div>
        </div>
      )}
      {mode === "resched" && (
        <div className="mt-5">
          <div className="mb-2 text-[12.5px] text-tx2">أقرب الأوقات المتاحة لدى {doc.name}</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {alts.map((s) => <button key={s} onClick={() => setSlot(s)} className={cls("h-9 rounded-lg border text-[12px]", slot === s ? "border-acc bg-brand text-white" : "hairline bg-s2")}>{fmtDayTime(s)}</button>)}
          </div>
          <div className="mt-3 flex gap-2"><Button variant="primary" disabled={!slot} onClick={() => run(act.reschedule(a.id, slot))}>تأكيد الوقت الجديد</Button><Button variant="ghost" onClick={() => setMode("view")}>رجوع</Button></div>
        </div>
      )}
    </Dialog>
  );
}
