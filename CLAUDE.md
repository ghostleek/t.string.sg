# CLAUDE.md

Link shortener on Cloudflare Workers + D1. See README.md for the product; this file
is what an agent needs to work in the repo without breaking anything.

## Commands

- `npm test` — vitest, all of `test/`. Run before every commit.
- `npm run typecheck` — `tsc --noEmit`. Also runs automatically after every `.ts` edit
  (PostToolUse hook in `.claude/settings.json`).
- `npm run db:migrate:local` then `npm run dev` — local Worker on :8787 with a local D1.
  Log in with the password from `.dev.vars` (gitignored; create it with
  `ADMIN_PASSWORD=...` if missing).

## Where things live

- `src/detect.ts` — medium classification. Pure; any change needs a case in `test/detect.test.ts`.
- `src/db.ts` — all SQL. No SQL anywhere else.
- `src/api.ts` — JSON/form routes under `/api`. `src/admin/` — server-rendered dashboard.
- `migrations/` — schema only, append-only, numbered. Never edit an applied migration.
- `seeds/` — one-off data batches (`INSERT … ON CONFLICT(slug) DO NOTHING`), not migrations.

## Production is out of reach, on purpose

Links live in the production D1 database, not in this repo. Agents have no Cloudflare
credentials, and `.claude/settings.json` denies `wrangler deploy` and any `--remote`
wrangler command. To add links: write a seed file or use the dashboard's bulk add,
then tell the user the exact command to run themselves.

## Conventions

- Validation: slugs go through `isValidSlug` in `src/slugs.ts`, target URLs through
  `validTargetUrl` in `src/api.ts`. Reuse them; don't write a second validator.
- Timestamps are unix seconds; dashboard buckets use Singapore time (UTC+8).
- Match surrounding style: 2-space indent, single quotes, comments explain *why*.
- Mobile matters: the dashboard is used on a phone. Check new UI at 390px wide.
