import { Store } from '../lib/store.js';
import { Imaging } from '../lib/imaging.js';
import { CharCNN } from '../lib/charcnn.js';
import { Harvest } from '../lib/harvest.js';
import { S, $, esc, card } from '../ui/shared.js';
import { analyzeCanvases } from '../ui/analyse.js';

let onSelect = function () {};

export function onHandSelect(fn) {
  onSelect = fn;
}

export async function refreshPacks() {
  S.packs = (await Store.hands()) || [];
  if (!S.activeId && S.packs.length) S.activeId = S.packs[0].id;
  if (!S.packs.some((p) => p.id === S.activeId)) S.activeId = S.packs[0]?.id || null;
}

export function activePack() {
  return S.packs.find((p) => p.id === S.activeId) || null;
}

export function renderPackList() {
  const ul = $('#packList');
  if (!ul) return;
  const count = $('#packCount');
  if (count) count.textContent = String(S.packs.length);
  ul.innerHTML = '';
  if (!S.packs.length) {
    ul.innerHTML = '<li class="empty">No hands yet.</li>';
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
    if (p.id !== 'pk_demo') {
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
      li.appendChild(del);
    }
    li.onclick = () => {
      S.activeId = p.id;
      renderPackList();
      renderPackSelect();
      onSelect(p);
    };
    ul.appendChild(li);
  });
}

export function renderPackSelect() {
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

export function syncPenSwatches() {
  const box = $('#wColor');
  if (!box) return;
  box.innerHTML = '';
  const p = activePack();
  const colours = p?.penColours?.length ? p.penColours : ['#1b2a4a', '#123a8c', '#111111'];
  S.pen = colours[0];
  colours.forEach((hex, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = hex;
    b.setAttribute('aria-label', hex);
    if (i === 0) b.className = 'on';
    b.onclick = () => {
      S.pen = hex;
      [...box.children].forEach((c) => { c.className = ''; });
      b.className = 'on';
    };
    box.appendChild(b);
  });
}

export function wireHands() {
  const addPages = $('#btnAddPages');
  const addPagesInput = $('#fileAddPages');
  if (!addPages || !addPagesInput) return;
  addPages.onclick = () => {
    if (!activePack()) {
      card($('#homeMsg') || $('#buildMsg'), 'Save a hand first. Then add more of its pages here.');
      return;
    }
    addPagesInput.click();
  };
  addPagesInput.onchange = async () => {
    const files = [...(addPagesInput.files || [])].slice(0, 8);
    addPagesInput.value = '';
    const hand = activePack();
    if (!hand || !files.length) return;
    const host = $('#buildMsg') || $('#homeMsg');
    card(host, 'Reading the new pages…');
    try {
      const cans = (await Promise.all(files.map((f) => Imaging.loadImageFile(f).catch(() => null)))).filter(Boolean);
      if (!cans.length) {
        card(host, 'Those photos could not be read. Try a JPG or PNG, taken in better light.', 'bad');
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
      card(host, 'Added ' + pages + '. Coverage ' + report.coverageBefore + '% to ' + report.coverageAfter + '%. Variants per letter ' + report.variantsBefore + ' to ' + report.variantsAfter + '. Confidence ' + report.confidenceBefore + ' to ' + report.confidenceAfter + '.');
    } catch (err) {
      card(host, 'Those pages could not be added. Photograph them again, with the writing filling the frame.', 'bad');
    }
  };
}
