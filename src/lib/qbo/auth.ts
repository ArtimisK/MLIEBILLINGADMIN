import OAuthClient from "intuit-oauth";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appState } from "@/db/schema";
import { getRefreshToken, saveRefreshToken } from "./token-store";

/** Realm ID is stored in DB after the OAuth flow; falls back to env for legacy compat. */
export async function getRealmId(): Promise<string | null> {
  const row = await db
    .select()
    .from(appState)
    .where(eq(appState.key, "qbo_realm_id"))
    .limit(1);
  if (row.length) return row[0].value;
  return process.env.QBO_REALM_ID ?? null;
}

export async function isQboConfigured(): Promise<boolean> {
  if (!process.env.QBO_CLIENT_ID || !process.env.QBO_CLIENT_SECRET) return false;
  const [token, realm] = await Promise.all([getRefreshToken(), getRealmId()]);
  return Boolean(token && realm);
}

export function getEnvironment(): "sandbox" | "production" {
  return process.env.QBO_ENVIRONMENT === "production" ? "production" : "sandbox";
}

export function apiBaseUrl(): string {
  return getEnvironment() === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

/**
 * Public origin the app is reachable at (e.g. https://billing.occupationaloctaves.com).
 * Derived from QBO_REDIRECT_URI rather than the incoming request: behind the
 * Cloudflare Tunnel, req.url reflects the container's internal hostname, so
 * building redirects from it sends browsers to an unreachable address.
 */
export function publicAppOrigin(): string {
  const redirectUri = process.env.QBO_REDIRECT_URI ?? "";
  try {
    return new URL(redirectUri).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export function createOAuthClient(): OAuthClient {
  return new OAuthClient({
    clientId: process.env.QBO_CLIENT_ID ?? "",
    clientSecret: process.env.QBO_CLIENT_SECRET ?? "",
    environment: getEnvironment(),
    redirectUri: process.env.QBO_REDIRECT_URI ?? "",
  });
}

/** Authorization URL for the one-time consent flow. */
export function getAuthUri(): string {
  const client = createOAuthClient();
  return client.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: "mlie-invoicing",
  });
}

/** Exchange the stored refresh token for a fresh short-lived access token. */
export async function getAccessToken(): Promise<string> {
  if (!(await isQboConfigured())) {
    throw new Error(
      "QuickBooks is not connected. Go to Settings → Connect QuickBooks.",
    );
  }
  const client = createOAuthClient();
  // Read the live (possibly already-rotated) token, not the static env seed.
  const current = (await getRefreshToken()) ?? "";
  const res = await client.refreshUsingToken(current);
  // intuit-oauth returns a Token wrapper; access_token lives on the json body.
  const token =
    res.getJson?.() ??
    (res as unknown as { token: { access_token: string; refresh_token?: string } }).token;
  const accessToken = (token as { access_token?: string }).access_token;
  if (!accessToken) throw new Error("Failed to obtain QBO access token");

  // CRITICAL: QBO rotates the refresh token on every refresh. Persist the new
  // one immediately or the next refresh fails and the instance is locked out.
  const rotated = (token as { refresh_token?: string }).refresh_token;
  if (rotated && rotated !== current) await saveRefreshToken(rotated);

  return accessToken;
}
