// Google Drive: upload a QBO invoice PDF after push.
// Requires GOOGLE_DRIVE_FOLDER_ID env var and a refresh token with
// the https://www.googleapis.com/auth/drive.file scope.
// If not configured (or upload fails), the push continues without a Drive file.

import { Readable } from "stream";
import { google } from "googleapis";
import { getOAuthClient } from "@/lib/google/calendar";

export function isDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_DRIVE_FOLDER_ID && process.env.GOOGLE_REFRESH_TOKEN,
  );
}

/**
 * Upload a PDF buffer to the configured Drive folder.
 * Returns the created file's Drive ID.
 */
export async function uploadInvoicePdf(
  docNumber: string,
  pdfBuffer: Buffer,
): Promise<string> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not set");

  const auth = getOAuthClient();
  const drive = google.drive({ version: "v3", auth });

  const { data } = await drive.files.create({
    requestBody: {
      name: `${docNumber}.pdf`,
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
