/* review.js — fix letters in a hand: relabel, delete, mark best, accept. */
'use strict';
import { CharCNN } from './charcnn.js';
import { Harvest } from './harvest.js';
import { Generate } from './generate.js';
import { Glyphs } from './glyphs.js';

var LOW_CONF = 0.72;

function glyphSource(g) {
  if (!g) return 'unknown';
  if (g.source === 'sheet' || g.source === 'page' || g.source === 'generated') return g.source;
  if (g.harvested) return 'page';
  return 'unknown';
}

function isLowConfidence(g) {
  if (!g) return false;
  if (g.confirmed || g.best) return false;
  if (glyphSource(g) === 'generated') return true;
  var q = typeof g.cnnConf === 'number' ? g.cnnConf : g.confidence;
  return typeof q === 'number' && q < LOW_CONF;
}

function coverageSummary(hand) {
  var glyphs = (hand && hand.glyphs) || [];
  var groups = Glyphs.groupByChar(glyphs);
  var chars = Object.keys(groups).sort(function (a, b) {
    return a.localeCompare(b);
  });
  var low = 0;
  var generated = 0;
  var confirmed = 0;
  glyphs.forEach(function (g) {
    if (isLowConfidence(g)) low++;
    if (glyphSource(g) === 'generated') generated++;
    if (g && g.confirmed) confirmed++;
  });
  var summary = Harvest.handSummary ? Harvest.handSummary(hand) : {
    coverage: 0,
    variants: 0,
    confidence: 0
  };
  return {
    chars: chars.length,
    variants: glyphs.length,
    coverage: summary.coverage,
    avgVariants: summary.variants,
    confidence: summary.confidence,
    low: low,
    generated: generated,
    confirmed: confirmed,
    missing: (hand && hand.missing) || [],
    generatedChars: Generate.generatedChars ? Generate.generatedChars(hand) : []
  };
}

function findGlyph(hand, glyph) {
  var list = (hand && hand.glyphs) || [];
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i] === glyph) return i;
  }
  if (!glyph || !glyph.url) return -1;
  for (i = 0; i < list.length; i++) {
    if (list[i] && list[i].url === glyph.url && list[i].ch === glyph.ch) return i;
  }
  return -1;
}

function ensureEmbedding(glyph) {
  if (glyph && glyph.embedding && glyph.embedding.length) {
    return Promise.resolve(glyph.embedding);
  }
  if (!glyph || !glyph.url || !CharCNN || !CharCNN.isReady()) {
    return Promise.resolve(null);
  }
  return CharCNN.predictDataUrl(glyph.url).then(function (pred) {
    if (pred && pred.embedding) {
      glyph.embedding = pred.embedding;
      return pred.embedding;
    }
    return null;
  }).catch(function () { return null; });
}

function relabel(hand, glyph, ch) {
  var next = String(ch || '').slice(0, 2);
  if (!hand || !glyph || !next) return Promise.resolve(hand);
  glyph.ch = next;
  glyph.confirmed = true;
  glyph.best = !!glyph.best;
  if (glyphSource(glyph) === 'generated') glyph.source = 'sheet';
  return ensureEmbedding(glyph).then(function () {
    Harvest.confirmLetter(hand, glyph);
    return hand;
  });
}

function deleteGlyph(hand, glyph) {
  if (!hand || !glyph) return hand;
  var idx = findGlyph(hand, glyph);
  if (idx < 0) return hand;
  hand.glyphs = hand.glyphs.slice(0, idx).concat(hand.glyphs.slice(idx + 1));
  return hand;
}

function markBest(hand, glyph) {
  if (!hand || !glyph || !glyph.ch) return hand;
  (hand.glyphs || []).forEach(function (g) {
    if (g && g.ch === glyph.ch) g.best = false;
  });
  glyph.best = true;
  glyph.confirmed = true;
  return hand;
}

function acceptGenerated(hand, glyph) {
  if (!hand || !glyph) return Promise.resolve(hand);
  if (glyphSource(glyph) === 'generated') glyph.source = 'sheet';
  glyph.confirmed = true;
  return ensureEmbedding(glyph).then(function () {
    Harvest.confirmLetter(hand, glyph);
    return hand;
  });
}

const Review = {
  LOW_CONF: LOW_CONF,
  glyphSource: glyphSource,
  isLowConfidence: isLowConfidence,
  coverageSummary: coverageSummary,
  relabel: relabel,
  deleteGlyph: deleteGlyph,
  markBest: markBest,
  acceptGenerated: acceptGenerated,
  ensureEmbedding: ensureEmbedding
};

export { Review };
export default Review;
