"use client";
import { asset } from "@/lib/asset";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bell, CalendarDays, CalendarPlus, Check, ChevronLeft, Clock, Droplets, HeartPulse, Home, MapPin, Thermometer, Footprints, Watch, X, ShieldCheck, Users, ArrowRight, LayoutDashboard, MessagesSquare, Sparkles,
} from "lucide-react";
import type { Appointment, Specialty } from "@/types";
import { useData, useStore } from "@/lib/store";
import { act } from "@/lib/store/actions";
import { PATIENT_APP_USER } from "@/lib/data/seed";
import { freeSlots, queueAhead } from "@/lib/engine/core";
import { SPECIALTY } from "@/lib/constants";
import { addDays, ago, fmtDay, fmtDayTime, fmtTime, hhmm, sameDay, startOfDay } from "@/lib/time";
import { cls } from "@/lib/format";
import { ApptBadge } from "@/components/ui";
import { Lines } from "@/components/charts";
import { SuraChat } from "@/components/agent/sura-chat";
import dynamic from "next/dynamic";

const Band3D = dynamic(() => import("@/components/care/band3d"), { ssr: false, loading: () => <div className="h-full w-full rounded-3xl bg-white/[0.02]" /> });

type Tab = "home" | "appts" | "book" | "health" | "alerts" | "sura";

export default function PatientApp() {
  const [welcomed, setWelcomed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  useEffect(() => {
    try { setWelcomed(localStorage.getItem("tawd.pa.welcomed") === "1"); } catch { setWelcomed(false); }
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t) setTab(t);
  }, []);
  const enter = () => { try { localStorage.setItem("tawd.pa.welcomed", "1"); } catch { /* storage blocked */ } setWelcomed(true); };
  if (welcomed === null) return null;

  return (
    <div className="min-h-screen bg-[#060606] lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-10 lg:px-10 lg:py-5">
      <aside className="hidden lg:block"><DesktopInfo /></aside>
      <div className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-bg lg:h-[min(860px,calc(100dvh-40px))] lg:w-[400px] lg:rounded-[34px] lg:border lg:border-line2 lg:shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        {!welcomed ? <Welcome onEnter={enter} /> : (
          <>
            <AppHeader onBell={() => setTab("alerts")} />
            {tab === "sura" ? (
              <SuraChat mode="patient" dense className="flex-1 pb-[78px]" />
            ) : (
              <div className="flex-1 overflow-y-auto px-4 pb-28 pt-2">
                {tab === "home" && <HomeTab go={setTab} />}
                {tab === "appts" && <ApptsTab go={setTab} />}
                {tab === "book" && <BookTab go={setTab} />}
                {tab === "health" && <HealthTab />}
                {tab === "alerts" && <AlertsTab />}
              </div>
            )}
            <BottomNav tab={tab} go={setTab} />
          </>
        )}
      </div>
      <aside className="hidden lg:block"><ClinicMirror /></aside>
    </div>
  );
}

function usePatient() {
  const d = useData();
  const p = d.patients.find((x) => x.id === PATIENT_APP_USER)!;
  const mine = d.appointments.filter((a) => a.patientId === p.id);
  const upcoming = mine.filter((a) => new Date(a.start) >= startOfDay(new Date()) && !["cancelled", "completed", "no_show"].includes(a.status));
  return { d, p, mine, upcoming };
}

function Welcome({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="relative flex flex-1 flex-col justify-between overflow-y-auto px-6 pb-10 pt-14">
      <div className="pointer-events-none absolute -right-24 top-24 h-72 w-72 rounded-full bg-acc/[0.09] blur-3xl" />
      <img src={asset("/brand/tawd-logo-white.png")} alt="TAWD طود" className="relative h-7 w-auto self-start" />
      <div className="relative">
        <div className="text-[13px] text-acc">تطبيق المريض</div>
        <h1 className="mt-2 text-[34px] font-semibold leading-[1.25]">عيادتك ورعايتك<br />في مكان واحد.</h1>
        <p className="mt-4 text-[14.5px] leading-7 text-tx2">احجز موعدك، تابع دورك في الانتظار، واطّلع على قراءات سوارك ومهام متابعتك — متصلة مباشرة بعيادتك.</p>
        <div className="mt-7 space-y-3">
          {[
            [CalendarPlus, "حجز وتأكيد وإلغاء دون اتصال"],
            [Users, "طابور انتظار مباشر قبل وصولك"],
            [Watch, "قراءات السوار تصل لطبيبك المعالج"],
          ].map(([I, t], i) => {
            const Icon = I as typeof CalendarPlus;
            return <div key={i} className="flex items-center gap-3 text-[14px]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.05] text-acc"><Icon size={17} /></span>{t as string}</div>;
          })}
        </div>
      </div>
      <div className="relative">
        <button onClick={onEnter} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[15.5px] font-semibold text-white">ابدأ <ChevronLeft size={18} /></button>
        <div className="mt-3 text-center text-[12px] text-tx3">الدخول كمريض تجريبي: سالم بن حمد العبري · بيانات وهمية</div>
      </div>
    </div>
  );
}

function AppHeader({ onBell }: { onBell: () => void }) {
  const { d, p } = usePatient();
  const h = new Date().getHours();
  const unread = d.audit.filter((a) => a.patientId === p.id && a.actor !== "patient").slice(0, 9).length;
  return (
    <header className="flex items-center justify-between px-4 pb-3 pt-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-s3 text-[15px] font-semibold">{p.name[0]}</div>
        <div>
          <div className="text-[11.5px] text-tx3">{h < 12 ? "صباح الخير" : "مساء الخير"}</div>
          <div className="text-[15px] font-semibold">{p.name.split(" ")[0]} {p.name.split(" ").at(-1)}</div>
        </div>
      </div>
      <button onClick={onBell} aria-label="التنبيهات" className="relative grid h-10 w-10 place-items-center rounded-full border border-line2 text-tx2">
        <Bell size={17} />
        {unread > 0 && <span className="absolute -left-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{unread}</span>}
      </button>
    </header>
  );
}

function BottomNav({ tab, go }: { tab: Tab; go: (t: Tab) => void }) {
  const items: [Tab, string, typeof Home][] = [["home", "الرئيسية", Home], ["appts", "مواعيدي", CalendarDays], ["sura", "سُرى", MessagesSquare], ["health", "صحتي", HeartPulse], ["alerts", "التنبيهات", Bell]];
  return (
    <nav className="absolute inset-x-0 bottom-0 z-20 border-t hairline bg-[#0d0d0d]/95 px-2 pb-5 pt-2 backdrop-blur lg:pb-4">
      <div className="grid grid-cols-5">
        {items.map(([id, label, I]) => (
          <button key={id} onClick={() => go(id)} className={cls("flex flex-col items-center gap-1 py-1 text-[10.5px]", tab === id ? "text-acc" : "text-tx3")}>
            {id === "sura" ? <span className={cls("-mt-5 grid h-12 w-12 place-items-center rounded-2xl shadow-lg shadow-brand/30", tab === id ? "bg-brand2 text-white" : "bg-brand text-white")}><I size={20} /></span> : <I size={19} />}
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function HomeTab({ go }: { go: (t: Tab) => void }) {
  const { d, p, upcoming } = usePatient();
  const next = upcoming[0];
  const today = upcoming.find((a) => sameDay(a.start, new Date()));
  const dv = d.devices.find((x) => x.patientId === p.id);
  const last = d.readings.filter((r) => r.patientId === p.id).at(-1);
  const fus = d.followups.filter((f) => f.patientId === p.id && f.status === "open");
  const review = d.reviews.find((r) => r.patientId === p.id && r.status !== "completed");
  return (
    <div className="space-y-3">
      {today ? <QueueCard a={today} /> : next ? <NextCard a={next} /> : (
        <button onClick={() => go("book")} className="w-full rounded-3xl border border-dashed border-line2 p-5 text-center text-[13.5px] text-tx2">لا مواعيد قادمة — احجز موعدًا</button>
      )}
      {next && today && next.id !== today.id && <NextCard a={upcoming.find((a) => a.id !== today.id)!} compact />}

      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={() => go("sura")} className="flex items-center gap-2.5 rounded-2xl bg-brand px-4 py-3.5 text-right text-white">
          <Sparkles size={18} />
          <span><span className="block text-[13.5px] font-semibold">اسأل سُرى</span><span className="block text-[11px] text-white/70">حجز وأسئلة بالمحادثة</span></span>
        </button>
        <button onClick={() => go("book")} className="flex items-center gap-2.5 rounded-2xl border hairline bg-s1 px-4 py-3.5 text-right">
          <CalendarPlus size={18} className="text-acc" />
          <span><span className="block text-[13.5px] font-semibold">احجز موعدًا</span><span className="block text-[11px] text-tx3">اختر التخصص والوقت</span></span>
        </button>
      </div>

      <button onClick={() => go("health")} className="block w-full rounded-3xl border hairline bg-s1 p-4 text-right">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13.5px] font-medium"><Watch size={16} className="text-acc" /> سوار طود</div>
          <span className={cls("flex items-center gap-1.5 text-[11.5px]", dv?.status === "connected" ? "text-ok" : "text-tx3")}><span className={cls("h-1.5 w-1.5 rounded-full", dv?.status === "connected" ? "bg-ok" : "bg-tx3")} />{dv?.status === "connected" ? "متصل" : "غير متصل"} · {dv ? ago(dv.lastSync) : ""}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric icon={<HeartPulse size={14} />} label="النبض" value={last?.hr} unit="bpm" alert={last?.flagged?.includes("hr")} />
          <Metric icon={<Droplets size={14} />} label="الأكسجين" value={last?.spo2} unit="%" alert={last?.flagged?.includes("spo2")} />
          <Metric icon={<Thermometer size={14} />} label="الحرارة" value={last?.temp} unit="°" alert={last?.flagged?.includes("temp")} />
        </div>
        {review && <div className={cls("mt-3 rounded-xl px-3 py-2 text-[12px]", review.status === "open" ? "bg-warn/10 text-warn" : "bg-ok/10 text-ok")}>{review.status === "open" ? "أُرسلت بعض قراءاتك لطبيبك للمراجعة. لا داعي للقلق؛ سيتواصل معك الفريق إن لزم." : "اطّلع طبيبك على قراءاتك."}</div>}
      </button>

      <div className="rounded-3xl border hairline bg-s1 p-4">
        <div className="mb-2 flex items-center justify-between text-[13.5px] font-medium"><span>مهام المتابعة</span><span className="latin text-[12px] text-tx3">{fus.length}</span></div>
        {fus.length ? fus.slice(0, 3).map((f) => (
          <div key={f.id} className="flex items-center gap-3 border-t border-white/[0.04] py-2.5 first:border-0">
            <button aria-label="إنجاز" onClick={() => act.completeFollowUp(f.id)} className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line2 text-transparent hover:border-acc hover:text-acc"><Check size={13} /></button>
            <div className="min-w-0 flex-1"><div className="text-[13px]">{f.title}</div><div className="text-[11px] text-tx3">{fmtDay(f.due)} · من {f.owner === "doctor" ? "طبيبك" : "العيادة"}</div></div>
          </div>
        )) : <div className="text-[12.5px] text-tx3">لا مهام مفتوحة</div>}
      </div>

      <div className="flex items-center gap-3 rounded-3xl border hairline bg-s1 p-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.05] text-acc"><MapPin size={17} /></span>
        <div className="min-w-0 flex-1"><div className="text-[13.5px] font-medium">{d.clinic.name}</div><div className="text-[11.5px] text-tx3">{d.clinic.city} · يوميًا 9:00 ص – 1:00 م و4:00 – 6:00 م</div></div>
      </div>
    </div>
  );
}

function QueueCard({ a }: { a: Appointment }) {
  const d = useData();
  const doc = d.doctors.find((x) => x.id === a.doctorId)!;
  const ahead = queueAhead(d, a);
  const inRoom = d.appointments.find((x) => x.doctorId === a.doctorId && x.status === "in_room" && sameDay(x.start, new Date()));
  return (
    <div className="overflow-hidden rounded-3xl bg-paper p-5 text-ink">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-black/[0.06] px-2.5 py-1 text-[11.5px] font-medium">موعدك اليوم · {fmtTime(a.start)}</span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-[#064b93]"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#064b93]" />طابور مباشر</span>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="text-[12px] text-black/55">{a.status === "in_room" ? "أنت الآن" : a.status === "checked_in" ? "دورك بعد" : "أمامك في الطابور"}</div>
          <div className="latin mt-1 text-[46px] font-semibold leading-none">{a.status === "in_room" ? "مع الطبيب" : ahead}</div>
          {a.status !== "in_room" && <div className="mt-1 text-[12.5px] text-black/60">{ahead === 1 ? "مريض واحد" : "مرضى"} · انتظار تقديري ~{ahead * 15} دقيقة</div>}
        </div>
        <div className="text-left text-[12px] text-black/60">
          <div>{doc.name}</div>
          <div>{doc.room}</div>
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-[#064b93]" style={{ width: `${Math.max(8, 100 - ahead * 18)}%` }} /></div>
      <div className="mt-2 text-[11.5px] text-black/50">{inRoom ? "الطبيب مع مريض آخر الآن" : "الطبيب متاح"}</div>
      <div className="mt-4 flex gap-2">
        {a.status === "confirmed" || a.status === "pending" ? (
          <button onClick={() => act.checkIn(a.id)} className="h-11 flex-1 rounded-xl bg-ink text-[13.5px] font-medium text-white">تسجيل الوصول</button>
        ) : <div className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-black/[0.06] text-[13px]"><Check size={15} /> {a.status === "in_room" ? "داخل العيادة" : "تم تسجيل وصولك"}</div>}
      </div>
    </div>
  );
}

function NextCard({ a, compact }: { a: Appointment; compact?: boolean }) {
  const d = useData();
  const doc = d.doctors.find((x) => x.id === a.doctorId)!;
  return (
    <div className={cls("rounded-3xl border hairline bg-s1", compact ? "p-4" : "p-5")}>
      <div className="flex items-center justify-between"><span className="text-[12px] text-tx3">موعدك القادم</span><ApptBadge status={a.status} /></div>
      <div className="mt-2 text-[17px] font-semibold">{fmtDayTime(a.start)}</div>
      <div className="mt-1 text-[13px] text-tx2">{doc.name} · {SPECIALTY[doc.specialty]}</div>
      {a.status === "pending" && <button onClick={() => act.confirmFromApp(a.id)} className="mt-3 h-10 w-full rounded-xl bg-brand text-[13px] font-medium text-white">تأكيد الحضور</button>}
    </div>
  );
}

function Metric({ icon, label, value, unit, alert }: { icon: React.ReactNode; label: string; value?: number; unit: string; alert?: boolean }) {
  return (
    <div className={cls("rounded-2xl px-3 py-2.5", alert ? "bg-warn/10" : "bg-white/[0.04]")}>
      <div className={cls("flex items-center gap-1 text-[11px]", alert ? "text-warn" : "text-tx3")}>{icon}{label}</div>
      <div className="latin mt-1 text-[20px] font-semibold leading-none">{value ?? "—"}<span className="mr-0.5 text-[11px] font-normal text-tx3">{unit}</span></div>
    </div>
  );
}

function ApptsTab({ go }: { go: (t: Tab) => void }) {
  const { d, mine, upcoming } = usePatient();
  const past = mine.filter((a) => !upcoming.includes(a)).reverse().slice(0, 6);
  const [resched, setResched] = useState<Appointment | null>(null);
  const [cancel, setCancel] = useState<Appointment | null>(null);
  return (
    <div>
      <h2 className="mb-3 text-[20px] font-semibold">مواعيدي</h2>
      <div className="space-y-2.5">
        {upcoming.length ? upcoming.map((a) => {
          const doc = d.doctors.find((x) => x.id === a.doctorId)!;
          return (
            <div key={a.id} className="rounded-3xl border hairline bg-s1 p-4">
              <div className="flex items-center justify-between"><span className="text-[15px] font-semibold">{fmtDayTime(a.start)}</span><ApptBadge status={a.status} /></div>
              <div className="mt-1 text-[13px] text-tx2">{doc.name} · {SPECIALTY[doc.specialty]}</div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button disabled={a.status !== "pending"} onClick={() => act.confirmFromApp(a.id)} className="h-9 rounded-xl bg-acc/15 text-[12.5px] text-acc disabled:opacity-30">تأكيد</button>
                <button disabled={!["pending", "confirmed"].includes(a.status)} onClick={() => setResched(a)} className="h-9 rounded-xl bg-white/[0.05] text-[12.5px] disabled:opacity-30">تغيير</button>
                <button disabled={!["pending", "confirmed"].includes(a.status)} onClick={() => setCancel(a)} className="h-9 rounded-xl bg-bad/10 text-[12.5px] text-bad disabled:opacity-30">إلغاء</button>
              </div>
            </div>
          );
        }) : <button onClick={() => go("book")} className="w-full rounded-3xl border border-dashed border-line2 p-6 text-[13.5px] text-tx2">لا مواعيد قادمة — احجز الآن</button>}
      </div>
      <h3 className="mb-2 mt-6 text-[13.5px] text-tx3">السابقة</h3>
      <div className="space-y-2">
        {past.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3 text-[12.5px]">
            <span>{fmtDayTime(a.start)}<span className="block text-[11.5px] text-tx3">{d.doctors.find((x) => x.id === a.doctorId)?.name}</span></span>
            <ApptBadge status={a.status} />
          </div>
        ))}
      </div>
      {resched && <Sheet title="اختر موعدًا جديدًا" onClose={() => setResched(null)}><SlotPicker doctorId={resched.doctorId} onPick={(s) => { if (act.rescheduleFromApp(resched.id, s)) setResched(null); }} cta="تأكيد التغيير" /></Sheet>}
      {cancel && (
        <Sheet title="إلغاء الموعد" onClose={() => setCancel(null)}>
          <p className="text-[13.5px] leading-7 text-tx2">سيُلغى موعدك {fmtDayTime(cancel.start)}، وستُبلَّغ العيادة فورًا ليُعرض الموعد على مرضى قائمة الانتظار.</p>
          <button onClick={() => { if (act.cancelFromApp(cancel.id)) setCancel(null); }} className="mt-4 h-12 w-full rounded-2xl bg-bad/15 text-[14px] font-medium text-bad">تأكيد الإلغاء</button>
        </Sheet>
      )}
    </div>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/60" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fade-up max-h-[80%] overflow-y-auto rounded-t-3xl border-t border-line2 bg-s1 p-5 pb-8">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-[16px] font-semibold">{title}</h3><button aria-label="إغلاق" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/5"><X size={15} /></button></div>
        {children}
      </div>
    </div>
  );
}

function SlotPicker({ doctorId, onPick, cta }: { doctorId: string; onPick: (iso: string) => void; cta: string }) {
  const d = useData();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i + 1)), []);
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState("");
  const slots = freeSlots(d, doctorId, { from: days[day], days: 1 });
  return (
    <div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {days.map((x, i) => (
          <button key={i} onClick={() => { setDay(i); setSlot(""); }} className={cls("flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2", day === i ? "border-acc bg-acc/10 text-acc" : "hairline bg-s2 text-tx2")}>
            <span className="text-[10.5px]">{fmtDay(x).split(" ")[0]}</span>
            <span className="latin text-[17px] font-semibold">{x.getDate()}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {slots.length ? slots.map((s) => (
          <button key={s} onClick={() => setSlot(s)} className={cls("latin h-10 rounded-xl border text-[13px]", slot === s ? "border-acc bg-brand text-white" : "hairline bg-s2")}>{hhmm(s)}</button>
        )) : <div className="col-span-3 py-4 text-center text-[12.5px] text-tx3">لا مواعيد متاحة هذا اليوم</div>}
      </div>
      <button disabled={!slot} onClick={() => onPick(slot)} className="mt-4 h-12 w-full rounded-2xl bg-brand text-[14px] font-semibold text-white disabled:opacity-30">{cta}</button>
    </div>
  );
}

function BookTab({ go }: { go: (t: Tab) => void }) {
  const { d, p } = usePatient();
  const [spec, setSpec] = useState<Specialty | null>(null);
  const [slot, setSlot] = useState<string>("");
  const [done, setDone] = useState<string>("");
  const doc = spec ? d.doctors.find((x) => x.specialty === spec) : undefined;
  if (done) {
    const a = d.appointments.find((x) => x.id === done);
    return (
      <div className="pt-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-acc/15 text-acc"><Check size={30} /></div>
        <h2 className="mt-4 text-[21px] font-semibold">تم الحجز</h2>
        {a && <p className="mt-2 text-[14px] text-tx2">{fmtDayTime(a.start)} · {d.doctors.find((x) => x.id === a.doctorId)?.name}</p>}
        <div className="mx-auto mt-5 max-w-[300px] rounded-2xl bg-white/[0.04] p-4 text-right text-[12.5px] leading-6 text-tx2">
          <div className="flex gap-2"><ShieldCheck size={15} className="mt-1 shrink-0 text-acc" />ظهر الموعد في جدول العيادة، وأرسل وكيل تأكيد الحضور طلب تأكيد (محاكاة).</div>
        </div>
        <button onClick={() => go("appts")} className="mt-6 h-12 w-full rounded-2xl bg-brand text-[14px] font-semibold text-white">عرض في مواعيدي</button>
      </div>
    );
  }
  return (
    <div>
      <h2 className="mb-1 text-[20px] font-semibold">احجز موعدًا</h2>
      <p className="mb-4 text-[12.5px] text-tx3">{spec ? "اختر اليوم والوقت" : "اختر التخصص"}</p>
      {!spec ? (
        <div className="grid grid-cols-2 gap-2.5">
          {d.doctors.map((x) => (
            <button key={x.id} onClick={() => setSpec(x.specialty)} disabled={!x.available} className="rounded-3xl border hairline bg-s1 p-4 text-right disabled:opacity-40">
              <div className="text-[14.5px] font-semibold">{SPECIALTY[x.specialty]}</div>
              <div className="mt-1 text-[12px] text-tx3">{x.name}</div>
              <div className="mt-3 flex items-center justify-between text-[11.5px]"><span className="latin text-tx2">{x.fee} OMR</span><span className={x.available ? "text-ok" : "text-tx3"}>{x.available ? "متاح" : "غير متاح"}</span></div>
            </button>
          ))}
        </div>
      ) : (
        <>
          <button onClick={() => { setSpec(null); setSlot(""); }} className="mb-3 flex items-center gap-1 text-[12.5px] text-tx2"><ArrowRight size={14} /> {SPECIALTY[spec]} · {doc?.name}</button>
          {doc && !slot && <SlotPicker doctorId={doc.id} onPick={setSlot} cta="متابعة" />}
          {doc && slot && (
            <div className="rounded-3xl border hairline bg-s1 p-5">
              <div className="text-[12px] text-tx3">ملخص الحجز</div>
              <div className="mt-2 space-y-2 text-[13.5px]">
                <Row k="المريض" v={p.name} />
                <Row k="الطبيب" v={doc.name} />
                <Row k="الموعد" v={fmtDayTime(slot)} />
                <Row k="رسوم الكشف" v={`${doc.fee} ر.ع.`} />
              </div>
              <button onClick={() => {
                const before = new Set(d.appointments.map((a) => a.id));
                if (act.bookFromApp(p.id, doc.id, slot)) {
                  const created = useStore.getState().data.appointments.find((a) => !before.has(a.id) && a.patientId === p.id);
                  setDone(created?.id ?? "x");
                }
              }} className="mt-5 h-12 w-full rounded-2xl bg-brand text-[14px] font-semibold text-white">تأكيد الحجز</button>
              <button onClick={() => setSlot("")} className="mt-2 h-10 w-full text-[12.5px] text-tx3">تغيير الوقت</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><span className="text-tx3">{k}</span><span className="text-left">{v}</span></div>;
}

function HealthTab() {
  const { d, p } = usePatient();
  const dv = d.devices.find((x) => x.patientId === p.id);
  const rs = d.readings.filter((r) => r.patientId === p.id).slice(-30);
  const last = rs.at(-1);
  const chart = rs.map((r) => ({ label: hhmm(r.at), hr: r.hr, spo2: r.spo2 }));
  const review = d.reviews.find((r) => r.patientId === p.id && r.status !== "completed");
  return (
    <div className="space-y-3">
      <h2 className="text-[20px] font-semibold">صحتي</h2>
      <div className="relative -mx-1 h-[250px] overflow-hidden rounded-3xl border hairline bg-[radial-gradient(ellipse_at_center,#0d1b33_0%,#0a0a0a_70%)]">
        <Band3D bpm={last?.hr ?? 72} alert={!!last?.flagged?.length} connected={dv?.status === "connected"} />
        <div className="pointer-events-none absolute bottom-3 right-4 text-[11px] text-tx3">اسحب لتدوير السوار · النبض يتحرك بقراءتك الحية</div>
      </div>
      <div className="rounded-3xl border hairline bg-s1 p-4">
        <div className="flex items-center justify-between text-[12.5px]"><span className="flex items-center gap-2"><Watch size={15} className="text-acc" />{dv?.model}</span><span className="latin text-tx3">{dv?.battery}%</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Metric icon={<HeartPulse size={14} />} label="النبض" value={last?.hr} unit="bpm" alert={last?.flagged?.includes("hr")} />
          <Metric icon={<Droplets size={14} />} label="تشبّع الأكسجين" value={last?.spo2} unit="%" alert={last?.flagged?.includes("spo2")} />
          <Metric icon={<Thermometer size={14} />} label="حرارة الجلد" value={last?.temp} unit="°" alert={last?.flagged?.includes("temp")} />
          <Metric icon={<Footprints size={14} />} label="النشاط" value={last?.steps} unit="خطوة" />
        </div>
        <div className="mt-2 text-[11px] text-tx3">آخر قياس {last ? ago(last.at) : "—"} · مزامنة مع العيادة</div>
      </div>
      <div className="rounded-3xl border hairline bg-s1 p-4">
        <div className="mb-1 text-[13px] font-medium">النبض — آخر القراءات</div>
        <Lines data={chart} height={150} domain={[40, 140]} series={[{ key: "hr", name: "النبض", color: "#e07f74" }]} />
      </div>
      <div className="rounded-3xl border hairline bg-s1 p-4">
        <div className="mb-1 text-[13px] font-medium">تشبّع الأكسجين</div>
        <Lines data={chart} height={130} domain={[86, 100]} series={[{ key: "spo2", name: "SpO₂", color: "#8ea8c3" }]} />
      </div>
      {review && <div className="rounded-2xl bg-warn/10 px-4 py-3 text-[12.5px] leading-6 text-warn">بعض القراءات أُرسلت إلى طبيبك المعالج للاطلاع. هذا إجراء متابعة روتيني وليس تشخيصًا.</div>}
      <p className="px-1 text-[11px] leading-5 text-tx3">السوار نموذج تطوير غير معتمد طبيًا، والقراءات هنا اصطناعية لأغراض العرض. في أي حالة طارئة اتصل بالإسعاف.</p>
    </div>
  );
}

function AlertsTab() {
  const { d, p } = usePatient();
  const items = d.audit.filter((a) => a.patientId === p.id).slice(0, 14);
  return (
    <div>
      <h2 className="mb-3 text-[20px] font-semibold">التنبيهات</h2>
      <div className="space-y-2">
        {items.map((a) => (
          <div key={a.id} className="rounded-2xl bg-white/[0.03] px-4 py-3">
            <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-medium">{a.action}</span><span className="shrink-0 text-[11px] text-tx3">{ago(a.at)}</span></div>
            <div className="mt-0.5 text-[12px] text-tx3">{a.outcome}</div>
          </div>
        ))}
        {!items.length && <div className="py-10 text-center text-[13px] text-tx3">لا تنبيهات</div>}
      </div>
    </div>
  );
}

function DesktopInfo() {
  return (
    <div className="sticky top-8 ml-auto max-w-[320px] pt-6">
      <img src={asset("/brand/tawd-logo-white.png")} alt="TAWD طود" className="h-6 w-auto" />
      <h1 className="mt-6 text-[26px] font-semibold leading-snug">تطبيق المريض</h1>
      <p className="mt-3 text-[13.5px] leading-7 text-tx2">نفس البيانات التي تراها العيادة: الحجز من هنا يظهر فورًا في جدول العيادة ويصل إلى وكيل تأكيد الحضور، والإلغاء يُطلق وكيل الاسترداد.</p>
      <div className="mt-5 space-y-2 text-[12.5px] text-tx3">
        <div className="flex items-center gap-2"><Clock size={14} /> افتح لوحة العيادة في نافذة أخرى لمشاهدة التزامن.</div>
        <div className="flex items-center gap-2"><ShieldCheck size={14} /> مريض تجريبي: سالم بن حمد العبري.</div>
      </div>
      <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-line2 px-4 py-2.5 text-[13px] hover:border-white/25"><LayoutDashboard size={15} /> العودة إلى لوحة العيادة</Link>
    </div>
  );
}

function ClinicMirror() {
  const { d, p } = usePatient();
  const rows = d.audit.filter((a) => a.patientId === p.id).slice(0, 7);
  return (
    <div className="sticky top-8 max-w-[340px] pt-6">
      <div className="flex items-center gap-2 text-[12px] text-tx3"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-ok" /> ما تراه العيادة الآن لهذا المريض</div>
      <div className="mt-3 space-y-2">
        {rows.map((a) => (
          <div key={a.id} className="rounded-xl border hairline bg-s1 px-3 py-2.5">
            <div className="flex justify-between gap-2 text-[12.5px]"><span className="truncate">{a.action}</span><span className="shrink-0 text-[11px] text-tx3">{ago(a.at)}</span></div>
            <div className="truncate text-[11.5px] text-tx3">{a.outcome}</div>
          </div>
        ))}
      </div>
      <Link href="/appointments?q=العبري" className="mt-4 inline-flex text-[12.5px] text-acc">جدول العيادة لهذا المريض ←</Link>
    </div>
  );
}
