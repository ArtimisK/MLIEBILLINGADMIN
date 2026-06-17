import { describe, it, expect } from "vitest";
import { MligLessonsStrategy } from "@/lib/engine/strategies/mlig";
import { MlieGigsStrategy } from "@/lib/engine/strategies/mlie";
import type { BillableEvent } from "@/lib/engine/strategies/base";

function evt(over: Partial<BillableEvent>): BillableEvent {
  return {
    googleEventId: "g1",
    startAt: new Date("2026-06-03T15:00:00Z"),
    billingPeriod: "2026-06",
    studentId: 1,
    studentTwoDigitCode: "03",
    fundingOrgId: 10,
    fundingBillingCode: "ISS",
    instrument: "piano",
    durationMinutes: 60,
    unitPrice: 60,
    itemName: "60 Minute Music Lesson (SD)",
    description: "lesson",
    ...over,
  };
}

describe("MLIG aggregation — group by student × billing month", () => {
  const strategy = new MligLessonsStrategy();

  it("groups a student's lessons into one invoice with N lines", () => {
    const invoices = strategy.aggregate([
      evt({ googleEventId: "a", startAt: new Date("2026-06-03T15:00:00Z") }),
      evt({ googleEventId: "b", startAt: new Date("2026-06-10T15:00:00Z") }),
      evt({ googleEventId: "c", startAt: new Date("2026-06-17T15:00:00Z") }),
    ]);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].lines).toHaveLength(3);
    expect(invoices[0].subtotal).toBe(180);
    expect(invoices[0].docNumber).toBe("03ISS0626");
  });

  it("separates different students into different invoices", () => {
    const invoices = strategy.aggregate([
      evt({ studentId: 1, studentTwoDigitCode: "03" }),
      evt({ studentId: 2, studentTwoDigitCode: "04" }),
    ]);
    expect(invoices).toHaveLength(2);
    expect(invoices.map((i) => i.studentId).sort()).toEqual([1, 2]);
  });

  it("orders lines by service date", () => {
    const invoices = strategy.aggregate([
      evt({ googleEventId: "late", startAt: new Date("2026-06-20T15:00:00Z") }),
      evt({ googleEventId: "early", startAt: new Date("2026-06-01T15:00:00Z") }),
    ]);
    expect(invoices[0].lines[0].eventGoogleId).toBe("early");
    expect(invoices[0].lines[1].eventGoogleId).toBe("late");
  });
});

describe("MLIE aggregation — one gig, one invoice, one line", () => {
  const strategy = new MlieGigsStrategy();

  it("produces a 1:1 invoice per gig", () => {
    const invoices = strategy.aggregate([
      evt({ googleEventId: "gig1", unitPrice: 250, fundingBillingCode: "MLIE" }),
      evt({ googleEventId: "gig2", unitPrice: 300, fundingBillingCode: "MLIE" }),
    ]);
    expect(invoices).toHaveLength(2);
    for (const inv of invoices) {
      expect(inv.lines).toHaveLength(1);
      expect(inv.subtotal).toBe(inv.lines[0].amount);
    }
  });
});
