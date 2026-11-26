'use strict';
/* Relabel joins personal examples and changes how the next page is labelled (#28). */

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { installDocument, loadLib } = require('./load-lib');

let createCanvas, Image;
try {
  ({ createCanvas, Image } = require('canvas'));
} catch (e) {
  console.error('-- review: canvas is required --');
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
  const Review = await loadLib('review', 'Review');
  await CharCNN.load(['assets/charcnn.json']);
  return { CharCNN, Harvest, Review };
}

function tinyGlyph(ch) {
  const c = createCanvas(28, 36);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 28, 36);
  ctx.fillStyle = '#1a2744';
  ctx.font = '28px sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(ch, 2, 28);
  return {
    ch,
    url: c.toDataURL('image/png'),
    w: 28,
    h: 36,
    by: 28,
    adv: 30,
    source: 'page',
    confidence: 0.55,
    cnnConf: 0.55,
  };
}

async function main() {
  console.log('\n-- review: relabel, best, personal examples --');
  const { CharCNN, Review } = await loadEngines();

  const hand = {
    glyphs: [tinyGlyph('a'), tinyGlyph('a'), tinyGlyph('b')],
    examples: [],
    missing: [],
  };
  hand.glyphs[2].source = 'generated';
  hand.glyphs[2].confidence = 0.4;

  check('page source badge', Review.glyphSource(hand.glyphs[0]) === 'page');
  check('generated source badge', Review.glyphSource(hand.glyphs[2]) === 'generated');
  check('low confidence flags generated', Review.isLowConfidence(hand.glyphs[2]) === true);

  Review.markBest(hand, hand.glyphs[1]);
  check('mark best sets the flag', hand.glyphs[1].best === true && hand.glyphs[0].best === false);

  Review.deleteGlyph(hand, hand.glyphs[0]);
  check('delete removes one variant', hand.glyphs.length === 2 && hand.glyphs[0].ch === 'a' && hand.glyphs[0].best === true);

  const target = hand.glyphs[0];
  await Review.relabel(hand, target, 'e');
  check('relabel changes the character', target.ch === 'e');
  check('relabel confirms the letter', target.confirmed === true);
  check('relabel joins personal examples', hand.examples.length >= 1 && hand.examples.some((ex) => ex.ch === 'e'));

  const pred = {
    ch: 'Z',
    conf: 0.4,
    embedding: hand.examples[0].embedding,
    probs: null,
  };
  const decided = CharCNN.decideLabel(pred, { h: 20 }, hand.examples, 24);
  check('relabelled example changes the next label', decided.ch === 'e', decided.ch);

  await Review.acceptGenerated(hand, hand.glyphs[1]);
  check('accept clears generated source', Review.glyphSource(hand.glyphs[1]) === 'sheet');
  check('accept confirms', hand.glyphs[1].confirmed === true);

  const summary = Review.coverageSummary(hand);
  check('coverage summary counts characters', summary.chars >= 1 && summary.variants === hand.glyphs.length);

  const guide = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'screens', 'guide.js'), 'utf8');
  check('review UI groups by character', guide.includes('review-board') && guide.includes('review-glyph'));
  check('review UI has keyboard actions', guide.includes('ArrowRight') && guide.includes('revRelabel'));

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
