// Google Sheets integration: read rows directly from Lee's live MLIG/MLIE
// sheets, replacing the manual Excel export/upload step.
import { google } from "googleapis";
import { getOAuthClient } from "./calendar";

export function isSheetsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN,
  );
}

/** The leftmost (first) tab's title — MLIG adds a new current-month tab at
 *  the front of the sheet each cycle, so index 0 is always "current". */
async function firstTabTitle(sheetId: string): Promise<string> {
  const auth = getOAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const title = meta.data.sheets?.[0]?.properties?.title;
  if (!title) throw new Error(`Sheet ${sheetId} has no tabs`);
  return title;
}

/** Read all rows (including the header row) from one tab as a 2D array,
 *  matching the shape XLSX.utils.sheet_to_json({header: 1}) produces. */
export async function readSheetRows(
  sheetId: string,
  tabTitle: string,
): Promise<unknown[][]> {
  if (!isSheetsConfigured()) {
    throw new Error(
      "Google Sheets is not configured. Fill GOOGLE_* values in .env.",
    );
  }
  const auth = getOAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${tabTitle}'`,
  });
  return (res.data.values ?? []) as unknown[][];
}

/** Read the current (leftmost-tab) rows of a sheet whose tabs rotate monthly. */
export async function readCurrentTabRows(sheetId: string): Promise<unknown[][]> {
  const tabTitle = await firstTabTitle(sheetId);
  return readSheetRows(sheetId, tabTitle);
}

/** Return the current (leftmost) tab's title, so a caller that already read
 *  rows via readCurrentTabRows can write back to the same tab afterward. */
export async function currentTabTitle(sheetId: string): Promise<string> {
  return firstTabTitle(sheetId);
}

/** Write a single cell value, e.g. marking "Invoice created" as YES after a
 *  successful push. rowNumber is 1-indexed and includes the header row (so
 *  the first data row is 2), matching what a human sees in the sheet UI. */
export async function writeCell(
  sheetId: string,
  tabTitle: string,
  column: string,
  rowNumber: number,
  value: string,
): Promise<void> {
  const auth = getOAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `'${tabTitle}'!${column}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] },
  });
}
