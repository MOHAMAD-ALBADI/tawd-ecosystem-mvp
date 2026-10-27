"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowLeft, Building2, CalendarCheck2, HeartPulse, Layers, Megaphone, PlugZap, Sparkles, Stethoscope, Watch, Workflow, Smartphone, MonitorPlay } from "lucide-react";
import { useData } from "@/lib/store";
import { kpis } from "@/lib/engine/kpis";
import { AGENTS, AGENT_ORDER, ACTOR_LABEL } from "@/lib/constants";
import { ago } from "@/lib/time";
import { cls, num, pct } from "@/lib/format";
import { AgentAvatar, Badge, Button, DemoTag } from "@/components/ui";

export default function OverviewPage() {
  const d = useData();
  const k = useMemo(() => kpis(d), [d]);
  const latest = d.audit.find((a) => a.actor in AGENTS);
  const pillars = [
    {
      id: "GROW", title: "TAWD Grow", ar: "النمو والاكتساب", icon: Megaphone, href: "/growth", color: "#c9b58a",
      text: "الحملات، نسب الاستفسارات، التحويل، وإعادة تنشيط المرضى.",
      stats: [["استفسارات", num(k.inquiries)], ["تحويل", pct(k.conversion)], ["غير نشطين", num(k.inactive)]],
      agents: ["growth"] as const,
    },
    {
      id: "OPERATE", title: "TAWD Operate", ar: "التشغيل والتنفيذ", icon: Building2, href: "/operations", color: "#8ea8c3",
      text: "المواعيد، الطابور، الفوترة، تأكيد الحضور، واسترداد الإلغاءات.",
      stats: [["مواعيد اليوم", num(k.todayTotal)], ["مؤكدة", num(k.confirmed)], ["مستردة", num(k.recovered)]],
      agents: ["sura", "scheduling", "attendance", "recovery"] as const,
    },
    {
      id: "CARE", title: "TAWD Care", ar: "الرعاية المستمرة", icon: HeartPulse, href: "/care", color: "#d08a80",
      text: "تطبيق المريض، الانتظار الذكي، السوار المتصل، ومتابعة الطبيب.",
      stats: [["مسجّلون", num(k.enrolled)], ["بحاجة لمراجعة", num(k.needsReview)], ["قراءات", num(d.readings.length)]],
      agents: ["care"] as const,
    },
  ];
  const chain = [
    ["حدث", "إلغاء، استفسار، قراءة سوار"],
    ["فهم", "تحديد النية والسياق"],
    ["قرار معتمد", "قواعد + صلاحيات + اعتماد بشري"],
    ["إجراء", "حجز، ملء موعد، إحالة طبيب"],
    ["نتيجة موثّقة", "مؤشرات وسجل تدقيق"],
  ];

  return (
    <div className="fade-up">
      <section className="card relative overflow-hidden px-6 py-8 md:px-10 md:py-10">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" />
        <div className="pointer-events-none absolute -left-32 -top-40 h-96 w-96 rounded-full bg-acc/[0.06] blur-3xl" />
        <div className="relative grid gap-8 xl:grid-cols-12">
          <div className="xl:col-span-7">
            <div className="flex flex-wrap items-center gap-2"><Badge tone="ok" dot pulse>المنظومة تعمل</Badge><DemoTag label="بيئة عرض — بيانات تجريبية" /></div>
            <h1 className="mt-5 text-[34px] font-semibold leading-[1.25] md:text-[44px]">طود منظومة ذكية لإدارة العيادات وتشغيلها وتنمية أعمالها.</h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-8 text-tx2">ليست تطبيق حجز ولا روبوت محادثة ولا لوحة تحكم ولا سوارًا منفصلًا — بل نظام واحد متصل: كل حدث في العيادة يتحول إلى قرار معتمد، ثم إجراء، ثم نتيجة موثّقة.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/demo"><Button variant="primary" size="lg" icon={<MonitorPlay size={17} />}>شاهد رحلة تشغيل حيّة</Button></Link>
              <Link href="/dashboard"><Button size="lg">لوحة القيادة</Button></Link>
            </div>
          </div>
          <div className="xl:col-span-5">
            <div className="grid grid-cols-2 gap-2">
              <Big label="مواعيد في الفترة" v={num(k.total)} />
              <Big label="استرداد الإلغاءات" v={pct(k.recoveryRate)} />
              <Big label="مهام وكلاء مكتملة" v={num(k.tasksCompleted)} />
              <Big label="بانتظار الاعتماد" v={num(k.approvals)} warn={k.approvals > 0} />
            </div>
            {latest && (
              <div className="mt-2 flex items-center gap-3 rounded-xl border hairline bg-s2 px-3 py-2.5">
                <AgentAvatar id={latest.actor as keyof typeof AGENTS} size={30} />
                <div className="min-w-0 flex-1 text-[12.5px]"><div className="truncate">{latest.action}</div><div className="truncate text-[11.5px] text-tx3">{ACTOR_LABEL[latest.actor]} · {latest.outcome} · {ago(latest.at)}</div></div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* pillars + intelligence */}
      <section className="mt-3">
        <div className="grid gap-3 lg:grid-cols-3">
          {pillars.map((p) => (
            <Link key={p.id} href={p.href} className="card group flex flex-col p-6 transition-colors hover:border-white/15">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${p.color}18`, color: p.color }}><p.icon size={19} /></span>
                <ArrowLeft size={16} className="text-tx3 transition-colors group-hover:text-tx" />
              </div>
              <div className="latin mt-5 text-[12px] font-semibold tracking-[0.16em]" style={{ color: p.color }}>{p.title.toUpperCase()}</div>
              <div className="mt-1 text-[20px] font-semibold">{p.ar}</div>
              <p className="mt-2 text-[13px] leading-6 text-tx2">{p.text}</p>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t hairline pt-4">
                {p.stats.map(([l, v]) => <div key={l}><div className="latin text-[19px] font-semibold">{v}</div><div className="text-[11px] text-tx3">{l}</div></div>)}
              </div>
              <div className="mt-4 flex gap-1.5">{p.agents.map((a) => <AgentAvatar key={a} id={a} size={26} />)}</div>
            </Link>
          ))}
        </div>
        <div className="relative mt-3 overflow-hidden rounded-[18px] bg-paper p-6 text-ink md:p-7">
          <div className="grid items-center gap-6 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <div className="flex items-center gap-2"><Workflow size={18} /><span className="latin text-[13px] font-semibold tracking-[0.16em]">TAWD INTELLIGENCE</span></div>
              <div className="mt-2 text-[20px] font-semibold leading-snug">طبقة تنسيق واحدة تربط الأحداث بالقرارات والإجراءات والنتائج.</div>
              <div className="mt-3 flex gap-1.5">{AGENT_ORDER.map((a) => <span key={a} className="grid h-7 w-7 place-items-center rounded-lg text-[11px] font-semibold text-white" style={{ background: AGENTS[a].color }}>{AGENTS[a].name.replace("وكيل ", "").slice(0, 1)}</span>)}</div>
            </div>
            <ol className="grid gap-2 sm:grid-cols-5 lg:col-span-8">
              {chain.map(([t, s], i) => (
                <li key={t} className="relative rounded-xl bg-black/[0.05] px-3 py-3">
                  <div className="latin text-[11px] text-black/45">0{i + 1}</div>
                  <div className="mt-1 text-[14px] font-semibold">{t}</div>
                  <div className="mt-0.5 text-[11.5px] leading-5 text-black/55">{s}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="mt-3 grid gap-3 lg:grid-cols-12">
        <div className="card p-6 lg:col-span-7">
          <div className="text-[15px] font-semibold">المشكلة التي يحلها طود: التشتت التشغيلي</div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              ["استفسار بلا رد سريع", "سُرى ترد وتحجز خلال دقائق", Sparkles],
              ["حجز بلا تأكيد", "وكيل الحضور يطلب ويسجّل التأكيد", CalendarCheck2],
              ["إلغاء يترك الموعد فارغًا", "وكيل الاسترداد يملؤه من قائمة الانتظار", Layers],
              ["لا متابعة بعد الزيارة", "النمو والرعاية المتصلة يتابعان", Stethoscope],
            ].map(([a, b, I]) => {
              const Icon = I as typeof Sparkles;
              return (
                <div key={a as string} className="rounded-xl bg-white/[0.03] p-4">
                  <div className="text-[13px] text-bad/90 line-through decoration-bad/40">{a as string}</div>
                  <div className="mt-1.5 flex items-center gap-2 text-[13.5px]"><Icon size={15} className="text-acc" />{b as string}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card p-6 lg:col-span-5">
          <div className="text-[15px] font-semibold">نموذجا التشغيل</div>
          <div className="mt-4 space-y-2">
            <Model active icon={<Building2 size={17} />} title="Full Clinic OS" text="نظام تشغيل كامل للعيادة: المواعيد والمرضى والفوترة والوكلاء والرعاية المتصلة." note="هذا العرض" />
            <Model icon={<PlugZap size={17} />} title="Intelligent Operations Layer" text="طبقة ذكاء فوق نظام العيادة القائم عبر واجهات برمجية مصرّح بها — تتطلب تكاملًا معتمدًا." note="يتطلب تكاملًا" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11.5px]">
            <Link href="/patient-app" className="rounded-xl border hairline bg-s2 px-2 py-3 hover:border-white/15"><Smartphone size={16} className="mx-auto mb-1 text-acc" />تطبيق المريض</Link>
            <Link href="/care" className="rounded-xl border hairline bg-s2 px-2 py-3 hover:border-white/15"><Watch size={16} className="mx-auto mb-1 text-acc" />السوار المتصل</Link>
            <Link href="/doctor" className="rounded-xl border hairline bg-s2 px-2 py-3 hover:border-white/15"><Stethoscope size={16} className="mx-auto mb-1 text-acc" />لوحة الطبيب</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Big({ label, v, warn }: { label: string; v: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border hairline bg-s2 px-4 py-4">
      <div className={cls("latin text-[30px] font-semibold leading-none", warn && "text-warn")}>{v}</div>
      <div className="mt-2 text-[12px] text-tx3">{label}</div>
    </div>
  );
}

function Model({ icon, title, text, note, active }: { icon: React.ReactNode; title: string; text: string; note: string; active?: boolean }) {
  return (
    <div className={cls("rounded-xl border p-4", active ? "border-acc/30 bg-acc/[0.05]" : "hairline bg-s2")}>
      <div className="flex items-center justify-between gap-2"><span className="latin flex items-center gap-2 text-[14px] font-semibold"><span className={active ? "text-acc" : "text-tx2"}>{icon}</span>{title}</span><Badge tone={active ? "acc" : "muted"}>{note}</Badge></div>
      <p className="mt-1.5 text-[12.5px] leading-6 text-tx2">{text}</p>
    </div>
  );
}
