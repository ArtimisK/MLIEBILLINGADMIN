import { describe, it, expect } from "vitest";
import { classify } from "@/lib/engine/classify";
import type { NormalizedEvent, ParseResult } from "@/lib/engine/types";

const now = new Date("2026-06-15T12:00:00Z");

function event(over: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    googleEventId: "g",
    businessLine: "MLIG",
    startAt: new Date("2026-06-10T15:00:00Z"),
    endAt: new Date("2026-06-10T16:00:00Z"),
    rawTitle: "Jamie & Lee 🎹",
    confirmed: false,
    ...over,
  };
}

function parse(over: Partial<ParseResult>): ParseResult {
  return {
    status: "billable",
    instrument: "piano",
    teacher: "lee",
    students: [{ studentId: 1, rawName: "Jamie" }],
    confidence: 1,
    ...over,
  };
}

describe("classify (§5.2)", () => {
  it("never bills a cancellation", () => {
    expect(classify(event({}), parse({ status: "canceled" }), now).status).toBe("canceled");
  });

  it("routes unknown parses to review", () => {
    const r = classify(event({}), parse({ status: "unknown", reviewReason: "no match" }), now);
    expect(r.status).toBe("unknown");
    expect(r.reviewReason).toBe("no match");
  });

  it("holds a future, unconfirmed event as unconfirmed", () => {
    const r = classify(
      event({ startAt: new Date("2026-06-20T15:00:00Z"), endAt: new Date("2026-06-20T16:00:00Z") }),
      parse({}),
      now,
    );
    expect(r.status).toBe("unconfirmed");
  });

  it("bills a past, confident event (assumed delivered unless canceled)", () => {
    expect(classify(event({}), parse({}), now).status).toBe("billable");
  });

  it("sends a low-confidence parse to review even when resolvable", () => {
    const r = classify(event({}), parse({ confidence: 0.4, reviewReason: "shaky" }), now);
    expect(r.status).toBe("unknown");
  });

  it("bills a future event once it is explicitly confirmed", () => {
    const r = classify(
      event({ startAt: new Date("2026-06-20T15:00:00Z"), endAt: new Date("2026-06-20T16:00:00Z"), confirmed: true }),
      parse({}),
      now,
    );
    expect(r.status).toBe("billable");
  });
});
