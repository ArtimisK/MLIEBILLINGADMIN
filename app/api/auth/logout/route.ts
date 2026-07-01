import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const jar = await cookies();
  jar.delete("mli-auth");

  // Behind Cloudflare Tunnel, req.url is the internal Docker URL.
  // Use the forwarded headers to build the real public URL.
  const host  = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const base  = host ? `${proto}://${host}` : "http://localhost:3000";

  return NextResponse.redirect(new URL("/login", base), { status: 303 });
}
