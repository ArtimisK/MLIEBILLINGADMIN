// Ingest (blueprint §5.1): pull events for a window from each calendar and
// upsert into `events` keyed on google_event_id. Computes content_hash so edits
// are detectable; a changed `billed` event is flagged for review, not re-billed.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { calendars, events, reviewQueue } from "@/db/schema";
import { fetchEvents, type RawCalendarEvent } from "@/lib/google/calendar";
import { contentHash } from "./hash";
import { toBillingPeriod } from "./strategies/base";
import type { BusinessLine } from "./types";

export interface IngestResult {
  businessLine: BusinessLine;
  fetched: number;
  inserted: number;
  updated: number;
  flaggedEdits: number;
}

function durationMinutes(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

export async function ingestWindow(
  start: Date,
  end: Date,
): Promise<IngestResult[]> {
  const cals = await db.select().from(calendars);
  const results: IngestResult[] = [];

  for (const cal of cals) {
    const raw: RawCalendarEvent[] = await fetchEvents(
      cal.googleCalendarId,
      start,
      end,
    );

    let inserted = 0;
    let updated = 0;
    let flaggedEdits = 0;

    for (const ev of raw) {
      const dur = durationMinutes(ev.start, ev.end);
      const hash = contentHash(ev.title, ev.start.toISOString(), dur);

      const existing = await db
        .select()
        .from(events)
        .where(eq(events.googleEventId, ev.id))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(events).values({
          googleEventId: ev.id,
          calendarId: cal.id,
          startAt: ev.start,
          endAt: ev.end,
          rawTitle: ev.title,
          durationMinutes: dur,
          status: "unknown",
          billingPeriod: toBillingPeriod(ev.start),
          confirmed: ev.confirmed ?? false,
          contentHash: hash,
        });
        inserted++;
        continue;
      }

      const row = existing[0];
      if (row.contentHash === hash) continue; // unchanged

      // Changed. If it was already billed, flag for review rather than re-bill.
      if (row.status === "billed") {
        await db.insert(reviewQueue).values({
          eventId: row.id,
          reason: "Billed event was edited after invoicing",
          rawTitle: ev.title,
        });
        flaggedEdits++;
      }

      await db
        .update(events)
        .set({
          startAt: ev.start,
          endAt: ev.end,
          rawTitle: ev.title,
          durationMinutes: dur,
          billingPeriod: toBillingPeriod(ev.start),
          confirmed: ev.confirmed ?? row.confirmed,
          contentHash: hash,
        })
        .where(eq(events.id, row.id));
      updated++;
    }

    results.push({
      businessLine: cal.businessLine,
      fetched: raw.length,
      inserted,
      updated,
      flaggedEdits,
    });
  }

  return results;
}
