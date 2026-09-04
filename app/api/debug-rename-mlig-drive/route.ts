// TEMPORARY debug route — renames every existing MLIG Drive file (already
// uploaded under the old "{docNumber}.pdf" naming) to the new descriptive
// name, using the same buildMligDriveFileName() logic new pushes use. Does
// not touch QuickBooks or re-upload anything — same file, same content,
// just a new display name. DELETE after use.
import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { invoices, invoiceLines } from "@/db/schema";
import { renameDriveFile } from "@/lib/drive/upload";
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

  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.businessLine, "MLIG"), isNotNull(invoices.driveFileId)));

  const results: { docNumber: string; newName?: string; error?: string }[] = [];

  for (const inv of rows) {
    try {
      const lines = await db
        .select({ serviceDate: invoiceLines.serviceDate })
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, inv.id))
        .orderBy(invoiceLines.serviceDate);

      const newName = buildMligDriveFileName({
        docNumber: inv.docNumber,
        clientName: inv.clientName,
        billingPeriod: inv.billingPeriod,
        lines,
      });

      await renameDriveFile(inv.driveFileId!, newName);
      results.push({ docNumber: inv.docNumber, newName });
    } catch (err) {
      results.push({
        docNumber: inv.docNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    total: results.length,
    renamed: results.filter((r) => !r.error).length,
    failed: results.filter((r) => r.error),
    results,
  });
}
