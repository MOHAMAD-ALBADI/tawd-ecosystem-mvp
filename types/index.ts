/* TAWD domain model. Every screen reads these records; no screen keeps its own counters. */

export type Specialty = "cardiology" | "dental" | "internal" | "dermatology";
export type Channel = "whatsapp" | "instagram" | "web" | "phone" | "app";

export interface Clinic {
  id: string;
  name: string;
  nameEn: string;
  city: string;
  model: "full_os" | "ops_layer";
}

export interface Doctor {
  id: string;
  name: string;
  specialty: Specialty;
  title: string;
  fee: number;
  room: string;
  available: boolean;
}

export type PatientStatus = "active" | "inactive" | "lead";

export interface Patient {
  id: string;
  name: string;
  phone: string;
  age: number;
  gender: "M" | "F";
  status: PatientStatus;
  source: string; // campaign id, "direct" or "referral"
  createdAt: string;
  lastVisit?: string;
  careProgram?: string;
  deviceId?: string;
  featured?: boolean;
  note?: string;
}

export type ApptStatus = "pending" | "confirmed" | "checked_in" | "in_room" | "completed" | "cancelled" | "no_show";
export type ApptSource = "sura" | "staff" | "patient_app" | "recovery" | "phone";

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  start: string; // ISO
  status: ApptStatus;
  source: ApptSource;
  price: number;
  confirmation: "not_sent" | "sent" | "confirmed" | "declined";
  createdAt: string;
  checkInAt?: string;
  cancelReason?: string;
  cancelledBy?: "patient" | "clinic";
  recovered?: boolean; // this booking filled a slot released by a cancellation
  recoveredFrom?: string;
  rescheduledFrom?: string;
  inquiryId?: string;
  demo?: boolean;
}

export type InquiryStatus = "new" | "processing" | "booked" | "answered" | "lost";

export interface Inquiry {
  id: string;
  patientId?: string;
  name: string;
  phone?: string;
  channel: Channel;
  campaignId?: string;
  text: string;
  specialty?: Specialty;
  intent?: "booking" | "question" | "cancel" | "other";
  status: InquiryStatus;
  createdAt: string;
  respondedAt?: string;
  appointmentId?: string;
  demo?: boolean;
}

export interface Message {
  id: string;
  threadId: string; // inquiry id
  from: "patient" | "sura" | "staff" | "system";
  text: string;
  at: string;
  mode?: "rule" | "llm" | "simulated";
  card?: { kind: "slot" | "booking" | "confirm" | "recovery"; title: string; lines: string[] };
}

export interface Campaign {
  id: string;
  name: string;
  channel: Channel;
  specialty?: Specialty;
  budget: number;
  startDate: string;
  status: "active" | "paused" | "draft";
  createdBy?: "seed" | "staff";
}

export interface Invoice {
  id: string;
  appointmentId: string;
  patientId: string;
  amount: number;
  status: "paid" | "unpaid";
  issuedAt: string;
}

export interface WaitlistEntry {
  id: string;
  patientId: string;
  specialty: Specialty;
  doctorId?: string;
  since: string;
  status: "waiting" | "booked" | "removed";
  note: string;
}

export interface WearableDevice {
  id: string;
  patientId: string;
  model: string;
  status: "connected" | "disconnected";
  battery: number;
  firmware: string;
  lastSync: string;
}

export interface Reading {
  id: string;
  deviceId: string;
  patientId: string;
  at: string;
  hr: number;
  spo2: number;
  temp: number;
  steps: number;
  source: "seed" | "simulation";
  flagged?: string[]; // which illustrative rules this reading crossed
}

export type ReviewStatus = "open" | "acknowledged" | "completed";

export interface CareReview {
  id: string;
  patientId: string;
  readingIds: string[];
  reasons: string[];
  priority: "review" | "routine";
  status: ReviewStatus;
  createdAt: string;
  acknowledgedAt?: string;
  completedAt?: string;
  note?: string;
}

export interface FollowUpTask {
  id: string;
  patientId: string;
  title: string;
  due: string;
  status: "open" | "done";
  owner: "doctor" | "clinic" | "growth";
  source: AgentId | "doctor" | "staff";
  reviewId?: string;
  createdAt: string;
}

export interface OutreachDraft {
  id: string;
  patientId: string;
  campaignId?: string;
  kind: "reactivation" | "post_visit" | "campaign";
  text: string;
  status: "draft" | "approved" | "sent_sim" | "responded" | "no_response" | "discarded";
  createdAt: string;
  taskId?: string;
}

export type AgentId = "sura" | "scheduling" | "attendance" | "recovery" | "growth" | "care";
export type TaskStatus = "pending" | "processing" | "completed" | "requires_approval" | "failed";

export interface AgentTask {
  id: string;
  agent: AgentId;
  eventId: string;
  title: string;
  detail: string;
  status: TaskStatus;
  createdAt: string;
  completedAt?: string;
  outcome?: string;
  reasoning?: string[]; // the deterministic rule trail behind the decision, shown to staff
  proposal?: RecoveryProposal | OutreachProposal;
  ref?: string; // the record this task acted on (review, appointment, campaign)
  patientId?: string;
  demo?: boolean;
}

export interface RecoveryProposal {
  kind: "recovery";
  cancelledId: string;
  doctorId: string;
  slot: string;
  waitlistId?: string;
  waitPatientId?: string;
  rescheduleSlot?: string;
  rescheduleDoctorId?: string;
  value: number;
}

export interface OutreachProposal {
  kind: "outreach";
  draftIds: string[];
  campaignId?: string;
}

export type EventType =
  | "inquiry.received"
  | "booking.requested"
  | "appointment.created"
  | "confirmation.received"
  | "appointment.cancelled"
  | "recovery.approved"
  | "recovery.declined"
  | "appointment.completed"
  | "wearable.reading"
  | "campaign.created"
  | "growth.scan"
  | "outreach.approved"
  | "outreach.declined"
  | "outcome.recorded";

export interface OpEvent {
  id: string;
  type: EventType;
  at: string;
  payload: Record<string, string | number | boolean | undefined>;
  dedupeKey: string;
  processed: boolean;
  held: boolean; // demo-step events wait for the presenter to advance
  agent?: AgentId;
  error?: string;
}

export type Actor = AgentId | "staff" | "patient" | "doctor" | "system" | "orchestrator";

export interface AuditRecord {
  id: string;
  at: string;
  event: string;
  actor: Actor;
  action: string;
  outcome: string;
  patientId?: string;
  ref?: string;
  demo?: boolean;
}

export interface Thresholds {
  hrHigh: number;
  hrLow: number;
  spo2Low: number;
  tempHigh: number;
}

export interface DemoRun {
  step: number; // 0 = not started, 8 = finished
  runId: string;
  patientId?: string;
  inquiryId?: string;
  apptId?: string;
  recoveredApptId?: string;
  rescheduledApptId?: string;
  waitPatientId?: string;
  approvalTaskId?: string;
  baseline?: KpiSnapshot;
  error?: string;
}

export interface KpiSnapshot {
  appointments: number;
  confirmed: number;
  cancelled: number;
  recovered: number;
  inquiries: number;
  conversion: number;
  revenue: number;
  recoveredRevenue: number;
}

export interface SimState {
  running: boolean;
  patientId: string;
  mode: "normal" | "review";
  tick: number;
}

export interface Data {
  version: number;
  seededAt: string;
  seq: number;
  clinic: Clinic;
  doctors: Doctor[];
  patients: Patient[];
  appointments: Appointment[];
  inquiries: Inquiry[];
  messages: Message[];
  campaigns: Campaign[];
  invoices: Invoice[];
  waitlist: WaitlistEntry[];
  devices: WearableDevice[];
  readings: Reading[];
  reviews: CareReview[];
  followups: FollowUpTask[];
  outreach: OutreachDraft[];
  tasks: AgentTask[];
  events: OpEvent[];
  audit: AuditRecord[];
  thresholds: Thresholds;
  demo: DemoRun;
  sim: SimState;
}
