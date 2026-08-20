import { describe, it, expect, vi, beforeEach } from "vitest";

const getMock = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    sheets: () => ({ spreadsheets: { get: getMock } }),
  },
}));
vi.mock("@/lib/google/calendar", () => ({
  getOAuthClient: () => ({}),
}));

import { currentYearTabTitle } from "@/lib/google/sheets";

describe("currentYearTabTitle", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("finds the tab named for the current year regardless of position", async () => {
    getMock.mockResolvedValueOnce({
      data: { sheets: [{ properties: { title: "2025" } }, { properties: { title: "2026" } }] },
    });
    const title = await currentYearTabTitle("sheet-id", new Date(2026, 7, 20));
    expect(title).toBe("2026");
  });

  it("falls back to the leftmost tab if no year-named tab exists", async () => {
    getMock.mockResolvedValueOnce({
      data: { sheets: [{ properties: { title: "Nursing & Rehabilitation" } }] },
    });
    const title = await currentYearTabTitle("sheet-id", new Date(2026, 7, 20));
    expect(title).toBe("Nursing & Rehabilitation");
  });

  it("is immune to a manually-reordered year tab (the actual incident)", async () => {
    // 2025 dragged in front of 2026 — must still resolve to 2026, not index 0.
    getMock.mockResolvedValueOnce({
      data: {
        sheets: [
          { properties: { title: "2025" } },
          { properties: { title: "2026" } },
          { properties: { title: "2027" } },
        ],
      },
    });
    const title = await currentYearTabTitle("sheet-id", new Date(2026, 7, 20));
    expect(title).toBe("2026");
  });
});
