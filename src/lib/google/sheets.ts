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

/**
 * MLIE's sheet has one tab per YEAR (e.g. "2026", "2025", "2027"), not per
 * month — and unlike MLIG's tabs, nothing about the name changes each cycle,
 * so a manual drag-to-reorder (which has happened twice) silently makes
 * "leftmost tab" point at the wrong year with no error. Find the tab whose
 * title is literally the current year instead of trusting position. Falls
 * back to the leftmost tab if no exact year match exists, so this never
 * hard-fails a sync outright.
 */
export async function currentYearTabTitle(
  sheetId: string,
  now: Date = new Date(),
): Promise<string> {
  const auth = getOAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const titles = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t));
  const yearTitle = String(now.getFullYear());
  if (titles.includes(yearTitle)) return yearTitle;
  const fallback = titles[0];
  if (!fallback) throw new Error(`Sheet ${sheetId} has no tabs`);
  return fallback;
}

/** Read the tab matching the current year (see currentYearTabTitle). */
export async function readCurrentYearRows(
  sheetId: string,
  now: Date = new Date(),
): Promise<unknown[][]> {
  const tabTitle = await currentYearTabTitle(sheetId, now);
  return readSheetRows(sheetId, tabTitle);
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
