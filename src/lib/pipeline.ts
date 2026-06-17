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
  // Avoid piling duplicate open items for the same event.
  const existing = await db
    .select({ id: reviewQueue.id })
    .from(reviewQueue)
    .where(and(eq(reviewQueue.eventId, eventId), eq(reviewQueue.resolved, false)))
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
