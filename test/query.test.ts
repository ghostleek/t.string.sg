import { describe, expect, it } from 'vitest';
import { parseDays } from '../src/admin/query';

describe('parseDays', () => {
  it('accepts allow-listed values', () => {
    expect(parseDays('30', [7, 30] as const, 7)).toBe(30);
    expect(parseDays('90', [7, 30, 90] as const, 30)).toBe(90);
  });
  it('falls back for missing, junk, or disallowed values', () => {
    expect(parseDays(undefined, [7, 30] as const, 7)).toBe(7);
    expect(parseDays('abc', [7, 30] as const, 7)).toBe(7);
    expect(parseDays('90', [7, 30] as const, 7)).toBe(7);
    expect(parseDays('', [7, 30, 90] as const, 30)).toBe(30);
  });
});
