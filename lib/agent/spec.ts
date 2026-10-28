/* The contract between Sura's model and the clinic: the tools it may call and the rules it must follow.
   Tool implementations live in lib/agent/tools.ts and run on the clinic data, not in the model. */

export type AgentMode = "patient" | "staff";

type Props = Record<string, { type: string; description?: string; enum?: string[] }>;
const fn = (name: string, description: string, properties: Props = {}, required: string[] = []) => ({
  type: "function" as const,
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});

const SPECIALTY = { type: "string", enum: ["cardiology", "dental", "internal", "dermatology"], description: "cardiology=أمراض القلب، dental=الأسنان، internal=الباطنية/الاستشارة العامة، dermatology=الجلدية" };
const SLOT = { type: "string", description: "slot_id exactly as returned by find_available_slots" };
const APPT = { type: "string", description: "appointment id exactly as returned by a tool" };

const FIND = fn("find_available_slots", "Free slots for a specialty, read from the live schedule; booked slots are excluded. Returns slot_id values.", { specialty: SPECIALTY, date: { type: "string", description: "optional YYYY-MM-DD to search one day only" } }, ["specialty"]);

export const TOOL_SCHEMAS = {
  patient: [
    fn("get_clinic_info", "Clinic name, doctors with ids and specialties, consultation fees, opening hours."),
    FIND,
    fn("get_my_appointments", "This patient's upcoming and recent appointments, with ids and status."),
    fn("propose_booking", "Show the patient a booking summary card with a confirm button. Nothing is booked until the patient presses confirm.", { slot_id: SLOT }, ["slot_id"]),
    fn("propose_cancellation", "Show a cancellation card for one of the patient's appointments; it is cancelled only if the patient confirms.", { appointment_id: APPT }, ["appointment_id"]),
    fn("propose_reschedule", "Show a card to move one of the patient's appointments to a new slot with the same doctor; applied only on confirm.", { appointment_id: APPT, slot_id: SLOT }, ["appointment_id", "slot_id"]),
    fn("get_my_band_summary", "Latest TAWD Band readings (heart rate, SpO2, skin temperature, activity), 6-hour averages, and whether the doctor is reviewing them. Illustrative demo data, never diagnostic."),
    fn("get_queue_status", "Live waiting-room position for today's appointment, if the patient has one today."),
    fn("notify_clinic_staff", "Ask the clinic team to call the patient back (creates a staff follow-up task). Use for clinical questions, complaints, or anything you cannot do.", { reason: { type: "string" } }, ["reason"]),
  ],
  staff: [
    fn("get_clinic_overview", "Current KPIs: appointments, confirmations, cancellations, recoveries, revenue estimate, inquiries, conversion, approvals waiting, open care reviews."),
    fn("get_today_schedule", "Today's appointments with patient, doctor, time and status. Optional doctor filter.", { doctor_id: { type: "string" } }),
    fn("search_patients", "Find patients by part of the name or phone. Returns ids.", { query: { type: "string" } }, ["query"]),
    FIND,
    fn("propose_booking", "Booking card for a given patient; the staff member confirms it.", { patient_id: { type: "string" }, slot_id: SLOT }, ["patient_id", "slot_id"]),
    fn("propose_cancellation", "Cancellation card for an appointment; the staff member confirms it. A cancellation triggers the recovery agent.", { appointment_id: APPT }, ["appointment_id"]),
    fn("list_pending_approvals", "Agent proposals waiting for a human decision (recovery fills, outreach drafts)."),
    fn("propose_approval", "Card to approve one pending agent proposal; executed only when the staff member confirms.", { task_id: { type: "string" } }, ["task_id"]),
    fn("get_care_reviews", "Open TAWD Band review flags waiting for the doctor."),
    fn("run_reactivation_scan", "Ask the Growth agent to find inactive patients and draft outreach (drafts still need approval)."),
  ],
};

const COMMON = `- اكتبي نصًا عاديًا قصيرًا (جملة إلى ثلاث)، بلا Markdown ولا قوائم ولا رموز تعبيرية. إن كتب المستخدم بالإنجليزية فأجيبي بالإنجليزية.
- كل معلومة عن الأطباء أو المواعيد أو الأسعار أو القراءات يجب أن تأتي من أداة في هذه المحادثة. لا تخترعي موعدًا أو طبيبًا أو رقمًا.
- لا تقولي «تم الحجز» أو «تم الإلغاء» أبدًا: أنتِ تعرضين بطاقة، والإنسان هو من يضغط «تأكيد». قولي مثلًا «أرسلت لك ملخص الحجز، اضغط تأكيد».
- لا تشخيص ولا نصيحة دوائية ولا تفسير طبي للقراءات. البيانات كلها تجريبية لأغراض العرض.`;

export function systemPrompt(mode: AgentMode, context: string): string {
  if (mode === "staff")
    return `أنتِ سُرى، مسؤولة العمليات التنفيذية في العيادة ضمن منظومة طود (TAWD). تتحدثين مع فريق العيادة (استقبال/إدارة/طبيب).
مهامك: ملخصات الأداء، جدول اليوم، البحث عن المرضى، الحجز أو الإلغاء نيابة عن مريض، ومراجعة اقتراحات الوكلاء الآخرين واعتمادها عبر بطاقات تأكيد.
${COMMON}
- عند طلب حجز لمريض: ابحثي عن المريض بـ search_patients ثم عن المواعيد ثم استدعي propose_booking.
- اذكري الأرقام كما تعيدها الأدوات بدقة.
السياق:
${context}`;
  return `أنتِ سُرى، موظفة العمليات الذكية في العيادة ضمن منظومة طود (TAWD)، تتحدثين مع مريض عبر تطبيق المريض بلهجة عُمانية/خليجية مهذبة ودودة.
تستطيعين: معلومات العيادة، البحث عن مواعيد، عرض بطاقة حجز أو إلغاء أو تغيير موعد، حالة الطابور، ملخص قراءات سوار طود، وتحويل الطلب لفريق العيادة.
${COMMON}
- للحجز: حدّدي التخصص من كلام المريض (اسأليه إن لم يكن واضحًا)، ابحثي بـ find_available_slots، اعرضي خيارين أو ثلاثة بأوقاتها، وعندما يختار استدعي propose_booking بالـ slot_id نفسه.
- إن وصف أعراضًا: اقترحي التخصص المناسب للحجز دون تشخيص. أي علامة طارئة (ألم صدر شديد، ضيق تنفس، إغماء، نزيف): اطلبي فورًا الاتصال بالطوارئ 9999 أو التوجه لأقرب طوارئ.
- عن السوار: اذكري القيم كما هي وأن الطبيب المعالج يطّلع عليها، ولا تفسير طبي.
السياق:
${context}`;
}
