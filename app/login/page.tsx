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
  const ip = await getIp();
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
      {/*
        Override the shared layout for the login page:
        - Hide the nav bar
        - Make main full-viewport dark background, flex-centred
      */}
      <style>{`
        nav { display: none !important; }
        html, body { height: 100%; }
        main {
          max-width: 100% !important;
          padding: 0 !important;
          animation: none !important;
          min-height: 100vh !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 2rem 1rem !important;
          background:
            radial-gradient(ellipse 70% 55% at 15% 25%, rgba(79,70,229,.30) 0%, transparent 70%),
            radial-gradient(ellipse 55% 65% at 85% 75%, rgba(99,102,241,.22) 0%, transparent 70%),
            linear-gradient(160deg, #09090f 0%, #0f0d1c 50%, #09090f 100%) !important;
        }
      `}</style>

      <div className="login-card">
        {/* Brand */}
        <div className="login-brand">
          <div className="login-logo-mark">♩</div>
          <h1 className="login-title">MLI Billing</h1>
          <p className="login-sub">Sign in to your account</p>
        </div>

        {/* Form */}
        <form action={login} className="login-form">
          <div className="login-field">
            <label className="login-label" htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              name="email"
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              className="login-input"
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              name="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="login-input"
            />
          </div>

          {isLocked && (
            <div className="login-error login-error--warn">
              Too many failed attempts. Try again in 15 minutes.
            </div>
          )}
          {hasError && !isLocked && (
            <div className="login-error">
              Incorrect password. Please try again.
            </div>
          )}

          <button type="submit" disabled={isLocked} className="login-btn">
            Sign in →
          </button>
        </form>

        <p className="login-footer">Music Lee Inclined · Billing Platform</p>
      </div>
    </>
  );
}