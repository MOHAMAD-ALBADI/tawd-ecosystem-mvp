import { CalendarClock, CheckCheck, HeartPulse, MessagesSquare, RefreshCcw, TrendingUp, Workflow } from "lucide-react";
import type { AgentId } from "@/types";

export function AgentIcon({ id, size = 16 }: { id: AgentId | "orchestrator"; size?: number }) {
  const I = { sura: MessagesSquare, scheduling: CalendarClock, attendance: CheckCheck, recovery: RefreshCcw, growth: TrendingUp, care: HeartPulse, orchestrator: Workflow }[id];
  return <I size={size} strokeWidth={1.8} />;
}
