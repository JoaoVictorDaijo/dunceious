# Test Hardening — Phase 2A Design: Extract & test trapped pure logic

**Date:** 2026-07-01
**Branch:** `test-phase2-extraction` (off `main`, after Phase 1 / PR #39 merged)
**Status:** Approved (pending spec review)

## Context

Phase 1 hardened the pure-logic layer (`services/**`, `src/domain/**`,
`src/app/recordRemoval.ts`) to ~98% lines behind a ratcheted v8 coverage gate.
The remaining zero-coverage surface is the React/worker layer.

A six-agent reconnaissance found the decisive fact: **the real regression value
is pure logic *trapped* in unexported functions and closures** inside the
workers, hooks, and components. It is testable in `node` with **zero new infra**
— but only after a small **behavior-preserving extraction** into importable
modules. Rendering the React/canvas layer (jsdom/@testing-library) is the
expensive, low-value path (can't assert canvas pixels; mostly checks "a handler
fired") and is out of scope.

A blocking detail: `src/workers/bioWorker.ts` and `src/workers/searchWorker.ts`
execute `self.onmessage = …` at top level with no guard, so they throw on a bare
`import` in node — which is *why* their pure parsers show 0% despite being pure.

## Goals

Extract the high-value pure logic into dedicated modules and unit-test it in
node, raising real regression protection with **no new dependencies**. Fold the
new modules into the existing coverage gate.

## Non-goals

- GenomeViewer (2,190 lines) helper extraction — deferred (delicate refactor of a
  hot component; its leaf helpers already live in the Phase-1-tested `bioUtils`).
- happy-dom / @testing-library / any DOM or Worker test harness.
- Hook lifecycle/async tests (Worker construction, timeouts, request-id races).
- Trivial presentational components (`StatusBar`, `TopNav`, `ProcessingOverlay`,
  `MoleculeTypeMismatchModal`).
- Any behavior change. Extraction is byte-for-byte behavior-preserving.

## Core principle: behavior-preserving extraction

Move pure logic **out** of workers/hooks/components into pure modules; the
original files `import` and call them. Runtime behavior is identical — the
passing `npm run build` + full CI mirror is the proof. Then unit-test the pure
modules. Where logic is duplicated across two sites, extract **once** (de-dup is
a bonus, not the goal).

The one intentional structural change: the sequence-search engine currently
exists in **both** `src/workers/searchWorker.ts` (its `onmessage` body) and
`src/app/hooks/useSearchWorker.ts` (`executeSearchInline`, the synchronous exact
path + fuzzy-worker fallback). Both are extracted into one shared
`services/search/runSearch.ts` that both call — removing the duplicate.

## Module layout (locked)

**`services/`** — domain-y (parsing, molecule detection, search execution):
- `services/parsers/fasta.ts` — `parseFasta`
- `services/parsers/annotations.ts` — `parseBED`, `parseGFF3`, `parseBedGraph`
- `services/moleculeType.ts` — `detectMoleculeType` (from bioWorker) + the three
  `useFileHandlers` sniffers (`sniffFastaCategory`, `sniffGenBankCategory`,
  `getLoadedCategory`)
- `services/search/runSearch.ts` — `runSearch(request): SearchWorkerResponse`
  and `collectSeededFuzzyHits`, shared by the worker and the hook

**`src/app/logic/`** — app-state-shaped reducers/derivations:
- `bioResponse.ts` — `resolveAccession`, `applyBioResponse` (annotation-merge,
  FASTA-overlay validation, batch dedup)
- `searchState.ts` — `filteredResults`, `groupedSearchResults`, join-segment
  core, `getSequenceContext`
- `featureManager.ts` — `saveEditedFeature`/`removeFeature`/`toggleRecordVisibility`
  reducers, `buildFlattenedFeatures`, new-feature coordinate logic
- `viewModel.ts` — `getDisplaySeq`, `featureLength`, `scorePercent`,
  `deriveAlignmentState`, `featureCoordPatch`

The workers/hooks/components keep only runtime wiring (`self.onmessage`, React
state/effects/refs, JSX) and import from the pure modules.

## Increments (each behavior-preserving, tested, gated → its own PR)

### PR1 — Workers & parsing (highest ROI, self-contained)
Extract from `src/workers/bioWorker.ts` and `src/workers/searchWorker.ts`:
- `parseFasta`, `parseBED`, `parseGFF3`, `parseBedGraph`, `detectMoleculeType`
  → `services/parsers/*` + `services/moleculeType.ts`.
- The `searchWorker` onmessage body + `collectSeededFuzzyHits`
  → `services/search/runSearch.ts`; the worker's `onmessage` becomes a thin
  `postMessage(runSearch(e.data))`. `useSearchWorker.executeSearchInline` is
  re-pointed at the same `runSearch` (de-dup).
- Both worker files end as thin dispatchers importing the above.

Tests (node): parser edges — GFF3 0-based start (`col4 - 1`), strand mapping,
attribute `decodeURIComponent`, name precedence (`Name > ID > type_pos`), `<9`
cols skipped; BED `>=3` cols, NaN skips, score default 0, per-chrom track
grouping; BedGraph `>=4` cols, NaN value skip; FASTA multi-record split, id
token, wrapped-line concat, molecule inference; `detectMoleculeType` protein/rna/
dna; annotation format dispatch (`.bed`/`.gff`/`.gff3`/`.bedgraph` + extensionless
9-col → GFF3 else BED); `runSearch` exact (fwd + reverse-complement remap
`start=L-rcEnd`, overlaps via `lastIndex=index+1`, protein skips reverse, empty
query → `[]`) and fuzzy (rev remap, sort fuzzy-by-score / exact-by-start,
`maxResults` slice); `collectSeededFuzzyHits` short-query fallback, whole-window
fallback, dedup, 256 window cap.

### PR2 — App-state logic
Extract reducer/derivation bodies (currently inside `setState` updaters and
`useMemo`/`useCallback` closures) from `useBioWorker`, `useSearchWorker`,
`useFeatureManager` into `src/app/logic/{bioResponse,searchState,featureManager}.ts`.
The hooks call the extracted functions.

Tests (node): `resolveAccession` precedence; `applyBioResponse` feature/track
split by the `'data' in item` discriminant, id/name/accession lookup precedence,
`totalAdded` count, unmatched-ID truncation at 5, FASTA-overlay missing/extra-ID
diff + length-mismatch rejection + `alignedSequence` assignment; batch dedup via
`makeUniqueId`; `filteredResults` percentage filter (exact/`maxScoreFound===0`
bypass); `groupedSearchResults` grouping preserving indices; join-segment core
(sort by start, span min→max, `<2`-match and mixed-strand/record rejects — the
`alert` side-effect stays in the hook); `getSequenceContext` clamp math;
`featureManager` reducers applied to a fixture via the captured updater
(`featureIndex===-1` append vs replace; splice remove; visibility flip);
`buildFlattenedFeatures` header/track/feature ordering + case-insensitive filter.

### PR3 — App/modal view-model helpers
Extract the five inline helpers into `src/app/logic/viewModel.ts`; components
import them.

Tests (node): `getDisplaySeq` circular-wrap (`start>end` → `substring(start)+
substring(0,end)`); `featureLength` segment-sum vs circular `(seqLen-start)+end`
vs simple; `scorePercent` div-by-zero guard + rounding; `deriveAlignmentState`
(0/1/N records, equal vs unequal aligned lengths, `alignedSequence` preference,
protein flag); `featureCoordPatch` single-segment coord→segments rewrite vs
multi-segment no-clobber, `isCircularWrap = start>end`.

## Coverage gate

Add `src/app/logic/**` to `vite.config.ts` `coverage.include` (`services/**`
already captures the new services modules). Keep `exclude` for
`**/__tests__/**`, `**/*.test.ts`, `**/index.ts`, `**/types.ts`. After each
increment, re-baseline the ratchet thresholds a few points below the new
achieved aggregate (per Phase 1's jitter policy; raise, never lower). The thin
worker/hook/component wiring and GenomeViewer stay **out** of the include.

## Testing & verification

- Node unit tests per module, following Phase-1 quality principles (exact values,
  branch pairs, boundaries, mutation-sensitive assertions).
- After each increment: full CI mirror (`typecheck` → `lint` → `test:coverage`
  → `build`) must be green — `build` passing is the behavior-preserving proof.
- After the tests land: an adversarial verification pass (independent reviewers
  recompute values and mutation-test assertions), as in Phase 1.

## Risks & gotchas (from recon)

1. **Worker import poison:** removing the parsers/search body from the worker
   files also removes the reason they're un-importable, but if any logic stays in
   a worker file that a test must import, guard `self.onmessage` with
   `typeof self !== 'undefined'`. Preferred: leave *no* testable logic in the
   worker files.
2. **Search time budget:** `runSearch`/`executeSearchInline` read `Date.now()`
   for an 1800ms fuzzy / 6000ms exact budget and can `break` early. Tests use
   small inputs so the budget never trips — results stay deterministic. Do not
   assert timing.
3. **Don't re-test `searchLogic`:** `smithWaterman`, `degenerateToRegex`,
   `removeGapsWithMap`, etc. are already Phase-1 covered. Test only the new
   orchestration (strand remap, sort, slice, grouping), not the primitives.
4. **Updater-function capture:** feature reducers pass an updater to `setRecords`.
   Tests capture that function from a `vi.fn()` spy and apply it to a fixture
   prev-state — assert on the result, not on the setter argument.
5. **Keep side-effects in the thin layer:** `alert`, `window.prompt`,
   `FileReader`, `Worker`, `navigator.clipboard`, `setTimeout` stay in the
   hooks/components; the extracted core is pure.
6. **Behavior preservation:** the reducer bodies live inside `setState` updaters
   and memo closures — lifting them changes call sites. Verify identical outputs;
   do not rewrite semantics. `npm run build` + CI mirror green is the gate.
7. **Locale/time flakiness:** avoid asserting on `Date.toLocaleTimeString`
   (`useAppLogger`) or other locale-dependent output.
