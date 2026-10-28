"use client";
import { asset } from "@/lib/asset";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, Building2, LayoutDashboard, Megaphone, Menu, MonitorPlay, RotateCcw, Smartphone, Sparkles, Watch, X, Presentation } from "lucide-react";
import { useStore } from "@/lib/store";
import { act } from "@/lib/store/actions";
import { kpis } from "@/lib/engine/kpis";
import { ACTOR_LABEL } from "@/lib/constants";
import { ago, fmtLongDate, sameDay } from "@/lib/time";
import { cls } from "@/lib/format";
import { Button, Dialog } from "@/components/ui";
import { SuraChat } from "@/components/agent/sura-chat";

type K = ReturnType<typeof kpis>;
type Item = { href: string; label: string; icon: typeof LayoutDashboard; match: string[]; badge?: (k: K, step: number) => number | string | null };

/* seven destinations; related screens live as tabs inside one destination */
const NAV: Item[] = [
  { href: "/", label: "لوحة القيادة", icon: LayoutDashboard, match: ["/", "/dashboard"] },
  { href: "/agents", label: "سُرى والوكلاء", icon: Sparkles, match: ["/agents"], badge: (k) => k.approvals || null },
  { href: "/demo", label: "رحلة التشغيل", icon: MonitorPlay, match: ["/demo"], badge: (_, s) => (s > 0 && s < 8 ? `${s}/8` : null) },
  { href: "/operations", label: "العيادة", icon: Building2, match: ["/operations", "/appointments", "/patients"] },
  { href: "/care", label: "الرعاية المتصلة", icon: Watch, match: ["/care", "/doctor"], badge: (k) => k.needsReview || null },
  { href: "/growth", label: "النمو", icon: Megaphone, match: ["/growth"] },
  { href: "/patient-app", label: "تطبيق المريض", icon: Smartphone, match: ["/patient-app"] },
];

const SUB: Record<string, [string, string][]> = {
  "/operations": [["/operations", "اليوم"], ["/appointments", "المواعيد"], ["/patients", "المرضى"]],
  "/care": [["/care", "السوار المتصل"], ["/doctor", "لوحة الطبيب"]],
};

const norm = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);
const itemFor = (path: string) => NAV.find((i) => i.match.some((m) => (m === "/" ? path === "/" : path.startsWith(m)))) ?? NAV[0];

export function Shell({ children }: { children: ReactNode }) {
  const path = norm(usePathname());
  const [open, setOpen] = useState(false);
  const [sura, setSura] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const sub = SUB[itemFor(path).href];
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 border-l hairline bg-[#0d0d0d] lg:block">
        <Sidebar path={path} />
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <aside className="absolute inset-y-0 right-0 w-[260px] border-l hairline bg-[#0d0d0d]">
            <button aria-label="إغلاق القائمة" onClick={() => setOpen(false)} className="absolute left-3 top-4 grid h-9 w-9 place-items-center rounded-lg text-tx3 hover:bg-white/5"><X size={18} /></button>
            <Sidebar path={path} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar path={path} onMenu={() => setOpen(true)} onSura={() => setSura(true)} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-16 pt-5 md:px-7">
          {sub && (
            <div className="mb-5 inline-flex rounded-xl border hairline bg-s1 p-1">
              {sub.map(([h, l]) => (
                <Link key={h} href={h} className={cls("h-8 rounded-lg px-4 text-[13px] leading-8", path === h ? "bg-brand text-white" : "text-tx2 hover:text-tx")}>{l}</Link>
              ))}
            </div>
          )}
          {children}
        </main>
      </div>
      {sura && (
        <div className="fixed inset-0 z-[65] bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && setSura(false)}>
          <div className="fade-up absolute inset-y-0 left-0 flex w-full max-w-[440px] flex-col border-r border-line2 bg-s1 shadow-2xl">
            <button onClick={() => setSura(false)} aria-label="إغلاق" className="absolute left-3 top-3.5 z-10 grid h-8 w-8 place-items-center rounded-lg text-tx3 hover:bg-white/5 hover:text-tx"><X size={16} /></button>
            <SuraChat mode="staff" className="h-full" />
          </div>
        </div>
      )}
    </div>
  );
}

function Sidebar({ path }: { path: string }) {
  const data = useStore((s) => s.data);
  const presentation = useStore((s) => s.presentation);
  const setPresentation = useStore((s) => s.setPresentation);
  const k = useMemo(() => kpis(data), [data]);
  const [confirm, setConfirm] = useState(false);
  const active = itemFor(path);
  const processedToday = data.tasks.filter((t) => sameDay(t.createdAt, new Date())).length;
  return (
    <div className="flex h-full flex-col">
      <Link href="/" className="flex items-center gap-3 px-5 pb-5 pt-6">
        {/* official TAWD logo, white variant, used as supplied */}
        <img src={asset("/brand/tawd-logo-white.png")} alt="TAWD طود" className="h-[24px] w-auto" />
      </Link>
      <div className="mx-4 mb-4 rounded-xl border hairline bg-s1 px-3 py-2.5">
        <div className="truncate text-[12.5px] font-medium">{data.clinic.name}</div>
        <div className="mt-0.5 text-[11px] text-tx3">{data.clinic.city} · بيانات تجريبية</div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {NAV.map((it) => {
          const on = it === active;
          const b = it.badge?.(k, data.demo.step);
          return (
            <Link key={it.href} href={it.href} className={cls("group flex h-10 items-center gap-3 rounded-lg px-3 text-[13.5px] transition-colors", on ? "bg-brand/20 text-tx" : "text-tx2 hover:bg-white/[0.035] hover:text-tx")}>
              <it.icon size={16} strokeWidth={1.8} className={on ? "text-acc" : "text-tx3 group-hover:text-tx2"} />
              <span className="flex-1 truncate">{it.label}</span>
              {b ? <span className="latin rounded-md bg-warn/15 px-1.5 text-[11px] font-semibold leading-5 text-warn">{b}</span> : null}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-2 border-t hairline p-3">
        <div className="rounded-xl bg-s1 px-3 py-2.5">
          <div className="flex items-center gap-2 text-[12px] font-medium"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-ok" />TAWD Intelligence يعمل</div>
          <div className="mt-1 text-[11px] text-tx3"><span className="latin num">{processedToday}</span> مهمة اليوم · <span className="latin num">{k.approvals}</span> بانتظار الاعتماد</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPresentation(!presentation)} className={cls("flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border text-[12px]", presentation ? "border-acc/40 bg-brand/15 text-acc" : "border-line2 text-tx2 hover:text-tx")}>
            <Presentation size={14} /> وضع العرض
          </button>
          <button onClick={() => setConfirm(true)} title="إعادة ضبط البيانات التجريبية" className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line2 px-3 text-[12px] text-tx2 hover:text-tx">
            <RotateCcw size={14} /> ضبط
          </button>
        </div>
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="إعادة ضبط البيانات التجريبية" footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>إلغاء</Button><Button variant="primary" onClick={() => { act.resetAll(); setConfirm(false); }}>إعادة الضبط</Button></>}>
        <p className="text-[13.5px] leading-7 text-tx2">ستعود كل الوحدات (المواعيد، الوكلاء، السوار، النمو، سجل التدقيق) إلى البيانات التجريبية الأصلية. تبقى البيانات محلية في هذا المتصفح فقط.</p>
      </Dialog>
    </div>
  );
}

const TITLES: Record<string, string> = { "/dashboard": "لوحة القيادة", "/appointments": "المواعيد", "/patients": "المرضى", "/doctor": "لوحة الطبيب", "/operations": "العيادة — اليوم", "/care": "الرعاية المتصلة" };

function TopBar({ path, onMenu, onSura }: { path: string; onMenu: () => void; onSura: () => void }) {
  const data = useStore((s) => s.data);
  const [bell, setBell] = useState(false);
  const title = TITLES[path] ?? itemFor(path).label;
  const stale = !sameDay(data.seededAt, new Date());
  const notes = data.audit.filter((a) => a.actor !== "staff").slice(0, 8);
  return (
    <>
      {stale && (
        <div className="flex flex-wrap items-center justify-center gap-3 border-b border-warn/20 bg-warn/[0.06] px-4 py-2 text-[12.5px] text-warn">
          <span>البيانات التجريبية مولّدة في يوم سابق، لذلك قد لا يطابق جدول «اليوم» تاريخ اليوم.</span>
          <button onClick={() => act.resetAll()} className="rounded-md border border-warn/30 px-2 py-0.5 hover:bg-warn/10">مزامنة التواريخ</button>
        </div>
      )}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b hairline bg-bg/85 px-4 backdrop-blur md:px-7">
        <button onClick={onMenu} aria-label="القائمة" className="grid h-9 w-9 place-items-center rounded-lg border border-line2 text-tx2 lg:hidden"><Menu size={18} /></button>
        <img src={asset("/brand/tawd-mark-white.png")} alt="" className="h-5 w-auto lg:hidden" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">{title}</div>
          <div className="hidden text-[11px] text-tx3 sm:block">{fmtLongDate(new Date())} · {data.clinic.name}</div>
        </div>
        <button onClick={onSura} className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-[13px] font-medium text-white hover:bg-brand2">
          <Sparkles size={15} /> <span className="hidden sm:inline">اسأل سُرى</span>
        </button>
        <div className="relative">
          <button onClick={() => setBell(!bell)} aria-label="الإشعارات" className="relative grid h-9 w-9 place-items-center rounded-lg border border-line2 text-tx2 hover:text-tx">
            <Bell size={16} />
            <span className="absolute -left-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{Math.min(9, notes.length)}</span>
          </button>
          {bell && (
            <div className="fade-up absolute left-0 top-11 z-50 w-[340px] max-w-[calc(100vw-32px)] rounded-2xl border border-line2 bg-s1 p-2 shadow-2xl">
              <div className="px-3 py-2 text-[12px] text-tx3">آخر ما نفّذته المنظومة</div>
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg px-3 py-2 hover:bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-2 text-[12.5px]"><span className="truncate font-medium">{n.action}</span><span className="shrink-0 text-[11px] text-tx3">{ago(n.at)}</span></div>
                  <div className="truncate text-[11.5px] text-tx3">{ACTOR_LABEL[n.actor]} · {n.outcome}</div>
                </div>
              ))}
              <Link href="/agents#audit" onClick={() => setBell(false)} className="mt-1 block rounded-lg px-3 py-2 text-center text-[12px] text-acc hover:bg-white/[0.03]">سجل التدقيق الكامل</Link>
            </div>
          )}
        </div>
      </header>
    </>
  );
}
