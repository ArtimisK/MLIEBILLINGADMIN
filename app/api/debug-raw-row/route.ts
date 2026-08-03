// TEMPORARY debug route — reads the live MLIG sheet's current tab and
// returns the raw row array for whichever row contains a matching invoice
// number in column C, so we can see exactly what the Sheets API returns
// (column count, gaps, etc.) versus what the sheet visually shows.
// Read-only. DELETE after use.
import { NextRequest, NextResponse } from "next/server";
import { readCurrentTabRows } from "@/lib/google/sheets";

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

  const docNumber = req.nextUrl.searchParams.get("docNumber");
  if (!docNumber) {
    return NextResponse.json({ error: "missing ?docNumber=" }, { status: 400 });
  }

  const sheetId = process.env.GOOGLE_SHEET_MLIG_ID;
  if (!sheetId) {
    return NextResponse.json({ error: "GOOGLE_SHEET_MLIG_ID not set" }, { status: 500 });
  }

  try {
    const rows = await readCurrentTabRows(sheetId);
    const matchIndex = rows.findIndex((r) => String(r[2] ?? "").trim() === docNumber);
    if (matchIndex === -1) {
      return NextResponse.json({ error: `${docNumber} not found in current tab`, totalRows: rows.length });
    }
    return NextResponse.json({
      rowIndex: matchIndex,
      rowLength: rows[matchIndex].length,
      row: rows[matchIndex],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
