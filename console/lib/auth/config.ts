// With NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set, the console signs in against Supabase Auth
// exactly like the live one. Without them it runs in demo mode: any e-mail and password open a local session.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const authMode: "supabase" | "demo" = supabaseUrl && supabaseAnonKey ? "supabase" : "demo";
export const DEMO_COOKIE = "console_demo_session";
// Minutes without activity before the console signs the operator out (the live console reads this from a setting).
export const IDLE_MINUTES = Number(process.env.NEXT_PUBLIC_IDLE_MINUTES ?? 30);
