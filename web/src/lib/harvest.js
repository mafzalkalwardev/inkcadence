/* harvest.js — pull letter-like ink crops from full assignment pages.
   Used when no alphabet sheet is provided (or to enrich sheet glyphs with variants).
   Hardened against ruled/grid lines, highlighter, blue/green ink, and phone skew. */
'use strict';
import { CharCNN } from './charcnn.js';
var FREQ = 'etaoinshrdlcumwfgypbvkjxqzETAOINSHRDLCUMWFGYPBVKJXQZ0123456789';

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* Colour-aware ink: keep dark pens (incl. blue/green), drop rule lines + highlighter. */
  function inkMask(src, maxW) {
    var scale = Math.min(1, (maxW || 900) / src.width);
    var w = Math.max(32, Math.round(src.width * scale));
    var h = Math.max(32, Math.round(src.height * scale));
    var c = canvas(w, h);
    var ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0, w, h);
    var img = ctx.getImageData(0, 0, w, h);
    var d = img.data, n = w * h;
    var lum = new Float32Array(n), hist = new Uint32Array(256), i, p;
    for (i = 0, p = 0; i < d.length; i += 4, p++) {
      var L = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      lum[p] = L;
      hist[L | 0]++;
    }
    /* Paper from bright tail — ignore dark desk/shadow corners. */
    var paper = 200, acc = 0, target = n * 0.02;
    for (i = 255; i >= 0; i--) {
      acc += hist[i];
      if (acc >= target) { paper = i; break; }
    }
    /* Phone photos often have warmer/dimmer paper — widen ink cut. */
    var cut = paper - (paper < 190 ? 36 : 48);
    if (paper < 170) cut = paper - 28;
    var mask = new Uint8Array(n);
    for (p = 0, i = 0; p < n; p++, i += 4) {
      var r = d[i], g = d[i + 1], b = d[i + 2];
      var L2 = lum[p];
      if (L2 >= cut) { mask[p] = 0; continue; }
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      var sat = mx ? (mx - mn) / mx : 0;
      /* Fluorescent highlighter wash */
      if (L2 > 135 && sat > 0.28) { mask[p] = 0; continue; }
      /* Pale ruled / grid print (light blue-grey, not dark enough to be pen) */
      if (L2 > 155 && b >= r - 5 && b >= g - 5 && sat < 0.35) { mask[p] = 0; continue; }
      /* Soft shadow fringe: mid-dark, nearly grey */
      if (L2 > 145 && sat < 0.08) { mask[p] = 0; continue; }
      mask[p] = 1;
    }
    suppressRuledRows(mask, w, h);
    return { mask: mask, lum: lum, w: w, h: h, scale: scale, paper: paper, canvas: c };
  }

  /* Zero out rows that look like continuous ruled lines (high fill, thin). */
  function suppressRuledRows(mask, w, h) {
    var y, x, fill, runs, run, maxRun;
    for (y = 0; y < h; y++) {
      fill = 0; runs = 0; run = 0; maxRun = 0;
      for (x = 0; x < w; x++) {
        if (mask[y * w + x]) {
          fill++;
          run++;
          if (run > maxRun) maxRun = run;
        } else if (run) {
          runs++;
          run = 0;
        }
      }
      if (run) runs++;
      /* A printed rule spans most of the page as one long run. */
      if (fill > w * 0.42 && maxRun > w * 0.28 && runs <= 6) {
        for (x = 0; x < w; x++) mask[y * w + x] = 0;
        if (y + 1 < h) {
          var fill2 = 0;
          for (x = 0; x < w; x++) if (mask[(y + 1) * w + x]) fill2++;
          if (fill2 > w * 0.35) for (x = 0; x < w; x++) mask[(y + 1) * w + x] = 0;
        }
        if (y > 0) {
          var fill0 = 0;
          for (x = 0; x < w; x++) if (mask[(y - 1) * w + x]) fill0++;
          if (fill0 > w * 0.35) for (x = 0; x < w; x++) mask[(y - 1) * w + x] = 0;
        }
      }
    }
  }

  function components(mask, w, h) {
    var seen = new Uint8Array(mask.length);
    var comps = [];
    var stack = new Int32Array(mask.length);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var start = y * w + x;
        if (!mask[start] || seen[start]) continue;
        var top = 0;
        stack[top++] = start;
        seen[start] = 1;
        var minX = x, maxX = x, minY = y, maxY = y, count = 0;
        while (top) {
          var idx = stack[--top];
          var cx = idx % w, cy = (idx / w) | 0;
          count++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              var nx = cx + dx, ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              var nidx = ny * w + nx;
              if (!mask[nidx] || seen[nidx]) continue;
              seen[nidx] = 1;
              stack[top++] = nidx;
            }
          }
        }
        var bw = maxX - minX + 1, bh = maxY - minY + 1;
        if (count < 22 || bw < 3 || bh < 7) continue;
        if (bw > w * 0.42 || bh > h * 0.22) continue;
        var aspect = bw / bh;
        if (aspect > 2.6 || aspect < 0.1) continue;
        /* Reject leftover horizontal rule fragments */
        if (aspect > 2.0 && bh <= 5) continue;
        var density = count / (bw * bh);
        if (density < 0.12 || density > 0.92) continue;
        /* Margin / hole-punch noise near edges */
        if (minX < 4 && bw < 10) continue;
        comps.push({
          minX: minX, minY: minY, maxX: maxX, maxY: maxY,
          w: bw, h: bh, count: count, density: density
        });
      }
    }
    comps.sort(function (a, b) {
      var sa = a.count * (0.5 + a.density);
      var sb = b.count * (0.5 + b.density);
      return sb - sa;
    });
    return comps;
  }

  function cropToGlyph(srcInfo, box, pad) {
    pad = pad == null ? 2 : pad;
    var x0 = Math.max(0, box.minX - pad);
    var y0 = Math.max(0, box.minY - pad);
    var x1 = Math.min(srcInfo.w - 1, box.maxX + pad);
    var y1 = Math.min(srcInfo.h - 1, box.maxY + pad);
    var gw = x1 - x0 + 1, gh = y1 - y0 + 1;
    var out = canvas(gw, gh);
    var octx = out.getContext('2d');
    var od = octx.createImageData(gw, gh);
    var paper = srcInfo.paper;
    for (var yy = 0; yy < gh; yy++) {
      for (var xx = 0; xx < gw; xx++) {
        var sp = (yy + y0) * srcInfo.w + (xx + x0);
        var op = (yy * gw + xx) * 4;
        var a = 0;
        if (srcInfo.mask[sp]) {
          a = Math.max(40, Math.min(255, (paper - srcInfo.lum[sp]) * 2.4));
        }
        od.data[op] = 255;
        od.data[op + 1] = 255;
        od.data[op + 2] = 255;
        od.data[op + 3] = a;
      }
    }
    octx.putImageData(od, 0, 0);
    var conf = Math.min(0.95, 0.32 + box.count / 380 + (box.density || 0) * 0.15);
    return {
      url: out.toDataURL('image/png'),
      w: gw,
      h: gh,
      bx: 0,
      by: Math.round(gh * 0.82),
      adv: gw + Math.max(2, Math.round(gw * 0.08)),
      cellH: Math.round(gh * 1.15),
      cellW: Math.round(gw * 1.2),
      harvested: true,
      confidence: conf,
      x: box.minX,
      y: box.minY
    };
  }

  /* CNN labels real handwriting. FREQ cycling is only a last-resort offline stub. */
  function assignLabelsFreq(crops, maxPerChar) {
    maxPerChar = maxPerChar || 4;
    var glyphs = [];
    var counts = Object.create(null);
    var i, ch, g;
    for (i = 0; i < crops.length; i++) {
      ch = FREQ[i % FREQ.length];
      if ((counts[ch] || 0) >= maxPerChar) continue;
      g = crops[i];
      g.ch = ch;
      g.freqFallback = true;
      glyphs.push(g);
      counts[ch] = (counts[ch] || 0) + 1;
    }
    return glyphs;
  }

  function assignLabels(crops, maxPerChar, allowFreqFallback) {
    if (allowFreqFallback) return assignLabelsFreq(crops, maxPerChar || 4);
    return [];
  }

  function assignLabelsAsync(crops, maxPerChar, examples) {
    var cnn = CharCNN;
    if (!cnn) return Promise.resolve([]);
    var ensure = cnn.isReady() ? Promise.resolve() : cnn.load();
    return ensure.then(function () {
      return cnn.labelCrops(crops, maxPerChar, examples);
    }).catch(function (err) {
      console.warn('[Harvest] CharCNN label failed:', err && err.message ? err.message : err);
      return [];
    });
  }

  /* Median cell metrics from harvested crops (for packs without a sheet). */
  function medianCellMetrics(crops) {
    if (!crops || !crops.length) return null;
    var hs = crops.map(function (g) { return g.cellH || g.h; }).sort(function (a, b) { return a - b; });
    var ws = crops.map(function (g) { return g.cellW || g.w; }).sort(function (a, b) { return a - b; });
    return {
      cellH: hs[(hs.length * 0.5) | 0],
      cellW: ws[(ws.length * 0.5) | 0]
    };
  }

  function singleLetter(box, xHeight) {
    var xh = xHeight || box.h;
    if (box.h < xh * 0.45) return false;
    if (box.w / box.h > 1.45) return false;
    if (box.w > xh * 1.7) return false;
    return true;
  }

  function collectCrops(canvases, opts) {
    opts = opts || {};
    var all = [];
    (canvases || []).forEach(function (src, page) {
      if (!src) return;
      var info = inkMask(src, opts.maxW || 1100);
      var comps = components(info.mask, info.w, info.h);
      var heights = comps.map(function (b) { return b.h; }).sort(function (a, b) { return a - b; });
      var xHeight = opts.xHeight || (heights.length ? heights[(heights.length * 0.5) | 0] : 0);
      comps.forEach(function (box) {
        if (!singleLetter(box, xHeight)) return;
        var glyph = cropToGlyph(info, box);
        glyph.page = page;
        all.push(glyph);
      });
    });
    all.sort(function (a, b) { return (b.confidence || 0) - (a.confidence || 0); });
    if (opts.maxCrops > 0) return all.slice(0, opts.maxCrops);
    return all;
  }

  /* Sync harvest — CNN not available here; pass allowFreqFallback only for legacy tests. */
  function harvestFromPages(canvases, opts) {
    opts = opts || {};
    var all = collectCrops(canvases, opts);
    return assignLabels(all, opts.maxPerChar || 4, !!opts.allowFreqFallback);
  }

  /* Preferred: CNN-classify neat/messy human crops from assignment pages. */
  function harvestFromPagesAsync(canvases, opts) {
    opts = opts || {};
    var all = collectCrops(canvases, opts);
    return assignLabelsAsync(all, opts.maxPerChar, opts.examples).then(function (labeled) {
      if (labeled.length) return labeled;
      if (opts.allowFreqFallback) return assignLabelsFreq(all, opts.maxPerChar || 4);
      return labeled;
    });
  }

  function glyphQuality(g) {
    var q = g.confidence || g.cnnConf || 0;
    if (g.source === 'sheet' || g.confirmed) q += 2;
    return q;
  }

  function mergeVariants(baseGlyphs, harvested, maxPerChar) {
    maxPerChar = maxPerChar || 6;
    var groups = Object.create(null);
    function add(g) {
      if (!g || !g.ch) return;
      var copy = Object.assign({}, g);
      delete copy.embedding;
      (groups[copy.ch] || (groups[copy.ch] = [])).push(copy);
    }
    (baseGlyphs || []).forEach(add);
    (harvested || []).forEach(add);
    var out = [];
    Object.keys(groups).forEach(function (ch) {
      var list = groups[ch];
      list.sort(function (a, b) { return glyphQuality(b) - glyphQuality(a); });
      var previous = 0;
      (baseGlyphs || []).forEach(function (g) { if (g && g.ch === ch) previous++; });
      var limit = Math.max(maxPerChar, previous);
      var i;
      for (i = 0; i < list.length && i < limit; i++) out.push(list[i]);
    });
    return out;
  }

  function examplesFromGlyphs(glyphs) {
    var list = (glyphs || []).filter(function (g) {
      return g && g.ch && g.url && (g.source === 'sheet' || g.confirmed);
    });
    if (!list.length || !CharCNN || !CharCNN.isReady()) return Promise.resolve([]);
    var out = [];
    var counts = Object.create(null);
    var chain = Promise.resolve();
    list.forEach(function (g) {
      chain = chain.then(function () {
        if ((counts[g.ch] || 0) >= 4) return;
        return CharCNN.predictDataUrl(g.url).then(function (pred) {
          if (!pred || !pred.embedding) return;
          counts[g.ch] = (counts[g.ch] || 0) + 1;
          out.push({ ch: g.ch, embedding: Array.prototype.slice.call(pred.embedding) });
        }).catch(function () { /* skip a crop that will not load */ });
      });
    });
    return chain.then(function () { return out; });
  }

  function confirmLetter(hand, glyph) {
    if (!hand.examples) hand.examples = [];
    if (glyph) glyph.confirmed = true;
    if (glyph && glyph.ch && glyph.embedding) {
      var emb = glyph.embedding;
      if (typeof emb !== 'object' || typeof emb.length !== 'number') return hand;
      hand.examples.push({
        ch: glyph.ch,
        embedding: Array.prototype.slice.call(emb)
      });
    }
    return hand;
  }

  function handSummary(hand) {
    var glyphs = (hand && hand.glyphs) || [];
    var by = Object.create(null);
    var conf = 0, nConf = 0, i, g;
    for (i = 0; i < glyphs.length; i++) {
      g = glyphs[i];
      if (!g || !g.ch) continue;
      by[g.ch] = (by[g.ch] || 0) + 1;
      if (typeof g.cnnConf === 'number') { conf += g.cnnConf; nConf++; }
      else if (typeof g.confidence === 'number') { conf += g.confidence; nConf++; }
    }
    var chars = Object.keys(by);
    var totalVariants = 0;
    chars.forEach(function (ch) { totalVariants += by[ch]; });
    return {
      coverage: Math.round((chars.length / 62) * 100),
      variants: chars.length ? +(totalVariants / chars.length).toFixed(2) : 0,
      confidence: nConf ? +(conf / nConf).toFixed(3) : 0
    };
  }

  var STAT_KEYS = ['slant', 'strokeWidth', 'lineGap', 'inkRatio', 'strokeConfidence'];
  var STYLE_KEYS = ['slant', 'xHeight', 'letterGap', 'wordGap', 'lineSpacing', 'baselineWobble',
    'letterGapEm', 'wordGapEm', 'lineSpacingEm', 'baselineWobbleEm'];

  function blendNum(a, b, n0, n1) {
    if (typeof a !== 'number') return b;
    if (typeof b !== 'number') return a;
    return (a * n0 + b * n1) / (n0 + n1);
  }

  function blendStats(prev, next, n0, n1) {
    if (!prev) return next || null;
    if (!next) return prev;
    var out = Object.assign({}, prev);
    var i, k;
    for (i = 0; i < STAT_KEYS.length; i++) {
      k = STAT_KEYS[i];
      if (typeof prev[k] === 'number' && typeof next[k] === 'number') {
        out[k] = +blendNum(prev[k], next[k], n0, n1).toFixed(4);
      }
    }
    out.style = Object.assign({}, prev.style || {});
    for (i = 0; i < STYLE_KEYS.length; i++) {
      k = STYLE_KEYS[i];
      var av = prev.style && prev.style[k];
      var bv = next.style && next.style[k];
      if (typeof av === 'number' || typeof bv === 'number') {
        out.style[k] = +blendNum(av, bv, n0, n1).toFixed(4);
      }
    }
    out.pages = (prev.pages || n0) + (next.pages || n1);
    delete out.thumbs;
    return out;
  }

  function addToHand(hand, harvested, stats) {
    var before = handSummary(hand);
    hand.glyphs = mergeVariants(hand.glyphs, harvested, 6);
    var n0 = hand.sampleCount || (hand.stats && hand.stats.pages) || 1;
    var n1 = (stats && stats.pages) || 1;
    if (stats) {
      hand.stats = blendStats(hand.stats, stats, n0, n1);
      if (hand.stats) delete hand.stats.thumbs;
    }
    hand.sampleCount = n0 + n1;
    var after = handSummary(hand);
    return {
      coverageBefore: before.coverage,
      coverageAfter: after.coverage,
      variantsBefore: before.variants,
      variantsAfter: after.variants,
      confidenceBefore: before.confidence,
      confidenceAfter: after.confidence
    };
  }

  const Harvest = {
    harvestFromPages: harvestFromPages,
    harvestFromPagesAsync: harvestFromPagesAsync,
    mergeVariants: mergeVariants,
    medianCellMetrics: medianCellMetrics,
    collectCrops: collectCrops,
    examplesFromGlyphs: examplesFromGlyphs,
    confirmLetter: confirmLetter,
    addToHand: addToHand,
    inkMask: inkMask,
    components: components,
    assignLabelsAsync: assignLabelsAsync,
    FREQ: FREQ
  };

export { Harvest };
export default Harvest;
