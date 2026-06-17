import Link from "next/link";
import { isGoogleConfigured } from "@/lib/google/calendar";
import { isQboConfigured, getEnvironment } from "@/lib/qbo/auth";

export const dynamic = "force-dynamic";

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`pill ${ok ? "good" : "warn"}`}>
      {label}: {ok ? "configured" : "not configured"}
    </span>
  );
}

export default function Dashboard() {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <>
      <h1>MLIE Invoicing</h1>
      <p className="muted">Calendar → QuickBooks. One event per record; group at invoice time.</p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Integrations</h3>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <StatusPill ok={isGoogleConfigured()} label="Google Calendar" />
          <StatusPill ok={isQboConfigured()} label={`QuickBooks (${getEnvironment()})`} />
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          Fill <code>.env</code> (see <code>.env.example</code>) to enable live ingest and pushes.
          The preview and review screens work without any external credentials once the DB is seeded.
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>This cycle</h3>
        <p>
          Billing period <strong>{period}</strong>.
        </p>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link className="btn" href={`/preview?period=${period}`}>
            Open preview
          </Link>
          <Link className="btn" href="/review" style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--border)" }}>
            Review queue
          </Link>
        </div>
      </div>

      <p className="muted">
        Pipeline: ingest → classify → parse → aggregate → preview → push → record. Idempotency
        lives in the invoices table (a stored QBO id is never created twice).
      </p>
    </>
  );
}
