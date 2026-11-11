# Inkcadence

Inkcadence learns a person's own handwriting from photos and writes the text they type in that hand, entirely in the browser. What we are building: [Launch spec](https://github.com/mafzalkalwardev/inkcadence/issues/16). Why each decision was made: [Wayfinder map](https://github.com/mafzalkalwardev/inkcadence/issues/2). Domain words (hand, pen, glyph, letter sheet, page…): `GLOSSARY.md`; use them in code, UI and PRs.

## Work loop

1. **Pick** the lowest-numbered open issue labelled `launch-v1` with no open blockers and no assignee. Blockers: the issue sidebar, or `gh api repos/mafzalkalwardev/inkcadence/issues/<n> --jq .issue_dependencies_summary.blocked_by` (0 = unblocked). Assign it to yourself before starting.
2. **Read** the issue, its comments, the spec, and every issue or research note it links. Research notes live on `research/*` branches.
3. **Branch** `build/<n>-<slug>` from the latest `main`. One issue, one PR. `main` is protected: CI must pass to merge.
4. **Done** means every "Done when" box is demonstrably true, with evidence in the PR (test output; screenshots at 390×844 and desktop for UI), and `npm run lint`, `npm test` and `npm run build --prefix web` pass. Start the PR body with `Closes #<n>`.
5. **Owner action** (`owner-action` label, or any question the issue and spec don't answer): ask on the issue, tag the owner, and continue with the parts that don't depend on the answer. Product decisions belong to the owner.

## Invariants

- Everything runs on the user's device: no backend, no requests carrying user content, no third-party analytics.
- Output is drawn only from the hand's own glyphs. A missing character is generated in the person's style or named in a clear message.
- User-facing copy describes writing the person's own words in their own handwriting: notes, letters, journals, pages. The wording rules are in [How should Inkcadence describe itself and disclose AI use?](https://github.com/mafzalkalwardev/inkcadence/issues/10).
- Real handwriting stays outside the repo unless its writer consented to publication (`test/fixtures/real/CONSENT.md`). Photos never go into saved hands, exports, logs, issues or commits.
- Imported `.inkpack` files are untrusted: decode them through `PackShare.decodeShare`, and put pack data into the page with `textContent` or escaped strings.

## Code map

- `web/`: the app (Vite), published at `/app/`. UI in `web/src/main.js`; engines in `web/src/lib/`.
- `js/` and root `index.html`: the classic writer, frozen and being retired. Until the single-engine-source issue lands, engine changes are made in `js/` and copied with `npm run sync:engines`; `npm run check:engines` fails on drift.
- `docs/`: the landing site, published at `/` (see `.github/workflows/pages.yml`).
- `test/`: Node tests. The pipeline and assignments suites need the `canvas` package (`npm i --no-save canvas` until it is a devDependency) and skip without it.
