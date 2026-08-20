// Orchestrator (blueprint §5): ingest → classify → parse → price → aggregate →
// (preview) → push → record. The HTTP routes call into these functions; the
// pipeline itself is free of request/response concerns.

import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  calendars,
  events,
  fundingOrgs,
  priceRules,
  reviewQueue,
  students,
} from "@/db/schema";
import { ingestWindow } from "./engine/ingest";
import { loadRoster } from "./engine/roster";
import { classify } from "./engine/classify";
import { priceEvent } from "./engine/pricing";
import { persistDrafts, pushInvoices } from "./engine/push";
import { audit } from "./engine/record";
import { parseMligRows, parseMlieRows } from "./excel/parse";
import {
  readCurrentTabRows,
  currentTabTitle,
  readCurrentYearRows,
  currentYearTabTitle,
  writeCells,
} from "./google/sheets";
import { MligLessonsStrategy } from "./engine/strategies/mlig";
import { MlieGigsStrategy } from "./engine/strategies/mlie";
import type { BillableEvent, BillingStrategy } from "./engine/strategies/base";
import type {
  BusinessLine,
  NormalizedEvent,
  ProposedInvoice,
} from "./engine/types";

const STRATEGIES: Record<BusinessLine, BillingStrategy> = {
  MLIG: new MligLessonsStrategy(),
  MLIE: new MlieGigsStrategy(),
};

export interface PreviewResult {
  billingPeriod: string;
  invoices: ProposedInvoice[];
  reviewCount: number;
}

/**
 * Classify + parse + price + aggregate every non-billed event for the period,
 * writing event statuses and review-queue rows along the way. Returns the
 * proposed invoices (no QBO writes). This is the Phase-1 correctness oracle.
 */
export async function buildPreview(
  billingPeriod: string,
  now: Date = new Date(),
): Promise<PreviewResult> {
  const roster = await loadRoster();

  // Reference data, loaded once.
  const [allRules, allStudents, allOrgs, allCalendars] = await Promise.all([
    db.select().from(priceRules),
    db.select().from(students),
    db.select().from(fundingOrgs),
    db.select().from(calendars),
  ]);

  const studentById = new Map(allStudents.map((s) => [s.id, s]));
  const orgById = new Map(allOrgs.map((o) => [o.id, o]));
  const calendarLine = new Map(allCalendars.map((c) => [c.id, c.businessLine]));

  // Events for this period that haven't been billed yet.
  const rows = await db
    .select()
    .from(events)
    .where(
      and(eq(events.billingPeriod, billingPeriod), ne(events.status, "billed")),
    );

  // Some events may not yet have a billing_period set (fresh ingest). Pull those
  // whose start falls in the period too.
  const billableByLine: Record<BusinessLine, BillableEvent[]> = {
    MLIG: [],
    MLIE: [],
  };
  let reviewCount = 0;

  for (const row of rows) {
    const businessLine = calendarLine.get(row.calendarId);
    if (!businessLine) continue;
    const strategy = STRATEGIES[businessLine];

    const normalized: NormalizedEvent = {
      googleEventId: row.googleEventId,
      businessLine,
      startAt: row.startAt,
      endAt: row.endAt,
      rawTitle: row.rawTitle,
      confirmed: row.confirmed,
    };

    const parsed = strategy.parse(normalized, roster);
    const classified = classify(normalized, parsed, now);

    // Persist parse outputs on the event.
    const firstStudent = parsed.students[0];
    await db
      .update(events)
      .set({
        parsedStudentId: firstStudent?.studentId ?? null,
        parsedTeacher: parsed.teacher,
        parsedInstrument: parsed.instrument,
        status: classified.status,
      })
      .where(eq(events.id, row.id));

    if (classified.status !== "billable") {
      // Surface anything not billable-and-not-cancelled so Lee can act:
      //  - unknown      → couldn't resolve student/teacher/price (add an alias)
      //  - unconfirmed  → attendance not yet marked (chase the employee)
      // Cancellations are logged via status only — never billed, no chase needed.
      if (classified.status === "unknown" || classified.status === "unconfirmed") {
        const reason =
          classified.reviewReason ??
          (classified.status === "unconfirmed"
            ? "Attendance not yet marked — waiting on the employee"
            : "Needs review");
        await enqueueReview(row.id, reason, row.rawTitle);
        reviewCount++;
      }
      continue;
    }

    // Price each resolved student as its own billable event (multi-student split).
    const ctx = { rules: allRules.filter((r) => r.businessLine === businessLine) };
    for (const ps of parsed.students.length ? parsed.students : [{ studentId: null, rawName: "" }]) {
      const student = ps.studentId != null ? studentById.get(ps.studentId) : undefined;
      const org = student?.fundingOrgId != null ? orgById.get(student.fundingOrgId) : undefined;

      const priced = priceEvent(
        {
          googleEventId: row.googleEventId,
          businessLine,
          startAt: row.startAt,
          durationMinutes: row.durationMinutes ?? 0,
          instrument: parsed.instrument,
          studentId: student?.id ?? null,
          studentTwoDigitCode: student?.twoDigitCode ?? null,
          fundingOrgId: org?.id ?? null,
          fundingBillingCode: org?.billingCode ?? null,
        },
        ctx,
      );

      if (!priced.ok || !priced.billable) {
        await enqueueReview(row.id, priced.reviewReason ?? "Pricing failed", row.rawTitle);
        reviewCount++;
        continue;
      }
      billableByLine[businessLine].push(priced.billable);
    }
  }

  const invoices: ProposedInvoice[] = [];
  for (const line of Object.keys(billableByLine) as BusinessLine[]) {
    invoices.push(...STRATEGIES[line].aggregate(billableByLine[line]));
  }

  return { billingPeriod, invoices, reviewCount };
}

async function enqueueReview(eventId: number, reason: string, rawTitle: string) {
  // Don't re-add if any row already exists for this event — open or resolved.
  // Resolved means a human already looked at it; recreating it undoes their decision.
  const existing = await db
    .select({ id: reviewQueue.id })
    .from(reviewQueue)
    .where(eq(reviewQueue.eventId, eventId))
    .limit(1);
  if (existing.length) return;
  await db.insert(reviewQueue).values({ eventId, reason, rawTitle });
}

/** Ingest a window of events, then derive the preview for a billing period. */
export async function runIngestAndPreview(
  start: Date,
  end: Date,
  billingPeriod: string,
): Promise<PreviewResult> {
  const ingest = await ingestWindow(start, end);
  await audit("system", "ingest", "window", billingPeriod, ingest);
  // ingestWindow stamps billing_period from each event's start date.
  return buildPreview(billingPeriod);
}

/** Persist the preview's invoices as drafts and push the chosen ones to QBO. */
export async function confirmAndPush(
  billingPeriod: string,
): Promise<{ pushed: number; errors: number }> {
  const preview = await buildPreview(billingPeriod);
  const draftIds = await persistDrafts(preview.invoices);
  const outcomes = await pushInvoices(draftIds);
  const pushed = outcomes.filter((o) => o.action !== "error").length;
  const errors = outcomes.filter((o) => o.action === "error").length;
  await audit("system", "confirm_and_push", "period", billingPeriod, {
    pushed,
    errors,
  });
  return { pushed, errors };
}

export interface SheetSyncOutcome {
  businessLine: "MLIG" | "MLIE";
  parsed: number;
  parseErrors: number;
  pushed: number;
  pushErrors: number;
}

/** Column (0-indexed) in the sheet holding the invoice/doc number, and the
 *  column letter to write "YES" into after a successful push — MLIE only,
 *  MLIG has no such marker column and relies on docNumber uniqueness alone. */
interface CreatedMarker {
  docNumberColumn: number;
  markColumn: string;
}

/** 'YYYY-MM' for the current calendar month — the month whose gigs are
 *  actively happening/have already happened, as opposed to future months
 *  already sitting in the sheet ahead of time. */
function currentBillingMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function syncOneSheet(
  businessLine: "MLIG" | "MLIE",
  sheetId: string | undefined,
  parseRows: (rows: unknown[][]) => Promise<{ invoices: ProposedInvoice[]; errors: string[] }>,
  createdMarker?: CreatedMarker,
  readRows: (sheetId: string) => Promise<unknown[][]> = readCurrentTabRows,
  resolveTabTitle: (sheetId: string) => Promise<string> = currentTabTitle,
): Promise<SheetSyncOutcome | null> {
  if (!sheetId) return null;
  try {
    const rows = await readRows(sheetId);
    const { invoices, errors } = await parseRows(rows);
    const draftIds = await persistDrafts(invoices);
    const pushResults = draftIds.length ? await pushInvoices(draftIds) : [];
    // Only "created" is a genuinely new push — "skipped-existing" and
    // "adopted-duplicate" mean this invoice was already in QBO from an
    // earlier run, so they shouldn't count as freshly pushed or get their
    // sheet row re-marked.
    const pushed = pushResults.filter((o) => o.action === "created").length;
    const pushErrors = pushResults.filter((o) => o.action === "error").length;

    if (createdMarker) {
      const createdDocNumbers = new Set(
        pushResults.filter((o) => o.action === "created").map((o) => o.docNumber),
      );
      if (createdDocNumbers.size > 0) {
        const rowNumbers: number[] = [];
        for (let i = 1; i < rows.length; i++) {
          const cell = rows[i]?.[createdMarker.docNumberColumn];
          const docNumber = cell == null ? "" : String(cell).trim();
          if (docNumber && createdDocNumbers.has(docNumber)) rowNumbers.push(i + 1);
        }
        try {
          const tabTitle = await resolveTabTitle(sheetId);
          await writeCells(sheetId, tabTitle, createdMarker.markColumn, rowNumbers, "YES");
        } catch (writeErr) {
          await audit("system", "sheets_mark_error", businessLine, null, {
            rowCount: rowNumbers.length,
            message: writeErr instanceof Error ? writeErr.message : String(writeErr),
          });
        }
      }
    }

    await audit("system", "sheets_sync", businessLine, null, {
      parsed: invoices.length,
      parseErrors: errors.length,
      pushed,
      pushErrors,
    });
    return { businessLine, parsed: invoices.length, parseErrors: errors.length, pushed, pushErrors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await audit("system", "sheets_sync_error", businessLine, null, { message });
    return { businessLine, parsed: 0, parseErrors: 1, pushed: 0, pushErrors: 0 };
  }
}

/** Sync just the MLIG sheet: read -> parse -> persist -> push. */
export async function syncMligSheet(): Promise<SheetSyncOutcome | null> {
  return syncOneSheet("MLIG", process.env.GOOGLE_SHEET_MLIG_ID, parseMligRows);
}

/**
 * Sync just the MLIE sheet: read -> parse -> persist -> push, then mark
 * column G ("Invoice created") as YES for each row that was pushed. Only
 * rows for the current calendar month are processed — the sheet accumulates
 * future-dated rows as gigs get booked ahead of time. Rows dated today or
 * later are also excluded even within that month: an invoice must never be
 * pushed before the gig it's for has actually happened, so a same-day row
 * just waits for the next sync once that date has passed.
 *
 * MLIE's sheet has one tab per YEAR ("2026", "2025", "2027", ...) rather
 * than MLIG's per-cycle tabs — reads the tab named for the current year
 * explicitly instead of trusting tab position, since that position has
 * already been accidentally changed by dragging tabs around (unlike MLIG,
 * where a new tab is always added at the front each cycle on purpose).
 */
export async function syncMlieSheet(): Promise<SheetSyncOutcome | null> {
  const targetPeriod = currentBillingMonth();
  const now = new Date();
  return syncOneSheet(
    "MLIE",
    process.env.GOOGLE_SHEET_MLIE_ID,
    (rows) => parseMlieRows(rows, targetPeriod, now),
    { docNumberColumn: 5, markColumn: "G" },
    (sheetId) => readCurrentYearRows(sheetId, now),
    (sheetId) => currentYearTabTitle(sheetId, now),
  );
}

/**
 * Read the live MLIG and MLIE Google Sheets, parse any rows found, persist
 * them as drafts, and immediately push to QuickBooks — no manual upload or
 * review step. Each sheet is independent: a failure reading/parsing one
 * doesn't block the other. Existing docNumber/natural-key idempotency in
 * persistDrafts/pushInvoices means re-running this on unchanged sheets is
 * a safe no-op (already-imported rows are skipped, not duplicated).
 */
export async function syncSheetsAndPush(): Promise<SheetSyncOutcome[]> {
  const outcomes = await Promise.all([syncMligSheet(), syncMlieSheet()]);
  return outcomes.filter((o): o is SheetSyncOutcome => o != null);
}
