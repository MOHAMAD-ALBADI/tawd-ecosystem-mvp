import type { AgentId, AgentTask, Data, EventType, OpEvent, OutreachProposal, Patient, RecoveryProposal, Specialty } from "@/types";
import { AGENTS, CHANNEL, ROUTES, SPECIALTY, SPECIALTY_KEYWORDS } from "@/lib/constants";
import { addDays, fmtDayTime, nowIso, startOfDay } from "@/lib/time";
import { DomainError, addMessage, apptOf, audit, cancelAppointment, createAppointment, doctorOf, emit, firstFree, freeSlots, isTaken, nid, patientName } from "./core";

/* TAWD Intelligence: every domain event is routed to exactly one agent. An agent may only perform the actions
   listed in its permissions; anything that contacts a patient or moves another patient's booking waits for a
   human approval. Handlers are deterministic rules, so the same events always produce the same outcome. */

class PermissionError extends Error {}

function can(agent: AgentId, action: string) {
  if (!AGENTS[agent].permissions.includes(action)) throw new PermissionError(`صلاحية مرفوضة: ${AGENTS[agent].name} لا يملك ${action}`);
}

function openTask(s: Data, agent: AgentId, ev: OpEvent, title: string, detail: string, patientId?: string): AgentTask {
  const t: AgentTask = { id: nid(s, "tsk"), agent, eventId: ev.id, title, detail, status: "processing", createdAt: nowIso(), patientId, demo: !!ev.payload.demo };
  s.tasks.unshift(t);
  if (s.tasks.length > 600) s.tasks.length = 600;
  return t;
}

function finish(s: Data, t: AgentTask, outcome: string, reasoning?: string[]) {
  t.status = "completed";
  t.completedAt = nowIso();
  t.outcome = outcome;
  if (reasoning) t.reasoning = reasoning;
  audit(s, { event: s.events.find((e) => e.id === t.eventId)?.type ?? "task", actor: t.agent, action: t.title, outcome, patientId: t.patientId, ref: t.id, demo: t.demo });
}

function awaitApproval(s: Data, t: AgentTask, outcome: string, proposal: RecoveryProposal | OutreachProposal, reasoning: string[]) {
  t.status = "requires_approval";
  t.outcome = outcome;
  t.proposal = proposal;
  t.reasoning = reasoning;
  audit(s, { event: "approval.requested", actor: t.agent, action: t.title, outcome, patientId: t.patientId, ref: t.id, demo: t.demo });
}

function fail(s: Data, t: AgentTask, reason: string, reasoning?: string[]) {
  t.status = "failed";
  t.completedAt = nowIso();
  t.outcome = reason;
  if (reasoning) t.reasoning = reasoning;
  audit(s, { event: "task.failed", actor: t.agent, action: t.title, outcome: reason, patientId: t.patientId, ref: t.id, demo: t.demo });
}

/* ---------------- Sura: understanding ---------------- */

const norm = (x: string) => x.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/[ًٌٍَُِّْ]/g, "").toLowerCase();

export function classify(text: string): { intent: "booking" | "question" | "cancel" | "other"; specialty?: Specialty; matched: string[] } {
  const t = norm(text);
  const matched: string[] = [];
  let specialty: Specialty | undefined;
  for (const sp of Object.keys(SPECIALTY_KEYWORDS) as Specialty[]) {
    for (const kw of SPECIALTY_KEYWORDS[sp]) {
      if (t.includes(norm(kw))) {
        matched.push(kw);
        specialty ??= sp;
      }
    }
  }
  const has = (ws: string[]) => ws.some((w) => t.includes(norm(w)));
  const cancel = has(["الغاء", "الغي", "اعتذر عن", "ما اقدر احضر", "لن اتمكن"]);
  const question = has(["كم", "سعر", "تكلفه", "تكلفة", "هل عندكم", "اوقات", "الدوام", "وين", "موقع"]);
  const booking = has(["موعد", "احجز", "حجز", "ابي", "ابغى", "اريد", "ابغي", "متى اقرب"]);
  const intent = cancel ? "cancel" : question && !has(["احجز", "موعد"]) ? "question" : booking || specialty ? "booking" : question ? "question" : "other";
  return { intent, specialty, matched: [...new Set(matched)] };
}

const INTENT_AR = { booking: "طلب موعد", question: "استفسار معلومات", cancel: "طلب إلغاء", other: "غير محدد" } as const;

function onInquiry(s: Data, ev: OpEvent) {
  const q = s.inquiries.find((x) => x.id === ev.payload.inquiryId);
  if (!q) throw new DomainError("الاستفسار غير موجود");
  const t = openTask(s, "sura", ev, "فهم الاستفسار وتحديد النية", `${q.name} · ${CHANNEL[q.channel]}`, q.patientId);
  can("sura", "inquiry.classify");
  q.status = "processing";
  const c = classify(q.text);
  q.intent = c.intent;
  q.specialty = c.specialty ?? q.specialty;
  const reasoning = [
    `النية: ${INTENT_AR[c.intent]}`,
    c.matched.length ? `كلمات مطابقة: ${c.matched.join("، ")}` : "لا كلمات تخصص مطابقة",
    q.specialty ? `التخصص المطلوب: ${SPECIALTY[q.specialty]}` : "التخصص غير محدد",
    q.campaignId ? `المصدر: ${s.campaigns.find((x) => x.id === q.campaignId)?.name ?? q.campaignId}` : `المصدر: ${CHANNEL[q.channel]} مباشر`,
  ];
  let patient: Patient | undefined = s.patients.find((p) => p.id === q.patientId) ?? (q.phone ? s.patients.find((p) => p.phone === q.phone) : undefined);
  if (!patient) {
    can("sura", "patient.create_lead");
    patient = { id: nid(s, "p"), name: q.name, phone: q.phone ?? "—", age: 0, gender: "F", status: "lead", source: q.campaignId ?? "direct", createdAt: nowIso() };
    s.patients.push(patient);
    reasoning.push("مريض جديد: أُنشئ سجل مبدئي (عميل محتمل)");
    audit(s, { event: "patient.created", actor: "sura", action: "إنشاء سجل مريض مبدئي", outcome: patient.name, patientId: patient.id, demo: !!ev.payload.demo });
  } else reasoning.push(`مريض معروف: ${patient.name}`);
  q.patientId = patient.id;
  t.patientId = patient.id;
  q.respondedAt = nowIso();
  const first = patient.name.split(" ")[0];
  can("sura", "conversation.reply");

  if (c.intent === "booking" && q.specialty) {
    can("sura", "workflow.route");
    addMessage(s, q.id, "sura", `وعليكم السلام ${first}، أهلًا بك في ${s.clinic.name}. فهمت أنك تحتاج موعدًا في ${SPECIALTY[q.specialty]}؛ أتحقق الآن من أقرب موعد متاح.`, { mode: "rule" });
    emit(s, "booking.requested", { inquiryId: q.id, specialty: q.specialty, demo: ev.payload.demo }, { dedupeKey: `book:${q.id}:${ev.id}` });
    finish(s, t, `وُجّه إلى وكيل الجدولة — ${SPECIALTY[q.specialty]}`, [...reasoning, "القرار: توجيه إلى وكيل الجدولة"]);
  } else if (c.intent === "question") {
    const d = q.specialty ? s.doctors.find((x) => x.specialty === q.specialty) : undefined;
    addMessage(s, q.id, "sura", d ? `رسوم الكشف في ${SPECIALTY[d.specialty]} لدى ${d.name}: ${d.fee} ر.ع. العيادة تعمل يوميًا 9:00 ص – 1:00 م و4:00 – 6:00 م. هل تود أن أحجز لك موعدًا؟` : `العيادة تعمل يوميًا 9:00 ص – 1:00 م و4:00 – 6:00 م، وتضم عيادات القلب والأسنان والباطنية والجلدية. كيف أساعدك؟`, { mode: "rule" });
    q.status = "answered";
    finish(s, t, "أُجيب من معلومات العيادة المعتمدة", [...reasoning, "القرار: إجابة من بيانات العيادة — لا حاجة لإجراء"]);
  } else if (c.intent === "cancel") {
    addMessage(s, q.id, "sura", "استلمت طلب الإلغاء. سيؤكد فريق الاستقبال الإلغاء معك قبل تنفيذه، حفاظًا على موعدك.", { mode: "rule" });
    q.status = "answered";
    finish(s, t, "طلب إلغاء — أُحيل لفريق الاستقبال للتأكيد", [...reasoning, "القرار: الإلغاء إجراء مؤثر ويتطلب تأكيدًا بشريًا"]);
  } else {
    addMessage(s, q.id, "sura", `أهلًا ${first}! أي تخصص تحتاج؟ لدينا: أمراض القلب، طب الأسنان، الطب الباطني، الأمراض الجلدية.`, { mode: "rule" });
    q.status = "answered";
    finish(s, t, "طُلب من المريض تحديد التخصص", [...reasoning, "القرار: استيضاح قبل أي إجراء"]);
  }
}

/* ---------------- Scheduling ---------------- */

function onBookingRequested(s: Data, ev: OpEvent) {
  const q = s.inquiries.find((x) => x.id === ev.payload.inquiryId);
  if (!q || !q.patientId) throw new DomainError("طلب الحجز بلا مريض");
  const spec = ev.payload.specialty as Specialty;
  const t = openTask(s, "scheduling", ev, "البحث عن موعد متاح وإنشاؤه", `${SPECIALTY[spec]} · ${patientName(s, q.patientId)}`, q.patientId);
  can("scheduling", "slot.search");
  const docs = s.doctors.filter((d) => d.specialty === spec);
  const booked = s.appointments.filter((a) => docs.some((d) => d.id === a.doctorId) && new Date(a.start) > new Date() && a.status !== "cancelled").length;
  const found = firstFree(s, spec, { from: addDays(startOfDay(new Date()), 1) });
  if (!found) {
    const reason = docs.every((d) => !d.available) ? "الطبيب غير متاح حاليًا" : "لا توجد مواعيد شاغرة خلال 10 أيام";
    s.waitlist.unshift({ id: nid(s, "w"), patientId: q.patientId, specialty: spec, since: nowIso(), status: "waiting", note: "أضافه وكيل الجدولة لعدم توفر موعد" });
    addMessage(s, q.id, "sura", `${reason}. أضفتك إلى قائمة الانتظار وسنبلغك فور توفر موعد.`, { mode: "rule" });
    q.status = "answered";
    fail(s, t, `${reason} — أُضيف المريض لقائمة الانتظار`, [`فُحصت جداول ${docs.map((d) => d.name).join("، ")}`, reason]);
    return;
  }
  can("scheduling", "appointment.create");
  const a = createAppointment(s, { patientId: q.patientId, doctorId: found.doctor.id, start: found.slot, source: "sura", actor: "scheduling", extra: { inquiryId: q.id }, demo: !!ev.payload.demo });
  q.status = "booked";
  q.appointmentId = a.id;
  addMessage(s, q.id, "sura", "حجزت لك موعدًا مبدئيًا:", { mode: "rule", card: { kind: "booking", title: "موعد مبدئي", lines: [found.doctor.name, SPECIALTY[spec], fmtDayTime(a.start), `رسوم الكشف ${a.price} ر.ع.`] } });
  finish(s, t, `أُنشئ موعد ${fmtDayTime(a.start)}`, [
    `الطبيب: ${found.doctor.name} (${found.doctor.available ? "متاح" : "غير متاح"})`,
    `فُحص ${booked} موعدًا قادمًا محجوزًا`,
    `أقرب موعد شاغر: ${fmtDayTime(found.slot)}`,
    "تحقق التعارض: لا حجز آخر في نفس الطبيب والوقت",
  ]);
  t.ref = a.id;
}

/* ---------------- Attendance ---------------- */

function onAppointmentCreated(s: Data, ev: OpEvent) {
  const a = apptOf(s, String(ev.payload.apptId));
  const t = openTask(s, "attendance", ev, "طلب تأكيد الحضور", `${patientName(s, a.patientId)} · ${fmtDayTime(a.start)}`, a.patientId);
  t.ref = a.id;
  if (a.status !== "pending") return finish(s, t, "الموعد مؤكد مسبقًا — لا حاجة لطلب تأكيد");
  can("attendance", "confirmation.request");
  a.confirmation = "sent";
  const thread = a.inquiryId ?? s.inquiries.find((q) => q.patientId === a.patientId && q.demo)?.id;
  if (thread) addMessage(s, thread, "system", `رسالة تأكيد (محاكاة): موعدك مع ${doctorOf(s, a.doctorId).name} ${fmtDayTime(a.start)}. الرجاء الرد بـ «نعم» للتأكيد أو «لا» للاعتذار.`, { mode: "simulated" });
  finish(s, t, "أُرسل طلب التأكيد (محاكاة — لا إرسال خارجي)", ["الموعد بحالة «بانتظار التأكيد»", "القناة: نفس قناة المريض", "تذكير ثانٍ قبل الموعد بـ 24 ساعة إن لم يرد"]);
}

function onConfirmation(s: Data, ev: OpEvent) {
  const a = apptOf(s, String(ev.payload.apptId));
  const yes = ev.payload.answer !== "no";
  const t = openTask(s, "attendance", ev, "تسجيل رد التأكيد", `${patientName(s, a.patientId)} · ${yes ? "نعم" : "لا"}`, a.patientId);
  t.ref = a.id;
  can("attendance", "confirmation.record");
  if (yes) {
    if (a.status === "pending") a.status = "confirmed";
    a.confirmation = "confirmed";
    finish(s, t, "أكّد المريض الحضور — الموعد مؤكد", ["رد المريض: نعم", "تحديث الحالة: مؤكد"]);
  } else {
    a.confirmation = "declined";
    cancelAppointment(s, a.id, { reason: "اعتذار عبر رد التأكيد", by: "patient", actor: "attendance", demo: !!ev.payload.demo });
    finish(s, t, "اعتذر المريض — أُلغي الموعد وأُحيل للاسترداد", ["رد المريض: لا", "الموعد تحرّر"]);
  }
}

/* ---------------- Recovery ---------------- */

function onCancelled(s: Data, ev: OpEvent) {
  const a = apptOf(s, String(ev.payload.apptId));
  const doc = doctorOf(s, a.doctorId);
  const t = openTask(s, "recovery", ev, "إيجاد بديل للموعد الملغى", `${doc.name} · ${fmtDayTime(a.start)}`, a.patientId);
  t.ref = a.id;
  if (new Date(a.start).getTime() < Date.now() + 30 * 60000) return finish(s, t, "الموعد قريب جدًا أو منقضٍ — لا استرداد");
  can("recovery", "slot.search");
  can("recovery", "waitlist.match");
  const cand = s.waitlist
    .filter((w) => w.status === "waiting" && w.specialty === doc.specialty && (!w.doctorId || w.doctorId === doc.id) && w.patientId !== a.patientId)
    .filter((w) => !s.appointments.some((x) => x.patientId === w.patientId && x.start === a.start && x.status !== "cancelled"))
    .sort((x, y) => x.since.localeCompare(y.since))[0];
  const alt = freeSlots(s, doc.id, { from: new Date(a.start), exclude: [a.start], limit: 1 })[0];
  const reasoning = [
    `تحرّر موعد: ${doc.name} — ${fmtDayTime(a.start)} (${a.price} ر.ع. تقديرية)`,
    cand ? `مطابقة قائمة الانتظار: ${patientName(s, cand.patientId)} — ينتظر منذ ${fmtDayTime(cand.since)}` : "لا مرشح مطابق في قائمة الانتظار",
    alt ? `موعد بديل للمريض الأصلي: ${fmtDayTime(alt)}` : "لا موعد بديل قريب للمريض الأصلي",
    "التواصل مع المرضى ونقل الحجوزات يتطلب اعتماد فريق العيادة",
  ];
  if (!cand && !alt) return finish(s, t, "لم يُسترد — لا مرشح ولا موعد بديل", reasoning);
  can("recovery", "recovery.propose");
  awaitApproval(s, t, cand ? `اقتراح: ملء الموعد بـ ${patientName(s, cand.patientId)}${alt ? " وإعادة جدولة المريض" : ""}` : "اقتراح: إعادة جدولة المريض فقط", {
    kind: "recovery",
    cancelledId: a.id,
    doctorId: doc.id,
    slot: a.start,
    waitlistId: cand?.id,
    waitPatientId: cand?.patientId,
    rescheduleSlot: alt,
    rescheduleDoctorId: alt ? doc.id : undefined,
    value: a.price,
  }, reasoning);
}

function onRecoveryApproved(s: Data, ev: OpEvent) {
  const t = s.tasks.find((x) => x.id === ev.payload.taskId);
  if (!t || t.proposal?.kind !== "recovery") throw new DomainError("لا يوجد اقتراح استرداد");
  if (t.status !== "requires_approval") return;
  const p = t.proposal;
  const demo = !!ev.payload.demo;
  t.status = "processing";
  const cancelled = apptOf(s, p.cancelledId);
  const done: string[] = [];
  const thread = cancelled.inquiryId;
  if (p.waitPatientId) {
    can("recovery", "appointment.fill_slot");
    if (isTaken(s, p.doctorId, p.slot)) return fail(s, t, "الموعد المحرَّر لم يعد متاحًا");
    const n = createAppointment(s, { patientId: p.waitPatientId, doctorId: p.doctorId, start: p.slot, source: "recovery", actor: "recovery", extra: { recovered: true, recoveredFrom: p.cancelledId }, demo });
    const w = s.waitlist.find((x) => x.id === p.waitlistId);
    if (w) w.status = "booked";
    done.push(`مُلئ الموعد بـ ${patientName(s, p.waitPatientId)}`);
    if (s.demo.runId && demo) s.demo.recoveredApptId = n.id;
  }
  if (p.rescheduleSlot) {
    can("recovery", "appointment.reschedule");
    if (!isTaken(s, p.rescheduleDoctorId ?? p.doctorId, p.rescheduleSlot)) {
      const r = createAppointment(s, { patientId: cancelled.patientId, doctorId: p.rescheduleDoctorId ?? p.doctorId, start: p.rescheduleSlot, source: "recovery", actor: "recovery", extra: { rescheduledFrom: cancelled.id, inquiryId: cancelled.inquiryId }, demo });
      done.push(`أعيدت جدولة ${patientName(s, cancelled.patientId)} إلى ${fmtDayTime(r.start)}`);
      if (thread) addMessage(s, thread, "sura", "لا بأس، نتمنى لك السلامة. وجدت لك موعدًا بديلًا:", { mode: "rule", card: { kind: "recovery", title: "موعد بديل", lines: [doctorOf(s, r.doctorId).name, fmtDayTime(r.start)] } });
      if (s.demo.runId && demo) s.demo.rescheduledApptId = r.id;
    }
  }
  t.status = "completed";
  t.completedAt = nowIso();
  t.outcome = `${p.waitPatientId ? `استُرد الموعد (+${p.value} ر.ع. تقديرية)` : "أعيدت الجدولة"} — ${done.join("، ")}`;
  audit(s, { event: "recovery.completed", actor: "recovery", action: "تنفيذ الاسترداد المعتمد", outcome: t.outcome, patientId: cancelled.patientId, ref: t.id, demo });
}

function onRecoveryDeclined(s: Data, ev: OpEvent) {
  const t = s.tasks.find((x) => x.id === ev.payload.taskId);
  if (!t || t.status !== "requires_approval") return;
  t.status = "completed";
  t.completedAt = nowIso();
  t.outcome = "رفض فريق العيادة الاقتراح — بقي الموعد شاغرًا";
  audit(s, { event: "recovery.declined", actor: "staff", action: "رفض اقتراح الاسترداد", outcome: t.outcome, ref: t.id });
}

/* ---------------- Growth & retention ---------------- */

function onVisitCompleted(s: Data, ev: OpEvent) {
  const a = apptOf(s, String(ev.payload.apptId));
  const t = openTask(s, "growth", ev, "جدولة متابعة ما بعد الزيارة", patientName(s, a.patientId), a.patientId);
  can("growth", "followup.create");
  const spec = SPECIALTY[doctorOf(s, a.doctorId).specialty];
  s.followups.unshift({ id: nid(s, "fu"), patientId: a.patientId, title: `اتصال متابعة بعد زيارة ${spec}`, due: addDays(new Date(), 2).toISOString(), status: "open", owner: "clinic", source: "growth", createdAt: nowIso() });
  finish(s, t, "أُنشئت مهمة متابعة بعد يومين", ["زيارة مكتملة", "سياسة العيادة: متابعة خلال 48 ساعة"]);
}

function inactiveCandidates(s: Data, specialty?: Specialty) {
  const cutoff = Date.now() - 120 * 86400000;
  return s.patients.filter((p) => {
    if (p.status === "lead") return false;
    if (!p.lastVisit || new Date(p.lastVisit).getTime() > cutoff) return false;
    if (s.appointments.some((a) => a.patientId === p.id && new Date(a.start) > new Date() && a.status !== "cancelled")) return false;
    if (s.outreach.some((o) => o.patientId === p.id && ["draft", "approved", "sent_sim"].includes(o.status))) return false;
    if (specialty) {
      const past = s.appointments.filter((a) => a.patientId === p.id).map((a) => doctorOf(s, a.doctorId).specialty);
      if (past.length && !past.includes(specialty)) return false;
    }
    return true;
  });
}

function draftOutreach(s: Data, ev: OpEvent, title: string, specialty?: Specialty, campaignId?: string) {
  const t = openTask(s, "growth", ev, title, campaignId ? s.campaigns.find((c) => c.id === campaignId)?.name ?? "" : "مرضى بلا زيارة منذ أكثر من 120 يومًا");
  can("growth", "outreach.draft");
  const targets = inactiveCandidates(s, specialty).slice(0, 5);
  if (!targets.length) return finish(s, t, "لا مرضى مستهدفين حاليًا", ["فُحص سجل المرضى", "لا أحد يطابق شروط الاستهداف"]);
  const ids = targets.map((p) => {
    const id = nid(s, "od");
    s.outreach.unshift({ id, patientId: p.id, campaignId, kind: campaignId ? "campaign" : "reactivation", text: `مرحبًا ${p.name.split(" ")[0]}، نتمنى أن تكون بخير. يسعدنا ترتيب موعد متابعة لك${specialty ? ` في ${SPECIALTY[specialty]}` : ""} متى ما ناسبك.`, status: "draft", createdAt: nowIso(), taskId: t.id });
    return id;
  });
  t.ref = campaignId;
  awaitApproval(s, t, `${ids.length} مسودات تواصل بانتظار الاعتماد`, { kind: "outreach", draftIds: ids, campaignId }, [
    `معيار الاستهداف: آخر زيارة قبل 120 يومًا ولا موعد قادم${specialty ? ` · ${SPECIALTY[specialty]}` : ""}`,
    `عدد المطابقين: ${ids.length}`,
    "الإرسال الخارجي يتطلب موافقة — والإرسال هنا محاكاة فقط",
  ]);
}

function onCampaignCreated(s: Data, ev: OpEvent) {
  const c = s.campaigns.find((x) => x.id === ev.payload.campaignId);
  can("growth", "campaign.attribute");
  draftOutreach(s, ev, "تجهيز جمهور الحملة", c?.specialty, c?.id);
}

function onOutreachApproved(s: Data, ev: OpEvent) {
  const t = s.tasks.find((x) => x.id === ev.payload.taskId);
  if (!t || t.proposal?.kind !== "outreach" || t.status !== "requires_approval") return;
  can("growth", "outreach.send_simulated");
  const p = t.proposal;
  let responded = 0;
  p.draftIds.forEach((id, i) => {
    const d = s.outreach.find((x) => x.id === id);
    if (!d) return;
    d.status = "sent_sim";
    if (i % 2 === 0) {
      /* deterministic simulated reply: every other recipient answers and enters the normal inquiry flow */
      d.status = "responded";
      responded++;
      const pt = s.patients.find((x) => x.id === d.patientId)!;
      const camp = s.campaigns.find((c) => c.id === d.campaignId);
      const spec = camp?.specialty ?? "internal";
      const q = { id: nid(s, "inq"), patientId: pt.id, name: pt.name, phone: pt.phone, channel: "whatsapp" as const, campaignId: d.campaignId, text: `نعم، أريد موعد ${SPECIALTY[spec]}`, status: "new" as const, createdAt: nowIso() };
      s.inquiries.push(q);
      addMessage(s, q.id, "patient", q.text, { mode: "simulated" });
      emit(s, "inquiry.received", { inquiryId: q.id });
    }
  });
  t.status = "completed";
  t.completedAt = nowIso();
  t.outcome = `أُرسلت ${p.draftIds.length} رسائل (محاكاة) — ${responded} ردود دخلت مسار الحجز`;
  audit(s, { event: "outreach.sent", actor: "growth", action: "إرسال رسائل معتمدة (محاكاة)", outcome: t.outcome, ref: t.id });
}

function onOutreachDeclined(s: Data, ev: OpEvent) {
  const t = s.tasks.find((x) => x.id === ev.payload.taskId);
  if (!t || t.proposal?.kind !== "outreach" || t.status !== "requires_approval") return;
  t.proposal.draftIds.forEach((id) => {
    const d = s.outreach.find((x) => x.id === id);
    if (d) d.status = "discarded";
  });
  t.status = "completed";
  t.completedAt = nowIso();
  t.outcome = "رُفضت المسودات — لم يُرسل شيء";
  audit(s, { event: "outreach.declined", actor: "staff", action: "رفض مسودات التواصل", outcome: t.outcome, ref: t.id });
}

function onOutcome(s: Data, ev: OpEvent) {
  const q = s.inquiries.find((x) => x.id === ev.payload.inquiryId);
  if (!q) throw new DomainError("الاستفسار غير موجود");
  const camp = s.campaigns.find((c) => c.id === q.campaignId);
  const t = openTask(s, "growth", ev, "نسب النتيجة للحملة وتحديث تحليلات الاسترداد", camp?.name ?? CHANNEL[q.channel], q.patientId);
  can("growth", "campaign.attribute");
  const value = Number(ev.payload.value ?? 0);
  finish(s, t, camp ? `نُسب الحجز إلى «${camp.name}» وأُضيفت ${value} ر.ع. مستردة للتحليلات` : `سُجّلت النتيجة (${value} ر.ع. مستردة)`, [
    `مصدر الاستفسار: ${CHANNEL[q.channel]}${camp ? ` · ${camp.name}` : ""}`,
    "الحجز الأصلي أُلغي ثم أعيدت جدولته — يُحتسب تحويلًا واحدًا",
    `قيمة الموعد المسترد: ${value} ر.ع. (تقديرية)`,
    "معدلات التحويل والاسترداد تُحسب من السجلات مباشرة",
  ]);
}

/* ---------------- Connected care ---------------- */

function onReading(s: Data, ev: OpEvent) {
  const rd = s.readings.find((x) => x.id === ev.payload.readingId);
  if (!rd) return;
  can("care", "reading.evaluate");
  const th = s.thresholds;
  const reasons: string[] = [];
  const flags: string[] = [];
  if (rd.hr > th.hrHigh) { reasons.push(`نبض ${rd.hr} ن/د — أعلى من العتبة التوضيحية ${th.hrHigh}`); flags.push("hr"); }
  if (rd.hr < th.hrLow) { reasons.push(`نبض ${rd.hr} ن/د — أقل من العتبة التوضيحية ${th.hrLow}`); flags.push("hr"); }
  if (rd.spo2 < th.spo2Low) { reasons.push(`تشبّع الأكسجين ${rd.spo2}% — أقل من العتبة التوضيحية ${th.spo2Low}%`); flags.push("spo2"); }
  if (rd.temp >= th.tempHigh) { reasons.push(`حرارة الجلد ${rd.temp}° — عند/أعلى من العتبة التوضيحية ${th.tempHigh}°`); flags.push("temp"); }
  if (!reasons.length) return; // within the illustrative thresholds: evaluated, nothing to escalate
  rd.flagged = flags;
  const open = s.reviews.find((r) => r.patientId === rd.patientId && r.status !== "completed");
  if (open) {
    open.readingIds.push(rd.id);
    for (const x of reasons) if (!open.reasons.some((y) => y.split(" ")[0] === x.split(" ")[0])) open.reasons.push(x);
    if (open.status === "acknowledged") open.priority = "review";
    if (open.readingIds.length % 3 === 1) audit(s, { event: "wearable.reading", actor: "care", action: "إضافة قراءة لمراجعة قائمة", outcome: reasons.join(" · "), patientId: rd.patientId, ref: open.id });
    return;
  }
  const t = openTask(s, "care", ev, "إحالة قراءة لمراجعة الطبيب", `${patientName(s, rd.patientId)} · نبض ${rd.hr} · SpO₂ ${rd.spo2}%`, rd.patientId);
  can("care", "review.create");
  const rv = { id: nid(s, "rv"), patientId: rd.patientId, readingIds: [rd.id], reasons, priority: "review" as const, status: "open" as const, createdAt: nowIso() };
  s.reviews.unshift(rv);
  can("care", "followup.create");
  s.followups.unshift({ id: nid(s, "fu"), patientId: rd.patientId, title: "مراجعة قراءات السوار من الطبيب المعالج", due: nowIso(), status: "open", owner: "doctor", source: "care", reviewId: rv.id, createdAt: nowIso() });
  can("care", "doctor.notify");
  t.ref = rv.id;
  finish(s, t, "أُنشئت مهمة مراجعة في لوحة الطبيب — دون أي تشخيص", [...reasons, "القاعدة توضيحية وتتطلب اعتمادًا سريريًا", "الإجراء: إحالة لمراجعة بشرية فقط"]);
}

const HANDLERS: Record<EventType, (s: Data, ev: OpEvent) => void> = {
  "inquiry.received": onInquiry,
  "booking.requested": onBookingRequested,
  "appointment.created": onAppointmentCreated,
  "confirmation.received": onConfirmation,
  "appointment.cancelled": onCancelled,
  "recovery.approved": onRecoveryApproved,
  "recovery.declined": onRecoveryDeclined,
  "appointment.completed": onVisitCompleted,
  "campaign.created": onCampaignCreated,
  "growth.scan": (s, ev) => draftOutreach(s, ev, "رصد مرضى غير نشطين وصياغة رسائل"),
  "outreach.approved": onOutreachApproved,
  "outreach.declined": onOutreachDeclined,
  "wearable.reading": onReading,
  "outcome.recorded": onOutcome,
};

function processEvent(s: Data, ev: OpEvent) {
  ev.processed = true;
  ev.agent = ROUTES[ev.type];
  try {
    HANDLERS[ev.type](s, ev);
  } catch (e) {
    ev.error = e instanceof Error ? e.message : String(e);
    const open = s.tasks.find((t) => t.eventId === ev.id && t.status === "processing");
    if (open) fail(s, open, ev.error);
    else audit(s, { event: ev.type, actor: "orchestrator", action: "تعذّر تنفيذ المسار", outcome: ev.error });
  }
}

/* Drain pending events. Held events (demo steps) wait until the presenter releases their type.
   The iteration cap stops any accidental event cycle. */
export function runOrchestrator(s: Data, opts: { release?: EventType[] } = {}) {
  for (let i = 0; i < 120; i++) {
    const ev = s.events.find((e) => !e.processed && (!e.held || opts.release?.includes(e.type)));
    if (!ev) return;
    processEvent(s, ev);
  }
}

export function approveTask(s: Data, taskId: string, by: "staff" | "doctor" = "staff", note?: string) {
  const t = s.tasks.find((x) => x.id === taskId);
  if (!t || t.status !== "requires_approval" || !t.proposal) throw new DomainError("لا يوجد إجراء بانتظار الاعتماد");
  audit(s, { event: "approval.granted", actor: by, action: `اعتماد: ${t.title}`, outcome: note ?? "اعتُمد الإجراء", ref: t.id, patientId: t.patientId, demo: t.demo });
  emit(s, t.proposal.kind === "recovery" ? "recovery.approved" : "outreach.approved", { taskId: t.id, demo: t.demo || undefined });
}

export function declineTask(s: Data, taskId: string) {
  const t = s.tasks.find((x) => x.id === taskId);
  if (!t || t.status !== "requires_approval" || !t.proposal) throw new DomainError("لا يوجد إجراء بانتظار الاعتماد");
  emit(s, t.proposal.kind === "recovery" ? "recovery.declined" : "outreach.declined", { taskId: t.id });
}
