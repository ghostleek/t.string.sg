import { Hono } from 'hono';
import { createLink, deleteLink, getLink, listLinks, statsFor, updateLink } from './db';
import type { Env } from './env';
import { isValidSlug, randomSlug } from './slugs';

export const api = new Hono<{ Bindings: Env }>();

interface LinkInput {
  url?: string;
  slug?: string;
  notes?: string;
}

function validTargetUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

async function readInput(c: { req: { header: (n: string) => string | undefined; json: () => Promise<unknown>; parseBody: () => Promise<Record<string, unknown>> } }): Promise<{ input: LinkInput; isForm: boolean }> {
  const ct = c.req.header('content-type') ?? '';
  if (ct.includes('application/json')) {
    return { input: ((await c.req.json()) ?? {}) as LinkInput, isForm: false };
  }
  const body = await c.req.parseBody();
  return {
    input: {
      url: typeof body['url'] === 'string' ? body['url'] : undefined,
      slug: typeof body['slug'] === 'string' ? body['slug'] : undefined,
      notes: typeof body['notes'] === 'string' ? body['notes'] : undefined,
    },
    isForm: true,
  };
}

api.get('/links', async (c) => {
  return c.json(await listLinks(c.env.DB));
});

api.post('/links', async (c) => {
  const { input, isForm } = await readInput(c);
  const fail = (msg: string, status: 400 | 409) =>
    isForm ? c.redirect('/admin?error=' + encodeURIComponent(msg), 303) : c.json({ error: msg }, status);

  const target = validTargetUrl((input.url ?? '').trim());
  if (!target) return fail('Enter a valid http(s) URL', 400);

  const notes = (input.notes ?? '').trim() || null;
  const wanted = (input.slug ?? '').trim();
  if (wanted && !isValidSlug(wanted)) {
    return fail('Slug must be 1-64 chars of letters, digits, - or _, and not a reserved word', 400);
  }

  const candidates = wanted ? [wanted] : [randomSlug(6), randomSlug(6), randomSlug(6), randomSlug(7)];
  for (const slug of candidates) {
    try {
      const link = await createLink(c.env.DB, slug, target, notes);
      return isForm ? c.redirect('/admin?created=' + encodeURIComponent(slug), 303) : c.json(link, 201);
    } catch (err) {
      if (String(err).includes('UNIQUE')) continue;
      throw err;
    }
  }
  return fail(wanted ? `Slug "${wanted}" is already taken` : 'Could not generate a unique slug, try again', 409);
});

api.patch('/links/:slug', async (c) => {
  const slug = c.req.param('slug');
  const body = ((await c.req.json()) ?? {}) as { url?: string; notes?: string | null; is_active?: boolean | number };
  const fields: { target_url?: string; notes?: string | null; is_active?: number } = {};
  if (body.url !== undefined) {
    const target = validTargetUrl(String(body.url));
    if (!target) return c.json({ error: 'invalid url' }, 400);
    fields.target_url = target;
  }
  if (body.notes !== undefined) fields.notes = body.notes === null ? null : String(body.notes);
  if (body.is_active !== undefined) fields.is_active = body.is_active ? 1 : 0;
  const ok = await updateLink(c.env.DB, slug, fields);
  if (!ok) return c.json({ error: 'not found' }, 404);
  return c.json(await getLink(c.env.DB, slug));
});

async function handleDelete(c: { env: Env; req: { param: (k: 'slug') => string } }): Promise<{ ok: boolean }> {
  const link = await getLink(c.env.DB, c.req.param('slug'));
  if (!link) return { ok: false };
  await deleteLink(c.env.DB, link.id);
  return { ok: true };
}

api.delete('/links/:slug', async (c) => {
  const { ok } = await handleDelete(c);
  return ok ? c.json({ ok: true }) : c.json({ error: 'not found' }, 404);
});

// Form-friendly variants used by the dashboard.
api.post('/links/:slug/delete', async (c) => {
  await handleDelete(c);
  return c.redirect('/admin', 303);
});

api.post('/links/:slug/toggle', async (c) => {
  const link = await getLink(c.env.DB, c.req.param('slug'));
  if (link) await updateLink(c.env.DB, link.slug, { is_active: link.is_active ? 0 : 1 });
  return c.redirect('/admin', 303);
});

api.get('/links/:slug/stats', async (c) => {
  const link = await getLink(c.env.DB, c.req.param('slug'));
  if (!link) return c.json({ error: 'not found' }, 404);
  const days = Math.min(365, Math.max(1, Number.parseInt(c.req.query('days') ?? '30', 10) || 30));
  const bots = c.req.query('bots') === '1';
  const stats = await statsFor(c.env.DB, link.id, days, bots);
  return c.json({ link, days, includeBots: bots, ...stats });
});
