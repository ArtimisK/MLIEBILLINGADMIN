// MLIE entertainment: each gig → one invoice with a single line (performer fee).

import type { NormalizedEvent, ProposedInvoice, RosterContext } from "../types";
import { parseTitle } from "../parse";
import {
  BillableEvent,
  BillingStrategy,
  buildDocNumber,
  round2,
} from "./base";

export class MlieGigsStrategy implements BillingStrategy {
  readonly businessLine = "MLIE" as const;

  parse(event: NormalizedEvent, roster: RosterContext) {
    // Gigs are looser; we still run the rules parser to pull instrument/teacher,
    // but a gig does not require a resolved student.
    const result = parseTitle(event.rawTitle, roster);
    // A gig with an unresolved "student" is still billable as a 1:1 invoice;
    // upgrade unknown→billable unless it was an explicit cancellation.
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
      return {
        businessLine: "MLIE" as const,
        fundingOrgId: e.fundingOrgId,
        studentId: e.studentId,
        billingPeriod: e.billingPeriod,
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
