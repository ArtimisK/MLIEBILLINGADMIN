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

/** Convert a Date to a 'YYYY-MM' billing period in the given local context.
 *  We keep it UTC-stable here; callers needing local-zone derivation pass a
 *  pre-shifted date (blueprint §12 time-zone note). */
export function toBillingPeriod(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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
