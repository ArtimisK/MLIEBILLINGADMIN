import { NextRequest, NextResponse } from "next/server";
import { syncMlieSheet } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

// Scheduled entry for the automatic morning MLIE sync — meant to be hit by a
// server cron job (see CRON.md) once daily, early morning Eastern Time.
// syncMlieSheet() itself still enforces the same-day/month-ahead exclusion,
// so this is safe to call as often as you like: it only ever pushes gigs
// whose date has actually passed. MLIG intentionally has no equivalent
// route — it stays manual-button-only (see /upload).
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
    const outcome = await syncMlieSheet();
    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
