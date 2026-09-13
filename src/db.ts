// All SQL lives here. Timestamps are unix epoch seconds; dashboard buckets
// use Singapore days (UTC+8), hardcoded — this is a personal tool.
const TZ_OFFSET = 8 * 3600;

export interface LinkRow {
  id: number;
  slug: string;
  target_url: string;
  notes: string | null;
  is_active: number;
  created_at: number;
}

export interface LinkWithCounts extends LinkRow {
  clicks: number;
  last_click: number | null;
}

export interface ClickInsert {
  link_id: number;
  ts: number;
  is_bot: boolean;
  medium: string;
  referrer: string | null;
  ref_host: string | null;
  country: string | null;
  device: string;
  os: string;
  browser: string;
  user_agent: string | null;
}

export interface BreakdownRow {
  k: string | null;
  n: number;
}

export interface Stats {
  clicks: number;
  bots: number;
  bucket: 'day' | 'hour';
  timeseries: { bucket: string; n: number }[];
  byMedium: BreakdownRow[];
  byRefHost: BreakdownRow[];
  byCountry: BreakdownRow[];
  byDevice: BreakdownRow[];
  byBrowser: BreakdownRow[];
}

export async function getActiveLink(
  db: D1Database,
  slug: string
): Promise<Pick<LinkRow, 'id' | 'target_url'> | null> {
  return db
    .prepare('SELECT id, target_url FROM links WHERE slug = ?1 AND is_active = 1')
    .bind(slug)
    .first<Pick<LinkRow, 'id' | 'target_url'>>();
}

export async function getLink(db: D1Database, slug: string): Promise<LinkRow | null> {
  return db.prepare('SELECT * FROM links WHERE slug = ?1').bind(slug).first<LinkRow>();
}

export async function insertClick(db: D1Database, c: ClickInsert): Promise<void> {
  await db
    .prepare(
      `INSERT INTO clicks (link_id, ts, is_bot, medium, referrer, ref_host, country, device, os, browser, user_agent)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    )
    .bind(
      c.link_id,
      c.ts,
      c.is_bot ? 1 : 0,
      c.medium,
      c.referrer,
      c.ref_host,
      c.country,
      c.device,
      c.os,
      c.browser,
      c.user_agent ? c.user_agent.slice(0, 256) : null
    )
    .run();
}

export async function listLinks(db: D1Database): Promise<LinkWithCounts[]> {
  const { results } = await db
    .prepare(
      `SELECT l.id, l.slug, l.target_url, l.notes, l.is_active, l.created_at,
              COUNT(c.id) AS clicks, MAX(c.ts) AS last_click
       FROM links l
       LEFT JOIN clicks c ON c.link_id = l.id AND c.is_bot = 0
       GROUP BY l.id
       ORDER BY l.created_at DESC`
    )
    .all<LinkWithCounts>();
  return results;
}

export async function createLink(
  db: D1Database,
  slug: string,
  targetUrl: string,
  notes: string | null
): Promise<LinkRow> {
  const row = await db
    .prepare(
      `INSERT INTO links (slug, target_url, notes, created_at)
       VALUES (?1, ?2, ?3, unixepoch()) RETURNING *`
    )
    .bind(slug, targetUrl, notes)
    .first<LinkRow>();
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function updateLink(
  db: D1Database,
  slug: string,
  fields: { target_url?: string; notes?: string | null; is_active?: number }
): Promise<boolean> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (fields.target_url !== undefined) {
    sets.push(`target_url = ?${binds.length + 1}`);
    binds.push(fields.target_url);
  }
  if (fields.notes !== undefined) {
    sets.push(`notes = ?${binds.length + 1}`);
    binds.push(fields.notes);
  }
  if (fields.is_active !== undefined) {
    sets.push(`is_active = ?${binds.length + 1}`);
    binds.push(fields.is_active);
  }
  if (!sets.length) return true;
  binds.push(slug);
  const res = await db
    .prepare(`UPDATE links SET ${sets.join(', ')} WHERE slug = ?${binds.length}`)
    .bind(...binds)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function deleteLink(db: D1Database, id: number): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM clicks WHERE link_id = ?1').bind(id),
    db.prepare('DELETE FROM links WHERE id = ?1').bind(id),
  ]);
}

export async function statsFor(
  db: D1Database,
  linkId: number,
  days: number,
  includeBots: boolean
): Promise<Stats> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const isBot = includeBots ? 1 : 0;
  const bucket = days <= 2 ? 'hour' : 'day';
  const fmt = bucket === 'hour' ? '%Y-%m-%d %H:00' : '%Y-%m-%d';

  const where = 'WHERE link_id = ?1 AND is_bot = ?2 AND ts >= ?3';
  const breakdown = (col: string) =>
    db
      .prepare(`SELECT ${col} AS k, COUNT(*) AS n FROM clicks ${where} GROUP BY ${col} ORDER BY n DESC LIMIT 20`)
      .bind(linkId, isBot, since);

  const batchResults = await db.batch([
    db.prepare('SELECT COUNT(*) AS n FROM clicks WHERE link_id = ?1 AND is_bot = 0 AND ts >= ?2').bind(linkId, since),
    db.prepare('SELECT COUNT(*) AS n FROM clicks WHERE link_id = ?1 AND is_bot = 1 AND ts >= ?2').bind(linkId, since),
    db
      .prepare(
        `SELECT strftime('${fmt}', ts + ${TZ_OFFSET}, 'unixepoch') AS bucket, COUNT(*) AS n
         FROM clicks ${where} GROUP BY bucket ORDER BY bucket`
      )
      .bind(linkId, isBot, since),
    breakdown('medium'),
    breakdown('ref_host'),
    breakdown('country'),
    breakdown('device'),
    breakdown('browser'),
  ]);

  const rows = (i: number) => batchResults[i]?.results ?? [];
  return {
    clicks: (rows(0)[0] as { n: number } | undefined)?.n ?? 0,
    bots: (rows(1)[0] as { n: number } | undefined)?.n ?? 0,
    bucket,
    timeseries: rows(2) as { bucket: string; n: number }[],
    byMedium: rows(3) as BreakdownRow[],
    byRefHost: rows(4) as BreakdownRow[],
    byCountry: rows(5) as BreakdownRow[],
    byDevice: rows(6) as BreakdownRow[],
    byBrowser: rows(7) as BreakdownRow[],
  };
}

/** Fill missing day/hour buckets with zeros so charts show gaps honestly. */
export function fillBuckets(
  timeseries: { bucket: string; n: number }[],
  days: number,
  bucket: 'day' | 'hour'
): { bucket: string; n: number }[] {
  const byBucket = new Map(timeseries.map((r) => [r.bucket, r.n]));
  const out: { bucket: string; n: number }[] = [];
  const stepSec = bucket === 'hour' ? 3600 : 86400;
  const nowLocal = Math.floor(Date.now() / 1000) + TZ_OFFSET;
  const start = nowLocal - days * 86400;
  for (let t = start; t <= nowLocal; t += stepSec) {
    const d = new Date(t * 1000);
    const label =
      bucket === 'hour'
        ? `${d.toISOString().slice(0, 13).replace('T', ' ')}:00`
        : d.toISOString().slice(0, 10);
    if (!out.length || out[out.length - 1]!.bucket !== label) {
      out.push({ bucket: label, n: byBucket.get(label) ?? 0 });
    }
  }
  return out;
}

export interface Overview {
  days: number;
  since: number;
  /** Human clicks in the window. */
  clicks: number;
  /** Human clicks in the equal window immediately before it. */
  prevClicks: number;
  timeseries: { bucket: string; n: number }[];
  topLinks: { slug: string; n: number }[];
  byMedium: BreakdownRow[];
  byCountry: BreakdownRow[];
}

/**
 * Dashboard overview across all links, humans only. The window is rolling
 * (not calendar-aligned) so every number matches what statsFor(…, days)
 * shows after clicking through to a link. Every WHERE predicate is on the raw
 * ts column so idx_clicks_bot_ts can range-scan instead of reading history.
 */
// Humans-only counts for a window and the equal window before it, from one
// index range (idx_clicks_bot_ts).
function stmtWindowCounts(db: D1Database, since: number, prevSince: number): D1PreparedStatement {
  return db
    .prepare(
      'SELECT COALESCE(SUM(ts >= ?1), 0) AS cur, COALESCE(SUM(ts < ?1), 0) AS prev FROM clicks WHERE is_bot = 0 AND ts >= ?2'
    )
    .bind(since, prevSince);
}

function stmtTopLinks(db: D1Database, since: number, limit: number): D1PreparedStatement {
  return db
    .prepare(
      `SELECT l.slug, COUNT(*) AS n FROM clicks c JOIN links l ON l.id = c.link_id
       WHERE c.is_bot = 0 AND c.ts >= ?1 GROUP BY l.id, l.slug ORDER BY n DESC, l.slug LIMIT ${limit}`
    )
    .bind(since);
}

export async function overviewFor(db: D1Database, days: 7 | 30 = 7): Promise<Overview> {
  const now = Math.floor(Date.now() / 1000);
  const since = now - days * 86400;
  const prevSince = since - days * 86400;
  const top = (col: string) =>
    db
      .prepare(
        `SELECT ${col} AS k, COUNT(*) AS n FROM clicks WHERE is_bot = 0 AND ts >= ?1 GROUP BY ${col} ORDER BY n DESC, k LIMIT 5`
      )
      .bind(since);

  const batchResults = await db.batch([
    stmtWindowCounts(db, since, prevSince),
    db
      .prepare(
        `SELECT strftime('%Y-%m-%d', ts + ${TZ_OFFSET}, 'unixepoch') AS bucket, COUNT(*) AS n
         FROM clicks WHERE is_bot = 0 AND ts >= ?1 GROUP BY bucket ORDER BY bucket`
      )
      .bind(since),
    stmtTopLinks(db, since, 5),
    top('medium'),
    top('country'),
  ]);

  const rows = (i: number) => batchResults[i]?.results ?? [];
  const counts = rows(0)[0] as { cur: number; prev: number } | undefined;
  return {
    days,
    since,
    clicks: counts?.cur ?? 0,
    prevClicks: counts?.prev ?? 0,
    timeseries: rows(1) as { bucket: string; n: number }[],
    topLinks: rows(2) as { slug: string; n: number }[],
    byMedium: rows(3) as BreakdownRow[],
    byCountry: rows(4) as BreakdownRow[],
  };
}

/** Whole-percent change from prev to cur, or null when there is no baseline. */
export function pctChange(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export interface WeekStrip {
  clicks: number;
  prevClicks: number;
  top: { slug: string; n: number } | null;
}

/** The one-line "this week" summary on the list page: rolling 7 days, humans only. */
export async function weekStrip(db: D1Database): Promise<WeekStrip> {
  const now = Math.floor(Date.now() / 1000);
  const since = now - 7 * 86400;
  const r = await db.batch([stmtWindowCounts(db, since, since - 7 * 86400), stmtTopLinks(db, since, 1)]);
  const counts = r[0]?.results[0] as { cur: number; prev: number } | undefined;
  const top = (r[1]?.results[0] as { slug: string; n: number } | undefined) ?? null;
  return { clicks: counts?.cur ?? 0, prevClicks: counts?.prev ?? 0, top };
}
