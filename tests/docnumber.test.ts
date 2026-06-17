import { describe, it, expect } from "vitest";
import { buildDocNumber, toBillingPeriod } from "@/lib/engine/strategies/base";

describe("doc number scheme {two_digit}{billing_code}{MMYY}", () => {
  it("builds the canonical example", () => {
    // student 03, ISS, June 2026 → 03ISS0626
    expect(buildDocNumber("03", "ISS", "2026-06")).toBe("03ISS0626");
  });

  it("handles a single-digit month with padding preserved", () => {
    expect(buildDocNumber("07", "RAY", "2026-01")).toBe("07RAY0126");
  });

  it("uses the last two digits of the year", () => {
    expect(buildDocNumber("12", "HAM", "2030-12")).toBe("12HAM1230");
  });
});

describe("toBillingPeriod", () => {
  it("formats YYYY-MM from a date", () => {
    expect(toBillingPeriod(new Date("2026-06-15T10:00:00Z"))).toBe("2026-06");
  });
});
