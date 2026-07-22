// TEMPORARY debug route — read-only QBO Customer lookup, used to verify the
// BillWithParent fix against real data. DELETE after use; not meant to ship.
import { NextRequest, NextResponse } from "next/server";
import { qboQuery } from "@/lib/qbo/client";

async function expectedToken(pw: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(pw + ":mli-billing-v1"),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function GET(req: NextRequest) {
  const pw = process.env.ADMIN_PASSWORD;
  if (pw) {
    const expected = await expectedToken(pw);
    const cookie = req.cookies.get("mli-auth")?.value;
    if (cookie !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const name = req.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "missing ?name=" }, { status: 400 });
  }

  const safeName = name.replace(/'/g, "\\'");
  const result = await qboQuery(
    `SELECT * FROM Customer WHERE DisplayName LIKE '%${safeName}%'`,
  );
  return NextResponse.json(result);
}
