"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, CircleAlert, FastForward, Play, RotateCcw, StepForward, ShieldCheck, ArrowLeft, MessageCircle, Watch } from "lucide-react";
import type { AgentId, AgentTask, Appointment } from "@/types";
import { useData, useStore } from "@/lib/store";
import { act } from "@/lib/store/actions";
import { DEMO_STEPS } from "@/lib/engine/demo";
import { kpis, snapshot } from "@/lib/engine/kpis";
import { AGENTS, AGENT_ORDER, CHANNEL, ROUTES, SPECIALTY } from "@/lib/constants";
import { fmtDayTime, fmtTime } from "@/lib/time";
import { cls, num, omr, pct } from "@/lib/format";
import { AgentAvatar, ApptBadge, Badge, Button, Card, DemoTag, PageHeader, SimTag, TaskBadge } from "@/components/ui";
import { AuditTable } from "@/components/audit";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function DemoPage() {
  const d = useData();
  const step = d.demo.step;
  const [busy, setBusy] = useState<number | null>(null);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const runStep = async (n: number, auto = false) => {
    setBusy(n);
    await sleep(auto ? 1100 : 850);
    const ok = act.demoStep(n, auto);
    await sleep(250);
    if (alive.current) setBusy(null);
    return ok && !useStore.getState().data.demo.error && useStore.getState().data.demo.step === n;
  };

  const next = async () => {
    if (running.current || step >= 8) return;
    running.current = true;
    await runStep(step + 1);
    running.current = false;
  };

  const runAll = async () => {
    if (running.current) return;
    running.current = true;
    if (useStore.getState().data.demo.step >= 8) { act.resetAll(); await sleep(300); }
    for (let n = useStore.getState().data.demo.step + 1; n <= 8; n++) {
      const ok = await runStep(n, true);
      if (!ok) break;
      await sleep(350);
    }
    running.current = false;
  };

  const reset = () => { if (!running.current) act.resetAll(); };

  const q = d.inquiries.find((x) => x.id === d.demo.inquiryId);
  const thread = d.messages.filter((m) => m.threadId === d.demo.inquiryId);
  const runTasks = d.tasks.filter((t) => t.demo);
  const runAudit = d.audit.filter((a) => a.demo);
  const held = d.events.filter((e) => e.held && !e.processed);
  const approval = d.tasks.find((t) => t.id === d.demo.approvalTaskId);
  const current = DEMO_STEPS[Math.min(step, 7)];
  const busyAgent = busy ? DEMO_STEPS[busy - 1].agent : null;

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="Live Operational Journey"
        title="رحلة تشغيل ذكية متكاملة"
        subtitle="استفسار واحد يعبر وكلاء طود: فهم، حجز، تأكيد، إلغاء، استرداد، ثم نتيجة موثّقة. كل خطوة تغيير فعلي في بيانات المنظومة يظهر فورًا في المواعيد وسجل المريضة ولوحة القيادة."
        actions={<>
          <Button variant="secondary" icon={<StepForward size={15} />} onClick={next} disabled={busy !== null || step >= 8}>الخطوة التالية</Button>
          <Button variant="primary" icon={<FastForward size={15} />} onClick={runAll} disabled={busy !== null}>{step >= 8 ? "إعادة التشغيل كاملة" : "تشغيل الرحلة كاملة"}</Button>
          <Button variant="ghost" icon={<RotateCcw size={15} />} onClick={reset} disabled={busy !== null}>إعادة الضبط</Button>
        </>}
      />

      {/* stepper */}
      <div className="card mb-3 overflow-x-auto p-4">
        <ol className="flex min-w-[980px] items-start">
          {DEMO_STEPS.map((s, i) => {
            const done = step >= s.n;
            const active = busy === s.n;
            const color = s.agent in AGENTS ? AGENTS[s.agent as AgentId].color : "#f2f1ec";
            return (
              <li key={s.n} className="relative flex flex-1 flex-col items-center px-1 text-center">
                {i < DEMO_STEPS.length - 1 && <span className={cls("absolute right-1/2 top-[17px] h-px w-full", step > s.n ? "bg-acc/60" : "bg-white/10")} />}
                <span
                  className={cls("relative z-10 grid h-9 w-9 place-items-center rounded-full border text-[13px] font-semibold transition-colors", done ? "border-acc bg-brand text-white" : active ? "border-acc text-acc" : "border-line2 bg-s2 text-tx3")}
                  style={active ? { boxShadow: `0 0 0 4px ${color}22` } : undefined}
                >
                  {done ? <Check size={16} /> : active ? <span className="pulse-dot h-2 w-2 rounded-full bg-acc" /> : <span className="latin">{s.n}</span>}
                </span>
                <span className={cls("mt-2 text-[12.5px] font-medium leading-5", done || active ? "text-tx" : "text-tx3")}>{s.title}</span>
                <span className="mt-0.5 text-[11px] text-tx3">{s.agent in AGENTS ? AGENTS[s.agent as AgentId].name : s.agent === "patient" ? "المريضة" : s.agent === "staff" ? "فريق العيادة" : "TAWD Intelligence"}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.05]">
          <div className={cls("h-full rounded-full transition-[width] duration-500", busy ? "processing-bar" : "bg-acc")} style={{ width: `${((busy ? busy - 0.5 : step) / 8) * 100}%` }} />
        </div>
      </div>

      {d.demo.error && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-bad/30 bg-bad/[0.07] px-4 py-3 text-[13px] text-bad">
          <CircleAlert size={16} /> <span className="flex-1">{d.demo.error}</span>
          <Link href="/operations" className="rounded-lg border border-bad/30 px-3 py-1">صفحة العمليات</Link>
          <Button size="sm" variant="danger" onClick={next}>إعادة المحاولة</Button>
        </div>
      )}

      {step === 0 && busy === null ? (
        <StartPanel onStart={next} onRunAll={runAll} />
      ) : (
        <div className="grid gap-3 xl:grid-cols-12">
          {/* conversation */}
          <Card className="xl:col-span-4" title="محادثة المريضة" subtitle={q ? <span>{q.name} · {CHANNEL[q.channel]} · {d.campaigns.find((c) => c.id === q.campaignId)?.name}</span> : "—"} tag={<SimTag label="قناة محاكاة" />} bodyClass="p-0">
            <div className="flex h-[440px] flex-col gap-2.5 overflow-y-auto bg-[#0c0c0c] px-4 py-4">
              {thread.map((m) => (
                <div key={m.id} className={cls("fade-up max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-6", m.from === "patient" ? "self-start rounded-tr-md bg-s3" : m.from === "system" ? "self-center max-w-full border border-dashed border-line2 bg-transparent text-[12px] text-tx3" : "self-end rounded-tl-md border border-acc/20 bg-acc/[0.08]")}>
                  {m.from === "sura" && <div className="mb-0.5 text-[11px] font-semibold text-acc">سُرى</div>}
                  <div>{m.text}</div>
                  {m.card && (
                    <div className="mt-2 rounded-xl border border-line2 bg-bg/60 p-3">
                      <div className="mb-1 text-[11.5px] font-semibold text-acc">{m.card.title}</div>
                      {m.card.lines.map((l) => <div key={l} className="text-[12.5px] text-tx2">{l}</div>)}
                    </div>
                  )}
                  <div className="mt-1 text-left text-[10.5px] text-tx3"><span className="latin">{fmtTime(m.at)}</span>{m.mode === "simulated" && " · محاكاة"}{m.mode === "rule" && " · قواعد"}</div>
                </div>
              ))}
              {busy && busyAgent && busyAgent !== "patient" && busyAgent !== "staff" && busyAgent !== "orchestrator" && (
                <div className="self-end rounded-2xl border border-acc/20 bg-acc/[0.05] px-3 py-2 text-[12px] text-acc">
                  <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-acc" /> {AGENTS[busyAgent].name} ينفّذ…
                </div>
              )}
            </div>
          </Card>

          {/* agent execution */}
          <Card className="xl:col-span-4" title="تنفيذ الوكلاء" subtitle="TAWD Intelligence يوجّه كل حدث إلى وكيل واحد بصلاحيات محددة">
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-paper/15 bg-paper/[0.04] px-3 py-2.5">
              <AgentAvatar id="orchestrator" size={32} active={busy !== null} />
              <div className="min-w-0 flex-1 text-[12.5px]">
                <div className="font-medium">TAWD Intelligence</div>
                <div className="truncate text-tx3">{held.length ? `حدث بانتظار التقدم: ${held.map((e) => e.type).join("، ")}` : busy ? `ينفّذ الخطوة ${busy}: ${DEMO_STEPS[busy - 1].title}` : step >= 8 ? "اكتملت الرحلة — كل الأحداث عولجت" : "جاهز"}</div>
              </div>
            </div>
            <div className="space-y-2">
              {AGENT_ORDER.map((a) => (
                <AgentRow key={a} id={a} tasks={runTasks.filter((t) => t.agent === a)} processing={busyAgent === a || (busy === 7 && a === "recovery")} waiting={held.some((e) => ROUTES[e.type] === a)} />
              ))}
            </div>
          </Card>

          {/* state changes */}
          <div className="grid content-start gap-3 xl:col-span-4">
            <Card title="تغيّر الحالة الفعلي" subtitle="سجلات المواعيد كما هي الآن في المنظومة">
              <div className="space-y-2">
                <ApptLine label="الموعد الأصلي" a={d.appointments.find((x) => x.id === d.demo.apptId)} />
                <ApptLine label="الموعد المحرَّر بعد الملء" a={d.appointments.find((x) => x.id === d.demo.recoveredApptId)} />
                <ApptLine label="الموعد البديل للمريضة" a={d.appointments.find((x) => x.id === d.demo.rescheduledApptId)} />
              </div>
            </Card>
            {approval && approval.status === "requires_approval" && step === 6 && (
              <div className="fade-up rounded-2xl border border-warn/30 bg-warn/[0.06] p-4">
                <div className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold text-warn"><ShieldCheck size={16} /> قرار يتطلب اعتمادًا بشريًا</div>
                <div className="text-[13px] leading-6">{approval.outcome}</div>
                <ul className="mt-2 space-y-1 text-[12px] text-tx2">{approval.reasoning?.map((r) => <li key={r}>• {r}</li>)}</ul>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="primary" onClick={next} disabled={busy !== null}>اعتماد وتنفيذ</Button>
                  <Link href="/agents" className="inline-flex h-8 items-center rounded-xl px-3 text-[12.5px] text-tx2 hover:text-tx">عرض في لوحة الوكلاء</Link>
                </div>
              </div>
            )}
            <DeltaCard />
          </div>
        </div>
      )}

      {step >= 8 && <OutcomePanel />}

      {step > 0 && (
        <Card className="mt-3" title="سجل التدقيق لهذه الرحلة" subtitle="الوقت · الحدث · المنفّذ · الإجراء · النتيجة" tag={<Badge tone="acc">{runAudit.length} سجل</Badge>}>
          <AuditTable rows={runAudit} />
        </Card>
      )}
      <p className="mt-4 text-[11.5px] leading-6 text-tx3">جميع المرضى والرسائل والمبالغ تجريبية. القنوات (واتساب) محاكاة ولا تُرسل رسائل حقيقية. منطق الوكلاء قواعد حتمية قابلة للتدقيق؛ أي تواصل مع مريض أو نقل حجز يمر باعتماد بشري.</p>
      {busy === null && step > 0 && step < 8 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
          <button onClick={next} className="pointer-events-auto flex items-center gap-3 rounded-full border border-acc/30 bg-[#0c1420]/95 px-5 py-3 text-[13.5px] shadow-2xl backdrop-blur hover:border-acc/60">
            <span className="text-tx3">التالي:</span>
            <span className="font-medium">{DEMO_STEPS[step].title}</span>
            <ChevronLeft size={16} className="text-acc" />
          </button>
        </div>
      )}
      <span className="sr-only">{current.title}</span>
    </div>
  );
}

function StartPanel({ onStart, onRunAll }: { onStart: () => void; onRunAll: () => void }) {
  return (
    <div className="grid gap-3 xl:grid-cols-12">
      <div className="card relative overflow-hidden p-7 xl:col-span-7">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative">
          <Badge tone="acc" dot>جاهز للتشغيل</Badge>
          <h2 className="mt-4 text-[24px] font-semibold leading-snug">من رسالة واتساب واحدة إلى موعد مُسترد — دون تدخل يدوي إلا في الاعتماد.</h2>
          <p className="mt-3 max-w-xl text-[14px] leading-7 text-tx2">تصل رسالة من مريضة جديدة تطلب طبيب القلب. ستحجز سُرى ووكيل الجدولة، ثم يؤكد وكيل الحضور. حين تلغي المريضة، يجد وكيل الاسترداد مريضًا من قائمة الانتظار وموعدًا بديلًا، وينتظر اعتمادك قبل التنفيذ.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="primary" size="lg" icon={<Play size={16} />} onClick={onRunAll}>تشغيل الرحلة كاملة</Button>
            <Button size="lg" icon={<StepForward size={16} />} onClick={onStart}>خطوة بخطوة</Button>
          </div>
        </div>
      </div>
      <div className="card p-6 xl:col-span-5">
        <div className="mb-3 text-[13px] font-semibold">ما الذي سيتغير فعليًا؟</div>
        <ul className="space-y-2.5 text-[13px] text-tx2">
          {["سجل مريضة جديد (عميل محتمل من حملة)", "موعد قلب مبدئي ثم مؤكد ثم ملغى", "موعد مُسترد لمريض من قائمة الانتظار", "موعد بديل للمريضة الأصلية", "مؤشرات لوحة القيادة وتحليلات الاسترداد", "سجل تدقيق كامل لكل إجراء"].map((x) => (
            <li key={x} className="flex items-start gap-2"><Check size={15} className="mt-1 shrink-0 text-acc" />{x}</li>
          ))}
        </ul>
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5 text-[12px] text-tx3"><Watch size={14} /> اللحظة الثانية: <Link href="/care" className="text-acc">من السوار إلى الطبيب ←</Link></div>
      </div>
    </div>
  );
}

function AgentRow({ id, tasks, processing, waiting }: { id: AgentId; tasks: AgentTask[]; processing: boolean; waiting: boolean }) {
  const last = tasks[0];
  const a = AGENTS[id];
  return (
    <div className={cls("rounded-xl border px-3 py-2.5 transition-colors", processing ? "border-acc/40 bg-acc/[0.05]" : last ? "hairline bg-s2" : "border-dashed border-line bg-transparent")}>
      <div className="flex items-center gap-3">
        <AgentAvatar id={id} size={32} active={processing} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-medium">{a.name}</span>
            {processing ? <Badge tone="info" dot pulse>قيد التنفيذ</Badge> : waiting ? <Badge tone="muted" dot>قيد الانتظار</Badge> : last ? <TaskBadge status={last.status} /> : <span className="text-[11px] text-tx3">{id === "care" ? "خارج هذا المسار" : "لم يُستدعَ بعد"}</span>}
          </div>
          {last && !processing && <div className="mt-0.5 line-clamp-1 text-[11.5px] text-tx3">{last.outcome}</div>}
        </div>
      </div>
      {processing && <div className="processing-bar mt-2 h-0.5 rounded-full" />}
      {last?.reasoning && !processing && (
        <ul className="mt-2 space-y-0.5 border-t hairline pt-2 text-[11.5px] leading-5 text-tx2">
          {last.reasoning.slice(0, 3).map((r) => <li key={r} className="truncate">• {r}</li>)}
        </ul>
      )}
      {tasks.length > 1 && !processing && <div className="dev-only mt-1 text-[10.5px] text-tx3">{tasks.length} مهام في هذه الرحلة</div>}
    </div>
  );
}

function ApptLine({ label, a }: { label: string; a?: Appointment }) {
  const d = useData();
  if (!a) return (
    <div className="flex items-center justify-between rounded-xl border border-dashed border-line px-3 py-3 text-[12.5px] text-tx3"><span>{label}</span><span>—</span></div>
  );
  const doc = d.doctors.find((x) => x.id === a.doctorId)!;
  const p = d.patients.find((x) => x.id === a.patientId);
  return (
    <div className="fade-up rounded-xl border hairline bg-s2 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-tx3">{label}</span>
        <ApptBadge status={a.status} />
      </div>
      <div className="mt-1.5 text-[13px] font-medium">{p?.name}</div>
      <div className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-tx2"><span>{doc.name}</span><span>·</span><span>{SPECIALTY[doc.specialty]}</span><span>·</span><span>{fmtDayTime(a.start)}</span></div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {a.recovered && <Badge tone="warn">مُسترد من إلغاء</Badge>}
        {a.rescheduledFrom && <Badge tone="info">إعادة جدولة</Badge>}
        {a.confirmation === "sent" && <Badge tone="muted">طلب تأكيد مُرسل (محاكاة)</Badge>}
        <span className="latin dev-only text-[10.5px] text-tx3">{a.id}</span>
      </div>
    </div>
  );
}

function DeltaCard() {
  const d = useData();
  const base = d.demo.baseline;
  const now = useMemo(() => snapshot(d), [d]);
  if (!base) return null;
  const rows: [string, number, number, (n: number) => string][] = [
    ["المواعيد", base.appointments, now.appointments, num],
    ["المؤكدة", base.confirmed, now.confirmed, num],
    ["الملغاة", base.cancelled, now.cancelled, num],
    ["المستردة", base.recovered, now.recovered, num],
    ["الاستفسارات", base.inquiries, now.inquiries, num],
    ["قيمة مستردة", base.recoveredRevenue, now.recoveredRevenue, omr],
  ];
  return (
    <Card title="أثر الرحلة على مؤشرات لوحة القيادة" subtitle="قبل الرحلة ← الآن" tag={<DemoTag />} action={<Link href="/dashboard" className="text-[12px] text-acc">اللوحة ←</Link>}>
      <div className="grid grid-cols-2 gap-2">
        {rows.map(([label, b, n, f]) => (
          <div key={label} className="rounded-xl bg-white/[0.03] px-3 py-2">
            <div className="text-[11.5px] text-tx3">{label}</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="latin num text-[16px] font-semibold">{f(n)}</span>
              {n !== b && <span className={cls("latin text-[11px] font-semibold", label === "الملغاة" ? "text-bad" : "text-ok")}>{n > b ? "+" : ""}{label === "قيمة مستردة" ? Math.round(n - b) : n - b}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[11.5px] text-tx3">معدل التحويل الآن {pct(now.conversion)} (كان {pct(base.conversion)})</div>
    </Card>
  );
}

function OutcomePanel() {
  const d = useData();
  const k = kpis(d);
  const filled = d.appointments.find((x) => x.id === d.demo.recoveredApptId);
  const res = d.appointments.find((x) => x.id === d.demo.rescheduledApptId);
  const links: [string, string][] = [
    ["المواعيد", "/appointments?q=" + encodeURIComponent("السيابية")],
    ["سجل المريضة", `/patients?id=${d.demo.patientId}`],
    ["لوحة القيادة", "/dashboard"],
    ["نشاط الوكلاء", "/agents"],
    ["سجل التدقيق", "/agents#audit"],
    ["تحليلات الاسترداد", "/growth#recovery"],
  ];
  return (
    <div className="fade-up mt-3 overflow-hidden rounded-[18px] bg-paper text-ink">
      <div className="grid gap-6 p-6 md:grid-cols-12 md:p-7">
        <div className="md:col-span-7">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-[#064b93]"><span className="grid h-5 w-5 place-items-center rounded-full bg-[#064b93] text-white"><Check size={12} /></span> اكتملت الرحلة ووُثّقت</div>
          <h3 className="mt-3 text-[22px] font-semibold leading-snug">إلغاء تحوّل إلى موعدين مؤكدين: مريض من قائمة الانتظار ملأ الموعد المحرَّر، والمريضة أعيدت جدولتها.</h3>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-black/[0.05] p-3"><div className="text-[11.5px] text-black/55">قيمة مستردة</div><div className="latin mt-1 text-[22px] font-semibold">{filled?.price ?? 0} <span className="text-[13px]">OMR</span></div></div>
            <div className="rounded-xl bg-black/[0.05] p-3"><div className="text-[11.5px] text-black/55">وكلاء شاركوا</div><div className="latin mt-1 text-[22px] font-semibold">{new Set(d.tasks.filter((t) => t.demo).map((t) => t.agent)).size}</div></div>
            <div className="rounded-xl bg-black/[0.05] p-3"><div className="text-[11.5px] text-black/55">نسبة الاسترداد الآن</div><div className="latin mt-1 text-[22px] font-semibold">{pct(k.recoveryRate)}</div></div>
          </div>
          <div className="mt-4 space-y-1 text-[13px] text-black/70">
            {filled && <div>• {d.patients.find((p) => p.id === filled.patientId)?.name} — {fmtDayTime(filled.start)} (مُسترد)</div>}
            {res && <div>• {d.patients.find((p) => p.id === res.patientId)?.name} — {fmtDayTime(res.start)} (موعد بديل)</div>}
          </div>
        </div>
        <div className="md:col-span-5">
          <div className="mb-2 text-[12px] font-semibold text-black/55">النتيجة ظاهرة الآن في:</div>
          <div className="grid grid-cols-2 gap-2">
            {links.map(([l, h]) => (
              <Link key={l} href={h} className="flex items-center justify-between rounded-xl border border-black/10 bg-white px-3 py-2.5 text-[13px] hover:border-black/30">
                {l}<ArrowLeft size={14} className="text-black/40" />
              </Link>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-black/55"><MessageCircle size={13} /> الرسائل محاكاة · المبالغ تقديرية · المرضى وهميون</div>
        </div>
      </div>
    </div>
  );
}
