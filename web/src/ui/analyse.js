import { Imaging } from '../lib/imaging.js';

let analyzeWorker;
let analyzeSeq = 0;
const analyzePending = new Map();

function getAnalyzeWorker() {
  if (analyzeWorker) return analyzeWorker;
  analyzeWorker = new Worker(new URL('../lib/imaging.worker.js', import.meta.url), { type: 'module' });
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

export async function analyzeCanvases(canvases) {
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

/* A washed-out or black frame is named here, at the upload, not after a failed read. */
export function photoProblem(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return 'That photo could not be read. Take it again as a JPG or PNG.';
  const data = ctx.getImageData(0, 0, w, h).data;
  let lum = 0;
  let n = 0;
  let dark = 0;
  const step = Math.max(4, (data.length / 4 / 4000) | 0);
  for (let i = 0; i < data.length; i += step * 4) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lum += y;
    if (y < 80) dark++;
    n++;
  }
  const avg = n ? lum / n : 255;
  if (avg < 42) return 'This photo is too dark. Move to a brighter place and take it again.';
  if (n && dark / n < 0.002 && avg > 220) return 'This photo looks blank. Photograph the page with the writing in the frame.';
  return '';
}

export function explainSheetError(err) {
  const msg = String((err && err.message) || '');
  if (/corner marks/i.test(msg)) {
    return 'No sheet markers found. Photograph the whole sheet, with all four corner marks in the frame.';
  }
  if (/not an Inkcadence letter sheet/i.test(msg) || /not one this app can read/i.test(msg)) {
    return 'This does not look like the letter sheet. Open the sheet and photograph that page, or use No printer.';
  }
  if (/too dark/i.test(msg) || /could not be read/i.test(msg) || /blank/i.test(msg)) return msg;
  return msg || 'That photo could not be read. Take it again in better light.';
}
