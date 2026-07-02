# Phase A · Dedupe & Dead-Code Removal (in place)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink the code surface *in place* — delete verified-dead types/re-exports, kill the `clipInterval` name-collision bug trap, adopt the canonical `splitWrapAround` over its two inline copies, collapse three duplicate type declarations to one canonical home each, and remove the internal `GenomeViewer` duplication (`brokenFeatureMap` memo + CDS/ORF literal). **No files move folders and no new modules are created** — that is Phases B (`domain/bio/sequence.ts`) and C (`services/` → `src/core/`). Every change is behavior-preserving and each task ends green.

**Architecture:** Nothing relocates. This phase edits existing files only. It removes ambiguity (one `clipInterval`, one `SearchResult` / `SearchOptions` / FASTA-record type) and dead weight before B/C move things, so the later relocations carry less. The canonical homes are already the ones the spec locks: model types in `src/domain/bio/types.ts`; wire contracts in `src/workers/protocol.ts`; the one absolute-coordinate `clipInterval` + `splitWrapAround` in `src/domain/bio/intervals.ts`.

**Tech Stack:** TypeScript (`isolatedModules: true`, `verbatimModuleSyntax` off), Vitest (env `node`), `@vitest/coverage-v8`, ESLint, Vite build.

## Global Constraints

- **Behavior-preserving.** Every edit here is a rename / deletion of unreferenced code / adoption of an equivalent helper / type re-export. No logic changes. If a test cannot pass after an edit, recompute the expected value from source; if the code is genuinely wrong, STOP and report — do not weaken a test or "fix" logic in this phase.
- **No new folders/modules.** Only existing files are edited or have lines deleted.
- **AGPL header:** Phase A creates **no new source files**, so the header rule does not trigger. Do **not** touch or reformat the existing 18-line header on any edited file. (If, unexpectedly, you must create a covered `.ts/.tsx` file, prepend the 18-line AGPL header identical to `services/bioUtils.ts` lines 1-18, or run `node scripts/check-license-headers.mjs --fix`.)
- **CI mirror after each task** — all four must be green:
  - `npm run typecheck > /dev/null 2>&1; echo "tc=$?"` → `0`
  - `npm run lint > /dev/null 2>&1; echo "lint=$?"` → `0` (warnings allowed; `max-lines` is still `warn` in this phase)
  - `rtk proxy npx vitest run` → all pass (equivalently `npm run test`)
  - `npm run build > /dev/null 2>&1; echo "build=$?"` → `0` (proves worker/Vite wiring survives)
- **Coverage gate** (`vite.config.ts`, thresholds `lines 94 / branches 85 / functions 93 / statements 92`; `include` = `services/**`, `src/app/recordRemoval.ts`, `src/app/logic/**`, `src/domain/**`; `**/types.ts` and `**/index.ts` are **excluded**): Phase A does not move code between `include` scopes, so the gate follows the code automatically. Deletions of dead **types** land in files that are coverage-excluded (`types.ts`) or type-only, so they don't move the needle. Re-baseline (raise only, never lower) in the final task **only if** achieved climbs; a metric *dropping below* threshold means a real regression — STOP and report.
- **RTK note:** if `vitest`/tool output looks garbled or truncated, prefix the command with `rtk proxy`.

## NOT in this phase (avoid overlap with sibling phases)

- **`reverseComplement` dedup** — byte-identical in `services/bioUtils.ts:321` and `services/searchLogic.ts:73`. Consolidated in **Phase B** (`domain/bio/sequence.ts`). Do not touch here.
- **Molecule-type *detection* dedup** — the divergent `detectMoleculeType` / `sniffFastaCategory` / `sniffGenBankCategory` / GenBank-header impls are **Phase B**. Do not touch here.
- **"is-protein session" helper** — computed at `useSearchWorker.ts:104` and `useFileHandlers.ts:91` (and *consumed* as a param at `viewModel.ts:98`). This is session-level molecule aggregation, and the design spec (§3) locks a `sessionMoleculeType` helper into **Phase B**'s `domain/bio/sequence.ts`. **DECISION: the `isProteinSession`/`sessionMoleculeType` consolidation is OWNED and IMPLEMENTED by Phase B** (it needs the new `src/domain/bio/sequence.ts` home) — introducing a helper here would only be relocated by B, and it sits squarely in B's molecule-type territory. Phase A does not touch it. (See "Corrections to spec" — this is 2 computations + 1 consumer, not 3 computations.)
- **`bioUtils.ts` split, worker-body relocation, `types.ts` shim removal, `@/` path normalization** — Phase C.
- **Full `GenomeViewer` decomposition** — Phase D. This phase only removes the *internal* duplication.

## File touch map

| File | Change | Task |
|---|---|---|
| `src/domain/bio/types.ts` | delete `WorkflowStep` / `AlignmentMode` / `AlignmentParams` / `DEFAULT_PARAMS` / `ProjectState` | 1 |
| `src/domain/bio/index.ts` | drop the 4 dead names from the `export type {…}` block | 1 |
| `services/bioUtils.ts` | delete `makeUniqueId` re-export (L22); rename `clipInterval`→`clipAndRebaseInterval`; adopt `splitWrapAround` in `extractCodingSequence` | 2, 3, 4 |
| `services/__tests__/idHelpers.test.ts` | redirect `makeUniqueId` import to `../idHelpers` | 2 |
| `services/__tests__/selectionExport.test.ts` | rename `clipInterval`→`clipAndRebaseInterval` (import + call sites) | 3 |
| `src/domain/bio/coordinate.ts` | adopt `splitWrapAround` in `processTransposition` | 4 |
| `services/searchLogic.ts` | replace local `SearchResult` interface with a re-export of the domain type | 5 |
| `src/app/hooks/useSearchWorker.ts` | import + re-export `SearchOptions` from protocol (drop local interface) | 6 |
| `src/workers/protocol.ts` | add `FastaAlignedRecord` alias; use it in `ParseFastaSuccessResponse` | 7 |
| `src/app/logic/bioResponse.ts` | import + re-export `FastaAlignedRecord` from protocol (drop local alias) | 7 |
| `components/GenomeViewer.tsx` | add `CDS_ORF_TYPES` const + `computeBrokenFeatureMap` helper; route both memos + the L298 filter through them | 8 |
| `vite.config.ts` | coverage re-baseline (raise-only, likely no-op) | 9 |

**Setup:** branch off `develop` (integration branch per repo workflow): `git switch develop && git switch -c arch-phaseA-dedupe-deadcode`. Commit per task; open the PR in Task 9.

---

## Task 1: Delete vestigial alignment / project types from the domain

Verified dead: `AlignmentParams`, `AlignmentMode`, `DEFAULT_PARAMS`, `WorkflowStep`, `ProjectState` appear **only** in their own declarations (`types.ts`) and the `index.ts` re-export — zero consumers anywhere in `src/`, `services/`, `components/`, tests, `perf/`, `bench/`.

**Files:**
- Modify: `src/domain/bio/types.ts`
- Modify: `src/domain/bio/index.ts`

- [ ] **Step 1: Delete the dead declarations in `src/domain/bio/types.ts`.**

Delete lines 62-79 (the `WorkflowStep` enum, `AlignmentMode` type, and `AlignmentParams` interface):

```typescript
export enum WorkflowStep {
  INGESTION = 'Ingestion',
  ALIGNMENT = 'Alignment',
  TRANSPOSITION = 'Transposition',
  VISUALIZATION = 'Visualization'
}

export type AlignmentMode = 'auto' | 'FFT-NS-1' | 'FFT-NS-2' | 'L-INS-i' | 'E-INS-i' | 'G-INS-i';

export interface AlignmentParams {
  algorithm: 'mafft' | 'muscle';
  mode: AlignmentMode;
  gapOpeningPenalty: number;
  gapExtensionPenalty: number;
  maxIterations: number;
  matrix: 'BLOSUM62' | 'PAM30' | 'PAM70';
  threadCount: number;
}
```

Then delete lines 97-115 (`ProjectState` interface and `DEFAULT_PARAMS` const):

```typescript
export interface ProjectState {
  records: SeqRecord[];
  featureColors: Record<string, string>;
  activeSelection: SelectionArea | null;
  showAnnotations: boolean;
  showTranslation: boolean;
  showConservation: boolean;
  version: string;
}

export const DEFAULT_PARAMS: AlignmentParams = {
  algorithm: 'mafft',
  mode: 'auto',
  gapOpeningPenalty: 1.53,
  gapExtensionPenalty: 0.123,
  maxIterations: 1000,
  matrix: 'BLOSUM62',
  threadCount: 4,
};
```

Keep `FeatureSegment`, `BioFeature`, `QuantitativeTrack`, `SeqRecord`, `SearchResult`, and `SelectionArea` untouched. The file's final surviving declaration is `SelectionArea` (formerly lines 91-95).

- [ ] **Step 2: Drop the dead names from the barrel re-export in `src/domain/bio/index.ts`.**

Change the `export type { … } from './types';` block (lines 23-34) to:

```typescript
export type {
  FeatureSegment,
  BioFeature,
  QuantitativeTrack,
  SeqRecord,
  SearchResult,
  SelectionArea,
} from './types';
```

(Removes `WorkflowStep`, `AlignmentMode`, `AlignmentParams`, `ProjectState`. `DEFAULT_PARAMS` was never re-exported, so nothing else to change here.)

- [ ] **Step 3: CI mirror.** `typecheck` (proves nothing referenced the deleted names — the compiler flags any straggler), `lint`, `rtk proxy npx vitest run`, `build` — all green.
- [ ] **Step 4: Commit.**

```bash
git add src/domain/bio/types.ts src/domain/bio/index.ts
git commit -m "refactor(domain): drop vestigial alignment/project types (WorkflowStep, AlignmentMode, AlignmentParams, DEFAULT_PARAMS, ProjectState)"
```

---

## Task 2: Delete the dead `makeUniqueId` re-export from `bioUtils`

`makeUniqueId` is defined in `services/idHelpers.ts:28`. Production code imports it from the canonical module (`src/app/logic/bioResponse.ts:21` → `@/services/idHelpers`). The re-export at `services/bioUtils.ts:22` has exactly **one** consumer: `services/__tests__/idHelpers.test.ts:21`, which imports the function-under-test *through* `../bioUtils` instead of the module that actually owns it. Redirect that test to the canonical module, then delete the dead re-export. Behavior-preserving: same function, same assertions.

**Files:**
- Modify: `services/bioUtils.ts`
- Modify: `services/__tests__/idHelpers.test.ts`

- [ ] **Step 1: Redirect the test import.** In `services/__tests__/idHelpers.test.ts` change line 21:

```typescript
import { makeUniqueId } from '../bioUtils';
```
to
```typescript
import { makeUniqueId } from '../idHelpers';
```

- [ ] **Step 2: Delete the re-export.** Remove line 22 of `services/bioUtils.ts`:

```typescript
export { makeUniqueId } from './idHelpers';
```

- [ ] **Step 3: CI mirror** — `typecheck`, `lint`, `rtk proxy npx vitest run services/__tests__/idHelpers.test.ts` (then full suite), `build` — all green.
- [ ] **Step 4: Commit.**

```bash
git add services/bioUtils.ts services/__tests__/idHelpers.test.ts
git commit -m "refactor(services): drop dead makeUniqueId re-export; test imports the canonical idHelpers"
```

---

## Task 3: Rename `bioUtils.clipInterval` → `clipAndRebaseInterval` (kill the name collision)

Two different functions share the name `clipInterval`:
- `src/domain/bio/intervals.ts:28` — clips to `[min, max)` and returns **absolute** coordinates. (Canonical — keep the name.)
- `services/bioUtils.ts:344` — clips to the selection window **and rebases to selection-local** coordinates. (The bug trap — rename.)

They must NOT be merged (different semantics). Rename the `bioUtils` one to `clipAndRebaseInterval` (semantically honest: it clips *and* rebases). Callers of the `bioUtils` version: `clipFeature` (L369, L372) and `sliceRecordsBySelection` (L402), both internal to `bioUtils.ts`, plus `services/__tests__/selectionExport.test.ts` (import L21 + 15 call sites). The domain `clipInterval` and its callers/tests are untouched.

**Files:**
- Modify: `services/bioUtils.ts`
- Modify: `services/__tests__/selectionExport.test.ts`

- [ ] **Step 1: Rename the declaration.** In `services/bioUtils.ts`, change the function signature at line 344 and update its docblock name:

```typescript
export function clipAndRebaseInterval(
  start: number,
  end: number,
  selStart: number,
  selEnd: number
): Interval | null {
```
(Body unchanged. The docblock above it already accurately says "Clips … and rebases the result to selection-local coordinates" — keep it; just ensure it doesn't reference the old name.)

- [ ] **Step 2: Update the two internal callers** in `services/bioUtils.ts`:
  - L369 (inside `clipFeature`): `const clipped = clipInterval(feature.start, feature.end, selStart, selEnd);` → `clipAndRebaseInterval(...)`.
  - L372 (inside `clipFeature`): `?.map(s => clipInterval(s.start, s.end, selStart, selEnd))` → `?.map(s => clipAndRebaseInterval(s.start, s.end, selStart, selEnd))`.
  - L402 (inside `sliceRecordsBySelection`): `const clippedInterval = clipInterval(d.start, d.end, selStart, selEnd);` → `clipAndRebaseInterval(...)`.

- [ ] **Step 3: Update the test.** In `services/__tests__/selectionExport.test.ts`:
  - L21 import: `import { clipInterval, sliceRecordsBySelection } from '../bioUtils';` → `import { clipAndRebaseInterval, sliceRecordsBySelection } from '../bioUtils';`.
  - Replace every `clipInterval(` call with `clipAndRebaseInterval(` (the 15 assertion sites, L33-L86). The `describe('clipInterval …')` label strings may be renamed to `clipAndRebaseInterval` for honesty (cosmetic).

- [ ] **Step 4: CI mirror** — `typecheck` (proves no straggling `clipInterval` reference resolves to the wrong module), `lint`, `rtk proxy npx vitest run services/__tests__/selectionExport.test.ts` (then full suite), `build` — all green.
- [ ] **Step 5: Commit.**

```bash
git add services/bioUtils.ts services/__tests__/selectionExport.test.ts
git commit -m "refactor(services): rename bioUtils clipInterval to clipAndRebaseInterval (resolve name collision with domain clipInterval)"
```

---

## Task 4: Adopt the canonical `splitWrapAround` at its two inline copies

`splitWrapAround(start, end, seqLength)` (`src/domain/bio/intervals.ts:72`, re-exported by the barrel) is production-dead (only its own test exercises it). Two inline reimplementations exist. Adopting the helper at both sites is behavior-preserving:

- Non-wrap (`start <= end`): helper returns `[{ start, end }]` — identical to both inline "else" branches.
- Wrap (`start > end`): helper returns `[{start, end: seqLength}]` (only if `start < seqLength`) and `[{start:0, end}]` (only if `end > 0`). The inline copies always push both parts, but a part that the helper's guard omits is one the downstream loop would iterate **zero** times anyway (`for j = seqLength; j < seqLength` or `for j = 0; j < 0`), so the produced output is identical.

**Files:**
- Modify: `src/domain/bio/coordinate.ts`
- Modify: `services/bioUtils.ts`

- [ ] **Step 1: `coordinate.ts` — import the helper.** Add to the type import at line 21 a value import for `splitWrapAround`. After line 21 (`import type { BioFeature, FeatureSegment, SeqRecord } from "./types";`) add:

```typescript
import { splitWrapAround } from "./intervals";
```
(Same-folder domain import; `intervals.ts` imports only `./types`, so no cycle.)

- [ ] **Step 2: `coordinate.ts` — replace the inline split.** Inside `processTransposition`, replace lines 103-109:

```typescript
        const isWrap = seg.start > seg.end;
        const parts: Array<{ s: number; e: number }> = isWrap
          ? [
              { s: seg.start, e: record.sequence.length },
              { s: 0, e: seg.end },
            ]
          : [{ s: seg.start, e: seg.end }];
```
with:
```typescript
        const parts = splitWrapAround(seg.start, seg.end, record.sequence.length);
```
Then in the loop that follows (lines 111-113) rename the field accessors from the `{ s, e }` shape to `splitWrapAround`'s `{ start, end }`:
```typescript
        for (const part of parts) {
          const alignedStart = transposeCoordinates(part.start, alignedSeq);
          const alignedEnd = transposeCoordinates(part.end, alignedSeq);
          newSegments.push(
            ...buildAlignedSegments(alignedSeq, alignedStart, alignedEnd),
          );
        }
```

- [ ] **Step 3: `bioUtils.ts` — import the helper.** Add near the top imports (after line 21, `import { SeqRecord } from '../types';`):

```typescript
import { splitWrapAround } from '../src/domain/bio/intervals';
```
(Direct module import, not the barrel, to avoid pulling the whole `domain/bio` index. `services/` → `src/domain` matches the eventual `core → domain` layer direction.)

- [ ] **Step 4: `bioUtils.ts` — replace the inline split** in `extractCodingSequence`. Replace lines 70-78:

```typescript
  } else if (feature.start > feature.end) {
    // Circular wrap-around without explicit segments: split at origin
    segments = [
      { start: feature.start, end: seqLen },
      { start: 0, end: feature.end },
    ];
  } else {
    segments = [{ start: feature.start, end: feature.end }];
  }
```
with:
```typescript
  } else {
    segments = splitWrapAround(feature.start, feature.end, seqLen);
  }
```
The preceding `if (feature.segments && feature.segments.length > 0) { segments = feature.segments; }` (lines 68-69) is unchanged; only the `else if`/`else` fold into the helper. `splitWrapAround` returns `FeatureSegment[]` which is assignable to the `{ start: number; end: number }[]` local.

- [ ] **Step 5: CI mirror** — `typecheck`, `lint`, `rtk proxy npx vitest run src/domain/bio/__tests__/coordinate.test.ts services/__tests__/translationHelpers.test.ts services/__tests__/scu49845.e2e.test.ts` (then full suite), `build` — all green. The transposition and coding-sequence outputs must be unchanged; a diff there is a real regression — report it, do not adjust tests.
- [ ] **Step 6: Commit.**

```bash
git add src/domain/bio/coordinate.ts services/bioUtils.ts
git commit -m "refactor(bio): adopt canonical splitWrapAround over the two inline wrap-split copies"
```

---

## Task 5: Collapse duplicate `SearchResult` to the domain declaration

`services/searchLogic.ts:25` declares a local `SearchResult` that is structurally identical to the canonical `src/domain/bio/types.ts:81` (`segments?: { start; end }[]` ≡ `segments?: FeatureSegment[]`, since `FeatureSegment = { start: number; end: number }`). Make `searchLogic` re-export the domain type. Consumers of `searchLogic`'s `SearchResult` (`services/search/exact.ts:21`, `services/search/runSearch.ts:21`, `services/search/runInlineSearch.ts:21`) keep their existing value-style imports — safe because `verbatimModuleSyntax` is off. `SearchResult` is only *exported* by `searchLogic`; no function in that file uses it internally.

**Files:**
- Modify: `services/searchLogic.ts`

- [ ] **Step 1: Replace the local interface with a re-export.** In `services/searchLogic.ts`, delete the interface at lines 25-33:

```typescript
export interface SearchResult {
  start: number;
  end: number;
  sequence: string;
  recordId: string;
  strand: 1 | -1;
  score?: number;
  segments?: { start: number; end: number }[];
}
```
and put in its place:
```typescript
export type { SearchResult } from '../src/domain/bio/types';
```
(Keep the file-level JSDoc at lines 20-23. `export type { … } from` is explicitly type-only, which is required under `isolatedModules: true`.)

- [ ] **Step 2: CI mirror** — `typecheck` (proves the domain shape satisfies every `SearchResult` construction site in `exact.ts` / `runSearch.ts` / `runInlineSearch.ts`), `lint`, `rtk proxy npx vitest run services/__tests__/searchLogic.test.ts services/search/__tests__` (then full suite), `build` — all green.
- [ ] **Step 3: Commit.**

```bash
git add services/searchLogic.ts
git commit -m "refactor(search): re-export canonical domain SearchResult from searchLogic (drop duplicate declaration)"
```

---

## Task 6: Collapse duplicate `SearchOptions` to the protocol declaration

`src/workers/protocol.ts:123` owns the wire-contract `SearchOptions` (`{ minScore; strand; maxResults }`). `src/app/hooks/useSearchWorker.ts:32` re-declares a byte-identical copy. The barrel `src/app/hooks/index.ts:30` re-exports `SearchOptions` from `useSearchWorker`, so the re-export must be preserved. Route the hook through the protocol type. (`app` → `workers/protocol` is an allowed import direction.)

**Files:**
- Modify: `src/app/hooks/useSearchWorker.ts`

- [ ] **Step 1: Import `SearchOptions` from protocol.** Extend the existing protocol import at line 22:

```typescript
import type { SearchWorkerRequest, SearchWorkerResponse, SearchableRecord } from '@/src/workers/protocol';
```
to
```typescript
import type { SearchWorkerRequest, SearchWorkerResponse, SearchableRecord, SearchOptions } from '@/src/workers/protocol';
```

- [ ] **Step 2: Delete the local declaration** at lines 32-36:

```typescript
export interface SearchOptions {
  minScore: number;
  strand: 'fwd' | 'rev' | 'both';
  maxResults: number;
}
```
and, so the hooks barrel's `export type { UseSearchWorkerReturn, SearchOptions } from './useSearchWorker';` keeps resolving, add in its place a re-export of the imported type:
```typescript
export type { SearchOptions };
```
(`SearchOptions` remains used in-file at the `UseSearchWorkerReturn` interface and the `useState<SearchOptions>` initializer — no unused-import lint.)

- [ ] **Step 3: CI mirror** — `typecheck`, `lint`, `rtk proxy npx vitest run` (full suite — exercises `useSearchWorker` consumers and the hooks barrel), `build` — all green.
- [ ] **Step 4: Commit.**

```bash
git add src/app/hooks/useSearchWorker.ts
git commit -m "refactor(app): source SearchOptions from the worker protocol (drop duplicate hook declaration)"
```

---

## Task 7: Collapse the FASTA aligned-record `Pick` to one named alias in protocol

`src/workers/protocol.ts:90` inlines `Pick<SeqRecord, 'id' | 'name' | 'sequence' | 'features' | 'moleculeType'>[]` for `ParseFastaSuccessResponse.alignedData`; `src/app/logic/bioResponse.ts:24` declares the same `Pick` as the named `FastaAlignedRecord`. The FASTA record is a wire-contract shape, so its canonical home is the protocol. Define the named alias in protocol, use it there, and have `bioResponse` import it. (`bioResponse` only *uses* `FastaAlignedRecord` at L103; grep shows no external importer, but re-export it to preserve the module's surface.)

**Files:**
- Modify: `src/workers/protocol.ts`
- Modify: `src/app/logic/bioResponse.ts`

- [ ] **Step 1: Add the named alias to protocol and use it.** In `src/workers/protocol.ts`, immediately before `ParseFastaSuccessResponse` (before line 88) add:

```typescript
/** The record shape carried in a FASTA_SUCCESS response's alignedData. */
export type FastaAlignedRecord = Pick<SeqRecord, 'id' | 'name' | 'sequence' | 'features' | 'moleculeType'>;
```
Then change the field on line 90 from:
```typescript
  alignedData: Pick<SeqRecord, 'id' | 'name' | 'sequence' | 'features' | 'moleculeType'>[];
```
to:
```typescript
  alignedData: FastaAlignedRecord[];
```
(`SeqRecord` is already imported at the top of protocol.ts.)

- [ ] **Step 2: Import the alias in `bioResponse.ts`.** Replace the local declaration at line 24:

```typescript
/** The record shape carried in a FASTA_SUCCESS response's alignedData. */
export type FastaAlignedRecord = Pick<SeqRecord, 'id' | 'name' | 'sequence' | 'features' | 'moleculeType'>;
```
with an import + re-export (add the import beside the existing `@/services/idHelpers` import at line 21):
```typescript
import type { FastaAlignedRecord } from '@/src/workers/protocol';
export type { FastaAlignedRecord };
```
`FastaAlignedRecord` stays used at `applyFastaResponse`'s `alignedData: FastaAlignedRecord[]` (L103) and its export surface is preserved.

- [ ] **Step 3: CI mirror** — `typecheck` (proves `msg.alignedData` from a `FASTA_SUCCESS` response still flows into `applyFastaResponse` — same structural type), `lint`, `rtk proxy npx vitest run src/app/logic/__tests__/bioResponse.test.ts` (then full suite), `build` — all green.
- [ ] **Step 4: Commit.**

```bash
git add src/workers/protocol.ts src/app/logic/bioResponse.ts
git commit -m "refactor(protocol): name the FASTA aligned-record Pick as FastaAlignedRecord; bioResponse imports it"
```

---

## Task 8: Remove the internal `GenomeViewer` duplication

Within `components/GenomeViewer.tsx`: the `brokenFeatureMap` memo body is duplicated at L150 (in `SequenceTrack`, guarded by `showTranslation`, over the `any[]` `features` prop) and L642 (in `Row`, unguarded, over `l.record.features: BioFeature[]`); the CDS/ORF filter literal `['CDS', 'ORF', 'orf', 'cds']` appears 3× (L154, L298, L645). Extract one module-level const + one in-file helper and route all three literal sites and both memos through them. Behavior-preserving: `SequenceTrack` keeps its `showTranslation` guard at the call site; the map-building body is identical at both sites. (Full decomposition is Phase D.)

`BioFeature`, `extractCodingSequence`, and `detectEarlyStop` are already imported at the top of the file (L24-25).

**Files:**
- Modify: `components/GenomeViewer.tsx`

- [ ] **Step 1: Add the const + helper at module scope.** After the constants block (after `const RULER_HEIGHT = 25;`, line 54) and before the `Ruler` component (line 56), insert:

```typescript
/** Feature types rendered as translated coding sequences (CDS/ORF, case variants). */
const CDS_ORF_TYPES = ['CDS', 'ORF', 'orf', 'cds'];

/**
 * Maps each CDS/ORF feature's `${start}-${end}-${strand}` key to whether its
 * coding sequence has an internal (early) stop codon — a "broken" protein.
 */
const computeBrokenFeatureMap = (features: BioFeature[], seq: string): Map<string, boolean> => {
  const map = new Map<string, boolean>();
  features
    .filter(f => CDS_ORF_TYPES.includes(f.type))
    .forEach(f => {
      const { codingSeq } = extractCodingSequence(f, seq);
      map.set(`${f.start}-${f.end}-${f.strand}`, detectEarlyStop(codingSeq));
    });
  return map;
};
```

- [ ] **Step 2: Route `SequenceTrack`'s memo (L150-160) through the helper**, preserving the `showTranslation` guard. Replace:

```typescript
  const brokenFeatureMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!showTranslation) return map;
    features
      .filter(f => ['CDS', 'ORF', 'orf', 'cds'].includes(f.type))
      .forEach(f => {
        const { codingSeq } = extractCodingSequence(f, seq);
        map.set(`${f.start}-${f.end}-${f.strand}`, detectEarlyStop(codingSeq));
      });
    return map;
  }, [features, seq, showTranslation]);
```
with:
```typescript
  const brokenFeatureMap = useMemo(
    () => (showTranslation ? computeBrokenFeatureMap(features, seq) : new Map<string, boolean>()),
    [features, seq, showTranslation],
  );
```
(`features` is typed `any[]` on `SequenceTrackProps`; passing it to the `BioFeature[]` param is allowed.)

- [ ] **Step 3: Route the L298 translation-render filter through the const.** Change:

```typescript
      features.filter(f => ['CDS', 'ORF', 'orf', 'cds'].includes(f.type)).forEach(f => {
```
to:
```typescript
      features.filter(f => CDS_ORF_TYPES.includes(f.type)).forEach(f => {
```

- [ ] **Step 4: Route `Row`'s memo (L642-651) through the helper.** Replace:

```typescript
  const brokenFeatureMap = useMemo(() => {
    const map = new Map<string, boolean>();
    l.record.features
      .filter((f: BioFeature) => ['CDS', 'ORF', 'orf', 'cds'].includes(f.type))
      .forEach((f: BioFeature) => {
        const { codingSeq } = extractCodingSequence(f, seq);
        map.set(`${f.start}-${f.end}-${f.strand}`, detectEarlyStop(codingSeq));
      });
    return map;
  }, [l.record.features, seq]);
```
with:
```typescript
  const brokenFeatureMap = useMemo(
    () => computeBrokenFeatureMap(l.record.features, seq),
    [l.record.features, seq],
  );
```

- [ ] **Step 5: CI mirror** — `typecheck`, `lint` (note: `GenomeViewer` is huge and `max-lines`/`max-lines-per-function` remain `warn` in this phase — the net line count drops slightly, so no new *error*), `rtk proxy npx vitest run` (full suite), `build` (proves the component still compiles under Vite) — all green. `GenomeViewer.tsx` is outside the coverage `include`, so no gate effect.
- [ ] **Step 6: Commit.**

```bash
git add components/GenomeViewer.tsx
git commit -m "refactor(viewer): extract CDS_ORF_TYPES const + computeBrokenFeatureMap helper (kill in-file dup)"
```

---

## Task 9: Full CI mirror, coverage check, open PR

**Files:**
- Modify (only if achieved coverage rose): `vite.config.ts`

- [ ] **Step 1: Full CI mirror.**

```bash
npm run typecheck > /dev/null 2>&1; echo "typecheck=$?"
npm run lint > /dev/null 2>&1; echo "lint=$?"
rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "coverage=$?"
npm run build > /dev/null 2>&1; echo "build=$?"
```
All four `0` (lint `0` = warnings only). If `coverage` is non-zero, a metric dropped **below** its threshold — that signals a behavior/coverage regression from one of the edits: investigate and STOP/report; do **not** lower a threshold to make it pass.

- [ ] **Step 2: Coverage re-baseline (raise-only; likely a no-op).** Read achieved vs. thresholds:

```bash
node -e '
const s=require("./coverage/coverage-summary.json").total;
const cur={lines:94,branches:85,functions:93,statements:92};
const floor=k=>Math.max(cur[k], Math.floor(s[k].pct)-4);
console.log("achieved:", JSON.stringify({lines:s.lines.pct,branches:s.branches.pct,functions:s.functions.pct,statements:s.statements.pct}));
console.log("raise-only thresholds:", JSON.stringify({lines:floor("lines"),branches:floor("branches"),functions:floor("functions"),statements:floor("statements")}));
'
```
Phase A removes only dead/duplicate surface (type deletions land in coverage-excluded `types.ts`/`index.ts`; the dedup edits are behavior-preserving), so achieved should be flat or slightly up vs. the Phase-2A baseline (lines 98.3 / branches 89.4 / functions 97.5 / statements 96.5). If any value climbed enough that `floor(achieved) − 4 > current`, bump only those `thresholds` in `vite.config.ts` and update the ratchet comment. Never lower. Then re-run `rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "gate=$?"` → `0`. If nothing warrants a raise, skip the edit.

- [ ] **Step 3: Commit any threshold bump (skip if no change).**

```bash
git add vite.config.ts
git commit -m "ci(coverage): raise ratchet thresholds after Phase A dedupe"
```

- [ ] **Step 4: Push + open PR against `develop`.**

```bash
git push -u origin arch-phaseA-dedupe-deadcode
gh pr create --base develop --title "refactor: Phase A — dedupe & dead-code removal (in place)" \
  --body "Behavior-preserving Phase A of the architecture restructure. Deletes verified-dead types (WorkflowStep/AlignmentMode/AlignmentParams/DEFAULT_PARAMS/ProjectState) + the dead makeUniqueId re-export; renames the selection-local bioUtils clipInterval to clipAndRebaseInterval (resolves the name collision with domain clipInterval); adopts the canonical splitWrapAround over its two inline copies; collapses duplicate SearchResult / SearchOptions / FASTA-record types to one canonical home each; removes the internal GenomeViewer brokenFeatureMap/CDS-ORF-literal duplication. No files move folders; no new modules. See docs/superpowers/specs/2026-07-02-architecture-restructure-design.md and docs/superpowers/plans/2026-07-02-arch-phaseA-dedupe-deadcode.md."
```

---

## Self-review

- **Spec coverage:** Every Phase-A item from the task brief maps to a task — dead types (T1), dead `makeUniqueId` re-export (T2), `clipInterval` collision rename (T3), `splitWrapAround` adoption at both inline sites (T4), duplicate `SearchResult` (T5) / `SearchOptions` (T6) / FASTA `Pick` (T7), `GenomeViewer` `brokenFeatureMap` + CDS/ORF literal (T8), gate/PR (T9). The "is-protein session" helper is explicitly **owned and implemented by Phase B** (stated in "NOT in this phase"), matching the spec's `sessionMoleculeType`-in-`sequence.ts` decision and avoiding a helper A would create only for B to relocate. `reverseComplement` and molecule-type *detection* dedup are called out as Phase B, not touched.
- **Behavior preservation:** T1/T2 delete only verified-unreferenced code (grep across `src`, `services`, `components`, tests, `perf`, `bench`). T3 is a pure rename with all call sites updated. T4's guard-difference between the inline copies and `splitWrapAround` is proven inert (omitted parts iterate zero times). T5/T6/T7 collapse structurally-identical type declarations (verified field-by-field). T8 preserves `SequenceTrack`'s `showTranslation` guard at the call site. `build` runs every task to prove worker/Vite wiring.
- **Type-safety of the re-exports:** `isolatedModules: true` with `verbatimModuleSyntax` off — existing value-style `SearchResult` imports in `exact.ts`/`runSearch.ts`/`runInlineSearch.ts` keep compiling, and `export type { … } from …` re-exports are the isolatedModules-safe form.
- **Ordering:** T3 renames the collision before any later task references clipping; T4's helper adoption is independent; type dedups (T5-T7) touch disjoint files; T8 is self-contained. Each task ends green independently.
- **Placeholder scan:** no TBD/TODO in the plan; the two "delete lines N-M / replace with" instructions quote the exact current source and the exact replacement.
- **Coverage:** deletions target coverage-excluded (`types.ts`, `index.ts`) or type-only lines; measured files change only behavior-preservingly. Gate expected flat; T9 raises-only, never lowers, and treats a drop as a regression to report.
