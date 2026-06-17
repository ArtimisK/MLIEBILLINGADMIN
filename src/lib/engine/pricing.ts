// Pricing: turn a resolved+classified event into a BillableEvent by looking up
// price_rules (business_line, instrument, duration). Unmatched → review reason.

import type { PriceRuleRow } from "@/db/schema";
import type { BillableEvent } from "./strategies/base";
import { toBillingPeriod } from "./strategies/base";
import type { BusinessLine } from "./types";

export interface PriceLookupContext {
  /** all price rules for the business line being processed */
  rules: PriceRuleRow[];
}

export interface ResolvedEventInput {
  googleEventId: string;
  businessLine: BusinessLine;
  startAt: Date;
  durationMinutes: number;
  instrument: string | null;
  studentId: number | null;
  studentTwoDigitCode: string | null;
  fundingOrgId: number | null;
  fundingBillingCode: string | null;
}

export interface PriceResult {
  ok: boolean;
  billable?: BillableEvent;
  reviewReason?: string;
}

/** Find the price rule matching instrument + duration (instrument null = any). */
export function findPriceRule(
  ctx: PriceLookupContext,
  instrument: string | null,
  durationMinutes: number,
): PriceRuleRow | undefined {
  // Prefer an exact instrument match, then fall back to a rule with null instrument.
  const exact = ctx.rules.find(
    (r) => r.instrument === instrument && r.durationMinutes === durationMinutes,
  );
  if (exact) return exact;
  return ctx.rules.find(
    (r) => r.instrument === null && r.durationMinutes === durationMinutes,
  );
}

export function priceEvent(
  input: ResolvedEventInput,
  ctx: PriceLookupContext,
): PriceResult {
  const rule = findPriceRule(ctx, input.instrument, input.durationMinutes);
  if (!rule) {
    return {
      ok: false,
      reviewReason: `No price rule for ${input.businessLine} ${
        input.instrument ?? "(no instrument)"
      } ${input.durationMinutes}min`,
    };
  }

  const unitPrice = Number(rule.unitPrice);
  const billable: BillableEvent = {
    googleEventId: input.googleEventId,
    startAt: input.startAt,
    billingPeriod: toBillingPeriod(input.startAt),
    studentId: input.studentId,
    studentTwoDigitCode: input.studentTwoDigitCode,
    fundingOrgId: input.fundingOrgId,
    fundingBillingCode: input.fundingBillingCode,
    instrument: input.instrument,
    durationMinutes: input.durationMinutes,
    unitPrice,
    itemName: rule.qboItemName,
    description: `${rule.qboItemName} — ${input.startAt.toISOString().slice(0, 10)}`,
  };

  return { ok: true, billable };
}
