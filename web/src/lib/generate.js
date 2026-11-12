/**
 * Missing characters are assembled from letters already in the hand.
 * Neural generation is later work; this is the classical path.
 */
'use strict';

function canvas(w, h) {
  var c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  return c;
}

function baseOf(g) {
  var b = g && g.by;
  if (typeof b !== 'number' || b < 2 || b > (g.h || 0) + 8) return Math.round((g.h || 10) * 0.82);
  return b;
}

function drawable(g) {
  return g && g._img && g.w > 1 && g.h > 1;
}

function place(ctx, g, x, y, w, h) {
  if (!drawable(g)) return;
  ctx.drawImage(g._img, x, y, w || g.w, h || g.h);
}

function alignY(g, base, scale) {
  scale = scale || 1;
  return base - baseOf(g) * scale;
}

function sideBySide(a, b, overlap) {
  if (!drawable(a) || !drawable(b)) return null;
  var base = Math.max(baseOf(a), baseOf(b));
  var H = Math.max(base, a.h, b.h) + 2;
  var shift = Math.round(a.w * (1 - (overlap || 0.45)));
  var W = shift + b.w;
  var c = canvas(W, H);
  var ctx = c.getContext('2d');
  place(ctx, a, 0, alignY(a, base), a.w, a.h);
  place(ctx, b, shift, alignY(b, base), b.w, b.h);
  return c;
}

function flipped(g, mode) {
  if (!drawable(g)) return null;
  var c = canvas(g.w, g.h);
  var ctx = c.getContext('2d');
  if (mode === 'h') {
    ctx.translate(g.w, 0);
    ctx.scale(-1, 1);
  } else if (mode === 'v') {
    ctx.translate(0, g.h);
    ctx.scale(1, -1);
  } else {
    ctx.translate(g.w, g.h);
    ctx.rotate(Math.PI);
  }
  place(ctx, g, 0, 0, g.w, g.h);
  return c;
}

function withStem(bowl, stem, side) {
  if (!drawable(bowl) || !drawable(stem)) return null;
  var stemW = Math.max(3, Math.round(stem.w * 0.42));
  var H = Math.max(bowl.h, stem.h);
  var base = Math.max(baseOf(bowl), baseOf(stem));
  if (base < H * 0.5) base = Math.round(H * 0.82);
  H = Math.max(H, base + 2);
  var W = stemW + Math.round(bowl.w * 0.92);
  var c = canvas(W, H);
  var ctx = c.getContext('2d');
  if (side === 'right') {
    place(ctx, bowl, 0, alignY(bowl, base), bowl.w, bowl.h);
    place(ctx, stem, W - stemW, alignY(stem, base), stemW, stem.h);
  } else {
    place(ctx, stem, 0, alignY(stem, base), stemW, stem.h);
    place(ctx, bowl, Math.round(stemW * 0.55), alignY(bowl, base), bowl.w, bowl.h);
  }
  return c;
}

function descender(g) {
  if (!drawable(g)) return null;
  var extra = Math.round(g.h * 0.42);
  var c = canvas(g.w, g.h + extra);
  var ctx = c.getContext('2d');
  place(ctx, g, 0, 0, g.w, g.h);
  var sw = Math.max(3, Math.round(g.w * 0.22));
  ctx.drawImage(g._img, g.w - sw - 1, 0, sw, g.h, Math.round(g.w * 0.55), Math.round(g.h * 0.62), sw, g.h * 0.7);
  return c;
}

function scaled(g, scale) {
  if (!drawable(g)) return null;
  var c = canvas(g.w * scale, g.h * scale);
  c.getContext('2d').drawImage(g._img, 0, 0, c.width, c.height);
  return c;
}

function first(donors, ch) {
  var list = donors[ch];
  return list && list[0];
}

function sheared(source, slant) {
  var s = Math.max(-0.35, Math.min(0.45, slant || 0));
  if (Math.abs(s) < 0.02) return source;
  var pad = Math.ceil(Math.abs(s) * source.height);
  var c = canvas(source.width + pad, source.height);
  var ctx = c.getContext('2d');
  ctx.transform(1, 0, s, 1, s < 0 ? pad : 0, 0);
  ctx.drawImage(source, 0, 0);
  return c;
}

var RECIPES = {
  m: function (d) {
    var n = first(d, 'n');
    return n ? sideBySide(n, n, 0.42) : null;
  },
  w: function (d) {
    var v = first(d, 'v') || first(d, 'u');
    return v ? sideBySide(v, v, 0.4) : null;
  },
  u: function (d) {
    var n = first(d, 'n');
    return n ? flipped(n, 'v') : null;
  },
  h: function (d) {
    var n = first(d, 'n');
    var l = first(d, 'l') || first(d, 'i') || n;
    return n && l ? withStem(n, l, 'left') : null;
  },
  d: function (d) {
    var c = first(d, 'c') || first(d, 'e') || first(d, 'o');
    var l = first(d, 'l') || first(d, 'i');
    return c && l ? withStem(c, l, 'right') : null;
  },
  b: function (d) {
    var made = first(d, 'd');
    if (made && made._img) return flipped(made, 'h');
    var c = first(d, 'c') || first(d, 'o');
    var l = first(d, 'l') || first(d, 'i');
    return c && l ? withStem(c, l, 'left') : null;
  },
  p: function (d) {
    var b = first(d, 'b') || first(d, 'd');
    return b ? flipped(b, 'v') : null;
  },
  q: function (d) {
    var dch = first(d, 'd');
    if (dch) return flipped(dch, 'v');
    var b = first(d, 'b');
    return b ? flipped(b, 'h') : null;
  },
  g: function (d) {
    var bowl = first(d, 'a') || first(d, 'o') || first(d, 'c');
    return bowl ? descender(bowl) : null;
  },
  y: function (d) {
    var v = first(d, 'v') || first(d, 'u');
    return v ? descender(v) : null;
  }
};

function styleOf(pack) {
  var pens = (pack && pack.penColours) || [];
  var stats = (pack && pack.stats) || {};
  return {
    pen: pens[0] || '#241c16',
    strokeWidth: pack.strokeWidth || stats.strokeWidth || 2.5,
    slant: pack.slant != null ? pack.slant : (stats.slant || 0)
  };
}

function glyphFrom(source, ch, style) {
  var c = sheared(source, style.slant);
  return {
    ch: ch,
    url: c.toDataURL('image/png'),
    w: c.width,
    h: c.height,
    bx: 0,
    by: Math.round(c.height * 0.8),
    adv: Math.round(c.width * 1.05),
    cellH: c.height,
    cellW: c.width,
    source: 'generated',
    pen: style.pen,
    strokeWidth: style.strokeWidth,
    slant: style.slant,
    confidence: 0.46,
    _img: c
  };
}

function compose(ch, donors, style) {
  var made = null;
  if (RECIPES[ch]) made = RECIPES[ch](donors);
  if (!made) {
    var other = (ch >= 'a' && ch <= 'z') ? ch.toUpperCase() : (ch >= 'A' && ch <= 'Z' ? ch.toLowerCase() : '');
    var twin = other && first(donors, other);
    if (twin) made = scaled(twin, ch >= 'A' && ch <= 'Z' ? 1.12 : 0.88);
  }
  if (!made) return null;
  return glyphFrom(made, ch, style);
}

function indexDonors(glyphs) {
  var donors = Object.create(null);
  (glyphs || []).forEach(function (g) {
    if (!g || !g.ch) return;
    (donors[g.ch] || (donors[g.ch] = [])).push(g);
  });
  return donors;
}

function charsIn(text) {
  var seen = Object.create(null);
  var out = [];
  var i, ch;
  for (i = 0; i < text.length; i++) {
    ch = text[i];
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t' || ch === '#') continue;
    if (seen[ch]) continue;
    seen[ch] = 1;
    out.push(ch);
  }
  return out;
}

function targets(donors, text) {
  if (text != null) return charsIn(text).filter(function (ch) { return !donors[ch]; });
  return Object.keys(RECIPES).filter(function (ch) { return !donors[ch]; });
}

function ensure(pack, text) {
  pack.glyphs = pack.glyphs || [];
  var donors = indexDonors(pack.glyphs);
  var style = styleOf(pack);
  var pending = targets(donors, text);
  var generated = [];
  var guard = 0;
  while (pending.length && guard++ < 6) {
    var next = [];
    var progress = false;
    pending.forEach(function (ch) {
      if (donors[ch]) return;
      var g = compose(ch, donors, style);
      if (!g) { next.push(ch); return; }
      pack.glyphs.push(g);
      donors[ch] = [g];
      generated.push(g);
      progress = true;
    });
    pending = next;
    if (!progress) break;
  }
  if (Array.isArray(pack.missing)) {
    var have = indexDonors(pack.glyphs);
    pack.missing = pack.missing.filter(function (ch) { return !have[ch]; });
  }
  return { generated: generated, blocked: pending };
}

function replaceGenerated(pack, read) {
  var fresh = (read && read.glyphs) || [];
  var got = Object.create(null);
  fresh.forEach(function (g) { if (g && g.ch) got[g.ch] = 1; });
  pack.glyphs = (pack.glyphs || []).filter(function (g) {
    return !(g && g.source === 'generated' && got[g.ch]);
  });
  fresh.forEach(function (g) {
    var copy = Object.assign({}, g);
    copy.source = 'sheet';
    pack.glyphs.push(copy);
  });
  return pack;
}

function generatedChars(pack) {
  var seen = Object.create(null);
  var out = [];
  (pack && pack.glyphs || []).forEach(function (g) {
    if (!g || g.source !== 'generated' || !g.ch || seen[g.ch]) return;
    seen[g.ch] = 1;
    out.push(g.ch);
  });
  return out;
}

var Generate = {
  ensure: ensure,
  replaceGenerated: replaceGenerated,
  generatedChars: generatedChars,
  RECIPES: RECIPES
};

export { Generate };
export default Generate;
