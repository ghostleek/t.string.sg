import type { Context } from 'hono';
import { classify, referrerHost } from './detect';
import { getActiveLink, insertClick } from './db';
import type { Env } from './env';
import { RESERVED, SLUG_RE } from './slugs';

const NOT_FOUND_HTML = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not found</title>
<body style="font-family: system-ui, sans-serif; text-align: center; padding-top: 15vh; color: #333">
<h1 style="font-size: 3rem; margin: 0">404</h1>
<p>This short link doesn't exist.</p>
</body>`;

export function notFound(c: Context): Response {
  return c.html(NOT_FOUND_HTML, 404, { 'Cache-Control': 'no-store' });
}

export async function handleRedirect(c: Context<{ Bindings: Env }>): Promise<Response> {
  const slug = c.req.param('slug');
  if (!slug || !SLUG_RE.test(slug) || RESERVED.has(slug.toLowerCase())) return notFound(c);

  const link = await getActiveLink(c.env.DB, slug);
  if (!link) return notFound(c);

  const userAgent = c.req.header('user-agent') ?? '';
  const referrer = c.req.header('referer') ?? '';
  const country =
    (c.req.raw.cf?.country as string | undefined) ?? c.req.header('cf-ipcountry') ?? null;

  // Log after the redirect is sent; a logging failure must never break a redirect.
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const cls = classify(userAgent, referrer);
        await insertClick(c.env.DB, {
          link_id: link.id,
          ts: Math.floor(Date.now() / 1000),
          is_bot: cls.isBot,
          medium: cls.medium,
          referrer: referrer || null,
          ref_host: referrerHost(referrer),
          country,
          device: cls.device,
          os: cls.os,
          browser: cls.browser,
          user_agent: userAgent || null,
        });
      } catch (err) {
        console.error('click log failed', err);
      }
    })()
  );

  // no-store is load-bearing: a cached 302 would swallow clicks.
  c.header('Cache-Control', 'no-store');
  return c.redirect(link.target_url, 302);
}
