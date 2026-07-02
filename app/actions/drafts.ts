"use server";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { invoices, invoiceLines } from "@/db/schema";

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function deleteDraft(formData: FormData) {
  const id = Number(formData.get("id"));
  const p  = String(formData.get("period") ?? currentPeriod());
  await db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, id));
  await db.delete(invoices).where(and(eq(invoices.id, id), eq(invoices.status, "draft")));
  redirect(`/preview?period=${p}`);
}

export async function clearPeriodDrafts(formData: FormData) {
  const p = String(formData.get("period") ?? currentPeriod());
  const draftIds = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.billingPeriod, p), eq(invoices.status, "draft")));
  if (draftIds.length > 0) {
    await db.delete(invoiceLines).where(
      inArray(invoiceLines.invoiceId, draftIds.map((r) => r.id)),
    );
    await db.delete(invoices).where(
      inArray(invoices.id, draftIds.map((r) => r.id)),
    );
  }
  redirect(`/preview?period=${p}&cleared=1`);
}