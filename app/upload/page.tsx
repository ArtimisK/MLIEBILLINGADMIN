import { redirect } from "next/navigation";
import { syncMligSheet, syncMlieSheet } from "@/lib/pipeline";
import SubmitButton from "../components/submit-button";

export const dynamic = "force-dynamic";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{
    syncLine?: string;
    syncPushed?: string;
    syncErrors?: string;
    syncErrDetail?: string;
  }>;
}) {
  const sp = await searchParams;
  const syncLine        = sp.syncLine ?? null;
  const syncPushedCount = sp.syncPushed != null ? Number(sp.syncPushed) : null;
  const syncErrorsCount = sp.syncErrors != null ? Number(sp.syncErrors) : null;
  const syncErrDetail   = sp.syncErrDetail ?? null;

  async function syncMlig() {
    "use server";
    let outcome;
    try {
      outcome = await syncMligSheet();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      redirect("/upload?syncLine=MLIG&syncErrDetail=" + encodeURIComponent(msg));
    }
    const params = new URLSearchParams({ syncLine: "MLIG", syncPushed: String(outcome?.pushed ?? 0) });
    const errors = (outcome?.parseErrors ?? 0) + (outcome?.pushErrors ?? 0);
    if (errors > 0) params.set("syncErrors", String(errors));
    redirect("/upload?" + params.toString());
  }

  async function syncMlie() {
    "use server";
    let outcome;
    try {
      outcome = await syncMlieSheet();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      redirect("/upload?syncLine=MLIE&syncErrDetail=" + encodeURIComponent(msg));
    }
    const params = new URLSearchParams({ syncLine: "MLIE", syncPushed: String(outcome?.pushed ?? 0) });
    const errors = (outcome?.parseErrors ?? 0) + (outcome?.pushErrors ?? 0);
    if (errors > 0) params.set("syncErrors", String(errors));
    redirect("/upload?" + params.toString());
  }

  return (
    <>
      <div className="page-header">
        <h1>Push Invoices</h1>
        <p>
          Reads Lee&apos;s live Google Sheets directly and pushes new invoices to QuickBooks,
          with PDFs saved to Drive — no file to download or upload.
        </p>
      </div>

      {/* Sync-from-Sheets result banner */}
      {syncPushedCount != null && (
        <div className="card" style={{ borderLeft: `4px solid ${syncErrorsCount ? "#f59e0b" : "#16a34a"}`, background: syncErrorsCount ? "#fffbeb" : "#f0fdf4", marginBottom: "1.25rem" }}>
          <div className="row" style={{ gap: ".6rem", alignItems: "center" }}>
            <span className="pill good">Synced{syncLine ? ` (${syncLine})` : ""}</span>
            <span style={{ fontWeight: 600 }}>
              {syncPushedCount} invoice{syncPushedCount !== 1 ? "s" : ""} pushed to QuickBooks
              {syncErrorsCount ? ` · ${syncErrorsCount} error${syncErrorsCount !== 1 ? "s" : ""}` : ""}
            </span>
          </div>
        </div>
      )}
      {syncErrDetail && (
        <div className="card" style={{ borderLeft: "4px solid #dc2626", background: "#fff5f5", marginBottom: "1.25rem" }}>
          <div className="row" style={{ gap: ".6rem", alignItems: "center" }}>
            <span className="pill bad">Sync failed{syncLine ? ` (${syncLine})` : ""}</span>
          </div>
          <p className="muted" style={{ marginTop: ".5rem", fontSize: ".82rem", fontFamily: "ui-monospace,monospace" }}>
            {syncErrDetail}
          </p>
        </div>
      )}

      {/* Sync from Google Sheets — reads Lee's live sheets and pushes directly */}
      <div className="card-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="card" style={{ background: "var(--surface-hi)" }}>
          <div className="row" style={{ gap: ".6rem", alignItems: "center", marginBottom: ".6rem" }}>
            <span className="pill mlig">MLIG</span>
            <p style={{ fontWeight: 700, fontSize: ".95rem", margin: 0 }}>Lessons Sheet</p>
          </div>
          <p className="muted" style={{ fontSize: ".84rem", marginBottom: "1rem" }}>
            Reads the live Lessons sheet and pushes new invoices to QuickBooks (PDFs saved to Drive).
          </p>
          <form action={syncMlig}>
            <SubmitButton label="Push MLIG →" loadingLabel="Pushing…" className="lg" />
          </form>
        </div>
        <div className="card" style={{ background: "var(--surface-hi)" }}>
          <div className="row" style={{ gap: ".6rem", alignItems: "center", marginBottom: ".6rem" }}>
            <span className="pill mlie">MLIE</span>
            <p style={{ fontWeight: 700, fontSize: ".95rem", margin: 0 }}>Gigs Sheet</p>
          </div>
          <p className="muted" style={{ fontSize: ".84rem", marginBottom: "1rem" }}>
            Reads the live Gigs sheet and pushes new invoices to QuickBooks (PDFs saved to Drive).
          </p>
          <form action={syncMlie}>
            <SubmitButton label="Push MLIE →" loadingLabel="Pushing…" className="lg" />
          </form>
        </div>
      </div>
    </>
  );
}
