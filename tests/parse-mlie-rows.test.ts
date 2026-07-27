import { describe, it, expect } from "vitest";
import { parseMlieRows } from "@/lib/excel/parse";

const HEADER = [
  "Date", "Location", "Time", "Performer Name",
  "Entertainment Fee", "Invoice Number", "Invoice Created",
];

describe("parseMlieRows", () => {
  it("parses every row when no targetPeriod is given (manual upload behavior)", async () => {
    const rows = [
      HEADER,
      ["7/13/2026", "Parker Jewish", "2:00pm-3:00pm", "John Teto", "$250", "47PJI03", ""],
      ["9/13/2026", "Dry Harbor", "2:30pm-3:30pm", "Jacqueline Real", "$200", "08DHA02", ""],
    ];
    const { invoices } = await parseMlieRows(rows);
    expect(invoices).toHaveLength(2);
  });

  it("only includes rows matching targetPeriod, skipping future-dated rows", async () => {
    const rows = [
      HEADER,
      ["7/13/2026", "Parker Jewish", "2:00pm-3:00pm", "John Teto", "$250", "47PJI03", ""],
      ["9/13/2026", "Dry Harbor", "2:30pm-3:30pm", "Jacqueline Real", "$200", "08DHA02", ""],
      ["9/24/2026", "New Franklin", "2:00pm-3:00pm", "Rita Posillico", "$200", "09NFR21", ""],
    ];
    const { invoices } = await parseMlieRows(rows, "2026-07");
    expect(invoices).toHaveLength(1);
    expect(invoices[0].docNumber).toBe("47PJI03");
  });

  it("returns nothing when no rows match targetPeriod", async () => {
    const rows = [
      HEADER,
      ["9/13/2026", "Dry Harbor", "2:30pm-3:30pm", "Jacqueline Real", "$200", "08DHA02", ""],
    ];
    const { invoices } = await parseMlieRows(rows, "2026-07");
    expect(invoices).toHaveLength(0);
  });
});
