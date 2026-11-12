import { Store } from '../lib/store.js';
import { Imaging } from '../lib/imaging.js';
import { Glyphs } from '../lib/glyphs.js';
import { Rendering } from '../lib/render.js';
import { Presets } from '../lib/presets.js';
import { CharCNN } from '../lib/charcnn.js';
import { Harvest } from '../lib/harvest.js';
import { Assignment } from '../lib/assignment.js';
import { PackShare } from '../lib/packshare.js';
import { LetterSheet } from '../lib/lettersheet.js';
import { CopyLines } from '../lib/copylines.js';
import { Generate } from '../lib/generate.js';
import { packQuality, tryPhrase } from '../lib/qa.js';
import { S, $, esc, card } from '../ui/shared.js';
import { analyzeCanvases, photoProblem, explainSheetError } from '../ui/analyse.js';
import { activePack, refreshPacks, renderPackList, renderPackSelect } from './hands.js';

export function guideHtml() {
  return `
  <div class="panel rise">
    <h2>Make my handwriting</h2>
    <p class="muted">The letter sheet comes first. Old pages are optional.</p>
    <div class="wizard-steps">
      <span class="step on" data-step="1">1 Attest</span>
      <span class="step" data-step="2">2 Sheet</span>
      <span class="step" data-step="3">3 Pages</span>
      <span class="step" data-step="4">4 Analyse</span>
      <span class="step" data-step="5">5 Review</span>
    </div>
    <div id="wiz1">
      <div class="field"><label>Name</label><input id="packName" placeholder="For example, blue pen"></div>
      <label class="attest"><input type="checkbox" id="attest"> This is my handwriting</label>
      <p class="small muted">Only use writing you made yourself.</p>
      <div class="row step-actions"><button id="wizNext1" type="button">Continue</button></div>
    </div>
    <div id="wiz2" hidden>
      <div class="drop">
        <h4>Letter sheet</h4>
        <p class="small muted">Print both pages, write one character in each box, then photograph each page with all four corner marks in the frame. <a href="${import.meta.env.BASE_URL}sheet.html" target="_blank">Open the letter sheet</a></p>
        <input type="file" id="fileSheet" accept="image/*" multiple hidden>
        <input type="file" id="fileSheetCam" accept="image/*" capture="environment" hidden>
        <div class="row">
          <button class="ghost tiny" id="btnPickSheet" type="button">Upload sheet photos</button>
          <button class="ghost tiny" id="btnShootSheet" type="button">Take a photo</button>
        </div>
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
        <input type="file" id="fileCopyCam" accept="image/*" capture="environment" hidden>
        <div class="row">
          <button class="ghost tiny" id="btnPickCopy" type="button">Upload the copy</button>
          <button class="ghost tiny" id="btnShootCopy" type="button">Take a photo</button>
        </div>
      </div>
      <div class="row step-actions">
        <button class="ghost" id="wizBack2" type="button">Back</button>
        <button id="wizNext2" type="button">Continue</button>
      </div>
    </div>
    <div id="wiz3" hidden>
      <div class="drop">
        <h4>Old pages</h4>
        <p class="small muted">Optional. Add up to 8 pages you already wrote. They teach the pen, the slant, and headings.</p>
        <input type="file" id="fileRef" accept="image/*" multiple hidden>
        <input type="file" id="fileRefCam" accept="image/*" capture="environment" hidden>
        <div class="row">
          <button class="ghost tiny" id="btnPickRef" type="button">Upload pages</button>
          <button class="ghost tiny" id="btnShootRef" type="button">Take a photo</button>
        </div>
        <div class="thumbs" id="thumbsRef"></div>
      </div>
      <div class="row step-actions">
        <button class="ghost" id="wizBack3" type="button">Back</button>
        <button class="ghost" id="wizSkip3" type="button">Skip</button>
        <button id="wizNext3" type="button">Analyse</button>
      </div>
    </div>
    <div id="wiz4" hidden>
      <p id="analyseMsg">Reading your letters. This stays on this device.</p>
      <div class="meter" aria-hidden="true"><span id="analyseBar" style="width:8%"></span></div>
    </div>
    <div id="wiz5" hidden>
      <div id="qaBody"></div>
      <div id="resultCard"><h3>Letters from this hand</h3><div id="resultBody"></div></div>
      <div class="field" style="margin-top:12px">
        <label>Try phrase preview</label>
        <input id="tryPhrase" value="${esc(tryPhrase())}">
        <button class="ghost tiny" id="btnTryPreview" type="button" style="margin-top:8px">Preview</button>
        <div id="tryPreview" style="margin-top:10px"></div>
      </div>
      <div class="row step-actions">
        <button class="ghost" id="wizBack5" type="button">Back</button>
        <button id="btnBuild" type="button">Save and write</button>
        <span class="small muted" id="buildState"></span>
      </div>
    </div>
    <div id="buildMsg" style="margin-top:12px"></div>
  </div>`;
}

export function setWizard(step) {
  S.wizardStep = step;
  for (let i = 1; i <= 5; i++) {
    const pane = $('#wiz' + i);
    if (pane) pane.hidden = i !== step;
  }
  document.querySelectorAll('.wizard-steps .step').forEach((el) => {
    const n = +el.dataset.step;
    el.classList.toggle('on', n === step);
    el.classList.toggle('done', n < step);
  });
}

function sayProgress(pct, text) {
  const bar = $('#analyseBar');
  if (bar) bar.style.width = pct + '%';
  const msg = $('#analyseMsg');
  if (msg) msg.textContent = text;
}

function generatedNote(pack) {
  const chars = Generate.generatedChars(pack);
  if (!chars.length) return '';
  const href = import.meta.env.BASE_URL + 'sheet.html?chars=' + encodeURIComponent(chars.join(''));
  return `<p class="small">Generated from the other letters: ${esc(chars.join(' '))}. <a href="${href}" target="_blank">Write these by hand</a></p>`;
}

function showQa(pack) {
  const qa = packQuality(pack);
  const host = $('#qaBody');
  if (!host) return;
  host.innerHTML = `
    <div class="qa-score">${qa.score}<span class="small muted"> / 100</span></div>
    <div class="meter"><span style="width:${qa.score}%"></span></div>
    <div class="stats">
      <div class="stat"><b>${qa.completeness}%</b><span>glyph coverage</span></div>
      <div class="stat"><b>${qa.captured}/${qa.total}</b><span>letterforms</span></div>
      <div class="stat"><b>${qa.strokeConf}</b><span>stroke confidence</span></div>
      <div class="stat"><b>${(pack.stats && pack.stats.pages) || 0}</b><span>sample pages</span></div>
    </div>
    ${qa.missing.length ? `<p class="small muted"><b>${qa.missing.length}</b> empty: ${esc(qa.missing.join(' '))}</p>` : ''}
    ${generatedNote(pack)}
    ${(pack.pens || []).length ? `<p class="small muted">Pens: ${pack.pens.map((p) => esc(p.role) + ' ' + esc(p.kind)).join(', ')}</p>` : ''}
    ${pack.heading ? `<p class="small muted">Heading is ${esc(pack.heading.scale)}× the body text${pack.heading.underline ? ', underlined' : ''}.</p>` : ''}
    <p class="hint">${qa.ready ? 'Looks good to save.' : 'Some letters are still missing. You can write the ones you have, or fill a sheet for the rest.'}</p>`;
}

export function showResult(pack) {
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
      `<figure class="${g.source === 'generated' ? 'flag' : ''}"><img src="${esc(g.url)}" alt="${esc(g.ch)}"><figcaption>${esc(g.ch)}${g.source === 'generated' ? ' · generated' : ''}</figcaption></figure>`
    ).join('') + '</div>' + generatedNote(pack);
  }
  $('#resultBody').innerHTML = html;
  const cardEl = $('#resultCard');
  if (cardEl) cardEl.hidden = false;
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
  const name = ($('#packName') && $('#packName').value.trim()) || 'My hand';
  let stats = null;
  if (S.refImages.length) {
    sayProgress(28, 'Reading the pen, the slant, and the spacing.');
    const analyses = await analyzeCanvases(S.refImages);
    stats = Imaging.mergeAnalyses(analyses);
    delete stats.thumbs;
  }
  let glyphs = [];
  let missing = [];
  let cellH = 92;
  let cellW = 70;
  if (S.sheetReads.length) {
    sayProgress(46, 'Taking the letters from the sheet.');
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
    sayProgress(64, 'Checking letters on the old pages.');
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
  sayProgress(82, 'Filling letters that are still missing.');
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
  };
  await Glyphs.hydrate(pack);
  Generate.ensure(pack);
  pack.examples = await Harvest.examplesFromGlyphs(pack.glyphs);
  S.draftPack = pack;
  return pack;
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

async function loadFiles(files) {
  const cans = [];
  for (const file of files) {
    let canvas;
    try {
      canvas = await Imaging.loadImageFile(file);
    } catch (_) {
      throw new Error('That photo could not be read. Take it again as a JPG or PNG, in better light.');
    }
    const problem = photoProblem(canvas);
    if (problem) throw new Error(problem);
    cans.push(canvas);
  }
  return cans;
}

function bindFile(buttonId, inputId, onFiles) {
  const button = $('#' + buttonId);
  const input = $('#' + inputId);
  if (!button || !input) return;
  button.onclick = () => input.click();
  input.onchange = () => {
    const files = [...(input.files || [])];
    input.value = '';
    if (files.length) onFiles(files);
  };
}

async function readSheetFiles(files) {
  card($('#buildMsg'), 'Lining up the corner marks…');
  try {
    const cans = await loadFiles(files.slice(0, 4));
    const reads = [];
    let replaced = 0;
    for (const c of cans) {
      let read;
      try {
        read = LetterSheet.read(c);
      } catch (e) {
        const hand = S.draftPack || activePack();
        const chars = Generate.generatedChars(hand || { glyphs: [] });
        if (!chars.length || !/fill-in/i.test(String(e && e.message || ''))) throw e;
        read = LetterSheet.read(c, { chars: chars });
        if (hand) {
          const before = Generate.generatedChars(hand).length;
          Generate.replaceGenerated(hand, read);
          replaced += Math.max(0, before - Generate.generatedChars(hand).length);
          if (hand.id && hand !== S.draftPack) await Store.saveHand(hand);
          showResult(hand);
        }
      }
      reads.push(read);
    }
    S.sheetReads = reads;
    S.sheetSrc = cans[0] || null;
    showSheetThumbs();
    const letters = reads.reduce((n, r) => n + r.glyphs.length, 0);
    const note = replaced
      ? ' Replaced ' + replaced + ' generated letter' + (replaced === 1 ? '' : 's') + ' with the sheet.'
      : '';
    card($('#buildMsg'), letters + ' letters read from ' + reads.length + ' photo' + (reads.length === 1 ? '' : 's') + '.' + note);
  } catch (e) {
    card($('#buildMsg'), explainSheetError(e), 'bad');
  }
}

async function readCopyFile(files) {
  card($('#buildMsg'), 'Reading the copied lines…');
  try {
    const canvas = (await loadFiles(files.slice(0, 1)))[0];
    const read = CopyLines.read(canvas);
    S.sheetReads = S.sheetReads.filter((r) => r.kind !== 'copy').concat(read);
    S.sheetSrc = canvas;
    showSheetThumbs();
    card($('#buildMsg'), read.glyphs.length + ' letters read from the copy. ' + (read.missing.length ? read.missing.length + ' characters could not be placed. Write those on a fill-in sheet later.' : 'Every character was placed.'));
  } catch (e) {
    card($('#buildMsg'), explainSheetError(e), 'bad');
  }
}

async function readPageFiles(files) {
  try {
    const cans = await loadFiles(files.slice(0, 8));
    S.refImages = cans;
    const host = $('#thumbsRef');
    host.innerHTML = '';
    S.refImages.forEach((c) => {
      const t = document.createElement('canvas');
      const s = 150 / c.width;
      t.width = 150;
      t.height = Math.round(c.height * s);
      t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
      host.appendChild(t);
    });
    card($('#buildMsg'), S.refImages.length + ' page' + (S.refImages.length === 1 ? '' : 's') + ' ready. You can analyse now, or add more.');
  } catch (e) {
    card($('#buildMsg'), explainSheetError(e), 'bad');
  }
}

async function runAnalyse() {
  if (!S.sheetReads.length && !S.refImages.length) {
    card($('#buildMsg'), 'Add the letter sheet first. Old pages alone are not enough.', 'bad');
    setWizard(2);
    return;
  }
  setWizard(4);
  sayProgress(12, 'Starting. This stays on this device.');
  try {
    const pack = await buildDraftPack();
    sayProgress(100, 'Done. Check the letters, then save.');
    showQa(pack);
    showResult(pack);
    setWizard(5);
  } catch (e) {
    card($('#buildMsg'), explainSheetError(e), 'bad');
    setWizard(S.sheetReads.length ? 3 : 2);
  }
}

export async function loadDemoHand() {
  const res = await fetch(import.meta.env.BASE_URL + 'demo-hand.inkpack');
  if (!res.ok) throw new Error('missing');
  const pack = PackShare.decodeShare(await res.text());
  pack.id = 'pk_demo';
  pack.name = pack.name || 'Demo hand';
  pack.readOnly = true;
  await Store.saveHand(pack);
  S.activeId = pack.id;
  return pack;
}

export function wireGuide(showScreen) {
  $('#wizNext1').onclick = () => {
    if (!$('#attest').checked) {
      card($('#buildMsg'), 'Tick “This is my handwriting” before continuing. Only use writing you made yourself.', 'bad');
      return;
    }
    if (!$('#packName').value.trim()) {
      card($('#buildMsg'), 'Name the hand first. For example, blue pen.', 'bad');
      return;
    }
    card($('#buildMsg'), '');
    setWizard(2);
  };
  $('#wizBack2').onclick = () => setWizard(1);
  $('#wizNext2').onclick = () => {
    if (!S.sheetReads.length) {
      card($('#buildMsg'), 'Photograph the letter sheet, or use No printer and upload the copy.', 'bad');
      return;
    }
    card($('#buildMsg'), '');
    setWizard(3);
  };
  $('#wizBack3').onclick = () => setWizard(2);
  $('#wizSkip3').onclick = () => runAnalyse();
  $('#wizNext3').onclick = () => runAnalyse();
  $('#wizBack5').onclick = () => setWizard(3);

  bindFile('btnPickSheet', 'fileSheet', readSheetFiles);
  bindFile('btnShootSheet', 'fileSheetCam', readSheetFiles);
  bindFile('btnPickCopy', 'fileCopy', readCopyFile);
  bindFile('btnShootCopy', 'fileCopyCam', readCopyFile);
  bindFile('btnPickRef', 'fileRef', readPageFiles);
  bindFile('btnShootRef', 'fileRefCam', readPageFiles);

  $('#btnTryPreview').onclick = async () => {
    const pack = S.draftPack || activePack();
    if (!pack) return;
    await Glyphs.hydrate(pack);
    try {
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
      host.appendChild(c);
    } catch (e) {
      card($('#buildMsg'), e.message, 'bad');
    }
  };

  $('#btnBuild').onclick = async () => {
    const pack = S.draftPack || (await buildDraftPack());
    if (!$('#packName').value.trim()) {
      card($('#buildMsg'), 'Name the hand first.', 'bad');
      setWizard(1);
      return;
    }
    pack.name = $('#packName').value.trim();
    $('#btnBuild').disabled = true;
    $('#buildState').textContent = 'saving…';
    try {
      const saved = await Store.saveHand(pack);
      S.activeId = saved.id || pack.id;
      await refreshSaved();
      card($('#buildMsg'), 'Saved ' + esc(pack.name) + '.');
      showScreen('write');
    } catch (e) {
      card($('#buildMsg'), 'Could not save: ' + e.message, 'bad');
    } finally {
      $('#btnBuild').disabled = false;
      $('#buildState').textContent = '';
    }
  };
}

async function refreshSaved() {
  await refreshPacks();
  renderPackList();
  renderPackSelect();
}
