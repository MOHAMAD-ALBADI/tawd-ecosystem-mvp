import type { Actor, Appointment, ApptSource, ApptStatus, AuditRecord, Data, Doctor, EventType, Message, OpEvent, Specialty } from "@/types";
import { SLOT_TIMES, addDays, at, fmtDayTime, nowIso, startOfDay } from "@/lib/time";

/* Domain operations shared by staff screens, the patient app and the agents. They mutate a draft copy of the
   data; the store commits the draft only if nothing threw. */

export class DomainError extends Error {}

export function nid(s: Data, prefix: string): string {
  s.seq += 1;
  return `${prefix}-${String(s.seq).padStart(4, "0")}`;
}

export function audit(s: Data, a: Omit<AuditRecord, "id" | "at"> & { at?: string }) {
  s.audit.unshift({ id: nid(s, "aud"), at: a.at ?? nowIso(), ...a });
  if (s.audit.length > 700) s.audit.length = 700;
}

export function emit(s: Data, type: EventType, payload: OpEvent["payload"], opts: { dedupeKey?: string; held?: boolean } = {}): OpEvent | null {
  const dedupeKey = opts.dedupeKey ?? `${type}:${JSON.stringify(payload)}`;
  if (s.events.some((e) => e.dedupeKey === dedupeKey)) return null; // idempotency: the same fact is never handled twice
  const ev: OpEvent = { id: nid(s, "evt"), type, at: nowIso(), payload, dedupeKey, processed: false, held: opts.held ?? !!payload.demo };
  s.events.push(ev);
  if (s.events.length > 900) {
    const drop = s.events.findIndex((e) => !e.processed);
    s.events.splice(0, Math.min(s.events.length - 900, drop === -1 ? s.events.length - 900 : drop));
  }
  return ev;
}

export function addMessage(s: Data, threadId: string, from: Message["from"], text: string, extra: Partial<Message> = {}) {
  s.messages.push({ id: nid(s, "msg"), threadId, from, text, at: nowIso(), ...extra });
}

export const doctorOf = (s: Data, id: string): Doctor => {
  const d = s.doctors.find((x) => x.id === id);
  if (!d) throw new DomainError("الطبيب غير موجود");
  return d;
};
export const patientName = (s: Data, id?: string) => s.patients.find((p) => p.id === id)?.name ?? "—";
export const apptOf = (s: Data, id: string): Appointment => {
  const a = s.appointments.find((x) => x.id === id);
  if (!a) throw new DomainError("الموعد غير موجود");
  return a;
};

const LIVE: ApptStatus[] = ["pending", "confirmed", "checked_in", "in_room", "completed"];

/* one live booking per doctor per slot: the double-booking guard every path goes through */
export function isTaken(s: Data, doctorId: string, iso: string, ignoreId?: string): boolean {
  return s.appointments.some((a) => a.doctorId === doctorId && a.start === iso && a.id !== ignoreId && LIVE.includes(a.status));
}

export function freeSlots(s: Data, doctorId: string, opts: { from?: Date; days?: number; limit?: number; exclude?: string[] } = {}): string[] {
  const out: string[] = [];
  const earliest = Math.max(Date.now() + 45 * 60000, (opts.from ?? new Date()).getTime());
  const first = startOfDay(opts.from ?? new Date());
  for (let o = 0; o < (opts.days ?? 10); o++) {
    const day = addDays(first, o);
    for (const t of SLOT_TIMES) {
      const iso = at(day, t);
      if (new Date(iso).getTime() < earliest || opts.exclude?.includes(iso)) continue;
      if (!isTaken(s, doctorId, iso)) {
        out.push(iso);
        if (out.length >= (opts.limit ?? 60)) return out;
      }
    }
  }
  return out;
}

export function firstFree(s: Data, specialty: Specialty, opts: { from?: Date; exclude?: string[]; doctorId?: string } = {}) {
  const docs = s.doctors.filter((d) => d.specialty === specialty && d.available && (!opts.doctorId || d.id === opts.doctorId));
  let best: { doctor: Doctor; slot: string } | null = null;
  for (const d of docs) {
    const slot = freeSlots(s, d.id, { from: opts.from, exclude: opts.exclude, limit: 1 })[0];
    if (slot && (!best || slot < best.slot)) best = { doctor: d, slot };
  }
  return best;
}

export function createAppointment(
  s: Data,
  i: { patientId: string; doctorId: string; start: string; source: ApptSource; actor: Actor; status?: ApptStatus; extra?: Partial<Appointment>; silent?: boolean; demo?: boolean },
): Appointment {
  const doc = doctorOf(s, i.doctorId);
  if (!s.patients.some((p) => p.id === i.patientId)) throw new DomainError("المريض غير موجود");
  if (isTaken(s, i.doctorId, i.start)) throw new DomainError("هذا الموعد محجوز — تم منع الحجز المزدوج");
  const a: Appointment = {
    id: nid(s, "apt"),
    patientId: i.patientId,
    doctorId: i.doctorId,
    start: i.start,
    status: i.status ?? "pending",
    source: i.source,
    price: doc.fee,
    confirmation: i.status === "confirmed" ? "confirmed" : "not_sent",
    createdAt: nowIso(),
    demo: i.demo,
    ...i.extra,
  };
  s.appointments.push(a);
  s.appointments.sort((x, y) => x.start.localeCompare(y.start));
  const p = s.patients.find((x) => x.id === i.patientId)!;
  if (p.status === "lead" || p.status === "inactive") p.status = "active";
  audit(s, { event: "appointment.created", actor: i.actor, action: `إنشاء موعد ${doc.name}`, outcome: fmtDayTime(a.start), patientId: a.patientId, ref: a.id, demo: i.demo });
  if (!i.silent) emit(s, "appointment.created", { apptId: a.id, demo: i.demo || undefined });
  return a;
}

export function cancelAppointment(s: Data, id: string, i: { reason: string; by: "patient" | "clinic"; actor: Actor; demo?: boolean }) {
  const a = apptOf(s, id);
  if (a.status === "cancelled") throw new DomainError("الموعد ملغى مسبقًا");
  if (a.status === "completed") throw new DomainError("لا يمكن إلغاء زيارة مكتملة");
  a.status = "cancelled";
  a.cancelReason = i.reason;
  a.cancelledBy = i.by;
  if (a.confirmation !== "confirmed") a.confirmation = "declined";
  audit(s, { event: "appointment.cancelled", actor: i.actor, action: "إلغاء موعد", outcome: `${i.reason} · ${fmtDayTime(a.start)}`, patientId: a.patientId, ref: a.id, demo: i.demo });
  emit(s, "appointment.cancelled", { apptId: a.id, demo: i.demo || undefined });
  return a;
}

export function rescheduleAppointment(s: Data, id: string, start: string, actor: Actor) {
  const a = apptOf(s, id);
  if (["cancelled", "completed", "no_show"].includes(a.status)) throw new DomainError("لا يمكن إعادة جدولة هذا الموعد");
  if (isTaken(s, a.doctorId, start, a.id)) throw new DomainError("الموعد الجديد محجوز");
  const old = a.start;
  a.start = start;
  a.status = "pending";
  a.confirmation = "not_sent";
  s.appointments.sort((x, y) => x.start.localeCompare(y.start));
  audit(s, { event: "appointment.rescheduled", actor, action: "إعادة جدولة", outcome: `${fmtDayTime(old)} ← ${fmtDayTime(start)}`, patientId: a.patientId, ref: a.id });
  emit(s, "appointment.created", { apptId: a.id, rescheduled: true }, { dedupeKey: `resched:${a.id}:${start}` });
  return a;
}

export function setStatus(s: Data, id: string, status: ApptStatus, actor: Actor) {
  const a = apptOf(s, id);
  const from = a.status;
  if (from === status) return a;
  const allowed: Record<ApptStatus, ApptStatus[]> = {
    pending: ["confirmed", "checked_in", "cancelled"],
    confirmed: ["checked_in", "cancelled", "no_show", "pending"],
    checked_in: ["in_room", "cancelled"],
    in_room: ["completed"],
    completed: [],
    cancelled: [],
    no_show: [],
  };
  if (!allowed[from].includes(status)) throw new DomainError("انتقال غير مسموح لحالة الموعد");
  a.status = status;
  if (status === "confirmed") a.confirmation = "confirmed";
  if (status === "checked_in") a.checkInAt = nowIso();
  const label: Partial<Record<ApptStatus, string>> = { confirmed: "تأكيد الموعد", checked_in: "تسجيل وصول", in_room: "دخول للطبيب", no_show: "تسجيل عدم حضور", pending: "إعادة إلى بانتظار التأكيد" };
  audit(s, { event: `appointment.${status}`, actor, action: label[status] ?? status, outcome: patientName(s, a.patientId), patientId: a.patientId, ref: a.id });
  return a;
}

export function completeVisit(s: Data, id: string, actor: Actor) {
  const a = apptOf(s, id);
  if (a.status !== "in_room" && a.status !== "checked_in") throw new DomainError("يجب أن يكون المريض في الانتظار أو مع الطبيب");
  a.status = "completed";
  const p = s.patients.find((x) => x.id === a.patientId);
  if (p) { p.lastVisit = nowIso(); p.status = "active"; }
  s.invoices.unshift({ id: nid(s, "inv"), appointmentId: a.id, patientId: a.patientId, amount: a.price, status: "unpaid", issuedAt: nowIso() });
  audit(s, { event: "appointment.completed", actor, action: "إنهاء الزيارة وإصدار فاتورة", outcome: `${a.price} ر.ع. — فاتورة غير مدفوعة`, patientId: a.patientId, ref: a.id });
  emit(s, "appointment.completed", { apptId: a.id });
  return a;
}

export function payInvoice(s: Data, id: string, actor: Actor) {
  const inv = s.invoices.find((x) => x.id === id);
  if (!inv) throw new DomainError("الفاتورة غير موجودة");
  if (inv.status === "paid") return;
  inv.status = "paid";
  audit(s, { event: "invoice.paid", actor, action: "تسجيل دفع فاتورة", outcome: `${inv.amount} ر.ع.`, patientId: inv.patientId, ref: inv.id });
}

/* queue position among today's patients for the same doctor, by slot time */
export function queueAhead(s: Data, a: Appointment): number {
  const day = startOfDay(a.start).getTime();
  return s.appointments.filter((x) => x.doctorId === a.doctorId && startOfDay(x.start).getTime() === day && x.start < a.start && ["confirmed", "checked_in", "in_room", "pending"].includes(x.status)).length;
}
