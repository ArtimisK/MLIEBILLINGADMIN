import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that never require auth
const PUBLIC = ["/login", "/api/"];

async function expectedToken(): Promise<string> {
  const email    = (process.env.ADMIN_EMAIL    ?? "").toLowerCase().trim();
  const password =  process.env.ADMIN_PASSWORD ?? "";
  // If ADMIN_EMAIL is not set, token is password-only (backward compatible)
  const payload  = email ? `${email}:${password}:mli-billing-v1` : `${password}:mli-billing-v1`;
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const pw = process.env.ADMIN_PASSWORD;
  // No password configured → open access (local dev)
  if (!pw) return NextResponse.next();

  const path = req.nextUrl.pathname;
  if (PUBLIC.some((p) => path.startsWith(p))) return NextResponse.next();

  const expected = await expectedToken();
  const cookie   = req.cookies.get("mli-auth")?.value;

  if (cookie === expected) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
