// Same rule as the live console: only a same-site /{locale}/dashboard path is a valid place to return to after sign-in.
const allowed = /^\/(fr|en|zh)\/dashboard(?:\/[A-Za-z0-9._~%\-\/[\]]*)?(?:\?[A-Za-z0-9._~%\-=&+]*)?$/;

export function safeNext(next: unknown): string | null {
  if (typeof next !== "string" || next.length === 0 || next.length > 512 || next.includes("//") || next.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(next)) {
    return null;
  }
  return allowed.test(next) ? next : null;
}
