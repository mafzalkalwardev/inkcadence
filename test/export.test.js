'use strict';
/* PNG and PDF exports keep the AI-assisted note, and the footer can be turned off. */

const fs = require('fs');
const path = require('path');
const { installDocument, loadLib } = require('./load-lib');

let createCanvas;
try {
  ({ createCanvas } = require('canvas'));
} catch (e) {
  console.error('-- export: canvas is required --');
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

function glyph(ch) {
  const c = createCanvas(24, 32);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(4, 4, 16, 24);
  return { ch: ch, url: c.toDataURL('image/png'), w: 24, h: 32, by: 26, adv: 26, _img: c };
}

function darkInBand(canvas, y0) {
  const img = canvas.getContext('2d').getImageData(0, y0, canvas.width, canvas.height - y0);
  let n = 0;
  for (let i = 0; i < img.data.length; i += 16) {
    if (img.data[i] < 80 && img.data[i + 1] < 90 && img.data[i + 2] < 120) n++;
  }
  return n;
}

function unzip(bytes) {
  const files = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 0;
  while (i + 30 < bytes.length && bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) {
    const size = view.getUint32(i + 18, true);
    const nameLen = view.getUint16(i + 26, true);
    const extra = view.getUint16(i + 28, true);
    const name = Buffer.from(bytes.slice(i + 30, i + 30 + nameLen)).toString('utf8');
    const start = i + 30 + nameLen + extra;
    files.push({ name: name, data: bytes.slice(start, start + size) });
    i = start + size;
  }
  return files;
}

async function main() {
  console.log('\n-- export: provenance, A4, footer --');
  installDocument(() => createCanvas(1, 1));
  const PackShare = await loadLib('packshare', 'PackShare');
  const Rendering = await loadLib('render', 'Rendering');

  const letters = 'written with AI assistance'.replace(/ /g, '').split('');
  const unique = [...new Set(letters)];
  const pack = {
    cellH: 36,
    glyphs: unique.map(glyph),
    penColours: ['#1a2744'],
    slant: 0.08,
  };
  const opts = {
    pack: pack,
    text: 'a hint',
    size: 28,
    jitter: 0,
    seed: 4,
    penColour: '#1a2744',
    paper: 'plain',
    pageNumbers: false,
  };
  const on = Rendering.renderPages(opts);
  const off = Rendering.renderPages(Object.assign({}, opts, { watermark: false }));
  const footOn = darkInBand(on[0], on[0].height - 90);
  const footOff = darkInBand(off[0], off[0].height - 90);
  console.log('  info footer ink', footOn, footOff);
  check('the AI-assisted note is on by default', footOn > footOff + 8, footOn + ' vs ' + footOff);
  check('the note can be turned off', footOff < footOn);

  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'main.js'), 'utf8');
  check('the note checkbox starts checked', /id="wMark" checked/.test(mainJs));

  const png = PackShare.canvasToPng(on[0]);
  const text = PackShare.readPngText(png);
  check('PNG Software is Inkcadence', text.Software === 'Inkcadence', JSON.stringify(text));
  check('PNG Comment is the AI-assisted note', text.Comment === 'AI-assisted handwriting');
  check('PNG metadata stays when the footer is off', PackShare.readPngText(PackShare.canvasToPng(off[0])).Comment === 'AI-assisted handwriting');

  const zip = PackShare.zipStore([
    { name: 'notes_p1.png', bytes: png },
    { name: 'notes_p2.png', bytes: PackShare.canvasToPng(on[0]) },
  ]);
  check('several PNGs travel as one zip', zip[0] === 0x50 && zip[1] === 0x4b);
  const files = unzip(zip);
  check('the zip holds each page', files.length === 2 && files[0].name === 'notes_p1.png' && files[1].name === 'notes_p2.png');
  check('a page inside the zip still has the note', PackShare.readPngText(files[0].data).Comment === 'AI-assisted handwriting');

  const blank = createCanvas(1240, 1754);
  blank.getContext('2d').fillStyle = '#fdfcf7';
  blank.getContext('2d').fillRect(0, 0, 1240, 1754);
  const pdfBlob = await PackShare.pagesToPdfBlob([on[0], blank]);
  const pdf = new Uint8Array(await pdfBlob.arrayBuffer());
  const pdfText = Buffer.from(pdf).toString('latin1');
  check('PDF Producer is Inkcadence', pdfText.includes('/Producer (Inkcadence)'));
  check('PDF Subject is the AI-assisted note', pdfText.includes('/Subject (AI-assisted handwriting)'));
  const boxes = pdfText.match(/\/MediaBox \[0 0 595\.28 841\.89\]/g) || [];
  check('PDF pages are A4 portrait', boxes.length >= 2 && pdfText.includes('/Count 2'), 'boxes=' + boxes.length);
  const outDir = path.join(__dirname, 'fixtures', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'a4-export.pdf'), pdf);

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
