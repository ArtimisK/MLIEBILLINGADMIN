import { NextRequest, NextResponse } from "next/server";
import { runIngestAndPreview } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

// Scheduler entry. Works on a VPS (node-cron hitting this URL) or Vercel Cron.
// Protected by a shared secret in `Authorization: Bearer <CRON_SECRET>`
// (Vercel Cron sends this automatically when CRON_SECRET is set).
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured (local dev) → allow
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

function defaultWindow(): { start: Date; end: Date; period: string } {
  // Default to the current calendar month.
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const period = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, period };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const { start, end, period } = defaultWindow();
  const billingPeriod = searchParams.get("period") || period;

  try {
    const result = await runIngestAndPreview(start, end, billingPeriod);
    return NextResponse.json({
      ok: true,
      billingPeriod,
      proposedInvoices: result.invoices.length,
      reviewCount: result.reviewCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
