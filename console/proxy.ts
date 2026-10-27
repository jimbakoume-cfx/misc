import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";
import { authMode, DEMO_COOKIE, supabaseAnonKey, supabaseUrl } from "./lib/auth/config";

const intl = createMiddleware(routing);

async function signedIn(req: NextRequest, res: NextResponse): Promise<boolean> {
  if (authMode === "demo") return Boolean(req.cookies.get(DEMO_COOKIE)?.value);
  const sb = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
    },
  });
  const { data } = await sb.auth.getUser();
  return Boolean(data.user);
}

// Same redirects as the live console: "/" and "/{locale}" go to the sign-in page, and any dashboard page
// asked for while signed out goes there too, remembering where to come back to (?next=).
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const m = /^\/(fr|en|zh)(\/.*)?$/.exec(pathname);
  const res = intl(req);

  if (pathname === "/") {
    const pref = req.cookies.get("NEXT_LOCALE")?.value;
    const locale = routing.locales.includes(pref as never) ? pref : routing.defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}/login`, req.url), 307);
  }
  if (!m) return res;

  const [, locale, rest = "/"] = m;
  const isIn = await signedIn(req, res);
  if (rest === "/" ) return NextResponse.redirect(new URL(`/${locale}/${isIn ? "dashboard" : "login"}`, req.url), 307);
  if (rest.startsWith("/dashboard") && !isIn) {
    const url = new URL(`/${locale}/login`, req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url, 307);
  }
  if (rest === "/login" && isIn && !req.nextUrl.searchParams.has("error")) {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, req.url), 307);
  }
  return res;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
