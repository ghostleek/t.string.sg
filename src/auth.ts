import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from './env';

const COOKIE = 'session';
const SESSION_TTL = 30 * 24 * 3600;
const encoder = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function b64urlDecode(s: string): Uint8Array | null {
  try {
    const b64 = s.replaceAll('-', '+').replaceAll('_', '/');
    return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

// Session key is derived from the admin password: changing the password
// invalidates every session, and there is only one secret to manage.
async function sessionKey(password: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode('t.string.sg-session:' + password));
  return crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function createSessionToken(password: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const key = await sessionKey(password);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(String(exp)));
  return `${exp}.${b64url(sig)}`;
}

export async function verifySessionToken(token: string | undefined, password: string): Promise<boolean> {
  if (!token) return false;
  const [expStr, sigStr] = token.split('.');
  if (!expStr || !sigStr) return false;
  const exp = Number.parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const sig = b64urlDecode(sigStr);
  if (!sig) return false;
  const key = await sessionKey(password);
  return crypto.subtle.verify('HMAC', key, sig, encoder.encode(expStr));
}

// Compare via HMAC digests under a throwaway key — constant-time without
// leaking length or content through string comparison.
export async function passwordMatches(submitted: string, actual: string): Promise<boolean> {
  const key = (await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])) as CryptoKey;
  const [a, b] = await Promise.all([
    crypto.subtle.sign('HMAC', key, encoder.encode(submitted)),
    crypto.subtle.sign('HMAC', key, encoder.encode(actual)),
  ]);
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= (ua[i] ?? 0) ^ (ub[i] ?? 0);
  return diff === 0;
}

export async function isAuthed(c: Context<{ Bindings: Env }>): Promise<boolean> {
  return verifySessionToken(getCookie(c, COOKIE), c.env.ADMIN_PASSWORD);
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, COOKIE, { path: '/' });
}

/** Gates /admin/* (except the login page) and /api/*. */
export const requireAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === '/admin/login') return next();
  if (await isAuthed(c)) return next();
  if (path.startsWith('/api/')) return c.json({ error: 'unauthorized' }, 401);
  return c.redirect('/admin/login', 302);
};
