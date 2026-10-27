"use client";
import { useEffect } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useStore } from "@/lib/store";
import { DATA_VERSION, buildSeed } from "@/lib/data/seed";
import { SimulationRunner } from "@/components/care/simulation-runner";
import { cls } from "@/lib/format";
import { act } from "@/lib/store/actions";

/* The app renders only after the browser store is loaded, so server HTML never disagrees with local data. */
export function Providers({ children }: { children: React.ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  const presentation = useStore((s) => s.presentation);

  useEffect(() => {
    let alive = true;
    Promise.resolve(useStore.persist.rehydrate()).then(() => {
      if (!alive) return;
      const d = useStore.getState().data;
      if (!d || d.version !== DATA_VERSION) useStore.setState({ data: buildSeed() });
      /* a simulation never resumes silently after a reload */
      useStore.setState((s) => ({ hydrated: true, data: { ...s.data, sim: { ...s.data.sim, running: false } } }));
    });
    /* another tab (the patient app, say) wrote the store: pick its version up */
    const onStorage = (e: StorageEvent) => {
      if (e.key === "tawd-ecosystem") void useStore.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.presentation = String(presentation);
  }, [presentation]);

  /* inspection handle for the automated tests and for curious reviewers in the console */
  useEffect(() => {
    (window as unknown as { __tawd: unknown }).__tawd = { act, store: useStore };
  }, []);

  if (!hydrated)
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 text-sm text-tx3">
          <span className="pulse-dot h-2 w-2 rounded-full bg-acc" /> جارٍ تحميل منظومة طود…
        </div>
      </div>
    );
  return (
    <>
      {children}
      <SimulationRunner />
      <Toasts />
    </>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-5 left-5 z-[80] flex w-[min(360px,calc(100vw-40px))] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.tone === "ok" ? CheckCircle2 : t.tone === "bad" ? XCircle : Info;
        return (
          <div key={t.id} role="status" className={cls("fade-up flex items-start gap-2.5 rounded-xl border bg-s2/95 px-4 py-3 text-[13px] shadow-2xl backdrop-blur", t.tone === "bad" ? "border-bad/40" : "border-line2")}>
            <Icon size={16} className={cls("mt-0.5 shrink-0", t.tone === "ok" ? "text-ok" : t.tone === "bad" ? "text-bad" : "text-info")} />
            <span className="leading-6">{t.text}</span>
          </div>
        );
      })}
    </div>
  );
}
