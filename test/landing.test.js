'use strict';
/* Landing copy matches the FAQ data, and the old product words are gone. */

const fs = require('fs');
const path = require('path');

const docs = path.join(__dirname, '..', 'docs');
let pass = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else {
    failures.push(name + (extra ? ' — ' + extra : ''));
    console.log('  FAIL ' + name + (extra ? ' — ' + extra : ''));
  }
}

function visibleFaqs(html) {
  const out = [];
  const re = /<article class="qa"><h3>([^<]+)<\/h3><p>([^<]+)<\/p><\/article>/g;
  let m;
  while ((m = re.exec(html))) out.push({ q: m[1], a: m[2] });
  return out;
}

function jsonFaqs(html) {
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const data = JSON.parse(block[1]);
  const faq = data['@graph'].find((node) => node['@type'] === 'FAQPage');
  return faq.mainEntity.map((item) => ({
    q: item.name,
    a: item.acceptedAnswer.text,
  }));
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function main() {
  console.log('\n-- landing: FAQ, sitemap, forbidden words --');
  const pages = ['index.html', 'terms.html', 'privacy.html', 'llms.txt'].map((name) => ({
    name,
    text: fs.readFileSync(path.join(docs, name), 'utf8'),
  }));
  const banned = /\b(exam|essay|homework|assignment|undetectable)\b/i;
  pages.forEach((page) => {
    check(page.name + ' avoids the retired words', !banned.test(page.text), (page.text.match(banned) || [])[0]);
  });

  const home = pages[0].text;
  const visible = visibleFaqs(home);
  const structured = jsonFaqs(home);
  check('FAQ has a full set of answers', visible.length >= 16, String(visible.length));
  check('visible FAQ matches the structured FAQ', JSON.stringify(visible) === JSON.stringify(structured));

  const howto = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph']
    .find((node) => node['@type'] === 'HowTo');
  howto.step.forEach((step) => {
    check('step is on the page: ' + step.name, home.includes(step.text));
  });

  const sitemap = fs.readFileSync(path.join(docs, 'sitemap.xml'), 'utf8');
  check('sitemap has no hash URLs', !sitemap.includes('#'));
  check('sitemap lists terms and privacy', sitemap.includes('terms.html') && sitemap.includes('privacy.html'));
  check('home has one canonical', (home.match(/rel="canonical"/g) || []).length === 1);
  check('terms and privacy have their own canonical',
    pages[1].text.includes('terms.html') && pages[2].text.includes('privacy.html') &&
    pages[1].text.includes('rel="canonical"') && pages[2].text.includes('rel="canonical"'));

  const og = pngSize(path.join(docs, 'media', 'og.png'));
  check('OG image is 1200 by 630', og.w === 1200 && og.h === 630, og.w + 'x' + og.h);
  check('sample page is on the landing page', home.includes('media/sample-page.jpg') && fs.existsSync(path.join(docs, 'media', 'sample-page.jpg')));
  check('reduced motion is respected', fs.readFileSync(path.join(docs, 'site.css'), 'utf8').includes('prefers-reduced-motion'));

  console.log('\n' + '='.repeat(52));
  console.log('  passed: ' + pass + '   failed: ' + failures.length);
  if (failures.length) {
    failures.forEach((f) => console.log('   - ' + f));
    process.exit(1);
  }
  console.log('  all green');
}

main();
