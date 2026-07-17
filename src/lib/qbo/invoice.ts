// QBO entity operations (blueprint §6): customer, item, invoice — with the
// find-or-create + idempotency helpers push.ts relies on.

import { qboPost, qboQuery } from "./client";

interface QboRef {
  value: string;
  name?: string;
}

export interface QboInvoiceLineInput {
  itemName: string;
  itemRef?: string; // cached ItemRef.value
  amount: number;
  qty?: number;
  unitPrice?: number;
  serviceDate?: Date;
  description?: string;
}

export interface CreateInvoiceInput {
  customerRef: string;
  docNumber: string;
  txnDate?: string; // YYYY-MM-DD — invoice date shown in QBO
  lines: QboInvoiceLineInput[];
}

/**
 * Pre-flight (blueprint v2 §6): QBO must have "Custom transaction numbers" ON,
 * or it ignores our DocNumber and auto-numbers — silently breaking both the
 * invoice-number scheme and the DocNumber idempotency guard. Refuse to run if off.
 */
export async function assertCustomTxnNumbersEnabled(): Promise<void> {
  const res = await qboQuery<{
    QueryResponse?: { Preferences?: { SalesFormsPrefs?: { CustomTxnNumbers?: boolean } }[] };
  }>("SELECT * FROM Preferences");
  const enabled =
    res.QueryResponse?.Preferences?.[0]?.SalesFormsPrefs?.CustomTxnNumbers ?? false;
  if (!enabled) {
    throw new Error(
      "QBO 'Custom transaction numbers' is OFF. Enable it (Account and Settings → " +
        "Sales → Sales form content) before running, or QBO auto-numbers invoices " +
        "and DocNumber idempotency breaks.",
    );
  }
}

/** Find a customer by DisplayName; create if missing. Returns its id. */
export async function ensureCustomer(displayName: string): Promise<string> {
  const found = await qboQuery<{ QueryResponse?: { Customer?: { Id: string }[] } }>(
    `SELECT * FROM Customer WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`,
  );
  const existing = found.QueryResponse?.Customer?.[0];
  if (existing) return existing.Id;

  const created = await qboPost<{ Customer: { Id: string } }>("customer", {
    DisplayName: displayName,
  });
  return created.Customer.Id;
}

export interface EnsureSubCustomerResult {
  id: string;
  /** True if studentName collided with a sub-customer under a DIFFERENT parent,
   *  so a disambiguated DisplayName ("Name (ParentName)") was used instead. */
  disambiguated: boolean;
}

/**
 * Find or create a sub-customer (Job) under a parent customer.
 * QBO hierarchy: ParentOrg > StudentName — invoice shows student as Customer,
 * parent org's address as Bill to.
 *
 * QBO requires DisplayName to be unique across all Customer/Vendor/Employee
 * records, so if studentName is already taken by a sub-customer of a DIFFERENT
 * parent, we fall back to "studentName (parentName)" and report the collision
 * so the caller can flag the invoice for review instead of silently attaching
 * to the wrong parent.
 */
export async function ensureSubCustomer(
  studentName: string,
  parentId: string,
  parentName: string,
): Promise<EnsureSubCustomerResult> {
  // QBO stores sub-customer DisplayName as "ParentName:StudentName".
  // ParentRef is not queryable, so search by DisplayName suffix, then verify
  // the actual ParentRef of any match before trusting it.
  const safeName = studentName.replace(/'/g, "\\'");
  const found = await qboQuery<{
    QueryResponse?: { Customer?: { Id: string; DisplayName: string; ParentRef?: QboRef }[] };
  }>(`SELECT * FROM Customer WHERE DisplayName LIKE '%:${safeName}'`);
  const children = found.QueryResponse?.Customer ?? [];
  const nameMatch = children.find((c) => {
    const parts = c.DisplayName.split(":");
    const childPart = parts[parts.length - 1].trim();
    return childPart.toLowerCase() === studentName.toLowerCase();
  });

  if (nameMatch) {
    if (nameMatch.ParentRef?.value === parentId) {
      return { id: nameMatch.Id, disambiguated: false };
    }
    // Same student name exists under a different parent — disambiguate.
    const disambiguatedName = `${studentName} (${parentName})`;
    const safeDisambiguated = disambiguatedName.replace(/'/g, "\\'");
    const foundDisambiguated = await qboQuery<{
      QueryResponse?: { Customer?: { Id: string; ParentRef?: QboRef }[] };
    }>(`SELECT * FROM Customer WHERE DisplayName LIKE '%:${safeDisambiguated}'`);
    const existingDisambiguated = foundDisambiguated.QueryResponse?.Customer?.find(
      (c) => c.ParentRef?.value === parentId,
    );
    if (existingDisambiguated) {
      return { id: existingDisambiguated.Id, disambiguated: true };
    }
    const created = await qboPost<{ Customer: { Id: string } }>("customer", {
      DisplayName: disambiguatedName,
      ParentRef: { value: parentId },
      Job: true,
    });
    return { id: created.Customer.Id, disambiguated: true };
  }

  const created = await qboPost<{ Customer: { Id: string } }>("customer", {
    DisplayName: studentName,
    ParentRef: { value: parentId },
    Job: true,
  });
  return { id: created.Customer.Id, disambiguated: false };
}

/** Resolve an Item (Product/Service) id by exact name; must already exist in QBO. */
export async function ensureItem(itemName: string): Promise<string> {
  const found = await qboQuery<{ QueryResponse?: { Item?: { Id: string }[] } }>(
    `SELECT * FROM Item WHERE Name = '${itemName.replace(/'/g, "\\'")}'`,
  );
  const existing = found.QueryResponse?.Item?.[0];
  if (!existing) {
    throw new Error(
      `QBO Item "${itemName}" not found. Create it in QBO (names must match exactly).`,
    );
  }
  return existing.Id;
}

/** Secondary idempotency guard (blueprint §6): adopt an existing invoice by DocNumber. */
export async function findInvoiceByDocNumber(
  docNumber: string,
): Promise<string | null> {
  const found = await qboQuery<{ QueryResponse?: { Invoice?: { Id: string }[] } }>(
    `SELECT * FROM Invoice WHERE DocNumber = '${docNumber.replace(/'/g, "\\'")}'`,
  );
  return found.QueryResponse?.Invoice?.[0]?.Id ?? null;
}

/** Like findInvoiceByDocNumber, but also returns SyncToken (required to delete). */
export async function findInvoiceRefByDocNumber(
  docNumber: string,
): Promise<{ id: string; syncToken: string } | null> {
  const found = await qboQuery<{
    QueryResponse?: { Invoice?: { Id: string; SyncToken: string }[] };
  }>(`SELECT * FROM Invoice WHERE DocNumber = '${docNumber.replace(/'/g, "\\'")}'`);
  const existing = found.QueryResponse?.Invoice?.[0];
  return existing ? { id: existing.Id, syncToken: existing.SyncToken } : null;
}

/** Delete an invoice in QBO so its DocNumber can be reused by a fresh create. */
export async function deleteInvoice(id: string, syncToken: string): Promise<void> {
  await qboPost("invoice", { Id: id, SyncToken: syncToken }, { operation: "delete" });
}

export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<{ id: string; docNumber: string }> {
  const Line = input.lines.map((l) => ({
    DetailType: "SalesItemLineDetail",
    Amount: l.amount,
    Description: l.description,
    SalesItemLineDetail: {
      ItemRef: { value: l.itemRef } as QboRef,
      Qty: l.qty ?? 1,
      ...(l.unitPrice != null ? { UnitPrice: l.unitPrice } : {}),
      ...(l.serviceDate
        ? { ServiceDate: l.serviceDate.toISOString().slice(0, 10) }
        : {}),
    },
  }));

  const created = await qboPost<{ Invoice: { Id: string; DocNumber: string } }>(
    "invoice",
    {
      CustomerRef:  { value: input.customerRef } as QboRef,
      CurrencyRef:  { value: "USD", name: "United States Dollar" },
      DocNumber:    input.docNumber,
      ...(input.txnDate ? { TxnDate: input.txnDate } : {}),
      TxnTaxDetail: { TotalTax: 0 },
      SalesTermRef: { value: "3" }, // Net 30
      Line,
    },
  );

  return { id: created.Invoice.Id, docNumber: created.Invoice.DocNumber };
}

/** Email the invoice via QBO. sendTo must be a valid email address. */
export async function sendInvoice(invoiceId: string, sendTo: string): Promise<void> {
  await qboPost(`invoice/${invoiceId}/send`, {}, { sendTo });
}
