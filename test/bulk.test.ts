import { describe, expect, it } from 'vitest';
import { detectFormat, MAX_BULK_ROWS, parseBulk, planRows } from '../src/bulk';

// The table exactly as it was pasted into chat.
const CHAT_TABLE = `|Short link                |Target                                                                         |Note                                                     |
|--------------------------|-------------------------------------------------------------------------------|---------------------------------------------------------|
|t.string.sg/math-arena    |<https://limkimsze-maker.github.io/Math-Fluency-Arena/>                        |                                                         |
|t.string.sg/kimsze        |<https://limkimsze-maker.github.io/>                                           |Kim Sze's portfolio                                      |
|t.string.sg/gryphon-lab   |<https://go.gov.sg/wnrgyt>                                                     |                                                         |
|~t.string.sg/salistoyshop~|<https://salistoyshop.netlify.app/>                                            |⚠️ Left out: doesn't look related to Plexo. Please confirm|`;

describe('detectFormat', () => {
  it('is markdown when the first line starts with a pipe', () => {
    expect(detectFormat('| a | b |', 'x')).toBe('markdown');
  });

  it('is markdown for a pipe header followed by a delimiter row, with or without outer pipes', () => {
    expect(detectFormat('a | b', '---|---')).toBe('markdown');
    expect(detectFormat('a | b', ':--- | ---:')).toBe('markdown');
  });

  it('is tsv when the first line has a tab, else csv', () => {
    expect(detectFormat('slug\turl', '')).toBe('tsv');
    expect(detectFormat('slug,url', '')).toBe('csv');
    // A pipe without a delimiter row is just a character in a CSV cell.
    expect(detectFormat('a|b,https://x.com', 'c,https://y.com')).toBe('csv');
  });
});

describe('parseBulk: markdown', () => {
  it('reads the chat table: host prefix, <autolinks>, notes, and struck-out rows', () => {
    const { format, rows, error } = parseBulk(CHAT_TABLE);
    expect(error).toBeUndefined();
    expect(format).toBe('markdown');
    expect(rows).toEqual([
      { line: 3, slug: 'math-arena', url: 'https://limkimsze-maker.github.io/Math-Fluency-Arena/', notes: null, struck: false },
      { line: 4, slug: 'kimsze', url: 'https://limkimsze-maker.github.io/', notes: "Kim Sze's portfolio", struck: false },
      { line: 5, slug: 'gryphon-lab', url: 'https://go.gov.sg/wnrgyt', notes: null, struck: false },
      {
        line: 6,
        slug: 'salistoyshop',
        url: 'https://salistoyshop.netlify.app/',
        notes: "⚠️ Left out: doesn't look related to Plexo. Please confirm",
        struck: true,
      },
    ]);
  });

  it('maps columns by header name, in any order, and unwraps [text](url) and `code`', () => {
    const { rows } = parseBulk(
      '| Note | URL | Slug |\n|---|---|---|\n| hi \\| there | [site](https://a.com/x) | `abc` |'
    );
    expect(rows).toEqual([{ line: 3, slug: 'abc', url: 'https://a.com/x', notes: 'hi | there', struck: false }]);
  });
});

describe('parseBulk: csv / tsv', () => {
  it('reads headerless CSV as slug, url, notes with quoted commas', () => {
    const { format, rows } = parseBulk('demo,https://a.com,"one, two"\r\n\r\n/other/,https://b.com');
    expect(format).toBe('csv');
    expect(rows).toEqual([
      { line: 1, slug: 'demo', url: 'https://a.com', notes: 'one, two', struck: false },
      { line: 3, slug: 'other', url: 'https://b.com', notes: null, struck: false },
    ]);
  });

  it('uses a header row when present and handles "" escapes', () => {
    const { rows } = parseBulk('target,short link,notes\nhttps://a.com,https://t.string.sg/x,"say ""hi"""');
    expect(rows).toEqual([{ line: 2, slug: 'x', url: 'https://a.com', notes: 'say "hi"', struck: false }]);
  });

  it('reads a spreadsheet paste as TSV', () => {
    const { format, rows } = parseBulk('Slug\tURL\tNote\nq1\thttps://a.com, b\tQ1, 2026');
    expect(format).toBe('tsv');
    expect(rows).toEqual([{ line: 2, slug: 'q1', url: 'https://a.com, b', notes: 'Q1, 2026', struck: false }]);
  });

  it('treats a one-column row as a bare URL that gets a random slug', () => {
    const { rows } = parseBulk('https://a.com\nhttps://b.com');
    expect(rows.map((r) => [r.slug, r.url])).toEqual([
      ['', 'https://a.com'],
      ['', 'https://b.com'],
    ]);
  });
});

describe('parseBulk: errors', () => {
  it('rejects empty input', () => {
    expect(parseBulk('  \n ').error).toMatch(/Nothing to import/);
  });

  it('rejects a header with no URL column', () => {
    expect(parseBulk('slug,note\na,b').error).toMatch(/no URL column/);
  });

  it('caps the row count', () => {
    const text = Array.from({ length: MAX_BULK_ROWS + 1 }, (_, i) => `s${i},https://a.com`).join('\n');
    expect(parseBulk(text).error).toMatch(/Too many rows/);
  });
});

describe('planRows', () => {
  it('marks each row new or says why it will be skipped', () => {
    const { rows } = parseBulk(
      [
        'ok,https://a.com',
        'exists,https://a.com',
        'ok,https://b.com',
        'bad slug,https://a.com',
        'admin,https://a.com',
        'x,ftp://a.com',
        'y,not a url',
        '~z~,https://a.com',
        ',https://random.com',
      ].join('\n')
    );
    const plan = planRows(rows, new Set(['exists']));
    expect(plan.map((r) => r.status)).toEqual([
      'new',
      'taken',
      'repeated',
      'bad-slug',
      'bad-slug', // reserved word
      'bad-url',
      'bad-url',
      'struck',
      'new',
    ]);
    expect(plan[0]!.target).toBe('https://a.com/');
  });
});
