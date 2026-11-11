'use strict';
/* CharCNN recognition quality — controlled glyphs + harvest labeling. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let createCanvas, Image;
try {
  ({ createCanvas, Image } = require('canvas'));
} catch (e) {
  console.log('\n-- charcnn: skipped (npm i canvas required) --');
  process.exit(0);
}

const PROJECT = path.join(__dirname, '..');
const WEIGHTS = path.join(PROJECT, 'assets', 'charcnn.json');
if (!fs.existsSync(WEIGHTS)) {
  console.log('\n-- charcnn: skipped (assets/charcnn.json missing — run train:charcnn) --');
  process.exit(0);
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

function loadEngines() {
  const sandbox = {
    console, Math, JSON, Array, Object, String, Number, Error,
    Uint8Array, Uint8ClampedArray, Uint32Array, Float32Array, Float64Array,
    Promise, Date, setTimeout, clearTimeout, Image,
    atob: global.atob.bind(global),
  };
  sandbox.window = sandbox;
  sandbox.document = {
    createElement(tag) {
      if (tag === 'canvas') return createCanvas(1, 1);
      return {};
    },
  };
  const raw = JSON.parse(fs.readFileSync(WEIGHTS, 'utf8'));
  sandbox.fetch = async function (url) {
    if (String(url).indexOf('charcnn') >= 0) return { ok: true, status: 200, json: async () => raw };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  vm.createContext(sandbox);
  for (const f of ['js/charcnn.js', 'js/harvest.js']) {
    vm.runInContext(fs.readFileSync(path.join(PROJECT, f), 'utf8'), sandbox);
  }
  return sandbox;
}

function renderHarvestGlyph(ch, font) {
  const c = createCanvas(56, 64);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 56, 64);
  ctx.fillStyle = '#fff';
  ctx.font = font || 'bold 42px Arial';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(ch, 28, 34);
  const img = ctx.getImageData(0, 0, 56, 64);
  for (let i = 0; i < img.data.length; i += 4) {
    const L = img.data[i];
    if (L > 12) {
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = L;
    } else {
      img.data[i + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

async function main() {
  console.log('\n-- charcnn: recognition quality --');
  const sb = loadEngines();
  await sb.CharCNN.load(['assets/charcnn.json']);
  check('CharCNN ready', sb.CharCNN.isReady());

  const upper = 'ABCDEFGHJKLMNPRSTUVWXYZ'; // skip I/O often confusable with 1/0 in fonts
  const lower = 'abcdefghjkmnprstuvwxyz';
  const digits = '23456789';

  function evalSet(name, chars, font, minHit, casefold) {
    let hit = 0;
    const misses = [];
    for (const ch of chars) {
      const g = renderHarvestGlyph(ch, font);
      const pred = sb.CharCNN.predictImage(g);
      const ok = casefold
        ? String(pred.ch).toLowerCase() === ch.toLowerCase()
        : pred.ch === ch;
      if (ok) hit++;
      else misses.push(ch + '=>' + pred.ch + '@' + (pred.conf || 0).toFixed(2));
    }
    const rate = hit / chars.length;
    check(name + ' >= ' + minHit, rate >= minHit, hit + '/' + chars.length + ' ' + misses.slice(0, 8).join(' '));
    return rate;
  }

  evalSet('Arial upper strict', upper, 'bold 42px Arial', 0.85, false);
  evalSet('Arial lower casefold', lower, 'bold 40px Arial', 0.80, true);
  evalSet('Arial digits strict', digits, 'bold 42px Arial', 0.75, false);
  evalSet('Arial mixed casefold', upper + lower, 'bold 40px Arial', 0.88, true);

  /* Q must not collapse to a */
  const q = sb.CharCNN.predictImage(renderHarvestGlyph('Q', 'bold 44px Arial'));
  check('Q not predicted as a/A', q.ch !== 'a' && q.ch !== 'A', 'got ' + q.ch + '@' + q.conf.toFixed(2));
  check('Q predicted as Q (or close conf)', q.ch === 'Q' || q.conf < 0.35, 'got ' + q.ch + '@' + q.conf.toFixed(2));

  /* labelCrops keeps diversity, not only M/W */
  const bag = [];
  for (const ch of (upper + lower).slice(0, 40)) {
    const c = renderHarvestGlyph(ch);
    bag.push({
      url: c.toDataURL('image/png'),
      w: c.width,
      h: c.height,
      confidence: 0.6,
    });
  }
  const labeled = await sb.CharCNN.labelCrops(bag, 2);
  const uniq = new Set(labeled.map((g) => g.ch));
  check('labelCrops diversity >= 20 unique', uniq.size >= 20, 'unique=' + uniq.size + ' n=' + labeled.length);
  check('labelCrops no FREQ fallback flag', labeled.every((g) => !g.freqFallback));

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
