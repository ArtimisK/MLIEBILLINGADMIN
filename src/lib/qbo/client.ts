// Thin REST wrapper over the QBO Accounting API (blueprint §6). All calls hit
// /v3/company/{realmId}. Keeps invoice.ts free of HTTP boilerplate.

import { apiBaseUrl, getAccessToken } from "./auth";

function realmId(): string {
  const id = process.env.QBO_REALM_ID;
  if (!id) throw new Error("QBO_REALM_ID is not set");
  return id;
}

async function authedHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

/** Run a QBO SQL-ish query (e.g. SELECT * FROM Invoice WHERE DocNumber = '...'). */
export async function qboQuery<T = unknown>(query: string): Promise<T> {
  const url = `${apiBaseUrl()}/v3/company/${realmId()}/query?query=${encodeURIComponent(
    query,
  )}&minorversion=70`;
  const res = await fetch(url, { headers: await authedHeaders() });
  if (!res.ok) {
    throw new Error(`QBO query failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** POST an entity (e.g. /invoice, /customer, /item). */
export async function qboPost<T = unknown>(
  entity: string,
  body: unknown,
): Promise<T> {
  const url = `${apiBaseUrl()}/v3/company/${realmId()}/${entity}?minorversion=70`;
  const res = await fetch(url, {
    method: "POST",
    headers: await authedHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`QBO POST ${entity} failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}
