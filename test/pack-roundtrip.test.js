'use strict';
/* Export → import must keep the hand's letters and style (issue #29). */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

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
  console.log('\n-- pack round trip --');
  const file = path.join(__dirname, '..', 'web', 'src', 'lib', 'packshare.js');
  const { PackShare } = await import(pathToFileURL(file).href);

  const raw = fs.readFileSync(path.join(__dirname, '..', 'web', 'public', 'demo-hand.inkpack'), 'utf8');
  const original = PackShare.decodeShare(raw);
  original.id = 'pk_demo_source';
  original.name = 'Round-trip hand';
  original.slant = 0.12;
  original.penColours = ['#1a2744', '#123a8c'];
  original.readOnly = false;

  const encoded = PackShare.encodeShare(original);
  check('encode starts with INK1.', encoded.indexOf('INK1.') === 0);

  const imported = PackShare.decodeShare(encoded);
  check('import gets a fresh id', imported.id.indexOf('pk_import_') === 0);
  check('name survives', imported.name === 'Round-trip hand');
  check('slant survives', imported.slant === 0.12);
  check('pen colours survive', JSON.stringify(imported.penColours) === JSON.stringify(['#1a2744', '#123a8c']));
  check('glyph count survives', imported.glyphs.length === original.glyphs.length);

  const byChar = (list) => {
    const m = Object.create(null);
    list.forEach((g) => {
      if (!m[g.ch]) m[g.ch] = [];
      m[g.ch].push({ w: g.w, h: g.h, by: g.by, adv: g.adv, url: g.url });
    });
    return m;
  };
  const a = byChar(original.glyphs);
  const b = byChar(imported.glyphs);
  const chars = Object.keys(a).sort();
  check('same characters', chars.join('') === Object.keys(b).sort().join(''));
  let glyphsMatch = true;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (JSON.stringify(a[ch]) !== JSON.stringify(b[ch])) {
      glyphsMatch = false;
      break;
    }
  }
  check('glyph metrics and PNGs match exactly', glyphsMatch);
  check('photos stay out', !imported.stats || !imported.stats.thumbs || imported.stats.thumbs.length === 0);

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
