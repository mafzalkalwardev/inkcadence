'use strict';
/* Harvest keeps single letters only, with no fixed crop cap.
   Spot-check: sample_page_1.jpg is the blue biology notes page.
   A label is right when it matches the known character in reading order. */

const path = require('path');
const fs = require('fs');
const { installDocument, loadLib } = require('./load-lib');

let createCanvas, loadImage, Image;
try {
  ({ createCanvas, loadImage, Image } = require('canvas'));
} catch (e) {
  console.error('-- harvest: canvas is required --');
  console.error(e);
  process.exit(1);
}

const FIX = path.join(__dirname, 'fixtures', 'samples');
const LINES = [
  'Biology notes - week 3',
  'The mitochondria produce ATP for the cell.',
  'Photosynthesis converts light into chemical energy.',
  'DNA stores genetic information in base pairs.',
  'Enzymes lower the activation energy of reactions.',
  'Osmosis is the diffusion of water across a membrane.',
  'I need to revise chapter four before Friday.',
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

function lettersOf(line) {
  return line.replace(/[^0-9A-Za-z]/g, '').split('');
}

function groupLines(crops) {
  const sorted = crops.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const heights = sorted.map((c) => c.h || 10).sort((a, b) => a - b);
  const medianH = heights.length ? heights[(heights.length * 0.5) | 0] : 12;
  const lines = [];
  sorted.forEach((crop) => {
    const last = lines[lines.length - 1];
    if (!last || crop.y - last.y > medianH * 0.55) lines.push({ y: crop.y, crops: [crop] });
    else last.crops.push(crop);
  });
  return lines
    .map((line) => line.crops.sort((a, b) => a.x - b.x))
    .filter((line) => line.length >= 3);
}

/* Each accepted label is aligned in order to the known line.
   Extra known letters can be skipped. A label that matches none is wrong. */
function matchCount(pred, truth) {
  const n = pred.length;
  const m = truth.length;
  const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const skipTruth = dp[i][j - 1];
      const skipPred = dp[i - 1][j];
      const take = dp[i - 1][j - 1] + (pred[i - 1] === truth[j - 1] ? 1 : 0);
      dp[i][j] = Math.max(skipTruth, skipPred, take);
    }
  }
  return dp[n][m];
}

function spotPrecision(crops) {
  const found = groupLines(crops);
  const truths = LINES.map(lettersOf);
  let correct = 0;
  let total = 0;
  const used = new Set();
  found.forEach((line) => {
    const pred = line.map((c) => c.ch);
    let best = -1;
    let bestScore = -1;
    truths.forEach((truth, idx) => {
      if (used.has(idx)) return;
      const score = matchCount(pred, truth);
      if (score > bestScore) { bestScore = score; best = idx; }
    });
    if (best >= 0) used.add(best);
    correct += Math.max(0, bestScore);
    total += pred.length;
    console.log('  info line', (best >= 0 ? LINES[best] : '?'), '→', pred.join(''), ' matched', bestScore + '/' + pred.length);
  });
  return { correct, total, precision: total ? correct / total : 0, lines: found };
}

function confirmedExamples(crops) {
  const found = groupLines(crops);
  const truths = LINES.map(lettersOf);
  const examples = [];
  const used = new Set();
  found.forEach((line) => {
    const pred = line.map((c) => c.ch);
    let best = -1;
    let bestScore = -1;
    truths.forEach((truth, idx) => {
      if (used.has(idx)) return;
      const score = matchCount(pred, truth);
      if (score > bestScore) { bestScore = score; best = idx; }
    });
    if (best < 0) return;
    used.add(best);
    const truth = truths[best];
    /* Walk the same alignment and keep crops that land on the right character. */
    let j = 0;
    line.forEach((crop) => {
      let at = -1;
      for (let k = j; k < truth.length; k++) {
        if (truth[k] === crop.ch) { at = k; break; }
        if (k > j + 3) break;
      }
      if (at >= 0) {
        j = at + 1;
        if (crop.embedding) examples.push({ ch: crop.ch, embedding: Array.from(crop.embedding) });
      }
    });
  });
  return examples;
}

async function loadEngines() {
  global.Image = Image;
  installDocument(() => createCanvas(1, 1));
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'charcnn.json'), 'utf8'));
  global.fetch = async function (url) {
    if (String(url).indexOf('charcnn') >= 0) return { ok: true, json: async () => raw };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const CharCNN = await loadLib('charcnn', 'CharCNN');
  const Harvest = await loadLib('harvest', 'Harvest');
  await CharCNN.load(['assets/charcnn.json']);
  return { CharCNN, Harvest };
}

async function toCanvas(file) {
  const img = await loadImage(file);
  const c = createCanvas(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

function drawManyLetters() {
  const c = createCanvas(1600, 700);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f7f4ea';
  ctx.fillRect(0, 0, 1600, 700);
  ctx.fillStyle = '#1a2744';
  let n = 0;
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const x = 30 + col * 150;
      const y = 24 + row * 66;
      ctx.fillRect(x, y, 3, 22);
      ctx.fillRect(x + 9, y, 3, 22);
      ctx.fillRect(x, y, 12, 3);
      n++;
    }
  }
  return { canvas: c, count: n };
}

async function main() {
  console.log('\n-- harvest: single letters, no cap, personal examples --');
  const { Harvest } = await loadEngines();

  const drawn = drawManyLetters();
  const uncapped = Harvest.collectCrops([drawn.canvas]);
  const capped = Harvest.collectCrops([drawn.canvas], { maxCrops: 5 });
  console.log('  info geometric crops', uncapped.length, 'drawn', drawn.count);
  check('crop count is what was found, not a fixed cap', uncapped.length === drawn.count, String(uncapped.length));
  check('an optional limit still works for callers that ask', capped.length === 5, String(capped.length));

  const page1 = await toCanvas(path.join(FIX, 'sample_page_1.jpg'));
  const page2 = await toCanvas(path.join(FIX, 'sample_page_2.jpg'));
  const first = await Harvest.harvestFromPagesAsync([page1]);
  console.log('  info accepted on page 1', first.length);
  check('accepted crops are not capped at 80, 90, or 120', ![80, 90, 120].includes(first.length) || first.length < 40, String(first.length));
  const spot = spotPrecision(first);
  console.log('  info spot-check', spot.correct + '/' + spot.total, spot.precision.toFixed(3));
  check('at least 95% of the spot-checked labels are right', spot.total >= 8 && spot.precision >= 0.95,
    spot.correct + '/' + spot.total);

  const examples = confirmedExamples(first);
  const hand = {
    glyphs: first.map((g) => {
      const copy = Object.assign({}, g);
      delete copy.embedding;
      return copy;
    }),
    examples: [],
    stats: { pages: 1, slant: 0.1, strokeWidth: 3 },
    sampleCount: 1,
  };
  examples.forEach((ex) => Harvest.confirmLetter(hand, ex));
  const second = await Harvest.harvestFromPagesAsync([page2], { examples: hand.examples });
  const spot2 = spotPrecision(second);
  console.log('  info page 2 spot-check', spot2.correct + '/' + spot2.total, spot2.precision.toFixed(3));
  const before = hand.glyphs.length;
  const report = Harvest.addToHand(hand, second, { pages: 1, slant: 0.12, strokeWidth: 3, style: { xHeight: 20, letterGap: 4 } });
  console.log('  info report', JSON.stringify(report));
  check('second page keeps the same precision', spot2.total >= 8 && spot2.precision >= 0.95 && spot2.precision + 1e-9 >= spot.precision - 0.001,
    spot.precision.toFixed(3) + ' then ' + spot2.precision.toFixed(3));
  check('second page increases variants', report.variantsAfter > report.variantsBefore || hand.glyphs.length > before,
    report.variantsBefore + ' to ' + report.variantsAfter + ', glyphs ' + before + ' to ' + hand.glyphs.length);
  check('added pages report coverage, variants, and confidence',
    typeof report.coverageBefore === 'number' && typeof report.confidenceAfter === 'number');
  check('the hand kept from the second page has no photo of the page',
    !JSON.stringify(hand.stats || {}).includes('data:image') && !hand.stats.thumbs);

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
