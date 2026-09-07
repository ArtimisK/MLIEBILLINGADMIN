// Drive health check: scans every invoice with a drive_file_id and confirms
// the file still actually exists in Drive. Our database can fall out of
// sync with reality if a file is deleted directly in Drive (has happened
// repeatedly during testing/manual cleanup) — this surfaces that mismatch
// proactively (via the audit log) and clears the stale reference back to
// null, instead of leaving a silently-broken drive_file_id that only shows
// up as a "File not found" error the next time something tries to use it
// (e.g. a rename). Safe to run anytime; read-only against QuickBooks and
// the Sheets, only clears drive_file_id on rows confirmed missing.
import { NextRequest, NextResponse } from "next/server";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { driveFileExists } from "@/lib/drive/upload";
import { audit } from "@/lib/engine/record";

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
    .select({ id: invoices.id, docNumber: invoices.docNumber, driveFileId: invoices.driveFileId })
    .from(invoices)
    .where(isNotNull(invoices.driveFileId));

  const missing: string[] = [];
  const ok: string[] = [];

  for (const inv of rows) {
    const exists = await driveFileExists(inv.driveFileId!);
    if (exists) {
      ok.push(inv.docNumber);
      continue;
    }
    missing.push(inv.docNumber);
    await db.update(invoices).set({ driveFileId: null }).where(eq(invoices.id, inv.id));
    await audit("system", "drive.file_missing", "invoice", inv.id, {
      docNumber: inv.docNumber,
      staleDriveFileId: inv.driveFileId,
    });
  }

  return NextResponse.json({ checked: rows.length, ok: ok.length, missing });
}
