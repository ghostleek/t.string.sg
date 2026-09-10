import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import {
  clearSessionCookie,
  createSessionToken,
  passwordMatches,
  setSessionCookie,
} from '../auth';
import {
  fillBuckets,
  getLink,
  listLinks,
  overviewFor,
  pctChange,
  statsFor,
  type LinkWithCounts,
  type Overview,
} from '../db';
import type { Env } from '../env';
import { qrSvg } from '../qr';
import { barChart, breakdownTable, CHART_W, sparkBars, tickLabel } from './charts';
import { page, type Html } from './layout';

export const admin = new Hono<{ Bindings: Env }>();

// The dashboard is always dynamic (live click counts, freshly added links).
// Never let a browser serve a stale admin page — otherwise a deploy's changes
// silently don't show until a hard refresh.
admin.use('*', async (c, next) => {
  await next();
  if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
});

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

// --- Overview --------------------------------------------------------------

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

function countryLabel(code: string | null): string {
  if (!code) return 'unknown';
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

function deltaLine(cur: number, prev: number, days: number): Html {
  const pct = pctChange(cur, prev);
  if (pct === null) return html`<div class="d">nothing in the ${days} days before</div>`;
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : '';
  return html`<div class="d ${cls}">${pct > 0 ? '+' : ''}${pct}% vs previous ${days} days <span class="mut">(${prev})</span></div>`;
}

// The feedback loop at the top of the dashboard: how the past week (or
// month) went, which links carried it, and where the traffic came from.
// Top-link rows link to the same window on the per-link page so the numbers
// match after click-through.
function overviewSection(o: Overview): Html {
  const days = o.days;
  const rangeLink = (d: number) =>
    html`<a class="${d === days ? 'on' : ''}" href="/admin?range=${d}">${d}d</a>`;
  const head = html`<div class="ov-head">
    <h2>Past ${days} days <span class="mut">human clicks · Singapore time</span></h2>
    <div class="controls"><span class="seg">${rangeLink(7)}${rangeLink(30)}</span></div>
  </div>`;

  if (o.clicks === 0) {
    return html`<div class="card">${head}
      <p class="empty">No human clicks in the past ${days} days${
        o.prevClicks ? html` — ${o.prevClicks} in the ${days} days before` : ''
      }. Share a link and check back.</p>
    </div>`;
  }

  const series = fillBuckets(o.timeseries, days, 'day');
  const first = series[0]!;
  const last = series[series.length - 1]!;
  const topLinks = o.topLinks.map((r) => ({ k: '/' + r.slug, n: r.n, href: `/admin/links/${r.slug}?days=${days}` }));
  const countries = o.byCountry.map((r) => ({ k: countryLabel(r.k), n: r.n }));

  return html`
    ${head}
    <div class="ov-top">
      <div class="tile">
        <div class="v">${o.clicks}</div>
        <div class="l">human clicks</div>
        ${deltaLine(o.clicks, o.prevClicks, days)}
      </div>
      <div class="tile">
        <div class="l">per day</div>
        ${sparkBars(series, `Human clicks per day, past ${days} days`)}
        <div class="mut spark-ticks"><span>${tickLabel(first.bucket, 'day')}</span><span>${tickLabel(last.bucket, 'day')}</span></div>
      </div>
    </div>
    <div class="grid2">
      ${breakdownTable('Top links', topLinks, o.clicks)}
      ${breakdownTable('Medium', o.byMedium, o.clicks)}
      ${breakdownTable('Country', countries, o.clicks)}
    </div>
  `;
}

// --- Link list -----------------------------------------------------------

// One <tr> per link. On phones the stylesheet turns each row into a stacked
// card: data-label cells get an inline caption, and the actions become
// full-width buttons — no markup difference between desktop and mobile.
function linkRow(l: LinkWithCounts, origin: string): Html {
  const short = `${origin}/${l.slug}`;
  return html`<tr>
    <td>
      <a href="/admin/links/${l.slug}"><strong>/${l.slug}</strong></a>
      <span class="tools"><button class="linkish mut" data-copy="${short}" aria-label="Copy short link" title="Copy short link">copy</button><a class="linkish mut" href="/admin/links/${l.slug}/qr.svg" target="_blank" aria-label="QR code" title="QR code">qr</a></span>
    </td>
    <td><a class="target" href="${l.target_url}" rel="noreferrer" target="_blank">${l.target_url}</a>
      ${l.notes ? html`<div class="mut">${l.notes}</div>` : ''}</td>
    <td class="num" data-label="clicks"><a href="/admin/links/${l.slug}">${l.clicks}</a></td>
    <td class="mut" data-label="last click">${fmtTs(l.last_click)}</td>
    <td class="status">${l.is_active ? html`<span class="pill">active</span>` : html`<span class="pill off">paused</span>`}</td>
    <td class="act">
      <div class="actions">
        <form method="post" action="/api/links/${l.slug}/toggle">
          <button class="linkish">${l.is_active ? 'pause' : 'resume'}</button>
        </form>
        <form method="post" action="/api/links/${l.slug}/delete" data-confirm="Delete /${l.slug} and all its click data?">
          <button class="linkish danger">delete</button>
        </form>
      </div>
    </td>
  </tr>`;
}

const LIST_JS = `
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const url = b.dataset.copy;
  const flash = (msg) => { const t = b.textContent; b.textContent = msg; setTimeout(() => { b.textContent = t; }, 1200); };
  // prompt() pre-selects its text everywhere, so a long-press copy still works
  // where the async clipboard is unavailable (in-app webviews, plain http).
  const fallback = () => { window.prompt('Copy this link:', url); };
  if (!navigator.clipboard) return fallback();
  navigator.clipboard.writeText(url).then(() => flash('copied!'), fallback);
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-confirm]');
  if (f && !confirm(f.dataset.confirm)) e.preventDefault();
});
`;

admin.get('/', async (c) => {
  const range: 7 | 30 = c.req.query('range') === '30' ? 30 : 7;
  const [links, ov] = await Promise.all([listLinks(c.env.DB), overviewFor(c.env.DB, range)]);
  const origin = new URL(c.req.url).origin;
  const created = c.req.query('created');
  const error = c.req.query('error');
  const paused = c.req.query('paused');
  const resumed = c.req.query('resumed');

  const body = html`
    ${created ? html`<p class="flash ok">Created <strong>${origin}/${created}</strong></p>` : ''}
    ${error ? html`<p class="flash err">${error}</p>` : ''}
    ${
      paused
        ? html`<p class="flash ok">Paused <strong>/${paused}</strong> — visitors get a 404 until you resume it.
            <form method="post" action="/api/links/${paused}/toggle"><button class="linkish">undo</button></form></p>`
        : ''
    }
    ${
      resumed
        ? html`<p class="flash ok">Resumed <strong>/${resumed}</strong>.
            <form method="post" action="/api/links/${resumed}/toggle"><button class="linkish">undo</button></form></p>`
        : ''
    }
    ${links.length ? overviewSection(ov) : ''}
    <div class="card">
      <h2>New link</h2>
      <form class="create" method="post" action="/api/links">
        <div>
          <label for="f-url">Target URL</label>
          <input id="f-url" type="url" name="url" placeholder="https://example.com/page" required />
        </div>
        <div>
          <label for="f-slug">Slug <span class="mut">(optional)</span></label>
          <input id="f-slug" type="text" name="slug" placeholder="random" pattern="[A-Za-z0-9_-]{1,64}"
            autocapitalize="none" autocorrect="off" spellcheck="false" />
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
              <thead><tr><th>Slug</th><th>Target</th><th class="num">Clicks</th><th>Last click</th><th></th><th></th></tr></thead>
              <tbody>${links.map((l) => linkRow(l, origin))}</tbody>
            </table>`
      }
    </div>
    <script>${raw(LIST_JS)}</script>
  `;
  return c.html(page('Links · t.string.sg', shell(c, body)));
});

// --- QR code -------------------------------------------------------------

// Encodes the short link (from the request origin) as an SVG. `?dl=1` downloads.
admin.get('/links/:slug/qr.svg', async (c) => {
  const slug = c.req.param('slug');
  const link = await getLink(c.env.DB, slug);
  if (!link) return c.notFound();
  const origin = new URL(c.req.url).origin;
  const svg = qrSvg(`${origin}/${link.slug}`);
  c.header('Content-Type', 'image/svg+xml; charset=utf-8');
  c.header('Cache-Control', 'no-store');
  if (c.req.query('dl') === '1') {
    c.header('Content-Disposition', `attachment; filename="${link.slug}.svg"`);
  }
  return c.body(svg);
});

// --- Per-link stats --------------------------------------------------------

// Two small behaviours, both progressive enhancements:
// 1. QR export. The PNG is rasterized once on load so a tap can hand it to the
//    OS share sheet synchronously (share/clipboard are gated on the tap's
//    activation window on iOS). Phones get Save Image / AirDrop / Messages;
//    desktop keeps the download. Any failure falls back to the server SVG.
// 2. Chart readout. Hover tooltips don't exist on touch, so tapping/scrubbing
//    the chart snaps to the nearest bar and writes its value into the readout.
const STATS_JS = `
(() => {
  const btn = document.getElementById('qr-png');
  const svg = document.querySelector('#qr svg');
  if (!btn || !svg) return;
  const slug = btn.dataset.slug;
  const fallback = () => { window.location.href = '/admin/links/' + slug + '/qr.svg?dl=1'; };
  const coarse = matchMedia('(pointer: coarse)').matches;
  const canShareFiles = coarse && !!navigator.canShare &&
    navigator.canShare({ files: [new File([''], 'qr.png', { type: 'image/png' })] });
  let png = null;

  const download = (file) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
  const act = (file) => {
    if (!file) return fallback();
    if (canShareFiles) {
      navigator.share({ files: [file], title: slug })
        .catch((e) => { if (!e || e.name !== 'AbortError') download(file); });
    } else download(file);
  };
  const rasterize = (done) => {
    try {
      const clone = svg.cloneNode(true);
      const S = 1024;
      clone.setAttribute('width', S); clone.setAttribute('height', S);
      const xml = new XMLSerializer().serializeToString(clone);
      const img = new Image();
      img.onerror = () => done(null);
      img.onload = () => {
        try {
          const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
          const ctx = cv.getContext('2d');
          if (!ctx) return done(null);
          ctx.imageSmoothingEnabled = false;
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S);
          ctx.drawImage(img, 0, 0, S, S);
          cv.toBlob((blob) => done(blob ? new File([blob], slug + '.png', { type: 'image/png' }) : null), 'image/png');
        } catch (err) { done(null); }
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
    } catch (err) { done(null); }
  };
  rasterize((f) => { png = f; });
  if (canShareFiles) btn.textContent = 'Share';
  btn.addEventListener('click', () => { png ? act(png) : rasterize(act); });
})();

(() => {
  const svg = document.querySelector('.chart svg');
  const out = svg && svg.parentElement.querySelector('.chart-readout');
  if (!svg || !out) return;
  const slots = svg.querySelectorAll('.slot');
  if (!slots.length) return;
  const padL = +svg.dataset.padL, slotW = +svg.dataset.plotW / slots.length;
  let cur = svg.querySelector('.slot.sel');
  const pick = (e) => {
    const r = svg.getBoundingClientRect();
    const x = (e.clientX - r.left) * ${CHART_W} / r.width;
    const i = Math.max(0, Math.min(slots.length - 1, Math.floor((x - padL) / slotW)));
    const s = slots[i];
    if (s === cur) return;
    if (cur) cur.classList.remove('sel');
    s.classList.add('sel'); cur = s;
    const n = +s.dataset.n;
    out.textContent = s.dataset.l + ': ' + n + (n === 1 ? ' click' : ' clicks');
  };
  svg.addEventListener('pointerdown', pick);
  svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') pick(e); });
})();
`;

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

  const shortUrl = `${origin}/${link.slug}`;

  const body = html`
    <p><a href="/admin">← all links</a></p>
    <div class="split">
      <div class="card">
        <h2 style="font-size:18px">${shortUrl}
          ${link.is_active ? '' : html` <span class="pill off">paused</span>`}</h2>
        <div class="mut">→ <a href="${link.target_url}" rel="noreferrer" target="_blank">${link.target_url}</a></div>
        ${link.notes ? html`<div class="mut">${link.notes}</div>` : ''}
        <div class="mut">created ${fmtTs(link.created_at)}</div>
      </div>
      <div class="card qr-card">
        <h3>QR code</h3>
        <div class="qr" id="qr">${raw(qrSvg(shortUrl, { standalone: false }))}</div>
        <div class="qr-actions">
          <a class="btn" href="/admin/links/${link.slug}/qr.svg?dl=1">SVG</a>
          <button class="btn" id="qr-png" data-slug="${link.slug}">PNG</button>
        </div>
      </div>
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
    <script>${raw(STATS_JS)}</script>
  `;
  return c.html(page(`/${link.slug} · t.string.sg`, shell(c, body)));
});
