// MLIG lessons: group billable events by student × billing-month into one
// invoice with N lines. doc_number = {two_digit_code}{billing_code}{MMYY}.

import type { NormalizedEvent, ProposedInvoice, RosterContext } from "../types";
import { parseTitle } from "../parse";
import {
  BillableEvent,
  BillingStrategy,
  buildDocNumber,
  round2,
} from "./base";

export class MligLessonsStrategy implements BillingStrategy {
  readonly businessLine = "MLIG" as const;

  parse(event: NormalizedEvent, roster: RosterContext) {
    return parseTitle(event.rawTitle, roster);
  }

  docNumber(invoice: {
    twoDigitCode: string;
    billingCode: string;
    billingPeriod: string;
  }): string {
    return buildDocNumber(invoice.twoDigitCode, invoice.billingCode, invoice.billingPeriod);
  }

  aggregate(events: BillableEvent[]): ProposedInvoice[] {
    // Group by student × billing period.
    const groups = new Map<string, BillableEvent[]>();
    for (const e of events) {
      if (e.studentId === null) continue; // unresolved never reaches aggregate
      const key = `${e.studentId}::${e.billingPeriod}`;
      const bucket = groups.get(key);
      if (bucket) bucket.push(e);
      else groups.set(key, [e]);
    }

    const invoices: ProposedInvoice[] = [];
    for (const bucket of groups.values()) {
      const first = bucket[0];
      const lines = bucket
        .slice()
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
        .map((e) => ({
          eventGoogleId: e.googleEventId,
          serviceDate: e.startAt,
          itemName: e.itemName,
          description: e.description,
          amount: round2(e.unitPrice),
        }));
      const subtotal = round2(lines.reduce((sum, l) => sum + l.amount, 0));

      const docNumber =
        first.studentTwoDigitCode && first.fundingBillingCode
          ? this.docNumber({
              twoDigitCode: first.studentTwoDigitCode,
              billingCode: first.fundingBillingCode,
              billingPeriod: first.billingPeriod,
            })
          : `MLIG-${first.studentId}-${first.billingPeriod}`;

      invoices.push({
        businessLine: "MLIG",
        fundingOrgId: first.fundingOrgId,
        studentId: first.studentId,
        billingPeriod: first.billingPeriod,
        docNumber,
        lines,
        subtotal,
      });
    }

    return invoices;
  }
}
