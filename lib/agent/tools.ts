"use client";
import type { Specialty } from "@/types";
import type { AgentMode } from "./spec";
import { mutate, useStore } from "@/lib/store";
import { act } from "@/lib/store/actions";
import { audit, freeSlots, isTaken, nid, queueAhead } from "@/lib/engine/core";
import { kpis } from "@/lib/engine/kpis";
import { APPT_STATUS, SPECIALTY, TASK_STATUS, AGENTS } from "@/lib/constants";
import { fmtDayTime, nowIso, sameDay, startOfDay } from "@/lib/time";

/* Implementations of Sura's tools. Reads go straight to the clinic data; anything consequential becomes a
   Proposal the human confirms in the chat, executed through the same actions the screens use. */

export interface Proposal {
  id: string;
  kind: "book" | "cancel" | "reschedule" | "approve";
  title: string;
  lines: string[];
  status: "pending" | "done" | "dismissed" | "failed";
  data: Record<string, string>;
}

type Out = { result: unknown; proposal?: Proposal };
let pseq = 0;
const pid = () => `prop-${Date.now().toString(36)}-${++pseq}`;
const data = () => useStore.getState().data;
const doc = (id: string) => data().doctors.find((d) => d.id === id);
const pname = (id: string) => data().patients.find((p) => p.id === id)?.name ?? "—";
const statusAr = (s: string) => APPT_STATUS[s as keyof typeof APPT_STATUS]?.label ?? s;

function slots(specialty: Specialty, date?: string) {
  const d = data();
  const docs = d.doctors.filter((x) => x.specialty === specialty);
  if (!docs.length) return { error: "unknown_specialty" };
  if (docs.every((x) => !x.available)) return { error: "doctor_unavailable", note: "الطبيب غير متاح للحجز حاليًا" };
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : undefined;
  const out = docs
    .filter((x) => x.available)
    .flatMap((x) => freeSlots(d, x.id, { from: day ?? new Date(), days: day ? 1 : 7, limit: 6 }).map((s) => ({ slot_id: `${x.id}|${s}`, doctor: x.name, specialty: SPECIALTY[x.specialty], when: fmtDayTime(s), fee_omr: x.fee, start: s })))
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 6)
    .map(({ start: _s, ...rest }) => rest);
  return out.length ? { slots: out } : { slots: [], note: "لا توجد مواعيد شاغرة في الفترة المطلوبة" };
}

function parseSlot(slotId: unknown) {
  const [doctorId, start] = String(slotId ?? "").split("|");
  const dr = doctorId ? doc(doctorId) : undefined;
  if (!dr || !start || Number.isNaN(Date.parse(start))) return null;
  return { doctorId, start, dr };
}

export function execTool(mode: AgentMode, name: string, args: Record<string, unknown>, ctx: { patientId?: string }): Out {
  const d = data();
  const me = ctx.patientId;
  switch (name) {
    case "get_clinic_info":
      return { result: { clinic: d.clinic.name, city: d.clinic.city, hours: "يوميًا 9:00 ص – 1:00 م و4:00 م – 6:00 م", doctors: d.doctors.map((x) => ({ id: x.id, name: x.name, specialty: SPECIALTY[x.specialty], fee_omr: x.fee, accepting_bookings: x.available })) } };

    case "find_available_slots":
      return { result: slots(args.specialty as Specialty, args.date as string | undefined) };

    case "get_my_appointments": {
      const mine = d.appointments.filter((a) => a.patientId === me);
      const up = mine.filter((a) => new Date(a.start) >= startOfDay(new Date()) && !["cancelled", "completed", "no_show"].includes(a.status));
      const past = mine.filter((a) => !up.includes(a)).slice(-3);
      const fmt = (a: (typeof mine)[number]) => ({ id: a.id, doctor: doc(a.doctorId)?.name, specialty: SPECIALTY[doc(a.doctorId)!.specialty], when: fmtDayTime(a.start), status: statusAr(a.status) });
      return { result: { upcoming: up.map(fmt), recent: past.map(fmt) } };
    }

    case "propose_booking": {
      const s = parseSlot(args.slot_id);
      if (!s) return { result: { error: "invalid_slot_id" } };
      const patientId = mode === "patient" ? me : String(args.patient_id ?? "");
      if (!patientId || !d.patients.some((p) => p.id === patientId)) return { result: { error: "unknown_patient" } };
      if (isTaken(d, s.doctorId, s.start)) return { result: { error: "slot_taken", note: "هذا الموعد حُجز للتو، ابحثي عن غيره" } };
      const p: Proposal = { id: pid(), kind: "book", title: "ملخص الحجز", status: "pending", lines: [pname(patientId), `${s.dr.name} · ${SPECIALTY[s.dr.specialty]}`, fmtDayTime(s.start), `رسوم الكشف ${s.dr.fee} ر.ع.`], data: { patientId, doctorId: s.doctorId, start: s.start } };
      return { result: { proposal_id: p.id, status: "awaiting_confirmation", summary: p.lines.join(" | ") }, proposal: p };
    }

    case "propose_cancellation": {
      const a = d.appointments.find((x) => x.id === args.appointment_id);
      if (!a || (mode === "patient" && a.patientId !== me)) return { result: { error: "unknown_appointment" } };
      if (!["pending", "confirmed"].includes(a.status)) return { result: { error: "not_cancellable", status: statusAr(a.status) } };
      const p: Proposal = { id: pid(), kind: "cancel", title: "إلغاء الموعد", status: "pending", lines: [pname(a.patientId), doc(a.doctorId)!.name, fmtDayTime(a.start)], data: { appointmentId: a.id } };
      return { result: { proposal_id: p.id, status: "awaiting_confirmation" }, proposal: p };
    }

    case "propose_reschedule": {
      const a = d.appointments.find((x) => x.id === args.appointment_id);
      const s = parseSlot(args.slot_id);
      if (!a || (mode === "patient" && a.patientId !== me)) return { result: { error: "unknown_appointment" } };
      if (!s) return { result: { error: "invalid_slot_id" } };
      if (s.doctorId !== a.doctorId) return { result: { error: "different_doctor", note: "تغيير الموعد يكون مع نفس الطبيب؛ للحجز مع طبيب آخر استخدمي propose_booking" } };
      if (isTaken(d, s.doctorId, s.start)) return { result: { error: "slot_taken" } };
      const p: Proposal = { id: pid(), kind: "reschedule", title: "تغيير الموعد", status: "pending", lines: [doc(a.doctorId)!.name, `من ${fmtDayTime(a.start)}`, `إلى ${fmtDayTime(s.start)}`], data: { appointmentId: a.id, start: s.start } };
      return { result: { proposal_id: p.id, status: "awaiting_confirmation" }, proposal: p };
    }

    case "get_my_band_summary": {
      const dv = d.devices.find((x) => x.patientId === me);
      if (!dv) return { result: { enrolled: false } };
      const rs = d.readings.filter((r) => r.deviceId === dv.id);
      const last = rs.at(-1);
      const six = rs.filter((r) => Date.now() - new Date(r.at).getTime() < 6 * 3600000);
      const avg = (k: "hr" | "spo2" | "temp") => (six.length ? Math.round((six.reduce((n, r) => n + r[k], 0) / six.length) * 10) / 10 : null);
      const review = d.reviews.find((r) => r.patientId === me && r.status !== "completed");
      return { result: { device: dv.model, connected: dv.status === "connected", battery: dv.battery, last_reading: last && { heart_rate: last.hr, spo2: last.spo2, skin_temp: last.temp, steps: last.steps, at: fmtDayTime(last.at) }, six_hour_average: { heart_rate: avg("hr"), spo2: avg("spo2"), skin_temp: avg("temp") }, doctor_review: review ? (review.status === "open" ? "قراءات أُحيلت للطبيب للاطلاع" : "اطّلع الطبيب ويتابع") : "لا توجد إحالة", note: "قراءات توضيحية من نموذج تطوير؛ ليست تشخيصًا" } };
    }

    case "get_queue_status": {
      const a = d.appointments.find((x) => x.patientId === me && sameDay(x.start, new Date()) && !["cancelled", "completed", "no_show"].includes(x.status));
      if (!a) return { result: { has_appointment_today: false } };
      const ahead = queueAhead(d, a);
      return { result: { has_appointment_today: true, doctor: doc(a.doctorId)?.name, time: fmtDayTime(a.start), status: statusAr(a.status), patients_ahead: ahead, estimated_wait_minutes: ahead * 15 } };
    }

    case "notify_clinic_staff": {
      const reason = String(args.reason ?? "").slice(0, 200) || "طلب تواصل";
      const ok = mutate((x) => {
        x.followups.unshift({ id: nid(x, "fu"), patientId: me ?? "", title: `اتصال بالمريض: ${reason}`, due: nowIso(), status: "open", owner: "clinic", source: "sura", createdAt: nowIso() });
        audit(x, { event: "agent.escalation", actor: "sura", action: "تحويل لفريق العيادة", outcome: reason, patientId: me });
      });
      return { result: ok ? { created: true, note: "سيتواصل فريق العيادة" } : { created: false } };
    }

    case "get_clinic_overview": {
      const k = kpis(d);
      return { result: { appointments_total: k.total, confirmed: k.confirmed, awaiting_confirmation: k.pending, cancelled: k.cancelled, recovered: k.recovered, recovery_rate: `${Math.round(k.recoveryRate * 100)}%`, revenue_estimate_omr: k.revenue, recovered_value_omr: k.recoveredRevenue, inquiries: k.inquiries, conversion: `${Math.round(k.conversion * 100)}%`, today: { appointments: k.todayTotal, completed: k.todayDone, waiting: k.waiting, with_doctor: k.inRoom }, approvals_waiting: k.approvals, open_care_reviews: k.needsReview, unpaid_invoices: k.unpaid } };
    }

    case "get_today_schedule": {
      const rows = d.appointments
        .filter((a) => sameDay(a.start, new Date()) && a.status !== "cancelled" && (!args.doctor_id || a.doctorId === args.doctor_id))
        .slice(0, 40)
        .map((a) => ({ id: a.id, time: fmtDayTime(a.start), patient: pname(a.patientId), doctor: doc(a.doctorId)?.name, status: statusAr(a.status) }));
      return { result: { count: rows.length, appointments: rows } };
    }

    case "search_patients": {
      const q = String(args.query ?? "").trim();
      if (!q) return { result: { patients: [] } };
      const rows = d.patients
        .filter((p) => p.name.includes(q) || p.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")))
        .slice(0, 8)
        .map((p) => {
          const next = d.appointments.find((a) => a.patientId === p.id && new Date(a.start) > new Date() && !["cancelled", "completed"].includes(a.status));
          return { id: p.id, name: p.name, phone: p.phone, status: p.status, next_appointment: next ? fmtDayTime(next.start) : null };
        });
      return { result: { patients: rows } };
    }

    case "list_pending_approvals":
      return { result: { pending: d.tasks.filter((t) => t.status === "requires_approval").map((t) => ({ task_id: t.id, agent: AGENTS[t.agent].name, title: t.title, proposal: t.outcome, reasoning: t.reasoning })) } };

    case "propose_approval": {
      const t = d.tasks.find((x) => x.id === args.task_id);
      if (!t || t.status !== "requires_approval") return { result: { error: "not_pending", status: t ? TASK_STATUS[t.status].label : "unknown" } };
      const p: Proposal = { id: pid(), kind: "approve", title: "اعتماد اقتراح وكيل", status: "pending", lines: [AGENTS[t.agent].name, t.title, t.outcome ?? ""], data: { taskId: t.id } };
      return { result: { proposal_id: p.id, status: "awaiting_confirmation" }, proposal: p };
    }

    case "get_care_reviews":
      return { result: { reviews: d.reviews.filter((r) => r.status !== "completed").map((r) => ({ patient: pname(r.patientId), status: r.status === "open" ? "مفتوحة" : "اطّلع الطبيب", reasons: r.reasons, since: fmtDayTime(r.createdAt) })) } };

    case "run_reactivation_scan": {
      const before = d.outreach.length;
      act.scanInactive();
      const after = data().outreach.length;
      return { result: { drafts_created: after - before, note: "المسودات تنتظر الاعتماد في صفحة النمو" } };
    }
  }
  return { result: { error: "unknown_tool" } };
}

/* the human pressed "confirm" on a card */
export function executeProposal(mode: AgentMode, p: Proposal): boolean {
  const x = p.data;
  switch (p.kind) {
    case "book":
      return mode === "patient" ? act.bookFromApp(x.patientId, x.doctorId, x.start) : act.createAppointment({ patientId: x.patientId, doctorId: x.doctorId, start: x.start });
    case "cancel":
      return mode === "patient" ? act.cancelFromApp(x.appointmentId) : act.cancel(x.appointmentId, "طلب عبر سُرى");
    case "reschedule":
      return mode === "patient" ? act.rescheduleFromApp(x.appointmentId, x.start) : act.reschedule(x.appointmentId, x.start);
    case "approve":
      return act.approve(x.taskId);
  }
}

/* every model turn is recorded as Sura's work, with the tools it used as the decision trail */
export function logTurn(mode: AgentMode, userText: string, tools: string[], reply: string, via: "llm" | "rule", patientId?: string) {
  mutate((x) => {
    const id = nid(x, "tsk");
    x.tasks.unshift({ id, agent: "sura", eventId: "llm", title: mode === "patient" ? `محادثة مريض (${via === "llm" ? "نموذج لغوي" : "قواعد"})` : `طلب من فريق العيادة (${via === "llm" ? "نموذج لغوي" : "قواعد"})`, detail: userText.slice(0, 80), status: "completed", createdAt: nowIso(), completedAt: nowIso(), outcome: reply.slice(0, 160), reasoning: tools.length ? tools.map((t) => `أداة: ${t}`) : ["رد مباشر دون أدوات"], patientId });
    audit(x, { event: "agent.turn", actor: "sura", action: mode === "patient" ? "رد على مريض في التطبيق" : "تنفيذ طلب فريق العيادة", outcome: reply.slice(0, 120), patientId, ref: id });
  });
}
