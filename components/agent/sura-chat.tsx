"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, RotateCcw, Sparkles, Wrench, X } from "lucide-react";
import type { AgentMode } from "@/lib/agent/spec";
import { toolLabel, useChat } from "@/lib/agent/chat";
import { useData } from "@/lib/store";
import { PATIENT_APP_USER } from "@/lib/data/seed";
import { cls } from "@/lib/format";

const SUGGEST: Record<AgentMode, string[]> = {
  patient: ["أبي موعد مع دكتور القلب", "كم دوري في الانتظار اليوم؟", "طمنّي على قراءات السوار", "أبغى أغيّر موعدي"],
  staff: ["لخّص لي أداء العيادة اليوم", "وش الاقتراحات اللي تنتظر اعتمادي؟", "احجز لهلال الغافري أقرب موعد قلب", "من المرضى المحالين للطبيب من السوار؟"],
};

export function SuraChat({ mode, className, dense }: { mode: AgentMode; className?: string; dense?: boolean }) {
  const thread = useChat((s) => s.threads[mode]);
  const status = useChat((s) => s.status);
  const { send, confirm, dismiss, reset, checkStatus } = useChat.getState();
  const d = useData();
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (status.enabled === null) void checkStatus(); }, [status.enabled, checkStatus]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [thread.ui.length, thread.busy, thread.step]);
  const first = mode === "patient" ? d.patients.find((p) => p.id === PATIENT_APP_USER)?.name.split(" ")[0] : undefined;
  const submit = (t = text) => {
    if (!t.trim() || thread.busy) return;
    setText("");
    void send(mode, t);
  };

  return (
    <div className={cls("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-3 border-b hairline px-4 py-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-acc/30 bg-brand/25 text-[15px] font-semibold text-acc">س</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[14px] font-semibold">سُرى <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-ok" /></div>
          <div className="truncate text-[11px] text-tx3">
            {status.enabled === null ? "…" : status.enabled ? <span className="text-acc"><Sparkles size={10} className="ml-1 inline" />وكيل ذكاء اصطناعي · {status.model}</span> : <span className="text-warn">وضع القواعد — {status.reason ?? "النموذج اللغوي غير متاح"}</span>}
          </div>
        </div>
        {thread.ui.length > 0 && <button onClick={() => reset(mode)} title="محادثة جديدة" className="grid h-8 w-8 place-items-center rounded-lg text-tx3 hover:bg-white/5 hover:text-tx"><RotateCcw size={14} /></button>}
      </div>

      <div className={cls("flex-1 space-y-3 overflow-y-auto px-4 py-4", dense ? "text-[13px]" : "text-[13.5px]")}>
        <Bubble from="sura">
          {mode === "patient" ? `أهلًا ${first ?? ""}، أنا سُرى من فريق العيادة. أقدر أحجز لك موعدًا، أعرض مواعيدك ودورك في الانتظار، وأطمّنك على قراءات سوارك.` : "أهلًا، أنا سُرى. اسألني عن أداء العيادة، احجز أو ألغِ لمريض، أو راجع اقتراحات الوكلاء التي تنتظر اعتمادك."}
        </Bubble>
        {thread.ui.map((m) =>
          m.from === "note" ? (
            <div key={m.id} className="mx-auto flex max-w-[92%] items-center gap-2 rounded-full border border-ok/25 bg-ok/[0.07] px-3 py-1.5 text-[12px] text-ok"><Check size={13} />{m.text}</div>
          ) : (
            <div key={m.id} className="space-y-2">
              <Bubble from={m.from === "user" ? "user" : "sura"}>{m.text}</Bubble>
              {m.from === "sura" && (m.tools?.length || m.via === "rule") ? (
                <div className="flex flex-wrap gap-1 pr-1">
                  {m.via === "rule" && <span className="rounded-md bg-warn/10 px-1.5 py-0.5 text-[10.5px] text-warn">وضع القواعد</span>}
                  {m.tools?.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-md border border-line2 px-1.5 py-0.5 text-[10.5px] text-tx3"><Wrench size={9} />{toolLabel(t)}</span>)}
                </div>
              ) : null}
              {m.proposals?.map((pid) => {
                const p = thread.proposals[pid];
                if (!p) return null;
                return (
                  <div key={pid} className={cls("mr-1 max-w-[92%] rounded-2xl border p-3.5", p.status === "pending" ? "border-acc/35 bg-brand/[0.12]" : p.status === "done" ? "border-ok/25 bg-ok/[0.05]" : "border-line2 bg-white/[0.02] opacity-70")}>
                    <div className="text-[12px] font-semibold text-acc">{p.title}</div>
                    <div className="mt-1.5 space-y-0.5">{p.lines.map((l, i) => <div key={i} className={cls("text-[13px]", i === 0 ? "font-medium" : "text-tx2")}>{l}</div>)}</div>
                    {p.status === "pending" ? (
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => confirm(mode, pid)} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand text-[13px] font-semibold text-white hover:bg-brand2"><Check size={14} />تأكيد</button>
                        <button onClick={() => dismiss(mode, pid)} className="flex h-9 items-center gap-1 rounded-xl border border-line2 px-3 text-[12.5px] text-tx2 hover:text-tx"><X size={13} />لا</button>
                      </div>
                    ) : (
                      <div className={cls("mt-2 text-[12px]", p.status === "done" ? "text-ok" : "text-tx3")}>{p.status === "done" ? "✓ نُفّذت" : p.status === "failed" ? "تعذّر التنفيذ" : "تجاهلتها"}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ),
        )}
        {thread.busy && (
          <div className="flex items-center gap-2 text-[12px] text-acc">
            <span className="flex gap-1"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-acc" /><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-acc [animation-delay:.2s]" /><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-acc [animation-delay:.4s]" /></span>
            سُرى {thread.step ?? "تفكّر…"}
          </div>
        )}
        <div ref={end} />
      </div>

      {thread.ui.length === 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {SUGGEST[mode].map((s) => <button key={s} onClick={() => submit(s)} className="rounded-full border border-line2 px-3 py-1.5 text-[12px] text-tx2 hover:border-acc/50 hover:text-tx">{s}</button>)}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-end gap-2 border-t hairline p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          rows={1}
          placeholder={mode === "patient" ? "اكتب لسُرى…" : "اطلب من سُرى…"}
          className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-line2 bg-s2 px-3 py-2.5 text-[13.5px] leading-5 text-tx outline-none placeholder:text-tx3 focus:border-acc/60"
        />
        <button type="submit" disabled={!text.trim() || thread.busy} aria-label="إرسال" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white hover:bg-brand2 disabled:opacity-30"><ArrowUp size={17} /></button>
      </form>
    </div>
  );
}

function Bubble({ from, children }: { from: "user" | "sura"; children: React.ReactNode }) {
  return (
    <div className={cls("max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 leading-6", from === "user" ? "mr-auto rounded-tl-md bg-brand text-white" : "rounded-tr-md bg-s3 text-tx")}>
      {children}
    </div>
  );
}
