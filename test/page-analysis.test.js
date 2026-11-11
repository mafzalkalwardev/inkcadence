'use strict';
/* Page analysis. Two pages by the same writer must agree within:
   slant ±0.08 and the same sign when |slant| > 0.05;
   x-height, letter gap, word gap and line spacing within 25%;
   baseline wobble within 0.2 × x-height.
   Gaps are also compared as a fraction of x-height, so a different photo size still agrees. */

const path = require('path');
const { Worker } = require('worker_threads');
const { installDocument, loadLib } = require('./load-lib');

let createCanvas;
try {
  ({ createCanvas } = require('canvas'));
} catch (e) {
  console.error('-- page analysis: canvas is required --');
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

const SLANT = 0.22;

function stroke(ctx, x, y, h, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + SLANT * h, y);
  ctx.stroke();
}

function drawWriter(ctx, shift, lines) {
  ctx.fillStyle = '#ffe566';
  ctx.fillRect(60, 250, 420, 16);
  ctx.strokeStyle = '#9a97a3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(90, 620);
  ctx.lineTo(240, 650);
  ctx.stroke();

  let x = 70;
  for (let i = 0; i < 8; i++) {
    stroke(ctx, x, 70, 52, 14, '#d4253a');
    x += 22;
  }
  ctx.strokeStyle = '#d4253a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(70, 136);
  ctx.lineTo(x - 8, 136);
  ctx.stroke();

  for (let li = 0; li < lines; li++) {
    const y = 220 + li * 78;
    let bx = 70 + shift;
    for (let w = 0; w < 4; w++) {
      for (let k = 0; k < 4; k++) {
        const ascender = k === 0 && w === 0;
        stroke(ctx, bx, ascender ? y : y + 10, ascender ? 28 : 18, 3, '#1a2744');
        bx += 11;
      }
      bx += 34;
    }
  }
}

function drawPage(opts) {
  const W = 780, H = 1040;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f7f1e4';
  ctx.fillRect(0, 0, W, H);
  if (opts.ruled !== false) {
    ctx.fillStyle = '#9eb4d2';
    for (let y = 180; y < H - 40; y += 36) ctx.fillRect(40, y, W - 80, 2);
  }
  drawWriter(ctx, opts.shift || 0, opts.lines || 5);
  return c;
}

function drawOnDesk() {
  const c = createCanvas(980, 1280);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(0, 0, 980, 1280);
  ctx.beginPath();
  ctx.moveTo(130, 90);
  ctx.lineTo(860, 48);
  ctx.lineTo(910, 1200);
  ctx.lineTo(70, 1235);
  ctx.closePath();
  ctx.fillStyle = '#f7f1e4';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.translate(180, 170);
  drawWriter(ctx, 0, 4);
  ctx.restore();
  return c;
}

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function analyzeInWorker(canvas) {
  const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'analysis-worker.js'));
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('analysis worker timed out'));
    }, 20000);
    worker.once('message', (msg) => {
      clearTimeout(timer);
      worker.terminate();
      if (!msg || !msg.ok) reject(new Error((msg && msg.error) || 'worker failed'));
      else resolve(msg.result);
    });
    worker.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    worker.postMessage({
      width: canvas.width,
      height: canvas.height,
      buffer: image.data.buffer,
    }, [image.data.buffer]);
  });
}

async function main() {
  console.log('\n-- page analysis: pens, headings, style, worker --');
  installDocument(() => createCanvas(1, 1));
  const Imaging = await loadLib('imaging', 'Imaging');

  const pageA = drawPage({ shift: 0, lines: 5, ruled: true });
  const pageB = drawPage({ shift: 28, lines: 6, ruled: true });
  const plain = drawPage({ shift: 0, lines: 5, ruled: false });
  const a = Imaging.analyze(pageA);
  const b = Imaging.analyze(pageB);
  const plainA = Imaging.analyze(plain);

  console.log('  info pens', JSON.stringify(a.pens));
  console.log('  info heading', JSON.stringify(a.heading));
  console.log('  info style', JSON.stringify(a.style));
  console.log('  info paper', a.paperStyle, 'slant', a.slant, b.slant);

  check('ruled page is ruled', a.paperStyle === 'ruled', a.paperStyle);
  check('plain page is plain', plainA.paperStyle === 'plain', plainA.paperStyle);
  check('two pens', a.pens.length === 2, JSON.stringify(a.pens));
  const marker = a.pens.find((p) => p.kind === 'marker');
  const body = a.pens.find((p) => p.kind === 'pen' && p.role === 'body');
  check('marker pen is present', !!marker, JSON.stringify(a.pens));
  check('heading role is the marker', !!(marker && marker.role === 'heading'), JSON.stringify(a.pens));
  check('body pen is present', !!body, JSON.stringify(a.pens));
  check('marker colour is the red ink core', !!(marker && lum(marker.hex) > 80 && parseInt(marker.hex.slice(1, 3), 16) > 150), marker && marker.hex);
  check('show-through is not a pen', a.pens.every((p) => lum(p.hex) < 140), JSON.stringify(a.pens));
  check('heading treatment is recorded', !!(a.heading && a.heading.pen && a.heading.scale), JSON.stringify(a.heading));
  check('heading pen is the marker', !!(a.heading && marker && a.heading.pen === marker.hex), JSON.stringify(a.heading));
  check('heading scale is measured above body', !!(a.heading && a.heading.scale > 1.5), String(a.heading && a.heading.scale));
  check('heading is underlined', !!(a.heading && a.heading.underline));
  check('heading case is upper', !!(a.heading && a.heading.case === 'upper'), a.heading && a.heading.case);

  check('slant keeps its sign', a.slant > 0.05 && b.slant > 0.05, a.slant + ' / ' + b.slant);
  check('slant agrees within 0.08', Math.abs(a.slant - b.slant) <= 0.08, a.slant + ' vs ' + b.slant);
  function within(name, x, y, rel) {
    const diff = Math.abs(x - y);
    const limit = rel * Math.max(Math.abs(x), Math.abs(y), 0.001);
    check(name, diff <= limit, x + ' vs ' + y);
  }
  within('x-height within 25%', a.style.xHeight, b.style.xHeight, 0.25);
  within('letter gap within 25%', a.style.letterGapEm, b.style.letterGapEm, 0.25);
  within('word gap within 25%', a.style.wordGapEm, b.style.wordGapEm, 0.25);
  within('line spacing within 25%', a.style.lineSpacingEm, b.style.lineSpacingEm, 0.25);
  const wobbleLimit = 0.2 * Math.max(a.style.xHeight, b.style.xHeight);
  check('baseline wobble within 0.2 x-height', Math.abs(a.style.baselineWobble - b.style.baselineWobble) <= wobbleLimit,
    a.style.baselineWobble + ' vs ' + b.style.baselineWobble + ' limit ' + wobbleLimit.toFixed(2));

  const stats = Imaging.mergeAnalyses([a, b]);
  delete stats.thumbs;
  const hand = { pens: stats.pens, heading: stats.heading, style: stats.style, stats: stats };
  check('hand keeps pens and heading', hand.pens.length === 2 && hand.heading && hand.heading.scale > 1);
  check('hand stores no photo', !JSON.stringify(hand).includes('data:image'));

  const desk = Imaging.analyze(drawOnDesk());
  console.log('  info desk', desk.pageCorrected, desk.paper, JSON.stringify(desk.pens));
  check('desk photo is straightened', desk.pageCorrected === true);
  const deskMarker = desk.pens.find((p) => p.kind === 'marker');
  const deskBody = desk.pens.find((p) => p.role === 'body' && lum(p.hex) < 90);
  check('straightened desk page keeps the marker and the body pen', !!(deskMarker && deskBody), JSON.stringify(desk.pens));

  const fromWorker = await analyzeInWorker(drawPage({ shift: 0, lines: 5, ruled: true }));
  check('worker returns the analysis', !!(fromWorker && fromWorker.pens));
  check('worker finds two pens', fromWorker.pens.length === 2, JSON.stringify(fromWorker.pens));
  check('worker records the heading scale', !!(fromWorker.heading && fromWorker.heading.scale > 1.5));
  check('worker result has no photo', !fromWorker.thumb && !JSON.stringify(fromWorker).includes('data:image'));

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
