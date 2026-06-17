import { revalidatePath } from "next/cache";
import { buildPreview, confirmAndPush } from "@/lib/pipeline";
import { isQboConfigured } from "@/lib/qbo/auth";

export const dynamic = "force-dynamic";

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; pushed?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const period = sp.period || currentPeriod();

  let preview;
  let loadError: string | null = null;
  try {
    preview = await buildPreview(period);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  async function push(formData: FormData) {
    "use server";
    const p = String(formData.get("period") || currentPeriod());
    try {
      const res = await confirmAndPush(p);
      revalidatePath("/preview");
      return void res;
    } catch {
      // Surfaced via the QBO-not-configured notice below; the error is audited.
    }
  }

  return (
    <>
      <h1>Preview — {period}</h1>
      <p className="muted">
        Proposed invoices for the period. Nothing has touched QuickBooks yet — this is the
        correctness oracle. Confirm to push.
      </p>

      <form method="get" className="card" style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
        <label htmlFor="period">Billing period</label>
        <input id="period" name="period" defaultValue={period} placeholder="YYYY-MM" />
        <button type="submit" className="secondary">
          Load
        </button>
      </form>

      {loadError ? (
        <div className="card">
          <span className="pill bad">Error</span>
          <p className="muted">{loadError}</p>
          <p className="muted">
            If this mentions the database, run <code>pnpm db:up &amp;&amp; pnpm db:migrate &amp;&amp; pnpm db:seed</code>.
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            <p>
              <strong>{preview!.invoices.length}</strong> proposed invoice(s) ·{" "}
              <strong>{preview!.reviewCount}</strong> item(s) routed to the review queue.
            </p>
            {preview!.invoices.map((inv) => (
              <div key={inv.docNumber} style={{ margin: "1rem 0" }}>
                <strong>{inv.docNumber}</strong>{" "}
                <span className="pill">{inv.businessLine}</span> ·{" "}
                <span className="muted">{inv.lines.length} line(s)</span> · subtotal{" "}
                <strong>${inv.subtotal.toFixed(2)}</strong>
                <table>
                  <thead>
                    <tr>
                      <th>Service date</th>
                      <th>Item</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.lines.map((l, i) => (
                      <tr key={i}>
                        <td>{l.serviceDate.toISOString().slice(0, 10)}</td>
                        <td>{l.itemName}</td>
                        <td style={{ textAlign: "right" }}>${l.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <form action={push} className="card">
            <input type="hidden" name="period" value={period} />
            {isQboConfigured() ? (
              <button type="submit">Confirm &amp; push to QuickBooks</button>
            ) : (
              <>
                <button type="submit" disabled>
                  Confirm &amp; push to QuickBooks
                </button>
                <p className="muted">Set the QBO_* values in <code>.env</code> to enable pushing.</p>
              </>
            )}
          </form>
        </>
      )}
    </>
  );
}
