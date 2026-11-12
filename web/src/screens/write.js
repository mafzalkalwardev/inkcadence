import { Glyphs } from '../lib/glyphs.js';
import { Rendering } from '../lib/render.js';
import { PackShare } from '../lib/packshare.js';
import { S, $, card } from '../ui/shared.js';
import { activePack, syncPenSwatches } from './hands.js';

export function writeHtml() {
  return `
  <div class="panel rise">
    <h2>Write</h2>
    <p class="muted">Type the words, then write the page. Start a line with # to make a heading.</p>
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
    <div class="row step-actions">
      <button id="btnRender">Write the page</button>
      <button class="ghost" id="btnPrint">Print</button>
      <label class="small muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="wMark" checked style="width:auto"> Show the AI-assisted note</label>
    </div>
    <div id="writeMsg" style="margin-top:10px"></div>
  </div>
  <div id="pages"></div>`;
}

export function wireWrite() {
  if ($('#wPack')) {
    $('#wPack').onchange = () => { S.activeId = $('#wPack').value; syncPenSwatches(); };
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
      paintPages(pack, pages);
    } catch (e) {
      card($('#writeMsg'), e.message || 'The page could not be written.', 'bad');
    } finally {
      btn.disabled = false;
    }
  };
  $('#btnPrint').onclick = () => {
    if (!S.lastPages.length) { card($('#writeMsg'), 'Write the page first.', 'bad'); return; }
    const w = window.open('', '_blank');
    if (!w) { card($('#writeMsg'), 'Allow pop-ups for print.', 'bad'); return; }
    const imgs = S.lastPages.map((c) => '<img src="' + c.toDataURL('image/jpeg', 0.92) + '">').join('');
    w.document.write('<!doctype html><title>Print</title><style>@page{size:A4;margin:0}body{margin:0}img{display:block;width:210mm;height:297mm;page-break-after:always}</style>' + imgs);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };
}

function paintPages(pack, pages) {
  const host = $('#pages');
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
    wrap.style.marginBottom = '22px';
    wrap.innerHTML = `<div class="small muted" style="text-align:center;margin-bottom:6px">Page ${i + 1}</div>`;
    c.className = 'page';
    wrap.appendChild(c);
    host.appendChild(wrap);
  });
}
