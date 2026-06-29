import { getRealmId, getAuthUri, isQboConfigured, getEnvironment } from "@/lib/qbo/auth";
import { getRefreshToken } from "@/lib/qbo/token-store";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ qbo?: string; msg?: string }>;
}) {
  const sp = await searchParams;
  const qboStatus = sp.qbo ?? null;
  const qboMsg    = sp.msg ?? null;

  const [connected, realmId, refreshToken] = await Promise.all([
    isQboConfigured(),
    getRealmId(),
    getRefreshToken(),
  ]);

  const authUrl  = getAuthUri();
  const env      = getEnvironment();
  const hasKeys  = Boolean(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Connect your QuickBooks Online account so invoices can be pushed directly.</p>
      </div>

      {/* OAuth result banners */}
      {qboStatus === "connected" && (
        <div className="card" style={{ borderLeft: "4px solid #16a34a", background: "#f0fdf4", marginBottom: "1.25rem" }}>
          <div className="row" style={{ gap: ".6rem", alignItems: "center" }}>
            <span className="pill good">Connected</span>
            <span style={{ fontWeight: 600 }}>QuickBooks linked successfully!</span>
          </div>
          <p className="muted" style={{ marginTop: ".4rem", fontSize: ".85rem" }}>
            Realm ID <code>{realmId}</code> is saved. You can now push invoices to QBO.
          </p>
        </div>
      )}
      {qboStatus === "error" && (
        <div className="card" style={{ borderLeft: "4px solid #dc2626", background: "#fff5f5", marginBottom: "1.25rem" }}>
          <div className="row" style={{ gap: ".6rem", alignItems: "center" }}>
            <span className="pill bad">Error</span>
            <span style={{ fontWeight: 600 }}>QuickBooks connection failed</span>
          </div>
          {qboMsg && (
            <p className="muted" style={{ marginTop: ".4rem", fontSize: ".82rem", fontFamily: "ui-monospace,monospace" }}>
              {qboMsg}
            </p>
          )}
        </div>
      )}

      {/* QBO Connection card */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: ".5rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>QuickBooks Online</h2>
              {connected ? (
                <span className="pill good">Connected</span>
              ) : (
                <span className="pill" style={{ background: "#fef9c3", color: "#854d0e" }}>Not connected</span>
              )}
            </div>
            <p className="muted" style={{ fontSize: ".86rem" }}>
              Mode: <strong>{env}</strong>
              {connected && realmId && (
                <> · Realm ID: <code style={{ fontSize: ".82rem" }}>{realmId}</code></>
              )}
              {connected && refreshToken && (
                <> · Token: <code style={{ fontSize: ".82rem" }}>{refreshToken.slice(0, 12)}…</code></>
              )}
            </p>
          </div>

          {hasKeys ? (
            <a
              href={authUrl}
              style={{
                display: "inline-block",
                padding: ".55rem 1.25rem",
                background: "#2CA01C",
                color: "#fff",
                borderRadius: "6px",
                fontWeight: 700,
                fontSize: ".9rem",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {connected ? "Re-connect QuickBooks" : "Connect QuickBooks →"}
            </a>
          ) : (
            <span className="pill bad">Client ID / Secret missing in .env</span>
          )}
        </div>

        {!hasKeys && (
          <div style={{ marginTop: "1rem", background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: "6px", padding: ".9rem 1rem", fontSize: ".84rem" }}>
            <p style={{ fontWeight: 700, marginBottom: ".5rem" }}>To connect, add these to <code>.env</code>:</p>
            <pre style={{ margin: 0, color: "#555", lineHeight: 1.7 }}>{`QBO_CLIENT_ID=       # from Intuit Developer portal
QBO_CLIENT_SECRET=   # from Intuit Developer portal
QBO_REDIRECT_URI=http://localhost:3333/api/qbo/callback
QBO_ENVIRONMENT=production`}</pre>
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="card">
        <h2 style={{ fontSize: ".95rem", marginBottom: ".75rem" }}>How to connect</h2>
        <ol style={{ paddingLeft: "1.25rem", fontSize: ".86rem", color: "var(--sub)", lineHeight: 2 }}>
          <li>Lee goes to <strong>developer.intuit.com</strong> → My Apps → create or open the app → copy the <strong>Production Client ID</strong> and <strong>Client Secret</strong></li>
          <li>Add those values plus <code>QBO_REDIRECT_URI=http://localhost:3333/api/qbo/callback</code> to <code>.env</code> and restart the server</li>
          <li>In the Intuit app settings, add that same redirect URI under <strong>Redirect URIs</strong></li>
          <li>Set <code>QBO_ENVIRONMENT=production</code> in <code>.env</code></li>
          <li>Click <strong>"Connect QuickBooks →"</strong> above — Lee logs into QBO, clicks Allow</li>
          <li>You'll be redirected back here with &quot;Connected ✓&quot;</li>
        </ol>
      </div>
    </>
  );
}
