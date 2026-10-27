// Maps a Supabase Auth error to a key of messages.errors, as the live console does.
type AuthError = { code?: string; status?: number } | null | undefined;

const general: Record<string, string> = {
  weak_password: "passwordTooShort",
  same_password: "passwordUnchanged",
  otp_expired: "linkExpired",
  bad_jwt: "linkExpired",
  over_email_send_rate_limit: "tooManyRequests",
  over_request_rate_limit: "tooManyRequests",
};
const signIn: Record<string, string> = {
  invalid_credentials: "signInRefused",
  email_not_confirmed: "signInRefused",
  user_banned: "signInRefused",
  over_request_rate_limit: "tooManyRequests",
  over_email_send_rate_limit: "tooManyRequests",
};

export function authRefusalKey(e: AuthError, opts: { signIn?: boolean } = {}): string | null {
  if (!e) return null;
  const status = typeof e.status === "number" ? e.status : undefined;
  if (opts.signIn) {
    const k = e.code ? signIn[e.code] : undefined;
    if (k) return k;
    if (status !== undefined && status >= 400 && status < 500) return "signInRefused";
    return "serverUnreachable";
  }
  if (e.code && general[e.code]) return general[e.code];
  if (status === 429) return "tooManyRequests";
  if (status === 401 || status === 403) return "linkExpired";
  if (status !== undefined && status >= 400 && status < 500) return "requestRefused";
  return "serverUnreachable";
}
