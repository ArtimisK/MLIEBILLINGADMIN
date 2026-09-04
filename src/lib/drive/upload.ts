// Google Drive: upload a QBO invoice PDF after push.
// Requires GOOGLE_DRIVE_FOLDER_ID env var and a refresh token with the full
// https://www.googleapis.com/auth/drive scope — the destination folders are
// owned by a different Google account and only shared with this one, and
// the narrower drive.file scope silently fails to place created files
// inside a folder it doesn't own (the file gets created but doesn't show up
// under that folder from the owner's side).
// If not configured (or upload fails), the push continues without a Drive file.
// MLIE has its own folder (GOOGLE_DRIVE_FOLDER_ID_MLIE) so its PDFs don't mix
// with MLIG's; MLIG (and anything else) falls back to the shared folder.

import { Readable } from "stream";
import { google } from "googleapis";
import { getOAuthClient } from "@/lib/google/calendar";

function folderIdFor(businessLine?: "MLIG" | "MLIE"): string | undefined {
  if (businessLine === "MLIE") {
    return process.env.GOOGLE_DRIVE_FOLDER_ID_MLIE || process.env.GOOGLE_DRIVE_FOLDER_ID;
  }
  return process.env.GOOGLE_DRIVE_FOLDER_ID;
}

export function isDriveConfigured(businessLine?: "MLIG" | "MLIE"): boolean {
  return Boolean(folderIdFor(businessLine) && process.env.GOOGLE_REFRESH_TOKEN);
}

/**
 * Upload a PDF buffer to the configured Drive folder for this business line.
 * fileName is used as-is (a ".pdf" extension is added if missing) — MLIG
 * builds a descriptive name (see buildMligDriveFileName in push.ts); MLIE
 * keeps using the bare docNumber. Returns the created file's Drive ID.
 */
export async function uploadInvoicePdf(
  fileName: string,
  pdfBuffer: Buffer,
  businessLine?: "MLIG" | "MLIE",
): Promise<string> {
  const folderId = folderIdFor(businessLine);
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not set");

  const auth = getOAuthClient();
  const drive = google.drive({ version: "v3", auth });

  const name = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  const { data } = await drive.files.create({
    requestBody: {
      name,
      parents: [folderId],
    },
    media: {
      mimeType: "application/pdf",
      body: Readable.from(pdfBuffer),
    },
    fields: "id",
  });

  if (!data.id) throw new Error("Drive returned no file ID");
  return data.id;
}
