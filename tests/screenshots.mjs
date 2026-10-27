/* Captures the submission screenshots from the running app. Every image is a real browser render after the
   workflow it shows has actually been executed (journey run, wearable review raised). */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { goto, loadChromium, resetData, waitState } from "./lib.mjs";

/* SCALE=2 writes a retina set (same 1440×900 / 390×844 layout, twice the pixels) to screenshots/hd */
const SCALE = Number(process.env.SCALE ?? 1);
const OUT = join(process.cwd(), "screenshots", SCALE > 1 ? "hd" : "");
mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY?.split(",");

const chromium = await loadChromium();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SCALE, locale: "ar-OM", timezoneId: "Asia/Muscat", colorScheme: "dark" });
const page = await ctx.newPage();

async function shot(name, opts = {}) {
  if (ONLY && !ONLY.some((o) => name.startsWith(o))) return;
  await page.waitForTimeout(opts.wait ?? 900);
  await page.screenshot({ path: join(OUT, name), fullPage: false });
  console.log("saved", name);
}

await resetData(page);
await page.evaluate(() => (window.__tawd.store.getState().setPresentation(true)));

await goto(page, "/");
await shot("01-tawd-overview.png");

/* the live journey, run for real */
await goto(page, "/demo");
await page.getByRole("button", { name: "تشغيل الرحلة كاملة" }).first().click();
await page.waitForSelector("text=اكتملت الرحلة ووُثّقت", { timeout: 45000 });
await page.evaluate(() => window.scrollTo(0, 0));
await shot("05-booking-recovery-demo.png");
await page.evaluate(() => {
  const el = [...document.querySelectorAll("div.bg-paper")].find((x) => x.textContent?.includes("اكتملت الرحلة ووُثّقت"));
  (el ?? document.body).scrollIntoView({ block: "start" });
  window.scrollBy(0, -88);
});
await shot("10-end-to-end-results.png");

await goto(page, "/dashboard");
await shot("02-clinic-executive-dashboard.png", { wait: 1200 });

await goto(page, "/agents");
await shot("03-sura-ai-agents.png");

await goto(page, "/operations");
await shot("04-intelligent-operations.png");

await goto(page, "/growth");
await shot("06-growth-analytics.png", { wait: 1200 });

/* wearable: stream readings that cross the illustrative thresholds until the care agent raises a review */
await goto(page, "/care");
await page.getByRole("button", { name: "قراءات تتطلب مراجعة" }).click();
await page.getByRole("button", { name: "بدء المحاكاة" }).click();
await waitState(page, (s) => s.reviews.some((r) => r.patientId === "p1" && r.status === "open"), 30000, "review");
await page.waitForTimeout(3600);
await page.getByRole("button", { name: "إيقاف المحاكاة" }).click();
await page.evaluate(() => window.scrollTo(0, 0));
await shot("07-smart-wearable.png", { wait: 1200 });

await goto(page, "/doctor?id=p1");
await shot("08-doctor-monitoring.png", { wait: 1200 });

/* patient app at phone size, same store */
await page.setViewportSize({ width: 390, height: 844 });
await goto(page, "/patient-app");
const start = page.getByRole("button", { name: "ابدأ" });
if (await start.count()) await start.click();
await shot("09-patient-mobile-app.png", { wait: 1000 });

await browser.close();
