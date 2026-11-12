'use strict';
/* A sheet with ten letters removed still renders those letters from the hand.
   Nothing falls back to a system font. A fill-in sheet replaces the generated ones. */

const { installDocument, loadLib } = require('./load-lib');

let createCanvas, Image;
try {
  ({ createCanvas, Image } = require('canvas'));
} catch (e) {
  console.error('-- generate: canvas is required --');
  console.error(e);
  process.exit(1);
}

const DROP = ['m', 'w', 'h', 'd', 'b', 'p', 'q', 'g', 'u', 'y'];
const TEXT = 'The mad brown cow jumped when the big dog quietly yawned';

let pass = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else {
    failures.push(name + (extra ? ' — ' + extra : ''));
    console.log('  FAIL ' + name + (extra ? ' — ' + extra : ''));
  }
}

function inkCount(canvas) {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0;
  for (let i = 0; i < data.length; i += 16) {
    if (data[i] < 170 && data[i + 2] < 190) n++;
  }
  return n;
}

async function sheetGlyphs(LetterSheet) {
  const glyphs = [];
  for (const page of LetterSheet.layoutFull()) {
    const sheet = createCanvas(1, 1);
    LetterSheet.draw(sheet, page);
    const ctx = sheet.getContext('2d');
    page.cells.forEach((cell, i) => {
      const box = LetterSheet.cellPixels(cell);
      LetterSheet.paintPracticeStroke(ctx, box.x, box.y, box.w, box.h, i + page.page * 80);
    });
    const read = LetterSheet.read(sheet);
    glyphs.push(...read.glyphs);
  }
  return glyphs;
}

async function main() {
  console.log('\n-- generate: missing letters from the hand --');
  global.Image = Image;
  installDocument(() => createCanvas(1, 1));
  const LetterSheet = await loadLib('lettersheet', 'LetterSheet');
  const Generate = await loadLib('generate', 'Generate');
  const Glyphs = await loadLib('glyphs', 'Glyphs');
  const Rendering = await loadLib('render', 'Rendering');

  const all = await sheetGlyphs(LetterSheet);
  check('the sheet produced letter glyphs', all.length > 40, String(all.length));
  const kept = all.filter((g) => !DROP.includes(g.ch));
  const donors = new Set(kept.map((g) => g.ch));
  check('the donors for those ten letters stayed on the sheet', ['n', 'v', 'l', 'c', 'a'].every((ch) => donors.has(ch)));

  const pack = {
    glyphs: kept.map((g) => Object.assign({}, g)),
    missing: DROP.slice(),
    penColours: ['#1b2a4a'],
    slant: 0.16,
    strokeWidth: 3.2,
    cellH: 92,
    paper: '#fdfcf7',
    paperStyle: 'ruled',
  };
  await Glyphs.hydrate(pack);
  const gap = Generate.ensure(pack);
  const made = DROP.filter((ch) => pack.glyphs.some((g) => g.ch === ch && g.source === 'generated'));
  console.log('  info generated', made.join(''), 'blocked', gap.blocked.join(''));
  check('the ten removed letters were generated', made.length === 10, made.join(''));
  check('generated letters carry the hand pen, stroke and slant',
    made.length === 10 && DROP.every((ch) => {
      const g = pack.glyphs.find((item) => item.ch === ch && item.source === 'generated');
      return g && g.pen === '#1b2a4a' && g.strokeWidth === 3.2 && g.slant === 0.16 && g.url.startsWith('data:image/png');
    }));

  await Glyphs.hydrate(pack);
  const pages = Rendering.renderPages({
    pack,
    text: TEXT,
    size: 34,
    jitter: 0.2,
    seed: 4,
    penColour: '#1b2a4a',
    paper: 'ruled',
    watermark: false,
  });
  const ink = inkCount(pages[0]);
  console.log('  info ink samples', ink);
  check('text with those letters renders from the hand', pages.length >= 1 && ink > 40, String(ink));
  check('the page did not need a system font for the removed letters',
    DROP.every((ch) => pack.glyphs.some((g) => g.ch === ch)));

  let blocked = null;
  try {
    Rendering.renderPages({
      pack: {
        glyphs: [{ ch: 'a', url: pack.glyphs.find((g) => g.ch === 'a').url, w: 20, h: 30, by: 24, adv: 22, _img: pack.glyphs.find((g) => g.ch === 'a')._img }],
        penColours: ['#1b2a4a'],
        slant: 0.1,
        strokeWidth: 3,
      },
      text: 'a?',
      size: 28,
      jitter: 0,
      seed: 1,
      watermark: false,
    });
  } catch (e) {
    blocked = e;
  }
  check('a character that cannot be generated blocks rendering and names it',
    blocked && blocked.missing && blocked.missing.includes('?') && /\?/.test(blocked.message),
    blocked && blocked.message);

  const standIn = {
    ch: 'm',
    url: pack.glyphs.find((g) => g.ch === 'n').url,
    w: 24,
    h: 30,
    by: 24,
    adv: 26,
    source: 'sheet',
  };
  Generate.replaceGenerated(pack, { glyphs: [standIn] });
  check('a fill-in sheet replaces the generated letter',
    !pack.glyphs.some((g) => g.ch === 'm' && g.source === 'generated')
    && pack.glyphs.some((g) => g.ch === 'm' && g.source === 'sheet'));

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
