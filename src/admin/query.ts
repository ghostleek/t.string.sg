/** Parse a window-length query param against an allow-list, else the default. */
export function parseDays<T extends number>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  const n = Number(raw);
  return (allowed as readonly number[]).includes(n) ? (n as T) : fallback;
}
