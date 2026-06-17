import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviewQueue } from "@/db/schema";

export const dynamic = "force-dynamic";

async function resolveItem(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  await db
    .update(reviewQueue)
    .set({ resolved: true, resolvedBy: "dashboard", resolvedAt: new Date() })
    .where(eq(reviewQueue.id, id));
  revalidatePath("/review");
}

export default async function ReviewPage() {
  let items: (typeof reviewQueue.$inferSelect)[] = [];
  let loadError: string | null = null;
  try {
    items = await db
      .select()
      .from(reviewQueue)
      .where(and(eq(reviewQueue.resolved, false)));
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  return (
    <>
      <h1>Review queue</h1>
      <p className="muted">
        Anything not confidently billable lands here instead of being billed wrong or dropped
        silently. Resolve an item (and add the alias in the DB) so the next run auto-resolves it.
      </p>

      {loadError ? (
        <div className="card">
          <span className="pill bad">Error</span>
          <p className="muted">{loadError}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <span className="pill good">Empty</span> Nothing waiting for review.
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Raw title</th>
                <th>Reason</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.rawTitle}</td>
                  <td className="muted">{item.reason}</td>
                  <td style={{ textAlign: "right" }}>
                    <form action={resolveItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit" className="secondary">
                        Mark resolved
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
