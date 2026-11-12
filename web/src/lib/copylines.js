/**
 * No-printer path. The lines are known, so a photo of a copy is labelled
 * by where each ink mark sits on its line, not by guessing the character.
 * A scribble is left out. A copied line number is left out. A mark that
 * is much wider than one letter is cut into the letters it spans.
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
    if (!last || (crop.y || 0) - last.y > medianH * 0.95) {
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
    if (prev && (crop.x || 0) < (prev.x || 0) + (prev.w || 0) * 0.55) {
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

/* The five real lines are the busy ones. A corner scribble is shorter. */
function chooseLines(lines) {
  if (lines.length <= LINES.length) return lines;
  return lines
    .map(function (line, index) { return { line: line, index: index }; })
    .sort(function (a, b) { return b.line.length - a.line.length || a.index - b.index; })
    .slice(0, LINES.length)
    .sort(function (a, b) {
      var ay = a.line[0] ? (a.line[0].y || 0) : 0;
      var by = b.line[0] ? (b.line[0].y || 0) : 0;
      return ay - by;
    })
    .map(function (entry) { return entry.line; });
}

function slicePx(px, index, count) {
  if (!px || !px.data || !px.w || !px.h) return null;
  var x0 = Math.round((px.w * index) / count);
  var x1 = Math.round((px.w * (index + 1)) / count);
  if (x1 <= x0) x1 = Math.min(px.w, x0 + 1);
  var w = Math.max(1, x1 - x0);
  var c = document.createElement('canvas');
  c.width = w;
  c.height = px.h;
  var ctx = c.getContext('2d');
  var od = ctx.createImageData(w, px.h);
  var y, x, s, d;
  for (y = 0; y < px.h; y++) {
    for (x = 0; x < w; x++) {
      s = ((y * px.w) + (x0 + x)) * 4;
      d = ((y * w) + x) * 4;
      od.data[d] = px.data[s];
      od.data[d + 1] = px.data[s + 1];
      od.data[d + 2] = px.data[s + 2];
      od.data[d + 3] = px.data[s + 3];
    }
  }
  ctx.putImageData(od, 0, 0);
  return {
    url: c.toDataURL('image/png'),
    w: w,
    h: px.h,
    px: { w: w, h: px.h, data: od.data }
  };
}

/* A word written without a gap is one mark. Cut it into the letters it spans. */
function sliceWide(crops, text) {
  if (!crops || crops.length < 1) return crops || [];
  var narrow = crops.filter(function (c) {
    return (c.w || 0) > 2 && (c.w || 0) <= (c.h || 1) * 1.35;
  });
  var pitch = 0;
  var gaps = [];
  var gi;
  for (gi = 1; gi < crops.length; gi++) {
    var gap = (crops[gi].x || 0) - (crops[gi - 1].x || 0);
    if (gap > 3) gaps.push(gap);
  }
  gaps.sort(function (a, b) { return a - b; });
  if (gaps.length >= 4) pitch = gaps[Math.max(0, (gaps.length * 0.35) | 0)];
  if (!(pitch > 6) && narrow.length >= 4) {
    var ws = narrow.map(function (c) { return c.w; }).sort(function (a, b) { return a - b; });
    pitch = ws[(ws.length * 0.4) | 0];
  }
  if (!(pitch > 6)) {
    var last = crops[crops.length - 1];
    var span = ((last.x || 0) + (last.w || 0)) - (crops[0].x || 0);
    pitch = span / Math.max(1, (text || '').length);
  }
  if (!(pitch > 6)) pitch = 6;
  var out = [];
  crops.forEach(function (crop) {
    var n = Math.round((crop.w || 0) / pitch);
    if (n < 2 || (crop.w || 0) < pitch * 2.3 || (crop.w || 0) < (crop.h || 1) * 1.8) {
      out.push(crop);
      return;
    }
    if (n > 10) n = 10;
    var i;
    for (i = 0; i < n; i++) {
      var piece = Object.assign({}, crop);
      var sliced = slicePx(crop._px, i, n);
      if (sliced) {
        piece.url = sliced.url;
        piece._px = sliced.px;
        piece.w = sliced.w;
        piece.h = sliced.h;
      } else {
        piece.w = (crop.w || 0) / n;
      }
      piece.x = (crop.x || 0) + ((crop.w || 0) / n) * i;
      out.push(piece);
    }
  });
  return out;
}

/* The list on screen is numbered. A copied "1." is not part of the line. */
function dropLineNumber(crops, text) {
  if (!crops || crops.length < 4) return crops || [];
  var sorted = crops.slice().sort(function (a, b) { return (a.x || 0) - (b.x || 0); });
  var gap = function (a, b) { return (b.x || 0) - ((a.x || 0) + (a.w || 0)); };
  var gaps = [];
  var i;
  for (i = 0; i < sorted.length - 1; i++) gaps.push(gap(sorted[i], sorted[i + 1]));
  var positive = gaps.filter(function (g) { return g > 0; }).sort(function (a, b) { return a - b; });
  var med = positive.length ? positive[(positive.length * 0.5) | 0] : 0;
  var pitch = positive.length ? positive[Math.max(0, (positive.length * 0.35) | 0)] : 0;
  var first = sorted[0];
  var second = sorted[1];
  var dot = (second.h || 0) < (first.h || 1) * 0.72 && (second.w || 0) < (first.w || 1) * 0.9;
  if (dot && gap(second, sorted[2]) > Math.max(4, med * 1.1)) return sorted.slice(2);
  if (gap(first, second) > Math.max(10, pitch * 2)) return sorted.slice(1);
  return sorted;
}

/* A printed line has gaps of one letter or one word. Handwriting does not. */
function evenPitch(sorted) {
  var gaps = [];
  var i;
  for (i = 1; i < sorted.length; i++) {
    var gap = (sorted[i].x || 0) - (sorted[i - 1].x || 0);
    if (gap > 2) gaps.push(gap);
  }
  if (gaps.length < 4) return 0;
  gaps.sort(function (a, b) { return a - b; });
  var pitch = gaps[Math.max(0, (gaps.length * 0.35) | 0)];
  if (pitch < 4) return 0;
  var irregular = 0;
  gaps.forEach(function (gap) {
    var units = gap / pitch;
    if (Math.abs(units - Math.round(units)) > 0.22) irregular++;
  });
  if (irregular / gaps.length > 0.28) return 0;
  return pitch;
}

function alignLine(crops, text) {
  var chars = text.split('');
  var sorted = dropLineNumber(sliceWide(mergeStacked(crops), text), text);
  var missing = [];
  var glyphs = [];
  if (!sorted.length) {
    chars.forEach(function (ch) { if (ch !== ' ') missing.push(ch); });
    return { glyphs: glyphs, missing: missing };
  }
  var pitch = evenPitch(sorted);
  if (pitch) {
    var origin = sorted[0].x || 0;
    var usedPitch = Object.create(null);
    sorted.forEach(function (crop) {
      var slot = Math.round(((crop.x || 0) - origin) / pitch);
      if (slot < 0 || slot >= chars.length || usedPitch[slot] || chars[slot] === ' ') return;
      usedPitch[slot] = true;
      var placed = Object.assign({}, crop);
      placed.ch = chars[slot];
      placed.source = 'sheet';
      placed.confirmed = false;
      glyphs.push(placed);
    });
    chars.forEach(function (ch, slot) {
      if (ch !== ' ' && !usedPitch[slot]) missing.push(ch);
    });
    return { glyphs: glyphs, missing: missing };
  }
  var left = sorted[0].x || 0;
  var right = sorted[sorted.length - 1].x || 0;
  var span = Math.max(1, right - left);
  var step = span / Math.max(1, chars.length - 1);
  function expectedX(index) {
    return left + (chars.length <= 1 ? 0 : (index / (chars.length - 1)) * span);
  }
  var used = Object.create(null);
  var cursor = 0;
  sorted.forEach(function (crop) {
    var x = crop.x || 0;
    var best = -1;
    var bestDist = 1e9;
    var s;
    for (s = cursor; s < chars.length; s++) {
      if (chars[s] === ' ') continue;
      var dist = Math.abs(x - expectedX(s));
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
      if (expectedX(s) > x + step && best >= 0) break;
    }
    if (best < 0) return;
    for (s = cursor; s < best; s++) {
      if (chars[s] === ' ') continue;
      if (Math.abs(x - expectedX(s)) <= step * 0.85) {
        best = s;
        break;
      }
    }
    if (chars[best] === ' ' || used[best]) return;
    used[best] = true;
    cursor = best + 1;
    var g = Object.assign({}, crop);
    g.ch = chars[best];
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
  var crops = Harvest.collectCrops([canvas], { keepWide: true, maxW: 2000, keepPixels: true });
  var found = chooseLines(glyphsOnLines(crops));
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
  glyphs.forEach(function (g) { delete g._px; });
  return { kind: 'copy', page: 0, glyphs: glyphs, missing: missing };
}

var CopyLines = {
  LINES: LINES,
  read: read
};

export { CopyLines };
export default CopyLines;
