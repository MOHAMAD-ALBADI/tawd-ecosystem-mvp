/* Static export for GitHub Pages: `node scripts/build-pages.mjs` writes ./out.
   The optional /api/sura route cannot be exported, so it is set aside for the build and restored afterwards. */
import { execSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";

const base = process.env.PAGES_BASE_PATH ?? "/tawd-ecosystem-mvp";
const api = "app/api";
const parked = ".api-parked";
if (existsSync(parked)) throw new Error(`${parked} exists — a previous build was interrupted; move it back to ${api}`);
rmSync("out", { recursive: true, force: true });
renameSync(api, parked);
try {
  const env = { ...process.env, PAGES_BASE_PATH: base };
  /* Next 16.4.0 sometimes stops after compiling with an upgrade notice; one retry completes the build */
  for (let i = 0; i < 3; i++) {
    try {
      execSync("npx next build", { stdio: "pipe", env });
      break;
    } catch (e) {
      const out = String(e.stdout ?? "") + String(e.stderr ?? "");
      if (!out.includes("SecurityFatalError") || i === 2) { console.error(out.slice(-3000)); throw e; }
    }
  }
} finally {
  renameSync(parked, api);
}
console.log(`static export written to ./out (base path ${base})`);
