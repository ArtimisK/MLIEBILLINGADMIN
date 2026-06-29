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

function reasonVariant(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("unresolved") || r.includes("unknown student")) return "warn";
  if (r.includes("price") || r.includes("pricing"))              return "bad";
  return "neutral";
}

function reasonExplain(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("unresolved student"))
    return "Student name wasn't recognized — add an alias in the roster.";
  if (r.includes("unconfirmed"))
    return "Future event — add a color to the calendar event to mark it confirmed.";
  if (r.includes("price") || r.includes("pricing"))
    return "No price rule matches this event's duration or instrument.";
  if (r.includes("low confidence"))
    return "Event title is ambiguous — check it and mark resolved if correct.";
  return "Check the calendar event and mark resolved if it looks right.";
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
      <div className="page-header">
        <h1>Needs Attention</h1>
        <p>
          These calendar events couldn&apos;t be billed automatically.
          Fix the issue described, then mark each one resolved.
        </p>
      </div>

      {loadError ? (
        <div className="card">
          <span className="pill bad">Error</span>
          <p className="muted" style={{ marginTop: ".6rem" }}>{loadError}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <div className="empty">
            <span className="empty-icon">✓</span>
            <h2>All clear</h2>
            <p>Every event has been processed. Nothing needs your attention right now.</p>
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: ".75rem" }}>
            <span className="pill warn" style={{ fontSize: ".75rem" }}>
              {items.length} item{items.length !== 1 ? "s" : ""} need attention
            </span>
          </div>

          {items.map((item) => (
            <div key={item.id} className="card" style={{ marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: ".5rem", flexWrap: "wrap" }}>
                    <span className={`pill ${reasonVariant(item.reason)}`}>{item.reason}</span>
                  </div>
                  <p style={{ fontWeight: 600, fontSize: ".95rem", marginBottom: ".3rem" }}>
                    {item.rawTitle}
                  </p>
                  <p className="muted" style={{ fontSize: ".85rem" }}>
                    {reasonExplain(item.reason)}
                  </p>
                </div>
                <form action={resolveItem} style={{ flexShrink: 0 }}>
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="ghost sm">
                    ✓ Mark resolved
                  </button>
                </form>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
