import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "crypto";

async function login(formData: FormData) {
  "use server";
  const pw = String(formData.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || pw !== expected) {
    redirect("/login?error=1");
  }
  const token = createHash("sha256")
    .update(pw + ":mli-billing-v1")
    .digest("hex");
  const jar = await cookies();
  jar.set("mli-auth", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/");
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--ground)",
      }}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: "380px", textAlign: "center" }}
      >
        <div style={{ fontSize: "2rem", marginBottom: ".5rem" }}>♩</div>
        <h1 style={{ fontSize: "1.25rem", marginBottom: ".25rem" }}>MLI Billing</h1>
        <p className="muted" style={{ fontSize: ".85rem", marginBottom: "1.5rem" }}>
          Sign in to continue
        </p>

        <form action={login} style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            required
            style={{ textAlign: "center" }}
          />
          <button type="submit">Sign in</button>
        </form>
      </div>
    </div>
  );
}
