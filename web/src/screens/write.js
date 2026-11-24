import { Glyphs } from '../lib/glyphs.js';
import { Rendering } from '../lib/render.js';
import { PackShare } from '../lib/packshare.js';
import { Assignment } from '../lib/assignment.js';
import { S, $, card } from '../ui/shared.js';
import { activePack, syncPenSwatches } from './hands.js';

let previewTimer = 0;
let writing = false;
let hydratedId = null;

export function writeHtml() {
  const layouts = Assignment.layouts();
  const layoutOpts = layouts.map((l) =>
    `<option value="${l.id}">${l.name}</option>`).join('');
  return `
  <div class="write-desk">
    <div class="panel rise write-controls">
      <h2>Write</h2>
      <p class="muted">Type the words. The page updates as you go. Start a line with # for a heading.</p>
      <div class="field"><label for="wPack">Hand</label><select id="wPack"></select></div>
      <div class="field"><label for="wText">Words</label>
        <textarea id="wText" rows="8"># Notes

Write the words you want on the page. The letters come from your hand.</textarea>
      </div>
      <div class="grid2">
        <div class="field"><label>Ink</label><div class="swatch" id="wColor" role="group" aria-label="Ink colour"></div></div>
        <div class="field"><label for="wLayout">Page</label>
          <select id="wLayout">${layoutOpts}</select>
        </div>
      </div>
      <div class="grid2">
        <div class="field"><label for="wPaper">Paper</label>
          <select id="wPaper"><option value="ruled">Lined</option><option value="plain">Blank</option><option value="grid">Grid</option></select>
        </div>
        <div class="field"><label for="wHeading">Heading line</label>
          <select id="wHeading"><option value="underline">Underline</option><option value="double">Double line</option><option value="none">None</option></select>
        </div>
      </div>
      <details class="more" open>
        <summary>Size and variation</summary>
        <div class="grid2">
          <div class="field"><label for="wSize">Size</label><input id="wSize" type="range" min="22" max="56" value="34"></div>
          <div class="field"><label for="wSlant">Slant</label><input id="wSlant" type="range" min="-20" max="35" value="10"></div>
          <div class="field"><label for="wJitter">Variation</label><input id="wJitter" type="range" min="0" max="150" value="55"></div>
          <div class="field"><label for="wSeed">Page variety</label><input id="wSeed" type="range" min="1" max="99" value="7"></div>
        </div>
      </details>
      <div class="row step-actions">
        <button type="button" id="btnRender">Write now</button>
        <button type="button" class="ghost" id="btnPrint">Print</button>
        <label class="small muted mark-toggle"><input type="checkbox" id="wMark" checked> Show the AI-assisted note</label>
      </div>
      <div id="writeMsg" class="write-msg" aria-live="polite"></div>
    </div>
    <div class="write-preview">
      <div id="pages" class="pages-host"></div>
    </div>
  </div>`;
}

function layoutDefaults() {
  const id = $('#wLayout')?.value;
  return Assignment.layoutById(id || 'notes_lined');
}

function applyLayoutToControls() {
  const layout = layoutDefaults();
  const paper = $('#wPaper');
  const heading = $('#wHeading');
  if (paper && layout.paper) paper.value = layout.paper;
  if (heading && layout.headingStyle) heading.value = layout.headingStyle;
}

function collectOpts(pack) {
  const layout = layoutDefaults();
  return {
    text: $('#wText').value,
    pack,
    size: +$('#wSize').value,
    slant: +$('#wSlant').value / 100,
    jitter: +$('#wJitter').value / 100,
    seed: +$('#wSeed').value,
    penColour: S.pen || pack.penColours?.[0] || '#1b2a4a',
    paper: $('#wPaper').value,
    paperColour: pack.paper || '#fdfcf7',
    headingStyle: $('#wHeading').value,
    watermark: $('#wMark').checked,
    fontFamily: pack.fontFamily,
    tracking: pack.tracking,
    continuity: layout.continuity !== false,
    pageNumbers: !!layout.pageNumbers,
    marginL: layout.marginL,
    top: layout.top,
  };
}

async function writePages(opts) {
  const pack = activePack();
  if (!pack) {
    card($('#writeMsg'), 'Pick a hand, or try the demo hand from Home.', 'bad');
    return null;
  }
  if (writing) return null;
  writing = true;
  const btn = $('#btnRender');
  if (btn) btn.disabled = true;
  card($('#writeMsg'), 'Laying out pages…');
  try {
    if (hydratedId !== pack.id) {
      await Glyphs.hydrate(pack);
      hydratedId = pack.id;
    }
    const pages = Rendering.renderPages(collectOpts(pack));
    card($('#writeMsg'), pages.length === 1 ? 'Page ready.' : pages.length + ' pages ready.');
    S.lastPages = pages;
    paintPages(pack, pages);
    return pages;
  } catch (e) {
    card($('#writeMsg'), e.message || 'The page could not be written.', 'bad');
    return null;
  } finally {
    writing = false;
    if (btn) btn.disabled = false;
  }
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    writePages({ quiet: true }).catch(() => {});
  }, 420);
}

export function wireWrite() {
  if ($('#wPack')) {
    $('#wPack').onchange = () => {
      S.activeId = $('#wPack').value;
      hydratedId = null;
      syncPenSwatches();
      applyHandDefaults();
      schedulePreview();
    };
  }
  const layoutSel = $('#wLayout');
  if (layoutSel) {
    layoutSel.onchange = () => {
      applyLayoutToControls();
      schedulePreview();
    };
    applyLayoutToControls();
  }
  ['wText', 'wPaper', 'wHeading', 'wSize', 'wSlant', 'wJitter', 'wSeed', 'wMark'].forEach((id) => {
    const el = $('#' + id);
    if (!el) return;
    const evt = el.tagName === 'TEXTAREA' || el.type === 'range' ? 'input' : 'change';
    el.addEventListener(evt, schedulePreview);
  });
  const colorHost = $('#wColor');
  if (colorHost) {
    colorHost.addEventListener('click', () => schedulePreview());
  }
  $('#btnRender').onclick = () => writePages({});
  $('#btnPrint').onclick = () => {
    if (!S.lastPages.length) { card($('#writeMsg'), 'Write the page first.', 'bad'); return; }
    const w = window.open('', '_blank');
    if (!w) { card($('#writeMsg'), 'Allow pop-ups for print.', 'bad'); return; }
    const imgs = S.lastPages.map((c) => '<img src="' + c.toDataURL('image/jpeg', 0.92) + '">').join('');
    w.document.write('<!doctype html><title>Print</title><style>@page{size:A4;margin:0}body{margin:0}img{display:block;width:210mm;height:297mm;page-break-after:always}</style>' + imgs);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };
  applyHandDefaults();
}

export function kickWritePreview() {
  if (!$('#wText')) return;
  applyHandDefaults();
  schedulePreview();
}

function applyHandDefaults() {
  const pack = activePack();
  if (!pack) return;
  const size = $('#wSize');
  const slant = $('#wSlant');
  const jitter = $('#wJitter');
  if (size && pack.defaultSize) size.value = String(pack.defaultSize);
  if (slant) {
    const s = pack.slant != null ? pack.slant : (pack.stats && pack.stats.slant);
    if (s != null) slant.value = String(Math.round(Number(s) * 100));
  }
  if (jitter && pack.defaultJitter != null) {
    jitter.value = String(Math.round(pack.defaultJitter * 100));
  }
  if (pack.headingStyle && $('#wHeading')) {
    $('#wHeading').value = pack.headingStyle;
  }
  if (pack.paperStyle && $('#wPaper')) {
    $('#wPaper').value = pack.paperStyle;
  }
}

function paintPages(pack, pages) {
  const host = $('#pages');
  if (!host) return;
  host.innerHTML = '';
  const bar = document.createElement('div');
  bar.className = 'pagebar';
  bar.innerHTML = `<div class="small muted">${pages.length} page(s)</div>`;
  const base = (pack.name || 'page').replace(/[^\w-]+/g, '_') || 'page';
  const dl = document.createElement('button');
  dl.className = 'ghost tiny';
  dl.type = 'button';
  dl.textContent = 'Download PNGs';
  dl.onclick = () => {
    const files = pages.map((c, i) => ({
      name: base + '_p' + (i + 1) + '.png',
      bytes: PackShare.canvasToPng(c),
    }));
    PackShare.downloadBytes(PackShare.zipStore(files), base + '.zip', 'application/zip');
  };
  const pdf = document.createElement('button');
  pdf.className = 'ghost tiny';
  pdf.type = 'button';
  pdf.textContent = 'Download PDF';
  pdf.onclick = () => PackShare.downloadPdf(pages, base + '.pdf');
  bar.appendChild(dl);
  bar.appendChild(pdf);
  host.appendChild(bar);
  pages.forEach((c, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'page-wrap';
    wrap.innerHTML = `<div class="small muted page-label">Page ${i + 1}</div>`;
    c.className = 'page';
    wrap.appendChild(c);
    host.appendChild(wrap);
  });
}
