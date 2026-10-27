"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { act } from "@/lib/store/actions";

/* Mounted once at the root, so a running band simulation keeps streaming while the presenter moves to the
   doctor dashboard to watch the review arrive. */
export function SimulationRunner() {
  const running = useStore((s) => s.data.sim.running);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const { sim } = useStore.getState().data;
      if (!sim.running) return;
      const ok = act.addReading(sim.patientId, sim.mode);
      if (!ok) act.setSim({ running: false });
    }, 1700);
    return () => clearInterval(t);
  }, [running]);
  return null;
}
