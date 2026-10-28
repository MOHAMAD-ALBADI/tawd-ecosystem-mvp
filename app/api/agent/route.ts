/* Sura's language model. The key stays on the server. The model only chooses among the declared tools; the
   tools run in the browser against the clinic data through the same permission-checked engine, and anything
   consequential (book, cancel, reschedule, approve) becomes a card the human must confirm. */
import { TOOL_SCHEMAS, systemPrompt, type AgentMode } from "@/lib/agent/spec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const ALLOWED = ["https://mohamad-albadi.github.io", "http://localhost:3220", "http://127.0.0.1:3220"];
let sendEffort = true;

/* per-instance guard so a public link cannot run up an unbounded bill */
const hits = new Map<string, number[]>();
let daily = { day: "", n: 0 };
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60000);
  recent.push(now);
  hits.set(ip, recent);
  const day = new Date().toISOString().slice(0, 10);
  if (daily.day !== day) daily = { day, n: 0 };
  daily.n++;
  return recent.length > 80 || daily.n > Number(process.env.LLM_DAILY_CAP || 2000);
}

function cors(req: Request) {
  const o = req.headers.get("origin") ?? "";
  const h: Record<string, string> = { "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" };
  if (ALLOWED.includes(o) || o.endsWith(".vercel.app")) h["access-control-allow-origin"] = o;
  return h;
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export function GET(req: Request) {
  return Response.json({ enabled: !!process.env.OPENAI_API_KEY, model: process.env.OPENAI_API_KEY ? MODEL : null }, { headers: cors(req) });
}

type Msg = { role: "user" | "assistant" | "tool"; content: string | null; tool_calls?: unknown; tool_call_id?: string };

export async function POST(req: Request) {
  const headers = cors(req);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: "no_key" }, { status: 503, headers });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return Response.json({ error: "rate_limited" }, { status: 429, headers });

  const body = (await req.json().catch(() => null)) as { mode?: AgentMode; messages?: Msg[]; context?: string } | null;
  const mode: AgentMode = body?.mode === "staff" ? "staff" : "patient";
  const messages = Array.isArray(body?.messages) ? body!.messages.slice(-40) : [];
  if (!messages.length || JSON.stringify(messages).length > 60000) return Response.json({ error: "bad_request" }, { status: 400, headers });
  const clean = messages.map((m) => ({
    role: m.role === "assistant" || m.role === "tool" ? m.role : "user",
    content: typeof m.content === "string" ? m.content.slice(0, 6000) : null,
    ...(m.role === "assistant" && m.tool_calls ? { tool_calls: m.tool_calls } : {}),
    ...(m.role === "tool" ? { tool_call_id: String(m.tool_call_id ?? "") } : {}),
  }));

  for (let attempt = 0; attempt < 3; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 40000);
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: ctl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "system", content: systemPrompt(mode, String(body?.context ?? "").slice(0, 4000)) }, ...clean],
          tools: TOOL_SCHEMAS[mode],
          ...(sendEffort ? { reasoning_effort: process.env.OPENAI_REASONING_EFFORT || "none" } : {}),
        }),
      });
      if (r.ok) {
        const j = (await r.json()) as { choices: { message: { content: string | null; tool_calls?: unknown } }[] };
        const m = j.choices?.[0]?.message;
        return Response.json({ message: { content: m?.content ?? null, tool_calls: m?.tool_calls ?? undefined }, model: MODEL }, { headers });
      }
      const text = await r.text().catch(() => "");
      if (r.status === 400 && sendEffort && /reasoning/i.test(text)) { sendEffort = false; continue; }
      /* the provider's own error code (e.g. insufficient_quota, rate_limit_exceeded) — never the key or the prompt */
      let code = "";
      try { code = String((JSON.parse(text) as { error?: { code?: string; type?: string } }).error?.code ?? ""); } catch { /* not JSON */ }
      if (code !== "insufficient_quota" && (r.status === 429 || r.status >= 500) && attempt < 2) { await new Promise((ok) => setTimeout(ok, 900)); continue; }
      return Response.json({ error: `provider_${r.status}`, code: code || undefined }, { status: 502, headers });
    } catch {
      if (attempt < 1) continue;
      return Response.json({ error: "provider_timeout" }, { status: 504, headers });
    } finally {
      clearTimeout(timer);
    }
  }
  return Response.json({ error: "provider_failed" }, { status: 502, headers });
}
