// BillingStrategy contract (blueprint §9). Same ingest / review / push / audit;
// only classify, parse, aggregate, and docNumber differ per business line.

import type {
  BusinessLine,
  NormalizedEvent,
  ParseResult,
  ProposedInvoice,
  RosterContext,
} from "../types";

/** A priced, resolved event ready to be grouped into an invoice. */
export interface BillableEvent {
  googleEventId: string;
  startAt: Date;
  billingPeriod: string; // 'YYYY-MM'
  studentId: number | null;
  studentTwoDigitCode: string | null;
  fundingOrgId: number | null;
  fundingBillingCode: string | null;
  instrument: string | null;
  durationMinutes: number;
  unitPrice: number;
  itemName: string;
  description: string;
}

export interface BillingStrategy {
  readonly businessLine: BusinessLine;
  parse(event: NormalizedEvent, roster: RosterContext): ParseResult;
  aggregate(events: BillableEvent[]): ProposedInvoice[];
  docNumber(invoice: Pick<ProposedInvoice, "studentId" | "billingPeriod"> & {
    twoDigitCode: string;
    billingCode: string;
  }): string;
}

const BUSINESS_TZ = "America/New_York";

/** Convert a Date to 'YYYY-MM' in the business timezone (not UTC). */
export function toBillingPeriod(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const year  = parts.find((p) => p.type === "year")?.value  ?? String(d.getUTCFullYear());
  const month = parts.find((p) => p.type === "month")?.value ?? String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** doc_number = {two_digit_code}{billing_code}{MMYY} (blueprint §4/§13). */
export function buildDocNumber(
  twoDigitCode: string,
  billingCode: string,
  billingPeriod: string,
): string {
  const [year, month] = billingPeriod.split("-");
  const mm = month;
  const yy = year.slice(-2);
  return `${twoDigitCode}${billingCode}${mm}${yy}`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
