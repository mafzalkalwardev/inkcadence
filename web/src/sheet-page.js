import { LetterSheet } from './lib/lettersheet.js';

const params = new URLSearchParams(location.search);
const raw = params.get('chars');
const pages = raw ? LetterSheet.layoutFillIn(Array.from(raw)) : LetterSheet.layoutFull();
const stage = document.getElementById('stage');
const canvases = pages.map((page, i) => {
  const wrap = document.createElement('div');
  wrap.className = 'page-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'page';
  canvas.setAttribute('aria-label', (page.kind ? 'Fill-in sheet' : 'Letter sheet') + ', page ' + (i + 1));
  LetterSheet.draw(canvas, page);
  const img = document.createElement('img');
  img.className = 'print-copy';
  img.alt = '';
  wrap.append(canvas, img);
  stage.append(wrap);
  return canvas;
});

function refreshPrintImages() {
  canvases.forEach((canvas) => {
    const img = canvas.nextElementSibling;
    if (img) img.src = canvas.toDataURL('image/png');
  });
}

document.getElementById('printBtn').onclick = () => {
  refreshPrintImages();
  window.print();
};

document.getElementById('pdfBtn').onclick = () => {
  const images = canvases.map((canvas) => {
    const url = canvas.toDataURL('image/jpeg', 0.85);
    const b64 = url.split(',')[1];
    const bin = atob(b64);
    const jpeg = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
    return { width: canvas.width, height: canvas.height, jpeg };
  });
  const bytes = LetterSheet.pdfFromJpegs(images);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = raw ? 'inkcadence-fill-in-sheet.pdf' : 'inkcadence-letter-sheet.pdf';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
};

window.addEventListener('beforeprint', refreshPrintImages);
