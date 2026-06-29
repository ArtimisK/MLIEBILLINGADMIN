import { redirect } from "next/navigation";
import { parseMligBuffer, parseMlieBuffer } from "@/lib/excel/parse";
import { persistDrafts } from "@/lib/engine/push";

export const dynamic = "force-dynamic";

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{
    imported?: string;
    errors?: string;
    skipped?: string;
    errDetail?: string;
  }>;
}) {
  const sp = await searchParams;
  const importedCount = sp.imported != null ? Number(sp.imported) : null;
  const errorsCount   = sp.errors   != null ? Number(sp.errors)   : null;
  const skippedCount  = sp.skipped  != null ? Number(sp.skipped)  : null;
  const errDetail     = sp.errDetail ?? null;

  async function importFiles(formData: FormData) {
    "use server";
    const mligFile = formData.get("mligFile") as File | null;
    const mlieFile = formData.get("mlieFile") as File | null;

    if (!mligFile?.size && !mlieFile?.size) {
      redirect("/upload?errDetail=" + encodeURIComponent("Select at least one file to import."));
    }

    let totalImported = 0;
    let totalErrors   = 0;
    let totalSkipped  = 0;
    const allErrors: string[] = [];
    const periods = new Set<string>();

    try {
      if (mligFile && mligFile.size > 0) {
        const buf = Buffer.from(await mligFile.arrayBuffer());
        const { invoices, errors, skipped } = await parseMligBuffer(buf);
        if (invoices.length > 0) {
          await persistDrafts(invoices);
          invoices.forEach(inv => periods.add(inv.billingPeriod));
        }
        totalImported += invoices.length;
        totalErrors   += errors.length;
        totalSkipped  += skipped;
        allErrors.push(...errors);
      }

      if (mlieFile && mlieFile.size > 0) {
        const buf = Buffer.from(await mlieFile.arrayBuffer());
        const { invoices, errors, skipped } = await parseMlieBuffer(buf);
        if (invoices.length > 0) {
          await persistDrafts(invoices);
          invoices.forEach(inv => periods.add(inv.billingPeriod));
        }
        totalImported += invoices.length;
        totalErrors   += errors.length;
        totalSkipped  += skipped;
        allErrors.push(...errors);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      redirect("/upload?errDetail=" + encodeURIComponent(msg));
    }

    // After a successful import, jump straight to the preview for the
    // detected billing period (pick the latest one if multiple).
    const detectedPeriod = [...periods].sort().at(-1) ?? currentPeriod();

    if (totalImported > 0) {
      const p = new URLSearchParams({ period: detectedPeriod });
      if (totalErrors > 0) p.set("uploadErrors", String(totalErrors));
      if (allErrors.length > 0) p.set("uploadErrDetail", allErrors.slice(0, 3).join(" | "));
      redirect("/preview?" + p.toString());
    }

    // Nothing imported — stay on upload page with feedback.
    const params = new URLSearchParams({
      imported: "0",
      errors:   String(totalErrors),
      skipped:  String(totalSkipped),
    });
    if (allErrors.length > 0) params.set("errDetail", allErrors.slice(0, 5).join(" | "));
    redirect("/upload?" + params.toString());
  }

  return (
    <>
      <div className="page-header">
        <h1>Upload Billing Sheet</h1>
        <p>
          Upload Lee&apos;s monthly Excel (or CSV) files. The app will read each row and build
          invoices ready to review and push to QuickBooks.
        </p>
      </div>

      {/* Result banners */}
      {importedCount != null && (
        <div className="card" style={{ borderLeft: "4px solid #16a34a", background: "#f0fdf4", marginBottom: "1.25rem" }}>
          <div className="row" style={{ gap: ".6rem", alignItems: "center" }}>
            <span className="pill good">Imported</span>
            <span style={{ fontWeight: 600 }}>
              {importedCount} invoice{importedCount !== 1 ? "s" : ""} imported
              {skippedCount ? ` · ${skippedCount} skipped` : ""}
              {errorsCount  ? ` · ${errorsCount} row error${errorsCount !== 1 ? "s" : ""}` : ""}
            </span>
          </div>
          {errDetail && (
            <p className="muted" style={{ marginTop: ".5rem", fontSize: ".82rem", fontFamily: "ui-monospace,monospace" }}>
              {errDetail}
            </p>
          )}
          <p style={{ marginTop: ".75rem", fontSize: ".88rem" }}>
            <a href={`/preview?period=${currentPeriod()}`} style={{ fontWeight: 600 }}>
              View invoices →
            </a>
          </p>
        </div>
      )}
      {errDetail && importedCount == null && (
        <div className="card" style={{ borderLeft: "4px solid #dc2626", background: "#fff5f5", marginBottom: "1.25rem" }}>
          <div className="row" style={{ gap: ".6rem", alignItems: "center" }}>
            <span className="pill bad">Error</span>
            <span style={{ fontWeight: 600 }}>Import failed</span>
          </div>
          <p className="muted" style={{ marginTop: ".5rem", fontSize: ".82rem", fontFamily: "ui-monospace,monospace" }}>
            {errDetail}
          </p>
        </div>
      )}

      <form action={importFiles} encType="multipart/form-data">
        {/* MLIG section */}
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: ".9rem" }}>
            <span className="pill mlig">MLIG</span>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Lessons Sheet</h2>
          </div>
          <p className="muted" style={{ fontSize: ".86rem", marginBottom: "1rem" }}>
            The sheet with columns: Client Name, Bill to, Invoice No., Invoice Date, Service Date #1…
            Each row = one student&apos;s monthly invoice.
          </p>
          <label style={{ display: "block", fontWeight: 600, fontSize: ".88rem", marginBottom: ".4rem" }}>
            Upload MLIG Excel / CSV
          </label>
          <input
            type="file"
            name="mligFile"
            accept=".xlsx,.xls,.csv,.ods"
            style={{ fontSize: ".88rem" }}
          />
        </div>

        {/* MLIE section */}
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: ".9rem" }}>
            <span className="pill mlie">MLIE</span>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Gigs Sheet</h2>
          </div>
          <p className="muted" style={{ fontSize: ".86rem", marginBottom: "1rem" }}>
            The sheet with columns: Date, Location, Time, Performer Name, Entertainment Fee, Invoice Number…
            Each row = one gig invoice.
          </p>
          <label style={{ display: "block", fontWeight: 600, fontSize: ".88rem", marginBottom: ".4rem" }}>
            Upload MLIE Excel / CSV
          </label>
          <input
            type="file"
            name="mlieFile"
            accept=".xlsx,.xls,.csv,.ods"
            style={{ fontSize: ".88rem" }}
          />
        </div>

        <div className="card" style={{ background: "var(--surface-hi)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: ".95rem" }}>Ready to import?</p>
            <p className="muted" style={{ fontSize: ".84rem", marginTop: ".2rem" }}>
              Upload one or both files. Duplicate invoices (same invoice number) are automatically skipped.
            </p>
          </div>
          <button type="submit" className="lg">
            Import Invoices →
          </button>
        </div>
      </form>

      {/* Instructions */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 style={{ marginBottom: ".75rem", fontSize: ".95rem" }}>How to export from Google Sheets</h2>
        <ol style={{ paddingLeft: "1.25rem", fontSize: ".86rem", color: "var(--sub)", lineHeight: 1.8 }}>
          <li>Open the Google Sheet</li>
          <li>Go to <strong>File → Download → Microsoft Excel (.xlsx)</strong></li>
          <li>Upload the downloaded file above</li>
          <li>Or download as CSV (comma-separated) — both formats work</li>
        </ol>
      </div>
    </>
  );
}
