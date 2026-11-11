'use strict';
/* Install a document/canvas global, then import the hand-edited engines. */

const path = require('path');
const { pathToFileURL } = require('url');

const LIB = path.join(__dirname, '..', 'web', 'src', 'lib');

function installDocument(createCanvas) {
  global.document = {
    createElement(tag) {
      if (tag === 'canvas') return createCanvas();
      return {};
    },
  };
  if (!global.URL.createObjectURL) {
    global.URL.createObjectURL = function () { return 'blob:test'; };
    global.URL.revokeObjectURL = function () {};
  }
}

async function loadLib(name, exportName) {
  const file = path.join(LIB, name + '.js');
  const mod = await import(pathToFileURL(file).href);
  return mod[exportName] || mod.default;
}

module.exports = { installDocument, loadLib, LIB };
