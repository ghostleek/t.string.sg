# t.string.sg

Personal link shortener on Cloudflare Workers + D1. Serves `https://t.string.sg/<slug>`
redirects at the edge and records every clickthrough with the **medium** it came from
(WhatsApp, Telegram, Instagram, Facebook, X, LinkedIn, TikTok, WeChat, LINE, Slack,
Discord, email, search, direct, …), referrer, country, device, OS, and browser.

## Dashboard

`https://t.string.sg/admin` — password-protected (single `ADMIN_PASSWORD` Worker secret).

- Create links with a custom slug or a random 6-char code
- Per-link stats: clicks over time, breakdowns by medium / referrer / country / device / browser
- Link-preview crawlers (WhatsApp/Telegram/Slack unfurlers, Googlebot, …) are still
  redirected but flagged `is_bot=1` and excluded from stats; the **Bots** toggle shows them

## Known attribution limits

WhatsApp and Telegram open links in the system browser with no referrer, so *human*
clicks from them are recorded as `direct` — only their link-preview bots are positively
attributed. This is an industry-wide constraint, not a bug. The raw user-agent of every
click is stored (`clicks.user_agent`), so detection rules in `src/detect.ts` can be
extended and old rows reclassified with an `UPDATE`.

## Development

```bash
npm install
npm run db:migrate:local     # local D1 in .wrangler/state
npm run dev                  # http://localhost:8787, password from .dev.vars
npm test                     # classifier unit tests
```

## Deployment

```bash
npx wrangler login
npx wrangler d1 create t-string-sg        # paste database_id into wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put ADMIN_PASSWORD
npm run deploy                             # attaches t.string.sg automatically
```

Ad-hoc production queries:

```bash
npx wrangler d1 execute t-string-sg --remote --command "SELECT ..."
```

## Layout

- `src/detect.ts` — UA/referrer → medium classification (the interesting part; tested)
- `src/redirect.ts` — hot path: D1 lookup, 302 `no-store`, click logged via `waitUntil`
- `src/db.ts` — all SQL; stats bucketed in Singapore time
- `src/auth.ts` — HMAC session cookie derived from `ADMIN_PASSWORD`
- `src/api.ts` — JSON/form API for links + stats
- `src/admin/` — server-rendered dashboard, zero client build
