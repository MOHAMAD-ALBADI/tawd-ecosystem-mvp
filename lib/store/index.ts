"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Data } from "@/types";
import { DATA_VERSION, buildSeed } from "@/lib/data/seed";
import { runOrchestrator } from "@/lib/engine/orchestrator";

/* One store for the whole product, persisted to localStorage. Every write goes through `mutate`, which works
   on a copy, lets TAWD Intelligence drain the events the write produced, and commits only on success. */

export interface Toast { id: number; text: string; tone: "ok" | "bad" | "info" }

interface Store {
  data: Data;
  hydrated: boolean;
  presentation: boolean;
  toasts: Toast[];
  mutate: (fn: (d: Data) => void, okText?: string) => boolean;
  reset: () => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  setPresentation: (v: boolean) => void;
}

let toastSeq = 0;

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      data: buildSeed(),
      hydrated: false,
      presentation: false,
      toasts: [],
      mutate: (fn, okText) => {
        const d = structuredClone(get().data);
        try {
          fn(d);
          runOrchestrator(d);
        } catch (e) {
          get().toast(e instanceof Error ? e.message : "تعذّر تنفيذ الإجراء", "bad");
          return false;
        }
        set({ data: d });
        if (okText) get().toast(okText, "ok");
        return true;
      },
      reset: () => {
        set({ data: buildSeed() });
        get().toast("أُعيدت البيانات التجريبية إلى حالتها الأصلية", "info");
      },
      toast: (text, tone = "ok") => {
        const id = ++toastSeq;
        set({ toasts: [...get().toasts, { id, text, tone }].slice(-4) });
        setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3800);
      },
      setPresentation: (v) => set({ presentation: v }),
    }),
    {
      name: "tawd-ecosystem",
      version: DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ data: s.data, presentation: s.presentation }),
      skipHydration: true,
      migrate: () => ({ data: buildSeed(), presentation: false }) as unknown as Store,
    },
  ),
);

export const useData = () => useStore((s) => s.data);
export const mutate = (fn: (d: Data) => void, okText?: string) => useStore.getState().mutate(fn, okText);
