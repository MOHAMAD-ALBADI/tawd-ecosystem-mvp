"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Specialty } from "@/types";
import type { AgentMode } from "./spec";
import { execTool, executeProposal, logTurn, type Proposal } from "./tools";
import { useStore } from "@/lib/store";
import { PATIENT_APP_USER } from "@/lib/data/seed";
import { classify } from "@/lib/engine/orchestrator";
import { SPECIALTY } from "@/lib/constants";
import { asset } from "@/lib/asset";
import { dayKey, fmtLongDate, fmtTime } from "@/lib/time";

/* Sura's conversation loop in the browser: send the conversation to /api/agent, run whatever tools the model
   asks for against the clinic data, send the results back, repeat until the model answers in words. */

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type ChatMsg = { role: "user" | "assistant" | "tool"; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
export interface UiMsg { id: string; from: "user" | "sura" | "note"; text: string; proposals?: string[]; tools?: string[]; via?: "llm" | "rule" }
interface Thread { ui: UiMsg[]; history: ChatMsg[]; proposals: Record<string, Proposal>; busy: boolean; step?: string }

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || asset("/api/agent");
const MAX_ROUNDS = 6;

const STEP: Record<string, string> = {
  get_clinic_info: "تراجع معلومات العيادة…",
  find_available_slots: "تبحث في المواعيد الشاغرة…",
  get_my_appointments: "تراجع مواعيدك…",
  propose_booking: "تجهّز ملخص الحجز…",
  propose_cancellation: "تجهّز بطاقة الإلغاء…",
  propose_reschedule: "تجهّز بطاقة تغيير الموعد…",
  get_my_band_summary: "تقرأ بيانات السوار…",
  get_queue_status: "تتحقق من الطابور…",
  notify_clinic_staff: "تحوّل الطلب لفريق العيادة…",
  get_clinic_overview: "تحسب مؤشرات العيادة…",
  get_today_schedule: "تراجع جدول اليوم…",
  search_patients: "تبحث في سجل المرضى…",
  list_pending_approvals: "تراجع اقتراحات الوكلاء…",
  propose_approval: "تجهّز بطاقة الاعتماد…",
  get_care_reviews: "تراجع إحالات السوار…",
  run_reactivation_scan: "تطلب من وكيل النمو فحص المرضى…",
};
export const toolLabel = (t: string) => STEP[t]?.replace("…", "") ?? t;

const empty = (): Thread => ({ ui: [], history: [], proposals: {}, busy: false });
let mseq = 0;
const mid = () => `m-${Date.now().toString(36)}-${++mseq}`;

function context(mode: AgentMode) {
  const d = useStore.getState().data;
  const now = new Date();
  const lines = [`العيادة: ${d.clinic.name} — ${d.clinic.city}، عُمان (بيانات تجريبية)`, `الآن: ${fmtLongDate(now)} الساعة ${fmtTime(now.toISOString())} بتوقيت مسقط. تاريخ اليوم: ${dayKey(now)}`];
  if (mode === "patient") {
    const p = d.patients.find((x) => x.id === PATIENT_APP_USER)!;
    lines.push(`المريض: ${p.name}، ${p.age} سنة${p.careProgram ? `، مسجّل في برنامج «${p.careProgram}» ويرتدي سوار طود` : ""}.`);
  } else lines.push("المستخدم: موظف في فريق العيادة (استقبال/إدارة).");
  return lines.join("\n");
}

/* Deterministic fallback when the model is unreachable (no credit, offline, rate-limited). It answers from the same
   tools, so the facts and the confirm cards are identical; only the wording is fixed. Labelled as rules in the UI. */
type R = { reply: string; proposals: Proposal[]; tools: string[] };
function ruleTurn(mode: AgentMode, text: string): R {
  const ctx = { patientId: mode === "patient" ? PATIENT_APP_USER : undefined };
  const run = (name: string, args: Record<string, unknown> = {}) => execTool(mode, name, args, ctx);
  const has = (re: RegExp) => re.test(text.replace(/[أإآ]/g, "ا"));
  const c = classify(text);
  const bookFirst = (specialty: Specialty, patientId?: string, n = 3): R => {
    const r = run("find_available_slots", { specialty }).result as { slots?: { slot_id: string }[]; note?: string };
    const props = (r.slots ?? []).slice(0, n).map((s) => run("propose_booking", { slot_id: s.slot_id, patient_id: patientId }).proposal!).filter(Boolean);
    return { reply: props.length ? `هذه أقرب المواعيد في ${SPECIALTY[specialty]}. اختر المناسب واضغط «تأكيد».` : r.note ?? "لا توجد مواعيد شاغرة في هذا التخصص خلال الأسبوع.", proposals: props, tools: ["find_available_slots", "propose_booking"] };
  };

  if (mode === "patient") {
    if (has(/سوار|قراء|نبض|اكسجين|حرار/)) {
      const r = run("get_my_band_summary").result as { last_reading?: { heart_rate: number; spo2: number; skin_temp: number; at: string }; doctor_review: string; connected: boolean };
      const l = r.last_reading;
      return { reply: l ? `آخر قراءة من سوارك (${l.at}): النبض ${l.heart_rate}، تشبّع الأكسجين ${l.spo2}%، حرارة الجلد ${l.skin_temp}°. ${r.doctor_review}. هذه قراءات توضيحية للاطلاع وليست تشخيصًا.` : "لم تصل قراءات من السوار بعد.", proposals: [], tools: ["get_my_band_summary"] };
    }
    if (has(/دور|طابور|انتظار/)) {
      const r = run("get_queue_status").result as { has_appointment_today: boolean; patients_ahead?: number; estimated_wait_minutes?: number; doctor?: string; time?: string };
      return { reply: r.has_appointment_today ? `موعدك اليوم ${r.time} مع ${r.doctor}. أمامك ${r.patients_ahead} مرضى، والانتظار التقديري نحو ${r.estimated_wait_minutes} دقيقة.` : "ليس لديك موعد اليوم.", proposals: [], tools: ["get_queue_status"] };
    }
    if (c.intent === "booking" && c.specialty) return bookFirst(c.specialty);
    if (has(/الغ|اغير|تغيير|موعدي|مواعيد/)) {
      const r = run("get_my_appointments").result as { upcoming: { id: string; when: string; doctor: string }[] };
      if (!r.upcoming.length) return { reply: "لا توجد لديك مواعيد قادمة.", proposals: [], tools: ["get_my_appointments"] };
      const cancel = has(/الغ/) ? run("propose_cancellation", { appointment_id: r.upcoming[0].id }).proposal : undefined;
      return { reply: `مواعيدك القادمة: ${r.upcoming.map((a) => `${a.when} مع ${a.doctor}`).join("، ")}.${cancel ? " جهّزت لك بطاقة إلغاء أقرب موعد؛ اضغط تأكيد إن أردت." : " لتغيير موعد افتح «مواعيدي» واضغط «تغيير»."}`, proposals: cancel ? [cancel] : [], tools: ["get_my_appointments", ...(cancel ? ["propose_cancellation"] : [])] };
    }
    return { reply: "أقدر أحجز لك موعدًا (اذكر التخصص: قلب، أسنان، باطنية، جلدية)، أعرض مواعيدك، أوضح دورك في الانتظار، أو أطمّنك على قراءات السوار.", proposals: [], tools: [] };
  }

  if (has(/اعتماد|اقتراح|تنتظر/)) {
    const r = run("list_pending_approvals").result as { pending: { task_id: string; title: string }[] };
    const props = r.pending.slice(0, 3).map((t) => run("propose_approval", { task_id: t.task_id }).proposal!).filter(Boolean);
    return { reply: r.pending.length ? `يوجد ${r.pending.length} اقتراح بانتظار اعتمادك. راجع البطاقات أدناه.` : "لا توجد اقتراحات بانتظار الاعتماد.", proposals: props, tools: ["list_pending_approvals", "propose_approval"] };
  }
  if (has(/سوار|محال|احال|مراجعه|مراجعة|طبيب/)) {
    const r = run("get_care_reviews").result as { reviews: { patient: string; status: string; reasons: string[] }[] };
    return { reply: r.reviews.length ? r.reviews.map((x) => `${x.patient} (${x.status}): ${x.reasons[0]}`).join(" — ") : "لا توجد إحالات من السوار حاليًا.", proposals: [], tools: ["get_care_reviews"] };
  }
  if (has(/احجز|حجز|موعد/) && c.specialty) {
    const words = text.split(/\s+/).map((w) => w.replace(/^ل/, "")).filter((w) => w.length > 2);
    const d = useStore.getState().data;
    const p = d.patients.find((x) => words.filter((w) => x.name.includes(w)).length >= 2);
    if (!p) return { reply: "اذكر اسم المريض كما في السجل (الاسم والعائلة) لأجهّز الحجز.", proposals: [], tools: ["search_patients"] };
    const r = bookFirst(c.specialty, p.id, 2);
    return { ...r, reply: r.proposals.length ? `وجدت ${p.name}. هذه أقرب مواعيد ${SPECIALTY[c.specialty]}؛ اضغط «تأكيد» على المناسب.` : r.reply, tools: ["search_patients", ...r.tools] };
  }
  const k = run("get_clinic_overview").result as { today: { appointments: number; completed: number; waiting: number; with_doctor: number }; awaiting_confirmation: number; recovered: number; recovery_rate: string; conversion: string; approvals_waiting: number; open_care_reviews: number };
  return { reply: `اليوم ${k.today.appointments} موعدًا: ${k.today.completed} مكتملة، ${k.today.waiting} في الانتظار، ${k.today.with_doctor} مع الأطباء. بانتظار تأكيد الحضور ${k.awaiting_confirmation}. استرددنا ${k.recovered} موعدًا (${k.recovery_rate}) والتحويل ${k.conversion}. لديك ${k.approvals_waiting} اقتراحات للاعتماد و${k.open_care_reviews} إحالة سوار مفتوحة.`, proposals: [], tools: ["get_clinic_overview"] };
}

const REASON: Record<string, string> = { credit_balance_exhausted: "رصيد OpenAI منتهٍ", insufficient_quota: "رصيد OpenAI منتهٍ", no_key: "لا يوجد مفتاح نموذج على الخادم", rate_limited: "تجاوز حد الطلبات مؤقتًا" };

interface ChatStore {
  threads: Record<AgentMode, Thread>;
  status: { enabled: boolean | null; model?: string; reason?: string };
  checkStatus: () => Promise<void>;
  send: (mode: AgentMode, text: string) => Promise<void>;
  confirm: (mode: AgentMode, proposalId: string) => void;
  dismiss: (mode: AgentMode, proposalId: string) => void;
  reset: (mode: AgentMode) => void;
}

export const useChat = create<ChatStore>()(
  persist(
    (set, get) => {
      const patch = (mode: AgentMode, f: (t: Thread) => Partial<Thread>) => set((s) => ({ threads: { ...s.threads, [mode]: { ...s.threads[mode], ...f(s.threads[mode]) } } }));
      return {
        threads: { patient: empty(), staff: empty() },
        status: { enabled: null },
        checkStatus: async () => {
          try {
            const r = await fetch(AGENT_URL, { cache: "no-store" });
            const j = (await r.json()) as { enabled?: boolean; model?: string };
            set({ status: { enabled: !!j.enabled, model: j.model ?? undefined } });
          } catch {
            set({ status: { enabled: false } });
          }
        },
        send: async (mode, raw) => {
          const text = raw.trim();
          if (!text || get().threads[mode].busy) return;
          const ctx = { patientId: mode === "patient" ? PATIENT_APP_USER : undefined };
          const start = get().threads[mode].history;
          const history: ChatMsg[] = [...start, { role: "user", content: text }];
          patch(mode, (t) => ({ ui: [...t.ui, { id: mid(), from: "user", text }], busy: true, step: "تفكّر…" }));
          const tools: string[] = [];
          const proposals: Proposal[] = [];
          let reply = "";
          let via: "llm" | "rule" = "llm";
          try {
            if (get().status.enabled === false) throw new Error("disabled");
            for (let round = 0; round < MAX_ROUNDS; round++) {
              const r = await fetch(AGENT_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, messages: history, context: context(mode) }) });
              if (!r.ok) {
                const e = (await r.json().catch(() => ({}))) as { error?: string; code?: string };
                const why = REASON[e.code ?? ""] ?? REASON[e.error ?? ""];
                /* a hard provider refusal will not fix itself this session: stop calling until the page reloads */
                if (why) set((s) => ({ status: { ...s.status, enabled: false, reason: why } }));
                throw new Error(e.code ?? e.error ?? `agent ${r.status}`);
              }
              const j = (await r.json()) as { message?: { content: string | null; tool_calls?: ToolCall[] } };
              const m = j.message;
              if (!m) throw new Error("empty");
              history.push({ role: "assistant", content: m.content ?? null, ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}) });
              if (!m.tool_calls?.length) { reply = m.content ?? ""; break; }
              for (const tc of m.tool_calls) {
                patch(mode, () => ({ step: STEP[tc.function.name] ?? "تنفّذ…" }));
                let args: Record<string, unknown> = {};
                try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* model sent bad JSON: tool reports an error */ }
                const out = execTool(mode, tc.function.name, args, ctx);
                tools.push(tc.function.name);
                if (out.proposal) proposals.push(out.proposal);
                history.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(out.result) });
              }
            }
            if (!reply) reply = proposals.length ? "جهّزت لك البطاقة أدناه، اضغط «تأكيد» للتنفيذ." : "تم.";
          } catch {
            via = "rule";
            const r = ruleTurn(mode, text);
            reply = r.reply;
            proposals.splice(0, proposals.length, ...r.proposals);
            tools.splice(0, tools.length, ...r.tools);
            history.splice(0, history.length, ...start, { role: "user", content: text }, { role: "assistant", content: reply });
          }
          patch(mode, (t) => ({
            history: history.slice(-40),
            busy: false,
            step: undefined,
            proposals: { ...t.proposals, ...Object.fromEntries(proposals.map((p) => [p.id, p])) },
            ui: [...t.ui, { id: mid(), from: "sura", text: reply, proposals: proposals.map((p) => p.id), tools: [...new Set(tools)], via }],
          }));
          logTurn(mode, text, [...new Set(tools)], reply, via, ctx.patientId);
        },
        confirm: (mode, id) => {
          const p = get().threads[mode].proposals[id];
          if (!p || p.status !== "pending") return;
          const ok = executeProposal(mode, p);
          const done: Record<Proposal["kind"], string> = { book: "تم الحجز، وظهر الموعد في جدول العيادة وأُرسل طلب تأكيد الحضور.", cancel: "أُلغي الموعد، ووصل الحدث إلى وكيل الاسترداد.", reschedule: "تغيّر الموعد في جدول العيادة.", approve: "اعتُمد الاقتراح ونفّذه الوكيل." };
          patch(mode, (t) => ({
            proposals: { ...t.proposals, [id]: { ...p, status: ok ? "done" : "failed" } },
            ui: [...t.ui, { id: mid(), from: "note", text: ok ? done[p.kind] : "تعذّر التنفيذ — ربما حُجز الموعد للتو. اطلب من سُرى خيارًا آخر." }],
            history: [...t.history, { role: "user", content: ok ? `(ضغطتُ «تأكيد» على بطاقة ${p.title}: ${p.lines.join(" | ")} — نُفّذت بنجاح)` : `(ضغطتُ «تأكيد» على بطاقة ${p.title} لكن التنفيذ تعذّر)` }],
          }));
        },
        dismiss: (mode, id) => {
          const p = get().threads[mode].proposals[id];
          if (!p || p.status !== "pending") return;
          patch(mode, (t) => ({ proposals: { ...t.proposals, [id]: { ...p, status: "dismissed" } }, history: [...t.history, { role: "user", content: `(تجاهلتُ بطاقة ${p.title})` }] }));
        },
        reset: (mode) => patch(mode, () => empty()),
      };
    },
    {
      name: "tawd-sura-chat",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ threads: { patient: { ...s.threads.patient, busy: false, step: undefined }, staff: { ...s.threads.staff, busy: false, step: undefined } } }),
    },
  ),
);
