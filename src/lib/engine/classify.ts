// Classification (blueprint §5.2). Decides the disposition of an event from its
// parse result + confirmation signal, before pricing/aggregation.

import type { EventStatus, NormalizedEvent, ParseResult } from "./types";

export interface ClassifyResult {
  status: EventStatus;
  /** when truthy, the event should be pushed to the review queue */
  reviewReason?: string;
}

/**
 * Confirmation mechanism (blueprint §12 edge case):
 * v1 rule — a past event is assumed delivered unless explicitly canceled.
 * Future events that are not yet confirmed are `unconfirmed` and not billed.
 * The `confirmed` flag (from a calendar tag/color, set during ingest) overrides
 * the time heuristic when present.
 */
export function classify(
  event: NormalizedEvent,
  parse: ParseResult,
  now: Date,
): ClassifyResult {
  if (parse.status === "canceled") {
    return { status: "canceled" };
  }

  if (parse.status === "unknown") {
    return {
      status: "unknown",
      reviewReason: parse.reviewReason ?? "Could not resolve event",
    };
  }

  // Not confirmed and not yet in the past → wait, don't bill.
  const inPast = event.endAt.getTime() <= now.getTime();
  if (!event.confirmed && !inPast) {
    return { status: "unconfirmed" };
  }

  // Low rules-confidence but resolvable → still send to review so a human can
  // confirm before it is billed. (A future LLM fallback would slot in here.)
  if (parse.confidence < 0.6) {
    return {
      status: "unknown",
      reviewReason: parse.reviewReason ?? "Low parse confidence",
    };
  }

  return { status: "billable" };
}
