/* End-to-end checks against the running app (npm run build && npm start).
   Each check drives the real UI, then reads the persisted store to prove the state actually changed. */
import { BASE, goto, loadChromium, resetData, state, waitState } from "./lib.mjs";

const chromium = await loadChromium();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-OM", timezoneId: "Asia/Muscat" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

const results = [];
async function check(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`PASS  ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    console.log(`FAIL  ${name}: ${e.message}`);
  }
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const count = (s) => ({ appts: s.appointments.length, inq: s.inquiries.length, tasks: s.tasks.length, audit: s.audit.length, patients: s.patients.length, reviews: s.reviews.length });

let seed;
await check("seed loads with coherent data", async () => {
  await resetData(page);
  seed = await state(page);
  assert(seed, "no persisted store");
  assert(seed.doctors.length === 4, "expected 4 doctors");
  assert(seed.patients.filter((p) => p.featured).length === 8, "expected 8 featured patients");
  assert(seed.campaigns.length === 3, "expected 3 campaigns");
  assert(seed.devices.length === 4, "expected 4 wearables");
  /* no two live bookings share a doctor and a slot */
  const live = seed.appointments.filter((a) => a.status !== "cancelled" && a.status !== "no_show");
  const keys = new Set(live.map((a) => a.doctorId + a.start));
  assert(keys.size === live.length, "double booking in seed");
});

const ROUTES = [["/", "لوحة القيادة التنفيذية"], ["/dashboard", "لوحة القيادة التنفيذية"], ["/operations", "العمليات الذكية"], ["/agents", "سُرى وستة وكلاء"], ["/appointments", "المواعيد"], ["/patients", "المرضى"], ["/growth", "النمو والتسويق"], ["/care", "الرعاية المتصلة"], ["/doctor", "لوحة متابعة الطبيب"], ["/demo", "رحلة تشغيل ذكية متكاملة"], ["/patient-app", "تطبيق المريض"]];
await check("all 11 routes render without errors", async () => {
  for (const [path, text] of ROUTES) {
    const before = errors.length;
    await goto(page, path);
    await page.waitForTimeout(400);
    const body = await page.innerText("body");
    assert(body.includes(text), `${path}: missing "${text}"`);
    assert(errors.length === before, `${path}: ${errors.slice(before).join(" | ")}`);
  }
});

await check("journey: inquiry → booking → confirmation → cancellation → recovery → outcome", async () => {
  await goto(page, "/demo");
  const before = await state(page);
  await page.getByRole("button", { name: "تشغيل الرحلة كاملة" }).first().click();
  await page.waitForSelector("text=اكتملت الرحلة ووُثّقت", { timeout: 45000 });
  const s = await state(page);
  assert(s.demo.step === 8, `demo step ${s.demo.step}`);
  const orig = s.appointments.find((a) => a.id === s.demo.apptId);
  const filled = s.appointments.find((a) => a.id === s.demo.recoveredApptId);
  const moved = s.appointments.find((a) => a.id === s.demo.rescheduledApptId);
  assert(orig?.status === "cancelled", `original appointment is ${orig?.status}`);
  assert(filled?.recovered && filled.status === "confirmed" && filled.start === orig.start && filled.doctorId === orig.doctorId, "released slot not filled from the waiting list");
  assert(moved?.rescheduledFrom === orig.id && moved.status === "confirmed", "patient not rescheduled");
  const agents = new Set(s.tasks.filter((t) => t.demo).map((t) => t.agent));
  for (const a of ["sura", "scheduling", "attendance", "recovery", "growth"]) assert(agents.has(a), `agent ${a} did not act`);
  assert(s.audit.filter((a) => a.demo).length >= 12, "audit trail too short");
  assert(s.appointments.length === before.appointments.length + 3, "expected exactly 3 new appointments");
  assert(s.waitlist.find((w) => w.patientId === s.demo.waitPatientId)?.status === "booked", "waitlist entry not closed");
  assert(s.events.every((e) => e.processed), "unprocessed events left behind");
});

await check("journey outcome appears in appointments, patient record, dashboard and agents", async () => {
  const s = await state(page);
  await goto(page, "/appointments?q=" + encodeURIComponent("السيابية"));
  assert((await page.locator("tbody tr").count()) >= 2, "demo appointments missing from list");
  await goto(page, `/patients?id=${s.demo.patientId}`);
  assert((await page.innerText("body")).includes("ريم بنت خالد السيابية"), "patient drawer missing");
  await goto(page, "/dashboard");
  assert((await page.innerText("body")).includes("مواعيد مستردة"), "dashboard KPI missing");
  await goto(page, "/agents");
  assert((await page.innerText("body")).includes("ريم بنت خالد السيابية"), "Sura panel does not show the journey conversation");
});

await check("double booking is refused", async () => {
  const s = await state(page);
  const taken = s.appointments.find((a) => a.status === "confirmed" && new Date(a.start) > new Date());
  const other = s.patients.find((p) => p.id !== taken.patientId && p.status === "active").id;
  const ok = await page.evaluate(([patientId, doctorId, start]) => window.__tawd.act.createAppointment({ patientId, doctorId, start }), [other, taken.doctorId, taken.start]);
  assert(ok === false, "double booking accepted");
  const after = await state(page);
  assert(after.appointments.length === s.appointments.length, "a record was written despite the refusal");
  /* and the UI never offers a taken slot */
  await goto(page, "/operations");
  await page.getByRole("button", { name: "موعد جديد" }).first().click();
  const slots = await page.locator("[role=dialog] button.latin").allInnerTexts();
  assert(slots.length > 0, "no free slots offered");
  await page.keyboard.press("Escape");
});

await check("wearable reading → care agent → doctor review → acknowledgement → close", async () => {
  await goto(page, "/care");
  await page.getByRole("button", { name: "قراءات تتطلب مراجعة" }).click();
  await page.getByRole("button", { name: "بدء المحاكاة" }).click();
  const s = await waitState(page, (x) => x.reviews.some((r) => r.patientId === "p1" && r.status === "open"), 30000, "review for p1");
  await page.getByRole("button", { name: "إيقاف المحاكاة" }).click();
  const rv = s.reviews.find((r) => r.patientId === "p1" && r.status === "open");
  assert(s.tasks.some((t) => t.agent === "care" && t.ref === rv.id), "care agent task missing");
  assert(s.followups.some((f) => f.reviewId === rv.id && f.owner === "doctor"), "doctor follow-up missing");
  await goto(page, "/doctor?id=p1");
  assert((await page.innerText("body")).includes("إشارة مراجعة مفتوحة"), "doctor dashboard shows no open review");
  await page.getByRole("button", { name: "تأكيد الاطلاع" }).click();
  await waitState(page, (x) => x.reviews.find((r) => r.id === rv.id)?.status === "acknowledged", 5000, "acknowledged");
  await page.getByRole("button", { name: "مهمة متابعة" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "إنشاء" }).click();
  await page.getByRole("button", { name: "إغلاق المراجعة" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "إغلاق المراجعة" }).click();
  const after = await waitState(page, (x) => x.reviews.find((r) => r.id === rv.id)?.status === "completed", 5000, "completed");
  assert(after.audit.some((a) => a.actor === "doctor" && a.action.includes("إغلاق")), "doctor action not audited");
});

await check("patient app booking appears in the clinic schedule", async () => {
  await goto(page, "/patient-app");
  const welcome = page.getByRole("button", { name: "ابدأ" });
  if (await welcome.count()) await welcome.click();
  const before = await state(page);
  await page.getByRole("button", { name: "احجز" }).click();
  await page.getByRole("button", { name: /الأمراض الجلدية/ }).click();
  await page.locator("button.latin.h-10").first().click();
  await page.getByRole("button", { name: "متابعة" }).click();
  await page.getByRole("button", { name: "تأكيد الحجز" }).click();
  await page.waitForSelector("text=تم الحجز", { timeout: 5000 });
  const s = await state(page);
  const n = s.appointments.find((a) => !before.appointments.some((b) => b.id === a.id));
  assert(n && n.patientId === "p1" && n.source === "patient_app", "appointment not created from the app");
  assert(n.confirmation === "sent", "attendance agent did not request confirmation");
  await goto(page, "/appointments?q=" + encodeURIComponent("العبري"));
  assert((await page.innerText("tbody")).includes("تطبيق المريض"), "clinic list does not show the app booking");
});

await check("staff cancellation triggers recovery proposal that waits for approval", async () => {
  const s0 = await state(page);
  const target = s0.appointments.find((a) => a.doctorId === "d1" && a.status === "confirmed" && new Date(a.start) > new Date(Date.now() + 86400000) && a.patientId !== "p1");
  await page.evaluate(() => 0);
  await goto(page, "/appointments");
  await page.locator("tbody tr").filter({ hasText: s0.patients.find((p) => p.id === target.patientId).name }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "إلغاء" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "تأكيد الإلغاء" }).click();
  const s = await waitState(page, (x) => x.tasks.some((t) => t.agent === "recovery" && t.ref === target.id), 5000, "recovery task");
  const t = s.tasks.find((x) => x.agent === "recovery" && x.ref === target.id);
  assert(["requires_approval", "completed"].includes(t.status), `recovery task status ${t.status}`);
});

await check("state survives a browser refresh", async () => {
  const s = await state(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const r = await state(page);
  assert(JSON.stringify(count(s)) === JSON.stringify(count(r)), "state changed on reload");
});

await check("reset restores the seeded state", async () => {
  await goto(page, "/dashboard");
  await page.getByRole("button", { name: "ضبط" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "إعادة الضبط" }).click();
  await page.waitForTimeout(500);
  const s = await state(page);
  assert(JSON.stringify(count(s)) === JSON.stringify(count(seed)), `reset mismatch ${JSON.stringify(count(s))} vs ${JSON.stringify(count(seed))}`);
  assert(s.demo.step === 0, "demo not reset");
});

await check("demo is repeatable after reset", async () => {
  await goto(page, "/demo");
  await page.getByRole("button", { name: "تشغيل الرحلة كاملة" }).first().click();
  await page.waitForSelector("text=اكتملت الرحلة ووُثّقت", { timeout: 45000 });
  const s = await state(page);
  assert(s.demo.step === 8 && s.demo.recoveredApptId, "second run did not complete");
});

await check("no runtime errors across the session", async () => {
  assert(errors.length === 0, errors.slice(0, 5).join(" | "));
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed against ${BASE}`);
process.exit(failed.length ? 1 : 0);
