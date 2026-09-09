import { describe, expect, it } from 'vitest';
import { breakdownTable, sparkBars } from '../src/admin/charts';
import { pctChange } from '../src/db';

const render = async (x: unknown) => String(await x);

describe('pctChange', () => {
  it('computes whole-percent change', () => {
    expect(pctChange(10, 5)).toBe(100);
    expect(pctChange(5, 10)).toBe(-50);
    expect(pctChange(10, 3)).toBe(233);
    expect(pctChange(3, 10)).toBe(-70);
    expect(pctChange(7, 7)).toBe(0);
  });

  it('has no baseline when the previous window is empty', () => {
    expect(pctChange(7, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });
});

describe('sparkBars', () => {
  const points = [
    { bucket: '2026-09-03', n: 0 },
    { bucket: '2026-09-04', n: 3 },
    { bucket: '2026-09-05', n: 12 },
    { bucket: '2026-09-06', n: 1 },
  ];

  it('renders one slot per point and bars only for non-zero days', async () => {
    const s = await render(sparkBars(points, 'Human clicks per day'));
    expect(s.match(/<g class="slot"/g)?.length).toBe(4);
    expect(s.match(/class="bar"/g)?.length).toBe(3);
    expect(s).toContain('preserveAspectRatio="none"');
    expect(s).toContain('aria-label="Human clicks per day"');
    expect(s).not.toContain('NaN');
  });

  it('draws a bare baseline for an all-zero window', async () => {
    const s = await render(sparkBars(points.map((p) => ({ ...p, n: 0 })), 'x'));
    expect(s).toContain('class="base"');
    expect(s).not.toContain('class="bar"');
    expect(s).not.toContain('NaN');
  });
});

describe('breakdownTable', () => {
  it('sizes bars against the sum of rows by default', async () => {
    const s = await render(breakdownTable('Medium', [{ k: 'whatsapp', n: 3 }, { k: 'direct', n: 1 }]));
    expect(s).toContain('width:75.0%');
    expect(s).toContain('width:25.0%');
    expect(s).not.toContain('bd-pct');
  });

  it('sizes bars against an explicit total and shows the share', async () => {
    const s = await render(breakdownTable('Top links', [{ k: '/abc', n: 25, href: '/admin/links/abc?days=7' }], 100));
    expect(s).toContain('width:25.0%');
    expect(s).toContain('href="/admin/links/abc?days=7"');
    expect(s).toContain('25%');
  });

  it('never divides by zero', async () => {
    const s = await render(breakdownTable('Country', [], 0));
    expect(s).toContain('No data.');
    expect(s).not.toContain('NaN');
  });
});
