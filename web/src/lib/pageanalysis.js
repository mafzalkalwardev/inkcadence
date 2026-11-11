/* Pens, lines, headings and style stats from one page.
   Photos are not returned. Show-through is measured and dropped. */
'use strict';

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(function (v) {
    return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
  }).join('');
}

function srgbToLin(u) {
  u /= 255;
  return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
}

function rgbToLab(r, g, b) {
  var R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
  var X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  var Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  var Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
  function f(t) { return t > 0.008856 ? Math.cbrt(t) : (7.787037 * t + 0.137931); }
  var fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labDist(a, b) {
  var dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

function chroma(lab) {
  return Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
}

function median(arr) {
  if (!arr.length) return 0;
  var s = arr.slice().sort(function (a, b) { return a - b; });
  return s[(s.length * 0.5) | 0];
}

function roundTo(n, places) {
  var p = Math.pow(10, places);
  return Math.round(n * p) / p;
}

function paperLum(data, w, h) {
  var y0 = (h * 0.15) | 0, y1 = (h * 0.85) | 0;
  var x0 = (w * 0.15) | 0, x1 = (w * 0.85) | 0;
  var sum = 0, n = 0, y, x, i, lum;
  for (y = y0; y < y1; y += 4) {
    for (x = x0; x < x1; x += 4) {
      i = (y * w + x) * 4;
      lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum > 170) { sum += lum; n++; }
    }
  }
  return n ? sum / n : 236;
}

function collectCores(data, ink, w, h) {
  var samples = [];
  var y, x, x0, run, mid, i, r, g, b, lum;
  for (y = 1; y < h - 1; y += 2) {
    x = 0;
    while (x < w) {
      if (!ink[y * w + x]) { x++; continue; }
      x0 = x;
      while (x < w && ink[y * w + x]) x++;
      run = x - x0;
      if (run < 1 || run > 48) continue;
      mid = (x0 + x - 1) >> 1;
      i = (y * w + mid) * 4;
      r = data[i]; g = data[i + 1]; b = data[i + 2];
      lum = 0.299 * r + 0.587 * g + 0.114 * b;
      samples.push({
        lab: rgbToLab(r, g, b), width: run, lum: lum, x: mid, y: y, r: r, g: g, b: b
      });
    }
  }
  return samples;
}

function clusterCores(samples) {
  var clusters = [];
  var i, s, best, bd, c, d, k;
  for (i = 0; i < samples.length; i++) {
    s = samples[i];
    best = null;
    bd = 26;
    for (c = 0; c < clusters.length; c++) {
      d = labDist(s.lab, clusters[c].lab);
      if (d < bd) { bd = d; best = clusters[c]; }
    }
    if (!best) {
      clusters.push({ lab: s.lab.slice(), pts: [] });
      best = clusters[clusters.length - 1];
    }
    best.pts.push(s);
    k = best.pts.length;
    best.lab[0] += (s.lab[0] - best.lab[0]) / k;
    best.lab[1] += (s.lab[1] - best.lab[1]) / k;
    best.lab[2] += (s.lab[2] - best.lab[2]) / k;
  }
  return clusters;
}

function summarize(pts) {
  var r = 0, g = 0, b = 0, lum = 0, lab = [0, 0, 0], widths = [], i, p;
  for (i = 0; i < pts.length; i++) {
    p = pts[i];
    r += p.r; g += p.g; b += p.b; lum += p.lum;
    lab[0] += p.lab[0]; lab[1] += p.lab[1]; lab[2] += p.lab[2];
    widths.push(p.width);
  }
  var n = pts.length || 1;
  return {
    pts: pts,
    n: pts.length,
    r: r / n, g: g / n, b: b / n,
    lum: lum / n,
    lab: [lab[0] / n, lab[1] / n, lab[2] / n],
    width: median(widths)
  };
}

function splitByWidth(cluster) {
  var widths = cluster.pts.map(function (p) { return p.width; }).sort(function (a, b) { return a - b; });
  var med = widths[(widths.length * 0.5) | 0] || 1;
  var narrow = [], wide = [], i, p;
  for (i = 0; i < cluster.pts.length; i++) {
    p = cluster.pts[i];
    if (p.width > med * 1.75) wide.push(p);
    else if (p.width < med * 0.65) narrow.push(p);
  }
  if (wide.length > cluster.pts.length * 0.18 && narrow.length > cluster.pts.length * 0.18) {
    return [summarize(narrow), summarize(wide)];
  }
  return [summarize(cluster.pts)];
}

function lineBands(ink, w, h) {
  var rows = new Float32Array(h);
  var y, x, mx = 0, s, bands = [], cur = 0, out = [];
  for (y = 0; y < h; y++) {
    s = 0;
    for (x = 0; x < w; x++) s += ink[y * w + x];
    rows[y] = s;
    if (s > mx) mx = s;
  }
  if (!mx) return [];
  for (y = 0; y < h; y++) {
    if (rows[y] > mx * 0.08) { if (!cur) cur = y; }
    else if (cur) { bands.push([cur, y]); cur = 0; }
  }
  if (cur) bands.push([cur, h]);
  bands.forEach(function (b) {
    if (b[1] - b[0] >= 8) out.push({ y0: b[0], y1: b[1] });
  });
  return out;
}

function bandXRange(ink, w, band) {
  var minX = w, maxX = 0, y, x, hit = false;
  for (y = band.y0; y < band.y1; y++) {
    for (x = 0; x < w; x++) {
      if (!ink[y * w + x]) continue;
      hit = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  return hit ? { minX: minX, maxX: maxX } : null;
}

function hasUnderline(ink, w, h, band) {
  var range = bandXRange(ink, w, band);
  if (!range) return false;
  var span = range.maxX - range.minX;
  if (span < 24) return false;
  var yEnd = Math.min(h - 1, band.y1 + Math.max(8, ((band.y1 - band.y0) * 0.35) | 0));
  var y, x, run, best;
  for (y = band.y1; y <= yEnd; y++) {
    run = 0; best = 0;
    for (x = range.minX; x <= range.maxX; x++) {
      if (ink[y * w + x]) run++;
      else { if (run > best) best = run; run = 0; }
    }
    if (run > best) best = run;
    if (best > span * 0.45) return true;
  }
  return false;
}

function lineCase(ink, w, band) {
  var split = band.y0 + (band.y1 - band.y0) * 0.42;
  var cols = 0, colsTop = 0, x, y, has, hasTop;
  for (x = 0; x < w; x += 2) {
    has = false; hasTop = false;
    for (y = band.y0; y < band.y1; y++) {
      if (!ink[y * w + x]) continue;
      has = true;
      if (y < split) hasTop = true;
    }
    if (!has) continue;
    cols++;
    if (hasTop) colsTop++;
  }
  if (!cols) return 'mixed';
  var frac = colsTop / cols;
  if (frac > 0.72) return 'upper';
  if (frac < 0.35) return 'lower';
  return 'mixed';
}

function denseHeight(ink, w, band) {
  var mx = 0, y, x, s, rows = [];
  for (y = band.y0; y < band.y1; y++) {
    s = 0;
    for (x = 0; x < w; x++) s += ink[y * w + x];
    rows.push(s);
    if (s > mx) mx = s;
  }
  if (!mx) return band.y1 - band.y0;
  var y0 = -1, y1 = -1, i;
  for (i = 0; i < rows.length; i++) {
    if (rows[i] > mx * 0.45) {
      if (y0 < 0) y0 = i;
      y1 = i + 1;
    }
  }
  return y0 < 0 ? (band.y1 - band.y0) : (y1 - y0);
}

function gapsOnBand(ink, w, band) {
  var bestY = band.y0, best = 0, y, x, s;
  for (y = band.y0; y < band.y1; y++) {
    s = 0;
    for (x = 0; x < w; x++) s += ink[y * w + x];
    if (s > best) { best = s; bestY = y; }
  }
  var gaps = [], seen = false, gap = 0;
  for (x = 0; x < w; x++) {
    if (ink[bestY * w + x]) {
      if (seen && gap > 0) gaps.push(gap);
      gap = 0;
      seen = true;
    } else if (seen) gap++;
  }
  if (gaps.length < 2) return { letter: [], word: [] };
  var med = median(gaps);
  var letter = [], word = [];
  gaps.forEach(function (g) {
    if (g > med * 2.1 && g > med + 4) word.push(g);
    else letter.push(g);
  });
  return { letter: letter, word: word };
}

function measurePage(data, ink, w, h, slant) {
  var bg = paperLum(data, w, h);
  var samples = collectCores(data, ink, w, h);
  var groups = [];
  clusterCores(samples).forEach(function (c) { groups = groups.concat(splitByWidth(c)); });
  var bodyWidth = median(samples.map(function (s) { return s.width; })) || 2;
  var total = samples.length || 1;
  var pens = [];
  groups.forEach(function (g) {
    if (g.n < 8) return;
    var share = g.n / total;
    if (share < 0.05) return;
    var contrast = bg - g.lum;
    var c = chroma(g.lab);
    var kind;
    if (c < 18 && contrast < 100) kind = 'show-through';
    else if (c < 16 && contrast >= 100) kind = 'pencil';
    else if (g.width >= bodyWidth * 1.45) kind = 'marker';
    else kind = 'pen';
    if (kind === 'show-through') return;
    pens.push({
      hex: rgbToHex(g.r, g.g, g.b),
      kind: kind,
      width: roundTo(g.width, 1),
      share: Math.round(share * 100),
      role: 'body',
      lab: g.lab,
      pts: g.pts
    });
  });

  var bands = lineBands(ink, w, h);
  var heights = bands.map(function (b) { return b.y1 - b.y0; });
  var medianH = median(heights) || 1;
  var gaps = [];
  var i;
  for (i = 1; i < bands.length; i++) gaps.push(bands[i].y0 - bands[i - 1].y1);
  var medianGap = median(gaps) || medianH;

  function penAt(y0, y1) {
    var scores = pens.map(function () { return 0; });
    var p, s, bi, bd, d;
    for (p = 0; p < pens.length; p++) {
      var pts = pens[p].pts;
      for (s = 0; s < pts.length; s++) {
        if (pts[s].y >= y0 && pts[s].y < y1) scores[p]++;
      }
    }
    bi = -1; bd = 0;
    for (p = 0; p < scores.length; p++) {
      if (scores[p] > bd) { bd = scores[p]; bi = p; }
    }
    return bi;
  }

  bands.forEach(function (b, idx) {
    var hgt = b.y1 - b.y0;
    var tall = hgt > medianH * 1.32;
    var topish = b.y1 < h * 0.38;
    var isolated = idx === 0 || (b.y0 - bands[idx - 1].y1) > medianGap * 1.15;
    var underline = hasUnderline(ink, w, h, b);
    var pi = penAt(b.y0, b.y1);
    var different = false;
    if (pi >= 0 && pens[pi].width >= bodyWidth * 1.45) different = true;
    b.heading = !!((topish && (tall || underline || different)) || (tall && isolated && idx < 2));
    b.underline = underline;
    b.penIndex = pi;
    b.caseName = lineCase(ink, w, b);
    b.height = hgt;
  });

  var headingBands = bands.filter(function (b) { return b.heading; });
  var bodyBands = bands.filter(function (b) { return !b.heading; });
  if (!bodyBands.length) bodyBands = bands.slice();

  var headCounts = pens.map(function () { return 0; });
  var bodyCounts = pens.map(function () { return 0; });
  headingBands.forEach(function (b) { if (b.penIndex >= 0) headCounts[b.penIndex] += b.height; });
  bodyBands.forEach(function (b) { if (b.penIndex >= 0) bodyCounts[b.penIndex] += b.height; });
  pens.forEach(function (p, idx) {
    p.role = headCounts[idx] > bodyCounts[idx] ? 'heading' : 'body';
  });

  var xHeights = [];
  bodyBands.forEach(function (b) { xHeights.push(denseHeight(ink, w, b)); });
  var xHeight = median(xHeights) || medianH;
  var heading = null;
  if (headingBands.length) {
    var hb = headingBands[0];
    var headH = median(headingBands.map(function (b) { return denseHeight(ink, w, b); }));
    var penHex = hb.penIndex >= 0 ? pens[hb.penIndex].hex : (pens[0] ? pens[0].hex : '#241c16');
    heading = {
      pen: penHex,
      scale: roundTo(headH / (xHeight || headH), 2),
      underline: headingBands.some(function (b) { return b.underline; }),
      case: hb.caseName
    };
  }

  var letterGaps = [], wordGaps = [], spacings = [], bottoms = [];
  bodyBands.forEach(function (b) {
    var g = gapsOnBand(ink, w, b);
    letterGaps = letterGaps.concat(g.letter);
    wordGaps = wordGaps.concat(g.word);
    var y;
    for (y = b.y1 - 1; y >= b.y0; y--) {
      var hit = false, x;
      for (x = 0; x < w; x += 2) if (ink[y * w + x]) { hit = true; break; }
      if (hit) { bottoms.push(y); break; }
    }
  });
  for (i = 1; i < bodyBands.length; i++) spacings.push(bodyBands[i].y0 - bodyBands[i - 1].y0);
  var xHeight = median(xHeights) || medianH;
  var lineSpacing = median(spacings) || 0;
  var wobbles = [];
  if (bottoms.length >= 3 && lineSpacing) {
    for (i = 0; i < bottoms.length; i++) {
      wobbles.push(bottoms[i] - (bottoms[0] + i * lineSpacing));
    }
  }
  var wobble = 0;
  if (wobbles.length) {
    var mean = 0;
    wobbles.forEach(function (v) { mean += v; });
    mean /= wobbles.length;
    var vs = 0;
    wobbles.forEach(function (v) { var d = v - mean; vs += d * d; });
    wobble = Math.sqrt(vs / wobbles.length);
  }
  var letterGap = median(letterGaps);
  var wordGap = median(wordGaps);
  function em(px) { return xHeight ? roundTo(px / xHeight, 3) : 0; }

  var publicPens = pens.map(function (p) {
    return { hex: p.hex, kind: p.kind, width: p.width, role: p.role, share: p.share };
  }).sort(function (a, b) {
    if (a.role !== b.role) return a.role === 'body' ? -1 : 1;
    return b.share - a.share;
  });

  return {
    pens: publicPens,
    lines: bands.map(function (b) {
      return {
        y0: b.y0,
        y1: b.y1,
        role: b.heading ? 'heading' : 'body',
        pen: b.penIndex >= 0 ? pens[b.penIndex].hex : ''
      };
    }),
    heading: heading,
    style: {
      slant: roundTo(slant || 0, 3),
      xHeight: roundTo(xHeight, 1),
      letterGap: roundTo(letterGap, 1),
      wordGap: roundTo(wordGap, 1),
      lineSpacing: roundTo(lineSpacing, 1),
      baselineWobble: roundTo(wobble, 2),
      letterGapEm: em(letterGap),
      wordGapEm: em(wordGap),
      lineSpacingEm: em(lineSpacing),
      baselineWobbleEm: em(wobble)
    }
  };
}

export { measurePage };
