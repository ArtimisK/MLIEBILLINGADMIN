import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices, invoiceLines, fundingOrgs } from "@/db/schema";
import PrintButton from "./print-button";

export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ docNumber: string }>;
}) {
  const { docNumber } = await params;

  const rows = await db
    .select({
      id:            invoices.id,
      docNumber:     invoices.docNumber,
      businessLine:  invoices.businessLine,
      billingPeriod: invoices.billingPeriod,
      subtotal:      invoices.subtotal,
      venueName:     invoices.venueName,
      createdAt:     invoices.createdAt,
      orgName:       fundingOrgs.name,
      orgBillingCode: fundingOrgs.billingCode,
    })
    .from(invoices)
    .leftJoin(fundingOrgs, eq(invoices.fundingOrgId, fundingOrgs.id))
    .where(eq(invoices.docNumber, docNumber))
    .limit(1);

  if (!rows.length) notFound();

  const inv = rows[0];
  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, inv.id))
    .orderBy(invoiceLines.serviceDate);

  const isMlie = inv.businessLine === "MLIE";
  const billTo = isMlie ? (inv.venueName ?? "—") : (inv.orgName ?? inv.orgBillingCode ?? "—");

  // Invoice date: for MLIG use 1st of billing period; for MLIE use first service date
  let invoiceDate: string;
  if (inv.billingPeriod) {
    const [y, m] = inv.billingPeriod.split("-");
    invoiceDate = `${m.padStart(2,"0")}/01/${y}`;
  } else if (lines[0]) {
    const d = new Date(lines[0].serviceDate);
    invoiceDate = `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
  } else {
    invoiceDate = "—";
  }

  const subtotal = Number(inv.subtotal);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f3f4f6; font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #111; }
        nav { display: none !important; }
        main { padding: 0 !important; max-width: 100% !important; }

        .toolbar {
          background: #fff;
          border-bottom: 1px solid #e5e7eb;
          padding: .75rem 2rem;
          display: flex;
          gap: .75rem;
          align-items: center;
        }

        .inv-wrap {
          max-width: 760px;
          margin: 1.5rem auto 3rem;
          background: #fff;
          box-shadow: 0 2px 16px rgba(0,0,0,.10);
        }

        /* ── Header ── */
        .inv-header {
          padding: 1.5rem 2rem 1rem;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid #e5e7eb;
        }
        .inv-title {
          font-size: 1.35rem;
          font-weight: 900;
          color: #1d4ed8;
          letter-spacing: .01em;
          margin-bottom: .35rem;
        }
        .inv-company { font-weight: 700; font-size: .88rem; }
        .inv-addr    { font-size: .8rem; color: #444; line-height: 1.6; margin-top: .1rem; }
        .inv-contact { font-size: .8rem; color: #444; line-height: 1.6; margin-left: 2rem; }
        .inv-logo {
          font-size: 2.8rem;
          line-height: 1;
          opacity: .85;
          flex-shrink: 0;
        }

        /* ── Bill to + Invoice details ── */
        .inv-meta-row {
          display: flex;
          background: #f1f5fb;
          border-bottom: 1px solid #e5e7eb;
        }
        .inv-bill, .inv-details {
          padding: 1rem 2rem;
          flex: 1;
        }
        .inv-bill { border-right: 1px solid #e5e7eb; }
        .inv-section-label {
          font-weight: 700;
          font-size: .82rem;
          margin-bottom: .4rem;
        }
        .inv-bill-name  { font-size: .88rem; line-height: 1.55; }
        .inv-detail-row { font-size: .82rem; line-height: 1.7; }

        /* ── Line items ── */
        .inv-table-wrap { padding: 1.25rem 2rem; }
        .inv-table {
          width: 100%;
          border-collapse: collapse;
          font-size: .84rem;
        }
        .inv-table th {
          text-align: left;
          font-size: .75rem;
          color: #555;
          border-bottom: 1px solid #ccc;
          padding: .4rem .5rem;
          font-weight: 600;
        }
        .inv-table th.r, .inv-table td.r { text-align: right; }
        .inv-table td { padding: .55rem .5rem; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
        .inv-table .product { font-weight: 700; }
        .inv-table .desc { color: #555; font-size: .81rem; }

        /* ── Total ── */
        .inv-total-section {
          display: flex;
          justify-content: flex-end;
          padding: .5rem 2rem 1.25rem;
          border-top: 1px solid #ccc;
          margin: 0 2rem;
        }
        .inv-total-label { font-size: .88rem; color: #444; margin-right: 3rem; line-height: 2.2; }
        .inv-total-amt { font-size: 1.15rem; font-weight: 900; }

        /* ── Footer notes ── */
        .inv-notes {
          padding: 1rem 2rem 1.5rem;
          border-top: 1px solid #e5e7eb;
          font-size: .8rem;
          color: #444;
          line-height: 1.65;
        }
        .inv-notes-title { font-weight: 700; margin-bottom: .25rem; font-size: .82rem; color: #111; }
        .inv-notes + .inv-notes { border-top: none; padding-top: 0; }

        @media print {
          .toolbar { display: none !important; }
          body { background: white; }
          .inv-wrap { box-shadow: none; margin: 0; max-width: 100%; }
          .inv-header { padding: 1cm 1.5cm .5cm; }
          .inv-meta-row, .inv-bill, .inv-details { background: #f1f5fb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Toolbar — hidden when printing */}
      <div className="toolbar">
        <PrintButton />
        <a href={`/preview?period=${inv.billingPeriod ?? ""}`} style={{ fontSize: ".88rem" }}>← Back to Invoices</a>
      </div>

      <div className="inv-wrap">

        {/* ── Company header ── */}
        <div className="inv-header">
          <div>
            <div className="inv-title">INVOICE</div>
            <div className="inv-company">Music Lee Inclined Guy, Inc.</div>
            <div className="inv-addr">
              75 Phipps Ln<br />
              Plainview, NY 11803
            </div>
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
            <div className="inv-contact">
              MusicLeeInclinedGuy@gmail.com<br />
              +1 (516) 457-1111<br />
              For Lessons Visit MusicLeeInclined.com<br />
              For Entertainment Visit MLIEntertainment.com
            </div>
            <div className="inv-logo">🎹</div>
          </div>
        </div>

        {/* ── Bill to + Invoice details ── */}
        <div className="inv-meta-row">
          <div className="inv-bill">
            <div className="inv-section-label">Bill to</div>
            <div className="inv-bill-name">
              {billTo}
            </div>
          </div>
          <div className="inv-details">
            <div className="inv-section-label">Invoice details</div>
            <div className="inv-detail-row">Invoice no.: <strong>{inv.docNumber}</strong></div>
            <div className="inv-detail-row">Invoice date: {invoiceDate}</div>
          </div>
        </div>

        {/* ── Line items ── */}
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th style={{ width: "2rem" }}>#</th>
                <th style={{ width: "7rem" }}>Date</th>
                <th>Product or service</th>
                <th>Description</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const d = new Date(line.serviceDate);
                const dateStr = `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
                return (
                  <tr key={line.id}>
                    <td style={{ color: "#888" }}>{i + 1}.</td>
                    <td>{dateStr}</td>
                    <td className="product">{line.itemName}</td>
                    <td className="desc">{line.description ?? ""}</td>
                    <td className="r">${Number(line.amount).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Total ── */}
        <div className="inv-total-section">
          <div className="inv-total-label">Total</div>
          <div className="inv-total-amt">${subtotal.toFixed(2)}</div>
        </div>

        {/* ── Footer notes (MLIE) ── */}
        {isMlie && (
          <>
            <div className="inv-notes">
              <div className="inv-notes-title">Note to customer</div>
              Payments can be made via Zelle (MusicLeeInclinedGuy@gmail.com) or mailed to:<br />
              Music Lee Inclined Guy, Inc., 75 Phipps Lane, Plainview, NY 11803
            </div>
            <div className="inv-notes">
              <div className="inv-notes-title">Note to customer</div>
              Thank you for your business! We look forward to performing for you again in the near future.
              Please email Bookings@MLIEntertainment.com or call Lee directly at 516-457-1111.
            </div>
          </>
        )}

      </div>
    </>
  );
}