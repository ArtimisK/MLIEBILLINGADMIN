import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { buildPreview, confirmAndPush } from "@/lib/pipeline";
import { pushInvoices } from "@/lib/engine/push";
import { isQboConfigured } from "@/lib/qbo/auth";
import { sendInvoice } from "@/lib/qbo/invoice";
import { db } from "@/db";
import { invoices, invoiceLines, fundingOrgs } from "@/db/schema";
import SubmitButton from "../components/submit-button";

export const dynamic = "force-dynamic";

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    pushed?: string;
    errors?: string;
    pushError?: string;
    emailSent?: string;
    emailError?: string;
    uploadErrors?: string;
    uploadErrDetail?: string;
    cleared?: string;
  }>;
}) {
  const sp = await searchParams;
  const period = sp.period ?? currentPeriod();
  const pushedCount      = sp.pushed          != null ? Number(sp.pushed)  : null;
  const errorsCount      = sp.errors          != null ? Number(sp.errors)  : null;
  const pushErrorMsg     = sp.pushError        ?? null;
  const emailSentDoc     = sp.emailSent        ?? null;
  const emailErrMsg      = sp.emailError       ?? null;
  const uploadErrorCount = sp.uploadErrors    != null ? Number(sp.uploadErrors) : null;
  const uploadErrDetail  = sp.uploadErrDetail  ?? null;
  const wasCleared       = sp.cleared         === "1";

  // ── Proposed invoices ───────────────────────────────────────────
  let preview: Awaited<ReturnType<typeof buildPreview>> | null = null;
  let loadError: string | null = null;
  try {
    preview = await buildPreview(period);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  // ── Already-pushed invoices for this period (single JOIN) ────────
  type PushedRow = {
    id: number;
    docNumber: string;
    businessLine: "MLIG" | "MLIE";
    status: "draft" | "created" | "sent" | "error";
    subtotal: string;
    qboInvoiceId: string | null;
    venueName: string | null;
    driveFileId: string | null;
    orgName: string | null;
  };
  let pushedRows: PushedRow[] = [];
  try {
    pushedRows = await db
      .select({
        id: invoices.id,
        docNumber: invoices.docNumber,
        businessLine: invoices.businessLine,
        status: invoices.status,
        subtotal: invoices.subtotal,
        qboInvoiceId: invoices.qboInvoiceId,
        venueName: invoices.venueName,
        driveFileId: invoices.driveFileId,
        orgName: fundingOrgs.name,
      })
      .from(invoices)
      .leftJoin(fundingOrgs, eq(invoices.fundingOrgId, fundingOrgs.id))
      .where(
        and(
          eq(invoices.billingPeriod, period),
          inArray(invoices.status, ["created", "sent"]),
        ),
      );
  } catch {}

  // ── Excel draft invoices (imported but not yet pushed) ──────────
  type DraftRow = {
    id: number;
    docNumber: string;
    businessLine: "MLIG" | "MLIE";
    subtotal: string;
    venueName: string | null;
    orgName: string | null;
  };
  let draftRows: DraftRow[] = [];
  try {
    draftRows = await db
      .select({
        id: invoices.id,
        docNumber: invoices.docNumber,
        businessLine: invoices.businessLine,
        subtotal: invoices.subtotal,
        venueName: invoices.venueName,
        orgName: fundingOrgs.name,
      })
      .from(invoices)
      .leftJoin(fundingOrgs, eq(invoices.fundingOrgId, fundingOrgs.id))
      .where(
        and(
          eq(invoices.billingPeriod, period),
          eq(invoices.status, "draft"),
        ),
      );
  } catch {}

  // ── Server actions ──────────────────────────────────────────────
  async function push(formData: FormData) {
    "use server";
    const p = String(formData.get("period") ?? currentPeriod());
    let result: { pushed: number; errors: number } | null = null;
    let errMsg: string | null = null;
    try {
      result = await confirmAndPush(p);
    } catch (err) {
      errMsg = err instanceof Error ? err.message : String(err);
    }
    if (result) {
      redirect(`/preview?period=${p}&pushed=${result.pushed}&errors=${result.errors}`);
    } else {
      redirect(`/preview?period=${p}&pushError=${encodeURIComponent(errMsg ?? "Unknown error")}`);
    }
  }

  async function pushDrafts(formData: FormData) {
    "use server";
    const p = String(formData.get("period") ?? currentPeriod());
    const rows = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.billingPeriod, p), eq(invoices.status, "draft")));
    const ids = rows.map((r) => r.id);
    if (!ids.length) redirect(`/preview?period=${p}&pushError=${encodeURIComponent("No draft invoices to push.")}`);
    let pushed = 0, errors = 0;
    let errMsg: string | null = null;
    try {
      const outcomes = await pushInvoices(ids);
      pushed = outcomes.filter((o) => o.action !== "error").length;
      errors = outcomes.filter((o) => o.action === "error").length;
    } catch (err) {
      errMsg = err instanceof Error ? err.message : String(err);
    }
    if (errMsg) {
      redirect(`/preview?period=${p}&pushError=${encodeURIComponent(errMsg)}`);
    } else {
      redirect(`/preview?period=${p}&pushed=${pushed}&errors=${errors}`);
    }
  }

  async function pushAllDrafts() {
    "use server";
    const rows = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.status, "draft"));
    const ids = rows.map((r) => r.id);
    if (!ids.length) redirect(`/preview?period=${period}&pushError=${encodeURIComponent("No pending invoices to push.")}`);
    let pushed = 0, errors = 0;
    let errMsg: string | null = null;
    try {
      const outcomes = await pushInvoices(ids);
      pushed = outcomes.filter((o) => o.action !== "error").length;
      errors = outcomes.filter((o) => o.action === "error").length;
    } catch (err) {
      errMsg = err instanceof Error ? err.message : String(err);
    }
    if (errMsg) {
      redirect(`/preview?period=${period}&pushError=${encodeURIComponent(errMsg)}`);
    } else {
      redirect(`/preview?period=${period}&pushed=${pushed}&errors=${errors}`);
    }
  }

  async function deleteDraft(formData: FormData) {
    "use server";
    const id = Number(formData.get("id"));
    const p  = String(formData.get("period") ?? currentPeriod());
    await db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, id));
    await db.delete(invoices).where(and(eq(invoices.id, id), eq(invoices.status, "draft")));
    redirect(`/preview?period=${p}`);
  }

  async function clearPeriodDrafts(formData: FormData) {
    "use server";
    const p = String(formData.get("period") ?? currentPeriod());
    const draftIds = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.billingPeriod, p), eq(invoices.status, "draft")));
    if (draftIds.length > 0) {
      await db.delete(invoiceLines).where(inArray(invoiceLines.invoiceId, draftIds.map((r) => r.id)));
      await db.delete(invoices).where(inArray(invoices.id, draftIds.map((r) => r.id)));
    }
    redirect(`/preview?period=${p}&cleared=1`);
  }

  async function emailInvoice(formData: FormData) {
    "use server";
    const p         = String(formData.get("period") ?? currentPeriod());
    const invId     = Number(formData.get("invoiceId"));
    const qboId     = String(formData.get("qboInvoiceId"));
    const docNumber = String(formData.get("docNumber"));
    const sendTo    = String(formData.get("sendTo") ?? "").trim();
    if (!sendTo.includes("@")) {
      redirect(`/preview?period=${p}&emailError=${encodeURIComponent("Enter a valid email address.")}`);
    }
    try {
      await sendInvoice(qboId, sendTo);
      await db
        .update(invoices)
        .set({ status: "sent" })
        .where(eq(invoices.id, invId));
      redirect(`/preview?period=${p}&emailSent=${encodeURIComponent(docNumber)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      redirect(`/preview?period=${p}&emailError=${encodeURIComponent(msg)}`);
    }
  }

  const qboOk    = await isQboConfigured();
  const grandTotal = preview?.invoices.reduce((s, i) => s + i.subtotal, 0) ?? 0;

  // All pending draft invoices across every period
  let allDraftCount = 0;
  let allDraftTotal = 0;
  try {
    const allDrafts = await db
      .select({ subtotal: invoices.subtotal })
      .from(invoices)
      .where(eq(invoices.status, "draft"));
    allDraftCount = allDrafts.length;
    allDraftTotal = allDrafts.reduce((s, r) => s + Number(r.subtotal), 0);
  } catch {}

  return (
    <>
      <div className="page-header">
        <h1>{new Date(period + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })} Invoices</h1>
        <p>Review each invoice below. Nothing is sent to QuickBooks until you click the button at the bottom.</p>
      </div>

      {/* Cleared banner */}
      {wasCleared && (
        <div className="card" style={{ borderLeft: "4px solid #f59e0b", background: "#fffbeb", marginBottom: "1.25rem" }}>
          <div className="row" style={{ gap: ".6rem", alignItems: "center" }}>
            <span className="pill warn">Cleared</span>
            <span style={{ fontWeight: 600 }}>All drafts for this period have been deleted.</span>
          </div>
        </div>
      )}

      {/* Upload success banner */}
      {uploadErrorCount != null && uploadErrorCount > 0 && (
        <div className="card" style={{ borderLeft: "4px solid #f59e0b", background: "#fffbeb", marginBottom: "1.25rem" }}>
          <div className="row" style={{ gap: ".6rem", alignItems: "center" }}>
            <span className="pill warn">Imported with warnings</span>
            <span style={{ fontWeight: 600 }}>{uploadErrorCount} row{uploadErrorCount !== 1 ? "s" : ""} had issues</span>
          </div>
          {uploadErrDetail && (
            <p className="muted" style={{ marginTop: ".5rem", fontSize: ".82rem", fontFamily: "ui-monospace,monospace" }}>
              {uploadErrDetail}
            </p>
          )}
        </div>
      )}

      {/* Push result banner */}
      {pushedCount != null && (
        <div className="card" style={{ borderLeft: "4px solid #16a34a", background: "#f0fdf4", marginBottom: "1.25rem" }}>
          <div className="row" style={{ gap: ".6rem", alignItems: "center" }}>
            <span className="pill good">Success</span>
            <span style={{ fontWeight: 600 }}>
              {pushedCount} invoice{pushedCount !== 1 ? "s" : ""} pushed to QuickBooks
              {errorsCount ? ` · ${errorsCount} error${errorsCount !== 1 ? "s" : ""}` : ""}
            </span>
          </div>
          {errorsCount != null && errorsCount > 0 && (
            <p className="muted" style={{ marginTop: ".5rem", fontSize: ".83rem" }}>
              {errorsCount} failed — check the review queue.
            </p>
          )}
        </div>
      )}
      {pushErrorMsg && (
        <div className="card" style={{ borderLeft: "4px solid #dc2626", background: "#fff5f5", marginBottom: "1.25rem" }}>
          <div className="row" style={{ gap: ".6rem", alignItems: "center" }}>
            <span className="pill bad">Push failed</span>
            <span style={{ fontWeight: 600 }}>QuickBooks returned an error</span>
          </div>
          <p className="muted" style={{ marginTop: ".5rem", fontSize: ".83rem", fontFamily: "ui-monospace,monospace" }}>
            {pushErrorMsg}
          </p>
        </div>
      )}
      {emailSentDoc && (
        <div className="card" style={{ borderLeft: "4px solid #16a34a", background: "#f0fdf4", marginBottom: "1.25rem" }}>
          <div className="row" style={{ gap: ".6rem", alignItems: "center" }}>
            <span className="pill good">Email sent</span>
            <span style={{ fontWeight: 600 }}>Invoice {emailSentDoc} emailed via QuickBooks</span>
          </div>
        </div>
      )}
      {emailErrMsg && (
        <div className="card" style={{ borderLeft: "4px solid #dc2626", background: "#fff5f5", marginBottom: "1.25rem" }}>
          <div className="row" style={{ gap: ".6rem", alignItems: "center" }}>
            <span className="pill bad">Email failed</span>
            <span style={{ fontWeight: 600 }}>{emailErrMsg}</span>
          </div>
        </div>
      )}

      {/* Push All Periods banner */}
      {allDraftCount > 0 && (
        <div className="card" style={{ background: "var(--surface-hi)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: ".95rem" }}>
              {allDraftCount} invoice{allDraftCount !== 1 ? "s" : ""} pending across all months — total ${allDraftTotal.toFixed(2)}
            </p>
            <p className="muted" style={{ fontSize: ".84rem", marginTop: ".2rem" }}>
              Push everything from all billing periods at once.
            </p>
          </div>
          <form action={pushAllDrafts}>
            <SubmitButton label="Push All Periods →" loadingLabel="Pushing all…" className="lg" disabled={!qboOk} />
          </form>
        </div>
      )}

      {/* Period selector */}
      <form method="get" className="row" style={{ marginBottom: "1.75rem" }}>
        <input
          id="period"
          name="period"
          type="month"
          defaultValue={period}
          style={{ width: "160px" }}
        />
        <button type="submit" className="ghost">Change period</button>
      </form>

      {loadError ? (
        <div className="card">
          <span className="pill bad">Error</span>
          <p className="muted" style={{ marginTop: ".6rem" }}>{loadError}</p>
        </div>
      ) : preview ? (
        <>
          {/* Summary tiles */}
          <div className="card-grid">
            <div className="stat-tile">
              <h3>Proposed invoices</h3>
              <div className="stat-val">{preview.invoices.length}</div>
            </div>
            <div className="stat-tile">
              <h3>Needs review</h3>
              <div className={`stat-val ${preview.reviewCount > 0 ? "warn" : ""}`}>
                {preview.reviewCount}
              </div>
            </div>
            <div className="stat-tile">
              <h3>Grand total</h3>
              <div className="stat-val accent">${grandTotal.toFixed(2)}</div>
            </div>
          </div>

          {/* Proposed invoice cards */}
          {preview.invoices.length === 0 ? (
            <div className="card">
              <div className="empty">
                <span className="empty-icon">📋</span>
                <h2>No invoices ready for this month</h2>
                <p>
                  {preview.reviewCount > 0
                    ? `${preview.reviewCount} event${preview.reviewCount !== 1 ? "s" : ""} need attention before they can be billed. Check the Needs Attention tab.`
                    : "Go to Dashboard and click Sync & Build Invoices to pull the latest calendar events."}
                </p>
              </div>
            </div>
          ) : (
            preview.invoices.map((inv) => (
              <div key={inv.docNumber} className="inv-card">
                <div className="inv-card-head">
                  <div className="row" style={{ gap: ".6rem" }}>
                    <span className="inv-doc">{inv.docNumber}</span>
                    <span className={`pill ${inv.businessLine === "MLIG" ? "mlig" : "mlie"}`}>
                      {inv.businessLine}
                    </span>
                  </div>
                  <span className="pill neutral">
                    {inv.lines.length} line{inv.lines.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Service date</th>
                      <th>Item</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.lines.map((l, i) => (
                      <tr key={i}>
                        <td className="mono">{l.serviceDate.toISOString().slice(0, 10)}</td>
                        <td>{l.itemName}</td>
                        <td className="num">${l.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="inv-foot">
                  <span className="muted" style={{ fontSize: ".75rem", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>Subtotal</span>
                  <span className="inv-total">${inv.subtotal.toFixed(2)}</span>
                </div>
              </div>
            ))
          )}

          {/* Push action */}
          {preview.invoices.length > 0 && (
            <div className="card" style={{ background: "var(--surface-hi)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: ".95rem" }}>
                  {preview.invoices.length} invoice{preview.invoices.length !== 1 ? "s" : ""} ready — total ${grandTotal.toFixed(2)}
                </p>
                <p className="muted" style={{ fontSize: ".84rem", marginTop: ".2rem" }}>
                  {qboOk ? "This will create real invoices in QuickBooks." : "Connect QuickBooks first to enable sending."}
                </p>
              </div>
              <form action={push}>
                <input type="hidden" name="period" value={period} />
                <SubmitButton label="Send to QuickBooks →" loadingLabel="Sending…" className="lg" disabled={!qboOk} />
              </form>
            </div>
          )}
        </>
      ) : null}

      {/* Excel-imported draft invoices — ready to push */}
      {draftRows.length > 0 && (
        <div style={{ marginTop: "2.5rem" }}>
          <h2 style={{ marginBottom: "1rem" }}>
            Imported — Ready to Push
            <span className="pill neutral" style={{ marginLeft: ".75rem", verticalAlign: "middle", fontSize: ".75rem" }}>
              {draftRows.length}
            </span>
          </h2>
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "1rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Bill to</th>
                  <th className="num">Amount</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {draftRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="inv-doc" style={{ fontSize: ".85rem" }}>{r.docNumber}</span>
                      <span className={`pill ${r.businessLine === "MLIG" ? "mlig" : "mlie"}`} style={{ marginLeft: ".4rem" }}>
                        {r.businessLine}
                      </span>
                    </td>
                    <td className="muted">{r.venueName ?? r.orgName ?? "—"}</td>
                    <td className="num">${Number(r.subtotal).toFixed(2)}</td>
                    <td>
                      <a
                        href={`/invoice/${encodeURIComponent(r.docNumber)}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: ".83rem", fontWeight: 600 }}
                      >
                        ⬇ PDF
                      </a>
                    </td>
                    <td>
                      <form action={deleteDraft}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="period" value={period} />
                        <button
                          type="submit"
                          className="ghost sm"
                          title="Delete this draft"
                          style={{ color: "var(--red)", padding: ".28rem .55rem" }}
                          onClick={(e) => { if (!confirm(`Delete draft ${r.docNumber}?`)) e.preventDefault(); }}
                        >
                          🗑
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ background: "var(--surface-hi)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: ".95rem" }}>
                {draftRows.length} invoice{draftRows.length !== 1 ? "s" : ""} ready —
                total ${draftRows.reduce((s, r) => s + Number(r.subtotal), 0).toFixed(2)}
              </p>
              <p className="muted" style={{ fontSize: ".84rem", marginTop: ".2rem" }}>
                {qboOk ? "Click to create these in QuickBooks." : "Connect QuickBooks first to enable sending."}
              </p>
            </div>
            <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
              <form action={clearPeriodDrafts}>
                <input type="hidden" name="period" value={period} />
                <button
                  type="submit"
                  className="ghost"
                  style={{ color: "var(--red)" }}
                  onClick={(e) => { if (!confirm(`Delete all ${draftRows.length} draft invoices for ${period}? This cannot be undone.`)) e.preventDefault(); }}
                >
                  🗑 Clear all drafts
                </button>
              </form>
              <form action={pushDrafts}>
                <input type="hidden" name="period" value={period} />
                <SubmitButton label="Send to QuickBooks →" loadingLabel="Sending…" className="lg" disabled={!qboOk} />
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Pushed invoices for this period */}
      {pushedRows.length > 0 && (
        <div style={{ marginTop: "2.5rem" }}>
          <h2 style={{ marginBottom: "1rem" }}>
            Pushed to QuickBooks
            <span className="pill good" style={{ marginLeft: ".75rem", verticalAlign: "middle", fontSize: ".75rem" }}>
              {pushedRows.length}
            </span>
          </h2>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Bill to</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>Download</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pushedRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="inv-doc" style={{ fontSize: ".85rem" }}>{r.docNumber}</span>
                      <span className={`pill ${r.businessLine === "MLIG" ? "mlig" : "mlie"}`} style={{ marginLeft: ".4rem" }}>
                        {r.businessLine}
                      </span>
                    </td>
                    <td className="muted">{r.venueName ?? r.orgName ?? "—"}</td>
                    <td className="num">${Number(r.subtotal).toFixed(2)}</td>
                    <td>
                      <span className={`pill ${r.status === "sent" ? "good" : "neutral"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
                        {r.qboInvoiceId && (
                          <a
                            href={`/api/invoice/${encodeURIComponent(r.docNumber)}/pdf`}
                            style={{ fontSize: ".83rem", fontWeight: 600 }}
                          >
                            ↓ PDF
                          </a>
                        )}
                        {r.driveFileId && (
                          <a
                            href={`https://drive.google.com/file/d/${r.driveFileId}/view`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: ".83rem" }}
                          >
                            Drive ↗
                          </a>
                        )}
                        {!r.qboInvoiceId && !r.driveFileId && (
                          <span className="muted" style={{ fontSize: ".8rem" }}>—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {r.status === "created" && r.qboInvoiceId && (
                        <form action={emailInvoice} style={{ display: "flex", gap: ".4rem", alignItems: "center" }}>
                          <input type="hidden" name="period"       value={period} />
                          <input type="hidden" name="invoiceId"    value={r.id} />
                          <input type="hidden" name="qboInvoiceId" value={r.qboInvoiceId} />
                          <input type="hidden" name="docNumber"    value={r.docNumber} />
                          <input
                            type="email"
                            name="sendTo"
                            placeholder="recipient@email.com"
                            required
                            style={{ width: "190px", fontSize: ".82rem", padding: ".3rem .5rem" }}
                          />
                          <button type="submit" className="ghost sm">Send</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
