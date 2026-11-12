<p align="center">
  <img src="assets/inkcadence-wordmark.svg" alt="Inkcadence — your hand, on every page" width="420">
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-2f6fed">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-2f6fed">
  <img alt="Static site" src="https://img.shields.io/badge/site-static-2f6fed">
  <img alt="Privacy" src="https://img.shields.io/badge/photos-stay%20on%20device-177d4f">
</p>

<h1 align="center">Inkcadence</h1>

<p align="center">
  <a href="https://mafzalkalwardev.github.io/inkcadence/"><b>▶ Live site</b></a>
  &nbsp;·&nbsp;
  <a href="https://mafzalkalwardev.github.io/inkcadence/classic/"><b>Classic writer</b></a>
  &nbsp;·&nbsp;
  <a href="https://mafzalkalwardev.github.io/inkcadence/app/#/"><b>Vite app</b></a>
</p>

> **Write anything in your own handwriting.** You supply the words. The site and the app are static and run in the browser. Photos stay on the device.

The live site is [mafzalkalwardev.github.io/inkcadence](https://mafzalkalwardev.github.io/inkcadence/). The app is at [/app/](https://mafzalkalwardev.github.io/inkcadence/app/).

## See a page

<p align="center">
  <img src="docs/media/sample-page.jpg" alt="A lined page from the demo hand" width="420">
</p>

Pull requests and pushes to `main` run [CI](.github/workflows/ci.yml): one `test` job (lint, tests, Vite build). Pushes to `main` also run [Pages](.github/workflows/pages.yml), which publishes the landing site at `/` and the app at `/app/`.

## What is in this repo

| Path | Role |
|---|---|
| `docs/` | Landing site, published at `/` |
| `web/` | Vite app, published at `/app/` |
| `js/`, `index.html` | Classic writer, published at `/classic/` |
| `tools/charcnn/` | Trainer for the in-browser letter recogniser (`assets/charcnn.json`) |

## Quick start

**Classic writer (no install):** open `index.html`, or `npx serve . -l 4173`.

**Vite app:**

```bash
npm install --prefix web
npm run dev --prefix web
```

**Letter recogniser weights** (optional, needs PyTorch):

```bash
npm run train:charcnn
```

## Tests

```bash
npm ci
npm run lint
npm test
npm run build --prefix web
```

Pipeline and page-fixture suites need the `canvas` package and skip without it.

## License

MIT
