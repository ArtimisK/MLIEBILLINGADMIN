import { NextRequest, NextResponse } from "next/server";
import { createOAuthClient, getAuthUri } from "@/lib/qbo/auth";
import { saveRefreshToken } from "@/lib/qbo/token-store";
import { db } from "@/db";
import { appState } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const error = url.searchParams.get("error");

  // Step 1: no code yet — return the auth URL to redirect to
  if (!code) {
    return NextResponse.json({ authUrl: getAuthUri() });
  }

  // Intuit returned an error (e.g. user denied access)
  if (error) {
    return NextResponse.redirect(
      new URL("/settings?qbo=error&msg=" + encodeURIComponent(error), req.url),
    );
  }

  try {
    const client = createOAuthClient();
    const authResponse = await client.createToken(req.url);
    const token =
      authResponse.getJson?.() ??
      (authResponse as unknown as { token: unknown }).token;

    const refreshToken = (token as { refresh_token?: string }).refresh_token;
    if (!refreshToken) throw new Error("No refresh_token in Intuit response");

    // Persist refresh token + realm ID in DB so they survive .env changes
    await saveRefreshToken(refreshToken);
    if (realmId) {
      await db
        .insert(appState)
        .values({ key: "qbo_realm_id", value: realmId, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: appState.key,
          set: { value: realmId, updatedAt: new Date() },
        });
    }

    return NextResponse.redirect(new URL("/settings?qbo=connected", req.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      new URL("/settings?qbo=error&msg=" + encodeURIComponent(message), req.url),
    );
  }
}