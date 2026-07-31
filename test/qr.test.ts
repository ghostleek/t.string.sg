import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { type Ecc, qrModules, qrSvg } from '../src/qr';

// Render the matrix to an RGBA bitmap (dark-on-white, scaled up) so a real QR
// decoder can read it back — the definitive "does it scan?" check.
function rasterize(text: string, ecc: Ecc, margin = 4, scale = 8) {
  const { size, dark } = qrModules(text, ecc);
  const dim = size + margin * 2;
  const px = dim * scale;
  const data = new Uint8ClampedArray(px * px * 4).fill(255);
  for (let r = 0; r < size; r++) {
    const row = dark[r]!;
    for (let c = 0; c < size; c++) {
      if (!row[c]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const y = (r + margin) * scale + dy;
          const x = (c + margin) * scale + dx;
          const i = (y * px + x) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        }
      }
    }
  }
  return { data, px };
}

function decode(text: string, ecc: Ecc): string | null {
  const { data, px } = rasterize(text, ecc);
  return jsQR(data, px, px)?.data ?? null;
}

describe('qr round-trip', () => {
  const urls = [
    'https://t.string.sg/abc123',
    'https://t.string.sg/hn',
    'https://t.string.sg/a-Long_slug-With-Mixed_Case-9',
    'http://localhost:8787/xY9',
  ];
  const eccs: Ecc[] = ['L', 'M', 'Q', 'H'];

  for (const url of urls) {
    for (const ecc of eccs) {
      it(`decodes ${url} @ ${ecc}`, () => {
        expect(decode(url, ecc)).toBe(url);
      });
    }
  }
});

describe('qrSvg output', () => {
  it('is deterministic', () => {
    expect(qrSvg('https://t.string.sg/abc')).toBe(qrSvg('https://t.string.sg/abc'));
  });

  it('includes a quiet zone in the viewBox', () => {
    const { size } = qrModules('https://t.string.sg/abc', 'M');
    const svg = qrSvg('https://t.string.sg/abc', { margin: 4 });
    expect(svg).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`);
  });

  it('is dark-on-light regardless of theme', () => {
    const svg = qrSvg('https://t.string.sg/abc');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
  });

  it('omits xmlns when embedded inline, includes it standalone', () => {
    expect(qrSvg('x', { standalone: false })).not.toContain('xmlns');
    expect(qrSvg('x', { standalone: true })).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
});
