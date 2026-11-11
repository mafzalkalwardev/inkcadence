/* charcnn.js — browser CharCNN inference for harvested glyph crops.
   Loads assets/charcnn.json (EMNIST ByClass + Kaggle A-Z, messy-aug trained).
   Preprocess matches EMNIST: tight ink bbox → scale max-side to 20 → center in 28×28. */
'use strict';
var WEIGHTS_URLS = [
    'assets/charcnn.json',
    'charcnn.json',
    '../assets/charcnn.json',
    '/assets/charcnn.json',
    '/charcnn.json'
  ];

  var MIN_CONF = 0.42;
  var model = null;
  var readyPromise = null;
  var ready = false;

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function relu(x) {
    return x > 0 ? x : 0;
  }

  function softmaxArgmax(logits) {
    var max = -Infinity, i, e, sum = 0, best = 0, bestV = -Infinity;
    for (i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
    var probs = new Float32Array(logits.length);
    for (i = 0; i < logits.length; i++) {
      e = Math.exp(logits[i] - max);
      probs[i] = e;
      sum += e;
    }
    for (i = 0; i < probs.length; i++) {
      probs[i] /= sum;
      if (probs[i] > bestV) {
        bestV = probs[i];
        best = i;
      }
    }
    return { index: best, conf: bestV, probs: probs };
  }

  /* Conv2d NCHW, stride 1, same padding, then 2×2 max-pool. */
  function convPool(input, C, H, W, layer) {
    var outC = layer.out;
    var k = layer.k;
    var pad = layer.pad;
    var w = layer.w;
    var b = layer.b;
    var outH = H;
    var outW = W;
    var conv = new Float32Array(outC * outH * outW);
    var cOut, y, x, cIn, ky, kx, iy, ix, acc, wi;
    for (cOut = 0; cOut < outC; cOut++) {
      for (y = 0; y < outH; y++) {
        for (x = 0; x < outW; x++) {
          acc = b[cOut];
          for (cIn = 0; cIn < C; cIn++) {
            for (ky = 0; ky < k; ky++) {
              iy = y + ky - pad;
              if (iy < 0 || iy >= H) continue;
              for (kx = 0; kx < k; kx++) {
                ix = x + kx - pad;
                if (ix < 0 || ix >= W) continue;
                wi = ((cOut * C + cIn) * k + ky) * k + kx;
                acc += w[wi] * input[(cIn * H + iy) * W + ix];
              }
            }
          }
          conv[(cOut * outH + y) * outW + x] = relu(acc);
        }
      }
    }
    var pH = (outH / 2) | 0;
    var pW = (outW / 2) | 0;
    var pooled = new Float32Array(outC * pH * pW);
    var yy, xx, m, v;
    for (cOut = 0; cOut < outC; cOut++) {
      for (yy = 0; yy < pH; yy++) {
        for (xx = 0; xx < pW; xx++) {
          m = -Infinity;
          for (ky = 0; ky < 2; ky++) {
            for (kx = 0; kx < 2; kx++) {
              v = conv[(cOut * outH + yy * 2 + ky) * outW + xx * 2 + kx];
              if (v > m) m = v;
            }
          }
          pooled[(cOut * pH + yy) * pW + xx] = m;
        }
      }
    }
    return { data: pooled, C: outC, H: pH, W: pW };
  }

  function dense(input, layer, applyRelu) {
    var out = new Float32Array(layer.out);
    var i, j, acc;
    for (i = 0; i < layer.out; i++) {
      acc = layer.b[i];
      for (j = 0; j < layer.in; j++) {
        acc += layer.w[i * layer.in + j] * input[j];
      }
      out[i] = applyRelu ? relu(acc) : acc;
    }
    return out;
  }

  function forward(ink28) {
    var x = { data: ink28, C: 1, H: 28, W: 28 };
    x = convPool(x.data, x.C, x.H, x.W, model.conv1);
    x = convPool(x.data, x.C, x.H, x.W, model.conv2);
    x = convPool(x.data, x.C, x.H, x.W, model.conv3);
    var h = dense(x.data, model.fc1, true);
    var logits = dense(h, model.fc2, false);
    var sm = softmaxArgmax(logits);
    return {
      ch: model.labels[sm.index],
      conf: sm.conf,
      index: sm.index,
      probs: sm.probs
    };
  }

  /**
   * Rasterize crop → 28×28 ink-on-black (matches ml/_to_emnist_canvas).
   * white+alpha harvest OR dark-on-paper → L ink → contain(20) → center in 28.
   */
  function glyphToTensor(imgOrCanvas) {
    var size = model.inputSize || 28;
    var iw = imgOrCanvas.width || imgOrCanvas.naturalWidth;
    var ih = imgOrCanvas.height || imgOrCanvas.naturalHeight;
    if (!iw || !ih) return new Float32Array(size * size);

    var src = canvas(iw, ih);
    var sctx = src.getContext('2d');
    sctx.clearRect(0, 0, iw, ih);
    sctx.drawImage(imgOrCanvas, 0, 0);
    var data = sctx.getImageData(0, 0, iw, ih).data;

    /* Build ink-on-black grayscale canvas (white stroke = 255) */
    var inkCv = canvas(iw, ih);
    var inkCtx = inkCv.getContext('2d');
    var inkImg = inkCtx.createImageData(iw, ih);
    var i, p, a, lum, ink, inkSum = 0;
    for (i = 0, p = 0; i < iw * ih; i++, p += 4) {
      a = data[p + 3] / 255;
      lum = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255;
      if (a > 0.04 && lum >= 0.5) {
        ink = Math.min(1, a * lum);
      } else if (a > 0.04) {
        ink = a * Math.max(0, (0.78 - lum) / 0.78);
      } else {
        ink = 0;
      }
      inkSum += ink;
      var v = Math.round(ink * 255);
      inkImg.data[p] = v;
      inkImg.data[p + 1] = v;
      inkImg.data[p + 2] = v;
      inkImg.data[p + 3] = 255;
    }
    /* Opaque dark-on-light fallback */
    if (inkSum < iw * ih * 0.008) {
      inkSum = 0;
      for (i = 0, p = 0; i < iw * ih; i++, p += 4) {
        a = data[p + 3] / 255;
        lum = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255;
        ink = a < 0.04 ? 0 : Math.max(0, (0.72 - lum) / 0.72);
        inkSum += ink;
        v = Math.round(ink * 255);
        inkImg.data[p] = v;
        inkImg.data[p + 1] = v;
        inkImg.data[p + 2] = v;
        inkImg.data[p + 3] = 255;
      }
    }
    inkCtx.putImageData(inkImg, 0, 0);
    if (inkSum < 1.5) return new Float32Array(size * size);

    /* Tight bbox on ink */
    var minX = iw, minY = ih, maxX = 0, maxY = 0, x, y;
    for (y = 0; y < ih; y++) {
      for (x = 0; x < iw; x++) {
        if (inkImg.data[(y * iw + x) * 4] < 20) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX || maxY < minY) return new Float32Array(size * size);
    var bw = maxX - minX + 1;
    var bh = maxY - minY + 1;

    /* PIL ImageOps.contain(..., (20,20)) equivalent via canvas bilinear */
    var target = 20;
    var scale = Math.min(target / bw, target / bh);
    var dw = Math.max(1, Math.round(bw * scale));
    var dh = Math.max(1, Math.round(bh * scale));
    var fitted = canvas(dw, dh);
    var fctx = fitted.getContext('2d');
    fctx.imageSmoothingEnabled = true;
    fctx.imageSmoothingQuality = 'high';
    fctx.clearRect(0, 0, dw, dh);
    fctx.drawImage(inkCv, minX, minY, bw, bh, 0, 0, dw, dh);

    var outCv = canvas(size, size);
    var octx = outCv.getContext('2d');
    octx.fillStyle = '#000';
    octx.fillRect(0, 0, size, size);
    var ox = ((size - dw) / 2) | 0;
    var oy = ((size - dh) / 2) | 0;
    octx.drawImage(fitted, ox, oy);

    var od = octx.getImageData(0, 0, size, size).data;
    var out = new Float32Array(size * size);
    var max = 0;
    for (i = 0, p = 0; i < size * size; i++, p += 4) {
      out[i] = od[p] / 255;
      if (out[i] > max) max = out[i];
    }
    if (max > 1e-6) {
      for (i = 0; i < out.length; i++) out[i] = Math.min(1, out[i] / max);
    }
    return out;
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('image load failed')); };
      img.src = url;
    });
  }

  function decodeWeights(raw) {
    if (!raw) return new Float32Array(0);
    if (typeof raw !== 'string') return Float32Array.from(raw);
    var bin = atob(raw);
    var buf = new ArrayBuffer(bin.length);
    var bytes = new Uint8Array(buf);
    var i;
    for (i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Float32Array(buf);
  }

  function hydrate(raw) {
    function layer(L, fallbackIn) {
      return {
        out: L.out,
        k: L.k || 3,
        pad: L.pad || 1,
        in: L.in || fallbackIn,
        w: decodeWeights(L.w),
        b: decodeWeights(L.b)
      };
    }
    model = {
      version: raw.version,
      inputSize: raw.inputSize || 28,
      labels: raw.labels,
      conv1: layer(raw.conv1),
      conv2: layer(raw.conv2),
      conv3: layer(raw.conv3),
      fc1: layer(raw.fc1, 128 * 3 * 3),
      fc2: layer(raw.fc2, 256)
    };
    ready = true;
    return model;
  }

  function fetchWeights(url) {
    return fetch(url, { cache: 'force-cache' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function load(urls) {
    if (ready && model) return Promise.resolve(model);
    if (readyPromise) return readyPromise;
    var list = urls && urls.length ? urls : WEIGHTS_URLS;
    readyPromise = (function tryNext(i) {
      if (i >= list.length) {
        return Promise.reject(new Error('CharCNN weights not found'));
      }
      return fetchWeights(list[i]).then(hydrate, function () {
        return tryNext(i + 1);
      });
    })(0);
    return readyPromise.then(function (m) {
      return m;
    }, function (err) {
      readyPromise = null;
      throw err;
    });
  }

  function isReady() {
    return ready && !!model;
  }

  function predictTensor(ink28) {
    if (!isReady()) throw new Error('CharCNN not ready');
    return forward(ink28);
  }

  function predictImage(imgOrCanvas) {
    return predictTensor(glyphToTensor(imgOrCanvas));
  }

  function predictDataUrl(url) {
    return loadImage(url).then(predictImage);
  }

  /* Letter-like aspect helps reject word fragments. */
  function letterLikeness(crop) {
    var w = crop.w || 1;
    var h = crop.h || 1;
    var aspect = w / h;
    if (aspect < 0.18 || aspect > 1.85) return 0.35;
    if (aspect >= 0.35 && aspect <= 1.35) return 1;
    return 0.7;
  }

  /**
   * Score every crop, then keep the best maxPerChar per character by CNN conf.
   * Avoids first-come bias that filled packs with false M/W hits.
   */
  function labelCrops(crops, maxPerChar) {
    maxPerChar = maxPerChar || 4;
    if (!isReady()) return Promise.resolve([]);
    var scored = [];
    var chain = Promise.resolve();
    (crops || []).forEach(function (crop, idx) {
      chain = chain.then(function () {
        return predictDataUrl(crop.url).then(function (pred) {
          if (!pred || pred.conf < MIN_CONF) return;
          var like = letterLikeness(crop);
          var score = pred.conf * like;
          if (score < MIN_CONF * 0.9) return;
          scored.push({
            crop: crop,
            ch: pred.ch,
            cnnConf: pred.conf,
            score: score,
            idx: idx
          });
        }).catch(function () { /* skip */ });
      });
    });
    return chain.then(function () {
      scored.sort(function (a, b) { return b.score - a.score; });
      var counts = Object.create(null);
      var out = [];
      var i, row, g, ch, alts, ai, alt;
      for (i = 0; i < scored.length; i++) {
        row = scored[i];
        /* Handwriting often collapses case — store under both when it's a letter. */
        alts = caseTwin(row.ch);
        for (ai = 0; ai < alts.length; ai++) {
          alt = alts[ai];
          if ((counts[alt] || 0) >= maxPerChar) continue;
          g = Object.assign({}, row.crop);
          g.ch = alt;
          g.cnnConf = row.cnnConf;
          g.cnnRaw = row.ch;
          g.confidence = Math.min(
            0.99,
            0.25 * (row.crop.confidence || 0.5) + 0.75 * row.score * (alt === row.ch ? 1 : 0.92)
          );
          out.push(g);
          counts[alt] = (counts[alt] || 0) + 1;
        }
      }
      out.sort(function (a, b) { return (b.confidence || 0) - (a.confidence || 0); });
      return out;
    });
  }

  function caseTwin(ch) {
    if (ch >= 'A' && ch <= 'Z') return [ch, ch.toLowerCase()];
    if (ch >= 'a' && ch <= 'z') return [ch, ch.toUpperCase()];
    return [ch];
  }

  function labelCropsSync(crops, maxPerChar) {
    maxPerChar = maxPerChar || 4;
    if (!isReady()) return [];
    var scored = [];
    var i, crop, pred, like, score;
    for (i = 0; i < (crops || []).length; i++) {
      crop = crops[i];
      if (!crop._img && !crop._canvas) continue;
      pred = predictImage(crop._img || crop._canvas);
      if (!pred || pred.conf < MIN_CONF) continue;
      like = letterLikeness(crop);
      score = pred.conf * like;
      if (score < MIN_CONF * 0.9) continue;
      scored.push({ crop: crop, ch: pred.ch, cnnConf: pred.conf, score: score });
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    var counts = Object.create(null);
    var out = [];
    for (i = 0; i < scored.length; i++) {
      if ((counts[scored[i].ch] || 0) >= maxPerChar) continue;
      var g = Object.assign({}, scored[i].crop);
      g.ch = scored[i].ch;
      g.cnnConf = scored[i].cnnConf;
      g.confidence = Math.min(0.99, 0.25 * (scored[i].crop.confidence || 0.5) + 0.75 * scored[i].score);
      out.push(g);
      counts[g.ch] = (counts[g.ch] || 0) + 1;
    }
    return out;
  }

  const CharCNN = {
    load: load,
    isReady: isReady,
    predictImage: predictImage,
    predictDataUrl: predictDataUrl,
    predictTensor: predictTensor,
    labelCrops: labelCrops,
    labelCropsSync: labelCropsSync,
    glyphToTensor: glyphToTensor,
    MIN_CONF: MIN_CONF,
    WEIGHTS_URLS: WEIGHTS_URLS
  };

export { CharCNN };
export default CharCNN;
