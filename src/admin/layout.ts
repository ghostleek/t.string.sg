import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';

/** What hono's html`` actually returns; c.html() accepts either member. */
export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

// Colors follow the validated reference dataviz palette: single-series charts
// use --series (categorical slot 1); text always wears ink tokens.
const CSS = `
:root {
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
a:hover { text-decoration: underline; }
.wrap { max-width: 980px; margin: 0 auto; padding: 24px 16px 64px; }
header.top {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 24px; gap: 12px; flex-wrap: wrap;
}
header.top h1 { font-size: 20px; margin: 0; }
header.top h1 a { color: var(--ink); }
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
}
button, .btn {
  padding: 7px 14px; border: 1px solid var(--baseline); border-radius: 6px;
  background: var(--surface); color: var(--ink); font: inherit; cursor: pointer;
}
button.primary { background: var(--series); border-color: var(--series); color: #fff; }
button.linkish { border: none; background: none; color: var(--series-strong); padding: 0; }
button.danger { color: var(--danger); }
table.links { width: 100%; border-collapse: collapse; }
table.links th {
  text-align: left; font-size: 12px; color: var(--muted); font-weight: 500;
  padding: 6px 8px; border-bottom: 1px solid var(--grid);
}
table.links td { padding: 8px; border-bottom: 1px solid var(--grid); vertical-align: baseline; }
table.links tr:last-child td { border-bottom: none; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
th.num { text-align: right; }
.target { color: var(--ink-2); font-size: 13px; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom; }
.mut { color: var(--muted); font-size: 12px; }
.pill { font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--baseline); color: var(--ink-2); }
.pill.off { color: var(--danger); border-color: var(--danger); }
.flash { padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
.flash.ok { background: color-mix(in srgb, var(--good) 12%, var(--surface)); color: var(--good); }
.flash.err { background: color-mix(in srgb, var(--danger) 12%, var(--surface)); color: var(--danger); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-bottom: 16px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.tile .v { font-size: 28px; font-weight: 650; }
.tile .l { font-size: 12px; color: var(--ink-2); }
.controls { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; font-size: 13px; }
.controls .seg { display: inline-flex; border: 1px solid var(--baseline); border-radius: 6px; overflow: hidden; }
.controls .seg a { padding: 5px 12px; color: var(--ink-2); }
.controls .seg a.on { background: var(--series); color: #fff; font-weight: 600; }
.controls .seg a:hover { text-decoration: none; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
table.bd { width: 100%; border-collapse: collapse; font-size: 13px; }
table.bd td { padding: 4px 0; }
td.bd-k { width: 34%; overflow-wrap: anywhere; padding-right: 8px; }
td.bd-n { width: 3.5em; text-align: right; font-variant-numeric: tabular-nums; padding-left: 8px; }
.track { background: var(--grid); border-radius: 4px; height: 10px; overflow: hidden; }
.fill { background: var(--series); height: 100%; border-radius: 4px; min-width: 2px; }
.chart svg { width: 100%; height: auto; display: block; }
.chart .slot .bar { fill: var(--series); }
.chart .slot:hover .bar { fill: var(--series-strong); }
.chart .slot .hit { fill: transparent; }
.chart text { fill: var(--muted); font: 10px system-ui, sans-serif; }
.chart line.grid { stroke: var(--grid); stroke-width: 1; }
.chart line.base { stroke: var(--baseline); stroke-width: 1; }
.empty { color: var(--muted); text-align: center; padding: 24px 0; }
.login-wrap { max-width: 360px; margin: 15vh auto 0; padding: 0 16px; }
.actions { display: flex; gap: 12px; align-items: baseline; }
.actions form { display: inline; }
@media (max-width: 720px) { form.create { grid-template-columns: 1fr; } }
`;

export function page(title: string, body: Html): Html {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>${raw(CSS)}</style>
</head>
<body>${body}</body>
</html>`;
}
