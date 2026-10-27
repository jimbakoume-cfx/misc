import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/auth/config";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(DEMO_COOKIE);
  return res;
}
