# Phase E · Docs & Enforcement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the high-value JSDoc gaps on the now-relocated symbols, fix the flagged comment-policy violations (self-invalidating hedge, refactor-history narration, name-restating docblocks), verify `ARCHITECTURE.md` matches the built tree, and turn on the two enforcement gates — an import-boundary ESLint rule (`domain ← core ← workers/handlers ← app`) and the `max-lines` `error` ceiling at 600. Nothing here changes runtime behavior: every task edits comments or lint config only.

**Architecture:** This is the finishing phase of the restructure described in `docs/superpowers/specs/2026-07-02-architecture-restructure-design.md`. It runs **after Phase C** (`services/` → `src/core/`, worker bodies → `src/workers/handlers/`, `bioUtils` split, `types.ts` shim killed, `@/` paths normalized) **and Phase D** (`GenomeViewer` decomposed under `src/app/viewer/`). All target paths below are the **post-C/D** paths from spec §3; because sibling phases author their own plans, every edit task begins by *locating* the symbol with `rg` and editing whatever file actually holds it (the spec path is the expectation, the located file wins).

**Tech Stack:** TypeScript ~5.9, ESLint 10 flat config + typescript-eslint 8, Vitest 4 (env `node`), `@vitest/coverage-v8`, Vite 6.

## Global Constraints

- **Comment-only / config-only.** No production logic changes. `npm run typecheck`, `npm run test`, `npm run build` output must be byte-identical in behavior before and after each doc task. If adding a doc forces a code change, STOP and report.
- **Comment policy (repo `~/.claude/comments.md` + `CLAUDE.md`).** JSDoc for exported/public API and non-obvious behavior. Document semantics types can't carry — units, coordinate systems, nullability, ranges. Comment the **why**, not the **what**. **No history narration** (no "extracted from…", "matching X's inline calc", "were byte-identical", past-tense edit notes). Don't repeat a type the signature already states (`@param {string}` etc.). Terse trailing comments allowed **only on a declaration** (field/enum/constant) and only if ≤ ~half a line.
- **AGPL header.** Every *new* covered source file (`.ts/.tsx`) must start with the 18-line AGPL header (copy verbatim from `eslint.config.js` lines 1-18 or any existing source file). **Phase E creates no new source files** — all tasks edit existing `.ts/.tsx/.md/.js` files — so this is a no-op guard, but if any new file is introduced it must carry the header (`node scripts/check-license-headers.mjs --fix`).
- **Path-resolution preamble (do this before every edit task).** The symbol's home is decided by Phase C/D. Confirm it: `rg -l -n '<signature-fragment>' src/` (fallback `grep -rn '<fragment>' src/`). Edit the file `rg` reports. The "expected path" in each task is from spec §3; if it differs from reality, note the drift and edit the real file. Never re-create a symbol at the spec path if it already lives elsewhere.
- **Coverage is unaffected.** Comments are not instrumented, and `max-lines`/`max-lines-per-function` use `skipComments: true`, so added JSDoc cannot trip the size guard or move coverage. Do **not** re-baseline thresholds in this phase (no code moves). The final task runs `test:coverage` only to *confirm* the gate stays green.
- **CI mirror.** Doc/comment tasks (1–10) verify with `npm run typecheck` + `npm run lint` (both must exit 0; `lint` 0 = warnings only until Tasks 11–12 promote two rules to errors). Enforcement tasks (11–12) run the full `npm run lint`. The final task (14) runs the full mirror: `typecheck` + `lint` + `test:coverage` + `build`.
- **RTK note:** if `vitest`/tool output looks garbled or truncated, prefix the command with `rtk proxy` (e.g. `rtk proxy npx vitest run`).
- **Branch:** created off the integration branch **after C and D are merged** (`git checkout -b arch/phaseE-docs-enforcement` from `develop`; a `git worktree` is fine). PR targets `develop` (per repo workflow: PRs → develop; main is production).

### Cross-phase dependencies (must hold before this phase can go green)

- **Phase C removed the `core → workers/protocol` inversion.** Today `services/search/exact.ts:26` imports `SearchableRecord` from `../../src/workers/protocol` — a layer inversion (spec §1, §4.2). Phase C must relocate `SearchableRecord` (into `domain` or a core-local shape) so `src/core/search/exact.ts` has **no** workers import (spec §3: "exact.ts, fuzzy.ts — pure primitives, NO protocol import"). Task 11's boundary rule enforces exactly this; if lint flags a surviving `core → workers` import, that is a **Phase C gap — STOP and report**, do not weaken the rule.
- **Phase D landed `GenomeViewer` < 600 lines.** Task 12 flips `max-lines` to `error` at 600; it can only pass if D decomposed the viewer (spec success criteria). If a `max-lines` error remains, D is unfinished — STOP and report.
- **Phase B may own the `types.ts` coordinate docs.** The single highest-value doc (coordinate model in `domain/bio/types.ts`) may have been pulled forward into Phase B. Task 1 is written as *verify-or-add*.
- **Phase 0 authored `ARCHITECTURE.md`, the `dunceious-architecture` skill, and `AGENTS.md`.** Task 13 is a **verification** pass against the built tree, **not** a re-authoring (Phase 0 owns content).

## Target file map (symbol → expected post-C/D path → action)

| Symbol / target | Expected path (spec §3) | Action |
|---|---|---|
| `FeatureSegment`, `BioFeature`, `SeqRecord`, `SearchResult`, `SelectionArea`, `QuantitativeTrack` | `src/domain/bio/types.ts` | coordinate-model JSDoc (verify-or-add) |
| `removeGapsWithMap`, `mapUngappedRangeToAligned` | `src/domain/bio/sequence.ts` | JSDoc |
| non-gap-segment extractor (`getNonGapSegments` ∪ `buildAlignedSegments`) | `src/domain/bio/sequence.ts` or `coordinate.ts` | JSDoc |
| `degenerateToRegex` | `src/core/search/query.ts` | JSDoc |
| `smithWaterman` | `src/core/search/align.ts` | JSDoc |
| `collectSeededFuzzyHits` | `src/core/search/fuzzy.ts` | JSDoc |
| `parseBED` / `parseGFF3` / `parseBedGraph` / `exportToGff` | `src/core/formats/annotations.ts` | replace name-restating docblocks + coordinate/column semantics |
| `exportToGenBank` | `src/core/genbank/serialize.ts` | JSDoc |
| `exportToFasta` | `src/core/formats/fasta.ts` | JSDoc |
| `removeRecordFromProject` / `updateSelectionAfterRecordRemoval` / `sanitizeSearchStateAfterRecordRemoval` | `src/app/logic/recordRemoval.ts` or `src/app/recordRemoval.ts` | JSDoc (nullability/reset) |
| `setTimeout(…,0)` scroll hedge | `src/app/viewer/**` (viewer container or `useViewport.ts`) | replace self-invalidating comment |
| view-model helper docblocks | `src/app/logic/viewModel.ts` | trim history narration |
| `runExactSearch` docblock | `src/core/search/exact.ts` | trim history, keep rationale |
| `runInlineSearch` docblock | `src/app/logic/runInlineSearch.ts` | trim history, keep "NOT merged" rationale |
| `max-lines`, boundary rule | `eslint.config.js` | flip to error + add rule |
| structure reconcile | `ARCHITECTURE.md`, skill, `AGENTS.md` | verify against built tree |

---

## Task 1: Coordinate-model JSDoc on `domain/bio/types.ts` (verify-or-add)

**Highest-value doc target.** The canonical types define the whole app's coordinate model but (pre-Phase-B) carry zero field docs.

**Files:**
- Modify: `src/domain/bio/types.ts`

**Interfaces (final shape):** After Phase A deletes the vestigial `WorkflowStep` / `AlignmentMode` / `AlignmentParams` / `DEFAULT_PARAMS` / `ProjectState` (spec §5 dead code — verified referenced only in `types.ts` + the `domain/bio/index.ts` barrel today), the file holds exactly: `FeatureSegment`, `BioFeature`, `QuantitativeTrack`, `SeqRecord`, `SearchResult`, `SelectionArea`, plus `SearchableRecord` (relocated here by Phase C Task 6 — a minimal projection needing no coordinate JSDoc).

- [ ] **Step 1: Determine whether Phase B already documented the coordinate model**

Run `rg -n '0-based|half-open|wrap-around|reverse/minus' src/domain/bio/types.ts`. If the six load-bearing points below are ALL already documented, this task is **verify-only** — confirm and skip to Step 3. Otherwise ADD the docs in Step 2. The six points that MUST be present:
1. coords are **0-based, half-open `[start, end)`** (start inclusive, end exclusive);
2. `strand` is `1` (forward/plus) or `-1` (reverse/minus);
3. `start > end` on a feature signals a **circular wrap-around** across the origin (`[start, seqLen)` then `[0, end)`);
4. `alignedSequence` vs `sequence` relationship (gapped MSA overlay vs raw ungapped; consumers read `alignedSequence || sequence`);
5. `segments` semantics (sub-ranges for multi-part/spliced features; authoritative pieces when present; top-level `start`/`end` is the envelope);
6. `SearchResult.score` present only for fuzzy hits; its coords are in `alignedSequence || sequence` space.

- [ ] **Step 2: Add the docs (only if missing).** Insert the JSDoc/field comments verbatim. Coordinate/strand/wrap facts are grounded in `coordinate.ts` (`processTransposition` wrap split, `transposeCoordinates`), `viewModel.getDisplaySeq`/`featureLength` (`start > end` handling), and the GFF3/GenBank column math in `annotations.ts` / `serialize.ts` (`col4 - 1`, `f.start + 1`).

```typescript
/**
 * A contiguous sub-range in the app's canonical coordinate model:
 * 0-based, half-open `[start, end)` — `start` inclusive, `end` exclusive.
 */
export interface FeatureSegment {
  start: number; // 0-based, inclusive
  end: number;   // 0-based, exclusive (half-open)
}

/**
 * A sequence annotation. All coordinates are 0-based, half-open `[start, end)`.
 *
 * Circular wrap-around: when `start > end` the feature crosses the sequence
 * origin, spanning `[start, seqLen)` then `[0, end)`.
 */
export interface BioFeature {
  type: string;
  name: string;
  start: number;  // 0-based, inclusive
  end: number;    // 0-based, exclusive; end < start ⇒ circular wrap-around
  strand: 1 | -1; // 1 = forward/plus, -1 = reverse/minus
  color?: string;
  metadata?: Record<string, string>;
  translation?: string;
  /**
   * Sub-ranges for multi-part (spliced / GenBank join) features; each half-open
   * `[start, end)`. Authoritative pieces when present; `start`/`end` above is
   * the overall envelope.
   */
  segments?: FeatureSegment[];
  /** Original source location text (e.g. GenBank join/complement), preserved for round-trip export. */
  locationString?: string;
}

/** Quantitative track. `data` intervals are `[start, end)` 0-based half-open; `kind` = 'line' (bedGraph) or 'interval' (BED). */
export interface QuantitativeTrack {
  id: string;
  name: string;
  kind?: 'line' | 'interval';
  data: { start: number; end: number; value: number }[];
  color?: string;
}

export interface SeqRecord {
  id: string;
  name: string;
  definition?: string;
  accession?: string;
  /** Raw, ungapped residue string — the coordinate space for features when no alignment is loaded. */
  sequence: string;
  moleculeType?: 'dna' | 'rna' | 'protein'; // governs reverse-strand search & translation availability
  features: BioFeature[];
  tracks?: QuantitativeTrack[];
  /**
   * Gapped multiple-alignment overlay (contains '-'): the same residues in the
   * same order as `sequence` with alignment gaps inserted. When present, feature
   * coordinates are transposed into this space (see `processTransposition`), and
   * consumers read `alignedSequence || sequence`.
   */
  alignedSequence?: string;
  isCircular?: boolean; // sequence is circular; origin wrap-around allowed
  metadata?: Record<string, any>;
  visible?: boolean;
}

/** A search hit, in `alignedSequence || sequence` coordinate space. */
export interface SearchResult {
  start: number;  // 0-based, inclusive
  end: number;    // 0-based, exclusive
  sequence: string;
  recordId: string;
  strand: 1 | -1; // 1 = forward match, -1 = reverse-complement match
  score?: number; // present only for fuzzy (Smith-Waterman) hits
  segments?: FeatureSegment[]; // non-gap sub-ranges of the match
}

/** A selected window `[start, end)` (0-based half-open) spanning the listed records. */
export interface SelectionArea {
  start: number;
  end: number;
  recordIds: string[];
}
```

- [ ] **Step 3: Verify** — `npm run typecheck > /dev/null 2>&1; echo "tc=$?"` → `0`; `npm run lint > /dev/null 2>&1; echo "lint=$?"` → `0`.
- [ ] **Step 4: Commit**

```bash
git add src/domain/bio/types.ts
git commit -m "docs(domain): document the 0-based half-open coordinate model on bio types"
```

---

## Task 2: JSDoc on the domain gap/coordinate helpers

**Files:**
- Modify: `src/domain/bio/sequence.ts` (and/or `src/domain/bio/coordinate.ts` — locate first)

**Interfaces (locate before editing):**
- `rg -n 'export (function|const) removeGapsWithMap|mapUngappedRangeToAligned' src/domain` → expected `src/domain/bio/sequence.ts`.
- Non-gap-segment extractor: Phase B consolidates the byte-identical `getNonGapSegments` (was `services/searchLogic.ts`) and `buildAlignedSegments` (was `coordinate.ts`) into ONE (spec §5). Locate the survivor: `rg -n 'export (const|function) (getNonGapSegments|buildAlignedSegments)' src/domain`. Document whichever name/home survives.

- [ ] **Step 1: `removeGapsWithMap`** — add above the export:

```typescript
/**
 * Strips alignment gaps ('-') from a sequence, returning the ungapped string
 * plus `map`, where `map[i]` is the aligned-space index of the i-th ungapped
 * residue. Inverse of `mapUngappedRangeToAligned`.
 */
```

- [ ] **Step 2: `mapUngappedRangeToAligned`** — add above the export:

```typescript
/**
 * Maps an ungapped-space half-open range `[start, end)` back to aligned-space
 * coordinates using a `map` from `removeGapsWithMap`. `start`/`end` are clamped
 * into range; the aligned end is exclusive (last mapped index + 1). Returns
 * `{ start: 0, end: 0 }` for an empty map.
 */
```

- [ ] **Step 3: non-gap-segment extractor** — ensure it carries JSDoc (Phase B may have preserved `buildAlignedSegments`'s existing docblock; if the survivor is unnamed/undocumented, add):

```typescript
/**
 * Splits an aligned-space range `[start, end)` (0-based half-open) into its
 * non-gap sub-segments, dropping runs of '-'. Each returned segment is
 * `[start, end)` in aligned space; used so rendered features skip gaps inserted
 * by other sequences in the alignment.
 */
```

- [ ] **Step 4: Verify** — `npm run typecheck`/`npm run lint` both exit `0`.
- [ ] **Step 5: Commit**

```bash
git add src/domain/bio/sequence.ts src/domain/bio/coordinate.ts
git commit -m "docs(domain): document gap↔ungapped mapping and non-gap segment helpers"
```

---

## Task 3: JSDoc on the core search primitives (`query.ts`, `align.ts`)

**Files:**
- Modify: `src/core/search/query.ts` (`degenerateToRegex`), `src/core/search/align.ts` (`smithWaterman`)

**Locate:** `rg -n 'export function degenerateToRegex' src/core` and `rg -n 'export function smithWaterman' src/core`.

- [ ] **Step 1: `degenerateToRegex`** — add/replace the docblock. Semantics verified from source (`if (!query) return /$.^/`, IUPAC/protein maps, `.join('-*')`, `new RegExp(pattern, 'gi')`):

```typescript
/**
 * Compiles a degenerate (IUPAC) query into a search regex.
 *
 * - An empty query returns a **never-match** regex (`/$.^/`).
 * - `moleculeType` selects the ambiguity map: nucleotide IUPAC codes
 *   (`N`→`[ACGT]`, `R`→`[AG]`, …) or protein codes (`B`→`[DN]`, `X`→any AA, …).
 * - Residues are joined with `-*` so matches tolerate alignment gaps between
 *   them; the regex is **global + case-insensitive** (`gi`).
 */
```

- [ ] **Step 2: `smithWaterman`** — replace the current terse docblock with the load-bearing contract (defaults, units, threshold, coord convention, fallback, cap):

```typescript
/**
 * Local alignment (Smith-Waterman with affine gaps, Gotoh) of `query` against
 * `target`, using `Int32Array` matrices.
 *
 * Scoring (points; defaults): `matchScore = 2`, `mismatchPenalty = -1`,
 * `gapOpen = -3`, `gapExtend = -1`. `minScore` (default 5) is the inclusive
 * threshold below which no hits are returned. Hits use 0-based half-open
 * `[start, end)` coordinates in `target` space.
 *
 * For very large targets (matrix > 600k cells) it falls back to a fast,
 * time-bounded ungapped scan. Either path returns at most 20 non-overlapping
 * hits, best-score first.
 */
```

- [ ] **Step 3: Verify** — `typecheck`/`lint` exit `0`.
- [ ] **Step 4: Commit**

```bash
git add src/core/search/query.ts src/core/search/align.ts
git commit -m "docs(core): document degenerateToRegex and smithWaterman contracts"
```

---

## Task 4: JSDoc on `collectSeededFuzzyHits` (`core/search/fuzzy.ts`)

**Files:**
- Modify: `src/core/search/fuzzy.ts`

**Locate:** `rg -n 'export function collectSeededFuzzyHits' src/core/search` → expected `src/core/search/fuzzy.ts`.

- [ ] **Step 1:** Add above the export. Semantics verified from source (`seedLen = max(2, min(6, floor(queryLen/4)||2))`, 256-window cap, empty-seed → full-ungapped fallback, dedup by aligned coords):

```typescript
/**
 * Seeded fuzzy search of one strand of one record: finds short exact seeds of
 * the query, runs `smithWaterman` only inside gap-mapped candidate windows
 * around each seed, and returns de-duplicated hits in aligned-space `[start,
 * end)` coordinates tagged with `recordId`/`strand`.
 *
 * Seed length scales with the query (2–6). The candidate-window set is capped at
 * 256; when no seed matches, it falls back to a single full-length ungapped
 * window so the search never silently returns nothing. `minScore` is forwarded
 * to `smithWaterman`.
 */
```

- [ ] **Step 2: Verify** — `typecheck`/`lint` exit `0`.
- [ ] **Step 3: Commit**

```bash
git add src/core/search/fuzzy.ts
git commit -m "docs(core): document collectSeededFuzzyHits seeding/windowing"
```

---

## Task 5: Coordinate/column semantics on the annotation parsers (`core/formats/annotations.ts`)

Replace the three name-restating docblocks (`Parses BED content.` / `Parses GFF3 content.` / `Parses BedGraph content.`) with the load-bearing column/coordinate semantics, and add JSDoc to `exportToGff`.

**Files:**
- Modify: `src/core/formats/annotations.ts`

**Locate:** `rg -n 'Parses BED content|Parses GFF3 content|Parses BedGraph content|export const exportToGff' src/core/formats/annotations.ts`.

- [ ] **Step 1: `parseBED`** — replace `/**\n * Parses BED content.\n */` with:

```typescript
/**
 * Parses BED into per-chromosome interval tracks.
 *
 * BED is 0-based half-open: col2 chromStart (inclusive) and col3 chromEnd
 * (exclusive) are used verbatim as `[start, end)` — no ±1 adjustment. Score is
 * read from column index 4 (the BED `score`/5th field) via `parseFloat`; a
 * missing/NaN score defaults to **0** (contrast bedGraph, which skips NaN). The
 * `name` column is ignored. Rows with < 3 columns or NaN coords are skipped, as
 * are `#`/`track`/`browser` header lines. One 'interval' track is reused per
 * (chrom, filename).
 */
```

- [ ] **Step 2: `parseGFF3`** — replace `/**\n * Parses GFF3 content.\n */` with:

```typescript
/**
 * Parses GFF3 into per-seqid `BioFeature[]`.
 *
 * GFF3 is 1-based, fully closed; converted to the app's 0-based half-open model
 * by `start = col4 - 1` and `end = col5` (a 1-based inclusive end equals a
 * 0-based exclusive end, so col5 is used unchanged). strand col7 `-`→ -1 else 1.
 * Name resolves from attribute `Name`, else `ID`, else `${type}_${start + 1}`.
 * A `.` score (col6) is omitted from metadata; other scores are kept as strings.
 * Attribute values are URL-decoded. Rows with < 9 tab-separated columns skipped.
 */
```

- [ ] **Step 3: `parseBedGraph`** — replace `/**\n * Parses BedGraph content.\n */` with:

```typescript
/**
 * Parses bedGraph into per-chromosome 'line' tracks.
 *
 * Coordinates are 0-based half-open (col2 start inclusive, col3 end exclusive),
 * used verbatim. The value (column index 3, the 4th field) is `parseFloat`d;
 * unlike BED, a **NaN value skips the row** (no default-to-0). Rows with < 4
 * columns are skipped; `#`/`track`/`browser` header lines ignored.
 */
```

- [ ] **Step 4: `exportToGff`** (moved into this file per spec §3) — add above the export:

```typescript
/**
 * Serializes records' features to GFF3. Converts the app's 0-based half-open
 * coords back to GFF3's 1-based fully-closed convention: `start = f.start + 1`,
 * `end = f.end` (unchanged). strand 1 → `+`, -1 → `-`; the source column is
 * stamped `Dunceious`; `ID`/`Name` derive from `f.name` (spaces → `_` in `ID`).
 */
```

- [ ] **Step 5: Verify** — `typecheck`/`lint` exit `0`.
- [ ] **Step 6: Commit**

```bash
git add src/core/formats/annotations.ts
git commit -m "docs(core): document BED/GFF3/bedGraph coordinate systems and GFF3 export"
```

---

## Task 6: JSDoc on the export serializers (`serialize.ts`, `formats/fasta.ts`)

**Files:**
- Modify: `src/core/genbank/serialize.ts` (`exportToGenBank`), `src/core/formats/fasta.ts` (`exportToFasta`)

**Locate:** `rg -n 'export const exportToGenBank' src/core/genbank` and `rg -n 'export const exportToFasta' src/core/formats`.

- [ ] **Step 1: `exportToGenBank`** — add above the export (the inline `// LOCUS …` / `// DEFINITION …` comments in the body already carry per-line rationale; this documents the function contract):

```typescript
/**
 * Serializes records to GenBank flat-file text.
 *
 * Reconstructs 1-based coordinates from the 0-based half-open model for FEATURES
 * locations (`f.start + 1..f.end`), preferring a preserved `locationString`
 * (keeps partial/join syntax). The DEFINITION line is stamped with the
 * ` Exported by Dunceious.` marker, stripping any pre-existing copy first so
 * repeated exports don't accumulate duplicates. The LOCUS line differs by
 * molecule type: protein records use the `aa` unit and omit the molecule-type
 * field; others use `bp`/`DNA`. Metadata keys prefixed with `_` are internal and
 * omitted as qualifiers. ORIGIN lowercases the sequence, 60 chars/line grouped
 * by 10 with a 1-based position gutter.
 */
```

- [ ] **Step 2: `exportToFasta`** — add above the export:

```typescript
/**
 * Serializes records to FASTA, using `alignedSequence || sequence`.
 *
 * When both `start` and `end` are given, emits only the half-open slice
 * `[start, end)` (clamped to the sequence bounds) and annotates the header with
 * a `[Slice: start-end]` tag; otherwise the full sequence. Wrapped at 60
 * chars/line.
 */
```

- [ ] **Step 3: Verify** — `typecheck`/`lint` exit `0`.
- [ ] **Step 4: Commit**

```bash
git add src/core/genbank/serialize.ts src/core/formats/fasta.ts
git commit -m "docs(core): document GenBank/FASTA serializer coordinate reconstruction"
```

---

## Task 7: JSDoc on the `recordRemoval` exports (nullability / reset contracts)

**Files:**
- Modify: `src/app/logic/recordRemoval.ts` **or** `src/app/recordRemoval.ts` (locate)

**Locate:** `rg -l 'sanitizeSearchStateAfterRecordRemoval' src/app` (spec §3 lists `recordRemoval` under `app/logic/`; Phase C may move it there — edit the located file).

- [ ] **Step 1: `removeRecordFromProject`** — add above the export:

```typescript
/** Returns a new records array with `recordId` removed; the input is not mutated. */
```

- [ ] **Step 2: `updateSelectionAfterRecordRemoval`** — add above the export:

```typescript
/**
 * Recomputes the active selection after a record is removed.
 *
 * Returns `null` when there is no active selection, or when dropping this record
 * empties the selection's `recordIds`. Returns the SAME selection reference
 * unchanged when the record was not part of it. Otherwise returns a new
 * selection with the record removed from `recordIds`.
 */
```

- [ ] **Step 3: `sanitizeSearchStateAfterRecordRemoval`** — add above the export:

```typescript
/**
 * Purges search state that referenced a removed record.
 *
 * Drops selected-search indices whose result belongs to `recordId`. Resets
 * `currentSearchIdx` to `-1` when it is out of range (`< 0` or `>=
 * filteredResults.length`) OR points at a result on the removed record;
 * otherwise it is kept. `filteredResults` must be the post-removal results the
 * indices refer to.
 */
```

- [ ] **Step 4: Verify** — `typecheck`/`lint` exit `0`.
- [ ] **Step 5: Commit**

```bash
git add src/app/logic/recordRemoval.ts src/app/recordRemoval.ts 2>/dev/null || git add "$(rg -l sanitizeSearchStateAfterRecordRemoval src/app)"
git commit -m "docs(app): document recordRemoval nullability and search-index reset contracts"
```

---

## Task 8: Replace the self-invalidating scroll comment (viewer)

**Files:**
- Modify: the viewer file that owns the zoom handler (post-D: the viewer container or `src/app/viewer/useViewport.ts`)

**Locate:** `rg -n 'scrollLeft = newScroll' src/app/viewer` — the hedging comment sits directly above the `setTimeout(() => { … scrollLeft = newScroll … }, 0)` inside the zoom handler.

- [ ] **Step 1:** Replace the three-line self-invalidating/hedging comment —

```
// We can't set scrollLeft directly here because it might trigger a render loop
// if not careful, but since it's a ref it's usually fine.
// However, it's better to do it in a useEffect or after state update.
```

— with the real reason for the `setTimeout(…, 0)`:

```
// Defer to a later task so React first commits the new zoom level: chartWidth
// scales with zoomLevel, so the scroll container only reaches `newScroll` once
// the wider content has rendered. Setting scrollLeft synchronously here would
// clamp it to the old (smaller) width and lose the zoom-to-cursor anchor.
```

- [ ] **Step 2: Verify** — `typecheck`/`lint` exit `0`.
- [ ] **Step 3: Commit**

```bash
git add "$(rg -l 'scrollLeft = newScroll' src/app/viewer)"
git commit -m "docs(viewer): replace hedging scroll comment with the real setTimeout rationale"
```

---

## Task 9: Trim refactor-history narration in `viewModel.ts`

Keep the genuine behavioral rationale; delete the "extracted from…" / "matching X's inline calc" / "…verbatim" history (comment policy: no history narration).

**Files:**
- Modify: `src/app/logic/viewModel.ts`

**Locate:** `rg -n 'Extracted verbatim|extracted verbatim|inline calc|derivations verbatim' src/app/logic/viewModel.ts`.

- [ ] **Step 1: `getDisplaySeq`** — delete the sentence `Extracted verbatim from RecordDetailsModal's inline \`getDisplaySeq\`.` (keep the "With no feature… / normal / circular wrap-around" body).
- [ ] **Step 2: `featureLength`** — change `The displayed length (in bp) of a feature, matching DatabaseHubPanel's inline calc.` to `The displayed length (in bp) of a feature.` (keep the priority/wrap-around body).
- [ ] **Step 3: `scorePercent`** — delete `, matching SearchPanel's inline calc` (keep the divide-by-zero guard rationale).
- [ ] **Step 4: `deriveAlignmentState`** — change `combining the three inline \`useMemo\` derivations verbatim:` to `deriving:` (keep the three enumerated semantics: `isAlignmentLoaded`, `alignmentLength`, `sessionMoleculeType`).
- [ ] **Step 5: `featureCoordPatch`** — delete `, extracted verbatim from its two \`onChange\` handlers` (keep the segments-rebuild rule and the `NaN`-stored-as-is note).
- [ ] **Step 6: Verify** — `typecheck`/`lint` exit `0`.
- [ ] **Step 7: Commit**

```bash
git add src/app/logic/viewModel.ts
git commit -m "docs(app): drop refactor-history narration from view-model helper docs"
```

---

## Task 10: Trim history from the search docblocks (`exact.ts`, `runInlineSearch.ts`)

Drop the "extracted from…" / "were byte-identical" history; **keep** the design rationale (including the "intentionally NOT merged" note).

**Files:**
- Modify: `src/core/search/exact.ts` (`runExactSearch`), `src/app/logic/runInlineSearch.ts` (`runInlineSearch`)

**Locate:** `rg -n 'byte-identical|extracted from useSearchWorker|intentionally NOT merged' src`.

- [ ] **Step 1: `runExactSearch`** — replace the opening two sentences

```
 * Shared verbatim between the search worker (`runSearch`) and the inline
 * fallback (`runInlineSearch`); the exact *matching loops* were byte-identical
 * in both callers — they differed only in how `seq` was derived before being
 * passed in.
```

with the non-historical rationale:

```
 * Shared by the search worker (`runSearch`) and the inline fallback
 * (`runInlineSearch`); they differ only in how `seq` is derived before it is
 * passed in.
```

Keep the rest verbatim (forward index / reverse remap `start = L - rcEnd`, protein skips reverse, `lastIndex = index + 1` overlaps, results returned unsorted).

- [ ] **Step 2: `runInlineSearch`** — change the summary line `Synchronous inline search fallback (extracted from useSearchWorker).` to `Synchronous inline search fallback used when the Web Worker is unavailable.` Keep the body verbatim — the "a lighter, distinct strategy from the worker's seeded `collectSeededFuzzyHits` — **intentionally NOT merged**" rationale and the 1800ms time-budget determinism note stay. (The inner block comment at the `runExactSearch` delegation about the non-manifesting empty-`alignedSequence` edge case is genuine rationale — leave it.)
- [ ] **Step 3: Verify** — `typecheck`/`lint` exit `0`.
- [ ] **Step 4: Commit**

```bash
git add src/core/search/exact.ts src/app/logic/runInlineSearch.ts
git commit -m "docs(search): drop extraction history, keep the design rationale"
```

---

## Task 11: Add the import-boundary ESLint rule

Encode `domain ← core ← workers/handlers ← app` (spec §4): a layer may import its own layer and layers **below** it, never above.

**Decision (see keyDecisions):** use the built-in **`no-restricted-imports`** rule via per-layer flat-config `files` overrides. This adds **zero dependencies** and is guaranteed ESLint-10-compatible. It matches the import **specifier string**, which works because Phase C normalizes all cross-layer imports to the `@/…` alias (`tsconfig.json` maps `@/*` → `./*`, so cross-layer imports read `@/src/<layer>/…`). `eslint-plugin-boundaries` / `import/no-restricted-paths` (spec §4.6's named options) were considered but declined: both resolve the import to a file to classify it, which for the `@/` alias needs an extra TS-path resolver (`eslint-import-resolver-typescript`, and `eslint-plugin-import`'s ESLint-10 flat-config support is unverified in this environment) — i.e. 1–2 new deps and compat risk for no added safety here.

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Add three layer-override blocks** to the `tseslint.config(...)` array, immediately **before** the final `{ ignores: [...] }` block (order matters — later blocks refine earlier ones). Tests are exempt (not production layer code). Match both `@/src/<layer>/…` and `@/<layer>/…` (in case Phase C re-aliases `@`→`src`) plus a `**/src/<layer>/**` fallback:

```javascript
  // --- Layer import boundaries: domain ← core ← workers/handlers ← app ---
  // A layer may import its own layer and layers below it, never above.
  // Cross-layer imports use the `@/` alias (normalized in Phase C), so matching
  // the specifier string is sufficient. Tests are exempt.
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@/src/core/*', '@/src/core/**', '@/core/*', '@/core/**', '**/src/core/**',
                  '@/src/workers/*', '@/src/workers/**', '@/workers/*', '@/workers/**', '**/src/workers/**',
                  '@/src/app/*', '@/src/app/**', '@/app/*', '@/app/**', '**/src/app/**'],
          message: 'Layer rule: domain may import only domain (not core/workers/app).' },
      ] }],
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@/src/workers/*', '@/src/workers/**', '@/workers/*', '@/workers/**', '**/src/workers/**',
                  '@/src/app/*', '@/src/app/**', '@/app/*', '@/app/**', '**/src/app/**'],
          message: 'Layer rule: core may import only domain + core (not workers/app).' },
      ] }],
    },
  },
  {
    files: ['src/workers/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@/src/app/*', '@/src/app/**', '@/app/*', '@/app/**', '**/src/app/**'],
          message: 'Layer rule: workers may import domain + core + workers (not app).' },
      ] }],
    },
  },
```

- [ ] **Step 2: Run the full lint and read the boundary findings**

```bash
npm run lint > /dev/null 2>&1; echo "lint=$?"
```
Expect `0`. If the boundary rule reports errors:
- A `core → workers` (e.g. `src/core/search/exact.ts` importing `SearchableRecord` from workers/protocol) or `domain → *` violation means a **sibling phase left an inversion** — this is the very smell Phase C was to remove. **STOP and report** (do not relax the rule). See Cross-phase dependencies.
- A false positive on a legitimate **same-layer** or **downward** import means a pattern is too broad — tighten the offending `group` entry (never add a blanket disable), then re-run.

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore(eslint): enforce domain←core←workers←app import boundaries"
```

---

## Task 12: Flip `max-lines` to error at 600; reassess `max-lines-per-function`

**Files:**
- Modify: `eslint.config.js`

Context (verified pre-refactor): only `components/GenomeViewer.tsx` trips `max-lines` (>400); every other source file is ≤ 444 raw lines. Phase D decomposes the viewer under 600. `max-lines-per-function` currently has 28 warnings, dominated by React component/hook function bodies (App, Sidebar, DatabaseHubPanel, SearchPanel, FeatureEditorModal, RecordDetailsModal, TopNav, all hooks) and `smithWaterman` — these legitimately exceed a hard function-line cap.

- [ ] **Step 1: Flip `max-lines` to `error` at 600.** Change

```javascript
      'max-lines': [
        'warn',
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
```

to

```javascript
      'max-lines': [
        'error',
        { max: 600, skipBlankLines: true, skipComments: true },
      ],
```

- [ ] **Step 2: Reassess `max-lines-per-function` — keep it `warn`.** Leave the rule at `['warn', { max: 80, … }]`. Do **not** promote it to `error`: React component/render bodies and the `smithWaterman` kernel routinely exceed a hard function-line cap, and Phase D only reshaped the viewer (Sidebar/DatabaseHubPanel/App remain single large component functions). The file-level 600 ceiling is the active hard guard. Update the stale comment block above these rules so it reflects reality (drop "(not yet active)" and the "Phase 2-3" wording); state that `max-lines` errors at 600 and `max-lines-per-function` intentionally stays a warning for React component bodies.

- [ ] **Step 3: Confirm zero `max-lines` violations remain**

```bash
npx eslint . -f json -o /tmp/phaseE-eslint.json 2>/dev/null
node -e 'const d=require("/tmp/phaseE-eslint.json");let e=0,f=[];for(const x of d)for(const m of x.messages){if(m.ruleId==="max-lines"&&m.severity===2){e++;f.push(x.filePath+":"+m.line)}}console.log("max-lines errors:",e,f.join(", "))'
npm run lint > /dev/null 2>&1; echo "lint=$?"
```
`max-lines errors: 0` and `lint=0` are required. If a `max-lines` error remains, **Phase D is unfinished — STOP and report** (do not raise the ceiling).

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js
git commit -m "chore(eslint): enforce max-lines error at 600; keep per-function guard as warn"
```

---

## Task 13: Verify `ARCHITECTURE.md` + skill + `AGENTS.md` match the built tree

**Verification pass only — Phase 0 owns the content.** Confirm the target-state docs Phase 0 authored now match the actually-built tree; fix only concrete drift you find (a wrong path, a stale symbol name), do not re-author.

**Files (read/verify; edit only on confirmed drift):**
- `ARCHITECTURE.md`, `.claude/skills/dunceious-architecture/SKILL.md` (+ `references/`), `AGENTS.md`

- [ ] **Step 1: Cross-check the folder-structure section of `ARCHITECTURE.md` against reality**

```bash
rg -n 'services/|components/GenomeViewer|types\.ts|src/core|src/workers/handlers|src/app/viewer' ARCHITECTURE.md
test -d src/core && test -d src/workers/handlers && test -d src/app/viewer && echo "layers present"
test ! -d services && test ! -d components && test ! -f types.ts && echo "root debt removed"
```
Every path the doc names must exist; `services/`, root `components/`, and root `types.ts` must be **gone** (spec §9). If the doc still shows the old root layout or references `uniquifyId()` (renamed `makeUniqueId`) or calls the modular structure "complete" (spec §5 doc-drift; Phase 0 should have removed these), fix the specific lines.

- [ ] **Step 2: Verify the skill + `AGENTS.md` are doorways that point at `ARCHITECTURE.md`** (not drifted copies)

```bash
test -f AGENTS.md && rg -n 'ARCHITECTURE.md' AGENTS.md
test -f .claude/skills/dunceious-architecture/SKILL.md && rg -n 'ARCHITECTURE.md|domain|core|workers|app' .claude/skills/dunceious-architecture/SKILL.md
```
Both must exist (Phase 0 deliverables) and reference `ARCHITECTURE.md` / the layer names. Confirm the layer taxonomy they state matches spec §4. Fix only concrete pointer/path errors.

- [ ] **Step 3: If any file was edited, commit** (skip if pure verification found nothing)

```bash
git add ARCHITECTURE.md AGENTS.md .claude/skills/dunceious-architecture/ 2>/dev/null
git commit -m "docs(arch): reconcile ARCHITECTURE/skill/AGENTS pointers with the built tree" || echo "no drift to fix"
```

---

## Task 14: Full CI mirror, then open the PR

**Files:**
- (none — verification + PR)

- [ ] **Step 1: Full CI mirror** — all four must be `0` (`lint` now includes the two promoted rules):

```bash
npm run typecheck > /dev/null 2>&1; echo "typecheck=$?"
npm run lint > /dev/null 2>&1; echo "lint=$?"
npm run lint:headers > /dev/null 2>&1; echo "headers=$?"
rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "coverage=$?"
npm run build > /dev/null 2>&1; echo "build=$?"
```
Coverage must pass **without** threshold changes (no code moved; comments are not instrumented). Test count must be ≥ the pre-phase count (spec §9). If coverage fails, do NOT lower thresholds — investigate (something other than a comment changed) and report.

- [ ] **Step 2: Push + open PR (base `develop`)**

```bash
git push -u origin arch/phaseE-docs-enforcement
gh pr create --base develop \
  --title "docs+chore: Phase E — high-value JSDoc, comment-policy fixes, boundary + size enforcement" \
  --body "Closes the coordinate-model/serializer/search JSDoc gaps on the relocated symbols, fixes the flagged comment-policy violations (self-invalidating scroll hedge, refactor-history narration, name-restating docblocks), verifies ARCHITECTURE.md/skill/AGENTS.md match the built tree, and turns on enforcement: an import-boundary ESLint rule (domain←core←workers←app) and max-lines error at 600. Comment/config-only; no runtime behavior change. Depends on Phases C and D. See docs/superpowers/specs/2026-07-02-architecture-restructure-design.md and docs/superpowers/plans/2026-07-02-arch-phaseE-docs-enforcement.md."
```

---

## Self-review

- **Spec coverage:** every Phase-E item in spec §5 (JSDoc gaps: `types.ts` coordinate model, search gap/coordinate helpers, `annotations` coordinate systems, `recordRemoval` nullability, export serializers) → Tasks 1–7; comment-policy violations (`GenomeViewer:1130`, `viewModel.ts`, `exact.ts`/`runInlineSearch.ts`, `annotations.ts` name-restating) → Tasks 5, 8–10; enforcement (boundary rule, `max-lines` error@600) → Tasks 11–12; `ARCHITECTURE.md`/skill/`AGENTS.md` reconcile → Task 13. Scope stays in-lane: no code moved, no new modules (those are C/D).
- **Post-C/D paths:** every edit task opens with an `rg` locate step and treats the spec §3 path as the expectation, so it survives whatever exact homes the sibling-phase plans chose. Ambiguous homes (non-gap-segment survivor, `recordRemoval`, the viewer file that got the zoom handler) are located, not assumed.
- **Behavior preservation:** comment/config-only. Typecheck + build stay green as proof; coverage is confirmed unchanged (comments not instrumented; `skipComments: true`).
- **Enforcement is honest:** Task 11 enforces the exact inversion Phase C must have removed (`core → workers`) and Task 12 enforces the size ceiling Phase D must have achieved — each STOPS-and-reports rather than weakening the gate if a sibling phase left work undone. `max-lines-per-function` is reassessed and deliberately kept a warning (React component bodies), not blindly flipped.
- **Dependency choice:** boundary enforcement via built-in `no-restricted-imports` (zero new deps, ESLint-10-safe), with the plugin alternatives explicitly evaluated and declined; recorded in keyDecisions and the task body.
- **No placeholders:** all JSDoc/comment bodies are given in full; the two ranges referenced by "replace X with Y" cite exact current text verified in the repo. AGPL-header rule noted in Global Constraints (Phase E adds no new source files).
