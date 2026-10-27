"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, BadgeCheck, CalendarCheck2, CalendarClock, CalendarX2, CircleDollarSign, HeartPulse, MessageSquareText, RefreshCcw, Sparkles, Stethoscope, Target, Watch, Workflow, ArrowUpLeft, UserSearch,
} from "lucide-react";
import { useData } from "@/lib/store";
import { act } from "@/lib/store/actions";
import { agentActivity, agentStats, dailyTrend, funnel, kpis, recoveryWeekly, revenueBreakdown } from "@/lib/engine/kpis";
import { AGENTS, AGENT_ORDER, SPECIALTY } from "@/lib/constants";
import { num, omr, pct } from "@/lib/format";
import { SLOT_TIMES, ago, sameDay } from "@/lib/time";
import { AgentAvatar, Button, Card, DemoTag, Kpi, Meter, PageHeader } from "@/components/ui";
import { AreaTrend, Bars, ColoredBars, Funnel } from "@/components/charts";
import { EventFeed } from "@/components/audit";

export default function DashboardPage() {
  const d = useData();
  const router = useRouter();
  const k = useMemo(() => kpis(d), [d]);
  const trend = useMemo(() => dailyTrend(d), [d]);
  const fn = useMemo(() => funnel(d), [d]);
  const rev = useMemo(() => revenueBreakdown(d), [d]);
  const rec = useMemo(() => recoveryWeekly(d), [d]);
  const act7 = useMemo(() => agentActivity(d), [d]);

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="Executive Dashboard"
        title="لوحة القيادة التنفيذية"
        subtitle={<>أداء {d.clinic.name} خلال آخر 14 يومًا والأيام الستة القادمة. كل رقم محسوب من سجلات المواعيد والاستفسارات والفواتير ومهام الوكلاء — <span className="text-warn">بيانات تجريبية</span>.</>}
        actions={<>
          <Button icon={<Sparkles size={15} />} variant="primary" onClick={() => router.push("/demo")}>تشغيل الرحلة الذكية</Button>
          <Button icon={<CalendarClock size={15} />} onClick={() => router.push("/appointments?new=1")}>موعد جديد</Button>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="إجمالي المواعيد" value={num(k.total)} icon={<CalendarClock size={16} />} tone="muted" hint={<span>{num(k.upcoming)} قادمة · {num(k.completed)} مكتملة</span>} />
        <Kpi label="مواعيد مؤكدة" value={num(k.confirmed)} icon={<CalendarCheck2 size={16} />} tone="ok" hint="مؤكدة أو في العيادة الآن" />
        <Kpi label="بانتظار تأكيد الحضور" value={num(k.pending)} icon={<BadgeCheck size={16} />} tone="warn" hint={<span>{omr(k.revenuePending)} معرّضة للخطر</span>} />
        <Kpi label="مواعيد ملغاة" value={num(k.cancelled)} icon={<CalendarX2 size={16} />} tone="bad" hint={<span>{omr(k.lostRevenue)} غير مستردة</span>} />
        <Kpi label="مواعيد مستردة" value={num(k.recovered)} icon={<RefreshCcw size={16} />} tone="acc" delta={{ value: pct(k.recoveryRate) }} hint="من الإلغاءات" />
        <Kpi label="الإيرادات التقديرية للمواعيد" value={<span>{num(k.revenue)}<span className="mr-1 text-[15px] text-tx3">ر.ع.</span></span>} icon={<CircleDollarSign size={16} />} tone="acc" hint={<DemoTag />} />
        <Kpi label="استفسارات المرضى" value={num(k.inquiries)} icon={<MessageSquareText size={16} />} tone="info" hint={<span>{k.inquiriesOpen} بانتظار الرد</span>} />
        <Kpi label="تحويل الاستفسار إلى حجز" value={pct(k.conversion)} icon={<Target size={16} />} tone="ok" hint={<span>{num(k.booked)} حجزًا من الاستفسارات</span>} />
        <Kpi label="مسارات ذكية نشطة" value={num(k.activeWorkflows)} icon={<Workflow size={16} />} tone="info" hint={<span>{k.approvals} تتطلب اعتمادًا · {k.tasksToday} مهمة اليوم</span>} />
        <Kpi label="مرضى بحاجة لمراجعة طبيب" value={num(k.needsReview)} icon={<Stethoscope size={16} />} tone={k.needsReview ? "bad" : "ok"} hint="من قراءات السوار (قواعد توضيحية)" />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="اتجاه المواعيد اليومي" subtitle="محجوز · مكتمل · ملغى — الخط المتقطع يفصل الماضي عن الجدول القادم" tag={<DemoTag />}>
          <AreaTrend data={trend} todayLabel="اليوم" height={250} series={[
            { key: "booked", name: "محجوز", color: "#5c9de8" },
            { key: "completed", name: "مكتمل", color: "#8ea8c3" },
            { key: "cancelled", name: "ملغى", color: "#e07f74" },
          ]} />
        </Card>
        <Card title="قمع التحويل" subtitle="من الاستفسار إلى الحضور" action={<Link href="/growth" className="text-[12px] text-acc">النمو ←</Link>}>
          <Funnel data={fn} />
          <div className="mt-4 flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2.5 text-[12px] text-tx2">
            <span>متوسط زمن رد سُرى</span>
            <span className="latin font-semibold text-tx">{k.responseMin < 1 ? "< 1" : k.responseMin.toFixed(1)} min</span>
          </div>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card title="فرص الإيرادات" subtitle="محصّل · مستحق · مجدول · معرّض للخطر" tag={<DemoTag />}>
          <ColoredBars data={rev} height={210} unit="ر.ع." />
        </Card>
        <Card title="استرداد الإلغاءات" subtitle={`${pct(k.recoveryRate)} من الإلغاءات استُردت · ${omr(k.recoveredRevenue)} قيمة مستردة`}>
          <Bars data={rec} xKey="week" height={210} series={[{ key: "cancelled", name: "إلغاءات", color: "#4a4a4a" }, { key: "recovered", name: "مستردة", color: "#d6a85c" }]} />
        </Card>
        <Card title="نشاط وكلاء الذكاء" subtitle="مهام منفّذة يوميًا لكل وكيل" action={<Link href="/agents" className="text-[12px] text-acc">الوكلاء ←</Link>}>
          <Bars data={act7} stacked height={210} series={AGENT_ORDER.map((a) => ({ key: a, name: AGENTS[a].name, color: AGENTS[a].color }))} />
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-5" title="آخر الأحداث" subtitle="ما نفّذته المنظومة فعليًا — من سجل التدقيق" action={<Link href="/agents#audit" className="text-[12px] text-acc">السجل الكامل ←</Link>}>
          <EventFeed rows={d.audit} limit={7} />
        </Card>
        <div className="grid gap-3 xl:col-span-4">
          <Card title="حالة TAWD Intelligence" subtitle="طبقة التنسيق بين الوكلاء الستة">
            <div className="grid grid-cols-3 gap-2">
              {AGENT_ORDER.map((a) => {
                const st = agentStats(d, a);
                const recent = st.last && Date.now() - new Date(st.last.createdAt).getTime() < 10 * 60000;
                return (
                  <Link key={a} href="/agents" className="flex flex-col items-center gap-1.5 rounded-xl border hairline bg-s2 px-2 py-3 text-center hover:border-white/15">
                    <AgentAvatar id={a} size={30} active={!!recent || st.approvals > 0} />
                    <span className="line-clamp-1 text-[11px] text-tx2">{AGENTS[a].name.replace("وكيل ", "")}</span>
                    <span className="latin num text-[11px] text-tx3">{st.completed}{st.approvals ? <span className="text-warn"> · {st.approvals}!</span> : null}</span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-[12px] text-tx3">
              <span className="flex items-center gap-1.5"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-ok" />يعمل · آخر حدث {d.audit[0] ? ago(d.audit[0].at) : "—"}</span>
              <span>{num(k.tasksCompleted)} مهمة مكتملة</span>
            </div>
          </Card>
          <Card title="إجراءات سريعة">
            <div className="grid grid-cols-2 gap-2">
              <QuickAction icon={<MessageSquareText size={15} />} label="محاكاة استفسار وارد" onClick={() => {
                const names = ["سعاد الريامية", "مازن الشحي", "هدى العامرية", "بدر الفارسي"];
                act.submitInquiry({ name: names[d.inquiries.length % names.length], channel: "instagram", campaignId: "c1", text: "مرحبا، أبغى موعد تنظيف أسنان" });
              }} />
              <QuickAction icon={<UserSearch size={15} />} label="فحص المرضى غير النشطين" onClick={() => act.scanInactive()} />
              <QuickAction icon={<Watch size={15} />} label="قراءة سوار تتطلب مراجعة" onClick={() => { act.setSim({ tick: 6, patientId: "p1", mode: "review" }); act.addReading("p1", "review"); }} />
              <QuickAction icon={<Activity size={15} />} label="رحلة التشغيل الكاملة" onClick={() => router.push("/demo")} />
            </div>
          </Card>
        </div>
        <Card className="xl:col-span-3" title="أداء العيادة اليوم" subtitle="إشغال جدول كل طبيب">
          <div className="space-y-4">
            {d.doctors.map((doc) => {
              const today = d.appointments.filter((a) => a.doctorId === doc.id && sameDay(a.start, new Date()) && a.status !== "cancelled");
              const done = today.filter((a) => a.status === "completed").length;
              return (
                <div key={doc.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="truncate">{doc.name}</span>
                    <span className="latin num shrink-0 text-tx3">{today.length}/{SLOT_TIMES.length}</span>
                  </div>
                  <Meter value={today.length / SLOT_TIMES.length} tone={doc.available ? "acc" : "muted"} />
                  <div className="mt-1 flex justify-between text-[11px] text-tx3"><span>{SPECIALTY[doc.specialty]}</span><span>{done} مكتملة</span></div>
                </div>
              );
            })}
            <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5 text-[12px] text-tx2"><HeartPulse size={14} className="text-bad" />{k.enrolled} مرضى في برنامج الرعاية المتصلة</div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex min-h-[64px] flex-col items-start justify-between gap-2 rounded-xl border hairline bg-s2 p-3 text-right text-[12.5px] leading-5 hover:border-acc/30 hover:bg-s3">
      <span className="flex w-full items-center justify-between text-acc">{icon}<ArrowUpLeft size={13} className="text-tx3 group-hover:text-acc" /></span>
      <span>{label}</span>
    </button>
  );
}
