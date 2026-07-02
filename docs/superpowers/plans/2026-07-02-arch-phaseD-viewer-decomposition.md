# Phase D · Architecture Restructure — GenomeViewer Decomposition Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 2190-line `GenomeViewer.tsx` (moved to `src/app/viewer/` as Task 1 of this plan) into a slim container plus a pure, node-testable layout engine, leaf canvas track components, a minimap component, and two interaction hooks — **behavior-preserving**, with visual/interaction parity as the bar. Type the render path (kill the `any`s) and add the top-of-file overview JSDoc the file lacks. The end state has every `src/app/viewer/**` file under 600 lines, which **unlocks Phase E flipping the ESLint `max-lines` guard to `error` (600)**.

**Architecture:** The viewer follows the same logic/hook/component split already used for app features. The one high-value *pure* extraction is the layout engine (`layout.ts`) — the `recordLayouts` memo body (feature packing + track packing + interval packing + geometry), lifted out of React with an explicit typed output so it can be unit-tested in node and so the render path stops using `any`. The three canvas renderers (`SequenceTrack`, `ConservationTrack`, `QuantitativeTrack`), the `Ruler`, the `Row`, the `Minimap`, and the selection overlay become their own component files. Viewport state (zoom/scroll/goto/keyboard/wheel/fit/center) moves to `useViewport.ts`; drag-select/pan moves to `useSelectionDrag.ts`. `GenomeViewer.tsx` becomes a composition root that owns record-derived memos and wires the pieces. Every canvas body and effect moves **verbatim** — only the source of each referenced value changes (prop / ref / hook return). Because canvas pixels can't be asserted, the parity proof is: `typecheck` + `lint` + `lint:headers` + `build` green, plus a manual smoke check after each extraction.

**Tech Stack:** React 19 + TypeScript, Vite, d3, react-window, Vitest 4.1.2 (env `node`), `@vitest/coverage-v8`.

---

## Dependencies & assumptions

- **Depends on Phase C.** This plan assumes Phase C has completed and, per the design spec, has:
  1. **Left `components/GenomeViewer.tsx` in place** — Phase C does **not** move it. **Phase D performs the move itself as Task 1** (`git mv` into `src/app/viewer/GenomeViewer.tsx`, re-point its own import block to the final paths, and update the sole importer `src/app/App.tsx`: `@/components/GenomeViewer` → `@/src/app/viewer/GenomeViewer`). Phase D depends on Phase C only for the final `core`/`domain`/`app` import paths that GenomeViewer targets — the colors module, the domain sequence module, and canonical types (items 2–4 below).
  2. Created `src/app/viewer/colors.ts` exporting the display palette (`getNucleotideColor`, `getAminoAcidColor`, `getFeatureColor`) split out of `services/bioUtils.ts`.
  3. Landed the translation/CDS primitives (`translateSequence`, `extractCodingSequence`, `detectEarlyStop`) in the domain layer (spec §3/§5 — expected `src/domain/bio/sequence.ts`).
  4. Killed the root `types.ts` shim; canonical types live in `src/domain/bio/types.ts`.

  **Recommendation confirmed:** Phase C leaves GenomeViewer at `components/`; **Phase D moves it verbatim (Task 1), then decomposes in place under `src/app/viewer/`.** Do not decompose during the move.

- **`GenomeViewer.tsx` has no external importer except `App.tsx`** (verified) and **no test imports it or its internals** (verified) — so these extractions cannot break existing suites; the only new suite is `layout.test.ts`.

- **Line numbers** below reference the current `components/GenomeViewer.tsx`. After Task 1's move + import-block rewrite the file relocates and line numbers may drift by a few lines. **Anchor by symbol/marker** (e.g. "the `recordLayouts` memo", "the `SequenceTrack` component", `// Minimap Static Parts`) rather than trusting absolute numbers; the anchors were captured from the real file:
  - `Ruler` 56–122 · `SequenceTrackProps` 124–140 · `SequenceTrack` 142–341 · `RowData` 343–364 · `ConservationTrack` 366–428 · `TRACK_COLORS` 430 · `QuantitativeTrack` 432–615 · `Row` 617–1016 · `GenomeViewer` 1018–2189 · `export default` 2191.
  - Inside `GenomeViewer`: `recordLayouts` memo 1277–1372 · `conservationScores` memo 1169–1190 · minimap static effect 1380–1544 · minimap dynamic effect 1546–1559 · `itemData` memo 1580–1608 · `renderSelectionOverlay` 1610–1735 · keyboard effect 1737–1788 · `handleMouseDown` 1790–1882 · wheel effect 1884–1901 · `xScaleGlobal` 1903 · JSX return 1905–2188.

## Phase C import-specifier map (the final target specifiers)

Each extracted file imports the same **symbols** the container already uses; only the module **specifier** matters. In **Task 1**, after moving the file and re-pointing its import block to these final paths, record the exact specifier for each symbol from `src/app/viewer/GenomeViewer.tsx`, then reuse those specifiers verbatim in every extracted file. Expected values (adjust to whatever Phase C actually landed for the target modules):

| Symbol(s) | Expected specifier |
|---|---|
| `getNucleotideColor`, `getAminoAcidColor`, `getFeatureColor` | `@/src/app/viewer/colors` |
| `translateSequence`, `extractCodingSequence`, `detectEarlyStop` | `@/src/domain/bio/sequence` |
| `BioFeature`, `FeatureSegment`, `SearchResult`, `SelectionArea`, `SeqRecord`, `QuantitativeTrack` | `@/src/domain/bio/types` |

Intra-viewer imports use **relative** specifiers (`./layout`, `./constants`, `./tracks/SequenceTrack`, …), matching the repo's barrel convention; cross-layer imports use the `@/…` alias (alias `@` → repo root, so `@/src/domain/bio/types`).

---

## Global Constraints

- **Behavior-preserving.** Every move is verbatim: relocate the body unchanged, adding only `export` and adjusting the *source* of referenced values (prop / ref / hook return). **Do not** rewrite logic, reorder statements, "fix" a stale `useEffect` dependency array, or change a clamp/branch. If something cannot be preserved, STOP and report it as a risk — do not silently alter behavior. The only sanctioned non-behavioral edits are (a) adding types to replace render-path `any`, and (b) the JSDoc/overview additions.
- **AGPL header** on **every new covered source file** (`.ts`/`.tsx`): copy the exact 18-line block from `src/domain/bio/types.ts` lines 1–18 (identical in every source file). It goes at the very top. `npm run lint:headers` enforces it; you can auto-insert with `node scripts/check-license-headers.mjs --fix`.
- **CI mirror after every task** — all must be green:
  - `npm run typecheck > /dev/null 2>&1; echo "tc=$?"` → `0`
  - `npm run lint > /dev/null 2>&1; echo "lint=$?"` → `0` (warnings allowed; **no new `error`s**)
  - `npm run lint:headers > /dev/null 2>&1; echo "hdr=$?"` → `0`
  - `npm run build > /dev/null 2>&1; echo "build=$?"` → `0` (proves the Vite/worker/react-window wiring survives the move)
- **Test env is `node`.** Only the pure `layout.ts` gets a unit suite; canvas/React components are **not** unit-tested (no jsdom in this project). Their parity proof is `build` + the manual smoke check below.
- **Coverage ratchet:** add `src/app/viewer/layout.ts` (the one pure file) to the coverage `include` in `vite.config.ts` — do **not** add `src/app/viewer/**` (that would pull untested `.tsx` into the measured set). Re-baseline thresholds in the final task: a few points below achieved, **raise never lower**. Current thresholds: `lines 94 / branches 85 / functions 93 / statements 92`.
- **No new duplicate types.** Reuse `src/domain/bio/types.ts`. New viewer-local types (`RecordLayout`, `TrackLayout`, `FeaturePlacement`, `TrackDatum`, `LayoutOptions`, `RowData`) are declared once and imported.
- **Manual smoke check (parity bar)** after each component/hook extraction — use the `/run` skill or `npm run dev` and eyeball the viewer with `SCU49845.gb` (in repo root) loaded:
  1. File loads; ruler, minimap, sidebar labels, sequence glyphs render.
  2. Zoom in/out via +/− buttons, `+`/`-` keys, and Ctrl+wheel (glyphs appear at zoom > 12; translation rows at zoom > 5 on non-protein records).
  3. Scroll via the custom scrollbar, arrow/Home/End/PageUp/PageDown keys, Shift+wheel, and the minimap brush (brush and main viewport stay in sync).
  4. Select mode: drag to select (live bp readout), double-click a feature/track/annotation to select, resize-handle drag; pan mode: drag to pan both axes.
  5. Right-click a record/feature → context menu (Zoom, Export, Details, Remove, Copy); hover a feature/track → tooltip.
  6. Toggle conservation + quantitative tracks (load a `.bed`/`.bedgraph`) — they render and follow scroll/zoom.
- **RTK note:** if `vitest` output looks garbled/truncated, prefix with `rtk proxy` (e.g. `rtk proxy npx vitest run src/app/viewer/layout.test.ts`).

## Target file structure (all under `src/app/viewer/`)

| File | Kind | Responsibility |
|---|---|---|
| `constants.ts` (create) | pure | Shared geometry constants: `NT_ROW_HEIGHT`, `AA_ROW_HEIGHT`, `ANNOT_ROW_HEIGHT`, `RULER_HEIGHT`, `SIDEBAR_WIDTH` |
| `layout.ts` (create) | pure | `computeRecordLayouts` + `RecordLayout`/`TrackLayout`/`FeaturePlacement`/`TrackDatum`/`LayoutOptions` |
| `layout.test.ts` (create) | test | node unit tests for `computeRecordLayouts` |
| `Ruler.tsx` (create) | component | d3 axis + click-to-jump |
| `tracks/SequenceTrack.tsx` (create) | component | canvas nucleotide/AA glyphs + search highlight + broken-CDS map |
| `tracks/ConservationTrack.tsx` (create) | component | canvas conservation bars |
| `tracks/QuantitativeTrack.tsx` (create) | component | canvas line/interval tracks + interval packing + `TRACK_COLORS` |
| `Row.tsx` (create) | component | react-window row: sidebar labels + annotation JSX + track JSX; owns `RowData` |
| `Minimap.tsx` (create) | component | minimap d3 + canvas + brush (two effects + JSX) |
| `SelectionOverlay.tsx` (create) | component | selection/drag/cursor overlay (was `renderSelectionOverlay`) |
| `useViewport.ts` (create) | hook | zoom/scroll/goto/keyboard/wheel/fit/center + dimensions + pointer |
| `useSelectionDrag.ts` (create) | hook | drag-select/pan (`handleMouseDown`) + drag state |
| `GenomeViewer.tsx` (rewrite) | container | slim composition root (< 600 lines) + overview JSDoc |
| `vite.config.ts` (modify, root) | config | add `layout.ts` to coverage `include`; re-baseline thresholds |

---

## Task 1: Move `GenomeViewer.tsx` into `src/app/viewer/`, re-point imports & capture specifiers

Phase C does **not** move this file — it leaves it at `components/` and only lands the target modules (`colors.ts`, the domain sequence module, canonical types). **Phase D owns the move**, and it is the first thing this plan does, before any decomposition.

**Files:**
- Move: `components/GenomeViewer.tsx` → `src/app/viewer/GenomeViewer.tsx`
- Modify: `src/app/viewer/GenomeViewer.tsx` (re-point its own import block to the final paths)
- Modify: `src/app/App.tsx` (update the sole importer)

- [ ] **Step 1: Baseline green** — confirm the file is where Phase C left it and the branch is clean before touching anything:
```bash
test -f components/GenomeViewer.tsx && echo "src=yes" || echo "src=NO — expected Phase C to leave it at components/, STOP"
test -f src/app/viewer/colors.ts && echo "colors=yes" || echo "colors=NO — Phase C incomplete, STOP"
npm run typecheck > /dev/null 2>&1; echo "tc=$?"
npm run lint > /dev/null 2>&1; echo "lint=$?"
npm run lint:headers > /dev/null 2>&1; echo "hdr=$?"
rtk proxy npx vitest run > /dev/null 2>&1; echo "test=$?"
npm run build > /dev/null 2>&1; echo "build=$?"
```
All `0`. If not, STOP — the branch is not clean; do not build on red.

- [ ] **Step 2: Move the file** with history preserved:
```bash
git mv components/GenomeViewer.tsx src/app/viewer/GenomeViewer.tsx
```

- [ ] **Step 3: Re-point GenomeViewer's own import block** to the final `core`/`domain`/`app` paths Phase C landed (colors → `@/src/app/viewer/colors`, translation/CDS → the domain sequence module, canonical types → `@/src/domain/bio/types`; AGPL header and everything else intact), then update the sole importer `src/app/App.tsx`: change `import GenomeViewer from '@/components/GenomeViewer'` → `import GenomeViewer from '@/src/app/viewer/GenomeViewer'`. Confirm no other importer remains:
```bash
grep -rn "components/GenomeViewer" src && echo "STALE importers above — fix" || echo "no stale importers"
grep -n "^import" src/app/viewer/GenomeViewer.tsx
grep -n "GenomeViewer" src/app/App.tsx
```

- [ ] **Step 4: Record the exact specifier for each symbol** in the container's re-pointed import block (fill in the import-specifier map above): the colors module, the translation/CDS module, and `@/src/domain/bio/types`. Every extracted file will reuse these exact specifiers. If Phase C put `extractCodingSequence`/`detectEarlyStop` in a different domain module than `translateSequence`, note both.

- [ ] **Step 5: Verify green after the move, before decomposing** — typecheck + build must be clean with the file relocated and imports re-pointed:
```bash
npm run typecheck > /dev/null 2>&1; echo "tc=$?"
npm run lint > /dev/null 2>&1; echo "lint=$?"
npm run lint:headers > /dev/null 2>&1; echo "hdr=$?"
npm run build > /dev/null 2>&1; echo "build=$?"
```
All `0`. Only once green does decomposition begin (Task 2).

- [ ] **Step 6: Commit the move**
```bash
git add -A
git commit -m "refactor(viewer): move GenomeViewer into src/app/viewer/ and re-point imports" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Pure layout engine — `constants.ts` + `layout.ts` + tests, rewire the memo

This is the highest-value extraction: a React-free, node-testable layout engine with an explicit typed output that kills the render-path `any` originating from the untyped `recordLayouts`.

**Files:**
- Create: `src/app/viewer/constants.ts`
- Create: `src/app/viewer/layout.ts`
- Create: `src/app/viewer/layout.test.ts`
- Modify: `src/app/viewer/GenomeViewer.tsx` (rewire `recordLayouts` memo; retype `RowData.recordLayouts`)
- Modify: `vite.config.ts` (add `layout.ts` to coverage `include`)

**Interfaces:**
- `computeRecordLayouts(records: SeqRecord[], opts: LayoutOptions): RecordLayout[]` (pure, no React/DOM)

- [ ] **Step 1: Create `src/app/viewer/constants.ts`** (AGPL header + the shared geometry constants, moved verbatim from `GenomeViewer.tsx` lines 50–54):
```typescript
export const SIDEBAR_WIDTH = 120;
export const NT_ROW_HEIGHT = 22;
export const AA_ROW_HEIGHT = 18;
export const ANNOT_ROW_HEIGHT = 14;
export const RULER_HEIGHT = 25;
```
(This also consolidates the duplicate local `const SIDEBAR_WIDTH = 120` at line 1107 — both are `120`, so consolidation is behavior-preserving. See "Behavior-changing items".)

- [ ] **Step 2: Create `src/app/viewer/layout.ts`** — AGPL header, a file-level JSDoc describing the geometry model, the types, and `computeRecordLayouts`. The function body is the `recordLayouts` memo body (lines 1278–1371) **verbatim**, wrapped as a pure function taking `records` + `opts` and destructuring the three flags:
```typescript
import type { SeqRecord, BioFeature, QuantitativeTrack } from '@/src/domain/bio/types';
import { ANNOT_ROW_HEIGHT, AA_ROW_HEIGHT, NT_ROW_HEIGHT } from './constants';

/** A quantitative-track data point: a value over the half-open bp interval [start, end). */
export type TrackDatum = { start: number; end: number; value: number };

/** A track plus its computed vertical geometry. `packedRows` groups non-overlapping
 *  interval data into lanes (empty for `line` tracks). */
export interface TrackLayout extends QuantitativeTrack {
  height: number;
  top: number;
  packedRows: TrackDatum[][];
}

/** A feature assigned to a packing lane (`row`). Wrap-around features (start > end)
 *  are packed as two intervals but keep a single placement. */
export interface FeaturePlacement {
  feature: BioFeature;
  row: number;
}

/** Full per-record vertical layout: annotation lanes, quantitative tracks, and the
 *  sequence/translation band, with absolute y-offsets (px) and total row `height`. */
export interface RecordLayout {
  id: string;
  record: SeqRecord;
  placements: FeaturePlacement[];
  annotHeight: number;
  quantHeight: number;
  topPadding: number;
  height: number;
  seqBaseY: number;
  trackLayouts: TrackLayout[];
}

export interface LayoutOptions {
  showAnnotations: boolean;
  showTranslation: boolean;
  showTracks: boolean;
}

/**
 * Computes the vertical layout of every record for the virtualized viewer.
 *
 * Coordinate model: positions are 0-based half-open bp indices; a feature with
 * `start > end` is a circular wrap and is packed as `[start, len]` + `[0, end]`.
 * Features are packed into lanes with a 10-bp gap buffer; interval tracks are
 * packed into 16-px lanes. All heights are in pixels.
 *
 * Pure: no React, no DOM — unit-tested in node.
 */
export function computeRecordLayouts(records: SeqRecord[], opts: LayoutOptions): RecordLayout[] {
  const { showAnnotations, showTranslation, showTracks } = opts;
  return records.map(record => {
    // ... paste lines 1279–1371 of GenomeViewer.tsx VERBATIM here ...
    // Two type-only edits inside the pasted body (no behavior change):
    //   • `let packedRows: any[][] = [];`  →  `let packedRows: TrackDatum[][] = [];`
    //   • the returned object is unchanged; TypeScript infers `RecordLayout`.
  });
}
```
Paste the memo body (feature-packing loop, track-packing loop, `annotHeight`/`quantHeight`/`topPadding`/`effectiveTranslation`/`seqBaseY`/`height` computation, and the returned object) **character-for-character** from lines 1279–1371; the only edit is retyping the inner `packedRows: any[][]` → `TrackDatum[][]`.

- [ ] **Step 3: Rewire the memo in `GenomeViewer.tsx`.** Replace the `recordLayouts` memo body (1277–1372) with a call, keeping the identical dependency array:
```typescript
const recordLayouts = useMemo(
  () => computeRecordLayouts(records, { showAnnotations, showTranslation, showTracks }),
  [records, showAnnotations, showTranslation, showTracks],
);
```
Add `import { computeRecordLayouts, type RecordLayout } from './layout';`. Retype `RowData.recordLayouts: any[]` → `recordLayouts: RecordLayout[]` (line 344). (The `(t: any)` / `(p: any)` sites at 678/805/949 live in `Row` and are typed when `Row` is extracted in Task 7 — leaving them as `any` here is still type-safe; do not touch them yet.)

- [ ] **Step 4: Create `src/app/viewer/layout.test.ts`** (AGPL header + node unit tests). Cover: empty input; feature-lane packing with the 10-bp buffer (adjacent features share a lane only when gap ≥ buffer); wrap-around split; `showAnnotations=false` zeroes `annotHeight` but keeps `placements`; line-track height 80 and `quantHeight` accumulation (height + 12 spacing); interval-track packing → `packedRows` lanes and `height = max(80, lanes*16+10)`; `showTracks=false` zeroes `quantHeight`; `topPadding` 24 vs 0; protein vs DNA `effectiveTranslation` in `seqBaseY`/`height`.
```typescript
import { describe, it, expect } from 'vitest';
import { computeRecordLayouts } from './layout';
import type { SeqRecord } from '@/src/domain/bio/types';

const ALL = { showAnnotations: true, showTranslation: true, showTracks: true };
function rec(o: Partial<SeqRecord> & Pick<SeqRecord, 'id' | 'sequence'>): SeqRecord {
  return { name: o.id, features: [], ...o } as SeqRecord;
}

describe('computeRecordLayouts', () => {
  it('returns [] for no records', () => {
    expect(computeRecordLayouts([], ALL)).toEqual([]);
  });

  it('packs features > buffer apart into one lane', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(100), features: [
      { type: 'gene', name: 'a', start: 0, end: 10, strand: 1 },
      { type: 'gene', name: 'b', start: 25, end: 35, strand: 1 },
    ] });
    const [l] = computeRecordLayouts([r], ALL);
    expect(l.placements.map(p => p.row)).toEqual([0, 0]);
    expect(l.annotHeight).toBe(1 * (14 + 6)); // one lane
  });

  it('pushes features within the 10-bp buffer to a new lane', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(100), features: [
      { type: 'gene', name: 'a', start: 0, end: 10, strand: 1 },
      { type: 'gene', name: 'b', start: 15, end: 25, strand: 1 },
    ] });
    const [l] = computeRecordLayouts([r], ALL);
    expect(l.placements.map(p => p.row)).toEqual([0, 1]);
    expect(l.annotHeight).toBe(2 * 20);
  });

  it('keeps placements but zeroes annotHeight when showAnnotations is false', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(50), features: [
      { type: 'gene', name: 'a', start: 0, end: 10, strand: 1 },
    ] });
    const [l] = computeRecordLayouts([r], { ...ALL, showAnnotations: false });
    expect(l.placements).toHaveLength(1);
    expect(l.annotHeight).toBe(0);
    expect(l.topPadding).toBe(0);
  });

  it('packs a wrap-around feature (start > end) as two intervals in one lane', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(100), features: [
      { type: 'gene', name: 'wrap', start: 90, end: 10, strand: 1 },
    ] });
    const [l] = computeRecordLayouts([r], ALL);
    expect(l.placements).toEqual([{ feature: r.features[0], row: 0 }]);
    expect(l.annotHeight).toBe(20);
  });

  it('gives line tracks height 80 and accumulates quantHeight with 12-px spacing', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(100),
      tracks: [{ id: 't', name: 't', kind: 'line', data: [{ start: 0, end: 5, value: 1 }] }] });
    const [l] = computeRecordLayouts([r], ALL);
    expect(l.trackLayouts[0]).toMatchObject({ height: 80, top: 0, packedRows: [] });
    expect(l.quantHeight).toBe(80 + 12);
  });

  it('packs overlapping interval-track data into lanes and sizes height', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(100), tracks: [{
      id: 't', name: 't', kind: 'interval',
      data: [{ start: 0, end: 40, value: 1 }, { start: 10, end: 50, value: 2 }],
    }] });
    const [l] = computeRecordLayouts([r], ALL);
    expect(l.trackLayouts[0].packedRows).toHaveLength(2);
    expect(l.trackLayouts[0].height).toBe(Math.max(80, 2 * 16 + 10));
  });

  it('zeroes quantHeight when showTracks is false', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(100),
      tracks: [{ id: 't', name: 't', kind: 'line', data: [] }] });
    const [l] = computeRecordLayouts([r], { ...ALL, showTracks: false });
    expect(l.quantHeight).toBe(0);
  });

  it('applies the translation band only for non-protein records', () => {
    const dna = computeRecordLayouts([rec({ id: 'd', sequence: 'ACGT', moleculeType: 'dna' })], ALL)[0];
    const pro = computeRecordLayouts([rec({ id: 'p', sequence: 'MKV', moleculeType: 'protein' })], ALL)[0];
    // seqBaseY = 0 + 0 + 0 + (effectiveTranslation ? 18*3 : 0)
    expect(dna.seqBaseY).toBe(18 * 3);
    expect(dna.height).toBe(18 * 3 + 18 * 3 + 22 + 20);
    expect(pro.seqBaseY).toBe(0);
    expect(pro.height).toBe(22 + 20);
  });
});
```
If a computed value fails, **recompute from the source formula** — do not weaken the assertion. A genuine mismatch means the paste drifted; fix the paste.

- [ ] **Step 5: Add `layout.ts` to the coverage `include`** in `vite.config.ts` (the `include` array under `test.coverage`), matching the existing single-file precedent (`src/app/recordRemoval.ts`):
```
"src/app/viewer/layout.ts",
```
Do **not** add `src/app/viewer/**`.

- [ ] **Step 6: Verify**
```bash
rtk proxy npx vitest run src/app/viewer/layout.test.ts   # PASS
npm run typecheck > /dev/null 2>&1; echo "tc=$?"          # 0
npm run lint > /dev/null 2>&1; echo "lint=$?"             # 0
npm run lint:headers > /dev/null 2>&1; echo "hdr=$?"      # 0
npm run build > /dev/null 2>&1; echo "build=$?"           # 0
```

- [ ] **Step 7: Commit**
```bash
git add src/app/viewer/constants.ts src/app/viewer/layout.ts src/app/viewer/layout.test.ts src/app/viewer/GenomeViewer.tsx vite.config.ts
git commit -m "refactor(viewer): extract pure layout engine to layout.ts; type the render path" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: `tracks/ConservationTrack.tsx` (leaf canvas, no domain deps)

Safest leaf first: `ConservationTrack` imports only React + d3 (type) — no colors, no domain.

**Files:**
- Create: `src/app/viewer/tracks/ConservationTrack.tsx`
- Modify: `src/app/viewer/GenomeViewer.tsx` (import + render `<ConservationTrack>`)

**Interfaces:** `export const ConservationTrack: React.FC<{ scores: number[]; viewportWidth: number; height: number; xScale: d3.ScaleLinear<number, number>; scrollX: number }>`

- [ ] **Step 1:** Create the file with AGPL header, then move the `ConservationTrack` component (lines 366–428) **verbatim**, adding `export` to the `const`. Imports:
```typescript
import * as d3 from 'd3';
import React, { memo, useEffect, useRef } from 'react';
```
- [ ] **Step 2:** In `GenomeViewer.tsx` delete the inline `ConservationTrack` (366–428) and add `import { ConservationTrack } from './tracks/ConservationTrack';`. The JSX usage (~2114) is unchanged.
- [ ] **Step 3:** Verify (typecheck / lint / lint:headers / build all `0`).
- [ ] **Step 4:** Manual smoke — conservation track still renders and follows scroll (see parity checklist item 6).
- [ ] **Step 5: Commit**
```bash
git add src/app/viewer/tracks/ConservationTrack.tsx src/app/viewer/GenomeViewer.tsx
git commit -m "refactor(viewer): extract ConservationTrack to tracks/" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: `tracks/SequenceTrack.tsx`

**Files:**
- Create: `src/app/viewer/tracks/SequenceTrack.tsx`
- Modify: `src/app/viewer/GenomeViewer.tsx`

**Interfaces:** `export const SequenceTrack: React.FC<SequenceTrackProps>` + `export interface SequenceTrackProps`

- [ ] **Step 1:** Create the file with AGPL header. Move `SequenceTrackProps` (124–140) and the `SequenceTrack` component (142–341) **verbatim**, adding `export` to both. Two type-only edits (no behavior change): retype `features: any[]` → `features: BioFeature[]` in the props interface (matches `l.record.features` passed from `Row`). Imports:
```typescript
import * as d3 from 'd3';
import React, { memo, useEffect, useMemo, useRef } from 'react';
import type { BioFeature, SearchResult } from '@/src/domain/bio/types';
import { getAminoAcidColor, getNucleotideColor } from '@/src/app/viewer/colors';       // mirror post-C specifier
import { extractCodingSequence, detectEarlyStop, translateSequence } from '@/src/domain/bio/sequence'; // mirror post-C specifier
import { NT_ROW_HEIGHT, AA_ROW_HEIGHT } from '../constants';
```
The internal `brokenFeatureMap` memo and the `['CDS','ORF','orf','cds']` filter move **verbatim** — do not dedupe them here (local dedup is Phase A/E's lane).
- [ ] **Step 2:** In `GenomeViewer.tsx` delete the inline `SequenceTrackProps` + `SequenceTrack` and add `import { SequenceTrack } from './tracks/SequenceTrack';`. Note: `SequenceTrack` is rendered inside `Row` (still in the container until Task 7), so the import must resolve now.
- [ ] **Step 3:** Verify (typecheck / lint / lint:headers / build all `0`).
- [ ] **Step 4:** Manual smoke — nucleotide/AA glyphs, search highlight, broken-CDS `!` markers render at high zoom (parity items 1–2, 5).
- [ ] **Step 5: Commit**
```bash
git add src/app/viewer/tracks/SequenceTrack.tsx src/app/viewer/GenomeViewer.tsx
git commit -m "refactor(viewer): extract SequenceTrack to tracks/; type features prop" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: `tracks/QuantitativeTrack.tsx` (+ `TRACK_COLORS`)

**Files:**
- Create: `src/app/viewer/tracks/QuantitativeTrack.tsx`
- Modify: `src/app/viewer/GenomeViewer.tsx`

**Interfaces:** `export const QuantitativeTrack: React.FC<{...}>` + `export const TRACK_COLORS: string[]`

- [ ] **Step 1:** Create the file with AGPL header. Move `TRACK_COLORS` (430) and the `QuantitativeTrack` component (432–615) **verbatim**, adding `export` to both. Type-only edits (no behavior change): retype the three `any[][]`/`any[]` on the render path — the props `packedRows?: any[][]` → `packedRows?: TrackDatum[][]`, the `externalPackedRows` usage, and the internal `const rows: any[][]` → `TrackDatum[][]`. Imports:
```typescript
import * as d3 from 'd3';
import React, { memo, useEffect, useMemo, useRef } from 'react';
import type { TrackDatum } from '../layout';
```
(`TRACK_COLORS` lives here because it is the tracks' display palette and is consumed only by `Row`; co-locating it avoids editing Phase C's `colors.ts`. See "Key decisions".)
- [ ] **Step 2:** In `GenomeViewer.tsx` delete the inline `TRACK_COLORS` + `QuantitativeTrack`. `Row` (still in the container) references both `QuantitativeTrack` and `TRACK_COLORS`, so add `import { QuantitativeTrack, TRACK_COLORS } from './tracks/QuantitativeTrack';`.
- [ ] **Step 3:** Verify (typecheck / lint / lint:headers / build all `0`).
- [ ] **Step 4:** Manual smoke — load a `.bed` (interval) and `.bedgraph` (line) track; packing, color scale, value labels, grid, zero-line render and follow scroll (parity item 6).
- [ ] **Step 5: Commit**
```bash
git add src/app/viewer/tracks/QuantitativeTrack.tsx src/app/viewer/GenomeViewer.tsx
git commit -m "refactor(viewer): extract QuantitativeTrack + TRACK_COLORS to tracks/; type packedRows" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: `Ruler.tsx`

**Files:**
- Create: `src/app/viewer/Ruler.tsx`
- Modify: `src/app/viewer/GenomeViewer.tsx`

**Interfaces:** `export const Ruler: React.FC<{ width: number; height: number; xScale: d3.ScaleLinear<number, number>; scrollX: number; sidebarWidth: number; onJump: (pos: number) => void }>`

- [ ] **Step 1:** Create the file with AGPL header. Move the `Ruler` component (56–122) **verbatim**, adding `export`. Imports:
```typescript
import * as d3 from 'd3';
import React, { useEffect, useRef } from 'react';
```
- [ ] **Step 2:** In `GenomeViewer.tsx` delete the inline `Ruler` and add `import { Ruler } from './Ruler';`. The JSX usage (~1976) is unchanged.
- [ ] **Step 3:** Verify (typecheck / lint / lint:headers / build all `0`).
- [ ] **Step 4:** Manual smoke — top ruler ticks/labels render; clicking the ruler jumps the viewport (parity items 1, 3).
- [ ] **Step 5: Commit**
```bash
git add src/app/viewer/Ruler.tsx src/app/viewer/GenomeViewer.tsx
git commit -m "refactor(viewer): extract Ruler component" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: `Row.tsx` (+ `RowData`)

`Row` is ~400 lines; extracting it is required to bring the container under 600. It composes the track components + constants + colors + layout types.

**Files:**
- Create: `src/app/viewer/Row.tsx`
- Modify: `src/app/viewer/GenomeViewer.tsx`

**Interfaces:** `export const Row: React.MemoExoticComponent<...>` (a `memo(({ index, style, data }: ListChildComponentProps<RowData>) => …)`) + `export interface RowData`

- [ ] **Step 1:** Create the file with AGPL header. Move the `RowData` interface (343–364) and the `Row` component (617–1016) **verbatim**, adding `export` to both. Retype `RowData.recordLayouts: any[]` → `RecordLayout[]` (already changed in Task 2 — carry the typed version over). Type-only edits inside `Row` (kill the render-path `any`s at 678/805/930/949/961/979):
  - `l.trackLayouts.map((t: any) => …)` → `(t: TrackLayout)` (2 sites: legend ~678, track render ~949)
  - `l.placements.map((p: any, i: number) => …)` → `(p: FeaturePlacement, i: number)` (~805)
  - `f.segments.map((seg: any, idx: number) => …)` → `(seg: FeatureSegment, idx: number)` (~930)
  - `track.data.find((d: any) => …)` → `(d: TrackDatum)` (2 sites ~961, ~979)

  Imports:
```typescript
import * as d3 from 'd3';
import React, { memo, useMemo } from 'react';
import type { ListChildComponentProps } from 'react-window';
import type { BioFeature, FeatureSegment, SearchResult, SelectionArea } from '@/src/domain/bio/types';
import { getFeatureColor } from '@/src/app/viewer/colors';                              // mirror post-C specifier
import { extractCodingSequence, detectEarlyStop } from '@/src/domain/bio/sequence';     // mirror post-C specifier
import { ANNOT_ROW_HEIGHT, NT_ROW_HEIGHT, AA_ROW_HEIGHT } from './constants';
import type { RecordLayout, TrackLayout, FeaturePlacement, TrackDatum } from './layout';
import { SequenceTrack } from './tracks/SequenceTrack';
import { QuantitativeTrack, TRACK_COLORS } from './tracks/QuantitativeTrack';
```
The internal `brokenFeatureMap` memo and the CDS filter literal move **verbatim** (no dedup here).
- [ ] **Step 2:** In `GenomeViewer.tsx` delete the inline `RowData` + `Row`, drop the now-unused imports of `SequenceTrack`/`QuantitativeTrack`/`TRACK_COLORS` (they belong to `Row` now — keep `ConservationTrack`/`Ruler`), and add `import { Row, type RowData } from './Row';`. The `itemData` memo is still typed `useMemo<RowData>` (unchanged) and `<VariableSizeList>{Row}</VariableSizeList>` is unchanged.
- [ ] **Step 3:** Verify (typecheck / lint / lint:headers / build all `0`). Confirm no `any` remains on `Row`'s render path: `grep -n ": any" src/app/viewer/Row.tsx` should return nothing meaningful.
- [ ] **Step 4:** Manual smoke — full row: sidebar labels (Annot/Tracks/Sequence/F1-3/R1-3), annotation rects + segment connector lines + wrap-around, selection background, tooltips, double-click-to-select, context menu (parity items 1, 4–6).
- [ ] **Step 5: Commit**
```bash
git add src/app/viewer/Row.tsx src/app/viewer/GenomeViewer.tsx
git commit -m "refactor(viewer): extract Row + RowData; kill render-path any" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: `Minimap.tsx`

The delicate one: two effects operating on internal refs + a d3 brush that drives the parent's zoom/scroll. Move both effect bodies **verbatim**; only the value sources change.

**Files:**
- Create: `src/app/viewer/Minimap.tsx`
- Modify: `src/app/viewer/GenomeViewer.tsx`

**Interfaces:**
```typescript
export interface MinimapProps {
  records: SeqRecord[];
  consensus: string;
  alignmentLength: number;
  containerWidth: number;      // was dimensions.width
  viewportWidth: number;
  scrollX: number;
  zoomLevel: number;
  fitZoom: number;
  searchResults: SearchResult[];
  currentSearchIdx: number;
  customColors?: Record<string, string>;
  horizontalScrollRef: React.RefObject<HTMLDivElement>;
  onZoomChange: (zoom: number) => void;   // was setZoomLevel
}
export const Minimap: React.FC<MinimapProps>;
```

- [ ] **Step 1:** Create the file with AGPL header. The component:
  1. Declares the minimap-internal refs (moved from the container): `minimapRef` (`SVGSVGElement`), `minimapWrapperRef` (`HTMLDivElement`), `minimapCanvasRef` (`HTMLCanvasElement`), `brushRef` (`useRef<any>(null)`), `isBrushing` (`useRef(false)`). **Do not** move `minimapContainerRef` — that is the toolbar wrapper ref and stays in the container.
  2. Contains the **static-parts** effect (body of lines 1381–1544) **verbatim**, and the **dynamic-indicator** effect (body of lines 1547–1559) **verbatim**, with exactly these value-source substitutions (no other edits):
     - `dimensions.width` → `containerWidth` (appears only in the two dependency arrays — line 1544 and line 1559);
     - `setZoomLevel(targetZoom)` → `onZoomChange(targetZoom)` (in the brush `on('brush')` handler ~1527);
     - `records`, `consensus`, `customColors`, `searchResults`, `currentSearchIdx`, `viewportWidth`, `fitZoom`, `scrollX`, `zoomLevel`, `alignmentLength`, `horizontalScrollRef` all become props (identical names, so their in-body uses are unchanged).
     - **Keep both dependency arrays exactly as-is** (with `containerWidth` swapped for `dimensions.width`). Notably `fitZoom` stays *out* of the static effect's deps — this preserves the current (intentional) stale-closure behavior; do not "fix" it.
  3. Returns the minimap JSX (lines 1912–1920) **verbatim** except `dimensions.width` → `containerWidth` in the scale label (`1:{Math.round(alignmentLength / (containerWidth || 1))}`):
```tsx
return (
  <div className="flex-1 flex flex-col justify-center min-w-0">
    <div ref={minimapWrapperRef} className="relative bg-white rounded-md border border-slate-200 shadow-inner p-0.5 h-[45px] overflow-hidden">
      <canvas ref={minimapCanvasRef} className="absolute inset-0 pointer-events-none" />
      <svg ref={minimapRef} className="absolute inset-0 cursor-crosshair w-full h-full" />
      <div className="absolute top-0 right-1 pointer-events-none z-10">
        <span className="text-[7px] font-mono text-slate-300 italic">1:{Math.round(alignmentLength / (containerWidth || 1))}</span>
      </div>
    </div>
  </div>
);
```
  Imports:
```typescript
import * as d3 from 'd3';
import React, { useEffect, useRef } from 'react';
import type { SeqRecord, SearchResult } from '@/src/domain/bio/types';
import { getFeatureColor, getNucleotideColor } from '@/src/app/viewer/colors';  // mirror post-C specifier
```
- [ ] **Step 2:** In `GenomeViewer.tsx`:
  - Delete the two minimap effects (1380–1559) and the internal minimap refs (`minimapRef`, `minimapWrapperRef`, `minimapCanvasRef`, `brushRef`, `isBrushing`). **Keep** `minimapContainerRef`, `horizontalScrollRef`, and the `setZoomLevel` setter (still local until Task 9).
  - Replace the inner minimap JSX (the `flex-1 flex flex-col justify-center` block, 1912–1920) with:
```tsx
<Minimap
  records={records}
  consensus={consensus}
  alignmentLength={alignmentLength}
  containerWidth={dimensions.width}
  viewportWidth={viewportWidth}
  scrollX={scrollX}
  zoomLevel={zoomLevel}
  fitZoom={fitZoom}
  searchResults={searchResults}
  currentSearchIdx={currentSearchIdx}
  customColors={customColors}
  horizontalScrollRef={horizontalScrollRef}
  onZoomChange={setZoomLevel}
/>
```
  - Add `import { Minimap } from './Minimap';`.
- [ ] **Step 3:** Verify (typecheck / lint / lint:headers / build all `0`).
- [ ] **Step 4:** Manual smoke (critical) — minimap renders feature density, conservation line, search stripes, ruler ticks; **brushing** it zooms/scrolls the main view; moving the main view moves the brush; no feedback loop/jitter (parity items 1, 3).
- [ ] **Step 5: Commit**
```bash
git add src/app/viewer/Minimap.tsx src/app/viewer/GenomeViewer.tsx
git commit -m "refactor(viewer): extract Minimap component" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: `useViewport.ts`

Moves all viewport state, refs, derived scales, handlers, and effects. Every effect body moves **verbatim** (all their referenced values move with them into the hook — no cross-hook references), so this is large but mechanical.

**Files:**
- Create: `src/app/viewer/useViewport.ts`
- Modify: `src/app/viewer/GenomeViewer.tsx`

**Interface:**
```typescript
export interface UseViewportParams {
  records: SeqRecord[];
  alignmentLength: number;
  activeSelection: SelectionArea | null;
  onSelectionChange: (s: SelectionArea | null) => void;
  jumpTo?: number | null;
  onJumpComplete?: () => void;
}
export function useViewport(params: UseViewportParams): {
  containerRef; horizontalScrollRef; listRef; listContainerRef;   // refs
  dimensions; listHeight; scrollX; zoomLevel; gotoPos; setGotoPos; mousePos; setZoomLevel;
  viewportWidth; chartWidth; fitZoom; xScaleGlobal;
  handleZoom; handleFit; handleCenterOnSelection; handleGoto; handleZoomToSelection;
  handleHorizontalScroll; handleMouseMove; handleMouseLeave;
};
```

- [ ] **Step 1:** Create the file with AGPL header. Move the following out of `GenomeViewer` **verbatim** (keep every dependency array identical):
  - refs: `containerRef`, `horizontalScrollRef`, `listRef`, `listContainerRef` (from 1040–1041, 1085, 1255);
  - state: `dimensions`, `listHeight`, `scrollX`, `zoomLevel`, `gotoPos`, `mousePos` (from 1045–1048, 1053, 1084);
  - derived: `chartWidth`, `viewportWidth` (1106, 1108 — use imported `SIDEBAR_WIDTH`), `fitZoom` (1110–1115), and `xScaleGlobal` (the per-render `const` at 1903);
  - handlers: `handleZoom` (1117–1142), `handleCenterOnSelection` (1144–1152), `handleFit` (1154–1156), `handleGoto` (1192–1201), `handleZoomToSelection` (1210–1223), `handleHorizontalScroll` (1561–1563), `handleMouseMove` (1565–1574), `handleMouseLeave` (1576–1578);
  - effects: resize (1257–1275), `jumpTo`→goto (1203–1208), auto-scroll-to-selection (1229–1248), keyboard (1737–1788), wheel (1884–1901).

  `records`, `alignmentLength`, `activeSelection`, `onSelectionChange`, `jumpTo`, `onJumpComplete` come from `params`. Imports:
```typescript
import * as d3 from 'd3';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';  // React namespace needed for React.MouseEvent/React.UIEvent/React.RefObject types
import type { VariableSizeList } from 'react-window';
import type { SeqRecord, SelectionArea } from '@/src/domain/bio/types';
import { SIDEBAR_WIDTH } from './constants';
```
  Return the object above. Keep `listRef` typed `useRef<VariableSizeList>(null)` and the `(listRef.current as any)._outerRef` accesses **verbatim** (pre-existing react-window internals; do not "fix").
- [ ] **Step 2:** In `GenomeViewer.tsx`, replace all the moved declarations with a single call and destructure:
```typescript
const {
  containerRef, horizontalScrollRef, listRef, listContainerRef,
  dimensions, listHeight, scrollX, zoomLevel, gotoPos, setGotoPos, mousePos, setZoomLevel,
  viewportWidth, chartWidth, fitZoom, xScaleGlobal,
  handleZoom, handleFit, handleCenterOnSelection, handleGoto, handleZoomToSelection,
  handleHorizontalScroll, handleMouseMove, handleMouseLeave,
} = useViewport({ records, alignmentLength, activeSelection, onSelectionChange, jumpTo, onJumpComplete });
```
  Remove the now-dead local `SIDEBAR_WIDTH` (line 1107) — the container's remaining JSX uses the imported one; add `SIDEBAR_WIDTH` (and `RULER_HEIGHT`) to the `./constants` import. Convert the `gotoPos` input's `onChange`/`setGotoPos` to the destructured `setGotoPos`. Add `import { useViewport } from './useViewport';`. The `<Minimap … onZoomChange={setZoomLevel} horizontalScrollRef={horizontalScrollRef} … />` wiring from Task 8 now sources both from the hook — unchanged prop names.
- [ ] **Step 3:** Verify (typecheck / lint / lint:headers / build all `0`).
- [ ] **Step 4:** Manual smoke (broad) — zoom (buttons/keys/Ctrl+wheel/minimap), scroll (scrollbar/arrows/Home/End/PageUp/PageDown/Shift+wheel), goto box, Fit, Center, Zoom-Sel, jump-to (search nav), resize, cursor bp readout (parity items 1–3, 5).
- [ ] **Step 5: Commit**
```bash
git add src/app/viewer/useViewport.ts src/app/viewer/GenomeViewer.tsx
git commit -m "refactor(viewer): extract viewport state/handlers to useViewport hook" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: `useSelectionDrag.ts` + `SelectionOverlay.tsx`

`handleMouseDown` (drag-select + pan, with window listeners and rAF auto-scroll) moves into the hook. The overlay JSX (`renderSelectionOverlay`, which itself contains the resize-handle drag logic) becomes a component `SelectionOverlay.tsx` (keeping `useSelectionDrag.ts` JSX-free so it stays `.ts`).

**Files:**
- Create: `src/app/viewer/useSelectionDrag.ts`
- Create: `src/app/viewer/SelectionOverlay.tsx`
- Modify: `src/app/viewer/GenomeViewer.tsx`

**Interfaces:**
```typescript
// useSelectionDrag.ts
export interface UseSelectionDragParams {
  dragMode: 'pan' | 'select';
  activeSelection: SelectionArea | null;
  onSelectionChange: (s: SelectionArea | null) => void;
  records: SeqRecord[];
  alignmentLength: number;
  chartWidth: number;
  horizontalScrollRef: React.RefObject<HTMLDivElement>;
  listRef: React.RefObject<VariableSizeList>;
}
export function useSelectionDrag(p: UseSelectionDragParams): {
  dragSelection: SelectionArea | null;
  dragCursorPos: { x: number; y: number } | null;
  handleMouseDown: (e: React.MouseEvent) => void;
};

// SelectionOverlay.tsx
export interface SelectionOverlayProps {
  records: SeqRecord[];
  alignmentLength: number;
  chartWidth: number;
  scrollX: number;
  zoomLevel: number;
  containerWidth: number;                 // was dimensions.width
  mousePos: { x: number; bp: number } | null;
  persistentSelection: SelectionArea | null;
  dragSelection: SelectionArea | null;
  dragCursorPos: { x: number; y: number } | null;
  onSelectionChange: (s: SelectionArea | null) => void;
}
export const SelectionOverlay: React.FC<SelectionOverlayProps>;
```

- [ ] **Step 1:** Create `useSelectionDrag.ts` (AGPL header). Move state `dragSelection`, `dragCursorPos` (1049–1050) and `handleMouseDown` (1790–1882) **verbatim**. Substitutions: `dragMode`, `activeSelection`, `onSelectionChange`, `records`, `alignmentLength`, `chartWidth`, `horizontalScrollRef`, `listRef` come from params; use imported `SIDEBAR_WIDTH`. Keep the `(listRef.current as any)._outerRef` access and the `setTimeout(..., 0)` / `requestAnimationFrame` logic **verbatim**. Imports:
```typescript
import * as d3 from 'd3';
import React, { useState } from 'react';  // React namespace needed for React.MouseEvent/React.RefObject types
import type { VariableSizeList } from 'react-window';
import type { SeqRecord, SelectionArea } from '@/src/domain/bio/types';
import { SIDEBAR_WIDTH } from './constants';
```
- [ ] **Step 2:** Create `SelectionOverlay.tsx` (AGPL header). Move the `renderSelectionOverlay` body (1611–1734) into the component `return (<>{elements}</>)`, **verbatim** except: substitute `dimensions.width` → `containerWidth` (2 sites in `renderHandle` ~1637 and the wrap-guard), and source `mousePos`, `persistentSelection`, `dragSelection`, `dragCursorPos`, `records`, `alignmentLength`, `chartWidth`, `scrollX`, `zoomLevel`, `onSelectionChange` from props; use imported `SIDEBAR_WIDTH`. The `renderHandle` window-listener drag logic moves **verbatim**. Imports:
```typescript
import * as d3 from 'd3';
import React from 'react';
import type { SeqRecord, SelectionArea } from '@/src/domain/bio/types';
import { SIDEBAR_WIDTH } from './constants';
```
- [ ] **Step 3:** In `GenomeViewer.tsx`:
  - Remove `dragSelection`/`dragCursorPos` state, `handleMouseDown`, and `renderSelectionOverlay`.
  - Add the hook call: `const { dragSelection, dragCursorPos, handleMouseDown } = useSelectionDrag({ dragMode, activeSelection, onSelectionChange, records, alignmentLength, chartWidth, horizontalScrollRef, listRef });`
  - Replace the `{renderSelectionOverlay()}` call (~1980) with:
```tsx
<SelectionOverlay
  records={records} alignmentLength={alignmentLength} chartWidth={chartWidth}
  scrollX={scrollX} zoomLevel={zoomLevel} containerWidth={dimensions.width}
  mousePos={mousePos} persistentSelection={persistentSelection}
  dragSelection={dragSelection} dragCursorPos={dragCursorPos}
  onSelectionChange={onSelectionChange}
/>
```
  - `handleMouseDown` is still attached to the list wrapper (`onMouseDown={handleMouseDown}` ~2077) — unchanged. Add both imports.
  - `tooltip`/`setTooltip` and `contextMenu`/`setContextMenu` + `handleContextMenu` + the context-menu-close effect **stay in the container** (they are small overlay state used by the container's own context-menu JSX, which also calls `handleZoomToSelection` from `useViewport`).
- [ ] **Step 4:** Verify (typecheck / lint / lint:headers / build all `0`).
- [ ] **Step 5:** Manual smoke (critical) — select-mode drag with live bp tooltip and edge auto-scroll; Shift+click extend; resize handles drag the selection edges; pan-mode drag moves both axes; wrap-around selection renders two bands; cursor guide line (parity items 4–5).
- [ ] **Step 6: Commit**
```bash
git add src/app/viewer/useSelectionDrag.ts src/app/viewer/SelectionOverlay.tsx src/app/viewer/GenomeViewer.tsx
git commit -m "refactor(viewer): extract drag/pan to useSelectionDrag + SelectionOverlay" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: Slim container — overview JSDoc, size check, coverage re-baseline, full CI, PR

**Files:**
- Modify: `src/app/viewer/GenomeViewer.tsx` (overview JSDoc; confirm slim)
- Modify: `vite.config.ts` (re-baseline thresholds)

- [ ] **Step 1: Add the top-of-file overview JSDoc** the file currently lacks (0 doc comments). Place it immediately above the `Props` interface / `GenomeViewer` component (below the imports), documenting the coordinate/zoom/scroll model + composition + the props contract:
```typescript
/**
 * GenomeViewer — virtualized, canvas-backed alignment/genome browser.
 *
 * Coordinate model: positions are 0-based half-open bp indices into a record's
 * `alignedSequence ?? sequence`. `alignmentLength` is the max aligned length
 * across records; the x-axis maps [0, alignmentLength] → px via a d3 linear
 * scale. A feature/selection with `start > end` denotes a circular wrap,
 * rendered as two segments: [start, len] and [0, end].
 *
 * Zoom/scroll model: `zoomLevel` is px-per-bp, clamped to [fitZoom, 150];
 * `fitZoom` fits the whole alignment in the viewport;
 * `chartWidth = alignmentLength * zoomLevel`. Horizontal position is driven by
 * a native scroll container (`horizontalScrollRef`) whose `scrollLeft` mirrors
 * `scrollX`; vertical scrolling is react-window (`VariableSizeList`, per-row
 * heights from the layout engine).
 *
 * Composition: pure layout (`layout.ts`) → per-row render (`Row` + canvas
 * `tracks/`) → viewport controls (`useViewport`) + drag/pan (`useSelectionDrag`)
 * + `Minimap` + `SelectionOverlay`. This container owns the record-derived
 * memos (`alignmentLength`, `quantValueRanges`, `conservationScores`,
 * `searchResultsByRecord`, `recordLayouts`, `itemData`) and wires the pieces.
 *
 * Props: see the `Props` interface below — records + consensus to render,
 * display toggles (annotations/translation/conservation/tracks), the
 * `dragMode`, the controlled `activeSelection`/`onSelectionChange`, search
 * state, and record-action callbacks.
 */
```
  Keep the existing per-field intent of `Props`. Do **not** add name-restating docblocks elsewhere (that is Phase E's comment-policy pass).
- [ ] **Step 2: Confirm every viewer file is under 600 lines** (the Phase E `max-lines: error` prerequisite):
```bash
for f in src/app/viewer/*.ts src/app/viewer/*.tsx src/app/viewer/tracks/*.tsx; do printf "%5d  %s\n" "$(wc -l < "$f")" "$f"; done | sort -rn
```
  Every entry must be `< 600`. `GenomeViewer.tsx` should be well under 600 (target). If any file is over, extract further (e.g. pull the context-menu JSX into a `ContextMenu.tsx`, or split a track) and re-run — do not leave a file ≥ 600.
- [ ] **Step 3: Re-baseline the coverage gate** in `vite.config.ts`. Measure achieved on the full scoped set (now including `src/app/viewer/layout.ts`), then set thresholds a few points below achieved — **raise never lower** (floor is the current `94/85/93/92`):
```bash
rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "gate=$?"
node -e '
const s=require("./coverage/coverage-summary.json").total;
const f=k=>Math.max(0,Math.floor(s[k].pct)-3);
console.log("achieved:",JSON.stringify({lines:s.lines.pct,branches:s.branches.pct,functions:s.functions.pct,statements:s.statements.pct}));
console.log("suggested (>= current):",JSON.stringify({lines:Math.max(94,f("lines")),branches:Math.max(85,f("branches")),functions:Math.max(93,f("functions")),statements:Math.max(92,f("statements"))}));
'
```
  Update the four `thresholds` values to the printed `suggested` line, then re-run and expect `gate=0`. (`layout.ts` is well-tested and pure, so aggregates should hold or rise; no threshold should need lowering — if one drops, STOP and investigate rather than lowering below current.)
- [ ] **Step 4: Full CI mirror** — all `0`:
```bash
npm run typecheck > /dev/null 2>&1; echo "tc=$?"
npm run lint > /dev/null 2>&1; echo "lint=$?"
npm run lint:headers > /dev/null 2>&1; echo "hdr=$?"
rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "coverage=$?"
npm run build > /dev/null 2>&1; echo "build=$?"
```
- [ ] **Step 5: Final full manual smoke** — run the entire parity checklist once more (`/run` or `npm run dev`), exercising every interaction against `SCU49845.gb` plus a `.bed`/`.bedgraph`. Confirm zero visual/interaction regressions.
- [ ] **Step 6: Commit, push, PR** (base `develop` per the branch workflow; branch off the post-Phase-C integration head):
```bash
git add src/app/viewer/GenomeViewer.tsx vite.config.ts
git commit -m "refactor(viewer): slim GenomeViewer container + overview JSDoc; re-baseline coverage" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
git push -u origin arch/phaseD-viewer-decomposition
gh pr create --base develop --title "refactor: Phase D — decompose GenomeViewer into src/app/viewer/*" \
  --body "Behavior-preserving decomposition of the 2190-line GenomeViewer into a pure layout engine (layout.ts, unit-tested), canvas track components, Ruler, Row, Minimap, SelectionOverlay, and the useViewport/useSelectionDrag hooks. Render-path any eliminated; top-of-file overview JSDoc added; every src/app/viewer file < 600 lines (unlocks Phase E max-lines:error). No behavior change; parity verified by build + manual smoke. See docs/superpowers/specs/2026-07-02-architecture-restructure-design.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-review

- **Spec conformance:** target paths match §3 exactly — `src/app/viewer/{GenomeViewer.tsx, layout.ts, tracks/*, Minimap.tsx, useViewport.ts, useSelectionDrag.ts}`, colors sourced from Phase C's `colors.ts`. Success criteria met: `GenomeViewer.tsx` < 600 (Task 11 verifies **all** viewer files), no `any` on the render path (Tasks 2/4/5/7 kill 344/134/442-449/678/805/930/949/961/979/1321), overview JSDoc added (Task 11).
- **Lane discipline:** performs the `components/` → `src/app/viewer/` move itself in Task 1; references Phase C only for `colors.ts` + the domain sequence module + canonical types (captured, not re-specified, in Task 1); defers local dedup (`brokenFeatureMap`, CDS-filter literal) and comment-policy work to Phase A/E; defers the `max-lines: error` flip itself to Phase E (Task 11 only guarantees the < 600 precondition).
- **Behavior preservation:** every canvas body, effect, and handler is a verbatim move; the only edits are (a) type annotations replacing `any`, (b) 1:1 value-source substitutions enumerated per task (`dimensions.width`→`containerWidth`, `setZoomLevel`→`onZoomChange`, params/refs), and (c) additive JSDoc. Dependency arrays are preserved verbatim (explicitly including the intentionally-incomplete minimap `fitZoom` case). `build` green after every task proves Vite/worker/react-window wiring; the manual smoke checklist is the pixel-parity bar.
- **Sequencing:** safest-first — pure `layout.ts` + tests (Task 2) → leaf canvas components (3–6) → `Row` (7) → `Minimap` (8) → hooks (9–10) → slim container (11). Each task ends green (typecheck + lint + lint:headers + build, plus tests for Task 2).
- **AGPL + coverage:** every new `.ts`/`.tsx` starts with the 18-line header (called out per task; `--fix` available). Only the pure `layout.ts` joins the coverage `include` (Task 2); thresholds re-baselined at the end (Task 11), raise-never-lower with the current `94/85/93/92` as a floor.
- **Placeholder scan:** no `TBD`/`TODO` in the plan; long bodies use precise "paste lines N–M verbatim" instructions anchored by symbol/marker (line numbers flagged as post-Phase-C drift-prone). `layout.ts` (the high-value extraction) and all new hook/prop interfaces and JSX wiring are shown in full.
- **Risks called out:** (1) Minimap brush ↔ viewport sync and the `_outerRef`/`setTimeout` internals are the highest-regression-risk moves — mitigated by verbatim bodies + a dedicated smoke step; (2) exact Phase C import specifiers are captured in Task 1 rather than guessed; (3) if the slim container still exceeds 600, Task 11 Step 2 mandates a further extraction (e.g. `ContextMenu.tsx`).
