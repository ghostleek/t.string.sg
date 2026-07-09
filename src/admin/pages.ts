import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import {
  clearSessionCookie,
  createSessionToken,
  passwordMatches,
  setSessionCookie,
} from '../auth';
import { fillBuckets, getLink, listLinks, statsFor, type LinkWithCounts } from '../db';
import type { Env } from '../env';
import { barChart, breakdownTable } from './charts';
import { page, type Html } from './layout';

export const admin = new Hono<{ Bindings: Env }>();

const dateFmt = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function fmtTs(ts: number | null): string {
  return ts ? dateFmt.format(new Date(ts * 1000)) : '—';
}

function shell(c: { req: { url: string } }, body: Html): Html {
  const host = new URL(c.req.url).host;
  return html`<div class="wrap">
    <header class="top">
      <h1><a href="/admin">${host}</a> <span class="mut">link shortener</span></h1>
      <form method="post" action="/admin/logout"><button class="linkish">Log out</button></form>
    </header>
    ${body}
  </div>`;
}

// --- Login ---------------------------------------------------------------

function loginPage(error?: string): Html {
  return page(
    'Log in',
    html`<div class="login-wrap">
      <div class="card">
        <h2>t.string.sg admin</h2>
        ${error ? html`<p class="flash err">${error}</p>` : ''}
        <form method="post" action="/admin/login">
          <label for="pw" class="mut">Password</label>
          <input id="pw" type="password" name="password" autofocus autocomplete="current-password" />
          <button class="primary" style="margin-top:10px;width:100%">Log in</button>
        </form>
      </div>
    </div>`
  );
}

admin.get('/login', (c) => c.html(loginPage()));

admin.post('/login', async (c) => {
  const body = await c.req.parseBody();
  const submitted = typeof body['password'] === 'string' ? body['password'] : '';
  if (submitted && (await passwordMatches(submitted, c.env.ADMIN_PASSWORD))) {
    setSessionCookie(c, await createSessionToken(c.env.ADMIN_PASSWORD));
    return c.redirect('/admin', 303);
  }
  await new Promise((r) => setTimeout(r, 1000)); // brute-force damping
  return c.html(loginPage('Wrong password'), 401);
});

admin.post('/logout', (c) => {
  clearSessionCookie(c);
  return c.redirect('/admin/login', 303);
});

// --- Link list -----------------------------------------------------------

function linkRow(l: LinkWithCounts, origin: string): Html {
  const short = `${origin}/${l.slug}`;
  return html`<tr>
    <td>
      <a href="/admin/links/${l.slug}"><strong>/${l.slug}</strong></a>
      <button class="linkish mut" data-copy="${short}" title="Copy short link">copy</button>
    </td>
    <td><a class="target" href="${l.target_url}" rel="noreferrer" target="_blank">${l.target_url}</a>
      ${l.notes ? html`<div class="mut">${l.notes}</div>` : ''}</td>
    <td class="num"><a href="/admin/links/${l.slug}">${l.clicks}</a></td>
    <td class="mut">${fmtTs(l.last_click)}</td>
    <td>${l.is_active ? html`<span class="pill">active</span>` : html`<span class="pill off">paused</span>`}</td>
    <td class="actions">
      <form method="post" action="/api/links/${l.slug}/toggle">
        <button class="linkish">${l.is_active ? 'pause' : 'resume'}</button>
      </form>
      <form method="post" action="/api/links/${l.slug}/delete" data-confirm="Delete /${l.slug} and all its click data?">
        <button class="linkish danger">delete</button>
      </form>
    </td>
  </tr>`;
}

const LIST_JS = `
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  navigator.clipboard.writeText(b.dataset.copy).then(() => {
    const t = b.textContent; b.textContent = 'copied!';
    setTimeout(() => { b.textContent = t; }, 1200);
  });
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-confirm]');
  if (f && !confirm(f.dataset.confirm)) e.preventDefault();
});
`;

admin.get('/', async (c) => {
  const links = await listLinks(c.env.DB);
  const origin = new URL(c.req.url).origin;
  const created = c.req.query('created');
  const error = c.req.query('error');

  const body = html`
    ${created ? html`<p class="flash ok">Created <strong>${origin}/${created}</strong></p>` : ''}
    ${error ? html`<p class="flash err">${error}</p>` : ''}
    <div class="card">
      <h2>New link</h2>
      <form class="create" method="post" action="/api/links">
        <div>
          <label for="f-url">Target URL</label>
          <input id="f-url" type="url" name="url" placeholder="https://example.com/page" required />
        </div>
        <div>
          <label for="f-slug">Slug <span class="mut">(optional)</span></label>
          <input id="f-slug" type="text" name="slug" placeholder="random" pattern="[A-Za-z0-9_-]{1,64}" />
        </div>
        <div>
          <label for="f-notes">Notes <span class="mut">(optional)</span></label>
          <input id="f-notes" type="text" name="notes" placeholder="what/where this is shared" />
        </div>
        <button class="primary">Create</button>
      </form>
    </div>
    <div class="card">
      <h2>Links</h2>
      ${
        links.length === 0
          ? html`<p class="empty">No links yet — create one above.</p>`
          : html`<table class="links">
              <tr><th>Slug</th><th>Target</th><th class="num">Clicks</th><th>Last click</th><th></th><th></th></tr>
              ${links.map((l) => linkRow(l, origin))}
            </table>`
      }
    </div>
    <script>${raw(LIST_JS)}</script>
  `;
  return c.html(page('Links · t.string.sg', shell(c, body)));
});

// --- Per-link stats --------------------------------------------------------

admin.get('/links/:slug', async (c) => {
  const link = await getLink(c.env.DB, c.req.param('slug'));
  if (!link) return c.notFound();

  const days = [7, 30, 90].includes(Number(c.req.query('days'))) ? Number(c.req.query('days')) : 30;
  const bots = c.req.query('bots') === '1';
  const stats = await statsFor(c.env.DB, link.id, days, bots);
  const series = fillBuckets(stats.timeseries, days, stats.bucket);
  const origin = new URL(c.req.url).origin;

  const dayLink = (d: number) =>
    html`<a class="${d === days ? 'on' : ''}" href="?days=${d}${bots ? '&bots=1' : ''}">${d}d</a>`;

  const body = html`
    <p><a href="/admin">← all links</a></p>
    <div class="card">
      <h2 style="font-size:18px">${origin}/${link.slug}
        ${link.is_active ? '' : html` <span class="pill off">paused</span>`}</h2>
      <div class="mut">→ <a href="${link.target_url}" rel="noreferrer" target="_blank">${link.target_url}</a></div>
      ${link.notes ? html`<div class="mut">${link.notes}</div>` : ''}
      <div class="mut">created ${fmtTs(link.created_at)}</div>
    </div>
    <div class="controls">
      <span class="seg">${dayLink(7)}${dayLink(30)}${dayLink(90)}</span>
      <span class="seg">
        <a class="${bots ? '' : 'on'}" href="?days=${days}">Humans</a>
        <a class="${bots ? 'on' : ''}" href="?days=${days}&bots=1">Bots</a>
      </span>
    </div>
    <div class="tiles">
      <div class="tile"><div class="v">${stats.clicks}</div><div class="l">human clicks · ${days}d</div></div>
      <div class="tile"><div class="v">${stats.bots}</div><div class="l">bot / preview hits · ${days}d</div></div>
    </div>
    <div class="card">
      <h3>${bots ? 'Bot hits' : 'Clicks'} per ${stats.bucket} (Singapore time)</h3>
      ${barChart(series, stats.bucket)}
    </div>
    <div class="grid2">
      ${breakdownTable('Medium', stats.byMedium)}
      ${breakdownTable('Referrer', stats.byRefHost)}
      ${breakdownTable('Country', stats.byCountry)}
      ${breakdownTable('Device', stats.byDevice)}
      ${breakdownTable('Browser', stats.byBrowser)}
    </div>
  `;
  return c.html(page(`/${link.slug} · t.string.sg`, shell(c, body)));
});
