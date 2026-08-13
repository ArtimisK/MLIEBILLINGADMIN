// TEMPORARY debug route — parses the current MLIE tab with NO month/date
// restriction, then persists + pushes ONLY the specific doc numbers passed
// in ?docNumbers=a,b,c. Used to catch up on real, past-due rows that sit
// outside the current month (e.g. leftover July rows in the August tab)
// without touching the automatic job's normal current-month-only behavior.
// DELETE after use.
import { NextRequest, NextResponse } from "next/server";
import { readCurrentTabRows } from "@/lib/google/sheets";
import { parseMlieRows } from "@/lib/excel/parse";
import { persistDrafts, pushInvoices } from "@/lib/engine/push";

async function expectedToken(pw: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(pw + ":mli-billing-v1"),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  const docNumbersParam = req.nextUrl.searchParams.get("docNumbers");
  if (!docNumbersParam) {
    return NextResponse.json({ error: "missing ?docNumbers=a,b,c" }, { status: 400 });
  }
  const wanted = new Set(docNumbersParam.split(",").map((s) => s.trim()).filter(Boolean));

  const sheetId = process.env.GOOGLE_SHEET_MLIE_ID;
  if (!sheetId) {
    return NextResponse.json({ error: "GOOGLE_SHEET_MLIE_ID not set" }, { status: 500 });
  }

  try {
    const rows = await readCurrentTabRows(sheetId);
    // No targetPeriod, no `now` — read every row regardless of month/date,
    // then filter down to exactly the requested doc numbers before pushing.
    const { invoices } = await parseMlieRows(rows);
    const matched = invoices.filter((inv) => wanted.has(inv.docNumber));

    if (matched.length === 0) {
      return NextResponse.json({ error: "none of the requested docNumbers were found in the sheet" }, { status: 404 });
    }

    const draftIds = await persistDrafts(matched);
    const outcomes = await pushInvoices(draftIds);

    return NextResponse.json({
      matchedDocNumbers: matched.map((m) => m.docNumber),
      outcomes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
