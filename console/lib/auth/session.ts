import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { authMode, DEMO_COOKIE, supabaseAnonKey, supabaseUrl } from "./config";

export type Operator = { email: string; name: string; level: string };

export function decodeDemo(value: string | undefined): Operator | null {
  if (!value) return null;
  try {
    const o = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Operator;
    return o && typeof o.email === "string" ? o : null;
  } catch {
    return null;
  }
}

export async function currentOperator(): Promise<Operator | null> {
  const jar = await cookies();
  if (authMode === "demo") return decodeDemo(jar.get(DEMO_COOKIE)?.value);
  const sb = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { getAll: () => jar.getAll(), setAll: () => {} },
  });
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const meta = data.user.user_metadata as { full_name?: string; level?: string };
  return { email: data.user.email ?? "", name: meta.full_name ?? data.user.email ?? "", level: meta.level ?? "manager" };
}
