import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getRealmId, getAuthUri, isQboConfigured, getEnvironment } from "@/lib/qbo/auth";
import { getRefreshToken } from "@/lib/qbo/token-store";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

async function addUser(formData: FormData) {
  "use server";
  const email    = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/settings?userError=missing");
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) redirect("/settings?userError=exists");
  await db.insert(users).values({ email, passwordHash: hashPassword(password), role: "admin" });
  redirect("/settings?userAdded=1");
}

async function removeUser(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  const all = await db.select().from(users);
  if (all.length <= 1) redirect("/settings?userError=last");
  await db.delete(users).where(eq(users.id, id));
  redirect("/settings?userRemoved=1");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ qbo?: string; msg?: string; userAdded?: string; userRemoved?: string; userError?: string }>;
}) {
  const sp = await searchParams;
  const qboStatus = sp.qbo ?? null;
  const qboMsg    = sp.msg ?? null;

  const [connected, realmId, refreshToken, userList] = await Promise.all([
    isQboConfigured(),
    getRealmId(),
    getRefreshToken(),
    db.select().from(users).orderBy(users.createdAt),
  ]);

  const userErrorMsg =
    sp.userError === "missing" ? "Email and password are required." :
    sp.userError === "exists"  ? "That email is already registered." :
    sp.userError === "last"    ? "Cannot remove the last admin account." :
    null;

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
      <div className="card" style={{ marginBottom: "1.5rem" }}>
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

      {/* ── User Management ─────────────────────────────────────── */}
      <div className="page-header" style={{ marginTop: "2rem" }}>
        <h1>Users</h1>
        <p>Control who can log in to MLI Billing.</p>
      </div>

      {sp.userAdded   && <div className="card" style={{ borderLeft: "4px solid #16a34a", background: "#f0fdf4", marginBottom: "1.25rem" }}><span className="pill good">Added</span><strong style={{ marginLeft: ".5rem" }}>User added successfully.</strong></div>}
      {sp.userRemoved && <div className="card" style={{ borderLeft: "4px solid #16a34a", background: "#f0fdf4", marginBottom: "1.25rem" }}><span className="pill good">Removed</span><strong style={{ marginLeft: ".5rem" }}>User removed.</strong></div>}
      {userErrorMsg   && <div className="card" style={{ borderLeft: "4px solid #dc2626", background: "#fff5f5", marginBottom: "1.25rem" }}><span className="pill bad">Error</span><strong style={{ marginLeft: ".5rem" }}>{userErrorMsg}</strong></div>}

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>
          Admin Users
          <span className="pill neutral" style={{ marginLeft: ".75rem", verticalAlign: "middle", fontSize: ".75rem" }}>{userList.length}</span>
        </h2>
        {userList.length === 0 ? (
          <p className="muted">No users yet — login uses env vars. Add a user below to switch to database auth.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Email</th><th>Role</th><th>Added</th><th></th></tr>
            </thead>
            <tbody>
              {userList.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.email}</td>
                  <td><span className="pill neutral">{u.role}</span></td>
                  <td className="muted" style={{ fontSize: ".83rem" }}>
                    {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td>
                    {userList.length > 1 && (
                      <form action={removeUser} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={u.id} />
                        <button type="submit" className="ghost sm" style={{ color: "#dc2626" }}>Remove</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>Add User</h2>
        <form action={addUser} style={{ display: "flex", flexDirection: "column", gap: ".75rem", maxWidth: "420px" }}>
          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: ".88rem", marginBottom: ".3rem" }}>Email</label>
            <input type="email" name="email" required placeholder="user@example.com" style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: ".88rem", marginBottom: ".3rem" }}>Password</label>
            <input type="password" name="password" required placeholder="••••••••" style={{ width: "100%" }} />
          </div>
          <button type="submit" className="lg" style={{ alignSelf: "flex-start", marginTop: ".25rem" }}>Add User →</button>
        </form>
      </div>
    </>
  );
}
