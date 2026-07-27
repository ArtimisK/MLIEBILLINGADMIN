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

/** Write the same value into multiple single cells in one API call — e.g.
 *  marking "Invoice created" as YES for every row just pushed. One request
 *  regardless of row count, so this doesn't hit Sheets' per-minute write
 *  quota the way writing cell-by-cell does. rowNumbers are 1-indexed and
 *  include the header row (so the first data row is 2), matching the UI. */
export async function writeCells(
  sheetId: string,
  tabTitle: string,
  column: string,
  rowNumbers: number[],
  value: string,
): Promise<void> {
  if (rowNumbers.length === 0) return;
  const auth = getOAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: rowNumbers.map((rowNumber) => ({
        range: `'${tabTitle}'!${column}${rowNumber}`,
        values: [[value]],
      })),
    },
  });
}
