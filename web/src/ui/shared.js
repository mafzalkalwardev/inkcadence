export const S = {
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

export function $(sel, el = document) {
  return el.querySelector(sel);
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function card(el, html, kind) {
  if (!el) return;
  el.innerHTML = html ? `<div class="${kind === 'bad' ? 'err' : 'hint'}">${html}</div>` : '';
}
