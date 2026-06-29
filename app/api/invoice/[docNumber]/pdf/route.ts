import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { qboGetPdf } from "@/lib/qbo/client";
import { isQboConfigured } from "@/lib/qbo/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ docNumber: string }> },
) {
  const { docNumber } = await params;

  if (!isQboConfigured()) {
    return NextResponse.json({ error: "QuickBooks not configured" }, { status: 503 });
  }

  const rows = await db
    .select({ qboInvoiceId: invoices.qboInvoiceId })
    .from(invoices)
    .where(eq(invoices.docNumber, docNumber))
    .limit(1);

  if (!rows.length || !rows[0].qboInvoiceId) {
    return NextResponse.json(
      { error: "Invoice not found or not yet pushed to QuickBooks" },
      { status: 404 },
    );
  }

  try {
    const pdf = await qboGetPdf(`invoice/${rows[0].qboInvoiceId}/pdf`);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${docNumber}.pdf"`,
        "Content-Length":      String(pdf.byteLength),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
