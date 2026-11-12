/* Practice stand-in for web/public/demo-hand.inkpack.
   The owner's consented hand replaces this file (issue #29). */
import fs from 'fs';
import path from 'path';
import { createCanvas } from 'canvas';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PackShare } = await import(pathToFileURL(path.join(root, 'web', 'src', 'lib', 'packshare.js')).href);

function font() {
  const candidates = [
    'Segoe Script',
    'Ink Free',
    'Segoe UI',
    'DejaVu Sans',
    'Liberation Sans',
    'sans-serif',
  ];
  const probe = createCanvas(20, 20).getContext('2d');
  for (const name of candidates) {
    probe.font = '40px "' + name + '"';
    if (probe.measureText('A').width > 8) return name;
  }
  return 'sans-serif';
}

function glyph(ch, family) {
  const c = createCanvas(96, 120);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#1a2744';
  ctx.font = '78px "' + family + '"';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(ch, 8, 92);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  let minX = c.width, minY = c.height, maxX = 0, maxY = 0, ink = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const a = img.data[(y * c.width + x) * 4 + 3];
      if (a < 20) continue;
      ink++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!ink) throw new Error('no ink for ' + ch);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const cut = createCanvas(w, h);
  cut.getContext('2d').drawImage(c, minX, minY, w, h, 0, 0, w, h);
  const baseline = 92;
  return {
    ch,
    url: cut.toDataURL('image/png'),
    w,
    h,
    by: Math.max(1, Math.min(h - 1, baseline - minY)),
    adv: w + 4,
    source: 'sheet',
    pen: '#1a2744',
  };
}

const family = font();
const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.';
const glyphs = chars.split('').map((ch) => glyph(ch, family));
const pack = {
  id: 'pk_demo',
  name: 'Demo hand',
  cellH: 78,
  cellW: 48,
  glyphs,
  missing: [],
  penColours: ['#1a2744'],
  paper: '#fdfcf7',
  slant: 0.08,
  strokeWidth: 2.4,
  stats: { pages: 0, slant: 0.08, strokeWidth: 2.4, thumbs: [] },
};
const text = PackShare.encodeShare(pack);
const out = path.join(root, 'web', 'public', 'demo-hand.inkpack');
fs.writeFileSync(out, text);
console.log('wrote', out, 'bytes', text.length, 'font', family);
