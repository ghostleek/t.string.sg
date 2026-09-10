import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';

/** What hono's html`` actually returns; c.html() accepts either member. */
export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

// Colors follow the validated reference dataviz palette: single-series charts
// use --series (categorical slot 1); text always wears ink tokens.
//
// Breakpoints: <=720px is the phone layout (links table -> stacked cards,
// larger chart text), <=560px stacks the stats-page QR card under the link
// info. `pointer: coarse` sizes touch-only controls; `hover: hover` guards
// hover-only affordances so they don't stick after a tap.
const CSS = `
:root {
  color-scheme: light dark;
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e;
  --muted: #898781; --grid: #e1e0d9; --baseline: #c3c2b7;
  --border: rgba(11,11,11,0.10);
  --series: #2a78d6; --series-strong: #256abf;
  --danger: #d03b3b; --good: #006300;
}
@media (prefers-color-scheme: dark) {
  :root {
    --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7;
    --muted: #898781; --grid: #2c2c2a; --baseline: #383835;
    --border: rgba(255,255,255,0.10);
    --series: #3987e5; --series-strong: #5598e7;
    --danger: #e66767; --good: #0ca30c;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--page); color: var(--ink);
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
}
a { color: var(--series-strong); text-decoration: none; }
@media (hover: hover) { a:hover { text-decoration: underline; } }
.wrap { max-width: 980px; margin: 0 auto; padding: 24px 16px 64px; }
header.top {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 24px; gap: 12px; flex-wrap: wrap;
}
header.top h1 { font-size: 20px; margin: 0; }
header.top h1 a { color: var(--ink); }
header.top button.linkish { padding: 11px 8px; margin: -11px -8px; }
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 16px; margin-bottom: 16px;
}
h2 { font-size: 15px; margin: 0 0 12px; }
h3 { font-size: 13px; margin: 0 0 8px; color: var(--ink-2); font-weight: 600; }
form.create { display: grid; gap: 8px; grid-template-columns: 1fr 160px 1fr auto; align-items: end; }
form.create label { display: block; font-size: 12px; color: var(--ink-2); margin-bottom: 2px; }
input[type=text], input[type=url], input[type=password] {
  width: 100%; padding: 7px 10px; border: 1px solid var(--baseline);
  border-radius: 6px; background: var(--page); color: var(--ink); font: inherit;
  font-size: 16px; min-height: 44px; /* 16px: iOS Safari zooms the page on focus below that */
}
button, .btn {
  padding: 7px 14px; border: 1px solid var(--baseline); border-radius: 6px;
  background: var(--surface); color: var(--ink); font: inherit; cursor: pointer;
}
button.primary { background: var(--series); border-color: var(--series); color: #fff; min-height: 44px; }
button.linkish { border: none; background: none; color: var(--series-strong); }
/* Text-style controls get a real hit box; the negative margin cancels the
   padding in layout so nothing moves. */
.linkish { padding: 8px 4px; margin: -8px -4px; }
button.danger { color: var(--danger); }
button, .btn, .linkish, .seg a { -webkit-tap-highlight-color: transparent; }
:is(button, .btn, .linkish, .seg a):active { opacity: .7; }
table.links { width: 100%; border-collapse: collapse; }
table.links th {
  text-align: left; font-size: 12px; color: var(--muted); font-weight: 500;
  padding: 6px 8px; border-bottom: 1px solid var(--grid);
}
table.links td { padding: 8px; border-bottom: 1px solid var(--grid); vertical-align: baseline; }
table.links tr:last-child td { border-bottom: none; }
table.links td:first-child { overflow-wrap: anywhere; min-width: 8em; }
.tools { white-space: nowrap; }
table.links td:first-child .linkish { margin-left: 8px; }
table.links td:nth-child(4) { min-width: 7em; }
@media (min-width: 900px) { table.links td:nth-child(4) { white-space: nowrap; } }
button[data-copy] { min-width: 4.5em; text-align: left; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
th.num { text-align: right; }
.target { color: var(--ink-2); font-size: 13px; max-width: min(320px, 20vw); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom; }
.mut { color: var(--muted); font-size: 12px; }
.pill { font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--baseline); color: var(--ink-2); }
.pill.off { color: var(--danger); border-color: var(--danger); }
.flash { padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; overflow-wrap: anywhere; }
.flash.ok { background: color-mix(in srgb, var(--good) 12%, var(--surface)); color: var(--good); }
.flash.err { background: color-mix(in srgb, var(--danger) 12%, var(--surface)); color: var(--danger); }
.flash form { display: inline; margin-left: 8px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr)); gap: 16px; margin-bottom: 16px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.tile .v { font-size: 28px; font-weight: 650; }
.tile .l { font-size: 12px; color: var(--ink-2); }
.controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; font-size: 13px; }
.controls .seg { display: inline-flex; border: 1px solid var(--baseline); border-radius: 6px; overflow: hidden; }
.controls .seg a { padding: 9px 14px; color: var(--ink-2); }
.controls .seg a.on { background: var(--series); color: #fff; font-weight: 600; }
.controls .seg a:hover { text-decoration: none; }
@media (pointer: coarse) { .controls .seg a { padding: 0 16px; line-height: 44px; } }
.grid2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 16px; }
table.bd { width: 100%; border-collapse: collapse; font-size: 13px; }
table.bd td { padding: 4px 0; }
td.bd-k { width: 34%; overflow-wrap: anywhere; padding-right: 8px; }
td.bd-n { width: 3.5em; text-align: right; font-variant-numeric: tabular-nums; padding-left: 8px; white-space: nowrap; }
.track { background: var(--grid); border-radius: 4px; height: 10px; overflow: hidden; }
.fill { background: var(--series); height: 100%; border-radius: 4px; min-width: 2px; }
.chart svg { width: 100%; height: auto; display: block; touch-action: pan-y; }
.chart .slot .bar { fill: var(--series); }
@media (hover: hover) { .chart .slot:hover .bar { fill: var(--series-strong); } }
.chart .slot.sel .bar { fill: var(--series-strong); }
.chart .slot .hit { fill: transparent; }
.chart text { fill: var(--muted); font: 10px system-ui, sans-serif; }
.chart line.grid { stroke: var(--grid); stroke-width: 1; }
.chart line.base { stroke: var(--baseline); stroke-width: 1; }
.chart-readout { min-height: 20px; margin-bottom: 4px; font-size: 13px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.chart.spark svg { height: 56px; }
.spark-ticks { display: flex; justify-content: space-between; font-size: 11px; margin-top: 2px; }
.ov-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.ov-head h2, .ov-head .controls { margin: 0; }
.ov-top { display: grid; gap: 16px; grid-template-columns: 1fr; margin-bottom: 16px; }
@media (min-width: 560px) { .ov-top { grid-template-columns: 200px 1fr; } }
.tile .d { font-size: 12px; color: var(--ink-2); margin-top: 4px; }
.tile .d.up { color: var(--good); }
.tile .d.down { color: var(--danger); }
.bd-pct { color: var(--muted); font-size: 11px; margin-left: 6px; }
.empty { color: var(--muted); text-align: center; padding: 24px 0; }
.split { display: flex; gap: 16px; align-items: stretch; flex-wrap: wrap; margin-bottom: 16px; }
.split > .card { margin-bottom: 0; min-width: 0; }
.split > .card:first-child { flex: 1; }
.split h2, .split .mut { overflow-wrap: anywhere; }
.qr-card { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.qr { background: #fff; padding: 10px; border-radius: 8px; line-height: 0; }
.qr svg { width: 148px; height: 148px; display: block; }
.qr-actions { display: flex; gap: 12px; }
.qr-actions .btn { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; font-size: 13px; text-decoration: none; }
.login-wrap { max-width: 360px; margin: 15vh auto 0; padding: 0 16px; }
.actions { display: flex; gap: 20px; align-items: baseline; }
.actions form { display: inline; }

/* ---- Phone layout ---------------------------------------------------- */
@media (max-width: 720px) {
  form.create { grid-template-columns: 1fr; }
  .chart text { font-size: 14px; }
  /* Links table -> one stacked card per link (same markup). */
  table.links, table.links tbody, table.links tr, table.links td { display: block; }
  table.links thead { display: none; }
  table.links tr { padding: 10px 0; border-bottom: 1px solid var(--grid); }
  table.links tr:last-child { border-bottom: none; }
  table.links td { padding: 0; border: 0; }
  table.links td[data-label], table.links td.status { display: inline-block; margin-right: 12px; text-align: left; }
  table.links td[data-label]::before { content: attr(data-label) " "; color: var(--muted); font-size: 12px; }
  .target { display: block; max-width: 100%; }
  td.act { margin-top: 8px; }
  table.links td:first-child .linkish { display: inline-block; padding: 8px 10px; margin: -8px 0 -8px 4px; }
  .actions { gap: 12px; }
  .actions form { display: block; flex: 1; }
  .actions form button {
    width: 100%; min-height: 44px; margin: 0; padding: 0 12px;
    border: 1px solid var(--baseline); border-radius: 6px; background: var(--surface);
  }
}
@media (max-width: 560px) {
  .split { flex-direction: column; }
  .qr svg { width: min(220px, 60vw); height: auto; }
}
@media (max-width: 480px) {
  .chart text { font-size: 22px; }
}
`;

export function page(title: string, body: Html): Html {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>${raw(CSS)}</style>
</head>
<body>${body}</body>
</html>`;
}
