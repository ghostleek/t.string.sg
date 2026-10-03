# AGENTS.md

Link shortener on Cloudflare Workers + D1. See README.md for the product; this file
is what an agent (Claude Code, Codex, Copilot, …) needs to work in the repo without
breaking anything. `CLAUDE.md` imports this file.

## Commands

- `npm run check` — typecheck + all tests; no secrets or database needed. CI
  (`.github/workflows/ci.yml`) runs the same two steps on every PR. Run before every commit.
- `npm test` — vitest, all of `test/`. `test/invariants.test.ts` enforces the repo rules
  below that can be checked mechanically.
- `npm run typecheck` — `tsc --noEmit`. Also runs automatically after every `.ts` edit
  (PostToolUse hook in `.claude/settings.json`).
- `npm run db:migrate:local` then `npm run dev` — local Worker on :8787 with a local D1.
  Log in with the password from `.dev.vars` (gitignored; create it with
  `ADMIN_PASSWORD=...` if missing). Use a throwaway local value, never the production
  password: agents can run shell commands here, so treat this file as readable by them.

## Where things live

- `src/detect.ts` — medium classification. Pure; any change needs a case in `test/detect.test.ts`.
- `src/db.ts` — all application SQL; route handlers never build queries (enforced by
  `test/invariants.test.ts`). (`migrations/` and `seeds/` are SQL files by design; this
  rule doesn't cover them.)
- `src/api.ts` — JSON/form routes under `/api`. `src/admin/` — server-rendered dashboard.
- `src/bulk.ts` — bulk-add paste parser (Markdown/CSV/TSV). Pure; tested in `test/bulk.test.ts`.
- `migrations/` — schema only, append-only, numbered. Never edit an applied migration.
- `seeds/` — one-off data batches (`INSERT … ON CONFLICT(slug) DO NOTHING`), not migrations.
- `.github/skills/code-review/SKILL.md` — what reviewers check, mined from past fixes.

## Production is out of reach, on purpose

Links live in the production D1 database, not in this repo. The real boundary is that
agents have no Cloudflare credentials. On top of that, two guardrails stop accidents:
deny rules in `.claude/settings.json`, and `.claude/hooks/guard-prod.sh`, which blocks
deploy/migrate npm scripts, every `wrangler` command except `wrangler dev` and `--local`
ones (many act on Cloudflare without `--remote`), and plain reads of `.dev.vars`
(cases in `test/guard-prod.test.ts`). It matches text, so it can misfire on a commit
message that mentions those words; put such text in a file instead.

To add links: write a seed file or use the dashboard's bulk add, then tell the user
the exact command to run themselves.

## Conventions

- Validation: slugs go through `isValidSlug`, target URLs through `validTargetUrl`, both
  in `src/slugs.ts`. Reuse them; don't write a second validator.
- Timestamps are unix seconds; dashboard buckets use Singapore time (UTC+8).
- Match surrounding style: 2-space indent, single quotes, comments explain *why*.
- Mobile matters: the dashboard is used on a phone. Check new UI at 390px wide.

When a rule here gets broken twice, turn it into a case in `test/invariants.test.ts`
instead of adding more prose.
