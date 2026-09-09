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

export function tickLabel(bucket: string, kind: 'day' | 'hour'): string {
  if (kind === 'hour') return bucket.slice(11); // "HH:00"
  const [, m, d] = bucket.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ''}`;
}

/** Chart geometry shared with the touch-scrub script in pages.ts. */
export const CHART_W = 720;

/**
 * Single-series bar chart, server-rendered SVG. One hue, no legend (the card
 * title names the series). Values are exposed three ways: an HTML readout
 * above the SVG (pre-filled with the latest bucket, updated by tap/scrub —
 * the only readout touch and assistive tech get), hover highlight, and a
 * native <title> tooltip as the no-JS fallback.
 */
export function barChart(points: { bucket: string; n: number }[], kind: 'day' | 'hour'): Html {
  const total = points.reduce((sum, p) => sum + p.n, 0);
  if (!points.length || total === 0) return html`<p class="empty">No clicks in this period.</p>`;

  const W = CHART_W;
  const H = 190;
  const padL = 48;
  const padR = 8;
  const padT = 14;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(1, ...points.map((p) => p.n));
  const slot = plotW / points.length;
  const barW = Math.max(2, Math.min(slot - 2, 40));
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

  const noun = (n: number) => (n === 1 ? 'click' : 'clicks');
  const last = points.length - 1;

  points.forEach((p, i) => {
    const x = padL + i * slot + (slot - barW) / 2;
    const h = (p.n / max) * plotH;
    const y = baseY - h;
    const r = Math.min(3, barW / 2, h);
    const bar =
      p.n === 0
        ? ''
        : `<path class="bar" d="M${x.toFixed(1)} ${baseY} v${(-(h - r)).toFixed(1)} q0 ${-r} ${r} ${-r} h${(barW - 2 * r).toFixed(1)} q${r} 0 ${r} ${r} v${(h - r).toFixed(1)} z"/>`;
    const label = esc(tickLabel(p.bucket, kind));
    parts.push(
      `<g class="slot${i === last ? ' sel' : ''}" data-l="${label}" data-n="${p.n}">${bar}<rect class="hit" x="${(padL + i * slot).toFixed(1)}" y="${padT}" width="${slot.toFixed(2)}" height="${plotH}"><title>${esc(p.bucket)}: ${p.n} ${noun(p.n)}</title></rect></g>`
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

  const lastPoint = points[last]!;
  return html`<div class="chart">
    <div class="chart-readout" aria-live="polite">${tickLabel(lastPoint.bucket, kind)}: ${lastPoint.n} ${noun(lastPoint.n)}</div>
    ${raw(
      `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Clicks over time" data-pad-l="${padL}" data-plot-w="${plotW}">${parts.join('')}</svg>`
    )}
  </div>`;
}

const BREAKDOWN_LABELS: Record<string, string> = {
  '': '(none)',
  direct: 'direct / unattributed',
};

export interface BreakdownItem extends BreakdownRow {
  href?: string;
}

/**
 * Table + percentage bars; value text wears ink, only the bar carries the hue.
 * Pass `total` when rows are a top-N subset so bars are the share of ALL
 * events rather than of the rows shown — and the share is printed, since
 * hover tooltips don't exist on touch.
 */
export function breakdownTable(title: string, rows: BreakdownItem[], total?: number): Html {
  const denom = total ?? rows.reduce((sum, r) => sum + r.n, 0);
  return html`<div class="card">
    <h3>${title}</h3>
    ${
      rows.length === 0 || denom === 0
        ? html`<p class="empty">No data.</p>`
        : html`<table class="bd">
            ${rows.map((r) => {
              const key = r.k ?? '';
              const label = Object.hasOwn(BREAKDOWN_LABELS, key) ? BREAKDOWN_LABELS[key]! : key || '(none)';
              const pct = (r.n / denom) * 100;
              return html`<tr>
                <td class="bd-k">${r.href ? html`<a href="${r.href}">${label}</a>` : label}</td>
                <td><div class="track"><div class="fill" style="width:${pct.toFixed(1)}%"></div></div></td>
                <td class="bd-n" title="${pct.toFixed(1)}%">${r.n}${
                  total !== undefined ? html` <span class="bd-pct">${Math.round(pct)}%</span>` : ''
                }</td>
              </tr>`;
            })}
          </table>`
    }
  </div>`;
}

/**
 * Compact sparkline for the overview tile: fixed CSS height, width stretches
 * (preserveAspectRatio="none", hence square bars — rounded corners would warp).
 * Same .slot/.bar/.hit hooks as barChart for hover + <title> tooltips. An
 * all-zero window intentionally renders a bare baseline.
 */
export function sparkBars(points: { bucket: string; n: number }[], ariaLabel: string): Html {
  const W = 100;
  const H = 36;
  const max = Math.max(1, ...points.map((p) => p.n));
  const slot = points.length ? W / points.length : W;
  const parts = points.map((p, i) => {
    const h = (p.n / max) * (H - 2);
    const noun = p.n === 1 ? 'click' : 'clicks';
    const bar =
      p.n === 0
        ? ''
        : `<rect class="bar" x="${(i * slot + slot * 0.15).toFixed(2)}" y="${(H - h).toFixed(2)}" width="${(slot * 0.7).toFixed(2)}" height="${h.toFixed(2)}"/>`;
    return `<g class="slot">${bar}<rect class="hit" x="${(i * slot).toFixed(2)}" y="0" width="${slot.toFixed(2)}" height="${H}"><title>${esc(p.bucket)}: ${p.n} ${noun}</title></rect></g>`;
  });
  return html`<div class="chart spark">${raw(
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(ariaLabel)}"><line class="base" x1="0" y1="${H}" x2="${W}" y2="${H}" vector-effect="non-scaling-stroke"/>${parts.join('')}</svg>`
  )}</div>`;
}
