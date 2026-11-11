'use strict';
/* Local hand store: no accounts, no photo thumbnails, old packs still open.
   Run with: npm test */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const PROJECT = path.join(__dirname, '..');
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

let pass = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { failures.push(name + (extra ? ' — ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

function imageHits(value) {
  const hits = [];
  const walk = (node, glyph) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((item) => walk(item, glyph)); return; }
    const isGlyph = typeof node.ch === 'string' && node.ch.length >= 1 && node.ch.length <= 2;
    Object.keys(node).forEach((k) => {
      const v = node[k];
      if (typeof v === 'string' && v.startsWith('data:image/')) {
        const pngGlyph = isGlyph && k === 'url' && v.startsWith('data:image/png');
        if (!pngGlyph) hits.push(k + '=' + v.slice(0, 30));
      } else if (v && typeof v === 'object') walk(v, isGlyph);
    });
  };
  walk(value, false);
  return hits;
}

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] || null,
    get length() { return m.size; },
  };
}

function createFakeIDB(seed) {
  const kv = new Map(Object.entries(seed || {}));
  function later(fn) { queueMicrotask(fn); }
  function request(produce) {
    const req = { result: undefined, onsuccess: null, onerror: null };
    later(() => {
      req.result = produce();
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }
  const db = {
    objectStoreNames: { contains: (name) => name === 'kv' },
    transaction() {
      let complete = null;
      const tx = {
        onerror: null,
        get oncomplete() { return complete; },
        set oncomplete(fn) {
          complete = fn;
          later(() => { if (complete) complete(); });
        },
      };
      tx.objectStore = () => ({
        get: (k) => request(() => (kv.has(k) ? kv.get(k) : undefined)),
        put: (v, k) => { kv.set(k, v); return request(() => k); },
        delete: (k) => { kv.delete(k); return request(() => undefined); },
        getAllKeys: () => request(() => [...kv.keys()]),
      });
      return tx;
    },
  };
  return {
    kv,
    open() {
      const req = { onsuccess: null, onerror: null, onupgradeneeded: null };
      later(() => {
        req.result = db;
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    },
  };
}

let storeCase = 0;
async function loadStore() {
  const href = pathToFileURL(path.join(PROJECT, 'web', 'src', 'lib', 'store.js')).href + '?case=' + (++storeCase);
  const mod = await import(href);
  await mod.Store.ready;
  return mod.Store;
}

async function main() {
  const cfg = await import(pathToFileURL(path.join(PROJECT, 'web', 'src', 'lib', 'config.js')).href);
  check('config has no apiBase', !Object.prototype.hasOwnProperty.call(cfg.INKCADENCE_CONFIG, 'apiBase'));
  check('config has no remote', !Object.prototype.hasOwnProperty.call(cfg.INKCADENCE_CONFIG, 'remote'));

  const mainSrc = fs.readFileSync(path.join(PROJECT, 'web', 'src', 'main.js'), 'utf8');
  check('vite app has no login route', !mainSrc.includes('/login') && !mainSrc.includes('renderAuth'));
  check('vite app has no pricing or legal route', !mainSrc.includes('/pricing') && !mainSrc.includes('/legal'));
  check('vite app makes no API calls', !mainSrc.includes('/api/'));

  console.log('-- Old hand format still opens, and saves keep only glyph PNGs --');
  const oldHand = {
    id: 'old1',
    name: 'Sam',
    glyphs: [{ ch: 'a', url: PNG }],
    stats: { thumbs: [JPEG], slant: 0.2, pages: 1 },
    photo: JPEG,
  };
  global.localStorage = fakeStorage();
  global.window = global;
  global.indexedDB = createFakeIDB({ 'packs:sam': [oldHand] });

  const Store = await loadStore();
  check('IndexedDB hands can be saved', Store.persistent() === true);

  const opened = await Store.hands();
  const sam = opened.find((h) => h.id === 'old1');
  check('loads a hand saved in the old format', !!sam && sam.name === 'Sam', JSON.stringify(opened).slice(0, 180));
  check('old hand keeps its glyph PNG', !!sam && sam.glyphs && sam.glyphs[0].url === PNG);
  check('old hand drops the photo thumbnail', !!sam && imageHits(sam).length === 0, imageHits(sam).join(','));

  const saved = await Store.saveHand({
    id: 'new1',
    name: 'New',
    glyphs: [{ ch: 'b', url: PNG }, { ch: 'c', url: JPEG }],
    stats: { thumbs: [JPEG], slant: 0.1 },
    photo: JPEG,
  });
  const stored = await Store.get('hands');
  const raw = JSON.stringify(stored);
  check('saved hand keeps the glyph PNG', !!saved.glyphs.find((g) => g.ch === 'b' && g.url === PNG));
  check('saved record has no image data except glyph PNGs', imageHits(stored).length === 0 && !raw.includes('image/jpeg') && !raw.includes('thumbs'), raw.slice(0, 240));
  check('jpeg glyph url is not kept', !saved.glyphs.find((g) => g.ch === 'c' && g.url));

  const after = await Store.hands();
  check('new hand is listed with the old one', after.some((h) => h.id === 'old1') && after.some((h) => h.id === 'new1'));

  console.log('-- No IndexedDB: session works, nothing is persisted --');
  delete global.indexedDB;
  global.localStorage = fakeStorage();
  const Mem = await loadStore();
  check('session reports hands cannot be saved', Mem.persistent() === false);
  const memHand = await Mem.saveHand({ id: 'm1', name: 'Session', glyphs: [{ ch: 'd', url: PNG }], stats: { thumbs: [JPEG] } });
  const memList = await Mem.hands();
  check('session still holds the hand in memory', memList.some((h) => h.id === 'm1' && h.name === 'Session'));
  check('memory hand has no thumbnail', imageHits(memHand).length === 0, imageHits(memHand).join(','));

  console.log('\n' + '='.repeat(52));
  console.log('  passed: ' + pass + '   failed: ' + failures.length);
  if (failures.length) { failures.forEach((f) => console.log('   - ' + f)); process.exit(1); }
  console.log('  all green');
}

main().catch((err) => { console.error('HARNESS ERROR:', err); process.exit(2); });
