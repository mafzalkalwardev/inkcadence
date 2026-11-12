import './styles/tokens.css';
import './styles/layout.css';
import { Store } from './lib/store.js';
import { Imaging } from './lib/imaging.js';
import { Glyphs } from './lib/glyphs.js';
import { Rendering } from './lib/render.js';
import { Presets } from './lib/presets.js';
import { CharCNN } from './lib/charcnn.js';
import { Harvest } from './lib/harvest.js';
import { Assignment } from './lib/assignment.js';
import { PackShare } from './lib/packshare.js';
import { LetterSheet } from './lib/lettersheet.js';
import { CopyLines } from './lib/copylines.js';
import { packQuality, tryPhrase } from './lib/qa.js';

CharCNN.load(['/charcnn.json', 'charcnn.json']).catch(function (err) {
  console.warn('[CharCNN]', err && err.message ? err.message : err);
});

const root = document.getElementById('app');

const S = {
  packs: [],
  activeId: null,
  refImages: [],
  sheetSrc: null,
  sheetReads: [],
  lastPages: [],
  pen: null,
  wizardStep: 1,
  draftPack: null,
  renderMode: 'auto',
};

function $(sel, el = document) {
  return el.querySelector(sel);
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
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

function themeToggleHtml(extraClass = 'ghost tiny') {
  const dark = readTheme() === 'dark';
  return `<button type="button" class="${extraClass} theme-toggle" id="themeToggle" aria-pressed="${dark}" aria-label="Switch color theme">${dark ? 'Light theme' : 'Dark theme'}</button>`;
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

initTheme();

function brandSvg() {
  return `<svg class="mark" width="36" height="36" viewBox="0 0 128 128" aria-hidden="true">
    <path fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"
      d="M14 96 C26 96 28 32 44 32 C60 32 58 104 74 104 C90 104 92 40 112 40"/>
  </svg>`;
}

/* ---------------- app shell ---------------- */
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
        <button class="btn-new" id="btnNewPack">＋ New hand</button>
        <button class="btn-ghost" id="btnAddPages" type="button">Add pages</button>
        <input id="fileAddPages" type="file" accept="image/*" multiple hidden>
        ${themeToggleHtml('btn-ghost')}
      </div>
    </aside>
    <main class="workspace">
      <div class="tabs">
        <button data-tab="train" class="on">Make a hand</button>
        <button data-tab="write">Write</button>
      </div>
      <section id="tabTrain">${trainWizardHtml()}</section>
      <section id="tabWrite" hidden>${writeHtml()}</section>
    </main>
  </div>`;
  wireApp();
  wireThemeToggle();
  renderPackList();
  renderPackSelect();
}

function trainWizardHtml() {
  return `
  <div class="welcome" aria-label="How it works">
    <div><strong>1. Your pages</strong><span>Photos of notes you already wrote.</span></div>
    <div><strong>2. Letter sheet</strong><span>Print it, fill the boxes, photograph it.</span></div>
    <div><strong>3. Write</strong><span>Type your words. The page uses your letters.</span></div>
  </div>
  <div class="panel rise">
    <h2>Make a hand</h2>
    <p class="muted">Name it, add a few pages, then the letter sheet.</p>
    <div class="wizard-steps">
      <span class="step on" data-step="1">1 Pages</span>
      <span class="step" data-step="2">2 Sheet</span>
      <span class="step" data-step="3">3 Check</span>
      <span class="step" data-step="4">4 Save</span>
    </div>
    <div class="field"><label>Name</label><input id="packName" placeholder="For example, blue pen"></div>
    <div id="wiz1">
      <div class="drop">
        <h4>Your pages</h4>
        <p class="small muted">Add 1 to 8 photos. These teach the pen, the slant, and the spacing.</p>
        <input type="file" id="fileRef" accept="image/*" multiple hidden>
        <button class="ghost tiny" id="btnPickRef">Choose images</button>
        <div class="thumbs" id="thumbsRef"></div>
      </div>
      <div class="row" style="margin-top:14px"><button id="wizNext1">Continue to sheet</button></div>
    </div>
    <div id="wiz2" hidden>
      <div class="drop">
        <h4>Letter sheet</h4>
        <p class="small muted">Print both pages, write one character in each box, then photograph each page with all four corner marks in the frame. <a href="${import.meta.env.BASE_URL}sheet.html" target="_blank">Open the letter sheet</a></p>
        <input type="file" id="fileSheet" accept="image/*" multiple hidden>
        <button class="ghost tiny" id="btnPickSheet">Upload sheet photos</button>
        <div id="sheetWrap" hidden>
          <div class="thumbs" id="thumbsSheet"></div>
          <p class="small muted" id="sheetSummary"></p>
        </div>
      </div>
      <div class="drop" style="margin-top:12px">
        <h4>No printer?</h4>
        <p class="small muted">Copy these lines onto any paper, then photograph the page. Each letter is read from its place in the line.</p>
        <ol class="copy-lines">
          ${CopyLines.LINES.map((line) => `<li>${esc(line)}</li>`).join('')}
        </ol>
        <input type="file" id="fileCopy" accept="image/*" hidden>
        <button class="ghost tiny" id="btnPickCopy" type="button">Upload the copy</button>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="ghost" id="wizBack2">Back</button>
        <button id="wizNext2">Check this hand</button>
      </div>
    </div>
    <div id="wiz3" hidden>
      <div id="qaBody"></div>
      <div class="field" style="margin-top:12px">
        <label>Try phrase preview</label>
        <input id="tryPhrase" value="${esc(tryPhrase())}">
        <button class="ghost tiny" id="btnTryPreview" style="margin-top:8px">Preview</button>
        <div id="tryPreview" style="margin-top:10px"></div>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="ghost" id="wizBack3">Back</button>
        <button id="wizNext3">Continue to save</button>
      </div>
    </div>
    <div id="wiz4" hidden>
      <p class="hint">Save keeps the letters, not the photos. The photos stay in this browser session only.</p>
      <div class="row">
        <button class="ghost" id="wizBack4">Back</button>
        <button id="btnBuild">Save hand</button>
        <span class="small muted" id="buildState"></span>
      </div>
    </div>
    <div id="buildMsg" style="margin-top:12px"></div>
  </div>
  <div class="panel" id="resultCard" hidden><h3>Letters from this hand</h3><div id="resultBody"></div></div>`;
}

function writeHtml() {
  return `
  <div class="panel rise">
    <h2>Write</h2>
    <p class="muted">Pick a hand, type the words, then write the page. Start a line with # to make a heading.</p>
    <div class="field"><label>Hand</label><select id="wPack"></select></div>
    <div class="field"><label>Words</label>
      <textarea id="wText"># Notes

Write the words you want on the page. The letters come from your hand.</textarea>
    </div>
    <div class="grid2">
      <div class="field"><label>Ink</label><div class="swatch" id="wColor"></div></div>
      <div class="field"><label>Paper</label>
        <select id="wPaper"><option value="ruled">Lined</option><option value="plain">Blank</option><option value="grid">Grid</option></select>
      </div>
    </div>
    <details class="more">
      <summary>More options</summary>
      <div class="grid2">
        <div class="field"><label>Heading line</label>
          <select id="wHeading"><option value="underline">Underline</option><option value="double">Double line</option><option value="none">None</option></select>
        </div>
        <div class="field"><label>Size</label><input id="wSize" type="range" min="22" max="56" value="34"></div>
        <div class="field"><label>Variation</label><input id="wJitter" type="range" min="0" max="150" value="55"></div>
        <div class="field"><label>Page variety</label><input id="wSeed" type="range" min="1" max="99" value="7"></div>
      </div>
    </details>
    <div class="row">
      <button id="btnRender">Write the page</button>
      <button class="ghost" id="btnPrint">Print</button>
      <label class="small muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="wMark" checked style="width:auto"> Show the AI-assisted note</label>
    </div>
    <div id="writeMsg" style="margin-top:10px"></div>
  </div>
  <div id="pages"></div>`;
}

function setWizard(step) {
  S.wizardStep = step;
  for (let i = 1; i <= 4; i++) {
    const pane = $('#wiz' + i);
    if (pane) pane.hidden = i !== step;
  }
  document.querySelectorAll('.wizard-steps .step').forEach((el) => {
    const n = +el.dataset.step;
    el.classList.toggle('on', n === step);
    el.classList.toggle('done', n < step);
  });
}

function card(el, html, kind) {
  if (!el) return;
  el.innerHTML = html ? `<div class="${kind === 'bad' ? 'err' : 'hint'}">${html}</div>` : '';
}

async function refreshPacks() {
  S.packs = (await Store.hands()) || [];
  if (!S.activeId && S.packs.length) S.activeId = S.packs[0].id;
  if (!S.packs.some((p) => p.id === S.activeId)) S.activeId = S.packs[0]?.id || null;
}

function renderPackList() {
  const ul = $('#packList');
  if (!ul) return;
  const count = $('#packCount');
  if (count) count.textContent = String(S.packs.length);
  ul.innerHTML = '';
  if (!S.packs.length) {
    ul.innerHTML = '<li class="empty">No hands yet. Build one from your pages to see it here.</li>';
    return;
  }
  S.packs.forEach((p) => {
    const li = document.createElement('li');
    li.className = p.id === S.activeId ? 'active' : '';
    li.title = p.name;
    const glyphs = (p.glyphs && p.glyphs.length) || 0;
    const pens = (p.penColours && p.penColours.length) || 0;
    const meta = glyphs ? `${glyphs} letters${pens ? ' · ' + pens + ' ink' : ''}` : 'Hand';
    li.innerHTML = `<span class="dot" style="background:${esc((p.penColours && p.penColours[0]) || '#2f6fed')}"></span>
      <div style="flex:1;min-width:0"><span class="pname">${esc(p.name)}</span><span class="pmeta">${esc(meta)}</span></div>`;
    const del = document.createElement('button');
    del.className = 'pack-del';
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete ' + p.name);
    del.textContent = '×';
    del.onclick = (ev) => {
      ev.stopPropagation();
      if (!confirm('Delete "' + p.name + '"?')) return;
      Store.deleteHand(p.id).then((list) => {
        S.packs = list;
        if (S.activeId === p.id) S.activeId = list[0]?.id || null;
        renderPackList();
        renderPackSelect();
      });
    };
    li.onclick = () => { S.activeId = p.id; renderPackList(); renderPackSelect(); showResult(p); };
    li.appendChild(del);
    ul.appendChild(li);
  });
}

function renderPackSelect() {
  const sel = $('#wPack');
  if (!sel) return;
  sel.innerHTML = '';
  if (!S.packs.length) {
    sel.innerHTML = '<option value="">— no hand yet —</option>';
    return;
  }
  S.packs.forEach((p) => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    if (p.id === S.activeId) o.selected = true;
    sel.appendChild(o);
  });
  syncPenSwatches();
}

function activePack() {
  return S.packs.find((p) => p.id === S.activeId) || null;
}

function syncPenSwatches() {
  const box = $('#wColor');
  if (!box) return;
  box.innerHTML = '';
  const p = activePack();
  const colours = p?.penColours?.length ? p.penColours : ['#1b2a4a', '#123a8c', '#111111'];
  S.pen = colours[0];
  colours.forEach((hex, i) => {
    const b = document.createElement('button');
    b.style.background = hex;
    if (i === 0) b.className = 'on';
    b.onclick = () => {
      S.pen = hex;
      [...box.children].forEach((c) => { c.className = ''; });
      b.className = 'on';
    };
    box.appendChild(b);
  });
}

function showSheetThumbs() {
  const host = $('#thumbsSheet');
  if (!host) return;
  host.innerHTML = '';
  S.sheetReads.forEach((read) => {
    const note = document.createElement('p');
    note.className = 'small muted';
    const label = read.kind === 'fill-in' ? 'Fill-in' : (read.kind === 'copy' ? 'Copied lines' : 'Page ' + (read.page + 1));
    const empty = read.kind === 'copy' ? ' not placed.' : ' empty boxes.';
    note.textContent = label + ': ' + read.glyphs.length + ' letters, ' + read.missing.length + empty;
    host.appendChild(note);
  });
  $('#sheetWrap').hidden = false;
}

let analyzeWorker;
let analyzeSeq = 0;
const analyzePending = new Map();

function getAnalyzeWorker() {
  if (analyzeWorker) return analyzeWorker;
  analyzeWorker = new Worker(new URL('./lib/imaging.worker.js', import.meta.url), { type: 'module' });
  analyzeWorker.onmessage = (ev) => {
    const msg = ev.data || {};
    const pending = analyzePending.get(msg.id);
    if (!pending) return;
    analyzePending.delete(msg.id);
    if (msg.ok) pending.resolve(msg.result);
    else pending.reject(new Error(msg.error || 'Page analysis failed'));
  };
  analyzeWorker.onerror = (err) => {
    analyzePending.forEach((pending) => pending.reject(err.error || err));
    analyzePending.clear();
    analyzeWorker = null;
  };
  return analyzeWorker;
}

function analyzeCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const id = ++analyzeSeq;
  return new Promise((resolve, reject) => {
    analyzePending.set(id, { resolve, reject });
    getAnalyzeWorker().postMessage({
      type: 'analyzeImageData',
      id,
      width: canvas.width,
      height: canvas.height,
      buffer: image.data.buffer,
    }, [image.data.buffer]);
  });
}

async function analyzeCanvases(canvases) {
  if (typeof Worker !== 'undefined') {
    try {
      return await Promise.all(canvases.map((c) => analyzeCanvas(c)));
    } catch (_) { /* fall back to this thread */ }
  }
  return canvases.map((c) => {
    const result = Imaging.analyze(c);
    delete result.thumb;
    return result;
  });
}

function handPens(stats) {
  const rich = stats.pens || [];
  if (!rich.length) {
    return (stats.palette || []).filter((c) => c.kind !== 'faint').map((c) => c.hex);
  }
  const ordered = rich.filter((p) => p.role === 'body').map((p) => p.hex)
    .concat(rich.filter((p) => p.role === 'heading').map((p) => p.hex));
  return [...new Set(ordered)].slice(0, 4);
}

async function buildDraftPack() {
  const name = $('#packName').value.trim() || 'Untitled pack';
  let stats = null;
  if (S.refImages.length) {
    const analyses = await analyzeCanvases(S.refImages);
    stats = Imaging.mergeAnalyses(analyses);
    delete stats.thumbs;
  }
  let glyphs = [], missing = [], cellH = 92, cellW = 70;
  if (S.sheetReads.length) {
    S.sheetReads.forEach((read) => {
      glyphs = glyphs.concat(read.glyphs);
      missing = missing.concat(read.missing);
    });
    if (glyphs[0]) {
      cellH = glyphs[0].cellH || cellH;
      cellW = glyphs[0].cellW || cellW;
    }
  }
  let harvested = [];
  const hadSheetGlyphs = glyphs.length > 0;
  if (S.refImages.length) {
    if (typeof CharCNN !== 'undefined' && CharCNN.load && !CharCNN.isReady()) {
      try { await CharCNN.load(['/charcnn.json', 'charcnn.json']); } catch (_) { /* empty harvest */ }
    }
    harvested = await Harvest.harvestFromPagesAsync(S.refImages, { examples: [] });
    glyphs = Harvest.mergeVariants(glyphs, harvested);
    if (!hadSheetGlyphs && harvested.length) {
      const med = Harvest.medianCellMetrics ? Harvest.medianCellMetrics(harvested) : null;
      if (med) {
        cellH = med.cellH;
        cellW = med.cellW;
      } else if (harvested[0].cellH) {
        cellH = harvested[0].cellH;
        cellW = harvested[0].cellW;
      }
    }
  }
  if (!stats) {
    stats = {
      pages: 0, slant: 0.1, strokeWidth: 3, lineGap: Math.round(cellH * 1.7),
      inkRatio: 0, paper: '#fdfcf7', palette: [{ hex: '#1b2a4a', kind: 'pen', share: 100 }], thumbs: [],
    };
  }
  const base = Presets.matchFromStats(stats);
  let pens = handPens(stats);
  if (!pens.length) pens = (base.penColours || ['#1b2a4a']).slice();
  const scored = Assignment.styleScore(stats);
  const pats = stats.patterns || {};
  let jitter = base.defaultJitter;
  if (pats.neatness != null) {
    jitter = pats.neatness >= 0.72 ? 0.28 : (pats.neatness >= 0.5 ? 0.48 : 0.7);
  } else if (pats.qualityGuess === 'best') {
    jitter = 0.28;
  }
  const paperStyle = pats.paperStyle || stats.paperStyle || 'ruled';
  const pack = {
    id: 'pk_' + Date.now().toString(36),
    name,
    created: Date.now(),
    cellH, cellW, glyphs, missing, stats,
    patterns: pats,
    harvestedCount: harvested.length,
    penColours: pens.slice(0, 4),
    paper: stats.paper,
    paperStyle,
    slant: stats.slant,
    strokeWidth: stats.strokeWidth,
    lineGap: stats.lineGap || base.lineGap,
    fontFamily: glyphs.length ? null : base.fontFamily,
    pens: stats.pens || [],
    heading: stats.heading || null,
    style: stats.style || null,
    headingStyle: (stats.heading && stats.heading.underline) ? 'underline' : base.headingStyle,
    defaultJitter: jitter,
    tracking: base.tracking,
    baseStyleId: base.id,
    baseStyleName: base.name,
    styleScore: scored.score,
    renderMode: 'auto',
    examples: await Harvest.examplesFromGlyphs(glyphs),
  };
  S.draftPack = pack;
  return pack;
}

function showQa(pack) {
  const qa = packQuality(pack);
  $('#qaBody').innerHTML = `
    <div class="qa-score">${qa.score}<span class="small muted"> / 100</span></div>
    <div class="meter"><span style="width:${qa.score}%"></span></div>
    <div class="stats">
      <div class="stat"><b>${qa.completeness}%</b><span>glyph coverage</span></div>
      <div class="stat"><b>${qa.captured}/${qa.total}</b><span>letterforms</span></div>
      <div class="stat"><b>${qa.strokeConf}</b><span>stroke confidence</span></div>
      <div class="stat"><b>${(pack.stats && pack.stats.pages) || 0}</b><span>sample pages</span></div>
    </div>
    ${qa.missing.length ? `<p class="small muted"><b>${qa.missing.length}</b> empty: ${esc(qa.missing.join(' '))}</p>` : ''}
    ${(pack.pens || []).length ? `<p class="small muted">Pens: ${pack.pens.map((p) => esc(p.role) + ' ' + esc(p.kind)).join(', ')}</p>` : ''}
    ${pack.heading ? `<p class="small muted">Heading is ${esc(pack.heading.scale)}× the body text${pack.heading.underline ? ', underlined' : ''}.</p>` : ''}
    <p class="hint">${qa.ready ? 'Looks good to save.' : 'Coverage is low — fill more sheet cells for better classical output.'}</p>`;
}

function showResult(pack) {
  if (!pack || !$('#resultBody')) return;
  const st = pack.stats || {};
  const qa = packQuality(pack);
  let html = `<div class="stats">
    <div class="stat"><b>${st.pages || 0}</b><span>reference pages</span></div>
    <div class="stat"><b>${st.slant != null ? (st.slant * 100).toFixed(0) + '%' : '—'}</b><span>slant</span></div>
    <div class="stat"><b>${st.strokeWidth || '—'}</b><span>stroke px</span></div>
    <div class="stat"><b>${(pack.glyphs || []).length}</b><span>letterforms</span></div>
    <div class="stat"><b>${qa.score}</b><span>QA score</span></div>
  </div>`;
  if ((pack.glyphs || []).length) {
    html += '<div class="glyphgrid">' + pack.glyphs.slice(0, 90).map((g) =>
      `<figure><img src="${esc(g.url)}" alt="${esc(g.ch)}"><figcaption>${esc(g.ch)}</figcaption></figure>`
    ).join('') + '</div>';
  }
  $('#resultBody').innerHTML = html;
  $('#resultCard').hidden = false;
}

function wireApp() {
  document.querySelectorAll('.tabs button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.tabs button').forEach((x) => { x.className = ''; });
      b.className = 'on';
      $('#tabTrain').hidden = b.dataset.tab !== 'train';
      $('#tabWrite').hidden = b.dataset.tab !== 'write';
      if (b.dataset.tab === 'write') syncPenSwatches();
    };
  });
  $('#btnNewPack').onclick = () => {
    S.activeId = null; S.draftPack = null; S.refImages = []; S.sheetSrc = null; S.sheetReads = [];
    $('#packName').value = '';
    $('#thumbsRef').innerHTML = '';
    setWizard(1);
    document.querySelector('.tabs button[data-tab="train"]').click();
  };
  const addPages = $('#btnAddPages');
  const addPagesInput = $('#fileAddPages');
  if (addPages && addPagesInput) {
    addPages.onclick = () => {
      if (!activePack()) {
        card($('#buildMsg'), 'Save a hand first. Then add more of its pages here.');
        return;
      }
      addPagesInput.click();
    };
    addPagesInput.onchange = async () => {
      const files = [...(addPagesInput.files || [])].slice(0, 8);
      addPagesInput.value = '';
      const hand = activePack();
      if (!hand || !files.length) return;
      card($('#buildMsg'), 'Reading the new pages…');
      try {
        const cans = (await Promise.all(files.map((f) => Imaging.loadImageFile(f).catch(() => null)))).filter(Boolean);
        if (!cans.length) {
          card($('#buildMsg'), 'Those images could not be read.', 'bad');
          return;
        }
        const analyses = await analyzeCanvases(cans);
        const stats = Imaging.mergeAnalyses(analyses);
        delete stats.thumbs;
        if (CharCNN.load && !CharCNN.isReady()) {
          try { await CharCNN.load(['/charcnn.json', 'charcnn.json']); } catch (_) { /* labels may be empty */ }
        }
        const harvested = await Harvest.harvestFromPagesAsync(cans, { examples: hand.examples || [] });
        const report = Harvest.addToHand(hand, harvested, stats);
        await Store.saveHand(hand);
        await refreshPacks();
        renderPackList();
        renderPackSelect();
        const pages = cans.length === 1 ? '1 page' : cans.length + ' pages';
        card($('#buildMsg'), 'Added ' + pages + '. Coverage ' + report.coverageBefore + '% to ' + report.coverageAfter + '%. Variants per letter ' + report.variantsBefore + ' to ' + report.variantsAfter + '. Confidence ' + report.confidenceBefore + ' to ' + report.confidenceAfter + '.');
      } catch (err) {
        card($('#buildMsg'), 'Could not add those pages.', 'bad');
      }
    };
  }

  $('#btnPickRef').onclick = () => $('#fileRef').click();
  $('#btnPickSheet').onclick = () => $('#fileSheet').click();
  const pickCopy = $('#btnPickCopy');
  const fileCopy = $('#fileCopy');
  if (pickCopy && fileCopy) {
    pickCopy.onclick = () => fileCopy.click();
    fileCopy.onchange = () => {
      const files = [...(fileCopy.files || [])].slice(0, 1);
      fileCopy.value = '';
      if (!files.length) return;
      card($('#buildMsg'), 'Reading the copied lines…');
      Imaging.loadImageFile(files[0]).then((canvas) => {
        const read = CopyLines.read(canvas);
        S.sheetReads = S.sheetReads.filter((r) => r.kind !== 'copy').concat(read);
        S.sheetSrc = canvas;
        showSheetThumbs();
        card($('#buildMsg'), read.glyphs.length + ' letters read from the copy. ' + read.missing.length + ' characters could not be placed.');
      }).catch((e) => card($('#buildMsg'), e.message || 'Those images could not be read.', 'bad'));
    };
  }
  $('#fileRef').onchange = () => {
    const files = [...($('#fileRef').files || [])].slice(0, 8);
    Promise.all(files.map((f) => Imaging.loadImageFile(f).catch(() => null))).then((cans) => {
      S.refImages = cans.filter(Boolean);
      $('#thumbsRef').innerHTML = '';
      S.refImages.forEach((c) => {
        const t = document.createElement('canvas');
        const s = 150 / c.width;
        t.width = 150; t.height = Math.round(c.height * s);
        t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
        $('#thumbsRef').appendChild(t);
      });
      card($('#buildMsg'), S.refImages.length + ' page(s) ready.');
    });
  };
  $('#fileSheet').onchange = () => {
    const files = [...($('#fileSheet').files || [])].slice(0, 4);
    if (!files.length) return;
    card($('#buildMsg'), 'Lining up the corner marks…');
    Promise.all(files.map((f) => Imaging.loadImageFile(f))).then(async (cans) => {
      const reads = [];
      for (const c of cans) reads.push(LetterSheet.read(c));
      S.sheetReads = reads;
      S.sheetSrc = cans[0] || null;
      showSheetThumbs();
      const letters = reads.reduce((n, r) => n + r.glyphs.length, 0);
      card($('#buildMsg'), letters + ' letters read from ' + reads.length + ' photo' + (reads.length === 1 ? '' : 's') + '.');
    }).catch((e) => card($('#buildMsg'), e.message, 'bad'));
  };

  $('#wizNext1').onclick = () => setWizard(2);
  $('#wizBack2').onclick = () => setWizard(1);
  $('#wizNext2').onclick = async () => {
    if (!S.refImages.length && !S.sheetReads.length) {
      card($('#buildMsg'), 'Add samples or a sheet first.', 'bad');
      return;
    }
    card($('#buildMsg'), 'Recognising letters with the handwriting CNN…');
    const pack = await buildDraftPack();
    showQa(pack);
    setWizard(3);
  };
  $('#wizBack3').onclick = () => setWizard(2);
  $('#wizNext3').onclick = () => setWizard(4);
  $('#wizBack4').onclick = () => setWizard(3);

  $('#btnTryPreview').onclick = async () => {
    const pack = S.draftPack || activePack();
    if (!pack) return;
    await Glyphs.hydrate(pack);
    const pages = Rendering.renderPages({
      text: $('#tryPhrase').value,
      pack,
      size: 32,
      jitter: 0.45,
      seed: 3,
      penColour: (pack.penColours && pack.penColours[0]) || '#1b2a4a',
      paper: 'ruled',
      paperColour: pack.paper || '#fdfcf7',
      watermark: false,
    });
    const host = $('#tryPreview');
    host.innerHTML = '';
    const c = pages[0];
    c.style.width = '100%';
    c.style.maxWidth = '420px';
    c.style.height = 'auto';
    c.style.borderRadius = '8px';
    c.style.boxShadow = '0 8px 24px rgba(20,30,50,.14)';
    host.appendChild(c);
  };

  $('#btnBuild').onclick = async () => {
    const pack = S.draftPack || (await buildDraftPack());
    if (!$('#packName').value.trim()) { card($('#buildMsg'), 'Name the hand first.', 'bad'); return; }
    pack.name = $('#packName').value.trim();
    $('#btnBuild').disabled = true;
    $('#buildState').textContent = 'saving…';
    try {
      const saved = await Store.saveHand(pack);
      S.activeId = saved.id || pack.id;
      await refreshPacks();
      renderPackList();
      renderPackSelect();
      showResult(pack);
      card($('#buildMsg'), 'Saved <b>' + esc(pack.name) + '</b>.');
      setWizard(1);
    } catch (e) {
      card($('#buildMsg'), 'Could not save: ' + e.message, 'bad');
    } finally {
      $('#btnBuild').disabled = false;
      $('#buildState').textContent = '';
    }
  };

  if ($('#wPack')) {
    $('#wPack').onchange = () => { S.activeId = $('#wPack').value; renderPackList(); syncPenSwatches(); };
  }

  $('#btnRender').onclick = async () => {
    const pack = activePack();
    if (!pack) { card($('#writeMsg'), 'Build a hand first.', 'bad'); return; }
    const btn = $('#btnRender');
    btn.disabled = true;
    card($('#writeMsg'), 'Laying out pages…');
    try {
      await Glyphs.hydrate(pack);
      const pages = Rendering.renderPages({
        text: $('#wText').value,
        pack,
        size: +$('#wSize').value,
        jitter: +$('#wJitter').value / 100,
        seed: +$('#wSeed').value,
        penColour: S.pen || pack.penColours?.[0] || '#1b2a4a',
        paper: $('#wPaper').value,
        paperColour: pack.paper || '#fdfcf7',
        headingStyle: $('#wHeading').value,
        watermark: $('#wMark').checked,
        fontFamily: pack.fontFamily,
        tracking: pack.tracking,
        continuity: true,
        pageNumbers: true,
      });
      card($('#writeMsg'), 'Pages are ready.');

      S.lastPages = pages;
      const host = $('#pages');
      host.innerHTML = '';
      const bar = document.createElement('div');
      bar.className = 'pagebar';
      bar.innerHTML = `<div class="small muted">${pages.length} page(s)</div>`;
      const dl = document.createElement('button');
      dl.className = 'ghost tiny';
      dl.textContent = 'Download PNGs';
      dl.onclick = () => {
        pages.forEach((c, i) => {
          setTimeout(() => {
            const a = document.createElement('a');
            a.download = (pack.name.replace(/[^\w-]+/g, '_') || 'page') + '_p' + (i + 1) + '.png';
            a.href = c.toDataURL('image/png');
            a.click();
          }, i * 350);
        });
      };
      bar.appendChild(dl);
      host.appendChild(bar);
      pages.forEach((c, i) => {
        const wrap = document.createElement('div');
        wrap.style.marginBottom = '22px';
        wrap.innerHTML = `<div class="small muted" style="text-align:center;margin-bottom:6px">Page ${i + 1}</div>`;
        c.className = 'page';
        wrap.appendChild(c);
        host.appendChild(wrap);
      });
    } catch (e) {
      card($('#writeMsg'), 'Render failed: ' + e.message, 'bad');
    } finally {
      btn.disabled = false;
    }
  };

  $('#btnPrint').onclick = () => {
    if (!S.lastPages.length) { card($('#writeMsg'), 'Render first.', 'bad'); return; }
    const w = window.open('', '_blank');
    if (!w) { card($('#writeMsg'), 'Allow pop-ups for print.', 'bad'); return; }
    const imgs = S.lastPages.map((c) => '<img src="' + c.toDataURL('image/jpeg', 0.92) + '">').join('');
    w.document.write('<!doctype html><title>Print</title><style>@page{size:A4;margin:0}body{margin:0}img{display:block;width:210mm;height:297mm;page-break-after:always}</style>' + imgs);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };
}

async function router() {
  await Store.ready;
  return renderApp();
}

window.addEventListener('hashchange', () => { router().catch(console.error); });
Store.ready.then(() => router()).catch((err) => {
  root.innerHTML = `<div class="auth-shell"><div class="panel err">Failed to start: ${esc(err.message)}</div></div>`;
});
