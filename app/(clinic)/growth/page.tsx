"use client";
import { useMemo, useState } from "react";
import { Megaphone, MessageSquareText, Repeat2, Target, TrendingUp, CircleDollarSign, RefreshCcw, UserSearch, ShieldCheck, X, Plus } from "lucide-react";
import type { Channel, Specialty } from "@/types";
import { useData } from "@/lib/store";
import { act } from "@/lib/store/actions";
import { campaignStats, funnel, inquiryTrend, kpis, leadSources, recoveryWeekly } from "@/lib/engine/kpis";
import { CHANNEL, SPECIALTY } from "@/lib/constants";
import { ago, fmtDate, fmtDayTime } from "@/lib/time";
import { cls, num, omr, pct } from "@/lib/format";
import { AgentAvatar, Badge, Button, Card, DemoTag, Dialog, Field, Kpi, Meter, PageHeader, SimTag, inputCls } from "@/components/ui";
import { AreaTrend, Bars, Donut, Funnel } from "@/components/charts";

const OUT_STATUS = { draft: ["مسودة", "warn"], approved: ["معتمدة", "info"], sent_sim: ["أُرسلت (محاكاة)", "info"], responded: ["ردّ المريض", "ok"], no_response: ["لا رد", "muted"], discarded: ["مرفوضة", "muted"] } as const;

export default function GrowthPage() {
  const d = useData();
  const k = useMemo(() => kpis(d), [d]);
  const camps = useMemo(() => campaignStats(d), [d]);
  const trend = useMemo(() => inquiryTrend(d), [d]);
  const sources = useMemo(() => leadSources(d), [d]);
  const rec = useMemo(() => recoveryWeekly(d), [d]);
  const fn = useMemo(() => funnel(d), [d]);
  const [open, setOpen] = useState(false);
  const spend = camps.reduce((n, c) => n + c.budget, 0);
  const attributed = camps.reduce((n, c) => n + c.revenue, 0);
  const campBookings = camps.reduce((n, c) => n + c.bookings, 0);
  const growthTasks = d.tasks.filter((t) => t.agent === "growth" && t.status === "requires_approval");
  const outreach = d.outreach.slice(0, 8);
  const recovered = d.appointments.filter((a) => (a.recovered || a.rescheduledFrom) && a.status !== "cancelled").slice(-6).reverse();

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="TAWD Grow"
        title="النمو والتسويق"
        subtitle="من أين يأتي المرضى، كم منهم يحجز، وكم تعود الحملة على العيادة — محسوبة من الاستفسارات والمواعيد الفعلية في النظام. بيانات تجريبية."
        actions={<>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>إنشاء حملة تجريبية</Button>
          <Button icon={<UserSearch size={15} />} onClick={() => act.scanInactive()}>فحص المرضى غير النشطين</Button>
        </>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="استفسارات جديدة" value={num(k.inquiries)} icon={<MessageSquareText size={16} />} tone="info" hint="آخر 14 يومًا" />
        <Kpi label="حجوزات من الاستفسارات" value={num(k.booked)} icon={<Target size={16} />} tone="ok" />
        <Kpi label="معدل التحويل" value={pct(k.conversion)} icon={<TrendingUp size={16} />} tone="acc" />
        <Kpi label="إيراد منسوب للحملات" value={num(attributed)} icon={<CircleDollarSign size={16} />} tone="acc" hint={<DemoTag label="ر.ع. تقديري" />} />
        <Kpi label="تكلفة اكتساب المريض" value={campBookings ? (spend / campBookings).toFixed(1) : "—"} icon={<Megaphone size={16} />} tone="muted" hint="ر.ع. لكل حجز" />
        <Kpi label="زيارات عائدة" value={num(k.returning)} icon={<Repeat2 size={16} />} tone="info" hint="مرضى بزيارتين أو أكثر" />
        <Kpi label="قيمة مستردة من الإلغاء" value={num(k.recoveredRevenue)} icon={<RefreshCcw size={16} />} tone="warn" hint="ر.ع. تقديري" />
      </div>

      <Card className="mt-3" title="الحملات" subtitle="الميزانية · الاستفسارات · الحجوزات · التحويل · الإيراد المنسوب · تكلفة الحجز" tag={<DemoTag />}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {camps.map((c) => (
            <div key={c.id} className="rounded-2xl border hairline bg-s2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="truncate text-[14px] font-semibold">{c.name}</div><div className="mt-0.5 text-[11.5px] text-tx3">{CHANNEL[c.channel]}{c.specialty ? ` · ${SPECIALTY[c.specialty]}` : ""} · منذ {fmtDate(c.startDate)}</div></div>
                <Badge tone={c.createdBy === "staff" ? "acc" : "ok"} dot>{c.createdBy === "staff" ? "جديدة" : "نشطة"}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                <MiniK label="الميزانية" v={`${c.budget}`} />
                <MiniK label="استفسارات" v={`${c.inquiries}`} />
                <MiniK label="حجوزات" v={`${c.bookings}`} />
                <MiniK label="تحويل" v={pct(c.conversion)} />
              </div>
              <Meter className="mt-3" value={c.conversion} tone="acc" />
              <div className="mt-3 flex items-center justify-between text-[12px]"><span className="text-tx3">إيراد منسوب</span><span className="latin font-semibold">{c.revenue} OMR</span></div>
              <div className="mt-1 flex items-center justify-between text-[12px]"><span className="text-tx3">تكلفة الحجز</span><span className="latin">{c.cpa ? `${c.cpa.toFixed(1)} OMR` : "—"}</span></div>
              <div className="mt-1 flex items-center justify-between text-[12px]"><span className="text-tx3">العائد على الإنفاق</span><span className={cls("latin", c.roas >= 1 ? "text-ok" : "text-warn")}>{c.roas.toFixed(2)}×</span></div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="الاستفسارات والحجوزات يوميًا">
          <AreaTrend data={trend} height={230} series={[{ key: "inquiries", name: "استفسارات", color: "#8ea8c3" }, { key: "booked", name: "حجوزات", color: "#5c9de8" }]} />
        </Card>
        <Card title="مصادر العملاء المحتملين" subtitle="حسب القناة">
          <Donut data={sources} height={180} colors={["#5c9de8", "#8ea8c3", "#d6a85c", "#b7a6d9", "#d08a80"]} center={{ value: String(k.inquiries), label: "استفسار" }} />
          <div className="mt-3 grid grid-cols-2 gap-1.5 text-[12px]">
            {sources.map((s, i) => <div key={s.name} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: ["#5c9de8", "#8ea8c3", "#d6a85c", "#b7a6d9", "#d08a80"][i % 5] }} /><span className="text-tx2">{s.name}</span><span className="latin mr-auto text-tx3">{s.value}</span></div>)}
          </div>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Card title="قمع التحويل" subtitle="من الاستفسار حتى الحضور"><Funnel data={fn} /></Card>
        <div id="recovery" className="scroll-mt-20 xl:col-span-2">
          <Card title="تحليلات استرداد الإلغاءات" subtitle={`${pct(k.recoveryRate)} من الإلغاءات استُردت · ${omr(k.recoveredRevenue)} قيمة مستردة · ${omr(k.lostRevenue)} لم تُسترد`}>
            <div className="grid gap-4 md:grid-cols-2">
              <Bars data={rec} xKey="week" height={200} series={[{ key: "cancelled", name: "إلغاءات", color: "#4a4a4a" }, { key: "recovered", name: "مستردة", color: "#d6a85c" }]} />
              <div className="space-y-1.5">
                <div className="mb-1 text-[12px] text-tx3">آخر المواعيد المستردة</div>
                {recovered.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-[12px]">
                    <span className="truncate">{d.patients.find((p) => p.id === a.patientId)?.name}<span className="block text-[11px] text-tx3">{fmtDayTime(a.start)}</span></span>
                    <Badge tone={a.recovered ? "warn" : "info"}>{a.recovered ? `+${a.price} OMR` : "إعادة جدولة"}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-5" title="وكيل النمو والاحتفاظ — بانتظار اعتمادك" subtitle="الإرسال الخارجي محاكاة ويتطلب موافقة" tag={<SimTag />}>
          <div className="space-y-2">
            {growthTasks.map((t) => (
              <div key={t.id} className="rounded-xl border border-warn/20 bg-warn/[0.04] p-3">
                <div className="flex items-center gap-2"><AgentAvatar id="growth" size={26} /><span className="flex-1 truncate text-[13px] font-medium">{t.title}</span><span className="text-[11px] text-tx3">{ago(t.createdAt)}</span></div>
                <div className="mt-1 text-[12px] text-tx2">{t.outcome}</div>
                {t.reasoning && <ul className="mt-1.5 text-[11.5px] text-tx3">{t.reasoning.map((r) => <li key={r}>• {r}</li>)}</ul>}
                <div className="mt-2 flex gap-1.5">
                  <button onClick={() => act.approve(t.id)} className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-brand text-[12px] font-medium text-white"><ShieldCheck size={13} />اعتماد وإرسال (محاكاة)</button>
                  <button onClick={() => act.decline(t.id)} className="flex h-8 items-center gap-1 rounded-lg border border-line2 px-3 text-[12px] text-tx2"><X size={13} />رفض</button>
                </div>
              </div>
            ))}
            {!growthTasks.length && <div className="rounded-xl border border-dashed border-line2 py-6 text-center text-[12.5px] text-tx3">لا مسودات معلقة — شغّل «فحص المرضى غير النشطين» أو أنشئ حملة</div>}
          </div>
          <div className="mt-3 text-[11.5px] text-tx3">{k.inactive} مريضًا غير نشط (لا زيارة منذ 120 يومًا ولا موعد قادم)</div>
        </Card>
        <Card className="xl:col-span-7" title="رسائل إعادة التنشيط والمتابعة" subtitle="المسودات والنتائج المحاكاة">
          <div className="space-y-1.5">
            {outreach.map((o) => {
              const [label, tone] = OUT_STATUS[o.status];
              return (
                <div key={o.id} className="flex items-start gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[12.5px] font-medium">{d.patients.find((p) => p.id === o.patientId)?.name}<span className="text-[11px] font-normal text-tx3">{o.kind === "campaign" ? "حملة" : o.kind === "post_visit" ? "بعد الزيارة" : "إعادة تنشيط"}</span></div>
                    <div className="mt-0.5 line-clamp-1 text-[12px] text-tx3">{o.text}</div>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      {open && <CampaignDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

function MiniK({ label, v }: { label: string; v: string }) {
  return <div><div className="text-[10.5px] text-tx3">{label}</div><div className="latin mt-0.5 text-[15px] font-semibold">{v}</div></div>;
}

function CampaignDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("حملة فحص القلب الوقائي");
  const [channel, setChannel] = useState<Channel>("instagram");
  const [spec, setSpec] = useState<Specialty | "">("cardiology");
  const [budget, setBudget] = useState(250);
  return (
    <Dialog open onClose={onClose} title="إنشاء حملة تجريبية" footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button variant="primary" disabled={!name.trim() || budget <= 0} onClick={() => { if (act.createCampaign({ name: name.trim(), channel, specialty: spec || undefined, budget })) onClose(); }}>إنشاء الحملة</Button></>}>
      <div className="space-y-3">
        <Field label="اسم الحملة"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="القناة"><select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>{(["instagram", "whatsapp", "web", "phone"] as Channel[]).map((c) => <option key={c} value={c}>{CHANNEL[c]}</option>)}</select></Field>
          <Field label="التخصص"><select className={inputCls} value={spec} onChange={(e) => setSpec(e.target.value as Specialty | "")}><option value="">عام</option>{(Object.keys(SPECIALTY) as Specialty[]).map((s) => <option key={s} value={s}>{SPECIALTY[s]}</option>)}</select></Field>
        </div>
        <Field label="الميزانية (ر.ع.)"><input type="number" min={1} className={inputCls} value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></Field>
        <p className="text-[12px] leading-6 text-tx3">عند الإنشاء يصل حدث «حملة جديدة» إلى وكيل النمو، فيجهّز جمهور المرضى غير النشطين المطابق ويصوغ رسائل تنتظر اعتمادك. لا يُرسل أي شيء خارجيًا.</p>
      </div>
    </Dialog>
  );
}
