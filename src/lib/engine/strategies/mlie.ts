// MLIE entertainment: each gig → one invoice with a single line (performer fee).
// Customer = venue, extracted from the event title (anything after " @ ").
// Falls back to "Music Lee Inclined Entertainment" if no venue marker is found.

import type { NormalizedEvent, ProposedInvoice, RosterContext } from "../types";
import { parseTitle } from "../parse";
import {
  BillableEvent,
  BillingStrategy,
  buildDocNumber,
  round2,
} from "./base";

const MLIE_DEFAULT_CUSTOMER = "Music Lee Inclined Entertainment";

/** Pull venue name from title: "Gig @ Brooklyn Bowl & Lee 🎸" → "Brooklyn Bowl" */
function extractVenue(rawTitle: string): string | undefined {
  // Pattern: @ VenueName (before & teacher or end of string)
  const atMatch = rawTitle.match(/@\s*([^&@]+?)(?:\s*&|\s*$)/);
  if (atMatch) return atMatch[1].trim();

  // Pattern: "at VenueName" (case-insensitive, before & or end)
  const atWordMatch = rawTitle.match(/\bat\s+([^&@\u{1F000}-\u{1FFFF}]+?)(?:\s*&|\s*$)/u);
  if (atWordMatch) return atWordMatch[1].trim();

  return undefined;
}

export class MlieGigsStrategy implements BillingStrategy {
  readonly businessLine = "MLIE" as const;

  parse(event: NormalizedEvent, roster: RosterContext) {
    const result = parseTitle(event.rawTitle, roster);
    // Gigs don't require a resolved student; upgrade unknown→billable
    // unless it was an explicit cancellation.
    if (result.status === "unknown") {
      return { ...result, status: "billable" as const };
    }
    return result;
  }

  docNumber(invoice: {
    twoDigitCode: string;
    billingCode: string;
    billingPeriod: string;
  }): string {
    return buildDocNumber(invoice.twoDigitCode, invoice.billingCode, invoice.billingPeriod);
  }

  aggregate(events: BillableEvent[]): ProposedInvoice[] {
    // 1 gig → 1 invoice → 1 line. No grouping.
    return events.map((e, idx) => {
      const amount = round2(e.unitPrice);
      const twoDigit = e.studentTwoDigitCode ?? String(idx + 1).padStart(2, "0");
      const billingCode = e.fundingBillingCode ?? "MLIE";
      const venueName = extractVenue(e.description) ?? MLIE_DEFAULT_CUSTOMER;
      return {
        businessLine: "MLIE" as const,
        fundingOrgId: e.fundingOrgId,
        studentId: e.studentId,
        billingPeriod: e.billingPeriod,
        venueName,
        docNumber: this.docNumber({
          twoDigitCode: twoDigit,
          billingCode,
          billingPeriod: e.billingPeriod,
        }),
        lines: [
          {
            eventGoogleId: e.googleEventId,
            serviceDate: e.startAt,
            itemName: e.itemName,
            description: e.description,
            amount,
          },
        ],
        subtotal: amount,
      };
    });
  }
}
