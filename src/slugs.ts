export const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const RESERVED = new Set([
  'admin',
  'api',
  'login',
  'logout',
  'assets',
  'static',
  'favicon.ico',
  'robots.txt',
  '.well-known',
]);

// No 0/O/1/l/I — slugs get read aloud and retyped.
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';

export function randomSlug(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED.has(slug.toLowerCase());
}
