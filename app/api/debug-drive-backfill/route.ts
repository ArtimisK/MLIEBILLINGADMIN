// TEMPORARY debug route — re-uploads an existing (still-valid) QBO invoice's
// PDF to Drive, for cases where the QBO invoice is real but its Drive copy
// was deleted separately. Updates drive_file_id to the new copy. Does not
// touch QuickBooks. DELETE after use; not meant to ship.
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { qboGetPdf } from "@/lib/qbo/client";
import { uploadInvoicePdf, isDriveConfigured } from "@/lib/drive/upload";

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
    const pdf = await qboGetPdf(`invoice/${row.qboInvoiceId}/pdf`);
    const driveFileId = await uploadInvoicePdf(docNumber, pdf, row.businessLine);
    await db.update(invoices).set({ driveFileId }).where(eq(invoices.id, row.id));
    return NextResponse.json({ ok: true, docNumber, driveFileId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
