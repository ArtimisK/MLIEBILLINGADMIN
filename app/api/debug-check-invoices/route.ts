// TEMPORARY debug route — queries QBO directly (source of truth, not the UI)
// for every MLIG August invoice doc_number and reports which ones QBO
// actually has vs which are only in our own database. DELETE after use.
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { findInvoiceByDocNumber } from "@/lib/qbo/invoice";

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

  const billingPeriod = req.nextUrl.searchParams.get("billingPeriod") ?? "2026-08";

  const rows = await db
    .select({ id: invoices.id, docNumber: invoices.docNumber, qboInvoiceId: invoices.qboInvoiceId })
    .from(invoices)
    .where(eq(invoices.billingPeriod, billingPeriod));

  const results: { docNumber: string; ourQboId: string | null; actuallyInQbo: boolean; realQboId: string | null }[] = [];

  for (const row of rows) {
    try {
      const realId = await findInvoiceByDocNumber(row.docNumber);
      results.push({
        docNumber: row.docNumber,
        ourQboId: row.qboInvoiceId,
        actuallyInQbo: realId != null,
        realQboId: realId,
      });
    } catch {
      results.push({
        docNumber: row.docNumber,
        ourQboId: row.qboInvoiceId,
        actuallyInQbo: false,
        realQboId: null,
      });
    }
  }

  const missing = results.filter((r) => !r.actuallyInQbo);
  const mismatched = results.filter((r) => r.actuallyInQbo && r.realQboId !== r.ourQboId);

  return NextResponse.json({
    total: results.length,
    missingFromQbo: missing.map((r) => r.docNumber),
    idMismatch: mismatched,
    all: results,
  });
}
