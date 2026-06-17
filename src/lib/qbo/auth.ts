// QuickBooks Online OAuth2 (blueprint §6). Uses intuit-oauth for the token
// dance. We persist the refresh token in env for v1; a DB-backed token store is
// a Phase-3 hardening item.

import OAuthClient from "intuit-oauth";
import { getRefreshToken, saveRefreshToken } from "./token-store";

export function isQboConfigured(): boolean {
  return Boolean(
    process.env.QBO_CLIENT_ID &&
      process.env.QBO_CLIENT_SECRET &&
      process.env.QBO_REALM_ID &&
      process.env.QBO_REFRESH_TOKEN,
  );
}

export function getEnvironment(): "sandbox" | "production" {
  return process.env.QBO_ENVIRONMENT === "production" ? "production" : "sandbox";
}

export function apiBaseUrl(): string {
  return getEnvironment() === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
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
  if (!isQboConfigured()) {
    throw new Error(
      "QuickBooks is not configured. Fill QBO_* values in .env (see .env.example).",
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
