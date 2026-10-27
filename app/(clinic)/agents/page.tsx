"use client";
import Link from "next/link";
import { asset } from "@/lib/asset";
import { useEffect, useMemo, useState } from "react";
import { Check, Lock, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import type { AgentId, AgentTask, Channel, TaskStatus } from "@/types";
import { useData, useStore } from "@/lib/store";
import { act } from "@/lib/store/actions";
import { agentStats, kpis } from "@/lib/engine/kpis";
import { ACTOR_LABEL, AGENTS, AGENT_ORDER, CHANNEL, EVENT_LABEL, ROUTES } from "@/lib/constants";
import { ago, fmtTime, sameDay } from "@/lib/time";
import { cls, num } from "@/lib/format";
import { AgentAvatar, Badge, Button, Card, Field, PageHeader, SimTag, Tabs, TaskBadge, inputCls } from "@/components/ui";
import { AuditTable } from "@/components/audit";
import { OrchestrationMap } from "@/components/agents/orchestration-map";

const PRESETS = ["السلام عليكم، أريد موعد مع طبيب القلب.", "كم سعر تنظيف الأسنان؟", "عندي حساسية في الجلد وأبغى موعد", "أبي موعد متابعة سكري"];

export default function AgentsPage() {
  const d = useData();
  const k = useMemo(() => kpis(d), [d]);
  const suraTask = d.tasks.find((t) => t.agent === "sura" && t.reasoning);
  const latestThread = useMemo(() => {
    const withMsgs = [...d.inquiries].reverse().find((q) => d.messages.some((m) => m.threadId === q.id && m.from === "sura"));
    return withMsgs;
  }, [d]);
  const thread = d.messages.filter((m) => m.threadId === latestThread?.id).slice(-5);
  const suraToday = d.tasks.filter((t) => t.agent === "sura" && sameDay(t.createdAt, new Date())).length;
  const open = d.tasks.filter((t) => ["processing", "pending", "requires_approval"].includes(t.status));
  const routed = suraTask ? d.events.filter((e) => e.at >= suraTask.createdAt && e.type !== "inquiry.received").slice(0, 3) : [];

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="TAWD Intelligence"
        title="سُرى وستة وكلاء تشغيليين"
        subtitle="الوكلاء ينفّذون مسارات عمل حقيقية على بيانات العيادة: كل حدث يُوجَّه إلى وكيل واحد، بصلاحيات محددة، ونتيجة موثّقة. القرارات المؤثرة على المرضى تنتظر اعتمادًا بشريًا."
        actions={<Badge tone="ok" dot pulse>المنظومة تعمل · {num(k.tasksToday)} مهمة اليوم</Badge>}
      />

      <div className="grid gap-3 xl:grid-cols-12">
        {/* Sura */}
        <section className="card relative overflow-hidden xl:col-span-7">
          <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-acc/[0.07] blur-3xl" />
          <div className="relative flex flex-wrap items-start gap-4 border-b hairline p-5">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-acc/30 bg-acc/10 text-[24px] font-semibold text-acc">س</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[20px] font-semibold">سُرى</h2>
                <Badge tone="ok" dot pulse>نشطة</Badge>
                <span className="latin text-[11.5px] text-tx3">Executive Clinic Operations Officer</span>
              </div>
              <p className="mt-1 text-[13px] text-tx2">مسؤولة العمليات التنفيذية: تتواصل مع المرضى، تفهم الطلب، وتنسّق بقية الوكلاء.</p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <MiniStat label="مهام جارية" value={open.length} />
              <MiniStat label="أنجزت اليوم" value={suraToday} />
              <MiniStat label="بانتظار اعتماد" value={k.approvals} warn />
            </div>
          </div>
          <div className="relative grid gap-0 md:grid-cols-2">
            <div className="border-b hairline p-5 md:border-b-0 md:border-l">
              <div className="mb-3 flex items-center justify-between text-[12px] text-tx3"><span>معاينة المحادثة الأخيرة</span>{latestThread && <span>{latestThread.name} · {CHANNEL[latestThread.channel]}</span>}</div>
              <div className="space-y-2">
                {thread.length ? thread.map((m) => (
                  <div key={m.id} className={cls("max-w-[92%] rounded-2xl px-3 py-2 text-[12.5px] leading-6", m.from === "patient" ? "bg-s3" : m.from === "system" ? "border border-dashed border-line2 text-tx3" : "mr-auto border border-acc/20 bg-acc/[0.07]")}>
                    {m.text}
                    {m.card && <div className="mt-1 text-[11.5px] text-acc">{m.card.lines.join(" · ")}</div>}
                    <div className="mt-0.5 text-[10.5px] text-tx3"><span className="latin">{fmtTime(m.at)}</span>{m.mode === "llm" ? " · صياغة نموذج لغوي" : m.mode === "rule" ? " · قواعد" : m.mode === "simulated" ? " · محاكاة" : ""}</div>
                  </div>
                )) : <div className="text-[12.5px] text-tx3">لا محادثات بعد.</div>}
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <div className="mb-2 text-[12px] text-tx3">شرح القرار</div>
                <ul className="space-y-1.5 text-[12.5px]">
                  {suraTask?.reasoning?.map((r) => <li key={r} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-acc" />{r}</li>) ?? <li className="text-tx3">—</li>}
                </ul>
              </div>
              <div>
                <div className="mb-2 text-[12px] text-tx3">الإجراءات المنفّذة</div>
                <div className="flex flex-wrap gap-1.5">
                  {suraTask && <Badge tone="acc">{suraTask.title}</Badge>}
                  {routed.map((e) => <Badge key={e.id} tone="info">{EVENT_LABEL[e.type]} ← {e.agent ? AGENTS[e.agent].name : "…"}</Badge>)}
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                <div className="text-[11.5px] text-tx3">النتيجة المسجّلة</div>
                <div className="mt-0.5 text-[13px]">{suraTask?.outcome ?? "—"}</div>
                {suraTask && <div className="mt-1 text-[11px] text-tx3">{ago(suraTask.createdAt)} · <Link href="#audit" className="text-acc">في سجل التدقيق</Link></div>}
              </div>
            </div>
          </div>
        </section>

        <SuraConsole />
      </div>

      <Card className="mt-3" title="خريطة التنسيق" subtitle="TAWD Intelligence يستقبل الأحداث، يطبّق الصلاحيات والقواعد، ويوجّه كل حدث لوكيل واحد — الخطوط المتحركة = نشاط خلال آخر 15 دقيقة">
        <OrchestrationMap />
      </Card>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {AGENT_ORDER.map((a) => <AgentCard key={a} id={a} />)}
      </div>

      <TaskBoard />

      <AuditSection />
    </div>
  );
}

function MiniStat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div>
      <div className={cls("latin text-[22px] font-semibold leading-none", warn && value > 0 && "text-warn")}>{value}</div>
      <div className="mt-1 text-[11px] text-tx3">{label}</div>
    </div>
  );
}

function SuraConsole() {
  const d = useData();
  const [name, setName] = useState("خلود الحبسية");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [campaign, setCampaign] = useState("");
  const [text, setText] = useState(PRESETS[0]);
  const [sent, setSent] = useState<string>("");
  const [ai, setAi] = useState<boolean | null>(null);
  const [polishing, setPolishing] = useState(false);
  useEffect(() => {
    fetch(asset("/api/sura")).then((r) => r.json()).then((j: { enabled?: boolean }) => setAi(!!j.enabled)).catch(() => setAi(false));
  }, []);
  const thread = d.messages.filter((m) => m.threadId === sent);
  const q = d.inquiries.find((x) => x.id === sent);

  const submit = async () => {
    if (!text.trim() || !name.trim()) return;
    const id = act.submitInquiry({ name: name.trim(), channel, text: text.trim(), campaignId: campaign || undefined, phone: `+968 9${String(d.seq).padStart(3, "0").slice(-3)} ${String(4000 + (d.seq % 5000))}` });
    setSent(id);
    if (ai && id) {
      const reply = useStore.getState().data.messages.find((m) => m.threadId === id && m.from === "sura");
      if (!reply) return;
      setPolishing(true);
      try {
        const r = await fetch(asset("/api/sura"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ patient: text, reply: reply.text }) });
        const j = (await r.json()) as { text?: string };
        if (j.text) act.setMessageText(reply.id, j.text);
      } finally {
        setPolishing(false);
      }
    }
  };

  return (
    <Card className="xl:col-span-5" title="محاكاة استفسار وارد" subtitle="اكتب أي رسالة: تمر عبر سُرى ثم الجدولة ثم تأكيد الحضور — وتُنشئ سجلات حقيقية" tag={<SimTag label="قناة محاكاة" />}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="اسم المريض (وهمي)"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="القناة">
          <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            {(["whatsapp", "instagram", "web", "phone"] as Channel[]).map((c) => <option key={c} value={c}>{CHANNEL[c]}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-3">
        <Field label="الحملة (اختياري — للنسب)">
          <select className={inputCls} value={campaign} onChange={(e) => setCampaign(e.target.value)}>
            <option value="">بدون حملة</option>
            {d.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-3">
        <Field label="نص الرسالة">
          <textarea className={cls(inputCls, "h-20 resize-none py-2 leading-6")} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => <button key={p} onClick={() => setText(p)} className="rounded-full border border-line2 px-2.5 py-1 text-[11.5px] text-tx2 hover:border-acc/40 hover:text-tx">{p.length > 26 ? p.slice(0, 26) + "…" : p}</button>)}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-tx3">{ai === null ? "…" : ai ? "الصياغة: نموذج لغوي على الخادم · القرار: قواعد" : "الصياغة والقرار: قواعد حتمية (لا مفتاح نموذج لغوي)"}</span>
        <Button variant="primary" icon={<Send size={14} />} onClick={submit}>إرسال إلى سُرى</Button>
      </div>
      {q && (
        <div className="fade-up mt-4 rounded-xl border hairline bg-[#0c0c0c] p-3">
          <div className="mb-2 flex items-center justify-between text-[11.5px] text-tx3">
            <span>النتيجة: <span className="text-tx">{q.status === "booked" ? "حُجز موعد" : q.status === "answered" ? "أُجيب" : q.status}</span></span>
            {q.appointmentId && <Link href="/appointments" className="text-acc">في المواعيد ←</Link>}
          </div>
          <div className="space-y-1.5">
            {thread.map((m) => (
              <div key={m.id} className={cls("rounded-xl px-3 py-1.5 text-[12.5px] leading-6", m.from === "patient" ? "bg-s3" : m.from === "system" ? "text-[11.5px] text-tx3" : "border border-acc/15 bg-acc/[0.06]")}>
                {m.text}{m.card && <span className="text-acc"> — {m.card.lines.join(" · ")}</span>}
                {m.mode === "llm" && <span className="mr-1 text-[10.5px] text-acc"><Sparkles size={10} className="inline" /> صياغة نموذج لغوي</span>}
              </div>
            ))}
            {polishing && <div className="text-[11.5px] text-tx3">تحسين الصياغة…</div>}
          </div>
        </div>
      )}
    </Card>
  );
}

function AgentCard({ id }: { id: AgentId }) {
  const d = useData();
  const a = AGENTS[id];
  const st = agentStats(d, id);
  const events = Object.entries(ROUTES).filter(([, v]) => v === id).map(([e]) => e);
  return (
    <section className="card flex flex-col p-5">
      <div className="flex items-start gap-3">
        <AgentAvatar id={id} size={42} active={st.approvals > 0} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2"><h3 className="truncate text-[15px] font-semibold">{a.name}</h3><span className="latin text-[10.5px] font-semibold tracking-wider text-tx3">{a.pillar}</span></div>
          <div className="latin truncate text-[11.5px] text-tx3">{a.nameEn}</div>
        </div>
      </div>
      <p className="mt-3 text-[12.5px] leading-6 text-tx2">{a.role}</p>
      <ul className="mt-3 space-y-1 text-[12px] text-tx2">
        {a.responsibilities.map((r) => <li key={r} className="flex gap-2"><Check size={13} className="mt-1 shrink-0" style={{ color: a.color }} />{r}</li>)}
      </ul>
      <div className="mt-3">
        <div className="mb-1.5 text-[11px] text-tx3">الصلاحيات (تُفرض في المحرك)</div>
        <div className="flex flex-wrap gap-1">
          {a.permissions.map((p) => (
            <span key={p} className={cls("latin rounded-md border px-1.5 py-0.5 text-[10.5px]", a.approvals.includes(p) ? "border-warn/30 text-warn" : "border-line2 text-tx2")}>
              {a.approvals.includes(p) && <Lock size={9} className="ml-1 inline" />}{p}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 text-[11px] text-tx3">يستقبل: {events.map((e) => EVENT_LABEL[e]).join("، ")}</div>
      <div className="mt-auto grid grid-cols-4 gap-2 border-t hairline pt-3 text-center">
        <div><div className="latin text-[16px] font-semibold">{st.completed}</div><div className="text-[10.5px] text-tx3">مكتملة</div></div>
        <div><div className={cls("latin text-[16px] font-semibold", st.approvals && "text-warn")}>{st.approvals}</div><div className="text-[10.5px] text-tx3">اعتماد</div></div>
        <div><div className={cls("latin text-[16px] font-semibold", st.failed && "text-bad")}>{st.failed}</div><div className="text-[10.5px] text-tx3">تعذّرت</div></div>
        <div><div className="text-[11.5px] font-medium leading-5 text-tx2">{st.last ? ago(st.last.createdAt) : "—"}</div><div className="text-[10.5px] text-tx3">آخر مهمة</div></div>
      </div>
    </section>
  );
}

const COLS: TaskStatus[] = ["pending", "processing", "requires_approval", "completed", "failed"];

function TaskBoard() {
  const d = useData();
  return (
    <Card className="mt-3" title="لوحة مهام الوكلاء" subtitle="قيد الانتظار · قيد التنفيذ · تتطلب اعتمادًا · مكتملة · تعذّرت">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {COLS.map((c) => {
          const all = d.tasks.filter((t) => t.status === c);
          const rows = all.slice(0, c === "requires_approval" ? 6 : 5);
          return (
            <div key={c} className="min-w-0 rounded-xl bg-white/[0.02] p-2.5">
              <div className="mb-2 flex items-center justify-between px-1"><TaskBadge status={c} /><span className="latin text-[12px] text-tx3">{all.length}</span></div>
              <div className="space-y-2">
                {rows.length ? rows.map((t) => <TaskCard key={t.id} t={t} />) : <div className="rounded-lg border border-dashed border-line px-2 py-5 text-center text-[11.5px] text-tx3">{c === "processing" || c === "pending" ? "لا شيء معلق — الأحداث عولجت فورًا" : "لا مهام"}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TaskCard({ t }: { t: AgentTask }) {
  return (
    <div className={cls("rounded-lg border bg-s2 p-2.5", t.status === "requires_approval" ? "border-warn/25" : "hairline")}>
      <div className="flex items-center gap-2">
        <AgentAvatar id={t.agent} size={22} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{t.title}</span>
      </div>
      <div className="mt-1 line-clamp-2 text-[11.5px] leading-5 text-tx3">{t.outcome ?? t.detail}</div>
      {t.status === "requires_approval" && (
        <>
          {t.reasoning && <ul className="mt-1.5 space-y-0.5 text-[11px] text-tx2">{t.reasoning.slice(0, 3).map((r) => <li key={r} className="line-clamp-1">• {r}</li>)}</ul>}
          <div className="mt-2 flex gap-1.5">
            <button onClick={() => act.approve(t.id)} className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg bg-brand text-[11.5px] font-medium text-white hover:bg-brand2"><ShieldCheck size={12} />اعتماد</button>
            <button onClick={() => act.decline(t.id)} className="flex h-7 items-center justify-center gap-1 rounded-lg border border-line2 px-2 text-[11.5px] text-tx2 hover:text-tx"><X size={12} />رفض</button>
          </div>
        </>
      )}
      <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-tx3"><span>{AGENTS[t.agent].name}</span><span>{ago(t.createdAt)}</span></div>
    </div>
  );
}

function AuditSection() {
  const d = useData();
  const [f, setF] = useState<"all" | "agents" | "staff" | "doctor">("all");
  const rows = d.audit.filter((a) => f === "all" || (f === "agents" ? a.actor in AGENTS : f === "staff" ? a.actor === "staff" || a.actor === "patient" : a.actor === "doctor")).slice(0, 40);
  return (
    <div id="audit" className="scroll-mt-20">
      <Card className="mt-3" title="سجل التدقيق" subtitle="كل إجراء نفّذه وكيل أو موظف أو طبيب — الوقت والحدث والمنفّذ والنتيجة" action={<Tabs value={f} onChange={setF} items={[{ id: "all", label: "الكل" }, { id: "agents", label: "الوكلاء" }, { id: "staff", label: "العيادة والمرضى" }, { id: "doctor", label: "الطبيب" }]} />}>
        <AuditTable rows={rows} />
        <div className="mt-3 text-[11.5px] text-tx3">يعرض آخر 40 سجلًا من {num(d.audit.length)} · المنفّذون: {[...new Set(d.audit.slice(0, 200).map((a) => ACTOR_LABEL[a.actor]))].join("، ")}</div>
      </Card>
    </div>
  );
}

