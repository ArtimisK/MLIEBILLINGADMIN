// Push (blueprint §5.6 + §6): persist proposed invoices as drafts, then create
// them in QBO with the double-guard idempotency that kills duplicate invoices.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { events, fundingOrgs, invoiceLines, invoices } from "@/db/schema";
import {
  assertCustomTxnNumbersEnabled,
  createInvoice,
  ensureCustomer,
  ensureSubCustomer,
  ensureItem,
  findInvoiceByDocNumber,
} from "@/lib/qbo/invoice";
import { qboGetPdf } from "@/lib/qbo/client";
import { isQboConfigured } from "@/lib/qbo/auth";
import { isDriveConfigured, uploadInvoicePdf } from "@/lib/drive/upload";
import { audit } from "./record";
import type { ProposedInvoice } from "./types";

/** Write proposed invoices (+ lines) as `draft` rows, skipping ones that already
 *  exist by natural key. Returns the persisted invoice ids. Pure DB, no QBO. */
export async function persistDrafts(
  proposed: ProposedInvoice[],
): Promise<number[]> {
  const ids: number[] = [];

  for (const inv of proposed) {
    // Idempotency key #2: at most one invoice per (line, org, student, period).
    const existing = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.businessLine, inv.businessLine),
          eq(invoices.billingPeriod, inv.billingPeriod),
          eq(invoices.docNumber, inv.docNumber),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      ids.push(existing[0].id);
      continue;
    }

    const [row] = await db
      .insert(invoices)
      .values({
        businessLine: inv.businessLine,
        fundingOrgId: inv.fundingOrgId,
        studentId: inv.studentId,
        billingPeriod: inv.billingPeriod,
        docNumber: inv.docNumber,
        status: "draft",
        subtotal: String(inv.subtotal),
        venueName: inv.venueName ?? null,
        clientName: inv.clientName ?? null,
      })
      .returning();

    // Link lines to their source events so we can mark them billed later.
    // Excel-imported lines have no eventGoogleId so eventId stays null.
    for (const line of inv.lines) {
      const ev = line.eventGoogleId
        ? await db.select({ id: events.id }).from(events)
            .where(eq(events.googleEventId, line.eventGoogleId)).limit(1)
        : [];
      await db.insert(invoiceLines).values({
        invoiceId: row.id,
        eventId: ev[0]?.id ?? null,
        serviceDate: line.serviceDate,
        itemName: line.itemName,
        description: line.description,
        amount: String(line.amount),
      });
    }

    ids.push(row.id);
  }

  return ids;
}

export interface PushOutcome {
  invoiceId: number;
  docNumber: string;
  qboInvoiceId: string | null;
  action: "skipped-existing" | "adopted-duplicate" | "created" | "error";
  error?: string;
}

/**
 * Push draft invoices to QBO. The double guard (blueprint §6):
 *   1. If our row already has qbo_invoice_id → skip (never create twice).
 *   2. Before create, query QBO by DocNumber; if found, adopt that id.
 * Pass force=true to skip guard #2 (used when re-pushing with corrected customer mapping).
 */
export async function pushInvoices(invoiceIds: number[], force = false): Promise<PushOutcome[]> {
  if (!isQboConfigured()) {
    throw new Error(
      "QuickBooks is not configured. Fill QBO_* values in .env (see .env.example).",
    );
  }

  // Pre-flight: refuse to run if QBO would override our DocNumber.
  await assertCustomTxnNumbersEnabled();

  const rows = await db
    .select()
    .from(invoices)
    .where(inArray(invoices.id, invoiceIds));

  // Cache QBO ItemRefs across the batch.
  const itemRefCache = new Map<string, string>();
  const outcomes: PushOutcome[] = [];

  for (const inv of rows) {
    // Guard #1: already pushed.
    if (inv.qboInvoiceId) {
      outcomes.push({
        invoiceId: inv.id,
        docNumber: inv.docNumber,
        qboInvoiceId: inv.qboInvoiceId,
        action: "skipped-existing",
      });
      continue;
    }

    try {
      // Guard #2: adopt an existing QBO invoice with the same DocNumber (skip when force=true).
      if (!force) {
        const adopted = await findInvoiceByDocNumber(inv.docNumber);
        if (adopted) {
          await markInvoicePushed(inv.id, adopted, "created");
          outcomes.push({
            invoiceId: inv.id,
            docNumber: inv.docNumber,
            qboInvoiceId: adopted,
            action: "adopted-duplicate",
          });
          continue;
        }
      }

      // Resolve QBO customer:
      // - MLIE: venue name (building) is the customer
      // - MLIG with student name: student is a sub-customer of the funding org
      //   (QBO shows student as "Customer", funding org as "Bill to")
      // - MLIG without student name: fall back to funding org as customer
      let customerRef: string;
      if (inv.venueName) {
        customerRef = await ensureCustomer(inv.venueName);
      } else if (inv.clientName && inv.fundingOrgId) {
        const org = (
          await db.select().from(fundingOrgs).where(eq(fundingOrgs.id, inv.fundingOrgId)).limit(1)
        )[0];
        const parentRef = await ensureCustomer(org?.name ?? "Unknown Org");
        customerRef = await ensureSubCustomer(inv.clientName, parentRef);
      } else if (inv.fundingOrgId) {
        const org = (
          await db.select().from(fundingOrgs).where(eq(fundingOrgs.id, inv.fundingOrgId)).limit(1)
        )[0];
        customerRef = await ensureCustomer(org?.name ?? "Unknown Customer");
      } else {
        customerRef = await ensureCustomer("Unknown Customer");
      }

      // Resolve lines + item refs.
      const lines = await db
        .select()
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, inv.id));

      const qboLines = [];
      for (const l of lines) {
        let itemRef = itemRefCache.get(l.itemName);
        if (!itemRef) {
          itemRef = await ensureItem(l.itemName);
          itemRefCache.set(l.itemName, itemRef);
        }
        qboLines.push({
          itemName: l.itemName,
          itemRef,
          amount: Number(l.amount),
          serviceDate: l.serviceDate,
          description: l.description ?? undefined,
        });
      }

      // MLIG: invoice date = 1st of the billing month (e.g. 2026-07 → 2026-07-01)
      // MLIE: invoice date = service date of the gig
      let txnDate: string | undefined;
      if (inv.businessLine === "MLIE" && lines[0]?.serviceDate) {
        const d = new Date(lines[0].serviceDate);
        txnDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      } else {
        txnDate = inv.billingPeriod ? `${inv.billingPeriod}-01` : undefined;
      }

      const created = await createInvoice({
        customerRef,
        docNumber: inv.docNumber,
        txnDate,
        lines: qboLines,
      });

      await markInvoicePushed(inv.id, created.id, "created");

      // Optional: upload QBO invoice PDF to Google Drive (non-fatal).
      if (isDriveConfigured()) {
        try {
          const pdf = await qboGetPdf(`invoice/${created.id}/pdf`);
          const driveFileId = await uploadInvoicePdf(inv.docNumber, pdf);
          await db
            .update(invoices)
            .set({ driveFileId })
            .where(eq(invoices.id, inv.id));
          await audit("system", "drive.uploaded", "invoice", inv.id, { driveFileId });
        } catch (driveErr) {
          await audit("system", "drive.error", "invoice", inv.id, {
            error: driveErr instanceof Error ? driveErr.message : String(driveErr),
          });
        }
      }

      outcomes.push({
        invoiceId: inv.id,
        docNumber: inv.docNumber,
        qboInvoiceId: created.id,
        action: "created",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(invoices)
        .set({ status: "error", errorMessage: message })
        .where(eq(invoices.id, inv.id));
      await audit("system", "push.error", "invoice", inv.id, { message });
      outcomes.push({
        invoiceId: inv.id,
        docNumber: inv.docNumber,
        qboInvoiceId: null,
        action: "error",
        error: message,
      });
    }
  }

  return outcomes;
}

/** Store the QBO id, mark the invoice created, and flip its events to billed. */
async function markInvoicePushed(
  invoiceId: number,
  qboInvoiceId: string,
  status: "created",
): Promise<void> {
  await db
    .update(invoices)
    .set({ qboInvoiceId, status, errorMessage: null })
    .where(eq(invoices.id, invoiceId));

  const lines = await db
    .select({ eventId: invoiceLines.eventId })
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId));

  const eventIds = lines
    .map((l) => l.eventId)
    .filter((id): id is number => id != null);

  if (eventIds.length > 0) {
    await db
      .update(events)
      .set({ status: "billed", invoiceId })
      .where(inArray(events.id, eventIds));
  }

  await audit("system", "push.created", "invoice", invoiceId, { qboInvoiceId });
}
