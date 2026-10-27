"use client";
import { createBrowserClient } from "@supabase/ssr";
import { authMode, supabaseAnonKey, supabaseUrl } from "./config";

type Result = { error: { code?: string; status?: number } | null };

let client: ReturnType<typeof createBrowserClient> | null = null;
export function supabase() {
  client ??= createBrowserClient(supabaseUrl, supabaseAnonKey);
  return client;
}

async function post(path: string, body?: unknown): Promise<Result> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    if (res.ok) return { error: null };
    const j = (await res.json().catch(() => ({}))) as { code?: string };
    return { error: { code: j.code, status: res.status } };
  } catch {
    return { error: { status: 0 } };
  }
}

export async function signIn(email: string, password: string): Promise<Result> {
  if (authMode === "demo") return post("/api/demo/sign-in", { email, password });
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  return { error: error ? { code: error.code, status: error.status } : null };
}

export async function sendResetLink(email: string, redirectTo: string): Promise<Result> {
  if (authMode === "demo") {
    await new Promise((r) => setTimeout(r, 500));
    return { error: null };
  }
  const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo });
  return { error: error ? { code: error.code, status: error.status } : null };
}

export async function setPassword(password: string): Promise<Result> {
  if (authMode === "demo") {
    if (password.length < 8) return { error: { code: "weak_password", status: 422 } };
    return { error: null };
  }
  const { error } = await supabase().auth.updateUser({ password });
  return { error: error ? { code: error.code, status: error.status } : null };
}

export async function signOut(): Promise<void> {
  if (authMode === "demo") await post("/api/demo/sign-out");
  else await supabase().auth.signOut();
}
