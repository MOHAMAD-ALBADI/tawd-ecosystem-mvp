import type { AgentId, Data } from "@/types";
import { addMessage, apptOf, audit, cancelAppointment, emit, nid } from "./core";
import { approveTask, runOrchestrator } from "./orchestrator";
import { snapshot } from "./kpis";
import { nowIso } from "@/lib/time";

/* The live journey on /demo. Each step performs a real state change through the same engine the rest of
   the product uses; events created inside the journey are held until the presenter advances, so every
   agent hand-off is visible. */

export interface DemoStep {
  n: number;
  title: string;
  detail: string;
  agent: AgentId | "patient" | "staff" | "orchestrator";
}

export const DEMO_STEPS: DemoStep[] = [
  { n: 1, title: "وصول استفسار جديد", detail: "مريضة جديدة تراسل العيادة عبر واتساب (محاكاة) من حملة متابعة الأمراض المزمنة.", agent: "patient" },
  { n: 2, title: "سُرى تفهم الطلب", detail: "تحديد النية والتخصص، إنشاء سجل مبدئي، والتوجيه لوكيل الجدولة.", agent: "sura" },
  { n: 3, title: "الجدولة تنشئ الموعد", detail: "فحص التوفر، منع التعارض، وإنشاء موعد مبدئي.", agent: "scheduling" },
  { n: 4, title: "تأكيد الحضور", detail: "طلب تأكيد (محاكاة) وتسجيل رد المريضة.", agent: "attendance" },
  { n: 5, title: "المريضة تلغي", detail: "اعتذار طارئ يحرّر الموعد.", agent: "patient" },
  { n: 6, title: "الاسترداد يجد بديلًا", detail: "مطابقة قائمة الانتظار وإيجاد موعد بديل — ثم طلب اعتماد.", agent: "recovery" },
  { n: 7, title: "اعتماد وتنفيذ", detail: "اعتماد بشري، ملء الموعد المحرَّر، وإعادة جدولة المريضة.", agent: "staff" },
  { n: 8, title: "النتيجة الموثّقة", detail: "تظهر النتيجة في المواعيد وسجل المريضة ولوحة القيادة وسجل التدقيق.", agent: "orchestrator" },
];

export const DEMO_PATIENT = { name: "ريم بنت خالد السيابية", phone: "+968 9180 4427", text: "السلام عليكم، أريد موعد مع طبيب القلب." };

/* runs step `n` (1-based) on the draft; throws when the precondition is not met */
export function runDemoStep(s: Data, n: number, opts: { auto?: boolean } = {}) {
  const d = s.demo;
  if (n !== d.step + 1) throw new Error("خطوة غير متسلسلة");
  d.error = undefined;
  switch (n) {
    case 1: {
      s.demo = { step: 0, runId: nid(s, "run"), baseline: snapshot(s) };
      const q = { id: nid(s, "inq"), name: DEMO_PATIENT.name, phone: DEMO_PATIENT.phone, channel: "whatsapp" as const, campaignId: "c3", text: DEMO_PATIENT.text, status: "new" as const, createdAt: nowIso(), demo: true };
      s.inquiries.push(q);
      s.demo.inquiryId = q.id;
      addMessage(s, q.id, "patient", q.text, { mode: "simulated" });
      audit(s, { event: "inquiry.received", actor: "patient", action: "استفسار وارد عبر واتساب (محاكاة)", outcome: q.text, demo: true });
      emit(s, "inquiry.received", { inquiryId: q.id, demo: true });
      break;
    }
    case 2: {
      runOrchestrator(s, { release: ["inquiry.received"] });
      const q = s.inquiries.find((x) => x.id === d.inquiryId)!;
      s.demo.patientId = q.patientId;
      if (q.intent !== "booking") throw new Error("لم تُحدد نية الحجز");
      break;
    }
    case 3: {
      const q = s.inquiries.find((x) => x.id === d.inquiryId)!;
      if (!s.events.some((e) => e.type === "booking.requested" && e.payload.inquiryId === q.id && !e.processed)) {
        emit(s, "booking.requested", { inquiryId: q.id, specialty: q.specialty, demo: true }, { dedupeKey: `book-retry:${q.id}:${s.seq}` });
      }
      runOrchestrator(s, { release: ["booking.requested"] });
      if (!q.appointmentId) {
        s.demo.error = "تعذّر الحجز: لا يوجد طبيب قلب متاح. أعد إتاحة د. خالد من صفحة العمليات ثم أعد المحاولة.";
        return;
      }
      s.demo.apptId = q.appointmentId;
      break;
    }
    case 4: {
      runOrchestrator(s, { release: ["appointment.created"] });
      const q = s.inquiries.find((x) => x.id === d.inquiryId)!;
      addMessage(s, q.id, "patient", "نعم، أؤكد الحضور", { mode: "simulated" });
      emit(s, "confirmation.received", { apptId: d.apptId!, answer: "yes", demo: true });
      runOrchestrator(s, { release: ["confirmation.received"] });
      break;
    }
    case 5: {
      const q = s.inquiries.find((x) => x.id === d.inquiryId)!;
      addMessage(s, q.id, "patient", "أعتذر، طرأ ظرف عائلي ولن أتمكن من الحضور في هذا الموعد.", { mode: "simulated" });
      cancelAppointment(s, d.apptId!, { reason: "ظرف عائلي طارئ", by: "patient", actor: "patient", demo: true });
      break;
    }
    case 6: {
      runOrchestrator(s, { release: ["appointment.cancelled"] });
      const t = s.tasks.find((x) => x.proposal?.kind === "recovery" && x.proposal.cancelledId === d.apptId);
      if (!t) throw new Error("لم يُنشئ وكيل الاسترداد اقتراحًا");
      s.demo.approvalTaskId = t.id;
      if (t.proposal?.kind === "recovery") s.demo.waitPatientId = t.proposal.waitPatientId;
      break;
    }
    case 7: {
      approveTask(s, d.approvalTaskId!, "staff", opts.auto ? "اعتماد ضمن التشغيل الكامل للعرض" : "اعتمده فريق الاستقبال");
      runOrchestrator(s, { release: ["recovery.approved", "appointment.created"] });
      const q = s.inquiries.find((x) => x.id === d.inquiryId)!;
      if (s.demo.rescheduledApptId) {
        addMessage(s, q.id, "patient", "نعم، الموعد البديل يناسبني. شكرًا", { mode: "simulated" });
        emit(s, "confirmation.received", { apptId: s.demo.rescheduledApptId, answer: "yes", demo: true });
      }
      if (s.demo.recoveredApptId) emit(s, "confirmation.received", { apptId: s.demo.recoveredApptId, answer: "yes", demo: true });
      runOrchestrator(s, { release: ["confirmation.received"] });
      break;
    }
    case 8: {
      const filled = s.demo.recoveredApptId ? apptOf(s, s.demo.recoveredApptId) : undefined;
      emit(s, "outcome.recorded", { inquiryId: d.inquiryId!, value: filled?.price ?? 0, demo: true });
      runOrchestrator(s, { release: ["outcome.recorded"] });
      audit(s, { event: "journey.completed", actor: "orchestrator", action: "توثيق نتيجة الرحلة", outcome: filled ? `استُرد الموعد (+${filled.price} ر.ع. تقديرية) وأعيدت جدولة المريضة` : "أعيدت جدولة المريضة", demo: true });
      break;
    }
  }
  s.demo.step = n;
}
