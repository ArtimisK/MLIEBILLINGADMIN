import { describe, it, expect } from "vitest";
import { buildMligDriveFileName } from "@/lib/engine/push";

describe("buildMligDriveFileName", () => {
  it("builds 'DocNumber - First L. - Billing Month Invoice (Service Month Billing Cycle)'", () => {
    const name = buildMligDriveFileName({
      docNumber: "03ISS0926",
      clientName: "Ari Amir",
      billingPeriod: "2026-09",
      lines: [{ serviceDate: new Date(2026, 7, 6) }], // August 6, 2026
    });
    expect(name).toBe("03ISS0926 - Ari A. - September Invoice (August Billing Cycle)");
  });

  it("reduces a multi-word surname to its first letter only", () => {
    const name = buildMligDriveFileName({
      docNumber: "12RYM0826",
      clientName: "Michael Angelo Cruces",
      billingPeriod: "2026-08",
      lines: [{ serviceDate: new Date(2026, 6, 1) }],
    });
    expect(name).toBe("12RYM0826 - Michael C. - August Invoice (July Billing Cycle)");
  });

  it("uses the first line's service month — callers pass lines already sorted ascending", () => {
    const name = buildMligDriveFileName({
      docNumber: "39RYM0826",
      clientName: "Kemaine Dawkins",
      billingPeriod: "2026-08",
      lines: [
        { serviceDate: new Date(2026, 6, 1) },
        { serviceDate: new Date(2026, 6, 15) },
      ],
    });
    expect(name).toContain("(July Billing Cycle)");
  });

  it("falls back to the bare docNumber when clientName is missing", () => {
    const name = buildMligDriveFileName({
      docNumber: "99ZZZ0826",
      clientName: null,
      billingPeriod: "2026-08",
      lines: [{ serviceDate: new Date(2026, 6, 1) }],
    });
    expect(name).toBe("99ZZZ0826");
  });

  it("falls back to the bare docNumber when there are no lines", () => {
    const name = buildMligDriveFileName({
      docNumber: "99ZZZ0826",
      clientName: "Test Client",
      billingPeriod: "2026-08",
      lines: [],
    });
    expect(name).toBe("99ZZZ0826");
  });

  it("handles a single-word name without a surname initial", () => {
    const name = buildMligDriveFileName({
      docNumber: "50ISS0826",
      clientName: "Madonna",
      billingPeriod: "2026-08",
      lines: [{ serviceDate: new Date(2026, 6, 1) }],
    });
    expect(name).toBe("50ISS0826 - Madonna - August Invoice (July Billing Cycle)");
  });
});
