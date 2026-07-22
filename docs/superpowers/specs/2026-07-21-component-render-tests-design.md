# Component / Canvas Render Tests — Design

**Date:** 2026-07-21
**Branch:** `test/68-render-tests`
**Issue:** #68
**Status:** Approved (pending spec review)

## Context

The repo has **no component/canvas render tests** — zero `*.test.tsx` files, no
jsdom, no `@testing-library`, and the vitest `environment` is `node`. The
view-model / logic tier is well covered (`hubAggregate.e2e.test.ts` pins the Hub
aggregate; `cds.test.ts` pins the broken-CDS map), but nothing renders a
component and asserts on what is actually *drawn*. A regression in the canvas
draw path or the DOM output would ship undetected.

This is the realization of a deliberately deferred decision: the Phase 1
test-hardening spec (`2026-07-01-test-hardening-phase1-design.md`, lines 29–30)
put "React test infra (jsdom + `@testing-library`)" behind a "Phase 2
checkpoint" that was never taken. Issue #68 takes it, scoped narrowly to the
render tier.

## Goals

1. Stand up the **first** React render-test harness in the repo — a small, reused
   support module — following the settled `@testing-library/react` + jsdom
   pattern, with jsdom opted in **per file** so the ~40 existing node tests are
   untouched.
2. Add render tests that fail on the specific regressions #68 names:
   - the translation row's early-stop `!` glyph and per-codon amino-acid letters
     (`SequenceTrack.tsx`, canvas);
   - multi-segment `join`/exon connectors, the segment wrap-around connector, and
     the feature circular-wrap two-part draw (`Row.tsx`, SVG);
   - the Database Hub `CIRCULAR` badge and the
     `"{n} Sequences • {m} Annotations"` header (`DatabaseHubPanel.tsx`, DOM).

## Non-goals

- **No coverage-config change.** The three SUTs are *not* in the coverage
  `include` allowlist and will not be added — pulling `Row.tsx` /
  `SequenceTrack.tsx` / `DatabaseHubPanel.tsx` into `include` would tank the
  ratchet on their many untested branches. Scope stays "regression tests for
  specific drawn output," exactly as #68 frames it.
- No interaction/event testing (clicks, tooltips, context menus), no full
  `GenomeViewer` mount, no visual/pixel snapshots.
- No production-code changes except a genuine bug surfaced by a test (which will
  be raised, not silently patched).
- No extraction of connector geometry into a pure function (see Rejected
  alternatives).

## Harness

New support module **`src/app/testing/renderHarness.tsx`** (AGPL header; lives
outside every coverage `include` glob, so it is never measured). It provides:

- **`render`** re-exported from `@testing-library/react`, plus a module-level
  `afterEach(cleanup)` (imported from `vitest`). This is **required**: the
  project does not set `globals: true`, so `@testing-library`'s auto-cleanup
  (which only fires when a global `afterEach` exists) does not run. Registering
  the hook from the imported helper binds it to each importing test file.
- **`installCanvasRecorder()`** — replaces `HTMLCanvasElement.prototype.getContext`
  with a stub returning a recording 2D context. It records `fillText` /
  `fillRect` calls and accepts (ignores) all settable props
  (`fillStyle`, `globalAlpha`, `font`, `textAlign`, `textBaseline`, …) and the
  other methods `SequenceTrack` calls (`scale`, `save`, `restore`, `clearRect`,
  …). A permissive default keeps any unexpected member from throwing. Exposes
  `texts()` → the ordered `fillText` strings (and `fillRects()`). Each call
  returns a **fresh recorder** (so canvas tests install it in `beforeEach`); the
  `getContext` patch is **not restored between tests within a file** and does not
  leak across files (vitest isolates test files). It doubles as a silence for
  jsdom's "Not implemented: getContext" noise when `Row` mounts its inner
  `SequenceTrack` canvas.
- **`stubResizeObserver()`** — jsdom lacks `ResizeObserver`; `DatabaseHubPanel`
  constructs one. A no-op stub suffices (the panel defaults `listHeight` to 600).

New devDependencies: **`@testing-library/react@^16`**, **`@testing-library/dom@^10`**
(a *peer* of TL-react 16 — must be explicit), **`jsdom@^29`**. React 19.2.4
satisfies the peer ranges. No change to test-runner discovery (vitest's default
glob already matches `*.test.tsx`).

jsdom is enabled **per file** via a `// @vitest-environment jsdom` docblock. This
is placed **below** the mandatory AGPL license header; verified safe against
vitest 4.1.2, whose `detectCodeBlock` matches the pragma against the entire file
(not just the first comment), so the header does not shadow it.

## Test files

All test files live in `__tests__/` directories (caught by the coverage
`exclude` glob) and carry the AGPL header + the jsdom docblock.

### `src/app/viewer/tracks/__tests__/SequenceTrack.test.tsx` (canvas)

Render `<SequenceTrack>` directly with an in-test `xScale`
(`d3.scaleLinear().domain([0, len]).range([0, len*zoom])`), `zoomLevel: 20`
(> 12, so both translation and nucleotide glyphs draw), `scrollX: 0`,
`viewportWidth` wide enough to keep every codon in view, `showTranslation: true`,
`moleculeType: 'dna'`, and a single `CDS` feature spanning the sequence.

- **Broken CDS** `ATGTAGGAG` (internal `TAG` stop): `recorder.texts()` contains
  `'!'` (the early-stop glyph) and `'M'` (start codon).
- **Valid CDS** `ATGCCCGAG`: `recorder.texts()` does **not** contain `'!'`.

Rationale: this exercises the component's integration of `computeBrokenFeatureMap`
+ translation + glyph selection, which the pure `cds.test.ts` does not.

### `src/app/viewer/__tests__/Row.test.tsx` (SVG)

Build fixtures with `computeRecordLayouts([record], { showAnnotations: true,
showTranslation: false, showTracks: false })[0]`, wrap in a `RowData`, and render
`<Row index={0} style={{}} data={rowData} />` with `persistentSelection: null`,
`showConservation: false`, `showTracks: false`, `scrollX: 0`, and a `zoomLevel` /
`viewportWidth` that keep the whole feature on screen.

Two implementation constraints (both are silent-failure traps if missed):

- **`RowData.showAnnotations` must be `true`** — annotations render only when this
  prop is truthy (Row.tsx ~236), which is *separate* from the `showAnnotations`
  passed to `computeRecordLayouts`. Every other required `RowData` field must be
  supplied: `alignmentLength` = record length, `searchResultsByRecord: {}`,
  `searchResults: []`, `currentSearchIdx: -1`, `conservationScores: []`,
  `quantValueRanges: {}`, and no-op callbacks (`onSelectionChange`,
  `onContextMenu`, `onViewDetails`, `setTooltip`).
- **Use a non-CDS feature type** (e.g. `gene` / `mRNA`). `Row` computes
  `computeBrokenFeatureMap` with **no `showTranslation` guard** (Row.tsx ~79), so a
  broken `CDS` fixture would paint a red `stroke-dasharray="3,2"` *rect* and muddy
  the rect-count assertion in the circular-wrap case. A non-CDS type is never
  flagged broken, keeping the SVG clean.

**Assertions are scoped to distinguishing attributes, never raw element counts**
— the SVG also draws a background grid (`<line stroke="#f1f5f9">` per
`xScale.ticks()` value) and would otherwise poison a `querySelectorAll('line')`.
Connectors are `line[stroke-dasharray="2,1"]` in the feature color.

- **Multi-segment join** — feature with segments `[{0,10},{20,30}]`: renders 2
  segment `<rect>`s and exactly 1 connector (`line[stroke-dasharray="2,1"]`).
- **Segment wrap-around connector** — segments `[{80,95},{5,20}]` on a length-100
  sequence (the `s1.end > s2.start` branch). Endpoints are kept **interior** (not
  at `0` / `len`) so both wrap halves have non-zero width and clear the
  visibility guards, yielding exactly **2** connector (`line[stroke-dasharray="2,1"]`)
  segments — vs 1 for the normal join. (Segments touching `0` / `len` would make
  one half zero-width and cull the other via the `x2 > 0` guard.)
- **Feature circular-wrap** — a feature with `start > end` (e.g. `start:90,
  end:10`, no segments): the `isWrap` path renders two `<rect>`s (the `p1`/`p2`
  two-part draw).

### `src/app/components/__tests__/DatabaseHubPanel.test.tsx` (DOM)

Render `<DatabaseHubPanel>` with two hand-built `SeqRecord`s — **the
`isCircular: true` record first**, so its header is flattened item 0 and renders
as react-window row 0 regardless of how many rows the virtualizer mounts —
`flattenedFeatures = buildFlattenedFeatures(records, '')` (the same helper the Hub
uses in production and in `hubAggregate.e2e.test.ts`), an explicit
`allFeaturesCount`, and no-op callbacks. `stubResizeObserver()` first.

- **Header** (rendered outside the virtualized list — the guaranteed anchor):
  the panel shows `"2 Sequences • {allFeaturesCount} Annotations"`. Assert with a
  **whitespace-robust matcher** — a regex
  (`/2\s+Sequences\s+•\s+{count}\s+Annotations/`) or a `textContent` check on the
  container — **not** a bare exact `getByText`, because React interpolation splits
  the string into four sibling text nodes.
- **CIRCULAR badge** (inside a react-window row): the badge text renders for the
  circular record. Low-risk under jsdom because the panel uses an explicit
  `height` (600), not `AutoSizer`, so row 0 renders; if virtualization proves
  finicky, the header assertion is fully independent and still guards the
  count-format regression.

## Assertion strategy

Explicit assertions on **semantic drawn output** — *which* glyphs/text/dashed
lines appear (`'!'` present/absent, connector count, badge text, header string) —
never pixel coordinates and never full snapshots. Each test fails for exactly one
reason and stays robust to layout tweaks.

## Rejected alternatives

- **Extract connector geometry to a pure function and unit-test it** (matching
  `layout.ts` / `cds.ts`). Rejected: #68 explicitly scopes the work to *the
  render tier* ("a test that renders a component and asserts on the output") and
  treats the logic tier as already covered. Kept only as a fallback if `Row`
  rendering proves flaky, and only with owner sign-off, since it reinterprets the
  issue.
- **Hand-rolled `createRoot` + `act` instead of `@testing-library/react`.**
  Rejected: still needs jsdom, and reinvents render/query ergonomics that a
  settled library provides.
- **`vitest-canvas-mock` instead of a hand-rolled recorder.** Rejected: its
  recorded-call API is oriented at "was `getContext` called"; per-arg assertions
  (did it draw `'!'`) are clumsier, and it adds a dependency for less control.

## Verification

Green after the change: `npm run typecheck`, `npm run lint`,
`npm run lint:headers`, `npm run test`, `npm run build`. Additionally run
`npm run test:coverage` and confirm the ratchet thresholds still pass (proving
the SUTs stayed out of the coverage report, as the Non-goals require).
