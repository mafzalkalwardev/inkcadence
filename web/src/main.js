import './styles/tokens.css';
import './styles/layout.css';
import { Store } from './lib/store.js';
import { CharCNN } from './lib/charcnn.js';
import { S, $, esc, card } from './ui/shared.js';
import { homeHtml } from './screens/home.js';
import { guideHtml, wireGuide, setWizard, loadDemoHand } from './screens/guide.js';
import { writeHtml, wireWrite } from './screens/write.js';
import {
  refreshPacks, renderPackList, renderPackSelect, wireHands, onHandSelect,
} from './screens/hands.js';

CharCNN.load(['/charcnn.json', 'charcnn.json']).catch(function (err) {
  console.warn('[CharCNN]', err && err.message ? err.message : err);
});

const root = document.getElementById('app');
const THEME_KEY = 'inkcadence-theme';

function readTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme, persist) {
  document.documentElement.setAttribute('data-theme', theme);
  if (persist) {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#14110e' : '#f4efe6');
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* private mode */ }
  const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(theme, false);
}

function themeToggleHtml() {
  const dark = readTheme() === 'dark';
  return `<button type="button" class="btn-ghost theme-toggle" id="themeToggle" aria-pressed="${dark}" aria-label="Switch color theme">${dark ? 'Light theme' : 'Dark theme'}</button>`;
}

function wireThemeToggle() {
  const btn = $('#themeToggle');
  if (!btn) return;
  btn.onclick = () => {
    const next = readTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
    btn.textContent = next === 'dark' ? 'Light theme' : 'Dark theme';
    btn.setAttribute('aria-pressed', String(next === 'dark'));
  };
}

function brandSvg() {
  return `<svg class="mark" width="36" height="36" viewBox="0 0 128 128" aria-hidden="true">
    <path fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"
      d="M14 96 C26 96 28 32 44 32 C60 32 58 104 74 104 C90 104 92 40 112 40"/>
  </svg>`;
}

function showScreen(name) {
  const home = $('#home');
  const train = $('#tabTrain');
  const write = $('#tabWrite');
  if (home) home.hidden = name !== 'home';
  if (train) train.hidden = name !== 'train';
  if (write) write.hidden = name !== 'write';
  document.querySelectorAll('.tabs button').forEach((b) => {
    b.classList.toggle('on', b.dataset.tab === name);
  });
  if (name === 'write') renderPackSelect();
}

function startGuide() {
  S.activeId = null;
  S.draftPack = null;
  S.refImages = [];
  S.sheetSrc = null;
  S.sheetReads = [];
  const name = $('#packName');
  if (name) name.value = '';
  const attest = $('#attest');
  if (attest) attest.checked = false;
  const thumbs = $('#thumbsRef');
  if (thumbs) thumbs.innerHTML = '';
  setWizard(1);
  showScreen('train');
}

initTheme();

async function renderApp() {
  await refreshPacks();
  const canSave = Store.persistent();
  root.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar" aria-label="Hands">
      <div class="sidebar-brand">
        ${brandSvg()}
        <div>
          <span class="brand-name">Inkcadence</span>
          <span class="brand-tag">your hand, on every page</span>
        </div>
      </div>
      ${canSave ? '' : '<p class="save-notice" id="saveNotice">Hands can\'t be saved in this browser. This session keeps them in memory until you close the tab.</p>'}
      <div class="sidebar-section">
        <div class="sidebar-section-head">
          <h3>Hands</h3>
          <span class="pack-count" id="packCount">0</span>
        </div>
        <ul class="plist" id="packList"></ul>
      </div>
      <div class="sidebar-actions">
        <button class="btn-new" id="btnNewPack" type="button">Make my handwriting</button>
        <button class="btn-ghost" id="btnAddPages" type="button">Add pages</button>
        <input id="fileAddPages" type="file" accept="image/*" multiple hidden>
        ${themeToggleHtml()}
      </div>
    </aside>
    <main class="workspace">
      <div class="tabs">
        <button type="button" data-tab="home" class="on">Home</button>
        <button type="button" data-tab="train">Make a hand</button>
        <button type="button" data-tab="write">Write</button>
      </div>
      ${homeHtml()}
      <section id="tabTrain" hidden>${guideHtml()}</section>
      <section id="tabWrite" hidden>${writeHtml()}</section>
    </main>
  </div>`;
  document.querySelectorAll('.tabs button').forEach((b) => {
    b.onclick = () => showScreen(b.dataset.tab);
  });
  $('#btnNewPack').onclick = startGuide;
  $('#btnMakeHand').onclick = startGuide;
  $('#btnDemo').onclick = async () => {
    card($('#homeMsg'), 'Opening the demo hand…');
    try {
      await loadDemoHand();
      await refreshPacks();
      const demo = S.packs.find((p) => p.id === 'pk_demo');
      if (demo) S.activeId = demo.id;
      renderPackList();
      showScreen('write');
      card($('#writeMsg'), 'Demo hand is ready. Tap Write the page.');
    } catch (e) {
      card($('#homeMsg'), 'The demo hand is not on this site yet. Make your own from the letter sheet.', 'bad');
    }
  };
  onHandSelect(() => showScreen('write'));
  wireHands();
  wireGuide(showScreen);
  wireWrite();
  wireThemeToggle();
  renderPackList();
  renderPackSelect();
}

async function router() {
  await Store.ready;
  return renderApp();
}

window.addEventListener('hashchange', () => { router().catch(console.error); });
Store.ready.then(() => router()).catch((err) => {
  root.innerHTML = `<div class="auth-shell"><div class="panel err">Failed to start: ${esc(err.message)}</div></div>`;
});
