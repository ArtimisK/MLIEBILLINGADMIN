import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that never require auth
const PUBLIC = ["/login", "/api/"];

async function expectedToken(pw: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(pw + ":mli-billing-v1"),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return NextResponse.next();

  const path = req.nextUrl.pathname;
  if (PUBLIC.some((p) => path.startsWith(p))) return NextResponse.next();

  const expected = await expectedToken(pw);
  const cookie   = req.cookies.get("mli-auth")?.value;

  if (cookie === expected) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
