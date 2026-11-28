#!/usr/bin/env bash
# Build the same tree GitHub Pages publishes (landing + /app + /classic).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
npm ci
npm ci --prefix web
npm test
npm run build --prefix web
rm -rf _site
mkdir -p _site/app _site/classic/js _site/classic/assets
cp -a docs/. _site/
cp -a web/dist/. _site/app/
cp index.html sheet.html _site/classic/
cp -a js/. _site/classic/js/
if [ -d assets ]; then cp -a assets/. _site/classic/assets/; fi
echo "assembled site → $root/_site"
