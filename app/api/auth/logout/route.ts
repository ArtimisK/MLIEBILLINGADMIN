import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const jar = await cookies();
  jar.delete("mli-auth");
  return NextResponse.redirect(new URL("/login", req.url));
}
