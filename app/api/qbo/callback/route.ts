import { NextRequest, NextResponse } from "next/server";
import { createOAuthClient, getAuthUri } from "@/lib/qbo/auth";

export const dynamic = "force-dynamic";

// One-time QBO OAuth helper. Visit with no params to get the consent URL;
// Intuit redirects back with ?code=...&realmId=... which we exchange for a
// refresh token to paste into QBO_REFRESH_TOKEN (+ QBO_REALM_ID) in .env.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");

  if (!code) {
    return NextResponse.json({
      message: "Open this URL to authorize, then you'll be redirected back here.",
      authUrl: getAuthUri(),
    });
  }

  try {
    const client = createOAuthClient();
    const authResponse = await client.createToken(req.url);
    const token = authResponse.getJson?.() ?? (authResponse as unknown as { token: unknown }).token;
    const refreshToken = (token as { refresh_token?: string }).refresh_token;
    return NextResponse.json({
      message: "Copy these into .env",
      QBO_REFRESH_TOKEN: refreshToken ?? "(none)",
      QBO_REALM_ID: realmId ?? "(missing realmId in callback)",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
