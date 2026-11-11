'use strict';
/* lettersheet.js — A4 letter sheet with corner marks.
   The same geometry is drawn, printed, and read back from a phone photo. */

import { Glyphs } from './glyphs.js';

var PAGE_MM_W = 210;
var PAGE_MM_H = 297;
var PAGE_W = 1000;
var PAGE_H = Math.round(PAGE_W * PAGE_MM_H / PAGE_MM_W);
var BASELINE = 0.76;

var LOWER = 'abcdefghijklmnopqrstuvwxyz';
var UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
var DIGITS = '0123456789';
var SYMBOLS = '.,;:!?\u0027"-()/&@#%';

var FIDUCIALS_MM = [
  { x: 14, y: 14 },
  { x: 196, y: 14 },
  { x: 196, y: 283 },
  { x: 14, y: 283 }
];
var FIDUCIAL_R_MM = 8;

function px(mm, axis) {
  return mm / (axis === 'y' ? PAGE_MM_H : PAGE_MM_W) * (axis === 'y' ? PAGE_H : PAGE_W);
}

function canvasOf(w, h) {
  var c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function versionBits(kind, page) {
  var bits = [1, 0, 1, 1, kind ? 1 : 0, (page >> 1) & 1, page & 1, 0];
  var parity = 0;
  var i;
  for (i = 0; i < 7; i++) parity ^= bits[i];
  bits[7] = parity;
  return bits;
}

function layoutLower() {
  var cells = [];
  var originX = 24, originY = 32, groupW = 80, rowH = 18.4;
  var labelW = 5, boxW = 23, boxH = 15.6, gap = 1.4;
  var i, v, group, row, gx, gy;
  for (i = 0; i < LOWER.length; i++) {
    group = i % 2;
    row = (i / 2) | 0;
    gx = originX + group * groupW;
    gy = originY + row * rowH;
    for (v = 0; v < 3; v++) {
      cells.push({
        ch: LOWER.charAt(i),
        variant: v,
        x: gx + labelW + v * (boxW + gap),
        y: gy,
        w: boxW,
        h: boxH
      });
    }
  }
  return cells;
}

function layoutRest() {
  var items = [];
  var i, v, ch;
  for (i = 0; i < DIGITS.length; i++) {
    for (v = 0; v < 3; v++) items.push({ ch: DIGITS.charAt(i), variant: v });
  }
  for (i = 0; i < UPPER.length; i++) items.push({ ch: UPPER.charAt(i), variant: 0 });
  for (i = 0; i < SYMBOLS.length; i++) items.push({ ch: SYMBOLS.charAt(i), variant: 0 });
  return packGrid(items, 8, 18, 20, 1.8, 2);
}

function packGrid(items, cols, boxW, boxH, gapX, gapY) {
  var originX = 24, originY = 32;
  return items.map(function (item, i) {
    var c = i % cols;
    var r = (i / cols) | 0;
    return {
      ch: item.ch,
      variant: item.variant,
      x: originX + c * (boxW + gapX),
      y: originY + r * (boxH + gapY),
      w: boxW,
      h: boxH
    };
  });
}

function layoutFull() {
  return [
    { kind: 0, page: 0, cells: layoutLower() },
    { kind: 0, page: 1, cells: layoutRest() }
  ];
}

function layoutFillIn(chars) {
  var list = Array.from(chars || []).filter(function (ch) { return ch && String(ch).length === 1; });
  var per = 8 * 8;
  var pages = [];
  var start = 0;
  if (!list.length) {
    return [{ kind: 1, page: 0, cells: [] }];
  }
  while (start < list.length) {
    var slice = list.slice(start, start + per).map(function (ch) { return { ch: ch, variant: 0 }; });
    pages.push({
      kind: 1,
      page: pages.length,
      cells: packGrid(slice, 8, 18, 20, 1.8, 2)
    });
    start += per;
  }
  return pages;
}

function drawFiducial(ctx, cx, cy, r) {
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.30, 0, Math.PI * 2);
  ctx.fill();
}

function draw(canvas, page) {
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  var ctx = canvas.getContext('2d');
  var sx = PAGE_W / PAGE_MM_W;
  var sy = PAGE_H / PAGE_MM_H;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  FIDUCIALS_MM.forEach(function (f) {
    drawFiducial(ctx, f.x * sx, f.y * sy, FIDUCIAL_R_MM * sx);
  });
  var bits = versionBits(page.kind, page.page);
  var bit = 3.2 * sx;
  var gap = 0.8 * sx;
  var x0 = 28 * sx;
  var y0 = 8 * sy;
  bits.forEach(function (on, i) {
    if (!on) return;
    ctx.fillStyle = '#111111';
    ctx.fillRect(x0 + i * (bit + gap), y0, bit, bit);
  });
  ctx.fillStyle = '#1c2838';
  ctx.font = '600 ' + Math.round(5 * sy) + 'px sans-serif';
  ctx.fillText(page.kind ? 'Fill-in sheet' : 'Letter sheet', 28 * sx, 22 * sy);
  ctx.fillStyle = '#5c6b7c';
  ctx.font = Math.round(3.1 * sy) + 'px sans-serif';
  ctx.fillText('Write one character in each box, sitting on the line.', 28 * sx, 27 * sy);
  page.cells.forEach(function (cell) { drawCell(ctx, cell, sx, sy); });
  return canvas;
}

function drawCell(ctx, cell, sx, sy) {
  var x = cell.x * sx, y = cell.y * sy, w = cell.w * sx, h = cell.h * sy;
  ctx.strokeStyle = '#c5d0dc';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = '#d5dee8';
  ctx.beginPath();
  ctx.moveTo(x + 2, y + h * BASELINE);
  ctx.lineTo(x + w - 2, y + h * BASELINE);
  ctx.stroke();
  ctx.fillStyle = '#d5dee6';
  ctx.font = Math.round(Math.max(8, h * 0.16)) + 'px sans-serif';
  ctx.fillText(cell.ch, x + 3, y + Math.max(10, h * 0.18));
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
    if (Math.abs(M[piv][col]) < 1e-10) throw new Error('Could not line the sheet up from the corner marks.');
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
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w
  };
}

function sampleBilinear(data, w, h, x, y) {
  if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return null;
  var x0 = x | 0, y0 = y | 0;
  var fx = x - x0, fy = y - y0;
  var w1 = w * 4;
  var i00 = y0 * w1 + x0 * 4;
  var i10 = i00 + 4;
  var i01 = i00 + w1;
  var i11 = i01 + 4;
  var rx = 1 - fx, ry = 1 - fy;
  var out = [0, 0, 0];
  var k;
  for (k = 0; k < 3; k++) {
    out[k] = data[i00 + k] * rx * ry + data[i10 + k] * fx * ry + data[i01 + k] * rx * fy + data[i11 + k] * fx * fy;
  }
  return out;
}

function warpSample(src, Hinv, dw, dh) {
  var dst = canvasOf(dw, dh);
  var sctx = src.getContext('2d');
  var simg = sctx.getImageData(0, 0, src.width, src.height);
  var dimg = dst.getContext('2d').createImageData(dw, dh);
  var sd = simg.data, dd = dimg.data;
  var sw = src.width, sh = src.height;
  var y, x, p, rgb, o;
  for (y = 0; y < dh; y++) {
    for (x = 0; x < dw; x++) {
      o = (y * dw + x) * 4;
      p = applyH(Hinv, x + 0.5, y + 0.5);
      rgb = sampleBilinear(sd, sw, sh, p.x, p.y);
      if (!rgb) {
        dd[o] = 255; dd[o + 1] = 255; dd[o + 2] = 255; dd[o + 3] = 255;
      } else {
        dd[o] = rgb[0]; dd[o + 1] = rgb[1]; dd[o + 2] = rgb[2]; dd[o + 3] = 255;
      }
    }
  }
  dst.getContext('2d').putImageData(dimg, 0, 0);
  return dst;
}

function paintWarp(dst, src, srcPts, dstPts) {
  var Hinv = homography(dstPts, srcPts);
  var sctx = src.getContext('2d');
  var simg = sctx.getImageData(0, 0, src.width, src.height);
  var dctx = dst.getContext('2d');
  var dimg = dctx.getImageData(0, 0, dst.width, dst.height);
  var sd = simg.data, dd = dimg.data;
  var dw = dst.width, dh = dst.height;
  var minX = dw, minY = dh, maxX = 0, maxY = 0, i, y, x, p, rgb, o;
  for (i = 0; i < dstPts.length; i++) {
    if (dstPts[i].x < minX) minX = dstPts[i].x;
    if (dstPts[i].y < minY) minY = dstPts[i].y;
    if (dstPts[i].x > maxX) maxX = dstPts[i].x;
    if (dstPts[i].y > maxY) maxY = dstPts[i].y;
  }
  minX = Math.max(0, Math.floor(minX));
  minY = Math.max(0, Math.floor(minY));
  maxX = Math.min(dw - 1, Math.ceil(maxX));
  maxY = Math.min(dh - 1, Math.ceil(maxY));
  for (y = minY; y <= maxY; y++) {
    for (x = minX; x <= maxX; x++) {
      p = applyH(Hinv, x + 0.5, y + 0.5);
      rgb = sampleBilinear(sd, src.width, src.height, p.x, p.y);
      if (!rgb) continue;
      o = (y * dw + x) * 4;
      dd[o] = rgb[0]; dd[o + 1] = rgb[1]; dd[o + 2] = rgb[2]; dd[o + 3] = 255;
    }
  }
  dctx.putImageData(dimg, 0, 0);
  return dst;
}

function downLum(canvas) {
  var maxDim = 1100;
  var scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
  var sw = Math.max(1, Math.round(canvas.width * scale));
  var sh = Math.max(1, Math.round(canvas.height * scale));
  var tmp = canvasOf(sw, sh);
  tmp.getContext('2d').drawImage(canvas, 0, 0, sw, sh);
  var data = tmp.getContext('2d').getImageData(0, 0, sw, sh).data;
  var lum = new Uint8Array(sw * sh);
  var i, p;
  for (i = 0, p = 0; i < data.length; i += 4, p++) {
    lum[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return { lum: lum, sw: sw, sh: sh, scale: scale };
}

function lumAt(view, x, y) {
  var ix = x | 0, iy = y | 0;
  if (ix < 0 || iy < 0 || ix >= view.sw || iy >= view.sh) return 255;
  return view.lum[iy * view.sw + ix];
}

function fiducialScore(view, x, y, r) {
  var center = lumAt(view, x, y);
  var ring0 = lumAt(view, x + r * 0.48, y);
  if (center > ring0 - 30) return 0;
  var hit = 0, need = 0, i, a, cs, sn, ring, outer, outside;
  for (i = 0; i < 8; i++) {
    a = (i / 8) * Math.PI * 2;
    cs = Math.cos(a); sn = Math.sin(a);
    ring = lumAt(view, x + cs * r * 0.48, y + sn * r * 0.48);
    outer = lumAt(view, x + cs * r * 0.84, y + sn * r * 0.84);
    outside = lumAt(view, x + cs * r * 1.28, y + sn * r * 1.28);
    need += 3;
    if (ring > center + 28) hit++;
    if (outer < ring - 28) hit++;
    if (outside > outer + 18) hit++;
  }
  return hit / need;
}

function findFiducials(canvas) {
  var view = downLum(canvas);
  var minSide = Math.min(view.sw, view.sh);
  var radii = [];
  var frac, r, stride, y, x, score, hits, kept, i, h;
  var base = (FIDUCIAL_R_MM / PAGE_MM_W) * minSide;
  for (frac = 0.28; frac <= 1.05; frac += 0.08) {
    r = base * frac;
    if (r >= 6) radii.push(r);
  }
  hits = [];
  for (i = 0; i < radii.length; i++) {
    r = radii[i];
    stride = Math.max(3, r * 0.42 | 0);
    for (y = r; y < view.sh - r; y += stride) {
      for (x = r; x < view.sw - r; x += stride) {
        score = fiducialScore(view, x, y, r);
        if (score >= 0.75) hits.push({ x: x / view.scale, y: y / view.scale, score: score, r: r / view.scale });
      }
    }
  }
  hits.sort(function (a, b) { return b.score - a.score; });
  kept = [];
  for (i = 0; i < hits.length; i++) {
    h = hits[i];
    if (kept.some(function (k) { return Math.hypot(k.x - h.x, k.y - h.y) < h.r * 0.8; })) continue;
    kept.push(h);
    if (kept.length >= 8) break;
  }
  return bestQuad(kept);
}

function orderCorners(pts) {
  function pick(fn) {
    return pts.reduce(function (best, p) { return fn(p, best) ? p : best; });
  }
  var tl = pick(function (p, b) { return p.x + p.y < b.x + b.y; });
  var br = pick(function (p, b) { return p.x + p.y > b.x + b.y; });
  var tr = pick(function (p, b) { return p.y - p.x < b.y - b.x; });
  var bl = pick(function (p, b) { return p.y - p.x > b.y - b.x; });
  return [tl, tr, br, bl];
}

function quadArea(pts) {
  var a = 0, i, j;
  for (i = 0; i < 4; i++) {
    j = (i + 1) % 4;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}

function bestQuad(pts) {
  var best = null, bestArea = 0, n = pts.length, a, b, c, d, quad, area;
  if (n < 4) return null;
  for (a = 0; a < n; a++) {
    for (b = a + 1; b < n; b++) {
      for (c = b + 1; c < n; c++) {
        for (d = c + 1; d < n; d++) {
          quad = orderCorners([pts[a], pts[b], pts[c], pts[d]]);
          if (new Set(quad).size < 4) continue;
          area = quadArea(quad);
          if (area > bestArea) { bestArea = area; best = quad; }
        }
      }
    }
  }
  if (!best || bestArea < 1000) return null;
  return best;
}

function pageFor(kind, page, chars) {
  var pages = kind ? layoutFillIn(chars || []) : layoutFull();
  var found = null;
  pages.forEach(function (p) { if (p.page === page) found = p; });
  return found;
}

function readVersion(aligned) {
  var sx = PAGE_W / PAGE_MM_W;
  var sy = PAGE_H / PAGE_MM_H;
  var bit = 3.2 * sx;
  var gap = 0.8 * sx;
  var x0 = 28 * sx;
  var y0 = 8 * sy;
  var ctx = aligned.getContext('2d');
  var paper = ctx.getImageData(Math.round(64 * sx), Math.round(y0 + bit / 2), 1, 1).data;
  var paperL = paper[0] * 0.299 + paper[1] * 0.587 + paper[2] * 0.114;
  var bits = [];
  var i, img, L;
  for (i = 0; i < 8; i++) {
    img = ctx.getImageData(
      Math.round(x0 + i * (bit + gap) + bit * 0.35),
      Math.round(y0 + bit * 0.35),
      Math.max(1, Math.round(bit * 0.3)),
      Math.max(1, Math.round(bit * 0.3))
    ).data;
    L = 0;
    for (var p = 0; p < img.length; p += 4) L += img[p] * 0.299 + img[p + 1] * 0.587 + img[p + 2] * 0.114;
    L /= img.length / 4;
    bits.push(L < paperL - 35 ? 1 : 0);
  }
  var parity = 0;
  for (i = 0; i < 7; i++) parity ^= bits[i];
  if (bits[0] !== 1 || bits[1] !== 0 || bits[2] !== 1 || bits[3] !== 1 || bits[7] !== parity) {
    throw new Error('This photo is not an Inkcadence letter sheet.');
  }
  return { kind: bits[4], page: (bits[5] << 1) | bits[6] };
}

function cellPixels(cell) {
  var sx = PAGE_W / PAGE_MM_W;
  var sy = PAGE_H / PAGE_MM_H;
  return { x: cell.x * sx, y: cell.y * sy, w: cell.w * sx, h: cell.h * sy };
}

function measureInk(scan, box) {
  var ctx = scan.getContext('2d');
  var sx = Math.max(0, Math.round(box.x));
  var sy = Math.max(0, Math.round(box.y));
  var sw = Math.min(scan.width - sx, Math.round(box.w));
  var sh = Math.min(scan.height - sy, Math.round(box.h));
  if (sw < 4 || sh < 4) return null;
  var data = ctx.getImageData(sx, sy, sw, sh).data;
  var n = 0, xs = 0, ys = 0, rr = 0, gg = 0, bb = 0;
  var y, x, i, L;
  for (y = 0; y < sh; y++) {
    for (x = 0; x < sw; x++) {
      if (x < sw * 0.24 && y < sh * 0.22) continue;
      i = (y * sw + x) * 4;
      L = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (L > 145) continue;
      n++;
      xs += x; ys += y;
      rr += data[i]; gg += data[i + 1]; bb += data[i + 2];
    }
  }
  if (n < 18) return null;
  function hex(v) { return ('0' + Math.round(v).toString(16)).slice(-2); }
  return {
    x: xs / n / sw,
    y: ys / n / sh,
    ink: '#' + hex(rr / n) + hex(gg / n) + hex(bb / n)
  };
}

function read(scan, opts) {
  opts = opts || {};
  var marks = findFiducials(scan);
  if (!marks) throw new Error('Could not see the four corner marks. Photograph the whole sheet, with every corner in the frame.');
  var canon = FIDUCIALS_MM.map(function (f) { return { x: px(f.x, 'x'), y: px(f.y, 'y') }; });
  var Hinv = homography(canon, marks);
  var aligned = warpSample(scan, Hinv, PAGE_W, PAGE_H);
  var ver = readVersion(aligned);
  if (ver.kind && !(opts.chars && opts.chars.length)) {
    throw new Error('This is a fill-in sheet. Read it with the same character list that was printed.');
  }
  var spec = pageFor(ver.kind, ver.page, opts.chars);
  if (!spec) throw new Error('This sheet page is not one this app can read.');
  var glyphs = [], missing = [];
  spec.cells.forEach(function (cell) {
    var box = cellPixels(cell);
    var ink = measureInk(aligned, box);
    var g = ink && Glyphs.extractCell(aligned, box.x, box.y, box.w, box.h, true, cell.ch);
    if (!g || !ink) {
      missing.push(cell.ch);
      return;
    }
    g.ch = cell.ch;
    g.variant = cell.variant;
    g.source = 'sheet';
    g.baseline = g.by;
    g.advance = g.adv;
    g.ink = ink.ink;
    g.cx = ink.x;
    g.cy = ink.y;
    glyphs.push(g);
  });
  return {
    kind: ver.kind ? 'fill-in' : 'full',
    page: ver.page,
    glyphs: glyphs,
    missing: missing
  };
}

function paintPracticeStroke(ctx, x, y, w, h, seed) {
  var n = Math.abs(seed | 0) % 5;
  var tick = Math.abs(seed | 0) % 7;
  ctx.save();
  ctx.strokeStyle = '#1a3a8a';
  ctx.lineWidth = Math.max(2.4, w * 0.06);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  var yBase = y + h * BASELINE;
  var lift = h * (0.24 + n * 0.05);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.18, yBase - h * 0.04);
  ctx.quadraticCurveTo(x + w * (0.35 + n * 0.03), yBase - lift, x + w * 0.82, yBase - h * 0.05);
  ctx.stroke();
  var tx = x + w * (0.26 + tick * 0.055);
  ctx.beginPath();
  ctx.moveTo(tx, yBase - 1);
  ctx.lineTo(tx, yBase - h * (0.14 + n * 0.05));
  ctx.stroke();
  ctx.restore();
}

function pdfFromJpegs(images) {
  var objects = [];
  function add(body) { objects.push(body); return objects.length; }
  var kids = [];
  images.forEach(function (im) {
    var media = '0 0 595.28 841.89';
    var content = 'q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
    var contentId = add('<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream');
    var imgId = add(null);
    var pageId = add(
      '<< /Type /Page /Parent PARENT 0 R /MediaBox [' + media + '] /Contents ' + contentId +
      ' 0 R /Resources << /XObject << /Im0 ' + imgId + ' 0 R >> >> >>'
    );
    kids.push(pageId);
    objects[imgId - 1] = {
      jpeg: im.jpeg,
      dict: '<< /Type /XObject /Subtype /Image /Width ' + im.width + ' /Height ' + im.height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + im.jpeg.length + ' >>\nstream\n'
    };
  });
  var pagesId = add('<< /Type /Pages /Count ' + kids.length + ' /Kids [' + kids.map(function (id) { return id + ' 0 R'; }).join(' ') + '] >>');
  objects[pagesId - 1] = objects[pagesId - 1].replace('PARENT', String(pagesId));
  kids.forEach(function (id) {
    objects[id - 1] = objects[id - 1].replace('PARENT', String(pagesId));
  });
  var catalogId = add('<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>');
  var chunks = ['%PDF-1.4\n'];
  var offsets = [0];
  var cursor = chunks[0].length;
  objects.forEach(function (obj, i) {
    offsets.push(cursor);
    var head = (i + 1) + ' 0 obj\n';
    var tail = '\nendobj\n';
    if (obj && obj.jpeg) {
      var text = head + obj.dict;
      chunks.push(text);
      chunks.push(obj.jpeg);
      chunks.push('\nendstream' + tail);
      cursor += text.length + obj.jpeg.length + ('\nendstream' + tail).length;
    } else {
      var block = head + obj + tail;
      chunks.push(block);
      cursor += block.length;
    }
  });
  var xrefAt = cursor;
  var xref = 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (var i = 1; i < offsets.length; i++) {
    xref += ('0000000000' + offsets[i]).slice(-10) + ' 00000 n \n';
  }
  var trailer = 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalogId + ' 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF';
  chunks.push(xref + trailer);
  var total = 0;
  chunks.forEach(function (c) { total += c.length || c.byteLength; });
  var out = new Uint8Array(total);
  var pos = 0;
  chunks.forEach(function (c) {
    if (typeof c === 'string') {
      for (var k = 0; k < c.length; k++) out[pos++] = c.charCodeAt(k) & 255;
    } else {
      out.set(c, pos);
      pos += c.length;
    }
  });
  return out;
}

var FULL_CHARS = LOWER + UPPER + DIGITS + SYMBOLS;

const LetterSheet = {
  PAGE_W: PAGE_W,
  PAGE_H: PAGE_H,
  LOWER: LOWER,
  UPPER: UPPER,
  DIGITS: DIGITS,
  SYMBOLS: SYMBOLS,
  FULL_CHARS: FULL_CHARS,
  layoutFull: layoutFull,
  layoutFillIn: layoutFillIn,
  draw: draw,
  read: read,
  paintWarp: paintWarp,
  paintPracticeStroke: paintPracticeStroke,
  pdfFromJpegs: pdfFromJpegs,
  measureInk: measureInk,
  cellPixels: cellPixels
};

export { LetterSheet };
export default LetterSheet;
