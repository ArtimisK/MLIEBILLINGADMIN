// Record (blueprint §5.7): audit logging + a place to mirror to the Sheet.
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export async function audit(
  actor: string,
  action: string,
  entity?: string,
  entityId?: string | number | null,
  detail?: unknown,
): Promise<void> {
  await db.insert(auditLog).values({
    actor,
    action,
    entity: entity ?? null,
    entityId: entityId != null ? String(entityId) : null,
    detail: (detail ?? null) as object | null,
  });
}

/**
 * Optional read-only mirror of created invoices into the Google Sheet for Lee's
 * comfort (blueprint §2). Stub: wire up when/if the sheet mirror is wanted.
 */
export async function mirrorToSheet(_docNumbers: string[]): Promise<void> {
  // Intentionally a no-op until a Sheet mirror is configured.
}
