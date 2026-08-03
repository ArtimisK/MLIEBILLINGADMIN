// TEMPORARY debug route — creates a tiny test file directly via the Drive
// API with parents=[folderId] and returns the FULL raw response, plus a
// separate files.get() call on the new file's id/parents/driveId fields, so
// we can see exactly what Google actually did versus what we asked for.
// DELETE after use; not meant to ship.
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getOAuthClient } from "@/lib/google/calendar";
import { Readable } from "stream";

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

  const folderId = req.nextUrl.searchParams.get("folderId") || process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    return NextResponse.json({ error: "missing ?folderId= and no GOOGLE_DRIVE_FOLDER_ID set" }, { status: 400 });
  }

  const auth = getOAuthClient();
  const drive = google.drive({ version: "v3", auth });

  try {
    // Check the target folder itself: does this account see it, and how?
    const folderMeta = await drive.files.get({
      fileId: folderId,
      fields: "id,name,driveId,parents,capabilities,shared,ownedByMe",
      supportsAllDrives: true,
    });

    const created = await drive.files.create({
      requestBody: {
        name: `debug-test-${Date.now()}.txt`,
        parents: [folderId],
      },
      media: {
        mimeType: "text/plain",
        body: Readable.from(Buffer.from("debug test file")),
      },
      fields: "id,name,parents,driveId",
      supportsAllDrives: true,
    });

    const fetched = await drive.files.get({
      fileId: created.data.id!,
      fields: "id,name,parents,driveId,owners,shared",
      supportsAllDrives: true,
    });

    return NextResponse.json({
      ok: true,
      folderMeta: folderMeta.data,
      createResponse: created.data,
      fetchedAfterCreate: fetched.data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
