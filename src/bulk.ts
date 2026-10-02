// Bulk paste: one textarea that takes either a Markdown table or CSV/TSV.
//
// The format is picked by a fixed rule, never a guess:
//   1. Markdown if the first line starts with '|', or if it contains '|' and
//      the second line is a GFM delimiter row ('---|---').
//   2. Otherwise TSV if the first line contains a tab (a paste from Sheets
//      or Excel), else CSV.
//
// Columns come from a header row when there is one (matched by name, so
// "Short link | Target | Note" works); without one they are slug, url, notes
// in that order, and a single-column row is a bare URL that gets a random slug.
import { isValidSlug, validTargetUrl } from './slugs';

export type BulkFormat = 'markdown' | 'tsv' | 'csv';

export interface BulkRow {
  line: number; // 1-based line in the pasted text, for the preview
  slug: string; // '' = pick a random slug
  url: string;
  notes: string | null;
  struck: boolean; // slug cell written as ~strikethrough~: deliberately left out
}

export interface ParsedBulk {
  format: BulkFormat;
  rows: BulkRow[];
  error?: string;
}

export const MAX_BULK_ROWS = 500;

const MD_DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

export function detectFormat(first: string, second: string): BulkFormat {
  if (first.trimStart().startsWith('|')) return 'markdown';
  if (first.includes('|') && MD_DELIM.test(second)) return 'markdown';
  return first.includes('\t') ? 'tsv' : 'csv';
}

function splitMarkdown(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return inner.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

// RFC 4180 quoting within one line ("a, b" and "" escapes). Quoted fields
// spanning several lines are not supported — link rows never need them.
function splitDelimited(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && cur.trim() === '') {
      quoted = true;
      cur = '';
    } else if (ch === sep) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// Header names, checked in this order so "Short link" is the slug, not the URL.
const HEADER: [keyof Columns, RegExp][] = [
  ['slug', /^(short|slug|alias|path|code)/],
  ['url', /^(target|url|long|dest|link|href)/],
  ['notes', /^(note|comment|desc|label|title)/],
];

interface Columns {
  slug: number;
  url: number;
  notes: number;
}

function headerColumns(cells: string[]): Columns | null {
  if (cells.some((c) => c.includes('://'))) return null;
  const cols: Columns = { slug: -1, url: -1, notes: -1 };
  cells.forEach((cell, i) => {
    const name = cell.toLowerCase().replace(/[*_`]/g, '').trim();
    const hit = HEADER.find(([key, re]) => cols[key] === -1 && re.test(name));
    if (hit) cols[hit[0]] = i;
  });
  return cols.slug === -1 && cols.url === -1 && cols.notes === -1 ? null : cols;
}

// Strips the wrappers chat apps and Markdown put around values:
// `code`, <autolink>, [text](url).
function unwrap(raw: string): string {
  let s = raw.trim().replace(/^`+|`+$/g, '').trim();
  const md = /^\[[^\]]*\]\((.*)\)$/.exec(s);
  if (md) s = md[1]!.trim();
  const angle = /^<(.*)>$/.exec(s);
  if (angle) s = angle[1]!.trim();
  return s;
}

const STRUCK = /^~+(.*?)~+$/;

// "t.string.sg/math-arena", "https://t.string.sg/math-arena/" and "/math-arena"
// all mean slug "math-arena": a slug can't contain '/', so keep the last segment.
function cleanSlug(raw: string): string {
  const s = unwrap(raw).replace(/\/+$/, '');
  return s.slice(s.lastIndexOf('/') + 1);
}

export function parseBulk(text: string): ParsedBulk {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((t, i) => ({ t, n: i + 1 }))
    .filter((l) => l.t.trim() !== '');
  const format = detectFormat(lines[0]?.t ?? '', lines[1]?.t ?? '');
  if (lines.length === 0) return { format, rows: [], error: 'Nothing to import — paste a table or CSV first.' };

  const split =
    format === 'markdown' ? splitMarkdown : (l: string) => splitDelimited(l, format === 'tsv' ? '\t' : ',');
  const table = lines
    .filter((l) => !(format === 'markdown' && MD_DELIM.test(l.t)))
    .map((l) => ({ cells: split(l.t), n: l.n }));

  const header = table[0] ? headerColumns(table[0].cells) : null;
  if (header && header.url === -1) {
    return { format, rows: [], error: 'Found a header row but no URL column (name one "url" or "target").' };
  }
  const body = header ? table.slice(1) : table;
  if (body.length > MAX_BULK_ROWS) {
    return { format, rows: [], error: `Too many rows (${body.length}); paste at most ${MAX_BULK_ROWS} at a time.` };
  }

  const rows = body.map(({ cells, n }): BulkRow => {
    let slugCell: string;
    let urlCell: string;
    let notesCell: string;
    if (header) {
      slugCell = cells[header.slug] ?? '';
      urlCell = cells[header.url] ?? '';
      notesCell = cells[header.notes] ?? '';
    } else if (cells.length === 1) {
      [slugCell, urlCell, notesCell] = ['', cells[0]!, ''];
    } else {
      [slugCell = '', urlCell = '', notesCell = ''] = cells;
    }
    const struck = STRUCK.exec(slugCell.trim());
    return {
      line: n,
      slug: cleanSlug(struck ? struck[1]! : slugCell),
      url: unwrap(urlCell),
      notes: notesCell.trim() || null,
      struck: !!struck,
    };
  });
  return { format, rows };
}

export type RowStatus = 'new' | 'taken' | 'repeated' | 'bad-slug' | 'bad-url' | 'struck';

export interface PlannedRow extends BulkRow {
  status: RowStatus;
  target: string | null; // normalized URL when valid
}

// `taken` is the set of slugs already in the database. Only 'new' rows are
// created; everything else is shown in the preview with the reason.
export function planRows(rows: BulkRow[], taken: Set<string>): PlannedRow[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    const target = validTargetUrl(r.url);
    let status: RowStatus = 'new';
    if (r.struck) status = 'struck';
    else if (!target) status = 'bad-url';
    else if (r.slug && !isValidSlug(r.slug)) status = 'bad-slug';
    else if (r.slug && taken.has(r.slug)) status = 'taken';
    else if (r.slug && seen.has(r.slug)) status = 'repeated';
    if (status === 'new' && r.slug) seen.add(r.slug);
    return { ...r, status, target };
  });
}

export const FORMAT_LABEL: Record<BulkFormat, string> = {
  markdown: 'Markdown table',
  tsv: 'tab-separated (spreadsheet paste)',
  csv: 'CSV',
};

export const STATUS_LABEL: Record<RowStatus, string> = {
  new: 'new',
  taken: 'already exists',
  repeated: 'repeated above',
  'bad-slug': 'invalid slug',
  'bad-url': 'invalid URL',
  struck: 'struck out',
};
