import { NextRequest, NextResponse } from "next/server";
import { confirmAndPush } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

// "Confirm & Push" action. POST { period: 'YYYY-MM' }.
export async function POST(req: NextRequest) {
  let period: string | undefined;
  try {
    const body = await req.json();
    period = body?.period;
  } catch {
    // allow query param fallback
  }
  period = period || new URL(req.url).searchParams.get("period") || undefined;

  if (!period) {
    return NextResponse.json({ error: "period (YYYY-MM) required" }, { status: 400 });
  }

  try {
    const result = await confirmAndPush(period);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
