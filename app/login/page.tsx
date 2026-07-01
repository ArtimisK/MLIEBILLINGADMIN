import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "crypto";

function makeToken(email: string, password: string): string {
  const payload = email ? `${email}:${password}:mli-billing-v1` : `${password}:mli-billing-v1`;
  return createHash("sha256").update(payload).digest("hex");
}

async function login(formData: FormData) {
  "use server";
  const email    = String(formData.get("email")    ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const expectedEmail = (process.env.ADMIN_EMAIL ?? "").toLowerCase().trim();
  const expectedPw    =  process.env.ADMIN_PASSWORD ?? "";
  const emailOk = !expectedEmail || email === expectedEmail; // skip check if ADMIN_EMAIL not set
  if (!password || !emailOk || password !== expectedPw) {
    redirect("/login?error=1");
  }
  const token = makeToken(email, password);
  const jar   = await cookies();
  jar.set("mli-auth", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp       = await searchParams;
  const hasError = sp.error === "1";

  return (
    <div className="login-wrap">
      <div className="login-card">

        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div className="login-logo-mark">♩</div>
          <h1 className="login-title">MLI Billing</h1>
          <p className="login-sub">Sign in to your account</p>
        </div>

        {/* Form */}
        <form action={login} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
            <label className="login-label">Email address</label>
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              required
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
            <label className="login-label">Password</label>
            <input
              type="password"
              name="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              style={{ width: "100%" }}
            />
          </div>

          {hasError && (
            <div className="login-error">
              Incorrect email or password. Please try again.
            </div>
          )}

          <button
            type="submit"
            style={{ marginTop: ".4rem", width: "100%", justifyContent: "center", fontSize: ".95rem", padding: ".75rem" }}
          >
            Sign in →
          </button>
        </form>

        <p className="login-footer">Music Lee Inclined · Billing Platform</p>
      </div>
    </div>
  );
}
