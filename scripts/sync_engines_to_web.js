'use strict';
/* Converts the classic IIFE engines in js/ into ES modules in web/src/lib/.

   Classic engines reach each other through `global.X` (window). Browsers have no
   `global`, so cross-module references are rewritten into real ES imports.

   Usage:
     node scripts/sync_engines_to_web.js          write web/src/lib/*.js
     node scripts/sync_engines_to_web.js --check  fail if web/src/lib is out of date */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const modules = [
  ['imaging', 'Imaging'],
  ['glyphs', 'Glyphs'],
  ['render', 'Rendering'],
  ['presets', 'Presets'],
  ['charcnn', 'CharCNN'],
  ['harvest', 'Harvest'],
  ['assignment', 'Assignment'],
  ['packshare', 'PackShare']
];
const fileOf = Object.fromEntries(modules.map(([file, name]) => [name, file]));

function convert(name, exportName) {
  const src = fs.readFileSync(path.join(ROOT, 'js', name + '.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = src.indexOf('(function');
  if (start < 0) throw new Error(name + ' is not an IIFE');
  let body = src.slice(start).trim();
  const header = src.slice(0, start).trim();
  body = body
    .replace(/^\(function\s*\(global\)\s*\{\s*'use strict';\s*/, "'use strict';\n")
    .replace(new RegExp('global\\.' + exportName + '\\s*=\\s*\\{'), 'const ' + exportName + ' = {')
    .replace(/\}\s*;\s*\}\)\(window\);\s*$/, '};\n\nexport { ' + exportName + ' };\nexport default ' + exportName + ';\n');

  const deps = new Set();
  body = body.replace(/\bglobal\.([A-Za-z_$][\w$]*)/g, (match, dep) => {
    if (!fileOf[dep]) throw new Error(name + '.js references unknown global.' + dep);
    deps.add(dep);
    return dep;
  });
  if (/\bglobal\b(?!Alpha|CompositeOperation)/.test(body)) {
    throw new Error(name + '.js still references `global` after conversion');
  }

  const imports = [...deps].sort()
    .map((dep) => "import { " + dep + " } from './" + fileOf[dep] + ".js';")
    .join('\n');
  if (imports) body = body.replace("'use strict';\n", "'use strict';\n" + imports + '\n');
  if (header) body = header + '\n' + body;
  return body;
}

const check = process.argv.includes('--check');
let stale = 0;
modules.forEach(([file, name]) => {
  const out = path.join(ROOT, 'web', 'src', 'lib', file + '.js');
  const body = convert(file, name);
  if (check) {
    const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current !== body) { console.error('out of date:', path.relative(ROOT, out)); stale++; }
  } else {
    fs.writeFileSync(out, body);
    console.log('synced', path.relative(ROOT, out));
  }
});
if (check && stale) {
  console.error(stale + ' engine file(s) differ from js/. Run: npm run sync:engines');
  process.exit(1);
}
