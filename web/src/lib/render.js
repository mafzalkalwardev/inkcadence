/* render.js — lays text out and paints it in the trained hand. */
'use strict';
import { Glyphs } from './glyphs.js';
import { Generate } from './generate.js';
var PAGE_W = 1240, PAGE_H = 1754;   /* A4 @ 150 dpi */

  function makeRng(seed) {
    var s = (seed | 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function gauss(r) { return (r() + r() + r() - 1.5) / 1.5; }

  function newCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    var writes = 0;
    if (ctx && typeof ctx.fillText === 'function') {
      var orig = ctx.fillText.bind(ctx);
      ctx.fillText = function () {
        writes++;
        return orig.apply(null, arguments);
      };
    }
    c._fontWrites = function () { return writes; };
    return c;
  }

  function drawPaper(ctx, W, H, paperStyle, paperColour, ruleGap, r, marginL) {
    ctx.fillStyle = paperColour || '#fdfcf7';
    ctx.fillRect(0, 0, W, H);

    for (var i = 0; i < 3000; i++) {
      ctx.fillStyle = 'rgba(120,110,90,' + (0.012 + r() * 0.02) + ')';
      ctx.fillRect(r() * W, r() * H, 1 + r() * 1.6, 1);
    }

    var left = marginL || 136, right = W - 96;
    if (paperStyle === 'ruled' || paperStyle === 'grid') {
      ctx.strokeStyle = 'rgba(120,160,200,.32)';
      ctx.lineWidth = 1;
      var gap = paperStyle === 'grid' ? Math.round(ruleGap * 0.72) : ruleGap;
      for (var y = 150; y < H - 80; y += gap) {
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      }
      if (paperStyle === 'grid') {
        ctx.strokeStyle = 'rgba(120,160,200,.2)';
        for (var x = left; x < right; x += gap) {
          ctx.beginPath(); ctx.moveTo(x, 150); ctx.lineTo(x, H - 80); ctx.stroke();
        }
      }
      ctx.strokeStyle = 'rgba(214,120,120,.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(left - 28, 118); ctx.lineTo(left - 28, H - 80); ctx.stroke();
    }
  }

  function buildMetrics(pack, size, tracking) {
    var scale = (size * 1.12) / (pack.cellH || 92);
    var groups = pack.glyphs && pack.glyphs.length ? Glyphs.groupByChar(pack.glyphs) : null;
    var avg = Object.create(null);

    if (groups) {
      Object.keys(groups).forEach(function (ch) {
        var list = groups[ch], sum = 0;
        list.forEach(function (g) { sum += g.adv; });
        avg[ch] = (sum / list.length) * scale + tracking;
      });
    }
    return { scale: scale, groups: groups, avg: avg, tracking: tracking };
  }

  function charWidth(ch, m, ctx, family, size) {
    if (m.groups) {
      var a = m.avg[ch];
      if (a) return a;
      if (ch === ' ') return size * 0.34;
      return size * 0.55;
    }
    ctx.font = size + 'px ' + family;
    return ctx.measureText(ch).width + m.tracking;
  }

  function measure(line, m, ctx, family, size) {
    var w = 0;
    for (var i = 0; i < line.length; i++) w += charWidth(line[i], m, ctx, family, size);
    return w;
  }

  function layout(text, maxW, m, ctx, family, size) {
    var out = [];
    var paras = text.split('\n');
    for (var pi = 0; pi < paras.length; pi++) {
      var raw = paras[pi];
      var heading = /^\s*#/.test(raw);
      var body = heading ? raw.replace(/^\s*#+\s*/, '') : raw;
      if (!body.trim()) { out.push({ text: '', heading: false }); continue; }
      var words = body.split(/\s+/).filter(function (w) { return w.length; });
      var line = '', started = false;
      for (var i = 0; i < words.length; i++) {
        var test = line ? line + ' ' + words[i] : words[i];
        if (measure(test, m, ctx, family, size) > maxW && line) {
          out.push({ text: line, heading: heading && !started });
          started = true;
          line = words[i];
        } else {
          line = test;
        }
      }
      if (line) out.push({ text: line, heading: heading && !started });
    }
    return out;
  }

  function pickVariant(list, r, prev) {
    if (!list || !list.length) return null;
    if (list.length === 1) return list[0];
    var pool = [];
    var i;
    for (i = 0; i < list.length; i++) if (list[i] !== prev) pool.push(list[i]);
    if (!pool.length) pool = list;
    return pool[(r() * pool.length) | 0];
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function handStyle(pack) {
    return (pack && pack.style) || (pack && pack.stats && pack.stats.style) || {};
  }

  function headingTreatment(pack) {
    if (pack && pack.heading && pack.heading.pen) return pack.heading;
    var pens = (pack && pack.pens) || [];
    var i, p;
    for (i = 0; i < pens.length; i++) {
      p = pens[i];
      if (p && p.role === 'heading' && p.hex) {
        return { pen: p.hex, scale: p.kind === 'marker' ? 1.8 : 1.35, underline: true, case: '' };
      }
    }
    return null;
  }

  function variantsFor(groups, ch, pen) {
    if (!groups) return null;
    var list = groups[ch];
    if (!list && ch.toLowerCase() !== ch) list = groups[ch.toLowerCase()];
    if (!list && ch.toUpperCase() !== ch) list = groups[ch.toUpperCase()];
    if (!list) return null;
    if (!pen) return list;
    var same = list.filter(function (g) { return g && g.pen === pen; });
    return same.length ? same : list;
  }

  var KERN = {
    th: -0.12, he: -0.08, in: -0.06, er: -0.1, an: -0.07, re: -0.08, on: -0.06, at: -0.05,
    en: -0.07, es: -0.05, of: -0.08, to: -0.06, or: -0.06, ed: -0.07, is: -0.05, it: -0.05,
    ar: -0.06, as: -0.05, be: -0.05, by: -0.04, wa: -0.05, we: -0.05, wh: -0.08, yo: -0.05
  };
  var LIGATURES = { fi: true, fl: true, ff: true, tt: true, ll: true, ti: true, ft: true, oo: true, ee: true };

  function glyphJitterProfile(ch) {
    if ('bdfhklt'.indexOf(ch) >= 0) return { rot: 0.7, dy: 0.85, dx: 1.0 };
    if ('gjpqy'.indexOf(ch) >= 0) return { rot: 0.85, dy: 1.15, dx: 0.9 };
    if ('iw'.indexOf(ch) >= 0) return { rot: 1.1, dy: 1.0, dx: 1.2 };
    return { rot: 1, dy: 1, dx: 1 };
  }

  function pairKern(a, b, size) {
    if (!a || !b) return 0;
    var key = a + b;
    if (KERN[key]) return KERN[key] * size;
    if (LIGATURES[key]) return -0.14 * size;
    return 0;
  }

  function drawJoin(ctx, x0, y0, x1, y1, colour, r) {
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.1 + r() * 0.7;
    ctx.globalAlpha = 0.35 + r() * 0.25;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    var mx = (x0 + x1) / 2;
    var my = (y0 + y1) / 2 + (r() - 0.5) * 3;
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  function drawGlyphLine(ctx, line, x0, baseline, m, colour, jitter, r, size, bleed, opts) {
    opts = opts || {};
    var wobble = opts.wobble != null ? opts.wobble : size * 0.04;
    var wordSpace = opts.wordSpace != null ? opts.wordSpace : size * 0.34;
    var letterExtra = opts.letterExtra || 0;
    var shear0 = opts.shear != null ? opts.shear : 0.1;
    var drift = gauss(r) * jitter * Math.min(wobble, size * 0.08);
    var tilt = gauss(r) * jitter * 0.004;
    var x = x0 + gauss(r) * jitter * Math.min(4, wobble);
    var prev = '';
    var prevGlyph = null;
    var prevEndX = x;
    var prevEndY = baseline;
    var bottom = baseline;
    var last = opts.last || {};

    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === ' ') {
        x += wordSpace * (0.86 + r() * 0.28);
        prev = '';
        prevGlyph = null;
        continue;
      }

      var list = variantsFor(m.groups, ch, opts.pen);
      if (!list) {
        if (opts.skipMissing) continue;
        var err = new Error("Can't write " + ch + ". It isn't in this hand, and it can't be built from the other letters.");
        err.missing = [ch];
        throw err;
      }

      x += pairKern(prev, ch, size);

      var g = pickVariant(list, r, last[ch]);
      last[ch] = g;
      var jp = glyphJitterProfile(ch);
      var sc = m.scale * (1 + clamp(gauss(r) * jitter * 0.08, -0.12, 0.12));
      var rot = clamp(tilt + gauss(r) * jitter * 0.04 * jp.rot, -0.08, 0.08);
      var dy = clamp(drift + gauss(r) * jitter * wobble * jp.dy, -wobble, wobble);
      var dx = gauss(r) * jitter * size * 0.02 * jp.dx;
      var shear = shear0 + gauss(r) * jitter * 0.02;
      var lig = LIGATURES[prev + ch];
      if (lig) { dx -= size * 0.03; }

      var drawX = x + dx;
      var drawY = baseline + dy;
      var gw = g.w * sc;
      var gh = g.h * sc;
      var top = drawY - (g.by || g.h * 0.8) * sc;
      if (top + gh > bottom) bottom = top + gh;
      if (prev && prev !== ' ' && prevGlyph && (lig || (x - prevEndX) < size * 0.18)) {
        var jx0 = prevEndX;
        var jy0 = prevEndY - size * 0.05;
        var jx1 = drawX + gw * 0.08;
        var jy1 = drawY - (g.by || g.h) * sc * 0.3;
        drawJoin(ctx, jx0, jy0, jx1, jy1, colour, r);
        if (opts.trace) {
          opts.trace.push({
            x: Math.min(jx0, jx1) - 2,
            y: Math.min(jy0, jy1) - 2,
            w: Math.abs(jx1 - jx0) + 4,
            h: Math.abs(jy1 - jy0) + 4
          });
        }
      }

      ctx.save();
      ctx.translate(drawX, drawY);
      ctx.rotate(rot);
      ctx.transform(1, 0, shear, 1, 0, 0);
      ctx.globalAlpha = 0.9 + r() * 0.1;
      ctx.drawImage(Glyphs.tint(g, colour, { bleed: bleed || 0, texture: true }), 0, -(g.by || g.h * 0.8) * sc, gw, gh);
      ctx.restore();
      ctx.globalAlpha = 1;
      if (opts.trace) {
        var pad = 8 + Math.abs(shear) * gh + Math.abs(rot) * Math.max(gw, gh);
        opts.trace.push({ x: drawX - pad, y: top - pad, w: gw + pad * 2, h: gh + pad * 2 });
      }

      prevEndX = drawX + (g.adv || g.w) * m.scale * 0.9;
      prevEndY = drawY;
      x += (g.adv || g.w) * m.scale + m.tracking + letterExtra + gauss(r) * jitter * 1.2;
      prev = ch;
      prevGlyph = g;
    }
    return { x: x, bottom: bottom };
  }

  function underline(ctx, x0, x1, y, colour, r, style) {
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    for (var x = x0; x <= x1; x += 8) {
      ctx.lineTo(x, y + Math.sin(x * 0.09) * 1.1 + (r() - 0.5) * 0.6);
    }
    ctx.stroke();
    if (style === 'double') {
      ctx.beginPath();
      ctx.moveTo(x0, y + 4);
      for (var x2 = x0; x2 <= x1; x2 += 8) ctx.lineTo(x2, y + 4 + Math.sin(x2 * 0.09) * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function applyHeadingCase(text, head) {
    if (!head || head.case !== 'upper') return text;
    return String(text || '').split('\n').map(function (line) {
      var m = line.match(/^(\s*#+\s*)([\s\S]*)$/);
      if (!m) return line;
      return m[1] + m[2].toUpperCase();
    }).join('\n');
  }

  function spacingFor(pack, size) {
    var style = handStyle(pack);
    var xh = style.xHeight || (pack.cellH ? pack.cellH * 0.48 : size * 0.5);
    var unit = size / Math.max(8, xh);
    return {
      wordSpace: clamp(style.wordGap ? style.wordGap * unit : size * 0.36, size * 0.22, size * 0.95),
      lineSpace: clamp(style.lineSpacing ? style.lineSpacing * unit : size * 1.68, size * 1.25, size * 2.5),
      letterExtra: clamp(style.letterGap ? style.letterGap * unit * 0.45 : 0, 0, size * 0.28),
      wobble: clamp(style.baselineWobble != null ? style.baselineWobble * unit : size * 0.035, 0, size * 0.14)
    };
  }

  function blockIfNeeded(pack, text) {
    if (!pack.glyphs || !pack.glyphs.length) return;
    var gap = Generate.ensure(pack, text);
    if (gap.blocked.length) {
      var list = gap.blocked.join(' ');
      var err = new Error("Can't write " + list + ". Those characters aren't in this hand, and they can't be built from the other letters.");
      err.missing = gap.blocked.slice();
      throw err;
    }
  }

  function renderPages(opts) {
    var pack = opts.pack || {};
    var head = headingTreatment(pack);
    var text = applyHeadingCase(opts.text || '', head);
    if (!pack.glyphs || !pack.glyphs.length) {
      throw new Error('This hand has no letters yet.');
    }
    blockIfNeeded(pack, text);
    var size = opts.size || 34;
    var jitter = opts.jitter == null ? 0.55 : opts.jitter;
    /* Neat pages from training → calmer hand; messy → more drift. */
    var pats = (pack.patterns || (pack.stats && pack.stats.patterns) || {});
    if (opts.jitter == null && pats.neatness != null) {
      jitter = pats.neatness >= 0.72 ? 0.28 : (pats.neatness >= 0.5 ? 0.48 : 0.72);
    }
    if (opts.jitter == null && pack.defaultJitter != null && pats.neatness == null) {
      jitter = pack.defaultJitter;
    }
    var colour = opts.penColour || '#1b2a4a';
    var paperStyle = opts.paper || pack.paperStyle || (pats.paperStyle) || 'ruled';
    var paperColour = opts.paperColour || '#fdfcf7';
    var family = '';
    var tracking = opts.tracking != null ? opts.tracking : (pack.tracking != null ? pack.tracking : 0.8);
    var headingStyle = opts.headingStyle || pack.headingStyle || 'underline';
    if (head && head.underline === false) headingStyle = 'none';
    else if (head && head.underline) headingStyle = 'underline';
    var watermark = opts.watermark !== false;
    var continuity = opts.continuity !== false;
    var pageNumbers = !!opts.pageNumbers;
    var shearBase = (pack.slant != null ? pack.slant : (pack.stats && pack.stats.slant)) || 0.1;
    shearBase = Math.max(-0.2, Math.min(0.35, 0.08 + shearBase));
    var bleed = opts.bleed;
    if (bleed == null) {
      var sw = pack.strokeWidth || (pack.stats && pack.stats.strokeWidth) || 2.5;
      bleed = Math.max(0.15, Math.min(1.2, sw / 4));
    }

    var W = PAGE_W, H = PAGE_H;
    var marginL = opts.marginL != null ? opts.marginL : 136;
    var marginR = opts.marginR != null ? opts.marginR : (W - 104);
    var top = opts.top != null ? opts.top : 196;
    var bottom = opts.bottom != null ? opts.bottom : (H - 118);
    var space = spacingFor(pack, size);
    var letterGap = Math.round(space.lineSpace);
    var ruleGap = letterGap;

    var probe = newCanvas(10, 10).getContext('2d');
    var m = buildMetrics(pack, size, tracking);
    var lines = layout(text, marginR - marginL, m, probe, family, size);

    var pages = [];
    var page = null, ctx = null, y = 0, pageIndex = 0;
    var handDrift = 0;
    var handShear = shearBase;
    var baseSeed = opts.seed || 1;

    function newPage() {
      page = newCanvas(W, H);
      ctx = page.getContext('2d');
      var step = continuity ? (pageIndex * 7919) : (pageIndex * 1543 + ((baseSeed * 17) | 0));
      var pr = makeRng(baseSeed + step);
      drawPaper(ctx, W, H, paperStyle, paperColour, ruleGap, pr, marginL);
      if (pageNumbers && m.groups) {
        drawGlyphLine(ctx, String(pageIndex + 1), W / 2 - 16, H - 56, buildMetrics(pack, 14, 0), colour, 0.05, pr, 14, 0.2, {
          skipMissing: true, shear: shearBase, wordSpace: 8, wobble: 1, trace: opts.trace
        });
      }
      pages.push(page);
      pageIndex++;
      y = top;
      if (continuity) {
        handDrift += (pr() - 0.5) * 1.2;
        handShear += (pr() - 0.5) * 0.008;
      }
      return pr;
    }

    var r = newPage();

    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var h = ln.heading ? letterGap * 1.45 : letterGap;
      if (y + h > bottom) {
        if (watermark) stamp(ctx, W, H);
        r = newPage();
      }
      if (!ln.text) { y += letterGap * 0.7; continue; }

      var headScale = head && head.scale ? clamp(head.scale, 1.1, 2.4) : 1.2;
      var fs = ln.heading ? size * headScale : size;
      var lineColour = ln.heading && head && head.pen ? head.pen : colour;
      var lineBleed = ln.heading && head ? Math.max(bleed, 0.9) : bleed;
      var drawn = drawGlyphLine(ctx, ln.text, marginL + handDrift, y + fs, buildMetrics(pack, fs, tracking), lineColour, jitter, r, fs, lineBleed, {
        shear: handShear,
        wordSpace: space.wordSpace * (fs / size),
        letterExtra: space.letterExtra * (fs / size),
        wobble: space.wobble * (fs / size),
        pen: ln.heading && head ? head.pen : '',
        trace: opts.trace
      });
      var lineW = drawn.x;

      if (ln.heading && headingStyle !== 'none') {
        var uy = Math.max(y + fs + 8, drawn.bottom + 7);
        underline(ctx, marginL, Math.min(marginR, lineW), uy, lineColour, r,
          headingStyle === 'double' ? 'double' : 'single');
        if (opts.trace) opts.trace.push({ x: marginL, y: uy - 3, w: Math.max(8, Math.min(marginR, lineW) - marginL), h: headingStyle === 'double' ? 14 : 8 });
      }
      y += h;
    }

    if (watermark) stamp(ctx, W, H, pack, colour, shearBase, opts.trace);
    return pages;
  }

  function previewLine(opts) {
    var pack = opts.pack || {};
    var text = (opts.text || 'The quick brown fox writes neatly.').slice(0, 64);
    blockIfNeeded(pack, text);
    var size = opts.size || 30;
    var colour = opts.penColour || (pack.penColours && pack.penColours[0]) || '#1b2a4a';
    var jitter = opts.jitter != null ? opts.jitter : (pack.defaultJitter || 0.4);
    var tracking = pack.tracking != null ? pack.tracking : 0.55;
    var bleed = Math.max(0.15, Math.min(1, (pack.strokeWidth || 2.5) / 4));
    var shearBase = pack.slant != null ? pack.slant : 0.1;
    var c = newCanvas(720, 90);
    var ctx = c.getContext('2d');
    ctx.fillStyle = pack.paper || '#fdfcf7';
    ctx.fillRect(0, 0, c.width, c.height);
    var r = makeRng(opts.seed || 3);
    var m = buildMetrics(pack, size, tracking);
    if (!m.groups) return c;
    var space = spacingFor(pack, size);
    drawGlyphLine(ctx, text, 24, 58, m, colour, jitter, r, size, bleed, {
      shear: 0.08 + shearBase, wordSpace: space.wordSpace, letterExtra: space.letterExtra, wobble: space.wobble
    });
    return c;
  }

  function stamp(ctx, W, H, pack, colour, shear, trace) {
    var m = buildMetrics(pack, 13, 0);
    if (!m.groups) return;
    ctx.save();
    ctx.globalAlpha = 0.45;
    drawGlyphLine(ctx, 'written with AI assistance', 180, H - 42, m, colour, 0.05, makeRng(3), 13, 0.15, {
      skipMissing: true, shear: shear || 0.08, wordSpace: 5, wobble: 0.6, trace: trace
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function exportPrintDocument(pages, title) {
    var imgs = pages.map(function (c) {
      return '<img src="' + c.toDataURL('image/jpeg', 0.92) + '">';
    }).join('');
    var safeTitle = String(title || 'Inkcadence').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
    return '<!doctype html><html><head><title>' + safeTitle + '</title><style>' +
      '@page{size:A4;margin:0}body{margin:0;background:#fff}' +
      'img{display:block;width:210mm;height:297mm;page-break-after:always}' +
      '</style></head><body>' + imgs + '</body></html>';
  }

  const Rendering = {
    renderPages: renderPages,
    previewLine: previewLine,
    exportPrintDocument: exportPrintDocument,
    PAGE_W: PAGE_W,
    PAGE_H: PAGE_H,
    pairKern: pairKern,
    glyphJitterProfile: glyphJitterProfile
  };

export { Rendering };
export default Rendering;
