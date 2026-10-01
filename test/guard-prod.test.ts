// @ts-expect-error -- Node types aren't installed (this is a Workers project); vitest runs on Node.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// The production guardrail is code, so it gets tests: every bypass a reviewer
// finds becomes a case here, and everyday commands must keep working.
function guard(command: string): number {
  const res = spawnSync('bash', ['.claude/hooks/guard-prod.sh'], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  });
  return res.status ?? -1;
}

describe('guard-prod hook', () => {
  it.each([
    'npm run deploy',
    'npm run deploy -- --env production',
    'npm run db:migrate:remote -- --yes',
    'pnpm deploy',
    'npx wrangler deploy',
    'wrangler deploy',
    './node_modules/.bin/wrangler secret put ADMIN_PASSWORD',
    'npm exec wrangler d1 execute t-string-sg --command "SELECT 1" --remote',
    'npx wrangler d1 execute t-string-sg --remote --command "DELETE FROM links"',
    'npx wrangler d1 migrations apply t-string-sg --remote',
    'cat .dev.vars',
    'node -e "require(\'fs\').readFileSync(\'.dev.vars\')"',
    'cat .dev*',
    'grep PASS .dev?vars',
  ])('blocks: %s', (cmd) => {
    expect(guard(cmd)).toBe(2);
  });

  it.each([
    'npm test',
    'npm run typecheck',
    'npm run dev',
    'npx wrangler dev --port 8787',
    'npm run db:migrate:local',
    'npx wrangler d1 execute t-string-sg --local --command "SELECT 1"',
    'npx wrangler d1 migrations apply t-string-sg --local',
    'git status',
    'npx vitest run test/detect.test.ts',
  ])('allows: %s', (cmd) => {
    expect(guard(cmd)).toBe(0);
  });
});
