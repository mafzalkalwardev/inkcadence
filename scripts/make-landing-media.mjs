/* OG card and a sample page for the landing site. */
import fs from 'fs';
import path from 'path';
import { createCanvas, Image } from 'canvas';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
global.document = {
  createElement(tag) {
    if (tag === 'canvas') return createCanvas(1, 1);
    return {};
  },
};
global.Image = Image;

const { PackShare } = await import(pathToFileURL(path.join(root, 'web/src/lib/packshare.js')).href);
const { Rendering } = await import(pathToFileURL(path.join(root, 'web/src/lib/render.js')).href);
const { Glyphs } = await import(pathToFileURL(path.join(root, 'web/src/lib/glyphs.js')).href);

const outDir = path.join(root, 'docs', 'media');
fs.mkdirSync(outDir, { recursive: true });

const og = createCanvas(1200, 630);
const g = og.getContext('2d');
g.fillStyle = '#f4efe6';
g.fillRect(0, 0, 1200, 630);
g.strokeStyle = '#8d3f2c';
g.lineWidth = 10;
g.lineCap = 'round';
g.beginPath();
g.moveTo(80, 150);
g.bezierCurveTo(120, 150, 130, 70, 180, 70);
g.bezierCurveTo(230, 70, 220, 170, 270, 170);
g.bezierCurveTo(320, 170, 330, 90, 390, 90);
g.stroke();
g.fillStyle = '#241c16';
g.font = '64px Georgia';
g.fillText('Write anything in', 80, 320);
g.fillText('your own handwriting.', 80, 400);
g.fillStyle = '#5c4d42';
g.font = '28px Georgia';
g.fillText('The words are yours. The letters come from your hand.', 80, 480);
g.fillStyle = '#8d3f2c';
g.font = '24px Georgia';
g.fillText('Inkcadence', 80, 560);
fs.writeFileSync(path.join(outDir, 'og.png'), og.toBuffer('image/png'));

const raw = fs.readFileSync(path.join(root, 'web/public/demo-hand.inkpack'), 'utf8');
const pack = PackShare.decodeShare(raw);
await Glyphs.hydrate(pack);
const page = Rendering.renderPages({
  pack,
  text: '# Notes\n\nThe words are yours. The letters come from your hand.',
  size: 34,
  jitter: 0.2,
  seed: 4,
  penColour: '#1a2744',
  paper: 'ruled',
  watermark: true,
  pageNumbers: false,
})[0];
const w = 720;
const h = Math.round(page.height * w / page.width);
const small = createCanvas(w, h);
small.getContext('2d').drawImage(page, 0, 0, w, h);
fs.writeFileSync(path.join(outDir, 'sample-page.jpg'), small.toBuffer('image/jpeg', { quality: 0.82 }));
console.log('og', 1200, 630, 'page', w, h);
