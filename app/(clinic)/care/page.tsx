"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, BatteryMedium, Bluetooth, BluetoothOff, CircleAlert, Droplets, Footprints, HeartPulse, Pause, Play, Radio, Send, Stethoscope, Thermometer, ArrowLeft, Cloud } from "lucide-react";
import type { Thresholds } from "@/types";
import { useData } from "@/lib/store";
import { act } from "@/lib/store/actions";
import { AGENTS } from "@/lib/constants";
import { ago, fmtTime, hhmm } from "@/lib/time";
import { cls } from "@/lib/format";
import { AgentAvatar, Badge, Button, Card, Field, PageHeader, SimTag, inputCls } from "@/components/ui";
import { Bars, Lines } from "@/components/charts";
import { BandVisual } from "@/components/care/band";
import { AuditTable } from "@/components/audit";

export default function CarePage() {
  const d = useData();
  const sim = d.sim;
  const [pid, setPid] = useState(sim.patientId);
  const enrolled = d.devices.map((dv) => ({ dv, p: d.patients.find((x) => x.id === dv.patientId)! }));
  const cur = enrolled.find((e) => e.p.id === pid) ?? enrolled[0];
  const rs = useMemo(() => d.readings.filter((r) => r.deviceId === cur.dv.id).slice(-40), [d.readings, cur.dv.id]);
  const last = rs.at(-1);
  const review = d.reviews.find((r) => r.patientId === cur.p.id && r.status !== "completed");
  const careAudit = d.audit.filter((a) => a.patientId === cur.p.id && (a.actor === "care" || a.actor === "doctor")).slice(0, 6);
  const lastCareTask = d.tasks.find((t) => t.agent === "care" && t.patientId === cur.p.id);
  const runningHere = sim.running && sim.patientId === cur.p.id;
  const chart = rs.map((r) => ({ label: hhmm(r.at), hr: r.hr, spo2: r.spo2, temp: r.temp, steps: r.steps }));
  const th = d.thresholds;

  const start = (mode: "normal" | "review") => {
    act.setSim({ running: true, patientId: cur.p.id, mode, tick: mode !== sim.mode || sim.patientId !== cur.p.id ? 0 : sim.tick });
  };

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="TAWD Care · Connected Wearable"
        title="الرعاية المتصلة — سوار طود"
        subtitle="القراءات تصل من السوار إلى العيادة، يقيّمها وكيل الرعاية المتصلة وفق قواعد توضيحية قابلة للضبط، ويحيل ما يتطلب مراجعة إلى لوحة الطبيب المعالج. محاكاة تكامل برمجي لبرنامج تطوير السوار — لا تشخيص."
        actions={<Link href="/doctor"><Button icon={<Stethoscope size={15} />}>لوحة الطبيب</Button></Link>}
      />

      <div className="mb-3 flex items-start gap-3 rounded-2xl border border-warn/20 bg-warn/[0.05] px-4 py-3 text-[12.5px] leading-6 text-warn">
        <CircleAlert size={16} className="mt-1 shrink-0" />
        <span>نموذج أولي غير معتمد طبيًا ولا يدّعي دقة سريرية. البيانات اصطناعية، والعتبات قواعد توضيحية تتطلب اعتمادًا سريريًا قبل أي استخدام فعلي. لا يشخّص النظام ولا يتنبأ بالطوارئ؛ يحيل فقط لمراجعة بشرية.</span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {enrolled.map(({ dv, p }) => {
          const open = d.reviews.some((r) => r.patientId === p.id && r.status === "open");
          return (
            <button key={p.id} onClick={() => setPid(p.id)} className={cls("flex items-center gap-2.5 rounded-xl border px-3 py-2 text-right transition-colors", cur.p.id === p.id ? "border-acc/40 bg-acc/[0.07]" : "hairline bg-s1 hover:border-white/15")}>
              <span className={cls("h-2 w-2 rounded-full", dv.status !== "connected" ? "bg-tx3" : open ? "bg-bad pulse-dot" : "bg-ok")} />
              <span>
                <span className="block text-[13px] font-medium">{p.name}</span>
                <span className="block text-[11px] text-tx3">{p.careProgram}{sim.running && sim.patientId === p.id ? " · بث مباشر" : ""}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-4" title="السوار" subtitle={cur.dv.model} tag={<SimTag label="نموذج مفهوم" />}>
          <div className="grid place-items-center rounded-2xl bg-[#0c0c0c] py-4">
            <BandVisual reading={last} connected={cur.dv.status === "connected"} history={rs.map((r) => r.hr)} flagged={!!last?.flagged?.length} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[12.5px]">
            <Info icon={cur.dv.status === "connected" ? <Bluetooth size={14} className="text-ok" /> : <BluetoothOff size={14} className="text-tx3" />} label="الاتصال" value={cur.dv.status === "connected" ? "متصل" : "غير متصل"} />
            <Info icon={<BatteryMedium size={14} className="text-acc" />} label="البطارية" value={<span className="latin">{cur.dv.battery}%</span>} />
            <Info icon={<Radio size={14} className="text-info" />} label="آخر مزامنة" value={ago(cur.dv.lastSync)} />
            <Info icon={<Activity size={14} className="text-tx2" />} label="البرنامج الثابت" value={<span className="latin">{cur.dv.firmware}</span>} />
          </div>
          <div className="mt-4">
            <div className="mb-2 text-[11.5px] text-tx3">المستشعرات</div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="ok" dot>نبض القلب</Badge><Badge tone="ok" dot>تشبّع الأكسجين</Badge><Badge tone="ok" dot>حرارة الجلد</Badge><Badge tone="ok" dot>النشاط</Badge>
              <Badge tone="muted">تخطيط القلب ECG — قدرة مخطط لها، غير مفعّلة</Badge>
            </div>
          </div>
          <Button className="mt-4 w-full" size="sm" variant="ghost" onClick={() => act.toggleDevice(cur.dv.id)}>{cur.dv.status === "connected" ? "محاكاة انقطاع الاتصال" : "إعادة الاتصال"}</Button>
        </Card>

        <div className="grid content-start gap-3 xl:col-span-8">
          <Card title="محاكاة بث القراءات" subtitle="اختر نوع القراءات ثم ابدأ — كل قراءة حدث يصل إلى وكيل الرعاية المتصلة" tag={runningHere ? <Badge tone="ok" dot pulse>بث مباشر</Badge> : <Badge>متوقف</Badge>}>
            <div className="flex flex-wrap items-center gap-2">
              {runningHere ? (
                <Button variant="secondary" icon={<Pause size={15} />} onClick={() => act.setSim({ running: false })}>إيقاف المحاكاة</Button>
              ) : (
                <Button variant="primary" icon={<Play size={15} />} onClick={() => start(sim.patientId === cur.p.id ? sim.mode : "normal")} disabled={cur.dv.status !== "connected"}>بدء المحاكاة</Button>
              )}
              <div className="inline-flex rounded-xl border border-line bg-s2 p-1">
                {(["normal", "review"] as const).map((m) => (
                  <button key={m} onClick={() => (runningHere ? start(m) : act.setSim({ mode: m, patientId: cur.p.id, tick: 0 }))} className={cls("h-8 rounded-lg px-3 text-[12.5px]", sim.mode === m && sim.patientId === cur.p.id ? (m === "review" ? "bg-bad/15 text-bad" : "bg-ok/15 text-ok") : "text-tx3 hover:text-tx")}>
                    {m === "normal" ? "قراءات ضمن النطاق" : "قراءات تتطلب مراجعة"}
                  </button>
                ))}
              </div>
              <Button variant="ghost" icon={<Send size={14} />} onClick={() => act.addReading(cur.p.id, sim.patientId === cur.p.id ? sim.mode : "normal")} disabled={cur.dv.status !== "connected"}>إرسال قراءة واحدة</Button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              <Live icon={<HeartPulse size={15} />} label="نبض القلب" value={last?.hr} unit="ن/د" alert={last?.flagged?.includes("hr")} />
              <Live icon={<Droplets size={15} />} label="تشبّع الأكسجين" value={last?.spo2} unit="%" alert={last?.flagged?.includes("spo2")} />
              <Live icon={<Thermometer size={15} />} label="حرارة الجلد" value={last?.temp} unit="°م" alert={last?.flagged?.includes("temp")} />
              <Live icon={<Footprints size={15} />} label="النشاط (خطوات/فترة)" value={last?.steps} unit="" />
            </div>
            <div className="mt-2 text-[11.5px] text-tx3">آخر قياس: {last ? `${fmtTime(last.at)} (${ago(last.at)}) · المصدر: ${last.source === "simulation" ? "محاكاة مباشرة" : "سجل تجريبي"}` : "—"}</div>

            {/* pipeline */}
            <div className="mt-4 grid gap-2 md:grid-cols-4">
              <Stage icon={<Radio size={15} />} title="السوار" text={last ? `قراءة ${fmtTime(last.at)}` : "—"} on={!!last} />
              <Stage icon={<Cloud size={15} />} title="بوابة البيانات" text="استقبال ومزامنة (محاكاة)" on={!!last} />
              <Stage avatar title={AGENTS.care.name} text={last?.flagged?.length ? "تجاوز قاعدة توضيحية ← إحالة" : "ضمن العتبات — لا إجراء"} on={!!last} alert={!!last?.flagged?.length} />
              <Stage icon={<Stethoscope size={15} />} title="لوحة الطبيب" text={review ? (review.status === "open" ? "مهمة مراجعة مفتوحة" : "اطّلع الطبيب") : "لا إشارة مراجعة"} on={!!review} alert={review?.status === "open"} link="/doctor" />
            </div>
            {lastCareTask && (
              <div className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2.5 text-[12px]">
                <span className="text-tx3">آخر قرار للوكيل: </span>{lastCareTask.outcome} <span className="text-tx3">· {ago(lastCareTask.createdAt)}</span>
                {lastCareTask.reasoning && <div className="mt-1 text-[11.5px] text-tx2">{lastCareTask.reasoning.join(" · ")}</div>}
              </div>
            )}
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            <Card title="نبض القلب" subtitle="ن/د · آخر 40 قراءة">
              <Lines data={chart} height={170} domain={[40, 140]} series={[{ key: "hr", name: "النبض", color: "#e07f74" }]} refLines={[{ y: th.hrHigh, label: `عتبة توضيحية ${th.hrHigh}` }]} />
            </Card>
            <Card title="تشبّع الأكسجين SpO₂" subtitle="% · آخر 40 قراءة">
              <Lines data={chart} height={170} domain={[86, 100]} series={[{ key: "spo2", name: "SpO₂", color: "#8ea8c3" }]} refLines={[{ y: th.spo2Low, label: `عتبة توضيحية ${th.spo2Low}%` }]} />
            </Card>
            <Card title="حرارة الجلد" subtitle="°م">
              <Lines data={chart} height={150} domain={[35.8, 38.6]} series={[{ key: "temp", name: "الحرارة", color: "#d6a85c" }]} refLines={[{ y: th.tempHigh, label: `عتبة توضيحية ${th.tempHigh}°` }]} />
            </Card>
            <Card title="النشاط البدني" subtitle="خطوات لكل فترة قياس">
              <Bars data={chart.slice(-20)} height={150} series={[{ key: "steps", name: "خطوات", color: "#5c9de8" }]} />
            </Card>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-12">
        <ThresholdCard key={JSON.stringify(th)} th={th} />
        <Card className="xl:col-span-8" title="سجل الرعاية لهذا المريض" subtitle="قرارات وكيل الرعاية وإجراءات الطبيب" action={<Link href="/doctor" className="flex items-center gap-1 text-[12px] text-acc">لوحة الطبيب <ArrowLeft size={13} /></Link>}>
          <AuditTable rows={careAudit} compact empty="لا قرارات بعد لهذا المريض — ابدأ المحاكاة" />
        </Card>
      </div>
    </div>
  );
}

function ThresholdCard({ th }: { th: Thresholds }) {
  const [v, setV] = useState(th);
  const set = (k: keyof Thresholds) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Number(e.target.value) });
  return (
    <Card className="xl:col-span-4" title="العتبات التوضيحية" subtitle="قابلة للضبط — تتطلب اعتمادًا سريريًا قبل أي استخدام فعلي">
      <div className="grid grid-cols-2 gap-3">
        <Field label="نبض أعلى من"><input type="number" className={inputCls} value={v.hrHigh} onChange={set("hrHigh")} /></Field>
        <Field label="نبض أقل من"><input type="number" className={inputCls} value={v.hrLow} onChange={set("hrLow")} /></Field>
        <Field label="SpO₂ أقل من (%)"><input type="number" className={inputCls} value={v.spo2Low} onChange={set("spo2Low")} /></Field>
        <Field label="حرارة من (°م)"><input type="number" step="0.1" className={inputCls} value={v.tempHigh} onChange={set("tempHigh")} /></Field>
      </div>
      <Button className="mt-4 w-full" onClick={() => act.setThresholds(v)}>حفظ العتبات</Button>
    </Card>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
      {icon}
      <div className="min-w-0"><div className="text-[10.5px] text-tx3">{label}</div><div className="truncate text-[12.5px]">{value}</div></div>
    </div>
  );
}

function Live({ icon, label, value, unit, alert }: { icon: React.ReactNode; label: string; value?: number; unit: string; alert?: boolean }) {
  return (
    <div className={cls("rounded-xl border px-3 py-3", alert ? "border-bad/40 bg-bad/[0.07]" : "hairline bg-s2")}>
      <div className={cls("flex items-center gap-1.5 text-[11.5px]", alert ? "text-bad" : "text-tx3")}>{icon}{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1"><span className={cls("latin text-[26px] font-semibold leading-none", alert && "text-bad")}>{value ?? "—"}</span><span className="text-[11px] text-tx3">{unit}</span></div>
    </div>
  );
}

function Stage({ icon, avatar, title, text, on, alert, link }: { icon?: React.ReactNode; avatar?: boolean; title: string; text: string; on: boolean; alert?: boolean; link?: string }) {
  const body = (
    <div className={cls("flex h-full items-center gap-2.5 rounded-xl border px-3 py-2.5", alert ? "border-bad/35 bg-bad/[0.06]" : on ? "border-acc/20 bg-acc/[0.04]" : "hairline bg-s2")}>
      {avatar ? <AgentAvatar id="care" size={28} active={alert} /> : <span className={cls("grid h-7 w-7 shrink-0 place-items-center rounded-lg", on ? "bg-acc/10 text-acc" : "bg-white/5 text-tx3")}>{icon}</span>}
      <div className="min-w-0"><div className="truncate text-[12.5px] font-medium">{title}</div><div className={cls("truncate text-[11px]", alert ? "text-bad" : "text-tx3")}>{text}</div></div>
    </div>
  );
  return link ? <Link href={link}>{body}</Link> : body;
}
