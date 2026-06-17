import { describe, it, expect } from "vitest";
import { priceEvent, findPriceRule } from "@/lib/engine/pricing";
import type { PriceRuleRow } from "@/db/schema";
import type { ResolvedEventInput } from "@/lib/engine/pricing";

const rules: PriceRuleRow[] = [
  { id: 1, businessLine: "MLIG", instrument: "piano", durationMinutes: 60, unitPrice: "60.00", qboItemName: "60 Minute Music Lesson (SD)", qboItemRef: null },
  { id: 2, businessLine: "MLIG", instrument: "vocal", durationMinutes: 30, unitPrice: "35.00", qboItemName: "30 Minute Music Lesson (SD)", qboItemRef: null },
  { id: 3, businessLine: "MLIE", instrument: null, durationMinutes: 60, unitPrice: "250.00", qboItemName: "Live Entertainment — Performance", qboItemRef: null },
];

function input(over: Partial<ResolvedEventInput>): ResolvedEventInput {
  return {
    googleEventId: "g",
    businessLine: "MLIG",
    startAt: new Date("2026-06-03T15:00:00Z"),
    durationMinutes: 60,
    instrument: "piano",
    studentId: 1,
    studentTwoDigitCode: "03",
    fundingOrgId: 10,
    fundingBillingCode: "ISS",
    ...over,
  };
}

describe("pricing", () => {
  it("matches exact instrument + duration", () => {
    const rule = findPriceRule({ rules }, "piano", 60);
    expect(rule?.id).toBe(1);
  });

  it("falls back to a null-instrument rule (MLIE gig)", () => {
    const rule = findPriceRule({ rules }, "anything", 60);
    expect(rule?.id).toBe(3); // the instrument-null MLIE rule
  });

  it("prices a resolved lesson into a BillableEvent", () => {
    const r = priceEvent(input({}), { rules });
    expect(r.ok).toBe(true);
    expect(r.billable?.unitPrice).toBe(60);
    expect(r.billable?.itemName).toBe("60 Minute Music Lesson (SD)");
    expect(r.billable?.billingPeriod).toBe("2026-06");
  });

  it("routes an unmatched duration to review", () => {
    const r = priceEvent(input({ instrument: "piano", durationMinutes: 45 }), { rules });
    expect(r.ok).toBe(false);
    expect(r.reviewReason).toMatch(/No price rule/);
  });
});
