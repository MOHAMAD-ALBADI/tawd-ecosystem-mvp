import type {
  AgentId, AgentTask, Appointment, ApptStatus, AuditRecord, Campaign, CareReview, Channel, Data, Doctor, EventType,
  FollowUpTask, Inquiry, Invoice, Message, OpEvent, OutreachDraft, Patient, Reading, Specialty, TaskStatus, WaitlistEntry, WearableDevice,
} from "@/types";
import { DEFAULT_THRESHOLDS, SPECIALTY } from "@/lib/constants";
import { SLOT_TIMES, addDays, at, sameDay, startOfDay } from "@/lib/time";

/* Every value below is synthetic. The generator is seeded, so a reset always produces the same clinic,
   laid out relative to the day of the reset. */

export const DATA_VERSION = 3;
export const PATIENT_APP_USER = "p1";
export const CARE_DOCTOR = "d1";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MALE = ["محمد", "أحمد", "سالم", "خالد", "سعيد", "علي", "حمد", "ناصر", "يوسف", "عبدالله", "راشد", "سيف", "مازن", "فهد", "طارق", "بدر", "أنس", "زكريا", "إبراهيم", "منذر", "حمود", "عمر"];
const FEMALE = ["فاطمة", "مريم", "عائشة", "ريم", "نوال", "سارة", "هدى", "أمل", "منى", "زينب", "خديجة", "بشرى", "رحمة", "أسماء", "سلمى", "وفاء", "نورة", "ميثاء", "شهد", "جواهر"];
const FAMILY = ["البلوشي", "الحارثي", "الكندي", "الرواحي", "العبري", "الهنائي", "الشكيلي", "المعمري", "الحبسي", "الغافري", "الكلباني", "السيابي", "الجابري", "الفارسي", "المقبالي", "العامري", "الشحي", "الريامي", "اليحيائي", "البطاشي", "الزدجالي", "النعماني", "السعدي", "الهاشمي"];

const INQUIRY_TEXT: Record<Specialty, string[]> = {
  cardiology: ["أبي موعد مع دكتور القلب", "عندي خفقان أحيانًا وأريد فحص قلب", "متى أقرب موعد لعيادة القلب؟"],
  dental: ["أبغى موعد تنظيف أسنان", "عندي ألم في ضرس، متى أقرب موعد؟", "كم سعر تقويم الأسنان؟"],
  internal: ["أريد استشارة عامة", "موعد متابعة سكري لو سمحت", "عندي حمى من يومين أريد طبيب"],
  dermatology: ["عندي حساسية في الجلد", "أريد موعد لعلاج حب الشباب", "هل عندكم عيادة جلدية؟"],
};

export function buildSeed(now: Date = new Date()): Data {
  const r = rng(20261010);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const chance = (p: number) => r() < p;
  const today = startOfDay(now);
  const nowMs = now.getTime();
  const dayAt = (offset: number, hm: string) => at(addDays(today, offset), hm);
  const clampPast = (iso: string, minutesBefore = 3) => (new Date(iso).getTime() > nowMs - minutesBefore * 60000 ? new Date(nowMs - minutesBefore * 60000).toISOString() : iso);
  const minus = (iso: string, minutes: number) => new Date(new Date(iso).getTime() - minutes * 60000).toISOString();
  const plus = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
  let seq = 0;
  const id = (p: string) => `${p}-${String(++seq).padStart(4, "0")}`;

  const doctors: Doctor[] = [
    { id: "d1", name: "د. خالد البلوشي", specialty: "cardiology", title: "استشاري أمراض القلب", fee: 35, room: "عيادة 1", available: true },
    { id: "d2", name: "د. مريم الحارثية", specialty: "dental", title: "أخصائية طب الأسنان", fee: 25, room: "عيادة 2", available: true },
    { id: "d3", name: "د. أحمد الكندي", specialty: "internal", title: "استشاري الطب الباطني", fee: 20, room: "عيادة 3", available: true },
    { id: "d4", name: "د. ليلى الرواحية", specialty: "dermatology", title: "أخصائية الأمراض الجلدية", fee: 22, room: "عيادة 4", available: true },
  ];
  const docBySpec = (s: Specialty) => doctors.find((d) => d.specialty === s)!;

  const phone = () => `+968 9${int(100, 999)} ${int(1000, 9999)}`;
  const patients: Patient[] = [
    { id: "p1", name: "سالم بن حمد العبري", phone: "+968 9241 6630", age: 58, gender: "M", status: "active", source: "c3", createdAt: dayAt(-410, "10:00"), careProgram: "متابعة ضغط الدم", deviceId: "dv1", featured: true, note: "مسجّل في برنامج الرعاية المتصلة ويستخدم تطبيق المريض" },
    { id: "p2", name: "فاطمة بنت علي الهنائية", phone: "+968 9318 2047", age: 46, gender: "F", status: "active", source: "referral", createdAt: dayAt(-260, "10:00"), careProgram: "متابعة صحة القلب", deviceId: "dv2", featured: true },
    { id: "p3", name: "يوسف بن سعيد الشكيلي", phone: "+968 9127 5584", age: 34, gender: "M", status: "active", source: "c1", createdAt: dayAt(-30, "10:00"), featured: true, note: "مريض عائد من حملة الأسنان" },
    { id: "p4", name: "عائشة بنت خلفان المعمرية", phone: "+968 9455 1902", age: 29, gender: "F", status: "active", source: "c2", createdAt: dayAt(-21, "10:00"), featured: true },
    { id: "p5", name: "ناصر بن راشد الحبسي", phone: "+968 9963 7718", age: 63, gender: "M", status: "active", source: "direct", createdAt: dayAt(-700, "10:00"), careProgram: "متابعة الأمراض المزمنة", deviceId: "dv3", featured: true },
    { id: "p6", name: "مريم بنت سالم البوسعيدية", phone: "+968 9702 3365", age: 41, gender: "F", status: "inactive", source: "direct", createdAt: dayAt(-520, "10:00"), lastVisit: dayAt(-163, "10:00"), featured: true, note: "آخر زيارة قبل أكثر من 5 أشهر" },
    { id: "p7", name: "هلال بن عبدالله الغافري", phone: "+968 9536 8841", age: 52, gender: "M", status: "active", source: "c3", createdAt: dayAt(-90, "10:00"), lastVisit: dayAt(-48, "10:00"), featured: true, note: "على قائمة الانتظار لعيادة القلب" },
    { id: "p8", name: "شيماء بنت ناصر الكلبانية", phone: "+968 9874 1209", age: 37, gender: "F", status: "active", source: "referral", createdAt: dayAt(-150, "10:00"), careProgram: "متابعة ما بعد العلاج", deviceId: "dv4", featured: true },
  ];
  for (let i = 0; i < 232; i++) {
    const g: "M" | "F" = chance(0.5) ? "M" : "F";
    const fam = pick(FAMILY);
    patients.push({
      id: `p${i + 9}`,
      name: `${pick(g === "M" ? MALE : FEMALE)} ${g === "F" && fam.endsWith("ي") ? fam + "ة" : fam}`,
      phone: phone(),
      age: int(18, 74),
      gender: g,
      status: "active",
      source: "direct",
      createdAt: dayAt(-int(15, 700), "10:00"),
    });
  }
  const pool = patients.slice(8);

  /* ---------- appointments ---------- */
  const appts: Appointment[] = [];
  const taken = new Set<string>();
  const key = (doctorId: string, iso: string) => `${doctorId}|${iso}`;
  const mk = (patientId: string, doctorId: string, offset: number, slot: string, status: ApptStatus, extra: Partial<Appointment> = {}): Appointment => {
    const start = dayAt(offset, slot);
    const doc = doctors.find((d) => d.id === doctorId)!;
    const a: Appointment = {
      id: id("apt"),
      patientId,
      doctorId,
      start,
      status,
      source: "staff",
      price: doc.fee,
      confirmation: status === "pending" ? (chance(0.6) ? "sent" : "not_sent") : status === "cancelled" ? "declined" : "confirmed",
      createdAt: clampPast(minus(start, int(1, 6) * 24 * 60)),
      ...extra,
    };
    if (status !== "cancelled") taken.add(key(doctorId, start));
    appts.push(a);
    return a;
  };

  /* the patient-app user's visit today is the next slot at least an hour away, so the live queue has people ahead */
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
  const p1Slot = SLOT_TIMES.find((t) => toMin(t) >= nowMin + 60) ?? SLOT_TIMES[SLOT_TIMES.length - 1];
  mk("p1", "d1", -10, "10:00", "completed");
  mk("p1", "d3", 0, p1Slot, "confirmed");
  mk("p1", "d1", 3, "11:00", "confirmed");
  mk("p2", "d1", -6, "09:30", "completed");
  mk("p2", "d1", 5, "10:30", "pending", { confirmation: "sent" });
  mk("p3", "d2", -12, "16:30", "completed");
  mk("p3", "d2", -2, "17:00", "completed");
  mk("p3", "d2", 2, "09:00", "confirmed");
  mk("p4", "d4", -8, "11:30", "completed");
  mk("p4", "d4", 1, "16:00", "pending", { confirmation: "sent" });
  mk("p5", "d3", -4, "12:00", "completed");
  mk("p5", "d1", 4, "09:30", "confirmed");
  mk("p8", "d4", -5, "16:30", "completed");

  const REASONS = ["ظرف عائلي", "سفر طارئ", "تعارض مع العمل", "تحسّن الحالة", "ظرف صحي آخر"];
  const cancelledPast: Appointment[] = [];
  for (let o = -13; o <= 6; o++) {
    for (const d of doctors) {
      const target = o < 0 ? int(4, 6) : o === 0 ? 6 : Math.max(2, 6 - o + int(-1, 0));
      const free = SLOT_TIMES.filter((s) => !taken.has(key(d.id, dayAt(o, s))));
      const existing = SLOT_TIMES.length - free.length;
      const n = Math.max(0, target - existing);
      const order = [...free].sort(() => r() - 0.5).slice(0, n);
      for (const s of order) {
        let status: ApptStatus;
        if (o < 0) status = chance(0.8) ? "completed" : chance(0.62) ? "cancelled" : "no_show";
        else if (o === 0) status = "confirmed";
        else status = chance(0.05) ? "cancelled" : chance(0.56) ? "confirmed" : "pending";
        const a = mk(pick(pool).id, d.id, o, s, status, status === "cancelled" ? { cancelReason: pick(REASONS), cancelledBy: "patient" } : {});
        if (o < 0 && status === "cancelled") cancelledPast.push(a);
      }
    }
  }
  /* today: the morning has been seen, one patient is with each doctor, a few are waiting */
  for (const d of doctors) {
    const day = appts.filter((a) => a.doctorId === d.id && sameDay(a.start, today) && !patients.find((p) => p.id === a.patientId)?.featured).sort((a, b) => a.start.localeCompare(b.start));
    /* visits before the current time are done; the queue sits around now. Outside clinic hours fall back to a mid-day picture */
    const atNow = day.findIndex((a) => toMin(`${String(new Date(a.start).getHours()).padStart(2, "0")}:${String(new Date(a.start).getMinutes()).padStart(2, "0")}`) >= nowMin - 25);
    const done = atNow >= 1 ? atNow : Math.floor(day.length * 0.4);
    const nowIsoStr = now.toISOString();
    day.forEach((a, i) => {
      if (i < done) a.status = "completed";
      else if (i === done) { a.status = "in_room"; a.checkInAt = minus(nowIsoStr, 24); }
      else if (i <= done + 2) { a.status = "checked_in"; a.checkInAt = minus(nowIsoStr, 16 - (i - done) * 5); }
      else { a.status = chance(0.75) ? "confirmed" : "pending"; a.confirmation = a.status === "pending" ? "sent" : "confirmed"; }
    });
  }
  /* one future cancellation is waiting for a human to approve the recovery agent's proposal */
  const pendingCancel = appts.find((a) => a.doctorId === "d2" && sameDay(a.start, addDays(today, 1)) && a.status !== "cancelled" && !patients.find((p) => p.id === a.patientId)?.featured)!;
  pendingCancel.status = "cancelled";
  pendingCancel.cancelReason = "تعارض مع العمل";
  pendingCancel.cancelledBy = "patient";
  pendingCancel.confirmation = "declined";
  taken.delete(key(pendingCancel.doctorId, pendingCancel.start));

  /* past cancellations: almost half were refilled from the waiting list */
  const recoveredPairs: { from: Appointment; to: Appointment }[] = [];
  for (const c of cancelledPast) {
    if (!chance(0.48)) continue;
    const off = Math.round((startOfDay(c.start).getTime() - today.getTime()) / 86400000);
    const slot = `${String(new Date(c.start).getHours()).padStart(2, "0")}:${String(new Date(c.start).getMinutes()).padStart(2, "0")}`;
    const to = mk(pick(pool).id, c.doctorId, off, slot, "completed", { source: "recovery", recovered: true, recoveredFrom: c.id, createdAt: plus(c.createdAt, 60 * 6) });
    to.createdAt = clampPast(minus(to.start, int(3, 20) * 60));
    recoveredPairs.push({ from: c, to });
  }

  /* ---------- campaigns & inquiries ---------- */
  const campaigns: Campaign[] = [
    { id: "c1", name: "حملة التوعية بصحة الفم والأسنان", channel: "instagram", specialty: "dental", budget: 450, startDate: dayAt(-24, "09:00"), status: "active", createdBy: "seed" },
    { id: "c2", name: "حملة الاستشارة العامة", channel: "web", specialty: "internal", budget: 300, startDate: dayAt(-20, "09:00"), status: "active", createdBy: "seed" },
    { id: "c3", name: "برنامج متابعة الأمراض المزمنة", channel: "whatsapp", specialty: "cardiology", budget: 180, startDate: dayAt(-30, "09:00"), status: "active", createdBy: "seed" },
  ];
  const inquiries: Inquiry[] = [];
  const linked = new Set<string>();
  for (let i = 0; i < 96; i++) {
    const o = -13 + Math.floor((i * 14) / 96);
    const roll = r();
    const camp = roll < 0.34 ? campaigns[0] : roll < 0.62 ? campaigns[1] : roll < 0.8 ? campaigns[2] : undefined;
    const spec: Specialty = camp?.specialty && chance(0.8) ? camp.specialty : pick(["cardiology", "dental", "internal", "dermatology"] as Specialty[]);
    const channel: Channel = camp ? camp.channel : pick(["phone", "web", "whatsapp", "app"] as Channel[]);
    const createdAt = clampPast(dayAt(o, `${String(int(8, 21)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}`), 30);
    const g: "M" | "F" = chance(0.5) ? "M" : "F";
    const inq: Inquiry = {
      id: id("inq"),
      name: `${pick(g === "M" ? MALE : FEMALE)} ${pick(FAMILY)}`,
      channel,
      campaignId: camp?.id,
      text: pick(INQUIRY_TEXT[spec]),
      specialty: spec,
      intent: "booking",
      status: "lost",
      createdAt,
      respondedAt: plus(createdAt, int(1, 3)),
    };
    const s = r();
    if (o === 0 && s < 0.35) { inq.status = "new"; inq.respondedAt = undefined; }
    else if (s < 0.6) {
      const doc = docBySpec(spec);
      const cand = appts.filter((a) => a.doctorId === doc.id && !linked.has(a.id) && a.start > createdAt && a.source === "staff" && !patients.find((p) => p.id === a.patientId)?.featured).sort((a, b) => a.start.localeCompare(b.start))[0];
      if (cand) {
        linked.add(cand.id);
        cand.source = "sura";
        cand.inquiryId = inq.id;
        cand.createdAt = clampPast(plus(createdAt, 2));
        inq.status = "booked";
        inq.appointmentId = cand.id;
        inq.patientId = cand.patientId;
        inq.name = patients.find((p) => p.id === cand.patientId)!.name;
        const p = patients.find((x) => x.id === cand.patientId)!;
        if (p.source === "direct") p.source = camp?.id ?? "direct";
      }
    } else if (s < 0.74) { inq.status = "answered"; inq.intent = "question"; }
    inquiries.push(inq);
  }

  /* ---------- patients' derived fields ---------- */
  for (const p of patients) {
    const visits = appts.filter((a) => a.patientId === p.id && a.status === "completed").map((a) => a.start).sort();
    if (visits.length) p.lastVisit = visits[visits.length - 1];
    else if (!p.lastVisit) p.lastVisit = dayAt(-int(20, 320), "10:00");
    if (!p.featured) p.status = new Date(p.lastVisit).getTime() < nowMs - 120 * 86400000 && !appts.some((a) => a.patientId === p.id && a.start > now.toISOString()) ? "inactive" : "active";
  }

  /* ---------- invoices ---------- */
  const invoices: Invoice[] = appts
    .filter((a) => a.status === "completed")
    .map((a) => ({ id: id("inv"), appointmentId: a.id, patientId: a.patientId, amount: a.price, status: new Date(a.start).getTime() > nowMs - 3 * 86400000 && chance(0.45) ? "unpaid" : "paid", issuedAt: clampPast(plus(a.start, 35)) }));

  /* ---------- waiting list ---------- */
  const waitDental = pool[37];
  const waitlist: WaitlistEntry[] = [
    { id: "w1", patientId: "p7", specialty: "cardiology", doctorId: "d1", since: dayAt(-4, "11:20"), status: "waiting", note: "يرغب بأقرب موعد متاح مع د. خالد" },
    { id: "w2", patientId: waitDental.id, specialty: "dental", doctorId: "d2", since: dayAt(-2, "18:05"), status: "waiting", note: "ألم ضرس — أي موعد خلال الأسبوع" },
    { id: "w3", patientId: pool[52].id, specialty: "dermatology", since: dayAt(-6, "09:40"), status: "waiting", note: "مرن في المواعيد المسائية" },
  ];

  /* ---------- wearable ---------- */
  const devices: WearableDevice[] = [
    { id: "dv1", patientId: "p1", model: "TAWD Band · نموذج تطوير", status: "connected", battery: 78, firmware: "0.9.4-dev", lastSync: now.toISOString() },
    { id: "dv2", patientId: "p2", model: "TAWD Band · نموذج تطوير", status: "connected", battery: 64, firmware: "0.9.4-dev", lastSync: now.toISOString() },
    { id: "dv3", patientId: "p5", model: "TAWD Band · نموذج تطوير", status: "connected", battery: 41, firmware: "0.9.3-dev", lastSync: now.toISOString() },
    { id: "dv4", patientId: "p8", model: "TAWD Band · نموذج تطوير", status: "connected", battery: 88, firmware: "0.9.4-dev", lastSync: now.toISOString() },
  ];
  const base: Record<string, number> = { dv1: 76, dv2: 71, dv3: 82, dv4: 68 };
  const readings: Reading[] = [];
  let flaggedReading: Reading | undefined;
  for (const dv of devices) {
    for (let k = 0; k < 48; k++) {
      const t = new Date(nowMs - (47 - k) * 30 * 60000 - 4 * 60000);
      const day = t.getHours() >= 7 && t.getHours() <= 22;
      const rd: Reading = {
        id: id("rd"),
        deviceId: dv.id,
        patientId: dv.patientId,
        at: t.toISOString(),
        hr: Math.round(base[dv.id] + 6 * Math.sin(k / 5) + (day ? 5 : -6) + int(-3, 3)),
        spo2: int(96, 99),
        temp: Math.round((36.4 + r() * 0.5) * 10) / 10,
        steps: day ? int(120, 880) : int(0, 40),
        source: "seed",
      };
      if (dv.id === "dv3" && k === 38) { rd.spo2 = 91; rd.hr = 104; rd.flagged = ["spo2"]; flaggedReading = rd; }
      readings.push(rd);
    }
    dv.lastSync = readings[readings.length - 1].at;
  }

  const reviews: CareReview[] = [
    { id: "rv-1", patientId: "p5", readingIds: [flaggedReading!.id], reasons: ["تشبّع الأكسجين 91% — أقل من العتبة التوضيحية 92%"], priority: "review", status: "open", createdAt: flaggedReading!.at },
    { id: "rv-2", patientId: "p2", readingIds: [], reasons: ["نبض راحة أعلى من المعتاد خلال الأسبوع (قاعدة توضيحية)"], priority: "routine", status: "acknowledged", createdAt: dayAt(-3, "09:12"), acknowledgedAt: dayAt(-3, "11:40"), note: "تمت مراجعة القراءات، متابعة هاتفية خلال أسبوع" },
  ];
  const followups: FollowUpTask[] = [
    { id: "fu-1", patientId: "p2", title: "مكالمة متابعة لمراجعة قراءات الأسبوع", due: dayAt(1, "12:00"), status: "open", owner: "doctor", source: "doctor", reviewId: "rv-2", createdAt: dayAt(-3, "11:41") },
    { id: "fu-2", patientId: "p3", title: "متابعة بعد زيارة الأسنان — التأكد من زوال الألم", due: dayAt(0, "18:00"), status: "open", owner: "clinic", source: "growth", createdAt: dayAt(-2, "18:10") },
    { id: "fu-3", patientId: "p1", title: "قياس الضغط صباحًا ومساءً لمدة أسبوع", due: dayAt(3, "09:00"), status: "open", owner: "doctor", source: "doctor", createdAt: dayAt(-10, "10:40") },
  ];

  /* ---------- agent history: each record is derived from a record above ---------- */
  const tasks: AgentTask[] = [];
  const audit: AuditRecord[] = [];
  const events: OpEvent[] = [];
  const log = (agent: AgentId, type: EventType, atIso: string, title: string, detail: string, outcome: string, o: { status?: TaskStatus; patientId?: string; reasoning?: string[] } = {}) => {
    const when = clampPast(atIso, 2);
    const ev: OpEvent = { id: id("evt"), type, at: when, payload: {}, dedupeKey: `seed-${seq}`, processed: true, held: false, agent };
    events.push(ev);
    const t: AgentTask = { id: id("tsk"), agent, eventId: ev.id, title, detail, status: o.status ?? "completed", createdAt: when, completedAt: o.status === "requires_approval" ? undefined : plus(when, 1), outcome, patientId: o.patientId, reasoning: o.reasoning };
    tasks.push(t);
    audit.push({ id: id("aud"), at: when, event: type, actor: agent, action: title, outcome, patientId: o.patientId });
    return t;
  };
  const pName = (pid?: string) => patients.find((p) => p.id === pid)?.name ?? "";
  for (const q of inquiries) {
    if (q.status === "new") continue;
    log("sura", "inquiry.received", q.respondedAt ?? q.createdAt, "تصنيف استفسار وارد", `${q.name} · ${q.channel}`, q.status === "booked" ? `حجز — ${SPECIALTY[q.specialty!]}` : q.status === "answered" ? "أُجيب من معلومات العيادة" : "لم يكمل المريض الحجز", { patientId: q.patientId });
    if (q.status === "booked") {
      const a = appts.find((x) => x.id === q.appointmentId)!;
      log("scheduling", "booking.requested", plus(q.respondedAt ?? q.createdAt, 1), "إنشاء موعد دون تعارض", `${SPECIALTY[q.specialty!]} · ${pName(a.patientId)}`, "أُنشئ الموعد", { patientId: a.patientId });
    }
  }
  for (const a of appts.filter((x) => x.start > minus(now.toISOString(), 60 * 24 * 3) && x.confirmation !== "not_sent")) {
    const t = clampPast(minus(a.start, 60 * 26));
    if (new Date(t).getTime() < nowMs - 4 * 86400000) continue;
    log("attendance", a.confirmation === "confirmed" ? "confirmation.received" : "appointment.created", t, a.confirmation === "confirmed" ? "تسجيل تأكيد الحضور" : "إرسال طلب تأكيد الحضور (محاكاة)", pName(a.patientId), a.confirmation === "confirmed" ? "أكّد المريض الحضور" : a.confirmation === "declined" ? "اعتذر المريض" : "بانتظار رد المريض", { patientId: a.patientId });
  }
  for (const { from, to } of recoveredPairs) {
    log("recovery", "recovery.approved", to.createdAt, "ملء موعد محرَّر من قائمة الانتظار", `${doctors.find((d) => d.id === from.doctorId)!.name}`, `استُرد الموعد (+${to.price} ر.ع. تقديرية)`, { patientId: to.patientId, reasoning: ["إلغاء من المريض", "مطابقة التخصص مع قائمة الانتظار", "اعتمدها فريق الاستقبال"] });
  }
  cancelledPast.filter((c) => !recoveredPairs.some((p) => p.from.id === c.id)).forEach((c, i) => {
    log("recovery", "appointment.cancelled", plus(c.createdAt, 30), "البحث عن بديل لموعد ملغى", pName(c.patientId), i % 5 === 1 ? "انتهت المهلة دون رد من المرشحين" : "لم يُسترد — لا يوجد مرشح مناسب", { status: i % 5 === 1 ? "failed" : "completed", patientId: c.patientId });
  });
  const pendTask = log("recovery", "appointment.cancelled", plus(pendingCancel.createdAt, 60 * 20), "اقتراح ملء موعد ملغى", `${pName(pendingCancel.patientId)} ألغى موعد الأسنان`, "بانتظار اعتماد فريق العيادة", { status: "requires_approval", patientId: waitDental.id, reasoning: ["الموعد المحرَّر: " + SPECIALTY.dental, `مرشح من قائمة الانتظار: ${waitDental.name}`, "التواصل مع المريض يتطلب موافقة"] });
  pendTask.proposal = { kind: "recovery", cancelledId: pendingCancel.id, doctorId: pendingCancel.doctorId, slot: pendingCancel.start, waitlistId: "w2", waitPatientId: waitDental.id, value: pendingCancel.price };
  pendTask.completedAt = undefined;
  for (const a of appts.filter((x) => x.status === "completed" && x.start > minus(now.toISOString(), 60 * 24 * 3)).slice(0, 14)) {
    log("growth", "appointment.completed", plus(a.start, 90), "جدولة متابعة ما بعد الزيارة", pName(a.patientId), "أُضيفت مسودة متابعة", { patientId: a.patientId });
  }
  for (const dv of devices) {
    for (let k = 1; k <= 3; k++) log("care", "wearable.reading", dayAt(-k + 1, "08:05"), "تقييم قراءات السوار اليومية", pName(dv.patientId), dv.id === "dv3" && k === 1 ? "قراءة تتطلب مراجعة — أُبلغ الطبيب" : "ضمن العتبات التوضيحية", { patientId: dv.patientId });
  }
  log("care", "wearable.reading", flaggedReading!.at, "إحالة قراءة لمراجعة الطبيب", "ناصر بن راشد الحبسي · SpO₂ 91%", "أُنشئت مهمة مراجعة للطبيب", { patientId: "p5", reasoning: ["SpO₂ 91% < 92% (عتبة توضيحية)", "لا تشخيص — إحالة لمراجعة بشرية"] });

  const outreach: OutreachDraft[] = [];
  const reactivationTask = log("growth", "growth.scan", dayAt(0, "08:30"), "رصد مرضى غير نشطين", "مريم بنت سالم البوسعيدية", "مسودة رسالة إعادة تنشيط بانتظار الاعتماد", { status: "requires_approval", patientId: "p6", reasoning: ["آخر زيارة قبل أكثر من 120 يومًا", "لا مواعيد قادمة", "الإرسال الخارجي يتطلب موافقة"] });
  outreach.push({ id: "od-1", patientId: "p6", kind: "reactivation", text: "مرحبًا مريم، نتمنى أن تكوني بخير. مضى وقت منذ زيارتك الأخيرة لعيادة الطب الباطني؛ يسعدنا ترتيب موعد متابعة يناسبك.", status: "draft", createdAt: dayAt(0, "08:30"), taskId: reactivationTask.id });
  reactivationTask.proposal = { kind: "outreach", draftIds: ["od-1"] };
  const inactivePool = patients.filter((p) => p.status === "inactive" && !p.featured).slice(0, 4);
  inactivePool.forEach((p, i) => outreach.push({ id: `od-${i + 2}`, patientId: p.id, kind: "reactivation", text: `مرحبًا ${p.name.split(" ")[0]}، يسعدنا ترتيب موعد متابعة لك في العيادة متى ما ناسبك.`, status: i < 2 ? "responded" : "no_response", createdAt: dayAt(-5 - i, "10:00") }));

  /* a couple of conversations so Sura's panel has real threads on first open */
  const messages: Message[] = [];
  inquiries.filter((q) => q.status === "booked").slice(-2).forEach((q) => {
    const a = appts.find((x) => x.id === q.appointmentId)!;
    const doc = doctors.find((d) => d.id === a.doctorId)!;
    messages.push({ id: id("msg"), threadId: q.id, from: "patient", text: q.text, at: q.createdAt });
    messages.push({ id: id("msg"), threadId: q.id, from: "sura", text: `أهلًا بك. أقرب موعد متاح في ${SPECIALTY[doc.specialty]} مع ${doc.name}. هل أحجزه لك؟`, at: plus(q.createdAt, 1), mode: "rule" });
    messages.push({ id: id("msg"), threadId: q.id, from: "patient", text: "نعم احجزه", at: plus(q.createdAt, 2) });
    messages.push({ id: id("msg"), threadId: q.id, from: "sura", text: "تم الحجز، وسيصلك طلب تأكيد الحضور قبل الموعد بيوم.", at: plus(q.createdAt, 3), mode: "rule" });
  });

  audit.sort((a, b) => b.at.localeCompare(a.at));
  tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  events.sort((a, b) => a.at.localeCompare(b.at));
  appts.sort((a, b) => a.start.localeCompare(b.start));

  return {
    version: DATA_VERSION,
    seededAt: now.toISOString(),
    seq,
    clinic: { id: "clinic-1", name: "مجمع الريّان الطبي", nameEn: "Al Rayyan Medical Center (fictional)", city: "مسقط", model: "full_os" },
    doctors,
    patients,
    appointments: appts,
    inquiries,
    messages,
    campaigns,
    invoices,
    waitlist,
    devices,
    readings,
    reviews,
    followups,
    outreach,
    tasks,
    events,
    audit,
    thresholds: { ...DEFAULT_THRESHOLDS },
    demo: { step: 0, runId: "" },
    sim: { running: false, patientId: "p1", mode: "normal", tick: 0 },
  };
}
