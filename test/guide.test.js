'use strict';
/* Home offers the two first-run actions, and the demo hand can write a page. */

const fs = require('fs');
const path = require('path');
const { installDocument, loadLib } = require('./load-lib');

let createCanvas;
let Image;
try {
  ({ createCanvas, Image } = require('canvas'));
} catch (e) {
  console.error('-- guide: canvas is required --');
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

async function main() {
  console.log('\n-- guide: home, steps, demo hand --');
  const home = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'screens', 'home.js'), 'utf8');
  const guide = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'screens', 'guide.js'), 'utf8');
  check('home offers Make my handwriting', home.includes('Make my handwriting') && home.includes('btnMakeHand'));
  check('home offers Try the demo hand', home.includes('Try the demo hand') && home.includes('btnDemo'));
  check('the guide attests before the sheet', guide.indexOf('This is my handwriting') < guide.indexOf('Letter sheet'));
  check('old pages are optional', guide.includes('wizSkip3') && guide.includes('Old pages'));
  check('analyse shows progress', guide.includes('analyseBar') && guide.includes('analyseMsg'));
  check('a phone can take a photo', guide.includes('capture="environment"'));

  installDocument(() => createCanvas(1, 1));
  global.Image = Image;
  const PackShare = await loadLib('packshare', 'PackShare');
  const Rendering = await loadLib('render', 'Rendering');
  const Glyphs = await loadLib('glyphs', 'Glyphs');
  const raw = fs.readFileSync(path.join(__dirname, '..', 'web', 'public', 'demo-hand.inkpack'), 'utf8');
  const pack = PackShare.decodeShare(raw);
  pack.id = 'pk_demo';
  await Glyphs.hydrate(pack);
  const pages = Rendering.renderPages({
    pack,
    text: '# Notes\n\nWrite the words you want on the page. The letters come from your hand.',
    size: 28,
    jitter: 0,
    seed: 2,
    penColour: '#1a2744',
    paper: 'plain',
    watermark: false,
    pageNumbers: false,
  });
  check('the demo hand writes the starter page', pages.length === 1 && pages[0].width > 100);
  check('the demo page is not blank', pages[0].toBuffer().length > 5000);

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
