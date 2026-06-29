import Link from "next/link";
import { desc } from "drizzle-orm";
import { isQboConfigured, getEnvironment } from "@/lib/qbo/auth";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export const dynamic = "force-dynamic";

function formatPeriod(period: string) {
  const [y, m] = period.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatTs(ts: Date) {
  return ts.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    confirm_and_push: "Invoices pushed to QuickBooks",
    "push.created":   "Invoice created in QuickBooks",
    "push.error":     "Push error",
    "drive.uploaded": "PDF uploaded to Drive",
    "drive.error":    "Drive upload error",
  };
  return map[action] ?? action;
}

export default async function Dashboard() {
  const now    = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const qboOk  = await isQboConfigured();
  const qboEnv = getEnvironment();

  let recentRuns: { id: number; ts: Date; action: string; detail: unknown }[] = [];
  try {
    recentRuns = await db
      .select({ id: auditLog.id, ts: auditLog.ts, action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .orderBy(desc(auditLog.ts))
      .limit(6);
  } catch {}

  return (
    <>
      <div className="page-header">
        <h1>{formatPeriod(period)}</h1>
        <p>Upload billing sheets, review invoices, and send to QuickBooks.</p>
      </div>

      {/* Connections */}
      <div className="integration-grid">
        <div className="int-card">
          <div className="int-icon qbo">💼</div>
          <div className="int-info">
            <div className="int-name">QuickBooks Online</div>
            <div className="int-status">
              <span className="status-dot" style={{ background: qboOk ? "var(--green)" : "var(--amber)", boxShadow: qboOk ? "0 0 0 3px var(--green-dim)" : "0 0 0 3px var(--amber-dim)" }} />
              <span style={{ fontSize: ".84rem", fontWeight: 500, color: qboOk ? "var(--green)" : "var(--amber)" }}>
                {qboOk ? "Connected" : "Not connected — go to Settings"}
              </span>
              <span className="pill neutral" style={{ fontSize: ".65rem" }}>{qboEnv}</span>
            </div>
          </div>
        </div>

        <div className="int-card">
          <div className="int-icon period">📆</div>
          <div className="int-info">
            <div className="int-name">Billing period</div>
            <div className="int-status">
              <span className="pill blue" style={{ fontFamily: "ui-monospace,monospace", letterSpacing: ".04em" }}>
                {period}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Hero action */}
      <div className="action-card">
        <div>
          <h2>{qboOk ? `Ready to bill ${formatPeriod(period)}` : "Connect QuickBooks to start billing"}</h2>
          <p>
            {qboOk
              ? "Upload the monthly Excel sheets, review invoices, then push to QuickBooks."
              : "Go to Settings and connect QuickBooks before pushing invoices."}
          </p>
        </div>
        <div className="row" style={{ gap: ".75rem" }}>
          <Link href="/upload" className="btn-white">
            ↑ Upload Sheets
          </Link>
          <Link href={`/preview?period=${period}`} className="btn-ghost-white">
            View Invoices →
          </Link>
        </div>
      </div>

      {/* Quick links */}
      <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Link href="/upload" style={{ textDecoration: "none" }}>
          <div className="stat-tile" style={{ cursor: "pointer" }}>
            <h3>Upload</h3>
            <div className="stat-val accent" style={{ fontSize: "1.4rem" }}>Upload →</div>
            <p className="muted" style={{ fontSize: ".8rem", marginTop: ".1rem" }}>Import MLIG &amp; MLIE sheets</p>
          </div>
        </Link>
        <Link href={`/preview?period=${period}`} style={{ textDecoration: "none" }}>
          <div className="stat-tile" style={{ cursor: "pointer" }}>
            <h3>Invoices</h3>
            <div className="stat-val accent" style={{ fontSize: "1.4rem" }}>Preview →</div>
            <p className="muted" style={{ fontSize: ".8rem", marginTop: ".1rem" }}>Review before sending</p>
          </div>
        </Link>
        <Link href="/settings" style={{ textDecoration: "none" }}>
          <div className="stat-tile" style={{ cursor: "pointer" }}>
            <h3>Settings</h3>
            <div className="stat-val" style={{ fontSize: "1.4rem" }}>Connect →</div>
            <p className="muted" style={{ fontSize: ".8rem", marginTop: ".1rem" }}>QuickBooks connection</p>
          </div>
        </Link>
      </div>

      {/* Recent activity */}
      {recentRuns.length > 0 && (
        <div className="card">
          <h2 style={{ marginBottom: "1rem" }}>Recent Activity</h2>
          {recentRuns.map((run) => {
            const detail = run.detail as Record<string, unknown> | null;
            const isError = run.action.includes("error");
            return (
              <div key={run.id} className="run-log-row">
                <span className="run-ts">{formatTs(run.ts)}</span>
                <span className={`pill ${isError ? "bad" : "good"}`} style={{ fontSize: ".65rem" }}>
                  {isError ? "Error" : "OK"}
                </span>
                <span style={{ flex: 1 }}>{actionLabel(run.action)}</span>
                {detail && typeof detail === "object" && (
                  <span className="muted" style={{ fontSize: ".78rem" }}>
                    {Object.entries(detail)
                      .filter(([, v]) => typeof v === "number" || typeof v === "string")
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}