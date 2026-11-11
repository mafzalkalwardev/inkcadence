'use strict';
/* store.js — hands saved in this browser.
 *
 * IndexedDB database "inkcadence", object store "kv" (the same database the
 * classic writer uses). New hands live under the key "hands". Hands saved
 * earlier under "packs:<username>" still open. Photo thumbnails are stripped
 * before anything is written. Glyph PNGs are kept.
 *
 * When IndexedDB cannot be opened, the session keeps hands in memory and
 * persistent() is false.
 */

var NS = 'inkcadence';
var HANDS_KEY = 'hands';
var idb = null;
var useIDB = false;
var memory = {};
var memoryReady = false;

var PNG_URL = /^data:image\/png(?:;|,)/i;
var ANY_IMAGE = /^data:image\//i;

var localReady = (function () {
  return new Promise(function (resolve) {
    var settled = false;
    function done(v) { if (!settled) { settled = true; resolve(v); } }
    try {
      var factory = (typeof indexedDB !== 'undefined') ? indexedDB : undefined;
      if (!factory) return done(false);
      var req = factory.open(NS, 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = function () { idb = req.result; useIDB = true; done(true); };
      req.onerror = function () { done(false); };
      setTimeout(function () { done(useIDB); }, 2500);
    } catch (e) { done(false); }
  });
})();

function lsLegacyHands() {
  var out = [];
  var ls;
  try { ls = (typeof localStorage !== 'undefined') ? localStorage : null; }
  catch (e) { ls = null; }
  if (!ls || typeof ls.length !== 'number' || typeof ls.key !== 'function') return out;
  try {
    for (var i = 0; i < ls.length; i++) {
      var k = ls.key(i);
      if (!k || k.indexOf(NS + ':packs:') !== 0) continue;
      var parsed = JSON.parse(ls.getItem(k));
      if (Array.isArray(parsed)) out = out.concat(parsed);
    }
  } catch (e2) { /* unreadable legacy row */ }
  return out;
}

function get(k) {
  return localReady.then(function () {
    if (!useIDB) return Promise.resolve(Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null);
    return new Promise(function (resolve) {
      try {
        var rq = idb.transaction('kv', 'readonly').objectStore('kv').get(k);
        rq.onsuccess = function () { resolve(rq.result === undefined ? null : rq.result); };
        rq.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  });
}

function set(k, v) {
  return localReady.then(function () {
    if (!useIDB) {
      memory[k] = v;
      return false;
    }
    return new Promise(function (resolve) {
      try {
        var tx = idb.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(v, k);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  });
}

function entries() {
  return localReady.then(function () {
    if (!useIDB) {
      return Object.keys(memory).map(function (k) { return { key: k, value: memory[k] }; });
    }
    return new Promise(function (resolve) {
      try {
        var store = idb.transaction('kv', 'readonly').objectStore('kv');
        var keysReq = store.getAllKeys();
        keysReq.onerror = function () { resolve([]); };
        keysReq.onsuccess = function () {
          var keys = keysReq.result || [];
          var out = [];
          var i = 0;
          function next() {
            if (i >= keys.length) return resolve(out);
            var key = keys[i++];
            var g = store.get(key);
            g.onerror = function () { next(); };
            g.onsuccess = function () {
              out.push({ key: key, value: g.result });
              next();
            };
          }
          next();
        };
      } catch (e) { resolve([]); }
    });
  });
}

function isGlyph(node) {
  return !!(node && typeof node.ch === 'string' && node.ch.length >= 1 && node.ch.length <= 2);
}

function stripImages(hand) {
  var copy = JSON.parse(JSON.stringify(hand, function (key, value) {
    if (key === '_img' || key === '__id' || key === 'thumbs' || key === 'thumb' || key === 'photo' || key === 'photos') return undefined;
    if (typeof value === 'function') return undefined;
    return value;
  }));
  walk(copy);
  if (copy.stats && typeof copy.stats === 'object') delete copy.stats.thumbs;
  return copy;
}

function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach(walk);
    return;
  }
  Object.keys(node).forEach(function (k) {
    var v = node[k];
    if (k === 'thumbs' || k === 'thumb' || k === '_img' || k === 'photo' || k === 'photos') {
      delete node[k];
      return;
    }
    if (typeof v === 'string' && ANY_IMAGE.test(v)) {
      if (!(k === 'url' && PNG_URL.test(v) && isGlyph(node))) delete node[k];
      return;
    }
    if (v && typeof v === 'object') walk(v);
  });
}

function mergeById(primary, legacy) {
  var seen = {};
  var out = [];
  primary.forEach(function (p) {
    if (!p || !p.id || seen[p.id]) return;
    seen[p.id] = true;
    out.push(p);
  });
  legacy.forEach(function (p) {
    if (!p || !p.id || seen[p.id]) return;
    seen[p.id] = true;
    out.push(p);
  });
  return out;
}

function present(list) {
  return list.map(function (p) {
    try { return stripImages(p); }
    catch (e) { return null; }
  }).filter(Boolean);
}

function dirty(before, after) {
  try { return JSON.stringify(before) !== JSON.stringify(after); }
  catch (e) { return false; }
}

function scrubLocalPhotos() {
  var ls;
  try { ls = (typeof localStorage !== 'undefined') ? localStorage : null; }
  catch (e) { ls = null; }
  if (!ls || typeof ls.length !== 'number' || typeof ls.key !== 'function' || typeof ls.setItem !== 'function') return;
  try {
    for (var i = 0; i < ls.length; i++) {
      var k = ls.key(i);
      if (!k || k.indexOf(NS + ':packs:') !== 0) continue;
      var parsed = JSON.parse(ls.getItem(k));
      if (!Array.isArray(parsed)) continue;
      var cleaned = present(parsed);
      if (dirty(parsed, cleaned)) ls.setItem(k, JSON.stringify(cleaned));
    }
  } catch (e2) { /* leave an unreadable row alone */ }
}

function loadMerged() {
  return entries().then(function (rows) {
    var primary = [];
    var legacy = [];
    var jobs = [];
    rows.forEach(function (row) {
      var key = row.key;
      var list = row.value;
      if (typeof key !== 'string' || !Array.isArray(list)) return;
      if (key === HANDS_KEY) {
        primary = present(list);
        if (useIDB && dirty(list, primary)) jobs.push(set(HANDS_KEY, primary));
      } else if (key.indexOf('packs:') === 0) {
        var cleaned = present(list);
        legacy = legacy.concat(cleaned);
        if (useIDB && dirty(list, cleaned)) jobs.push(set(key, cleaned));
      }
    });
    scrubLocalPhotos();
    return Promise.all(jobs).then(function () {
      var merged = mergeById(primary, legacy.concat(present(lsLegacyHands())));
      if (!useIDB) {
        if (!memoryReady) {
          memory[HANDS_KEY] = merged;
          memoryReady = true;
        }
        return (memory[HANDS_KEY] || []).slice();
      }
      return merged;
    });
  });
}

function hands() {
  return loadMerged().then(present);
}

function saveHand(hand) {
  var clean = stripImages(hand || {});
  if (!clean.id) clean.id = 'hand_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return loadMerged().then(function (list) {
    var next = list.filter(function (p) { return p && p.id !== clean.id; });
    next.push(clean);
    if (!useIDB) {
      memory[HANDS_KEY] = present(next);
      memoryReady = true;
      return clean;
    }
    return set(HANDS_KEY, present(next)).then(function (ok) {
      if (!ok) {
        var err = new Error("Hands can't be saved in this browser.");
        err.code = 'no-idb';
        throw err;
      }
      return clean;
    });
  });
}

function deleteHand(id) {
  return entries().then(function (rows) {
    var jobs = [];
    if (!useIDB) {
      memory[HANDS_KEY] = (memory[HANDS_KEY] || []).filter(function (p) { return p && p.id !== id; });
      memoryReady = true;
      return present(memory[HANDS_KEY]);
    }
    var sawHands = false;
    rows.forEach(function (row) {
      if (row.key === HANDS_KEY && Array.isArray(row.value)) {
        sawHands = true;
        jobs.push(set(HANDS_KEY, row.value.filter(function (p) { return p && p.id !== id; })));
      } else if (typeof row.key === 'string' && row.key.indexOf('packs:') === 0 && Array.isArray(row.value)) {
        var kept = row.value.filter(function (p) { return p && p.id !== id; });
        if (kept.length !== row.value.length) jobs.push(set(row.key, kept));
      }
    });
    if (!sawHands) jobs.push(set(HANDS_KEY, []));
    return Promise.all(jobs).then(hands);
  });
}

const Store = {
  ready: localReady,
  persistent: function () { return useIDB; },
  usingIDB: function () { return useIDB; },
  get: get,
  hands: hands,
  saveHand: saveHand,
  deleteHand: deleteHand
};

export { Store };
export default Store;
