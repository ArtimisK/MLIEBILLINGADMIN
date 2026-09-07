// TEMPORARY debug route — re-fetches an existing (still-valid) MLIG QBO
// invoice's PDF and uploads it fresh to Drive with the new descriptive
// filename, for invoices whose old Drive file was deleted out from under
// our database's drive_file_id (confirmed via "File not found" on rename).
// Does not touch QuickBooks. DELETE after use.
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices, invoiceLines } from "@/db/schema";
import { qboGetPdf } from "@/lib/qbo/client";
import { uploadInvoicePdf, isDriveConfigured } from "@/lib/drive/upload";
import { buildMligDriveFileName } from "@/lib/engine/push";

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

  const row = (
    await db.select().from(invoices).where(eq(invoices.docNumber, docNumber)).limit(1)
  )[0];
  if (!row || !row.qboInvoiceId) {
    return NextResponse.json({ error: "invoice not found or not pushed" }, { status: 404 });
  }
  if (!isDriveConfigured(row.businessLine)) {
    return NextResponse.json({ error: "Drive not configured for this business line" }, { status: 503 });
  }

  try {
    const lines = await db
      .select({ serviceDate: invoiceLines.serviceDate })
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, row.id))
      .orderBy(invoiceLines.serviceDate);

    const fileName =
      row.businessLine === "MLIG"
        ? buildMligDriveFileName({
            docNumber: row.docNumber,
            clientName: row.clientName,
            billingPeriod: row.billingPeriod,
            lines,
          })
        : row.docNumber;

    const pdf = await qboGetPdf(`invoice/${row.qboInvoiceId}/pdf`);
    const driveFileId = await uploadInvoicePdf(fileName, pdf, row.businessLine);
    await db.update(invoices).set({ driveFileId }).where(eq(invoices.id, row.id));
    return NextResponse.json({ ok: true, docNumber, fileName, driveFileId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
