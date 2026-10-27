import type { AgentId, ApptStatus, Channel, Specialty, TaskStatus } from "@/types";

export const SPECIALTY: Record<Specialty, string> = {
  cardiology: "أمراض القلب",
  dental: "طب الأسنان",
  internal: "الطب الباطني",
  dermatology: "الأمراض الجلدية",
};

/* words Sura's rule layer recognises in an inquiry; deterministic, shown to staff as the decision trail */
export const SPECIALTY_KEYWORDS: Record<Specialty, string[]> = {
  cardiology: ["قلب", "القلب", "ضغط", "خفقان", "نبض", "صدر"],
  dental: ["اسنان", "أسنان", "الأسنان", "الاسنان", "ضرس", "تقويم", "لثة", "تنظيف"],
  internal: ["باطنية", "باطني", "سكري", "السكري", "معدة", "حمى", "استشارة", "عام", "فحص"],
  dermatology: ["جلد", "جلدية", "بشرة", "حب الشباب", "حساسية", "شعر"],
};

export const CHANNEL: Record<Channel, string> = {
  whatsapp: "واتساب",
  instagram: "إنستغرام",
  web: "الموقع",
  phone: "الهاتف",
  app: "تطبيق المريض",
};

export const APPT_STATUS: Record<ApptStatus, { label: string; tone: Tone }> = {
  pending: { label: "بانتظار التأكيد", tone: "warn" },
  confirmed: { label: "مؤكد", tone: "ok" },
  checked_in: { label: "في الانتظار", tone: "info" },
  in_room: { label: "مع الطبيب", tone: "acc" },
  completed: { label: "مكتمل", tone: "muted" },
  cancelled: { label: "ملغى", tone: "bad" },
  no_show: { label: "لم يحضر", tone: "bad" },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  pending: { label: "قيد الانتظار", tone: "muted" },
  processing: { label: "قيد التنفيذ", tone: "info" },
  completed: { label: "مكتملة", tone: "ok" },
  requires_approval: { label: "تتطلب اعتمادًا", tone: "warn" },
  failed: { label: "تعذّرت", tone: "bad" },
};

export type Tone = "ok" | "warn" | "bad" | "info" | "acc" | "muted";

export interface AgentDef {
  id: AgentId;
  name: string;
  nameEn: string;
  role: string;
  pillar: "OPERATE" | "GROW" | "CARE";
  responsibilities: string[];
  permissions: string[];
  approvals: string[]; // actions that wait for a human
  color: string;
}

export const AGENTS: Record<AgentId, AgentDef> = {
  sura: {
    id: "sura",
    name: "سُرى",
    nameEn: "Sura · Patient Communication",
    role: "مسؤولة العمليات التنفيذية — التواصل مع المرضى وتنسيق الوكلاء",
    pillar: "OPERATE",
    responsibilities: ["فهم الاستفسارات وتحديد النية", "الرد من معلومات العيادة المعتمدة", "تحديد التخصص المطلوب", "توجيه المسار إلى الوكيل المختص"],
    permissions: ["conversation.reply", "patient.create_lead", "inquiry.classify", "workflow.route"],
    approvals: [],
    color: "#5c9de8",
  },
  scheduling: {
    id: "scheduling",
    name: "وكيل الجدولة",
    nameEn: "Scheduling Agent",
    role: "إيجاد المواعيد المتاحة وإنشاؤها وتعديلها دون تعارض",
    pillar: "OPERATE",
    responsibilities: ["البحث عن المواعيد المتاحة", "منع الحجز المزدوج", "إنشاء المواعيد", "إعادة الجدولة", "تحديث حالة الموعد"],
    permissions: ["slot.search", "appointment.create", "appointment.reschedule", "appointment.update_status"],
    approvals: [],
    color: "#8EA8C3",
  },
  attendance: {
    id: "attendance",
    name: "وكيل تأكيد الحضور",
    nameEn: "Attendance Confirmation Agent",
    role: "طلب تأكيد الحضور وتسجيل الردود ورصد غير المؤكد",
    pillar: "OPERATE",
    responsibilities: ["إنشاء طلبات التأكيد", "تتبع الردود", "تسجيل نية الحضور", "رصد المواعيد غير المؤكدة"],
    permissions: ["confirmation.request", "confirmation.record", "appointment.update_status"],
    approvals: [],
    color: "#B7A6D9",
  },
  recovery: {
    id: "recovery",
    name: "وكيل استرداد الإلغاءات",
    nameEn: "Cancellation Recovery Agent",
    role: "رصد الإلغاء، إيجاد بديل، وملء الموعد المحرَّر بموافقة",
    pillar: "OPERATE",
    responsibilities: ["رصد الإلغاءات", "إيجاد مواعيد بديلة", "اقتراح إعادة الجدولة", "مطابقة الموعد مع قائمة الانتظار", "تسجيل نتيجة الاسترداد"],
    permissions: ["slot.search", "waitlist.match", "recovery.propose", "appointment.fill_slot", "appointment.reschedule"],
    approvals: ["appointment.fill_slot", "appointment.reschedule"],
    color: "#D6A85C",
  },
  growth: {
    id: "growth",
    name: "وكيل النمو والاحتفاظ",
    nameEn: "Growth & Retention Agent",
    role: "نسب الاستفسارات للحملات، التحويل، وإعادة تنشيط المرضى",
    pillar: "GROW",
    responsibilities: ["رصد المرضى غير النشطين", "إدارة فرص إعادة التنشيط", "نسب الاستفسارات للحملات", "حساب التحويل", "صياغة رسائل التواصل وتتبع نتائجها"],
    permissions: ["campaign.attribute", "outreach.draft", "outreach.send_simulated", "followup.create"],
    approvals: ["outreach.send_simulated"],
    color: "#C9B58A",
  },
  care: {
    id: "care",
    name: "وكيل الرعاية المتصلة",
    nameEn: "Connected Care Agent",
    role: "استقبال قراءات السوار، تطبيق القواعد التوضيحية، وإحالة المراجعة للطبيب",
    pillar: "CARE",
    responsibilities: ["استقبال قراءات السوار (محاكاة)", "تقييم العتبات القابلة للضبط", "تحديد القراءات التي تتطلب مراجعة طبيب", "إنشاء مهام المتابعة", "إشعار لوحة الطبيب — دون أي تشخيص"],
    permissions: ["reading.evaluate", "review.create", "followup.create", "doctor.notify"],
    approvals: [],
    color: "#D08A80",
  },
};

export const AGENT_ORDER: AgentId[] = ["sura", "scheduling", "attendance", "recovery", "growth", "care"];

/* the orchestrator's routing table: which agent owns which domain event */
export const ROUTES: Record<string, AgentId> = {
  "inquiry.received": "sura",
  "booking.requested": "scheduling",
  "appointment.created": "attendance",
  "confirmation.received": "attendance",
  "appointment.cancelled": "recovery",
  "recovery.approved": "recovery",
  "recovery.declined": "recovery",
  "appointment.completed": "growth",
  "campaign.created": "growth",
  "growth.scan": "growth",
  "outreach.approved": "growth",
  "outreach.declined": "growth",
  "outcome.recorded": "growth",
  "wearable.reading": "care",
};

export const EVENT_LABEL: Record<string, string> = {
  "inquiry.received": "استفسار وارد",
  "booking.requested": "طلب حجز",
  "appointment.created": "موعد جديد",
  "confirmation.received": "رد التأكيد",
  "appointment.cancelled": "إلغاء موعد",
  "recovery.approved": "اعتماد الاسترداد",
  "recovery.declined": "رفض الاسترداد",
  "appointment.completed": "اكتمال زيارة",
  "wearable.reading": "قراءة سوار",
  "campaign.created": "حملة جديدة",
  "growth.scan": "فحص الاحتفاظ",
  "outreach.approved": "اعتماد تواصل",
  "outreach.declined": "رفض تواصل",
  "outcome.recorded": "توثيق النتيجة",
  "journey.completed": "اكتمال الرحلة",
  "approval.requested": "طلب اعتماد",
  "approval.granted": "اعتماد",
  "recovery.completed": "استرداد منفّذ",
  "patient.created": "مريض جديد",
  "task.failed": "مهمة متعذرة",
  "invoice.paid": "دفع فاتورة",
  "appointment.rescheduled": "إعادة جدولة",
  "appointment.confirmed": "تأكيد موعد",
  "appointment.checked_in": "تسجيل وصول",
  "appointment.in_room": "دخول للطبيب",
  "appointment.no_show": "عدم حضور",
  "review.acknowledged": "اطلاع الطبيب",
  "review.completed": "إغلاق مراجعة",
  "followup.created": "مهمة متابعة",
  "followup.done": "إنجاز متابعة",
  "care.thresholds": "عتبات الرعاية",
  "device.status": "حالة السوار",
  "doctor.availability": "إتاحة طبيب",
  "app.booking": "حجز من التطبيق",
  "outreach.sent": "إرسال تواصل",
};

export const ACTOR_LABEL: Record<string, string> = {
  sura: "سُرى",
  scheduling: "الجدولة",
  attendance: "تأكيد الحضور",
  recovery: "الاسترداد",
  growth: "النمو",
  care: "الرعاية المتصلة",
  staff: "فريق العيادة",
  patient: "المريض",
  doctor: "الطبيب",
  system: "النظام",
  orchestrator: "طود إنتلجنس",
};

export const DEFAULT_THRESHOLDS = { hrHigh: 120, hrLow: 45, spo2Low: 92, tempHigh: 38 };
