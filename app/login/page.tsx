import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "crypto";
import { checkLimit, recordFailure, clearLimit } from "@/lib/rate-limit";

function makeToken(password: string): string {
  return createHash("sha256").update(password + ":mli-billing-v1").digest("hex");
}

async function getIp(): Promise<string> {
  const hdrs = await headers();
  return (
    hdrs.get("cf-connecting-ip") ??
    hdrs.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

async function login(formData: FormData) {
  "use server";
  const ip         = await getIp();
  const { allowed } = checkLimit(ip);
  if (!allowed) redirect("/login?error=locked");

  const password   = String(formData.get("password") ?? "");
  const expectedPw = process.env.ADMIN_PASSWORD ?? "";

  if (!password || password !== expectedPw) {
    recordFailure(ip);
    redirect("/login?error=1");
  }

  clearLimit(ip);
  const token = makeToken(password);
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
  const isLocked = sp.error === "locked";
  const hasError = sp.error === "1";

  return (
    <>
      {/* Fixed full-viewport background */}
      <div style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        background: `
          radial-gradient(ellipse 60% 50% at 20% 30%, rgba(79,70,229,.32) 0%, transparent 100%),
          radial-gradient(ellipse 50% 60% at 80% 70%, rgba(99,102,241,.24) 0%, transparent 100%),
          linear-gradient(160deg, #0d1117 0%, #13111e 45%, #0d1117 100%)
        `,
      }} />

      {/* Centered card */}
      <div style={{
        minHeight: "calc(100vh - 60px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
      }}>
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

            {isLocked && (
              <div className="login-error" style={{ background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e" }}>
                Too many failed attempts. Try again in 15 minutes.
              </div>
            )}
            {hasError && !isLocked && (
              <div className="login-error">
                Incorrect password. Please try again.
              </div>
            )}

            <button
              type="submit"
              disabled={isLocked}
              style={{ marginTop: ".4rem", width: "100%", justifyContent: "center", fontSize: ".95rem", padding: ".75rem" }}
            >
              Sign in →
            </button>
          </form>

          <p className="login-footer">Music Lee Inclined · Billing Platform</p>
        </div>
      </div>
    </>
  );
}
