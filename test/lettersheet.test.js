'use strict';
/* Letter sheet v2: corner marks, perspective, and cell extraction.
   Run with: npm test */

const { createCanvas } = require('canvas');
const { installDocument, loadLib } = require('./load-lib');

installDocument(() => createCanvas(1, 1));

let pass = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { failures.push(name + (extra ? ' — ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

function phonePhoto(page, paintWarp) {
  const w = page.width, h = page.height;
  const pad = Math.round(Math.max(w, h) * 0.28);
  const pw = w + pad * 2, ph = h + pad * 2;
  const ang = 12 * Math.PI / 180;
  const key = 0.1;
  const src = [
    { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h },
  ];
  const dest = src.map((p, i) => {
    let X = p.x - w / 2, Y = p.y - h / 2;
    if (i < 2) X *= (1 - key);
    const xr = X * Math.cos(ang) - Y * Math.sin(ang);
    const yr = X * Math.sin(ang) + Y * Math.cos(ang);
    return { x: xr + pw / 2, y: yr + ph / 2 };
  });
  const photo = createCanvas(pw, ph);
  const ctx = photo.getContext('2d');
  ctx.fillStyle = '#efeae0';
  ctx.fillRect(0, 0, pw, ph);
  paintWarp(photo, page, src, dest);
  const g = ctx.createLinearGradient(0, 0, pw, ph);
  g.addColorStop(0, 'rgba(0,0,0,0.30)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.04)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, pw, ph);
  return photo;
}

function expectedInk(LetterSheet, cell, seed) {
  const box = LetterSheet.cellPixels(cell);
  const c = createCanvas(Math.ceil(box.w), Math.ceil(box.h));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  LetterSheet.paintPracticeStroke(ctx, 0, 0, box.w, box.h, seed);
  return LetterSheet.measureInk(c, { x: 0, y: 0, w: box.w, h: box.h });
}

async function main() {
  const LetterSheet = await loadLib('lettersheet', 'LetterSheet');
  const pages = LetterSheet.layoutFull();
  check('full sheet is two pages', pages.length === 2);
  const counts = {};
  pages.forEach((page) => {
    page.cells.forEach((cell) => { counts[cell.ch] = (counts[cell.ch] || 0) + 1; });
  });
  const lowerOk = LetterSheet.LOWER.split('').every((ch) => counts[ch] === 3);
  const digitOk = LetterSheet.DIGITS.split('').every((ch) => counts[ch] === 3);
  const upperOk = LetterSheet.UPPER.split('').every((ch) => counts[ch] === 1);
  const symbolOk = LetterSheet.SYMBOLS.split('').every((ch) => counts[ch] === 1);
  check('three boxes for each lowercase letter and digit', lowerOk && digitOk);
  check('one box for each uppercase letter and symbol', upperOk && symbolOk, 'symbols ' + LetterSheet.SYMBOLS.length);
  check('symbol set matches the sheet spec', LetterSheet.SYMBOLS === '.,;:!?\'"-()/&@#%' && LetterSheet.SYMBOLS.length === 16);

  const inside = pages.every((page) => page.cells.every((cell) => {
    return cell.x > 22 && cell.y > 30 && cell.x + cell.w < 190 && cell.y + cell.h < 276;
  }));
  check('boxes sit inside the corner marks', inside);

  console.log('-- Phone photo of a filled sheet, 12° and a shadow --');
  let filled = 0, matched = 0, emptyOk = 0, emptyN = 0;
  for (const page of pages) {
    const sheet = createCanvas(1, 1);
    LetterSheet.draw(sheet, page);
    const expect = new Map();
    const ctx = sheet.getContext('2d');
    page.cells.forEach((cell, i) => {
      if (i % 5 === 4) return;
      const box = LetterSheet.cellPixels(cell);
      LetterSheet.paintPracticeStroke(ctx, box.x, box.y, box.w, box.h, i + page.page * 100);
      expect.set(cell.ch + '#' + cell.variant, expectedInk(LetterSheet, cell, i + page.page * 100));
    });
    const photo = phonePhoto(sheet, LetterSheet.paintWarp);
    const read = LetterSheet.read(photo);
    check('page ' + (page.page + 1) + ' kind is the full sheet', read.kind === 'full' && read.page === page.page);
    page.cells.forEach((cell, i) => {
      const key = cell.ch + '#' + cell.variant;
      const glyph = read.glyphs.find((g) => g.ch === cell.ch && g.variant === cell.variant);
      if (i % 5 === 4) {
        emptyN++;
        if (!glyph && read.missing.includes(cell.ch)) emptyOk++;
        return;
      }
      filled++;
      const want = expect.get(key);
      if (!glyph || !want || !glyph.url.startsWith('data:image/png') || !glyph.ink || glyph.baseline == null || glyph.advance == null) return;
      const dx = Math.abs(glyph.cx - want.x);
      const dy = Math.abs(glyph.cy - want.y);
      if (dx < 0.14 && dy < 0.14 && glyph.source === 'sheet') matched++;
    });
  }
  const rate = filled ? matched / filled : 0;
  console.log('  info filled ' + matched + '/' + filled + ' (' + (rate * 100).toFixed(1) + '%) empty ' + emptyOk + '/' + emptyN);
  check('at least 95% of filled boxes extract to the right character', rate >= 0.95, (rate * 100).toFixed(1) + '%');
  check('empty boxes are recorded as missing', emptyOk === emptyN, emptyOk + '/' + emptyN);

  console.log('-- Fill-in sheet --');
  const wanted = ['q', 'Z', '7', '%'];
  const fill = LetterSheet.layoutFillIn(wanted);
  check('fill-in keeps only the requested characters', fill.length === 1 && fill[0].cells.map((c) => c.ch).join('') === wanted.join(''));
  const fillCanvas = createCanvas(1, 1);
  LetterSheet.draw(fillCanvas, fill[0]);
  fill[0].cells.forEach((cell, i) => {
    const box = LetterSheet.cellPixels(cell);
    LetterSheet.paintPracticeStroke(fillCanvas.getContext('2d'), box.x, box.y, box.w, box.h, 40 + i);
  });
  const fillRead = LetterSheet.read(phonePhoto(fillCanvas, LetterSheet.paintWarp), { chars: wanted });
  check('fill-in photo reads those characters', wanted.every((ch) => fillRead.glyphs.some((g) => g.ch === ch)) && fillRead.kind === 'fill-in');

  const pdf = LetterSheet.pdfFromJpegs([{ width: 4, height: 4, jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }]);
  const head = String.fromCharCode(...pdf.slice(0, 8));
  check('pdf download starts with a PDF header', head === '%PDF-1.4');

  console.log('\n' + '='.repeat(52));
  console.log('  passed: ' + pass + '   failed: ' + failures.length);
  if (failures.length) { failures.forEach((f) => console.log('   - ' + f)); process.exit(1); }
  console.log('  all green');
}

main().catch((err) => { console.error('HARNESS ERROR:', err); process.exit(2); });
