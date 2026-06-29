import { apiBaseUrl, getAccessToken, getRealmId } from "./auth";

async function realmId(): Promise<string> {
  const id = await getRealmId();
  if (!id) throw new Error("QBO Realm ID not set — connect QuickBooks in Settings.");
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
  const url = `${apiBaseUrl()}/v3/company/${await realmId()}/query?query=${encodeURIComponent(
    query,
  )}&minorversion=70`;
  const res = await fetch(url, { headers: await authedHeaders() });
  if (!res.ok) {
    throw new Error(`QBO query failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** Download a QBO resource as a PDF buffer (e.g. invoice/{id}/pdf). */
export async function qboGetPdf(path: string): Promise<Buffer> {
  const token = await getAccessToken();
  const url = `${apiBaseUrl()}/v3/company/${await realmId()}/${path}?minorversion=70`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/pdf",
    },
  });
  if (!res.ok) {
    throw new Error(`QBO PDF download failed (${res.status}): ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** POST an entity (e.g. /invoice, /customer, /item). */
export async function qboPost<T = unknown>(
  entity: string,
  body: unknown,
  extraParams?: Record<string, string>,
): Promise<T> {
  const params = new URLSearchParams({ minorversion: "70", ...extraParams });
  const url = `${apiBaseUrl()}/v3/company/${await realmId()}/${entity}?${params}`;
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
