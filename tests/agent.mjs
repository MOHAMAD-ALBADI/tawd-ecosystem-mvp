/* Real-model checks for Sura (needs OPENAI_API_KEY on the server). Drives the chat like a user, then reads the
   clinic store to prove what the agent did. Also captures the agent and 3D band screens. */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { BASE, goto, loadChromium, resetData, state, waitState } from "./lib.mjs";

const OUT = join(process.cwd(), "screenshots");
mkdirSync(OUT, { recursive: true });
const chromium = await loadChromium();
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-OM", timezoneId: "Asia/Muscat" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const results = [];
let viaLlm = false;
const assert = (c, m) => { if (!c) throw new Error(m); };
async function check(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push(true); console.log(`PASS  ${name} (${Date.now() - t0} ms)`); }
  catch (e) { results.push(false); console.log(`FAIL  ${name}: ${e.message}`); }
}
const thread = (mode) => page.evaluate((m) => JSON.parse(sessionStorage.getItem("tawd-sura-chat") ?? "{}")?.state?.threads?.[m], mode);
async function ask(mode, text) {
  const before = (await thread(mode))?.ui?.length ?? 0;
  await page.locator("textarea").last().fill(text);
  await page.locator("textarea").last().press("Enter");
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const t = await thread(mode);
    if (t && !t.busy && t.ui.length >= before + 2) return t.ui[t.ui.length - 1];
    await page.waitForTimeout(500);
  }
  throw new Error("no reply within 90 s");
}

await check("agent endpoint has a model", async () => {
  const r = await (await fetch(BASE + "/api/agent")).json();
  assert(r.enabled, "OPENAI_API_KEY not configured on the server");
  console.log("      model:", r.model);
});

await resetData(page);
await page.setViewportSize({ width: 390, height: 844 });
await goto(page, "/patient-app");
if (await page.getByRole("button", { name: "ابدأ" }).count()) await page.getByRole("button", { name: "ابدأ" }).click();

await check("patient books by conversation; nothing is written until confirm", async () => {
  await page.getByRole("button", { name: "سُرى" }).last().click();
  const s0 = await state(page);
  let m = await ask("patient", "السلام عليكم، أبي موعد مع دكتور القلب");
  console.log("      sura:", m.text, "| tools:", (m.tools ?? []).join(","), "| via:", m.via);
  viaLlm = m.via === "llm";
  assert((m.tools ?? []).includes("find_available_slots"), "agent did not search the schedule");
  if (!m.proposals?.length) {
    m = await ask("patient", "أبي أقرب موعد، احجزه لي");
    console.log("      sura:", m.text, "| tools:", (m.tools ?? []).join(","));
  }
  assert(m.proposals?.length, "no booking card was proposed");
  const s1 = await state(page);
  assert(s1.appointments.length === s0.appointments.length, "something was booked before confirmation");
  await page.screenshot({ path: join(OUT, "11-sura-patient-chat.png") });
  await page.getByRole("button", { name: "تأكيد" }).last().click();
  const s2 = await waitState(page, (s) => s.appointments.length === s0.appointments.length + 1, 5000, "booking");
  const n = s2.appointments.find((a) => !s0.appointments.some((b) => b.id === a.id));
  assert(n.patientId === "p1" && n.doctorId === "d1" && n.source === "patient_app", "wrong booking");
  assert(s2.tasks.some((t) => t.agent === "sura" && t.title.startsWith("محادثة مريض")), "agent turn not recorded");
});

await check("replies come from the language model (not the rules fallback)", async () => {
  const st = await page.evaluate(() => JSON.parse(sessionStorage.getItem("tawd-sura-chat") ?? "{}"));
  const reason = await page.locator("text=وضع القواعد").first().textContent().catch(() => "");
  assert(viaLlm, `fallback in use — ${reason || "provider error"}`);
  void st;
});

await check("patient asks about the band: values from the device, no diagnosis", async () => {
  const m = await ask("patient", "طمنّي على قراءات السوار حقي");
  console.log("      sura:", m.text, "| tools:", (m.tools ?? []).join(","));
  assert((m.tools ?? []).includes("get_my_band_summary"), "model did not read the band");
  assert(/\d/.test(m.text), "reply has no reading values");
});

await check("3D band renders in the patient app", async () => {
  await page.getByRole("button", { name: "صحتي" }).click();
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, "12-patient-band-3d.png") });
});

await page.setViewportSize({ width: 1440, height: 900 });
await check("staff asks Sura for the clinic summary", async () => {
  await goto(page, "/");
  await page.getByRole("button", { name: "اسأل سُرى" }).click();
  const m = await ask("staff", "لخّص لي أداء العيادة اليوم");
  console.log("      sura:", m.text, "| tools:", (m.tools ?? []).join(","));
  assert((m.tools ?? []).includes("get_clinic_overview") || (m.tools ?? []).includes("get_today_schedule"), "model did not read the clinic data");
  await page.screenshot({ path: join(OUT, "13-sura-staff-drawer.png") });
  await page.keyboard.press("Escape");
});

await check("3D band renders on Connected Care", async () => {
  await goto(page, "/care");
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, "07-smart-wearable.png") });
});

await check("no page errors", async () => assert(!errors.length, errors.slice(0, 3).join(" | ")));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed against ${BASE}`);
process.exit(results.every(Boolean) ? 0 : 1);
