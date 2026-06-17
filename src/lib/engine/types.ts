// Domain types shared across the engine. Deliberately decoupled from the DB
// row types so the pure functions (parse/classify/aggregate) can be unit-tested
// without a database.

export type BusinessLine = "MLIG" | "MLIE";

export type EventStatus =
  | "billable"
  | "canceled"
  | "unconfirmed"
  | "unknown"
  | "billed";

/** A calendar event normalized into the shape the engine reasons about. */
export interface NormalizedEvent {
  googleEventId: string;
  businessLine: BusinessLine;
  startAt: Date;
  endAt: Date;
  rawTitle: string;
  confirmed: boolean;
}

/** Roster context the rules parser needs (no DB dependency). */
export interface RosterContext {
  /** alias (lowercased) → studentId */
  aliasToStudentId: Map<string, number>;
  /** lowercased teacher names + aliases */
  teacherNames: Set<string>;
}

/** Output of the rules parser for a single student extracted from a title. */
export interface ParsedStudent {
  studentId: number | null; // null → unresolved → review queue
  rawName: string;
}

export interface ParseResult {
  status: EventStatus;
  instrument: string | null;
  teacher: string | null;
  students: ParsedStudent[];
  /** 0..1 — low confidence routes to the LLM fallback / review queue. */
  confidence: number;
  /** human-readable reason when something needs review. */
  reviewReason?: string;
}

/** A proposed invoice produced by a billing strategy (pre-QBO). */
export interface ProposedInvoiceLine {
  eventGoogleId: string;
  serviceDate: Date;
  itemName: string;
  description: string;
  amount: number;
}

export interface ProposedInvoice {
  businessLine: BusinessLine;
  fundingOrgId: number | null;
  studentId: number | null;
  billingPeriod: string; // 'YYYY-MM'
  docNumber: string;
  lines: ProposedInvoiceLine[];
  subtotal: number;
}
