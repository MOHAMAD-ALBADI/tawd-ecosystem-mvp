"use client";
import type { Channel, Data, Specialty, Thresholds } from "@/types";
import { mutate, useStore } from "./index";
import {
  DomainError, addMessage, apptOf, audit, cancelAppointment, completeVisit, createAppointment, emit, nid, patientName, payInvoice, rescheduleAppointment, setStatus,
} from "@/lib/engine/core";
import { approveTask, declineTask } from "@/lib/engine/orchestrator";
import { runDemoStep } from "@/lib/engine/demo";
import { buildSeed } from "@/lib/data/seed";
import { fmtDayTime, nowIso } from "@/lib/time";

/* UI-facing actions. Each one is a single store transaction; events it emits are routed by TAWD Intelligence
   before the new state is committed. */

export const act = {
  createAppointment: (i: { patientId: string; doctorId: string; start: string; confirmed?: boolean }) =>
    mutate((d) => { createAppointment(d, { ...i, source: "staff", actor: "staff", status: i.confirmed ? "confirmed" : "pending" }); }, "أُنشئ الموعد ووصل الحدث إلى وكيل تأكيد الحضور"),
  confirm: (id: string) => mutate((d) => { setStatus(d, id, "confirmed", "staff"); }, "تم تأكيد الموعد"),
  cancel: (id: string, reason = "طلب من المريض") =>
    mutate((d) => { cancelAppointment(d, id, { reason, by: "clinic", actor: "staff" }); }, "أُلغي الموعد — وكيل الاسترداد يبحث عن بديل"),
  reschedule: (id: string, start: string) => mutate((d) => { rescheduleAppointment(d, id, start, "staff"); }, `أعيدت الجدولة إلى ${fmtDayTime(start)}`),
  checkIn: (id: string) => mutate((d) => { setStatus(d, id, "checked_in", "staff"); }, "سُجّل وصول المريض إلى الطابور"),
  callIn: (id: string) => mutate((d) => { setStatus(d, id, "in_room", "staff"); }, "المريض الآن مع الطبيب"),
  complete: (id: string) => mutate((d) => { completeVisit(d, id, "staff"); }, "اكتملت الزيارة وصدرت الفاتورة"),
  noShow: (id: string) => mutate((d) => { setStatus(d, id, "no_show", "staff"); }, "سُجّل عدم الحضور"),
  pay: (id: string) => mutate((d) => { payInvoice(d, id, "staff"); }, "سُجّل الدفع"),
  toggleDoctor: (id: string) =>
    mutate((d) => {
      const doc = d.doctors.find((x) => x.id === id)!;
      doc.available = !doc.available;
      audit(d, { event: "doctor.availability", actor: "staff", action: doc.available ? "إتاحة الطبيب للحجز" : "إيقاف حجز الطبيب", outcome: doc.name });
    }),

  approve: (taskId: string) => mutate((d) => approveTask(d, taskId, "staff"), "اعتُمد الإجراء ونفّذه الوكيل"),
  decline: (taskId: string) => mutate((d) => declineTask(d, taskId), "رُفض الاقتراح ولم يُنفذ شيء"),

  submitInquiry: (i: { name: string; phone?: string; channel: Channel; text: string; campaignId?: string }) => {
    let id = "";
    const ok = mutate((d) => {
      const q = { id: nid(d, "inq"), name: i.name, phone: i.phone, channel: i.channel, campaignId: i.campaignId, text: i.text, status: "new" as const, createdAt: nowIso() };
      d.inquiries.push(q);
      addMessage(d, q.id, "patient", i.text, { mode: "simulated" });
      emit(d, "inquiry.received", { inquiryId: q.id });
      id = q.id;
    });
    return ok ? id : "";
  },
  setMessageText: (msgId: string, text: string) =>
    useStore.setState((s) => ({ data: { ...s.data, messages: s.data.messages.map((m) => (m.id === msgId ? { ...m, text, mode: "llm" as const } : m)) } })),

  createCampaign: (c: { name: string; channel: Channel; specialty?: Specialty; budget: number }) =>
    mutate((d) => {
      const id = nid(d, "c");
      d.campaigns.push({ id, ...c, startDate: nowIso(), status: "active", createdBy: "staff" });
      audit(d, { event: "campaign.created", actor: "staff", action: "إنشاء حملة تجريبية", outcome: `${c.name} · ${c.budget} ر.ع.` });
      emit(d, "campaign.created", { campaignId: id });
    }, "أُنشئت الحملة — وكيل النمو جهّز الجمهور المستهدف"),
  scanInactive: () => mutate((d) => { emit(d, "growth.scan", { at: nowIso() }); }, "فحص وكيل النمو المرضى غير النشطين"),

  addReading: (patientId: string, mode: "normal" | "review") => mutate((d) => addReading(d, patientId, mode)),
  setSim: (patch: Partial<Data["sim"]>) => useStore.setState((s) => ({ data: { ...s.data, sim: { ...s.data.sim, ...patch } } })),
  setThresholds: (t: Thresholds) =>
    mutate((d) => {
      d.thresholds = t;
      audit(d, { event: "care.thresholds", actor: "doctor", action: "تعديل العتبات التوضيحية", outcome: `نبض > ${t.hrHigh} · SpO₂ < ${t.spo2Low}% · حرارة ≥ ${t.tempHigh}°` });
    }, "حُدّثت العتبات التوضيحية"),
  toggleDevice: (id: string) =>
    mutate((d) => {
      const dv = d.devices.find((x) => x.id === id)!;
      dv.status = dv.status === "connected" ? "disconnected" : "connected";
      audit(d, { event: "device.status", actor: "system", action: dv.status === "connected" ? "إعادة اتصال السوار" : "انقطاع اتصال السوار (محاكاة)", outcome: patientName(d, dv.patientId), patientId: dv.patientId });
    }),
  acknowledgeReview: (id: string) =>
    mutate((d) => {
      const r = d.reviews.find((x) => x.id === id)!;
      if (r.status !== "open") throw new DomainError("المراجعة ليست مفتوحة");
      r.status = "acknowledged";
      r.acknowledgedAt = nowIso();
      const t = d.tasks.find((x) => x.ref === r.id && x.agent === "care");
      if (t) t.outcome = `${t.outcome ?? ""} · اطّلع الطبيب`;
      audit(d, { event: "review.acknowledged", actor: "doctor", action: "تأكيد الاطلاع على إشارة المراجعة", outcome: patientName(d, r.patientId), patientId: r.patientId, ref: r.id });
    }, "سُجّل اطلاع الطبيب"),
  completeReview: (id: string, note: string) =>
    mutate((d) => {
      const r = d.reviews.find((x) => x.id === id)!;
      r.status = "completed";
      r.completedAt = nowIso();
      r.note = note;
      d.followups.filter((f) => f.reviewId === r.id && f.owner === "doctor" && f.title.startsWith("مراجعة قراءات")).forEach((f) => (f.status = "done"));
      const t = d.tasks.find((x) => x.ref === r.id && x.agent === "care");
      if (t) t.outcome = "أغلق الطبيب المراجعة";
      audit(d, { event: "review.completed", actor: "doctor", action: "إغلاق مهمة المراجعة", outcome: note || "أُغلقت", patientId: r.patientId, ref: r.id });
    }, "أُغلقت مهمة المراجعة"),
  createFollowUp: (i: { patientId: string; title: string; dueDays: number; reviewId?: string }) =>
    mutate((d) => {
      const due = new Date(Date.now() + i.dueDays * 86400000).toISOString();
      d.followups.unshift({ id: nid(d, "fu"), patientId: i.patientId, title: i.title, due, status: "open", owner: "doctor", source: "doctor", reviewId: i.reviewId, createdAt: nowIso() });
      if (i.reviewId) {
        const r = d.reviews.find((x) => x.id === i.reviewId);
        if (r && r.status === "open") { r.status = "acknowledged"; r.acknowledgedAt = nowIso(); }
      }
      audit(d, { event: "followup.created", actor: "doctor", action: "إنشاء مهمة متابعة", outcome: i.title, patientId: i.patientId });
    }, "أُنشئت مهمة المتابعة"),
  completeFollowUp: (id: string) =>
    mutate((d) => {
      const f = d.followups.find((x) => x.id === id)!;
      f.status = "done";
      audit(d, { event: "followup.done", actor: f.owner === "doctor" ? "doctor" : "staff", action: "إنجاز مهمة متابعة", outcome: f.title, patientId: f.patientId });
    }, "أُنجزت المهمة"),

  bookFromApp: (patientId: string, doctorId: string, start: string) =>
    mutate((d) => {
      const a = createAppointment(d, { patientId, doctorId, start, source: "patient_app", actor: "patient", status: "pending" });
      audit(d, { event: "app.booking", actor: "patient", action: "حجز من تطبيق المريض", outcome: fmtDayTime(a.start), patientId, ref: a.id });
    }, "تم الحجز — ظهر الموعد في جدول العيادة"),
  cancelFromApp: (id: string) =>
    mutate((d) => {
      const a = apptOf(d, id);
      cancelAppointment(d, a.id, { reason: "ألغاه المريض من التطبيق", by: "patient", actor: "patient" });
    }, "أُلغي الموعد — أُبلغت العيادة"),
  rescheduleFromApp: (id: string, start: string) =>
    mutate((d) => { rescheduleAppointment(d, id, start, "patient"); }, "تم تغيير الموعد"),
  confirmFromApp: (id: string) =>
    mutate((d) => { emit(d, "confirmation.received", { apptId: id, answer: "yes" }, { dedupeKey: `app-confirm:${id}:${d.seq}` }); }, "تم تأكيد حضورك"),

  demoStep: (n: number, auto = false) => mutate((d) => runDemoStep(d, n, { auto })),
  resetAll: () => useStore.getState().reset(),
  reseed: () => useStore.setState({ data: buildSeed() }),
};

/* ---- simulated wearable stream (software integration test for the band development programme) ---- */

const REVIEW_HR = [96, 103, 110, 117, 123, 127, 131, 129, 126, 124];
const REVIEW_SPO2 = [97, 96, 95, 94, 93, 92, 91, 91, 90, 91];
const REVIEW_TEMP = [36.9, 37.0, 37.1, 37.3, 37.4, 37.5, 37.6, 37.6, 37.7, 37.6];

function addReading(d: Data, patientId: string, mode: "normal" | "review") {
  const dv = d.devices.find((x) => x.patientId === patientId);
  if (!dv) throw new DomainError("المريض غير مسجّل في برنامج السوار");
  if (dv.status !== "connected") throw new DomainError("السوار غير متصل — لا تصل قراءات");
  const tick = d.sim.tick;
  const last = d.readings.filter((r) => r.deviceId === dv.id).at(-1);
  const baseHr = last && mode === "normal" ? Math.min(Math.max(last.hr, 66), 88) : 78;
  const wobble = [0, 2, -1, 3, -2, 1, -3, 2][tick % 8];
  const i = Math.min(tick, REVIEW_HR.length - 1);
  const r = {
    id: nid(d, "rd"),
    deviceId: dv.id,
    patientId,
    at: nowIso(),
    hr: mode === "review" ? REVIEW_HR[i] + (tick >= REVIEW_HR.length ? wobble : 0) : Math.round(baseHr * 0.6 + 76 * 0.4 + wobble),
    spo2: mode === "review" ? REVIEW_SPO2[i] : 97 + (tick % 3 === 0 ? 1 : 0),
    temp: mode === "review" ? REVIEW_TEMP[i] : Math.round((36.6 + (tick % 4) * 0.05) * 10) / 10,
    steps: 180 + ((tick * 137) % 420),
    source: "simulation" as const,
  };
  d.readings.push(r);
  const mine = d.readings.filter((x) => x.deviceId === dv.id);
  if (mine.length > 140) d.readings = d.readings.filter((x) => x.deviceId !== dv.id || x.at >= mine[mine.length - 140].at);
  dv.lastSync = r.at;
  if (tick % 12 === 11) dv.battery = Math.max(5, dv.battery - 1);
  d.sim = { ...d.sim, tick: tick + 1 };
  emit(d, "wearable.reading", { readingId: r.id });
}
