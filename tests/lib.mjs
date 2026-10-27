/* Shared Playwright helpers. Playwright is resolved from this project, or from PLAYWRIGHT_PATH
   (a node_modules/playwright directory), so the MVP does not need its own browser install. */
import { pathToFileURL } from "node:url";
import { join } from "node:path";

export const BASE = process.env.BASE_URL ?? "http://localhost:3220";

export async function loadChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch {
    const p = process.env.PLAYWRIGHT_PATH;
    if (!p) {
      console.error("playwright not found: npm i -D playwright, or set PLAYWRIGHT_PATH=<dir>/node_modules/playwright");
      process.exit(2);
    }
    return (await import(pathToFileURL(join(p, "index.mjs")).href)).chromium;
  }
}

export async function state(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("tawd-ecosystem") ?? "null")?.state?.data ?? null);
}

export async function ready(page) {
  await page.waitForSelector("main h1, [data-app-ready], button:has-text('ابدأ'), header", { timeout: 20000 });
  await page.waitForFunction(() => !document.body.innerText.includes("جارٍ تحميل منظومة طود"), null, { timeout: 20000 });
  /* the page body itself, not only the shell, has mounted */
  await page.waitForFunction(() => location.pathname.startsWith("/patient-app") || (document.querySelector("main")?.innerText.trim().length ?? 0) > 80, null, { timeout: 20000 });
}

export async function goto(page, path) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await ready(page);
}

export async function waitState(page, pred, timeout = 30000, label = "condition") {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await state(page);
    if (s && pred(s)) return s;
    await page.waitForTimeout(300);
  }
  throw new Error(`timeout waiting for ${label}`);
}

export async function resetData(page) {
  await goto(page, "/dashboard");
  await page.evaluate(() => { localStorage.removeItem("tawd-ecosystem"); localStorage.removeItem("tawd.pa.welcomed"); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  await page.waitForTimeout(300);
}
