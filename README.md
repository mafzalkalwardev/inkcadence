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

> **Write anything in your own handwriting.** You supply the words. The landing page, the classic writer, and the Vite app are static and run in the browser. Photos stay on the device.

The archived API, database, and neural service are on the [`experimental/backend`](https://github.com/mafzalkalwardev/inkcadence/tree/experimental/backend) branch.

## See it work

The walkthrough below is the **classic writer**: add pages, learn the hand, then render a lined A4 page (zoomed so the hand stays readable).

<p align="center">
  <img src="docs/media/working.gif" alt="Inkcadence walkthrough: add pages, learn the hand, then render a clear lined A4 page" width="880">
</p>

### Light and dark

| Light | Dark |
| --- | --- |
| <img src="docs/media/home-light.jpg" alt="Home, light theme" width="420"> | <img src="docs/media/home-dark.jpg" alt="Home, dark theme" width="420"> |
| <img src="docs/media/write-result-light.jpg" alt="Rendered page in the light theme" width="420"> | <img src="docs/media/write-result-dark.jpg" alt="Rendered page in the dark theme" width="420"> |

<img src="docs/media/result-page.jpg" alt="The rendered ruled page: a short heading and three handwritten lines" width="420">

### Product workflow

<img src="docs/media/workflow-product.svg" alt="Workflow: pages, match style, harvest, hand, write, export" width="880">

| Pages | Learned hand |
| --- | --- |
| <img src="docs/media/train-samples-light.jpg" alt="Pages loaded for learning" width="420"> | <img src="docs/media/train-quality-light.jpg" alt="Learned patterns after analyse" width="420"> |
| **Write on lined A4** | **Page zoom** |
| <img src="docs/media/write-result-light.jpg" alt="Rendered lined page in Write" width="420"> | <img src="docs/media/result-page.jpg" alt="Zoomed handwritten A4" width="420"> |

### GitHub workflows

<img src="docs/media/workflow-ci.svg" alt="CI tests and builds the Vite app; Pages publishes the landing site and the app" width="880">

Pull requests and pushes to `main` run [CI](.github/workflows/ci.yml): one `test` job (lint, tests, engine check, Vite build). Pushes to `main` also run [Pages](.github/workflows/pages.yml), which publishes this guide, the Vite app at `/app/`, and the classic writer at `/classic/`.

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
