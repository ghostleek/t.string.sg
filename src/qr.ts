import qrcode from 'qrcode-generator';

export type Ecc = 'L' | 'M' | 'Q' | 'H';

export interface QrModules {
  size: number;
  /** dark[row][col] — true = a dark module. */
  dark: boolean[][];
}

/** Encode `text` into a QR module matrix (version auto-selected). */
export function qrModules(text: string, ecc: Ecc = 'M'): QrModules {
  const qr = qrcode(0, ecc);
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  const dark: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = new Array(size);
    for (let col = 0; col < size; col++) row[col] = qr.isDark(r, col);
    dark.push(row);
  }
  return { size, dark };
}

export interface QrSvgOptions {
  ecc?: Ecc;
  /** Quiet-zone width in modules. The spec requires >= 4 for reliable scanning. */
  margin?: number;
  /** Include the xmlns attribute so the SVG is valid as a standalone file. */
  standalone?: boolean;
  /** Accessible name. Defaults to "QR code for <text>" so screen readers get the destination. */
  label?: string;
}

function escapeAttr(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Render a QR code as an SVG string. Always dark-on-light regardless of page
 * theme — a theme-inverted QR does not scan, so the colors are not configurable.
 * One <path> holds every dark module.
 */
export function qrSvg(text: string, opts: QrSvgOptions = {}): string {
  const { ecc = 'M', margin = 4, standalone = true, label } = opts;
  const { size, dark: grid } = qrModules(text, ecc);
  const dim = size + margin * 2;

  let path = '';
  for (let r = 0; r < size; r++) {
    const row = grid[r]!;
    for (let c = 0; c < size; c++) {
      if (row[c]) path += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }

  const xmlns = standalone ? ' xmlns="http://www.w3.org/2000/svg"' : '';
  const aria = escapeAttr(label ?? `QR code for ${text}`);
  return (
    `<svg${xmlns} viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="${aria}">` +
    `<rect width="${dim}" height="${dim}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#000000"/>` +
    `</svg>`
  );
}
