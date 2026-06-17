// Persistent QBO refresh-token store (blueprint v2 §6).
// QBO rotates the refresh token on every refresh; if we keep reading the static
// env value we get locked out the moment it rotates. So: seed from env once,
// then always read/write the live token in app_state.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appState } from "@/db/schema";

const KEY = "qbo_refresh_token";

export async function getRefreshToken(): Promise<string | undefined> {
  const row = await db
    .select()
    .from(appState)
    .where(eq(appState.key, KEY))
    .limit(1);
  if (row.length) return row[0].value;
  // First run: fall back to the env seed.
  return process.env.QBO_REFRESH_TOKEN || undefined;
}

export async function saveRefreshToken(token: string): Promise<void> {
  await db
    .insert(appState)
    .values({ key: KEY, value: token, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appState.key,
      set: { value: token, updatedAt: new Date() },
    });
}
