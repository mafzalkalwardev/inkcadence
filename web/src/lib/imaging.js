/* imaging.js — pure-JS analysis of a scanned handwriting page.
   Extracts: paper colour, ink palette (pen / marker), slant, stroke width,
   line spacing, pens, heading treatment and style stats. No dependencies. */
'use strict';
import { measurePage } from './pageanalysis.js';

function canvas(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (typeof document !== 'undefined' && document.createElement) {
      var c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
    return new OffscreenCanvas(w, h);
  }

  function loadImageFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = canvas(img.naturalWidth * s, img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image file.')); };
      img.src = url;
    });
  }

  function toGrayscale(src, maxDim) {
    maxDim = maxDim || 1400;
    var s = Math.min(1, maxDim / Math.max(src.width, src.height));
    var c = canvas(src.width * s, src.height * s);
    var ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0, c.width, c.height);
    var w = c.width, h = c.height;
    var data = ctx.getImageData(0, 0, w, h).data;
    var gray = new Uint8ClampedArray(w * h);
    var hist = new Uint32Array(256);
    for (var i = 0, p = 0; i < data.length; i += 4, p++) {
      var g = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
      gray[p] = g;
      hist[g]++;
    }
    return { gray: gray, hist: hist, w: w, h: h, data: data, canvas: c };
  }

  function otsu(hist) {
    var total = 0, sum = 0, i;
    for (i = 0; i < 256; i++) { total += hist[i]; sum += i * hist[i]; }
    if (!total) return 128;
    var sumB = 0, wB = 0, best = 0, bestVar = -1;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      var wF = total - wB;
      if (!wF) break;
      sumB += i * hist[i];
      var mB = sumB / wB, mF = (sum - sumB) / wF;
      var v = wB * wF * (mB - mF) * (mB - mF);
      if (v > bestVar) { bestVar = v; best = i; }
    }
    return best;
  }

  function inkMask(gray, w, h, th) {
    var ink = new Uint8Array(w * h);
    for (var i = 0; i < gray.length; i++) ink[i] = gray[i] < th ? 1 : 0;
    return ink;
  }

  /* Colour-aware ink: dark pens (black/blue/green), not highlighter or ruled print. */
  function inkMaskRGBA(data, w, h, th) {
    var ink = new Uint8Array(w * h);
    for (var i = 0, p = 0; i < data.length; i += 4, p++) {
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum >= th) { ink[p] = 0; continue; }
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      var sat = mx ? (mx - mn) / mx : 0;
      /* Drop fluorescent highlighter / marker washes (bright + saturated). */
      if (lum > 140 && sat > 0.28) { ink[p] = 0; continue; }
      if (lum > 165) { ink[p] = 0; continue; }
      /* Pale ruled / grid lines (light blue-grey print, not pen). */
      if (lum > 148 && b >= r - 4 && b >= g - 4 && sat < 0.32 && lum > th - 35) {
        ink[p] = 0;
        continue;
      }
      /* Soft phone-photo shadow fringe: mid-dark, nearly grey, not chromatic ink. */
      if (lum > 120 && sat < 0.06 && Math.abs(r - g) < 12 && Math.abs(g - b) < 12) {
        ink[p] = 0;
        continue;
      }
      ink[p] = 1;
    }
    return ink;
  }

  function centroidAt(ink, w, h, x, y, rad) {
    if (y < 0 || y >= h) return null;
    var s = 0, c = 0, dx, xx;
    for (dx = -rad; dx <= rad; dx++) {
      xx = x + dx;
      if (xx < 0 || xx >= w) continue;
      if (ink[y * w + xx]) { s += xx; c++; }
    }
    if (c < 2) return null;
    return s / c;
  }

  function estimateSlant(ink, w, h) {
    var samples = [], y, x, up, dn, rad = 8, dy = 6;
    for (y = dy; y < h - dy; y += 3) {
      for (x = rad; x < w - rad; x += 3) {
        if (!ink[y * w + x]) continue;
        up = centroidAt(ink, w, h, x, y - dy, rad);
        dn = centroidAt(ink, w, h, x, y + dy, rad);
        if (up == null || dn == null) continue;
        samples.push((up - dn) / (2 * dy));
      }
    }
    if (samples.length >= 40) {
      samples.sort(function (a, b) { return a - b; });
      var mid = samples[(samples.length * 0.5) | 0];
      var kept = [];
      for (var si = 0; si < samples.length; si++) {
        if (Math.abs(samples[si] - mid) < 0.25) kept.push(samples[si]);
      }
      if (kept.length >= 40) {
        kept.sort(function (a, b) { return a - b; });
        return kept[(kept.length * 0.5) | 0];
      }
      return mid;
    }
    var xs = [], ys = [];
    for (var y = 0; y < h; y += 2) {
      for (var x = 0; x < w; x += 2) {
        if (ink[y * w + x]) { xs.push(x); ys.push(y); }
      }
    }
    if (xs.length < 300) return 0;
    var best = 0, bestVar = -1;
    for (var si = -12; si <= 12; si++) {
      var sh = si / 20, mn = 1e9, mx = -1e9, k;
      for (k = 0; k < xs.length; k++) {
        var v = xs[k] + sh * ys[k];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      if (mx - mn < 5) continue;
      var hist = new Float64Array(160), span = mx - mn;
      for (k = 0; k < xs.length; k++) {
        var vv = xs[k] + sh * ys[k];
        var b = ((vv - mn) / span * 159) | 0;
        hist[b]++;
      }
      var mean = 0;
      for (var b2 = 0; b2 < 160; b2++) mean += hist[b2];
      mean /= 160;
      var vs = 0;
      for (b2 = 0; b2 < 160; b2++) { var d = hist[b2] - mean; vs += d * d; }
      vs /= 160;
      if (vs > bestVar) { bestVar = vs; best = sh; }
    }
    return best;
  }

  function estimateStroke(ink, w, h) {
    var runs = [];
    for (var y = 0; y < h; y += 3) {
      var run = 0;
      for (var x = 0; x < w; x++) {
        if (ink[y * w + x]) run++;
        else { if (run > 0 && run < 40) runs.push(run); run = 0; }
      }
    }
    if (!runs.length) return 2;
    runs.sort(function (a, b) { return a - b; });
    return runs[(runs.length * 0.5) | 0];
  }

  function estimateLines(ink, w, h) {
    var rows = new Float32Array(h), y, x, mx = 0;
    for (y = 0; y < h; y++) {
      var s = 0;
      for (x = 0; x < w; x++) s += ink[y * w + x];
      rows[y] = s;
      if (s > mx) mx = s;
    }
    if (!mx) return { gap: Math.round(h / 30), bands: 0 };
    var bands = [], cur = 0;
    for (y = 0; y < h; y++) {
      if (rows[y] > mx * 0.05) { if (!cur) cur = y; }
      else if (cur) { bands.push([cur, y]); cur = 0; }
    }
    if (cur) bands.push([cur, h]);
    bands = bands.filter(function (b) { return b[1] - b[0] >= 6; });
    var gaps = [];
    for (var i = 1; i < bands.length; i++) gaps.push(bands[i][0] - bands[i - 1][0]);
    gaps.sort(function (a, b) { return a - b; });
    return { gap: gaps.length ? gaps[(gaps.length * 0.5) | 0] : Math.round(h / 30), bands: bands.length };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
    }).join('');
  }

  function clusterColors(data, w, h) {
    var pts = [], step = 2, i;
    for (var y = 0; y < h; y += step) {
      for (var x = 0; x < w; x += step) {
        i = (y * w + x) * 4;
        var r = data[i], g = data[i + 1], b = data[i + 2];
        var lum = 0.299 * r + 0.587 * g + 0.114 * b;
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (lum < 150 || (mx - mn > 55 && lum < 238)) pts.push([r, g, b, lum]);
      }
    }
    if (pts.length < 40) return [];

    pts.sort(function (a, b) { return a[3] - b[3]; });
    var K = Math.min(3, pts.length);
    var cen = [pts[0], pts[(pts.length * 0.5) | 0], pts[pts.length - 1]].slice(0, K)
      .map(function (p) { return [p[0], p[1], p[2]]; });

    for (var it = 0; it < 8; it++) {
      var sums = cen.map(function () { return [0, 0, 0, 0]; });
      for (var k = 0; k < pts.length; k++) {
        var p = pts[k], bi = 0, bd = Infinity;
        for (var c = 0; c < cen.length; c++) {
          var dr = p[0] - cen[c][0], dg = p[1] - cen[c][1], db = p[2] - cen[c][2];
          var d = dr * dr + dg * dg + db * db;
          if (d < bd) { bd = d; bi = c; }
        }
        sums[bi][0] += p[0]; sums[bi][1] += p[1]; sums[bi][2] += p[2]; sums[bi][3]++;
      }
      for (c = 0; c < cen.length; c++) {
        if (sums[c][3] > 0) {
          cen[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
        }
      }
    }

    var out = [];
    for (var c2 = 0; c2 < cen.length; c2++) {
      var col = cen[c2];
      var share = 0;
      for (k = 0; k < pts.length; k++) {
        var q = pts[k];
        var dd = Math.pow(q[0] - col[0], 2) + Math.pow(q[1] - col[1], 2) + Math.pow(q[2] - col[2], 2);
        if (dd < 2400) share++;
      }
      share /= pts.length;
      if (share < 0.05) continue;
      var R = col[0], G = col[1], B = col[2];
      var lum2 = 0.299 * R + 0.587 * G + 0.114 * B;
      var sat = (Math.max(R, G, B) - Math.min(R, G, B)) / 255;
      var kind = lum2 < 115 ? 'pen' : (sat > 0.18 ? 'marker' : 'faint');
      out.push({ hex: rgbToHex(R, G, B), share: Math.round(share * 100), kind: kind });
    }
    out.sort(function (a, b) { return b.share - a.share; });
    return out;
  }

  function paperColour(data, w, h) {
    var r = 0, g = 0, b = 0, n = 0;
    /* Prefer centre crop so phone vignette / desk edges do not tint paper. */
    var x0 = Math.floor(w * 0.12), x1 = Math.floor(w * 0.88);
    var y0 = Math.floor(h * 0.1), y1 = Math.floor(h * 0.9);
    for (var y = y0; y < y1; y += 3) {
      for (var x = x0; x < x1; x += 3) {
        var i = (y * w + x) * 4;
        var R = data[i], G = data[i + 1], B = data[i + 2];
        var lum = 0.299 * R + 0.587 * G + 0.114 * B;
        if (lum > 200 && Math.max(R, G, B) - Math.min(R, G, B) < 42) {
          r += R; g += G; b += B; n++;
        }
      }
    }
    if (!n) return '#fdfcf7';
    return rgbToHex(r / n, g / n, b / n);
  }

  function longPeaks(energy, n, minLen, minGap) {
    var i, peaks = [], gaps = [], med, keep = 0, g;
    for (i = 1; i < n - 1; i++) {
      if (energy[i] >= minLen && energy[i] >= energy[i - 1] && energy[i] >= energy[i + 1]) {
        if (!peaks.length || i - peaks[peaks.length - 1] > minGap) peaks.push(i);
      }
    }
    if (peaks.length < 8) return peaks.length;
    for (i = 1; i < peaks.length; i++) gaps.push(peaks[i] - peaks[i - 1]);
    gaps.sort(function (a, b) { return a - b; });
    med = gaps[(gaps.length * 0.5) | 0];
    if (!med) return 0;
    for (i = 0; i < gaps.length; i++) {
      g = gaps[i];
      if (Math.abs(g - med) <= med * 0.4) keep++;
    }
    if (keep < gaps.length * 0.65) return 0;
    return peaks.length;
  }

  /* Guess printed paper style from residual light structure after ink mask. */
  function guessPaperStyle(data, ink, w, h) {
    var rowPeaks = 0, colPeaks = 0;
    var y, x, s, prev, mx;
    var rowE = new Float32Array(h);
    for (y = 0; y < h; y++) {
      var run = 0, best = 0;
      for (x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        var lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (!ink[y * w + x] && lum < 210 && lum > 140) { run++; if (run > best) best = run; }
        else run = 0;
      }
      rowE[y] = best;
    }
    rowPeaks = longPeaks(rowE, h, w * 0.45, 12);
    var colE = new Float32Array(w);
    for (x = 0; x < w; x++) {
      run = 0; best = 0;
      for (y = 0; y < h; y++) {
        var ci = (y * w + x) * 4;
        var clum = 0.299 * data[ci] + 0.587 * data[ci + 1] + 0.114 * data[ci + 2];
        if (!ink[y * w + x] && clum < 210 && clum > 140) { run++; if (run > best) best = run; }
        else run = 0;
      }
      colE[x] = best;
    }
    colPeaks = longPeaks(colE, w, h * 0.45, 12);
    if (rowPeaks >= 8 && colPeaks >= 8) return 'grid';
    if (rowPeaks >= 8) return 'ruled';
    return 'plain';
  }

  function deskewGray(gray, w, h, slant) {
    if (!slant || Math.abs(slant) < 0.02) return { gray: gray, w: w, h: h };
    var out = new Uint8ClampedArray(w * h);
    for (var y = 0; y < h; y++) {
      var shift = slant * y;
      for (var x = 0; x < w; x++) {
        var sx = x - shift;
        var x0 = sx | 0;
        if (x0 < 0 || x0 >= w - 1) continue;
        var t = sx - x0;
        out[y * w + x] = gray[y * w + x0] * (1 - t) + gray[y * w + x0 + 1] * t;
      }
    }
    return { gray: out, w: w, h: h };
  }

  function strokeConfidence(ink, w, h, strokeWidth) {
    var runs = [];
    for (var y = 0; y < h; y += 4) {
      var run = 0;
      for (var x = 0; x < w; x++) {
        if (ink[y * w + x]) run++;
        else { if (run > 0 && run < 50) runs.push(run); run = 0; }
      }
    }
    if (runs.length < 20) return 0.35;
    var mean = 0;
    for (var i = 0; i < runs.length; i++) mean += runs[i];
    mean /= runs.length;
    var varSum = 0;
    for (i = 0; i < runs.length; i++) {
      var d = runs[i] - mean;
      varSum += d * d;
    }
    var sd = Math.sqrt(varSum / runs.length);
    var cv = mean ? sd / mean : 1;
    var near = Math.abs(mean - strokeWidth) < 3 ? 1 : 0.7;
    return Math.max(0.2, Math.min(1, (1 - Math.min(1, cv)) * near));
  }

  function paperLikePixel(r, g, b) {
    var lum = 0.299 * r + 0.587 * g + 0.114 * b;
    var sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    return lum > 176 && sat < 0.22;
  }

  function fitLine(pts) {
    var n = pts.length;
    if (n < 4) return null;
    var sa = 0, sb = 0, sab = 0, saa = 0, i, a, b;
    for (i = 0; i < n; i++) {
      a = pts[i][0]; b = pts[i][1];
      sa += a; sb += b; sab += a * b; saa += a * a;
    }
    var den = n * saa - sa * sa;
    if (Math.abs(den) < 1e-6) return null;
    return { m: (n * sab - sa * sb) / den, k: (sb - ((n * sab - sa * sb) / den) * sa) / n };
  }

  function solve8(A, b) {
    var n = 8;
    var M = A.map(function (row, i) { return row.concat([b[i]]); });
    var col, r, piv, c, tmp, div, f;
    for (col = 0; col < n; col++) {
      piv = col;
      for (r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      }
      if (Math.abs(M[piv][col]) < 1e-8) throw new Error('Could not straighten the page.');
      tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
      div = M[col][col];
      for (c = col; c <= n; c++) M[col][c] /= div;
      for (r = 0; r < n; r++) {
        if (r === col) continue;
        f = M[r][col];
        if (!f) continue;
        for (c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    return M.map(function (row) { return row[n]; });
  }

  function homography(src, dst) {
    var A = [], b = [], i, x, y, u, v;
    for (i = 0; i < 4; i++) {
      x = src[i].x; y = src[i].y; u = dst[i].x; v = dst[i].y;
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
      b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
      b.push(v);
    }
    var h = solve8(A, b);
    h.push(1);
    return h;
  }

  function applyH(H, x, y) {
    var w = H[6] * x + H[7] * y + H[8];
    if (!w) return null;
    return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
  }

  function sampleBilinear(data, w, h, x, y) {
    if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return null;
    var x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
    var w1 = w * 4;
    var i00 = y0 * w1 + x0 * 4, i10 = i00 + 4, i01 = i00 + w1, i11 = i01 + 4;
    var rx = 1 - fx, ry = 1 - fy, out = [0, 0, 0], k;
    for (k = 0; k < 3; k++) {
      out[k] = data[i00 + k] * rx * ry + data[i10 + k] * fx * ry + data[i01 + k] * rx * fy + data[i11 + k] * fx * fy;
    }
    return out;
  }

  function warpQuad(src, corners, dw, dh) {
    var dst = [{ x: 0, y: 0 }, { x: dw - 1, y: 0 }, { x: dw - 1, y: dh - 1 }, { x: 0, y: dh - 1 }];
    var Hinv;
    try { Hinv = homography(dst, corners); }
    catch (e) { return null; }
    var out = canvas(dw, dh);
    var simg = src.getContext('2d').getImageData(0, 0, src.width, src.height);
    var dimg = out.getContext('2d').createImageData(dw, dh);
    var sd = simg.data, dd = dimg.data, y, x, p, rgb, o;
    for (y = 0; y < dh; y++) {
      for (x = 0; x < dw; x++) {
        o = (y * dw + x) * 4;
        p = applyH(Hinv, x + 0.5, y + 0.5);
        rgb = p ? sampleBilinear(sd, src.width, src.height, p.x, p.y) : null;
        if (!rgb) { dd[o] = 255; dd[o + 1] = 255; dd[o + 2] = 255; dd[o + 3] = 255; }
        else { dd[o] = rgb[0]; dd[o + 1] = rgb[1]; dd[o + 2] = rgb[2]; dd[o + 3] = 255; }
      }
    }
    out.getContext('2d').putImageData(dimg, 0, 0);
    return out;
  }

  /* Crop a page that sits on a darker desk, and unwarp it when the edges tilt. */
  function straightenPage(src) {
    if (!src || !src.width || !src.height) return null;
    var maxDim = 900;
    var scale = Math.min(1, maxDim / Math.max(src.width, src.height));
    var c = canvas(src.width * scale, src.height * scale);
    var ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0, c.width, c.height);
    var w = c.width, h = c.height;
    var data = ctx.getImageData(0, 0, w, h).data;
    var mask = new Uint8Array(w * h);
    var nPaper = 0, i, p, x, y;
    for (i = 0, p = 0; i < data.length; i += 4, p++) {
      if (paperLikePixel(data[i], data[i + 1], data[i + 2])) { mask[p] = 1; nPaper++; }
    }
    if (nPaper < w * h * 0.25) return null;
    var minX = w, minY = h, maxX = 0, maxY = 0;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    var bw = maxX - minX, bh = maxY - minY;
    if (bw < w * 0.45 || bh < h * 0.45) return null;
    var inset = minX > w * 0.03 && minY > h * 0.03 && (w - maxX) > w * 0.03 && (h - maxY) > h * 0.03;
    if (!inset || (1 - (bw * bh) / (w * h)) < 0.08) return null;
    var inLum = 0, inN = 0, outLum = 0, outN = 0, lum;
    for (y = 0; y < h; y += 3) {
      for (x = 0; x < w; x += 3) {
        i = (y * w + x) * 4;
        lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) { inLum += lum; inN++; }
        else { outLum += lum; outN++; }
      }
    }
    if (!outN || !inN || outLum / outN > inLum / inN - 35) return null;

    var left = [], right = [], top = [], bot = [];
    for (y = minY; y <= maxY; y += 4) {
      var xL = -1, xR = -1;
      for (x = minX; x <= maxX; x++) if (mask[y * w + x]) { xL = x; break; }
      for (x = maxX; x >= minX; x--) if (mask[y * w + x]) { xR = x; break; }
      if (xL >= 0) left.push([y, xL]);
      if (xR >= 0) right.push([y, xR]);
    }
    for (x = minX; x <= maxX; x += 4) {
      var yT = -1, yB = -1;
      for (y = minY; y <= maxY; y++) if (mask[y * w + x]) { yT = y; break; }
      for (y = maxY; y >= minY; y--) if (mask[y * w + x]) { yB = y; break; }
      if (yT >= 0) top.push([x, yT]);
      if (yB >= 0) bot.push([x, yB]);
    }
    function edgeCorner(vert, horiz) {
      if (!vert || !horiz) return null;
      var den = 1 - vert.m * horiz.m;
      if (Math.abs(den) < 1e-4) return null;
      var cx = (vert.m * horiz.k + vert.k) / den;
      return { x: cx, y: horiz.m * cx + horiz.k };
    }
    var tl = edgeCorner(fitLine(left), fitLine(top));
    var tr = edgeCorner(fitLine(right), fitLine(top));
    var br = edgeCorner(fitLine(right), fitLine(bot));
    var bl = edgeCorner(fitLine(left), fitLine(bot));
    function dist(a, b) {
      if (!a || !b) return 0;
      var dx = a.x - b.x, dy = a.y - b.y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    var tilted = tl && tr && br && bl && (
      Math.abs(tl.x - bl.x) > w * 0.02 || Math.abs(tr.x - br.x) > w * 0.02 ||
      Math.abs(tl.y - tr.y) > h * 0.02 || Math.abs(bl.y - br.y) > h * 0.02
    );
    if (tilted) {
      var cx = (tl.x + tr.x + br.x + bl.x) / 4;
      var cy = (tl.y + tr.y + br.y + bl.y) / 4;
      function pullIn(p) {
        var dx = cx - p.x, dy = cy - p.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var step = Math.min(8, len * 0.5);
        return { x: p.x + dx / len * step, y: p.y + dy / len * step };
      }
      var quad = [pullIn(tl), pullIn(tr), pullIn(br), pullIn(bl)];
      var dw = Math.max(32, Math.round((dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2));
      var dh = Math.max(32, Math.round((dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2));
      var warped = warpQuad(c, quad, dw, dh);
      if (warped) return warped;
    }
    var cropped = canvas(bw, bh);
    cropped.getContext('2d').drawImage(c, minX, minY, bw, bh, 0, 0, bw, bh);
    return cropped;
  }

  function analyze(srcCanvas) {
    var page = straightenPage(srcCanvas);
    var pageCorrected = !!page;
    if (page) srcCanvas = page;
    var g = toGrayscale(srcCanvas, 1400);
    /* Slightly higher cap helps blue/green pens on cream paper under phone JPEG. */
    var th = Math.min(otsu(g.hist), 182);
    var ink = inkMaskRGBA(g.data, g.w, g.h, th);
    var slant = estimateSlant(ink, g.w, g.h);
    /* Extreme slant is almost always a polluted mask — clamp for style packs. */
    if (Math.abs(slant) > 0.35) slant = Math.max(-0.35, Math.min(0.35, slant * 0.4));
    var deskewed = deskewGray(g.gray, g.w, g.h, slant);
    /* Rebuild RGBA-scale mask on the original colour field (deskew only for lines/stroke). */
    var ink2 = inkMask(deskewed.gray, deskewed.w, deskewed.h, th);
    /* Prefer colour-aware mask for ratio / palette-adjacent stats when it looks sane. */
    var inkCount = 0, i;
    for (i = 0; i < ink.length; i++) inkCount += ink[i];
    var ratio = inkCount / ink.length;
    if (ratio < 0.002 || ratio > 0.22) {
      inkCount = 0;
      for (i = 0; i < ink2.length; i++) inkCount += ink2[i];
      ratio = inkCount / ink2.length;
    }

    var lines = estimateLines(ink2, deskewed.w, deskewed.h);
    var palette = clusterColors(g.data, g.w, g.h);
    var strokeWidth = estimateStroke(ink2, deskewed.w, deskewed.h);
    var conf = +strokeConfidence(ink2, deskewed.w, deskewed.h, strokeWidth).toFixed(3);
    var patterns = estimatePatterns(ink2, deskewed.w, deskewed.h, lines, conf, slant);
    patterns.paperStyle = guessPaperStyle(g.data, ink, g.w, g.h);

    var thumb = canvas(420, 420 * g.h / g.w);
    thumb.getContext('2d').drawImage(g.canvas, 0, 0, thumb.width, thumb.height);
    var thumbUrl = '';
    try {
      if (typeof thumb.toDataURL === 'function') thumbUrl = thumb.toDataURL('image/jpeg', 0.6);
    } catch (eThumb) { thumbUrl = ''; }
    var measured = measurePage(g.data, ink, g.w, g.h, +slant.toFixed(3));

    return {
      width: srcCanvas.width,
      height: srcCanvas.height,
      threshold: th,
      inkRatio: +ratio.toFixed(4),
      slant: +slant.toFixed(3),
      strokeWidth: strokeWidth,
      strokeConfidence: conf,
      lineGap: lines.gap,
      lineBands: lines.bands,
      paper: paperColour(g.data, g.w, g.h),
      paperStyle: patterns.paperStyle,
      palette: palette,
      patterns: patterns,
      pens: measured.pens,
      lines: measured.lines,
      heading: measured.heading,
      style: measured.style,
      pageCorrected: pageCorrected,
      thumb: thumbUrl
    };
  }

  /* Pattern cues from a full assignment page (no alphabet sheet). */
  function estimatePatterns(ink, w, h, lines, conf, slant) {
    var bands = lines.bands || 0;
    var gap = lines.gap || Math.round(h / 30);
    var topInk = 0, midInk = 0, botInk = 0, i;
    var topEnd = Math.floor(h * 0.22), midEnd = Math.floor(h * 0.72);
    for (i = 0; i < ink.length; i++) {
      if (!ink[i]) continue;
      var y = (i / w) | 0;
      if (y < topEnd) topInk++;
      else if (y < midEnd) midInk++;
      else botInk++;
    }
    var total = Math.max(1, topInk + midInk + botInk);
    var topShare = topInk / total;
    /* Headings / titles usually dump more ink in the upper band. */
    var headingWeight = topShare > 0.34 ? 'strong' : (topShare > 0.22 ? 'medium' : 'none');
    var spacingRegular = bands > 4 && gap > 18 && gap < h * 0.12 ? 0.8 : 0.45;
    var neatness = Math.max(0.15, Math.min(0.98,
      conf * 0.55 + spacingRegular * 0.3 + (1 - Math.min(1, Math.abs(slant) * 2)) * 0.15
    ));
    return {
      neatness: +neatness.toFixed(3),
      headingWeight: headingWeight,
      topInkShare: +topShare.toFixed(3),
      lineBands: bands,
      qualityGuess: neatness >= 0.72 ? 'best' : 'normal'
    };
  }

  /* combine several pages into one style statistic */
  function mergeAnalyses(list) {
    if (!list.length) throw new Error('No pages analysed.');
    var byHex = {}, slants = [], strokes = [], gaps = [], ratios = [];
    var paperVotes = {};
    var confs = [];
    list.forEach(function (a) {
      slants.push(a.slant); strokes.push(a.strokeWidth); gaps.push(a.lineGap); ratios.push(a.inkRatio);
      if (a.strokeConfidence != null) confs.push(a.strokeConfidence);
      paperVotes[a.paper] = (paperVotes[a.paper] || 0) + 1;
      a.palette.forEach(function (c) {
        var e = byHex[c.hex] || (byHex[c.hex] = { hex: c.hex, kind: c.kind, share: 0, hits: 0 });
        e.share += c.share; e.hits++;
        if (!e.kind || e.kind === 'faint') e.kind = c.kind;
      });
    });
    function median(arr) {
      arr.sort(function (a, b) { return a - b; });
      return arr[(arr.length * 0.5) | 0];
    }
    var palette = Object.keys(byHex).map(function (k) { return byHex[k]; })
      .sort(function (a, b) { return (b.hits - a.hits) || (b.share - a.share); })
      .slice(0, 6)
      .map(function (c) {
        return { hex: c.hex, kind: c.kind, share: Math.round(c.share / list.length), pages: c.hits };
      });

    var paper = Object.keys(paperVotes).sort(function (a, b) { return paperVotes[b] - paperVotes[a]; })[0];
    var neatVals = [], headingVotes = { strong: 0, medium: 0, none: 0 };
    var styleVotes = { ruled: 0, grid: 0, plain: 0 };
    list.forEach(function (a) {
      if (a.patterns) {
        if (a.patterns.neatness != null) neatVals.push(a.patterns.neatness);
        if (a.patterns.headingWeight) headingVotes[a.patterns.headingWeight] = (headingVotes[a.patterns.headingWeight] || 0) + 1;
        if (a.patterns.paperStyle) styleVotes[a.patterns.paperStyle] = (styleVotes[a.patterns.paperStyle] || 0) + 1;
      }
      if (a.paperStyle) styleVotes[a.paperStyle] = (styleVotes[a.paperStyle] || 0) + 1;
    });
    var headingWeight = Object.keys(headingVotes).sort(function (a, b) {
      return headingVotes[b] - headingVotes[a];
    })[0] || 'medium';
    var paperStyle = Object.keys(styleVotes).sort(function (a, b) {
      return styleVotes[b] - styleVotes[a];
    })[0] || 'ruled';
    var neatness = neatVals.length ? +median(neatVals.slice()).toFixed(3) : (confs.length ? +median(confs.slice()).toFixed(3) : 0.5);
    var penMap = {};
    list.forEach(function (a) {
      (a.pens || []).forEach(function (p) {
        var e = penMap[p.hex] || (penMap[p.hex] = { hex: p.hex, kind: p.kind, role: p.role, width: 0, share: 0, n: 0 });
        e.width += p.width || 0;
        e.share += p.share || 0;
        e.n++;
        if (p.role === 'heading') e.role = 'heading';
        if (p.kind && p.kind !== 'pen') e.kind = p.kind;
      });
    });
    var pens = Object.keys(penMap).map(function (k) {
      var e = penMap[k];
      return {
        hex: e.hex, kind: e.kind, role: e.role,
        width: +(e.width / e.n).toFixed(1),
        share: Math.round(e.share / e.n)
      };
    });
    function medKey(key) {
      var xs = [];
      list.forEach(function (a) {
        if (a.style && typeof a.style[key] === 'number') xs.push(a.style[key]);
      });
      return xs.length ? +median(xs.slice()).toFixed(3) : 0;
    }
    var heads = [];
    list.forEach(function (a) { if (a.heading && a.heading.pen) heads.push(a.heading); });
    var heading = null;
    if (heads.length) {
      heading = {
        pen: heads[0].pen,
        scale: +median(heads.map(function (h) { return h.scale || 1; }).slice()).toFixed(2),
        underline: heads.some(function (h) { return !!h.underline; }),
        case: heads[0].case || 'mixed'
      };
    }
    var style = {
      slant: +median(slants.slice()).toFixed(3),
      xHeight: medKey('xHeight'),
      letterGap: medKey('letterGap'),
      wordGap: medKey('wordGap'),
      lineSpacing: medKey('lineSpacing'),
      baselineWobble: medKey('baselineWobble'),
      letterGapEm: medKey('letterGapEm'),
      wordGapEm: medKey('wordGapEm'),
      lineSpacingEm: medKey('lineSpacingEm'),
      baselineWobbleEm: medKey('baselineWobbleEm')
    };
    return {
      pages: list.length,
      slant: +median(slants.slice()).toFixed(3),
      strokeWidth: median(strokes.slice()),
      strokeConfidence: confs.length ? +median(confs.slice()).toFixed(3) : 0.5,
      lineGap: median(gaps.slice()),
      inkRatio: +median(ratios.slice()).toFixed(4),
      paper: paper || '#fdfcf7',
      paperStyle: paperStyle,
      palette: palette,
      patterns: {
        neatness: neatness,
        headingWeight: headingWeight,
        paperStyle: paperStyle,
        qualityGuess: neatness >= 0.72 ? 'best' : 'normal'
      },
      pens: pens,
      heading: heading,
      style: style,
      thumbs: list.map(function (a) { return a.thumb; }).filter(Boolean)
    };
  }

  const Imaging = {
    loadImageFile: loadImageFile,
    canvas: canvas,
    analyze: analyze,
    mergeAnalyses: mergeAnalyses,
    toGrayscale: toGrayscale,
    otsu: otsu,
    deskewGray: deskewGray,
    strokeConfidence: strokeConfidence,
    inkMaskRGBA: inkMaskRGBA,
    guessPaperStyle: guessPaperStyle
  };

export { Imaging, analyze, mergeAnalyses };
export default Imaging;
