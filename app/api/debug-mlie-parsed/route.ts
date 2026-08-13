// TEMPORARY debug route — runs the exact same read+parse step syncMlieSheet
// uses (current month, same-day exclusion), and returns just the resulting
// doc numbers/dates, without persisting or pushing anything. Read-only.
// DELETE after use.
import { NextRequest, NextResponse } from "next/server";
import { readCurrentTabRows } from "@/lib/google/sheets";
import { parseMlieRows } from "@/lib/excel/parse";

async function expectedToken(pw: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(pw + ":mli-billing-v1"),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function currentBillingMonth(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const pw = process.env.ADMIN_PASSWORD;
  if (pw) {
    const expected = await expectedToken(pw);
    const cookie = req.cookies.get("mli-auth")?.value;
    if (cookie !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const sheetId = process.env.GOOGLE_SHEET_MLIE_ID;
  if (!sheetId) {
    return NextResponse.json({ error: "GOOGLE_SHEET_MLIE_ID not set" }, { status: 500 });
  }

  try {
    const now = new Date();
    const targetPeriod = currentBillingMonth(now);
    const rows = await readCurrentTabRows(sheetId);
    const { invoices, errors, skipped } = await parseMlieRows(rows, targetPeriod, now);

    return NextResponse.json({
      now: now.toISOString(),
      targetPeriod,
      totalRowsInSheet: rows.length,
      parsedCount: invoices.length,
      parsedDocNumbers: invoices.map((i) => ({
        docNumber: i.docNumber,
        venueName: i.venueName,
        lineCount: i.lines.length,
        dates: i.lines.map((l) => l.serviceDate.toISOString().slice(0, 10)),
      })),
      errors,
      skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
