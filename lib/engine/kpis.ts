import type { AgentId, Data, KpiSnapshot } from "@/types";
import { AGENT_ORDER, CHANNEL } from "@/lib/constants";
import { addDays, dayKey, fmtDate, sameDay, startOfDay, weekdayShort } from "@/lib/time";

/* Every number on every screen comes from here, computed from the records. Nothing is stored as a counter. */

export function kpis(s: Data) {
  const A = s.appointments;
  const today0 = startOfDay(new Date());
  const upcoming = A.filter((a) => new Date(a.start) >= today0 && ["pending", "confirmed", "checked_in", "in_room"].includes(a.status));
  const cancelled = A.filter((a) => a.status === "cancelled");
  const recoveredAppts = A.filter((a) => a.recovered && a.status !== "cancelled");
  const recoveredFrom = new Set(recoveredAppts.map((a) => a.recoveredFrom));
  const rescheduledFrom = new Set(A.filter((a) => a.rescheduledFrom && a.status !== "cancelled").map((a) => a.rescheduledFrom));
  const lost = cancelled.filter((a) => !recoveredFrom.has(a.id) && !rescheduledFrom.has(a.id));
  const billable = A.filter((a) => !["cancelled", "no_show"].includes(a.status));
  const booked = s.inquiries.filter((q) => q.status === "booked");
  const todayAppts = A.filter((a) => sameDay(a.start, today0));
  const openTasks = s.tasks.filter((t) => ["pending", "processing", "requires_approval"].includes(t.status));
  return {
    total: A.length,
    confirmed: A.filter((a) => ["confirmed", "checked_in", "in_room"].includes(a.status)).length,
    pending: A.filter((a) => a.status === "pending").length,
    cancelled: cancelled.length,
    recovered: recoveredAppts.length + rescheduledFrom.size,
    recoveredSlots: recoveredAppts.length,
    recoveryRate: cancelled.length ? (recoveredFrom.size + [...rescheduledFrom].filter((x) => !recoveredFrom.has(x)).length) / cancelled.length : 0,
    noShow: A.filter((a) => a.status === "no_show").length,
    completed: A.filter((a) => a.status === "completed").length,
    upcoming: upcoming.length,
    revenue: billable.reduce((n, a) => n + a.price, 0),
    revenueRealized: s.invoices.filter((i) => i.status === "paid").reduce((n, i) => n + i.amount, 0),
    revenueDue: s.invoices.filter((i) => i.status === "unpaid").reduce((n, i) => n + i.amount, 0),
    revenueScheduled: upcoming.reduce((n, a) => n + a.price, 0),
    revenuePending: upcoming.filter((a) => a.status === "pending").reduce((n, a) => n + a.price, 0),
    recoveredRevenue: recoveredAppts.reduce((n, a) => n + a.price, 0),
    lostRevenue: lost.reduce((n, a) => n + a.price, 0),
    inquiries: s.inquiries.length,
    inquiriesOpen: s.inquiries.filter((q) => q.status === "new" || q.status === "processing").length,
    responseMin: (() => {
      const r = s.inquiries.filter((q) => q.respondedAt).map((q) => (new Date(q.respondedAt!).getTime() - new Date(q.createdAt).getTime()) / 60000);
      return r.length ? r.reduce((n, x) => n + x, 0) / r.length : 0;
    })(),
    booked: booked.length,
    conversion: s.inquiries.length ? booked.length / s.inquiries.length : 0,
    activeWorkflows: openTasks.length + s.events.filter((e) => !e.processed).length,
    approvals: s.tasks.filter((t) => t.status === "requires_approval").length,
    tasksToday: s.tasks.filter((t) => sameDay(t.createdAt, today0)).length,
    tasksCompleted: s.tasks.filter((t) => t.status === "completed").length,
    needsReview: s.reviews.filter((r) => r.status === "open").length,
    todayTotal: todayAppts.filter((a) => a.status !== "cancelled").length,
    todayDone: todayAppts.filter((a) => a.status === "completed").length,
    waiting: todayAppts.filter((a) => a.status === "checked_in").length,
    inRoom: todayAppts.filter((a) => a.status === "in_room").length,
    unpaid: s.invoices.filter((i) => i.status === "unpaid").length,
    patients: s.patients.filter((p) => p.status !== "lead").length,
    leads: s.patients.filter((p) => p.status === "lead").length,
    inactive: s.patients.filter((p) => p.status === "inactive").length,
    returning: Object.values(A.filter((a) => a.status === "completed").reduce<Record<string, number>>((m, a) => ((m[a.patientId] = (m[a.patientId] ?? 0) + 1), m), {})).filter((n) => n >= 2).length,
    enrolled: s.devices.length,
  };
}

export type Kpis = ReturnType<typeof kpis>;

export function snapshot(s: Data): KpiSnapshot {
  const k = kpis(s);
  return { appointments: k.total, confirmed: k.confirmed, cancelled: k.cancelled, recovered: k.recovered, inquiries: k.inquiries, conversion: k.conversion, revenue: k.revenue, recoveredRevenue: k.recoveredRevenue };
}

export function dailyTrend(s: Data, from = -13, to = 6) {
  const today0 = startOfDay(new Date());
  const out = [];
  for (let o = from; o <= to; o++) {
    const d = addDays(today0, o);
    const day = s.appointments.filter((a) => sameDay(a.start, d));
    out.push({
      key: dayKey(d),
      label: o === 0 ? "اليوم" : `${weekdayShort(d).slice(0, 3)} ${d.getDate()}`,
      date: fmtDate(d),
      booked: day.filter((a) => a.status !== "cancelled").length,
      completed: day.filter((a) => a.status === "completed").length,
      cancelled: day.filter((a) => a.status === "cancelled").length,
      recovered: day.filter((a) => a.recovered || a.rescheduledFrom).length,
      future: o > 0,
    });
  }
  return out;
}

export function funnel(s: Data) {
  const total = s.inquiries.length;
  const responded = s.inquiries.filter((q) => q.respondedAt).length;
  const booked = s.inquiries.filter((q) => q.status === "booked");
  const attended = booked.filter((q) => s.appointments.find((a) => a.id === q.appointmentId)?.status === "completed").length;
  return [
    { stage: "استفسارات", value: total },
    { stage: "تم الرد", value: responded },
    { stage: "حجوزات", value: booked.length },
    { stage: "حضور مكتمل", value: attended },
  ];
}

export function revenueBreakdown(s: Data) {
  const k = kpis(s);
  return [
    { name: "محصّل", value: k.revenueRealized, tone: "#2e7bd6" },
    { name: "مستحق", value: k.revenueDue, tone: "#8EA8C3" },
    { name: "مجدول مؤكد", value: k.revenueScheduled - k.revenuePending, tone: "#D9D9D6" },
    { name: "بانتظار التأكيد", value: k.revenuePending, tone: "#D6A85C" },
    { name: "مسترد", value: k.recoveredRevenue, tone: "#B7A6D9" },
    { name: "مفقود بالإلغاء", value: k.lostRevenue, tone: "#D08A80" },
  ];
}

export function recoveryWeekly(s: Data) {
  const today0 = startOfDay(new Date());
  return [-3, -2, -1, 0].map((w) => {
    const from = addDays(today0, w * 7 - 6 + 6);
    const start = addDays(from, -6);
    const end = w === 0 ? addDays(today0, 30) : addDays(from, 1);
    const inRange = (iso: string) => new Date(iso) >= start && new Date(iso) < end;
    const canc = s.appointments.filter((a) => a.status === "cancelled" && inRange(a.start));
    const rec = canc.filter((c) => s.appointments.some((a) => (a.recoveredFrom === c.id || a.rescheduledFrom === c.id) && a.status !== "cancelled")).length;
    return { week: w === 0 ? "هذا الأسبوع" : w === -1 ? "الأسبوع الماضي" : `قبل ${-w} أسابيع`, cancelled: canc.length, recovered: rec };
  });
}

export function agentActivity(s: Data, days = 7) {
  const today0 = startOfDay(new Date());
  const out = [];
  for (let o = -days + 1; o <= 0; o++) {
    const d = addDays(today0, o);
    const row: Record<string, string | number> = { label: o === 0 ? "اليوم" : `${weekdayShort(d).slice(0, 3)} ${d.getDate()}` };
    for (const a of AGENT_ORDER) row[a] = s.tasks.filter((t) => t.agent === a && sameDay(t.createdAt, d)).length;
    out.push(row);
  }
  return out;
}

export function agentStats(s: Data, id: AgentId) {
  const ts = s.tasks.filter((t) => t.agent === id);
  return {
    total: ts.length,
    completed: ts.filter((t) => t.status === "completed").length,
    approvals: ts.filter((t) => t.status === "requires_approval").length,
    failed: ts.filter((t) => t.status === "failed").length,
    processing: ts.filter((t) => t.status === "processing" || t.status === "pending").length,
    last: ts[0],
  };
}

export function campaignStats(s: Data) {
  return s.campaigns.map((c) => {
    const qs = s.inquiries.filter((q) => q.campaignId === c.id);
    const booked = qs.filter((q) => q.status === "booked");
    const appts = booked.map((q) => s.appointments.find((a) => a.id === q.appointmentId)).filter((a) => a && a.status !== "cancelled" && a.status !== "no_show");
    const revenue = appts.reduce((n, a) => n + (a?.price ?? 0), 0);
    return { ...c, inquiries: qs.length, bookings: booked.length, conversion: qs.length ? booked.length / qs.length : 0, revenue, cpa: booked.length ? c.budget / booked.length : null, roas: c.budget ? revenue / c.budget : 0 };
  });
}

export function leadSources(s: Data) {
  const m: Record<string, number> = {};
  for (const q of s.inquiries) m[q.channel] = (m[q.channel] ?? 0) + 1;
  return Object.entries(m).map(([k, v]) => ({ name: CHANNEL[k as keyof typeof CHANNEL] ?? k, value: v })).sort((a, b) => b.value - a.value);
}

export function inquiryTrend(s: Data) {
  const today0 = startOfDay(new Date());
  const out = [];
  for (let o = -13; o <= 0; o++) {
    const d = addDays(today0, o);
    const qs = s.inquiries.filter((q) => sameDay(q.createdAt, d));
    out.push({ label: o === 0 ? "اليوم" : `${d.getDate()}`, inquiries: qs.length, booked: qs.filter((q) => q.status === "booked").length });
  }
  return out;
}
