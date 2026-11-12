/**
 * No-printer path. The lines are known, so a photo of a copy is labelled
 * by where each ink mark sits on its line, not by guessing the character.
 */
import { Harvest } from './harvest.js';

var LINES = [
  'The quick brown fox jumps over a lazy dog.',
  'Pack my box with five dozen liquor jugs.',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  '0123456789',
  '.,!?-:;\'"()/&@#+*='
];

function glyphsOnLines(crops) {
  var sorted = (crops || []).slice().sort(function (a, b) {
    return (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0);
  });
  var heights = sorted.map(function (c) { return c.h || 10; }).sort(function (a, b) { return a - b; });
  var medianH = heights.length ? heights[(heights.length * 0.5) | 0] : 12;
  var lines = [];
  sorted.forEach(function (crop) {
    var last = lines[lines.length - 1];
    if (!last || (crop.y || 0) - last.y > medianH * 0.65) {
      lines.push({ y: crop.y || 0, crops: [crop] });
    } else {
      last.crops.push(crop);
    }
  });
  return lines
    .map(function (line) { return line.crops.sort(function (a, b) { return (a.x || 0) - (b.x || 0); }); })
    .filter(function (line) { return line.length >= 3; });
}

/* A dot over an i shares the stem's x range. Keep one mark per letter. */
function mergeStacked(crops) {
  var out = [];
  crops.forEach(function (crop) {
    var prev = out[out.length - 1];
    if (prev && (crop.x || 0) <= (prev.x || 0) + (prev.w || 0) + 2) {
      var right = Math.max((prev.x || 0) + (prev.w || 0), (crop.x || 0) + (crop.w || 0));
      prev.w = right - (prev.x || 0);
      if ((crop.h || 0) > (prev.h || 0)) {
        prev.y = crop.y;
        prev.h = crop.h;
        prev.url = crop.url;
      }
      return;
    }
    out.push(Object.assign({}, crop));
  });
  return out;
}

function alignLine(crops, text) {
  var chars = text.split('');
  var sorted = mergeStacked(crops);
  var missing = [];
  var glyphs = [];
  if (!sorted.length) {
    chars.forEach(function (ch) { if (ch !== ' ') missing.push(ch); });
    return { glyphs: glyphs, missing: missing };
  }
  var lefts = sorted.map(function (c) { return c.x || 0; });
  var gaps = [];
  var i;
  for (i = 1; i < lefts.length; i++) gaps.push(lefts[i] - lefts[i - 1]);
  gaps.sort(function (a, b) { return a - b; });
  var pitch = gaps.length ? gaps[Math.max(0, (gaps.length * 0.35) | 0)] : ((sorted[0].w || 20) * 1.3);
  if (pitch < 4) pitch = 4;
  var origin = lefts[0];
  var used = Object.create(null);
  sorted.forEach(function (crop, index) {
    var slot = Math.round((lefts[index] - origin) / pitch);
    if (slot < 0 || slot >= chars.length || used[slot]) return;
    if (chars[slot] === ' ') return;
    used[slot] = true;
    var g = Object.assign({}, crop);
    g.ch = chars[slot];
    g.source = 'sheet';
    g.confirmed = false;
    glyphs.push(g);
  });
  chars.forEach(function (ch, slot) {
    if (ch !== ' ' && !used[slot]) missing.push(ch);
  });
  return { glyphs: glyphs, missing: missing };
}

function read(canvas) {
  if (!canvas) return { kind: 'copy', page: 0, glyphs: [], missing: [] };
  var crops = Harvest.collectCrops([canvas], { keepWide: true, maxW: 2000 });
  var found = glyphsOnLines(crops);
  var glyphs = [];
  var missing = [];
  var n = Math.max(found.length, LINES.length);
  var i;
  for (i = 0; i < n; i++) {
    var text = LINES[i] || '';
    var line = found[i] || [];
    if (!text) continue;
    var aligned = alignLine(line, text);
    glyphs = glyphs.concat(aligned.glyphs);
    missing = missing.concat(aligned.missing);
  }
  return { kind: 'copy', page: 0, glyphs: glyphs, missing: missing };
}

var CopyLines = {
  LINES: LINES,
  read: read
};

export { CopyLines };
export default CopyLines;
