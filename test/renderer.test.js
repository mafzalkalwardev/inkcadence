'use strict';
/* Renderer draws only the hand: heading pens, stable seeds, lined or plain paper. */

const { installDocument, loadLib } = require('./load-lib');

let createCanvas;
try {
  ({ createCanvas } = require('canvas'));
} catch (e) {
  console.error('-- renderer: canvas is required --');
  console.error(e);
  process.exit(1);
}

let pass = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else {
    failures.push(name + (extra ? ' — ' + extra : ''));
    console.log('  FAIL ' + name + (extra ? ' — ' + extra : ''));
  }
}

function glyph(ch, w, h) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#111';
  ctx.fillRect(3, 3, w - 6, h - 6);
  return { ch: ch, url: c.toDataURL('image/png'), w: w, h: h, by: Math.round(h * 0.82), adv: w + 2, _img: c };
}

function count(canvas, pred) {
  const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let n = 0;
  let ySum = 0;
  for (let y = 0; y < img.height; y += 2) {
    for (let x = 0; x < img.width; x += 2) {
      const p = (y * img.width + x) * 4;
      if (!pred(img.data[p], img.data[p + 1], img.data[p + 2], x, y)) continue;
      n++;
      ySum += y;
    }
  }
  return { n: n, y: n ? ySum / n : 0 };
}

async function main() {
  console.log('\n-- renderer: hand only, headings, seeds --');
  installDocument(() => createCanvas(1, 1));
  const Rendering = await loadLib('render', 'Rendering');

  const body = ['N', 'o', 't', 'e', 's', 'a'].map((ch) => glyph(ch, 28, 36));
  const pack = {
    cellH: 40,
    glyphs: body.concat([glyph('a', 22, 36), glyph('a', 34, 36)]),
    penColours: ['#1a2744'],
    slant: 0.12,
    strokeWidth: 3,
    style: { xHeight: 18, letterGap: 3, wordGap: 14, lineSpacing: 32, baselineWobble: 1.2 },
    heading: { pen: '#c0392b', scale: 1.7, underline: true, case: 'upper' },
    pens: [{ hex: '#1a2744', role: 'body', kind: 'pen' }, { hex: '#c0392b', role: 'heading', kind: 'marker' }],
  };
  const trace = [];
  const pages = Rendering.renderPages({
    pack: pack,
    text: '# Notes\na a a',
    size: 28,
    jitter: 0.35,
    seed: 5,
    penColour: '#1a2744',
    paper: 'plain',
    watermark: false,
    pageNumbers: false,
    trace: trace,
  });
  const red = count(pages[0], (r, g, b) => r > 140 && g < 90 && b < 90);
  const blue = count(pages[0], (r, g, b) => b > 70 && r < 70 && g < 80);
  console.log('  info heading red', red.n, 'at y', red.y.toFixed(0), 'body blue', blue.n, 'at y', blue.y.toFixed(0));
  check('a marker heading is drawn in the marker colour', red.n > 15 && blue.n > 15 && red.y < blue.y,
    red.n + ' red, ' + blue.n + ' blue');
  const under = trace.filter((box) => box.h <= 16 && box.w > 40);
  const heads = trace.filter((box) => box.y < (red.y || 400));
  const headBottom = heads.reduce((m, box) => Math.max(m, box.y + box.h), 0);
  check('the heading line sits below the heading letters', under.length > 0 && under[0].y + 4 >= headBottom - 20,
    under.length ? String(under[0].y) : 'none');
  check('the page draws no font text', !(pages[0]._fontWrites && pages[0]._fontWrites()));

  const again = Rendering.renderPages({
    pack: pack, text: 'a a a', size: 28, jitter: 0.55, seed: 5,
    penColour: '#1a2744', paper: 'plain', watermark: false,
  });
  const other = Rendering.renderPages({
    pack: pack, text: 'a a a', size: 28, jitter: 0.55, seed: 11,
    penColour: '#1a2744', paper: 'plain', watermark: false,
  });
  check('the same seed gives the same page', again[0].toBuffer().equals(Rendering.renderPages({
    pack: pack, text: 'a a a', size: 28, jitter: 0.55, seed: 5,
    penColour: '#1a2744', paper: 'plain', watermark: false,
  })[0].toBuffer()));
  check('a different seed gives a different page', !again[0].toBuffer().equals(other[0].toBuffer()));

  const ruled = Rendering.renderPages({
    pack: pack, text: 'a', size: 28, jitter: 0, seed: 1,
    penColour: '#1a2744', paper: 'ruled', watermark: false,
  })[0];
  const plain = Rendering.renderPages({
    pack: pack, text: 'a', size: 28, jitter: 0, seed: 1,
    penColour: '#1a2744', paper: 'plain', watermark: false,
  })[0];
  const grid = Rendering.renderPages({
    pack: pack, text: 'a', size: 28, jitter: 0, seed: 1,
    penColour: '#1a2744', paper: 'grid', watermark: false,
  })[0];
  const cool = (canvas) => count(canvas, (r, g, b) => b > r + 6 && b > 180 && r > 150).n;
  const ruledN = cool(ruled);
  const plainN = cool(plain);
  const gridN = cool(grid);
  console.log('  info paper', plainN, ruledN, gridN);
  check('lined and grid paper show rules, blank paper does not', plainN < ruledN && ruledN <= gridN,
    plainN + ' ' + ruledN + ' ' + gridN);

  const many = Rendering.renderPages({
    pack: pack,
    text: new Array(48).fill('a').join('\n'),
    size: 34,
    jitter: 0,
    seed: 2,
    penColour: '#1a2744',
    paper: 'plain',
    watermark: false,
  });
  check('long text continues onto another page', many.length >= 2, String(many.length));

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
