'use strict';
/* Loads js/config.js + js/store.js in a fake browser and drives the on-device
   store. The API is gone from this tree (see experimental/backend), so there
   is no remote mode to stand up. Run with: npm test */

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');

const PROJECT = path.join(__dirname, '..');

let pass = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { failures.push(name + (extra ? ' — ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _dump: () => Object.fromEntries(m),
  };
}

function loadBrowser(apiBase, storage) {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.localStorage = storage;
  sandbox.fetch = (url, opts) => fetch(url, opts);
  sandbox.TextEncoder = TextEncoder;
  sandbox.TextDecoder = TextDecoder;
  sandbox.AbortController = AbortController;
  sandbox.crypto = crypto.webcrypto;
  sandbox.console = console;
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  sandbox.clearInterval = clearInterval;
  sandbox.setInterval = setInterval;
  sandbox.Promise = Promise;
  sandbox.Date = Date;
  sandbox.Math = Math;
  sandbox.JSON = JSON;
  sandbox.Error = Error;
  sandbox.Object = Object;
  sandbox.Array = Array;
  sandbox.String = String;
  sandbox.Number = Number;
  sandbox.Uint8Array = Uint8Array;
  sandbox.encodeURIComponent = encodeURIComponent;
  sandbox.INKCADENCE_CONFIG = { apiBase: apiBase, remote: 'auto' };
  vm.createContext(sandbox);

  vm.runInContext(fs.readFileSync(path.join(PROJECT, 'js/config.js'), 'utf8'), sandbox);
  sandbox.INKCADENCE_CONFIG.apiBase = apiBase;
  vm.runInContext(fs.readFileSync(path.join(PROJECT, 'js/store.js'), 'utf8'), sandbox);
  return sandbox.Store;
}

async function main() {
  console.log('-- Store when the API is unreachable --');
  const storage = fakeStorage();
  const Store = loadBrowser('http://127.0.0.1:9', storage);
  const mode = await Store.ready;
  check('falls back to local', mode === 'local', 'got ' + mode);
  check('mode() agrees', Store.mode() === 'local');

  const name = await Store.signup('offlineuser', 'offline-password');
  check('local signup works', name === 'offlineuser', 'got ' + name);
  check('session persisted on the device', storage.getItem('inkcadence:session') != null, JSON.stringify(storage._dump()));
  check('no API token in local mode', storage.getItem('inkcadence:token') === null);

  const who = await Store.currentUser();
  check('currentUser round-trips', who === 'offlineuser', 'got ' + who);

  const pack = await Store.savePack('offlineuser', { id: 'p1', name: 'Offline', glyphs: [{ c: 'a' }] });
  check('local savePack works', pack && pack.id === 'p1');
  const list = await Store.packs('offlineuser');
  check('local packs() works', list.length === 1 && list[0].name === 'Offline', JSON.stringify(list).slice(0, 120));
  check('listed pack carries glyphs', list[0].glyphs && list[0].glyphs.length === 1);

  const deleted = await Store.deletePack('offlineuser', 'p1');
  check('local deletePack works', deleted.length === 0);

  let shortPw = null;
  try { await Store.signup('someoneelse', 'short'); } catch (e) { shortPw = e; }
  check('local mode enforces 8-char minimum', !!shortPw && /8 characters/i.test(shortPw.message), shortPw && shortPw.message);

  await Store.logout();
  const afterLogout = await Store.currentUser();
  check('currentUser is null after logout', afterLogout === null, 'got ' + afterLogout);

  console.log('\n' + '='.repeat(52));
  console.log('  passed: ' + pass + '   failed: ' + failures.length);
  if (failures.length) { failures.forEach((f) => console.log('   - ' + f)); process.exit(1); }
  console.log('  all green');
}

main().catch((err) => { console.error('HARNESS ERROR:', err); process.exit(2); });
