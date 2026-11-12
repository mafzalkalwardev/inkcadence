'use strict';
/* A photographed copy of the known lines is labelled by position.
   Spaces keep the same pitch as a letter, so a missing mark stays a gap. */

const fs = require('fs');
const path = require('path');
const { installDocument, loadLib } = require('./load-lib');

let createCanvas, registerFont;
try {
  ({ createCanvas, registerFont } = require('canvas'));
} catch (e) {
  console.error('-- copy lines: canvas is required --');
  console.error(e);
  process.exit(1);
}

const FONT_CANDIDATES = [
  'C:\\Windows\\Fonts\\Inkfree.ttf',
  'C:\\Windows\\Fonts\\segoesc.ttf',
  'C:\\Windows\\Fonts\\arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
];

let pass = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else {
    failures.push(name + (extra ? ' — ' + extra : ''));
    console.log('  FAIL ' + name + (extra ? ' — ' + extra : ''));
  }
}

function drawPage(lines, skip) {
  const advance = 48;
  const width = 100 + Math.max(...lines.map((line) => line.length)) * advance;
  const canvas = createCanvas(width, 110 + lines.length * 110);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f6f1e6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#241c16';
  ctx.strokeStyle = '#241c16';
  ctx.lineWidth = 2;
  ctx.font = '44px CopyFont';
  lines.forEach((line, row) => {
    const y = 90 + row * 110;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === ' ') continue;
      if (skip && skip.row === row && skip.ch === ch && skip.at === i) continue;
      const x = 50 + i * advance;
      ctx.strokeText(ch, x, y);
      ctx.fillText(ch, x, y);
    }
  });
  return canvas;
}

/* The list is numbered, and a scribble sits above the five lines. */
function drawNumbered(lines) {
  const advance = 48;
  const width = 220 + Math.max(...lines.map((line) => line.length)) * advance;
  const canvas = createCanvas(width, 160 + lines.length * 110);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f6f1e6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#241c16';
  ctx.strokeStyle = '#241c16';
  ctx.lineWidth = 2;
  ctx.font = '44px CopyFont';
  for (let s = 0; s < 4; s++) ctx.fillText('x', 40 + s * 36, 48);
  lines.forEach((line, row) => {
    const y = 140 + row * 110;
    ctx.fillText(String(row + 1), 24, y);
    ctx.fillText('.', 52, y);
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === ' ') continue;
      ctx.strokeText(ch, 150 + i * advance, y);
      ctx.fillText(ch, 150 + i * advance, y);
    }
  });
  return canvas;
}

function lowercaseRecall(lines, glyphs, skip) {
  const got = glyphs.map((g) => g.ch).filter((ch) => /[a-z]/.test(ch));
  let gi = 0;
  let correct = 0;
  let total = 0;
  lines.forEach((line, row) => {
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (!/[a-z]/.test(ch)) continue;
      if (skip && skip.row === row && skip.at === i) continue;
      total++;
      if (gi < got.length && got[gi] === ch) {
        correct++;
        gi++;
      }
    }
  });
  return { correct, total, precision: total ? correct / total : 0 };
}

async function main() {
  console.log('\n-- copy lines: known text, no printer --');
  const font = FONT_CANDIDATES.find((p) => fs.existsSync(p));
  if (!font) {
    console.error('no font for the copy-lines fixture');
    process.exit(1);
  }
  registerFont(font, { family: 'CopyFont' });
  installDocument(() => createCanvas(1, 1));
  const CopyLines = await loadLib('copylines', 'CopyLines');
  check('four to six lines', CopyLines.LINES.length >= 4 && CopyLines.LINES.length <= 6, String(CopyLines.LINES.length));
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const covered = new Set(CopyLines.LINES.join('').replace(/[^a-z]/g, ''));
  check('the lines contain every lowercase letter', alphabet.split('').every((ch) => covered.has(ch)));
  check('the lines contain the digits', '0123456789'.split('').every((ch) => CopyLines.LINES.join('').includes(ch)));

  const full = CopyLines.read(drawPage(CopyLines.LINES));
  const spot = lowercaseRecall(CopyLines.LINES, full.glyphs);
  console.log('  info lowercase', spot.correct + '/' + spot.total, spot.precision.toFixed(3), 'missing', full.missing.length);
  console.log('  info got', full.glyphs.map((g) => g.ch).join(''));
  check('at least 90% of lowercase letters are labelled correctly', spot.total >= 26 && spot.precision >= 0.9,
    spot.correct + '/' + spot.total);
  check('copied letters are stored like sheet letters', full.glyphs.length > 0 && full.glyphs.every((g) => g.source === 'sheet' && g.ch && g.url));

  const zAt = CopyLines.LINES[0].lastIndexOf('z');
  const dropped = CopyLines.read(drawPage(CopyLines.LINES, { row: 0, ch: 'z', at: zAt }));
  check('a letter the alignment could not place is missing', dropped.missing.includes('z'), dropped.missing.join(''));
  const rest = lowercaseRecall(CopyLines.LINES, dropped.glyphs, { row: 0, at: zAt });
  check('the other lowercase letters stay correct', rest.precision >= 0.9, rest.correct + '/' + rest.total);

  const numbered = CopyLines.read(drawNumbered(CopyLines.LINES));
  const numberedSpot = lowercaseRecall(CopyLines.LINES, numbered.glyphs);
  console.log('  info numbered', numberedSpot.correct + '/' + numberedSpot.total, numberedSpot.precision.toFixed(3));
  console.log('  info numbered got', numbered.glyphs.map((g) => g.ch).join(''));
  check('a line number and a scribble do not steal the lowercase letters', numberedSpot.precision >= 0.85,
    numberedSpot.correct + '/' + numberedSpot.total);
  check('the digits survive a numbered copy', '0123456789'.split('').every((ch) => numbered.glyphs.some((g) => g.ch === ch)));

  console.log('\n' + '='.repeat(52));
  console.log('  passed: ' + pass + '   failed: ' + failures.length);
  if (failures.length) {
    failures.forEach((f) => console.log('   - ' + f));
    process.exit(1);
  }
  console.log('  all green');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
