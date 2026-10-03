---
name: code-review
description: Review pull requests for t.string.sg, a personal link shortener on Cloudflare Workers + D1 (edge redirects, click analytics, password-protected phone-first admin dashboard, bulk add, agent prod guardrails). Use when reviewing any PR in this repo.
---

# Reviewing t.string.sg PRs

Read `AGENTS.md` first and check every changed line against it. Don't repeat
what CI already enforces (`npm run check`: `tsc --noEmit` plus vitest, including
`test/invariants.test.ts`, which fails if anything outside `src/db.ts` calls
D1 `prepare`/`batch`).

The costly failures here are lost clicks, links created or overwritten wrongly,
a dashboard that's broken on a phone, and an agent reaching production.

## Bug classes this repo has actually hit — check each one

1. **D1 limits.** A D1 `batch()` takes at most 100 statements and a statement at
   most 100 bound parameters. Bulk add first sent every insert in one batch, so
   any paste over 100 rows failed (PR #6, fixed by chunking in `createLinks` /
   `existingSlugs`). Any new loop over user-supplied rows in `src/db.ts` must
   chunk, and keep the per-row result mapping when it does.
2. **Caching that hides changes or swallows clicks.** Admin pages had to be
   marked `Cache-Control: no-store` because deploys didn't show until a hard
   refresh (37a9d58). The redirect's `no-store` is load-bearing: a cached 302
   never reaches the Worker, so the click is never logged. Flag any new
   redirect, 404 or admin response that drops or overrides it.
3. **Never overwrite an existing slug.** Single create lets the slug's UNIQUE
   constraint fail and answers 409; bulk add and seeds use `ON CONFLICT(slug)
   DO NOTHING` and report what was skipped. Flag `INSERT OR REPLACE`, upserts
   on `links`, or a create path that trusts a pre-check (`existingSlugs`)
   instead of the constraint, since a slug can be taken between check and insert.
4. **Bulk paste parsing and preview drift** (`src/bulk.ts`, review on PR #6).
   Cases that slipped: quoted CSV fields with embedded newlines split into
   rows, HTML-escaped `&lt;url&gt;` wrappers rejected as invalid, and Create
   submitting edited textarea text that no longer matches the preview the
   user saw. Ask for a `test/bulk.test.ts` case for any parser change.
5. **Mobile regressions** (2eb22c1, 131a4a1). Found at 375px: tables 2x the
   screen width, a QR card crushing link info, inputs under 16px (iOS zooms on
   focus), touch targets under 44px, and slug inputs without
   `autocapitalize="none"` (`/promo` silently became `/Promo`). New UI must
   work at 390px with no JS.
6. **Lookup maps keyed by user data.** Breakdown labels need `Object.hasOwn`
   (a referrer or country like `constructor` otherwise hits the prototype,
   2eb22c1). Same for any object indexed by slug, medium or header name.
7. **Client JS state across repeated taps.** The copy button's `flash` read its
   label at call time, so two taps within the timeout left it stuck on
   "copied!" (PR #3). Check timers and saved labels in `src/admin/layout.ts`.
8. **Prod guardrail bypasses** (PR #8). Permission rules only match command
   prefixes, so `npm run deploy -- --env production`, `npm exec wrangler …`,
   `./node_modules/.bin/wrangler`, reordered `--remote`, and wrangler
   subcommands that act remotely without `--remote` (`d1 delete`) all slipped
   past earlier versions. Any change to `.claude/settings.json` or
   `.claude/hooks/guard-prod.sh` needs a matching case in `test/guard-prod.test.ts`.
9. **Duplicated validators and stale guidance.** `validTargetUrl` moved from
   `src/api.ts` to `src/slugs.ts` while the docs still pointed at the old file.
   New input paths must reuse `isValidSlug` / `validTargetUrl`; if a PR moves a
   file that `AGENTS.md` or `README.md` names, the doc must change too.

## Also flag

- SQL changes that need a schema change but edit an applied migration instead
  of adding the next numbered file in `migrations/`.
- Time bucketing that isn't Singapore time (UTC+8), or timestamps not in unix seconds.
- A change to `src/detect.ts` without a case in `test/detect.test.ts`.
- `ADMIN_PASSWORD`, session cookies or `.dev.vars` content in logs, responses or commits.

## Using context

The GitHub MCP server is available read-only. Use it when the diff alone isn't
enough: read the full file around a change, the linked issue, and earlier PRs
that touched the same file (PR #6 for bulk add, #8 for guardrails, #3 and #4
for the dashboard); their review threads explain why code looks the way it does.

## Style of comments

One finding per comment, with the concrete failing input (a paste, a request,
a viewport width, a command). Skip formatting and naming nits; there is no
linter, and style is "match the surrounding code".
