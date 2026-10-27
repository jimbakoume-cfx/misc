import { NextResponse } from "next/server";
import { authMode, DEMO_COOKIE } from "@/lib/auth/config";

// Demo mode only: opens a local session for any e-mail. The password "wrong" is refused, to show the refusal message.
export async function POST(req: Request) {
  if (authMode !== "demo") return NextResponse.json({ code: "not_found" }, { status: 404 });
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !password || password === "wrong") return NextResponse.json({ code: "invalid_credentials" }, { status: 400 });
  const local = email.split("@")[0].replace(/[._-]+/g, " ");
  const name = local.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  const value = Buffer.from(JSON.stringify({ email, name, level: "owner" })).toString("base64url");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_COOKIE, value, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  return res;
}
