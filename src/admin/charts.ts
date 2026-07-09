import { html, raw } from 'hono/html';
import type { BreakdownRow } from '../db';
import type { Html } from './layout';

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function tickLabel(bucket: string, kind: 'day' | 'hour'): string {
  if (kind === 'hour') return bucket.slice(11); // "HH:00"
  const [, m, d] = bucket.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ''}`;
}

/**
 * Single-series bar chart, server-rendered SVG. One hue, no legend (the card
 * title names the series); hover highlight + native tooltip via full-height
 * hit rects so short bars are still hoverable.
 */
export function barChart(points: { bucket: string; n: number }[], kind: 'day' | 'hour'): Html {
  const total = points.reduce((sum, p) => sum + p.n, 0);
  if (!points.length || total === 0) return html`<p class="empty">No clicks in this period.</p>`;

  const W = 720;
  const H = 190;
  const padL = 34;
  const padR = 8;
  const padT = 14;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(1, ...points.map((p) => p.n));
  const slot = plotW / points.length;
  const barW = Math.max(1, Math.min(slot - 2, 40));
  const baseY = padT + plotH;

  const parts: string[] = [];

  // Recessive chrome: hairlines at max and half-max, solid baseline.
  for (const frac of [1, 0.5]) {
    const y = padT + plotH * (1 - frac);
    const v = Math.round(max * frac);
    parts.push(`<line class="grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>`);
    parts.push(`<text x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${v}</text>`);
  }
  parts.push(`<line class="base" x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}"/>`);

  points.forEach((p, i) => {
    const x = padL + i * slot + (slot - barW) / 2;
    const h = (p.n / max) * plotH;
    const y = baseY - h;
    const r = Math.min(3, barW / 2, h);
    const noun = p.n === 1 ? 'click' : 'clicks';
    const bar =
      p.n === 0
        ? ''
        : `<path class="bar" d="M${x.toFixed(1)} ${baseY} v${(-(h - r)).toFixed(1)} q0 ${-r} ${r} ${-r} h${(barW - 2 * r).toFixed(1)} q${r} 0 ${r} ${r} v${(h - r).toFixed(1)} z"/>`;
    parts.push(
      `<g class="slot">${bar}<rect class="hit" x="${(padL + i * slot).toFixed(1)}" y="${padT}" width="${slot.toFixed(2)}" height="${plotH}"><title>${esc(p.bucket)}: ${p.n} ${noun}</title></rect></g>`
    );
  });

  // Sparse x ticks: first, middle, last — never one per bar.
  const tickIdx = points.length > 2 ? [0, Math.floor(points.length / 2), points.length - 1] : [0, points.length - 1];
  for (const i of new Set(tickIdx)) {
    const p = points[i]!;
    const cx = padL + i * slot + slot / 2;
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
    const tx = i === 0 ? padL : i === points.length - 1 ? W - padR : cx;
    parts.push(`<text x="${tx.toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${esc(tickLabel(p.bucket, kind))}</text>`);
  }

  return html`<div class="chart">${raw(
    `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Clicks over time">${parts.join('')}</svg>`
  )}</div>`;
}

const BREAKDOWN_LABELS: Record<string, string> = {
  '': '(none)',
  direct: 'direct / unattributed',
};

/** Table + percentage bars; value text wears ink, only the bar carries the hue. */
export function breakdownTable(title: string, rows: BreakdownRow[]): Html {
  const total = rows.reduce((sum, r) => sum + r.n, 0);
  return html`<div class="card">
    <h3>${title}</h3>
    ${
      total === 0
        ? html`<p class="empty">No data.</p>`
        : html`<table class="bd">
            ${rows.map((r) => {
              const key = r.k ?? '';
              const label = BREAKDOWN_LABELS[key] ?? (key || '(none)');
              const pct = (r.n / total) * 100;
              return html`<tr>
                <td class="bd-k">${label}</td>
                <td><div class="track"><div class="fill" style="width:${pct.toFixed(1)}%"></div></div></td>
                <td class="bd-n" title="${pct.toFixed(1)}%">${r.n}</td>
              </tr>`;
            })}
          </table>`
    }
  </div>`;
}
