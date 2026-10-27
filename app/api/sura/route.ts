/* Optional AI wording for Sura. Only active when a key is present in the server environment; the key never
   reaches the browser. The model rewrites the wording of a reply whose facts were already decided by the
   deterministic rules — it cannot book, cancel or change any record. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const key = () => process.env.OPENAI_API_KEY;

export async function GET() {
  return Response.json({ enabled: !!key(), provider: key() ? "openai" : null });
}

export async function POST(req: Request) {
  if (!key()) return Response.json({ enabled: false }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { patient?: string; reply?: string };
  if (!body.reply || body.reply.length > 800) return Response.json({ error: "bad request" }, { status: 400 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key()}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
        messages: [
          { role: "system", content: "أنت سُرى، موظفة عمليات في عيادة خاصة في عُمان. أعد صياغة الرد التالي بالعربية بلباقة واختصار (جملتان كحد أقصى). لا تضف أي معلومة أو موعد أو سعر غير موجود في النص، ولا تقدّم أي نصيحة طبية." },
          { role: "user", content: `رسالة المريض: ${body.patient ?? ""}\nالرد المعتمد: ${body.reply}` },
        ],
      }),
    });
    if (!r.ok) return Response.json({ error: `upstream ${r.status}` }, { status: 502 });
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content?.trim();
    return text ? Response.json({ text }) : Response.json({ error: "empty" }, { status: 502 });
  } catch {
    return Response.json({ error: "timeout" }, { status: 504 });
  } finally {
    clearTimeout(timer);
  }
}
