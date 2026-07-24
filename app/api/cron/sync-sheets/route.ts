import { NextRequest, NextResponse } from "next/server";
import { syncSheetsAndPush } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

// Scheduler entry for the live Google Sheets sync (MLIG + MLIE). Reads each
// sheet's current tab, imports any new rows, and pushes them straight to
// QuickBooks — no manual upload or review step.
// Protected by a shared secret in `Authorization: Bearer <CRON_SECRET>`.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured (local dev) → allow
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const outcomes = await syncSheetsAndPush();
    return NextResponse.json({ ok: true, outcomes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
