import Link from "next/link";
import { revalidatePath } from "next/cache";
import { desc } from "drizzle-orm";
import { isGoogleConfigured } from "@/lib/google/calendar";
import { isQboConfigured, getEnvironment } from "@/lib/qbo/auth";
import { runIngestAndPreview } from "@/lib/pipeline";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export const dynamic = "force-dynamic";

async function runCycle() {
  "use server";
  const now   = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const period = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  await runIngestAndPreview(start, end, period);
  revalidatePath("/");
}

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
    ingest:           "Calendar synced",
    classify:         "Events classified",
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
  const googleOk = isGoogleConfigured();
  const qboOk    = await isQboConfigured();
  const qboEnv   = getEnvironment();
  const allOk    = googleOk && qboOk;

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
      {/* Page header */}
      <div className="page-header">
        <h1>{formatPeriod(period)}</h1>
        <p>Review connections, sync the calendar, and send invoices to QuickBooks.</p>
      </div>

      {/* Connections */}
      <div className="integration-grid">
        <div className="int-card">
          <div className="int-icon google">📅</div>
          <div className="int-info">
            <div className="int-name">Google Calendar</div>
            <div className="int-status">
              <span className="status-dot" style={{ background: googleOk ? "var(--green)" : "var(--amber)", boxShadow: googleOk ? "0 0 0 3px var(--green-dim)" : "0 0 0 3px var(--amber-dim)" }} />
              <span style={{ fontSize: ".84rem", fontWeight: 500, color: googleOk ? "var(--green)" : "var(--amber)" }}>
                {googleOk ? "Connected" : "Not set up"}
              </span>
            </div>
          </div>
        </div>

        <div className="int-card">
          <div className="int-icon qbo">💼</div>
          <div className="int-info">
            <div className="int-name">QuickBooks Online</div>
            <div className="int-status">
              <span className="status-dot" style={{ background: qboOk ? "var(--green)" : "var(--amber)", boxShadow: qboOk ? "0 0 0 3px var(--green-dim)" : "0 0 0 3px var(--amber-dim)" }} />
              <span style={{ fontSize: ".84rem", fontWeight: 500, color: qboOk ? "var(--green)" : "var(--amber)" }}>
                {qboOk ? "Connected" : "Not set up"}
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
          <h2>
            {allOk
              ? `Ready to bill ${formatPeriod(period)}`
              : "Finish setting up to start billing"}
          </h2>
          <p>
            {allOk
              ? "Pull the latest calendar events and build invoices for review."
              : "Connect Google Calendar and QuickBooks before running a billing cycle."}
          </p>
        </div>
        <div className="row" style={{ gap: ".75rem" }}>
          <form action={runCycle}>
            <button type="submit" className="btn-white" disabled={!googleOk}>
              ↻ Sync &amp; Build Invoices
            </button>
          </form>
          <Link href={`/preview?period=${period}`} className="btn-ghost-white">
            View Invoices →
          </Link>
        </div>
      </div>

      {/* Quick links */}
      <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Link href={`/preview?period=${period}`} style={{ textDecoration: "none" }}>
          <div className="stat-tile" style={{ cursor: "pointer" }}>
            <h3>Invoices</h3>
            <div className="stat-val accent" style={{ fontSize: "1.4rem" }}>Preview →</div>
            <p className="muted" style={{ fontSize: ".8rem", marginTop: ".1rem" }}>Review before sending</p>
          </div>
        </Link>
        <Link href="/review" style={{ textDecoration: "none" }}>
          <div className="stat-tile" style={{ cursor: "pointer" }}>
            <h3>Needs Attention</h3>
            <div className="stat-val" style={{ fontSize: "1.4rem" }}>Review →</div>
            <p className="muted" style={{ fontSize: ".8rem", marginTop: ".1rem" }}>Events that need a look</p>
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
                <span
                  className={`pill ${isError ? "bad" : "good"}`}
                  style={{ fontSize: ".65rem" }}
                >
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
