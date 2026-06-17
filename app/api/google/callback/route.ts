import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, getAuthUrl } from "@/lib/google/calendar";

export const dynamic = "force-dynamic";

// One-time OAuth helper. Visit /api/google/callback with no params to get the
// consent URL; Google redirects back here with ?code=... and we exchange it for
// a refresh token to paste into GOOGLE_REFRESH_TOKEN in .env.
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");

  if (!code) {
    return NextResponse.json({
      message: "Open this URL to authorize, then you'll be redirected back here.",
      authUrl: getAuthUrl(),
    });
  }

  try {
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);
    return NextResponse.json({
      message: "Copy refresh_token into GOOGLE_REFRESH_TOKEN in .env",
      refresh_token: tokens.refresh_token ?? "(none returned — revoke access and retry with prompt=consent)",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
