'use strict';
/* Runs page analysis on a worker thread. The browser uses imaging.worker.js the same way. */

const { parentPort } = require('worker_threads');
const path = require('path');
const { pathToFileURL } = require('url');
const { createCanvas } = require('canvas');
const { installDocument } = require('./load-lib');

installDocument(() => createCanvas(1, 1));

parentPort.on('message', async (msg) => {
  try {
    const mod = await import(pathToFileURL(path.join(__dirname, '../web/src/lib/imaging.worker.js')).href);
    const surface = createCanvas(msg.width, msg.height);
    const ctx = surface.getContext('2d');
    const img = ctx.createImageData(msg.width, msg.height);
    img.data.set(new Uint8ClampedArray(msg.buffer));
    ctx.putImageData(img, 0, 0);
    const reply = await mod.runWorkerMessage({
      type: 'analyzeImageData',
      id: 1,
      width: msg.width,
      height: msg.height,
      buffer: ctx.getImageData(0, 0, msg.width, msg.height).data.buffer,
    });
    parentPort.postMessage(reply);
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err && (err.stack || err.message) || String(err) });
  }
});
