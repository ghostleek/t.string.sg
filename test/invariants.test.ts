// Repo rules from AGENTS.md that can be checked mechanically. Each failure
// message says how to fix it.
// @ts-expect-error -- Node types aren't installed (this is a Workers project); vitest runs on Node.
import { readdirSync, readFileSync, statSync } from 'node:fs';
// @ts-expect-error -- as above.
import { join, relative } from 'node:path';
// @ts-expect-error -- as above.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT: string = fileURLToPath(new URL('..', (import.meta as unknown as { url: string }).url));

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsFiles(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

describe('invariants', () => {
  // "src/db.ts — all application SQL; route handlers never build queries."
  // Handlers pass c.env.DB into a db.ts function instead of calling D1 directly,
  // so D1's limits (100 statements per batch, 100 bound parameters per
  // statement) are handled in one place.
  it('only src/db.ts calls D1 prepare/batch', () => {
    const offenders = tsFiles(join(ROOT, 'src'))
      .filter((f) => relative(ROOT, f) !== join('src', 'db.ts'))
      .flatMap((f) =>
        (readFileSync(f, 'utf8') as string)
          .split('\n')
          .map((line, i) => ({ line, at: `${relative(ROOT, f)}:${i + 1}` }))
          .filter(({ line }) => /\.(prepare|batch)\(/.test(line))
          .map(({ at, line }) => `${at}: ${line.trim()}`)
      );
    expect(offenders, 'Move this query into a function in src/db.ts and call that instead').toEqual([]);
  });
});
