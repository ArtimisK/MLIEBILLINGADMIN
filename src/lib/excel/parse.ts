// Excel parsers for MLIG (lessons) and MLIE (gigs) billing sheets.
// Both parsers produce ProposedInvoice[] that feed directly into persistDrafts().
//
// MLIG column layout (row 1 = header, row 2+ = data):
//   A  Client Name  |  B  Bill to  |  C  Invoice No.  |  D  Invoice Date
//   then repeating 4-column blocks for each service date:
//   E  Service Date #1  |  F  Product/Service #1  |  G  Description #1  |  H  Amount #1
//   I  Service Date #2  |  J  Product/Service #2  |  K  Description #2  |  L  Amount #2
//   … up to 10 blocks
//
// MLIE column layout (row 1 = header, row 2+ = data):
//   A  Date  |  B  Location  |  C  Time  |  D  Performer Name
//   E  Entertainment Fee  |  F  Invoice Number  |  G  Invoice Created  |  H  Performer Actual Name

import * as XLSX from "xlsx";
import { db } from "@/db";
import { fundingOrgs } from "@/db/schema";
import { eq, ilike } from "drizzle-orm";
import type { ProposedInvoice } from "@/lib/engine/types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function cellStr(row: unknown[], col: number): string {
  const v = row[col];
  if (v == null) return "";
  return String(v).trim();
}

/** Parse MM/DD/YYYY, M/D/YYYY, or ISO date strings. Returns null on failure. */
function parseDate(s: string): Date | null {
  if (!s) return null;
  // xlsx with raw:false may return "M/D/YYYY" format
  const parts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (parts) {
    const d = new Date(Number(parts[3]), Number(parts[1]) - 1, Number(parts[2]));
    return isNaN(d.getTime()) ? null : d;
  }
  // Try ISO or other formats
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Strip $, commas, whitespace and convert to number. */
function parseAmount(s: string): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[$,\s]/g, ""));
  return isNaN(n) ? null : n;
}

/**
 * Extract the billing code from an invoice number.
 * Format: {2-char student code}{billingCode}{4-char MMYY}
 * e.g. "03ISS0726" → "ISS", "26CMS0726" → "CMS", "45ACDS0726" → "ACDS"
 */
function extractBillingCode(invoiceNo: string): string {
  return invoiceNo.slice(2, invoiceNo.length - 4).toUpperCase();
}

/** Derive YYYY-MM billing period from a Date. */
function toPeriod(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Upsert funding org by billing code. Creates one with `billToName` as name if absent. */
async function resolveFundingOrg(
  billingCode: string,
  billToName: string,
): Promise<{ id: number } | null> {
  if (!billingCode) return null;

  // Exact billingCode match first.
  const exact = await db
    .select({ id: fundingOrgs.id })
    .from(fundingOrgs)
    .where(eq(fundingOrgs.billingCode, billingCode))
    .limit(1);
  if (exact.length) return exact[0];

  // Case-insensitive name match (handles "Community Market" ↔ "CMS").
  if (billToName) {
    const byName = await db
      .select({ id: fundingOrgs.id })
      .from(fundingOrgs)
      .where(ilike(fundingOrgs.name, `%${billToName.slice(0, 8)}%`))
      .limit(1);
    if (byName.length) return byName[0];
  }

  // Create a new funding org so the import doesn't block.
  const [created] = await db
    .insert(fundingOrgs)
    .values({ name: billToName || billingCode, billingCode })
    .returning({ id: fundingOrgs.id });
  return created;
}

// ── MLIG parser ──────────────────────────────────────────────────────────────

export interface ParseResult {
  invoices: ProposedInvoice[];
  errors: string[];
  skipped: number;
}

export async function parseMligBuffer(buffer: Buffer): Promise<ParseResult> {
  const wb = XLSX.read(buffer, { type: "buffer", raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: false,
  });

  const invoices: ProposedInvoice[] = [];
  const errors: string[] = [];
  let skipped = 0;

  // Row 0 is the header; data starts at row 1.
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const clientName = cellStr(row, 0);
    const billTo    = cellStr(row, 1);
    const invoiceNo = cellStr(row, 2);
    const invoiceDateStr = cellStr(row, 3);

    if (!invoiceNo && !clientName) continue; // trailing blank rows

    if (!invoiceNo) {
      errors.push(`Row ${i + 1}: missing invoice number (client: "${clientName}")`);
      skipped++;
      continue;
    }

    // Extract billing period from Invoice Date (D column).
    let billingPeriod: string;
    const invoiceDate = parseDate(invoiceDateStr);
    if (invoiceDate) {
      billingPeriod = toPeriod(invoiceDate);
    } else {
      // Fallback: infer from the first service date.
      const firstDateStr = cellStr(row, 4);
      const firstDate = parseDate(firstDateStr);
      if (!firstDate) {
        errors.push(`Row ${i + 1} (${invoiceNo}): cannot determine billing period — skipped`);
        skipped++;
        continue;
      }
      billingPeriod = toPeriod(firstDate);
    }

    // Resolve funding org.
    const billingCode = extractBillingCode(invoiceNo);
    const org = await resolveFundingOrg(billingCode, billTo);
    if (!org) {
      errors.push(`Row ${i + 1} (${invoiceNo}): could not resolve billing org "${billTo}" — skipped`);
      skipped++;
      continue;
    }

    // Parse service date blocks (4 columns each, starting at column 4).
    const lines: ProposedInvoice["lines"] = [];
    for (let block = 0; block < 10; block++) {
      const base = 4 + block * 4;
      const dateStr   = cellStr(row, base);
      const product   = cellStr(row, base + 1);
      const desc      = cellStr(row, base + 2);
      const amountStr = cellStr(row, base + 3);

      if (!dateStr) continue; // no more service dates

      const serviceDate = parseDate(dateStr);
      if (!serviceDate) {
        errors.push(`Row ${i + 1} (${invoiceNo}), block ${block + 1}: invalid date "${dateStr}"`);
        continue;
      }

      const amount = parseAmount(amountStr);
      if (amount == null) {
        errors.push(`Row ${i + 1} (${invoiceNo}), block ${block + 1}: invalid amount "${amountStr}"`);
        continue;
      }

      const itemName = product || "Music Lesson";
      lines.push({
        serviceDate,
        itemName,
        description: desc || itemName,
        amount,
      });
    }

    if (lines.length === 0) {
      errors.push(`Row ${i + 1} (${invoiceNo}): no valid service dates — skipped`);
      skipped++;
      continue;
    }

    const subtotal = lines.reduce((s, l) => s + l.amount, 0);

    invoices.push({
      businessLine: "MLIG",
      fundingOrgId: org.id,
      studentId: null,
      billingPeriod,
      docNumber: invoiceNo,
      lines,
      subtotal,
    });
  }

  return { invoices, errors, skipped };
}

// ── MLIE parser ──────────────────────────────────────────────────────────────

export async function parseMlieBuffer(buffer: Buffer): Promise<ParseResult> {
  const wb = XLSX.read(buffer, { type: "buffer", raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: false,
  });

  const invoices: ProposedInvoice[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const dateStr        = cellStr(row, 0);
    const location       = cellStr(row, 1);
    const time           = cellStr(row, 2);
    const performerName  = cellStr(row, 3);
    const feeStr         = cellStr(row, 4);
    const invoiceNo      = cellStr(row, 5);
    const invoiceCreated = cellStr(row, 6).toUpperCase();

    if (!invoiceNo && !dateStr) continue; // trailing blank rows
    if (!invoiceNo) continue;

    // Skip duplicate/replicated invoices — they're already in QBO.
    if (invoiceCreated === "REPLICATED") {
      skipped++;
      continue;
    }

    const serviceDate = parseDate(dateStr);
    if (!serviceDate) {
      errors.push(`Row ${i + 1} (${invoiceNo}): invalid date "${dateStr}"`);
      skipped++;
      continue;
    }

    const amount = parseAmount(feeStr);
    if (amount == null) {
      errors.push(`Row ${i + 1} (${invoiceNo}): invalid fee "${feeStr}"`);
      skipped++;
      continue;
    }

    const billingPeriod = toPeriod(serviceDate);
    const itemName = "60-Minute Music Performance";

    invoices.push({
      businessLine: "MLIE",
      fundingOrgId: null,
      studentId: null,
      billingPeriod,
      docNumber: invoiceNo,
      venueName: location || "Unknown Venue",
      lines: [
        {
          serviceDate,
          itemName,
          description: [performerName, time].filter(Boolean).join(" · ") || itemName,
          amount,
        },
      ],
      subtotal: amount,
    });
  }

  return { invoices, errors, skipped };
}
