import { Buffer } from "node:buffer";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Matches the Android agent: sha256(salt + pin) as lowercase hex. */
export function hashPin(salt: string, pin: string): string {
  return sha256(salt + pin);
}

export interface Session {
  id: number;
  sv?: number; // session version: bumping it in the database signs the account out everywhere
  email: string;
  role: string;
  exp: number;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function signSession(secret: string, s: Omit<Session, "exp">): string {
  const body = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + SESSION_TTL_MS })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(secret: string, token: string | undefined): Session | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

// ---------- Two-factor sign-in (TOTP, RFC 6238, SHA-1, 6 digits, 30 s) ----------
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function toBase32(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function fromBase32(s: string): Buffer {
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of s.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => toBase32(randomBytes(20));

export function totp(secretB32: string, atMs = Date.now(), digits = 6, stepSec = 30): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / stepSec)));
  const h = createHmac("sha1", fromBase32(secretB32)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, "0");
}

/** Accepts the current code and one step either side (clock drift). */
export function verifyTotp(secretB32: string, code: string, atMs = Date.now()): boolean {
  const c = String(code).replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  let ok = false;
  for (const d of [-1, 0, 1]) {
    const expected = Buffer.from(totp(secretB32, atMs + d * 30_000));
    if (expected.length === c.length && timingSafeEqual(expected, Buffer.from(c))) ok = true;
  }
  return ok;
}

const RECOVERY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const newRecoveryCode = () =>
  Array.from(randomBytes(8), (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join("").replace(/^(.{4})(.{4})$/, "$1-$2");
export const normRecovery = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
