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

  it("excludes a row dated today when `now` is given — a gig isn't invoiced same-day", async () => {
    const rows = [
      HEADER,
      ["7/29/2026", "Parker Jewish", "2:00pm-3:00pm", "John Teto", "$250", "47PJI03", ""],
      ["7/30/2026", "Dry Harbor", "2:30pm-3:30pm", "Jacqueline Real", "$200", "08DHA02", ""],
    ];
    const { invoices } = await parseMlieRows(rows, "2026-07", new Date(2026, 6, 30));
    expect(invoices).toHaveLength(1);
    expect(invoices[0].docNumber).toBe("47PJI03");
  });

  it("includes a row once its date is strictly before `now`", async () => {
    const rows = [
      HEADER,
      ["7/30/2026", "Dry Harbor", "2:30pm-3:30pm", "Jacqueline Real", "$200", "08DHA02", ""],
    ];
    const { invoices } = await parseMlieRows(rows, "2026-07", new Date(2026, 6, 31));
    expect(invoices).toHaveLength(1);
  });

  it("merges two rows sharing the same Invoice Number into one invoice with two lines", async () => {
    const rows = [
      HEADER,
      ["8/10/2026", "Brookside Multicare Nursing Center", "1:30pm-2:30pm", "Jacqueline Real", "$200", "29BMC02", ""],
      ["8/10/2026", "Brookside Multicare Nursing Center", "2:45pm-3:45pm", "Jacqueline Real", "$200", "29BMC02", ""],
    ];
    const { invoices } = await parseMlieRows(rows);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].docNumber).toBe("29BMC02");
    expect(invoices[0].lines).toHaveLength(2);
    expect(invoices[0].subtotal).toBe(400);
  });

  it("sorts merged lines chronologically when dates differ", async () => {
    const rows = [
      HEADER,
      ["8/12/2026", "Brookside", "2:45pm-3:45pm", "Jacqueline Real", "$200", "29BMC02", ""],
      ["8/10/2026", "Brookside", "1:30pm-2:30pm", "Jacqueline Real", "$150", "29BMC02", ""],
    ];
    const { invoices } = await parseMlieRows(rows);
    expect(invoices[0].lines[0].amount).toBe(150);
    expect(invoices[0].lines[1].amount).toBe(200);
  });
});
