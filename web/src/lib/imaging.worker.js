/* Web worker: page analysis off the UI thread. The result has no photo. */
import { analyze, mergeAnalyses } from './imaging.js';

function makeSurface(w, h) {
  w = Math.max(1, w | 0);
  h = Math.max(1, h | 0);
  if (typeof document !== 'undefined' && document.createElement) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

function paintBuffer(surface, buffer, w, h) {
  var ctx = surface.getContext('2d');
  var data = new Uint8ClampedArray(buffer);
  var img;
  if (typeof ImageData !== 'undefined') img = new ImageData(data, w, h);
  else {
    img = ctx.getImageData(0, 0, w, h);
    img.data.set(data);
  }
  ctx.putImageData(img, 0, 0);
}

function withoutPhoto(result) {
  if (result && typeof result === 'object') {
    delete result.thumb;
    if (result.thumbs) delete result.thumbs;
  }
  return result;
}

export async function runWorkerMessage(msg) {
  msg = msg || {};
  try {
    if (msg.type === 'analyzeImageData') {
      var surface = makeSurface(msg.width, msg.height);
      paintBuffer(surface, msg.buffer, msg.width, msg.height);
      return { id: msg.id, ok: true, result: withoutPhoto(analyze(surface)) };
    }
    if (msg.type === 'analyzeBitmap') {
      var bitmap = msg.bitmap;
      var canvas = makeSurface(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      if (bitmap.close) bitmap.close();
      return { id: msg.id, ok: true, result: withoutPhoto(analyze(canvas)) };
    }
    if (msg.type === 'merge') {
      return { id: msg.id, ok: true, result: withoutPhoto(mergeAnalyses(msg.list || [])) };
    }
    return { id: msg.id, ok: false, error: 'unknown_type' };
  } catch (err) {
    return { id: msg.id, ok: false, error: (err && err.message) || String(err) };
  }
}

if (typeof DedicatedWorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof DedicatedWorkerGlobalScope) {
  self.onmessage = function (ev) {
    runWorkerMessage(ev.data || {}).then(function (reply) { self.postMessage(reply); });
  };
}
