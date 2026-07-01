# Phase 2A · PR2 — App-State Logic Extraction Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the pure reducer/derivation logic out of the three app-state hooks (`useBioWorker`, `useSearchWorker`, `useFeatureManager`) into node-testable modules under `src/app/logic/**`, and extract the two remaining search engines (`runExactSearch` shared core + the inline fallback) into `services/search/**` — behavior-preserving, then unit-test the pure modules with no new dependencies.

**Architecture:** The hook closures (`onmessage` `setState` updaters, `useMemo`/`useCallback` bodies) move verbatim into pure functions; the hooks then `import` and call them. The exact/IUPAC regex loop that is byte-identical between the worker (`runSearch`) and the hook (`executeSearchInline`) is factored into `services/search/exact.ts` as `runExactSearch`, which `runSearch` re-uses (its existing tests staying green is the identity proof). `useSearchWorker.executeSearchInline` moves into `services/search/runInlineSearch.ts`, keeping its distinct whole-ungapped-sequence fuzzy strategy (NOT merged with the worker's seeded `collectSeededFuzzyHits`). Side effects (`alert`, `setTimeout`, `Worker`, `FileReader`, `window.prompt`) stay in the thin hook layer. `npm run build` + `npm run typecheck` staying green after each task is the behavior-preservation proof.

**Tech Stack:** TypeScript, Vitest 4.1.2 (env `node`), `@vitest/coverage-v8`.

## Global Constraints

- No new dependencies. Test env stays `node`.
- Every new source file starts with the 18-line AGPL header **identical to `services/bioUtils.ts` lines 1-18**.
- Extraction is **behavior-preserving**: move closure bodies verbatim — only the wrapper (params in, value out) changes. Do not rewrite logic or "clean it up". If a test cannot pass, recompute the expected value from the source; if the code is genuinely wrong, STOP and report — do not weaken the test or change production semantics in this plan.
- **Reducers tested via the extracted pure function.** Each reducer is extracted as a standalone pure `(records, args) => records` (or `(prev, msg, ...) => result`) and tested **directly**. The hook wires it in by passing an updater to `setRecords` — e.g. `setRecords(prev => applyParseSuccess(prev, msg.records))`. Where a hook still passes an updater to `setRecords`, a hook-level test (not in scope here) would capture it from a `vi.fn()` spy; in this PR we test the extracted pure function directly, which is stronger and simpler. Show the real pure-function test.
- **Determinism:** `runInlineSearch` reads `Date.now()` for a time budget (1800ms fuzzy / 6000ms exact). Tests use tiny inputs so the budget never trips. Fuzzy `score` assertions are `>=` property bounds only — never pin an exact fuzzy score. Exact-mode coordinates are arithmetic and MUST be pinned.
- **Don't re-test `searchLogic`.** `smithWaterman`, `degenerateToRegex`, `removeGapsWithMap`, `getNonGapSegments`, `mapUngappedRangeToAligned`, `reverseComplement` are already Phase-1 covered. Test only the new orchestration (strand remap, sort, slice, grouping, filtering, coordinate conversion).
- **Side effects stay in the thin layer.** `alert`, `window.prompt`, `FileReader`, `Worker`, `setTimeout`, `addLog` stay in the hooks; the extracted core is pure. Where a closure both computes AND logs/alerts, extract only the computation; the hook keeps the log/alert call around it.
- Coverage gate `include` currently covers `services/**` (auto-measures the new services files). The final task adds `src/app/logic/**` to `include` and re-baselines the ratchet thresholds (a few points below new achieved; raise never lower). Current floors: lines 94 / branches 85 / functions 93 / statements 92.
- After each task: `npm run typecheck` and `npm run build` must stay green (behavior-preservation), plus the task's tests.
- RTK note: if `vitest`/`npx` output looks garbled/truncated, prefix the command with `rtk proxy`.

## File structure

| File | Responsibility |
|---|---|
| `services/search/exact.ts` (create) | `runExactSearch(searchQuery, records, isProtein, strand)` — the shared exact/IUPAC regex loop |
| `services/search/runSearch.ts` (modify) | its exact branch calls `runExactSearch` |
| `services/search/runInlineSearch.ts` (create) | `runInlineSearch(request): SearchResult[]` — the inline fallback (exact via `runExactSearch`, whole-ungapped fuzzy) |
| `src/app/hooks/useSearchWorker.ts` (modify) | drop `executeSearchInline`, `filteredResults`/`groupedSearchResults` closures, join-core, `getSequenceContext` bodies — call the extracted fns |
| `src/app/logic/searchState.ts` (create) | `filteredResults`, `groupedSearchResults`, `joinSegments`, `getSequenceContext` |
| `src/app/logic/bioResponse.ts` (create) | `resolveAccession`, `applyParseSuccess`, `applyAnnotations`, `applyFastaResponse` |
| `src/app/hooks/useBioWorker.ts` (modify) | `onmessage` updaters call the extracted reducers |
| `src/app/logic/featureManager.ts` (create) | `saveEditedFeature`, `removeFeature`, `toggleRecordVisibility` reducers, `buildFlattenedFeatures`, new-feature coord helpers |
| `src/app/hooks/useFeatureManager.ts` (modify) | mutations/derivations call the extracted fns |
| `services/search/__tests__/*.test.ts`, `src/app/logic/__tests__/*.test.ts` (create) | unit tests |
| `vite.config.ts` (modify) | add `src/app/logic/**` to include; re-baseline thresholds |

**Task order (each ends in an independently-committable deliverable):**
A → `exact.ts` + refactor `runSearch`. B → `runInlineSearch.ts` + rewire `useSearchWorker`. C → `searchState.ts` + rewire. D → `bioResponse.ts` + rewire `useBioWorker`. E → `featureManager.ts` + rewire `useFeatureManager`. F → coverage-gate re-baseline + full CI mirror + PR.

---

## Task A: `runExactSearch` → `services/search/exact.ts` + refactor `runSearch`

**Files:**
- Create: `services/search/exact.ts`
- Test: `services/search/__tests__/exact.test.ts`
- Modify: `services/search/runSearch.ts` (exact branch delegates to `runExactSearch`)

**Interfaces:**
- Consumes: `SearchResult`, `degenerateToRegex`, `reverseComplement`, `getNonGapSegments` from `../searchLogic`.
- Produces: `export function runExactSearch(searchQuery: string, records: { id: string; sequence: string; alignedSequence?: string }[], isProtein: boolean, strand: 'fwd' | 'rev' | 'both'): SearchResult[]`

**Seq-derivation note (behavior-preserving for typed inputs):** the worker's exact loop derives `seq` as `record.alignedSequence || record.sequence`; the hook's inline loop uses a `typeof`-guard plus an empty-skip (`if (!seq) continue`). For well-typed `SearchableRecord` string inputs the two are equivalent. `runExactSearch` adopts the worker convention **`const seq = record.alignedSequence || record.sequence;`** with an empty-skip guard (`if (!seq) continue;`) so it is safe to share into both the worker path and the inline path. This is behavior-preserving for typed inputs (empty/absent sequences are skipped either way). The fuzzy-path empty-skip stays where it belongs — in `runInlineSearch` (Task B), not here.

- [ ] **Step 1: Create `services/search/exact.ts`**

AGPL header (identical to `services/bioUtils.ts` lines 1-18), then the shared exact loop lifted **verbatim** from `runSearch`'s exact branch (`services/search/runSearch.ts:150-193`), parameterised:

```typescript
import {
  SearchResult,
  degenerateToRegex,
  reverseComplement,
  getNonGapSegments,
} from '../searchLogic';

/** A record projection carrying the sequence(s) the exact loop scans. */
export interface ExactSearchRecord {
  id: string;
  sequence: string;
  alignedSequence?: string;
}

/**
 * Exact / IUPAC-degenerate regex search over the given records.
 *
 * Shared verbatim between the search worker (`runSearch`) and the inline
 * fallback (`runInlineSearch`); their exact paths were byte-identical. Forward
 * matches use the raw index; reverse matches are remapped onto forward
 * coordinates as `start = L - rcEnd`, `end = L - rcStart`. Proteins skip the
 * reverse strand. Overlapping matches are found via `lastIndex = index + 1`.
 * Results are returned unsorted; the caller sorts/slices.
 */
export function runExactSearch(
  searchQuery: string,
  records: ExactSearchRecord[],
  isProtein: boolean,
  strand: 'fwd' | 'rev' | 'both',
): SearchResult[] {
  const results: SearchResult[] = [];
  const regex = degenerateToRegex(searchQuery, isProtein ? 'protein' : 'nucleotide');

  for (const record of records) {
    const seq = record.alignedSequence || record.sequence;
    if (!seq) continue;
    const L = seq.length;

    // Forward search
    if (strand === 'both' || strand === 'fwd') {
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(seq)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        results.push({
          start,
          end,
          sequence: match[0],
          recordId: record.id,
          strand: 1,
          segments: getNonGapSegments(seq, start, end),
        });
        regex.lastIndex = match.index + 1;
      }
    }

    // Reverse search (nucleotide only — proteins have no reverse complement)
    if (!isProtein && (strand === 'both' || strand === 'rev')) {
      const rcSeq = reverseComplement(seq);
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(rcSeq)) !== null) {
        const rcStart = match.index;
        const rcEnd = match.index + match[0].length;
        const start = L - rcEnd;
        const end = L - rcStart;
        results.push({
          start,
          end,
          sequence: match[0],
          recordId: record.id,
          strand: -1,
          segments: getNonGapSegments(seq, start, end),
        });
        regex.lastIndex = match.index + 1;
      }
    }
  }

  return results;
}
```

> **Note on `degenerateToRegex` placement:** the original worker built the regex **inside** the `records.forEach` (once per record); this extraction hoists it to once per call. That is behavior-identical because the loop resets `regex.lastIndex = 0` before each use and the regex is stateless across records otherwise. If you prefer a zero-diff move, build the regex inside the record loop instead — either is behavior-preserving. The hoisted form is shown above and is verified equivalent by `runSearch`'s existing tests staying green in Step 3.

- [ ] **Step 2: Refactor `runSearch` to call `runExactSearch`**

In `services/search/runSearch.ts`, keep `collectSeededFuzzyHits` and the fuzzy branch untouched. Replace the exact branch inside `records.forEach` so the exact work is delegated. The cleanest behavior-preserving shape: pull the exact records out of the `forEach` and call `runExactSearch` once for the whole record set in exact mode. Concretely, restructure the body of `runSearch` so that:

```typescript
    let results: SearchResult[] = [];
    const queryUpper = searchQuery.toUpperCase();

    if (mode === 'fuzzy') {
      records.forEach((record) => {
        const seq = record.alignedSequence || record.sequence;
        const L = seq.length;
        if (strand === 'both' || strand === 'fwd') {
          results.push(...collectSeededFuzzyHits(queryUpper, seq, record.id, 1, minScore));
        }
        if (!isProtein && (strand === 'both' || strand === 'rev')) {
          const rcSeq = reverseComplement(seq);
          const revHits = collectSeededFuzzyHits(queryUpper, rcSeq, record.id, -1, minScore);
          revHits.forEach(hit => {
            const start = L - hit.end;
            const end = L - hit.start;
            results.push({
              ...hit,
              start,
              end,
              sequence: seq.substring(start, end),
              segments: getNonGapSegments(seq, start, end),
            });
          });
        }
      });
    } else {
      results = runExactSearch(searchQuery, records, isProtein, strand);
    }
```

Add `import { runExactSearch } from './exact';` at the top. Keep the existing `mode === 'fuzzy'` / else sort and the `maxResults` slice unchanged.

**Behavior-preservation caveat to verify:** the old exact loop skipped records only implicitly (it never guarded empty `seq`, iterating `L = seq.length` = 0 and matching nothing). `runExactSearch` adds `if (!seq) continue;`, which is equivalent (an empty seq yields no matches either way). Confirm `runSearch`'s existing tests (`services/search/__tests__/runSearch.test.ts`) stay green — that is the identity proof.

- [ ] **Step 3: Run the EXISTING runSearch tests (identity proof) + new exact test**

```bash
rtk proxy npx vitest run services/search/__tests__/runSearch.test.ts services/search/__tests__/exact.test.ts
```
`runSearch.test.ts` must stay fully green (proves the exact refactor is byte-behavior). If any coordinate there changes, STOP — the extraction broke something.

- [ ] **Step 4: Write the exact test**

Create `services/search/__tests__/exact.test.ts` (AGPL header + below). All coordinates recomputed from source via a `tsx` scratch run:

```typescript
import { describe, it, expect } from 'vitest';
import { runExactSearch } from '../exact';

describe('runExactSearch — forward strand', () => {
  it('finds a forward match with rebased coordinates and non-gap segments', () => {
    expect(runExactSearch('ACG', [{ id: 'r1', sequence: 'TTACGTT' }], false, 'fwd')).toEqual([
      { start: 2, end: 5, sequence: 'ACG', recordId: 'r1', strand: 1, segments: [{ start: 2, end: 5 }] },
    ]);
  });

  it('finds overlapping matches via lastIndex = index + 1', () => {
    const out = runExactSearch('AA', [{ id: 'r1', sequence: 'AAAA' }], false, 'fwd');
    expect(out.map(r => r.start)).toEqual([0, 1, 2]);
    expect(out.every(r => r.strand === 1 && r.sequence === 'AA')).toBe(true);
  });
});

describe('runExactSearch — reverse strand remap', () => {
  it('remaps a reverse match onto forward coordinates (start = L - rcEnd)', () => {
    const out = runExactSearch('ACG', [{ id: 'r1', sequence: 'TTACGTT' }], false, 'rev');
    expect(out).toEqual([
      { start: 3, end: 6, sequence: 'ACG', recordId: 'r1', strand: -1, segments: [{ start: 3, end: 6 }] },
    ]);
  });

  it('skips the reverse strand for a protein molecule (isProtein=true, strand=both)', () => {
    const out = runExactSearch('M', [{ id: 'r1', sequence: 'MKMK' }], true, 'both');
    expect(out.map(r => ({ start: r.start, strand: r.strand }))).toEqual([
      { start: 0, strand: 1 },
      { start: 2, strand: 1 },
    ]);
  });
});

describe('runExactSearch — gapped alignedSequence & empty guard', () => {
  it('matches across a gap because degenerateToRegex emits A-*C-*G, splitting segments', () => {
    // degenerateToRegex('ACG','nucleotide').source === 'A-*C-*G' — it deliberately
    // allows gap runs between residues, so 'A-CG' inside 'A-CGTT' matches. The raw
    // matched substring is 'A-CG'; getNonGapSegments splits it at the gap.
    const out = runExactSearch('ACG', [{ id: 'r1', sequence: 'AAA', alignedSequence: 'A-CGTT' }], false, 'fwd');
    expect(out).toEqual([
      { start: 0, end: 4, sequence: 'A-CG', recordId: 'r1', strand: 1, segments: [{ start: 0, end: 1 }, { start: 2, end: 4 }] },
    ]);
  });

  it('skips a record whose derived seq is empty', () => {
    expect(runExactSearch('A', [{ id: 'r1', sequence: '' }], false, 'fwd')).toEqual([]);
  });
});
```

> **Verification note for the executing agent:** the gapped-`alignedSequence` assertion above was computed from source: `degenerateToRegex('ACG', 'nucleotide').source === 'A-*C-*G'` — the IUPAC regex deliberately allows gap runs (`-*`) between residues, so `A-CG` inside `A-CGTT` matches, yielding `{start:0,end:4,sequence:'A-CG',segments:[{0,1},{2,4}]}`. RE-RUN a `tsx` scratch on the real `runExactSearch` to reconfirm before committing (do not skip — it is the one non-obvious value), but the pinned value above is correct. This is the SAME value the inline path returns (Task B), because Task B delegates the exact path to this function.

- [ ] **Step 5: Typecheck + build**

```bash
npm run typecheck > /dev/null 2>&1; echo "tc=$?"   # 0
npm run build > /dev/null 2>&1; echo "build=$?"    # 0
```

- [ ] **Step 6: Commit**

```bash
git add services/search/exact.ts services/search/__tests__/exact.test.ts services/search/runSearch.ts
git commit -m "refactor(search): extract shared runExactSearch; runSearch delegates its exact path"
```

---

## Task B: `runInlineSearch` → `services/search/runInlineSearch.ts` + rewire `useSearchWorker`

**Files:**
- Create: `services/search/runInlineSearch.ts`
- Test: `services/search/__tests__/runInlineSearch.test.ts`
- Modify: `src/app/hooks/useSearchWorker.ts` (replace the `executeSearchInline` `useCallback` body with a call)

**Interfaces:**
- Consumes: `runExactSearch` (Task A), `SearchResult`, `reverseComplement`, `getNonGapSegments`, `removeGapsWithMap`, `mapUngappedRangeToAligned`, `smithWaterman` from `../searchLogic`, `SearchWorkerRequest` from protocol.
- Produces: `export function runInlineSearch(request: SearchWorkerRequest): SearchResult[]`

- [ ] **Step 1: Create `services/search/runInlineSearch.ts`**

AGPL header, then the body of `useSearchWorker.executeSearchInline` (`src/app/hooks/useSearchWorker.ts:118-232`) moved **verbatim**, with the exact branch delegated to `runExactSearch` and the fuzzy whole-ungapped-sequence branch kept as-is:

```typescript
import {
  SearchResult,
  reverseComplement,
  getNonGapSegments,
  removeGapsWithMap,
  mapUngappedRangeToAligned,
  smithWaterman,
} from '../searchLogic';
import type { SearchWorkerRequest } from '../../src/workers/protocol';
import { runExactSearch } from './exact';

/**
 * Synchronous inline search fallback (extracted from useSearchWorker).
 *
 * Exact/IUPAC mode delegates to the shared `runExactSearch`. Fuzzy mode runs
 * Smith-Waterman over the WHOLE ungapped sequence (a lighter, distinct strategy
 * from the worker's seeded `collectSeededFuzzyHits` — intentionally NOT merged).
 * Reads `Date.now()` for a time budget (1800ms fuzzy / 6000ms exact); with small
 * inputs the budget never trips, so results are deterministic.
 */
export function runInlineSearch(request: SearchWorkerRequest): SearchResult[] {
  const { searchQuery, records: inputRecords, mode, options, moleculeType } = request;
  const { minScore = 5, strand = 'both', maxResults = 100 } = options;
  const isProtein = moleculeType === 'protein';

  if (!searchQuery || searchQuery.length < 1) return [];

  let results: SearchResult[];

  if (mode !== 'fuzzy') {
    results = runExactSearch(searchQuery, inputRecords, isProtein, strand);
  } else {
    results = [];
    const queryUpper = searchQuery.toUpperCase();
    const startedAt = Date.now();
    const maxInlineMs = 1800;

    for (const record of inputRecords) {
      if (Date.now() - startedAt > maxInlineMs) break;
      const seq = typeof record.alignedSequence === 'string'
        ? record.alignedSequence
        : (typeof record.sequence === 'string' ? record.sequence : '');
      if (!seq) continue;
      const L = seq.length;

      const { ungapped: ungappedSeq, map: fwdMap } = removeGapsWithMap(seq);

      if ((strand === 'both' || strand === 'fwd') && ungappedSeq.length > 0) {
        const fwdFuzzy = smithWaterman(queryUpper, ungappedSeq, 2, -1, -3, -1, minScore);
        fwdFuzzy.forEach(m => {
          const aligned = mapUngappedRangeToAligned(fwdMap, m.start, m.end);
          results.push({
            start: aligned.start,
            end: aligned.end,
            sequence: seq.substring(aligned.start, aligned.end),
            score: m.score,
            recordId: record.id,
            strand: 1,
            segments: getNonGapSegments(seq, aligned.start, aligned.end),
          });
        });
      }

      if (Date.now() - startedAt > maxInlineMs) break;

      if (!isProtein && (strand === 'both' || strand === 'rev')) {
        const rcSeq = reverseComplement(seq);
        const { ungapped: ungappedRcSeq, map: revMap } = removeGapsWithMap(rcSeq);
        if (ungappedRcSeq.length === 0) continue;

        const revFuzzy = smithWaterman(queryUpper, ungappedRcSeq, 2, -1, -3, -1, minScore);
        revFuzzy.forEach(m => {
          const rcRange = mapUngappedRangeToAligned(revMap, m.start, m.end);
          const start = L - rcRange.end;
          const end = L - rcRange.start;
          results.push({
            score: m.score,
            start,
            end,
            sequence: seq.substring(start, end),
            recordId: record.id,
            strand: -1,
            segments: getNonGapSegments(seq, start, end),
          });
        });
      }
    }
  }

  if (mode === 'fuzzy') {
    results.sort((a, b) => (b.score || 0) - (a.score || 0) || a.start - b.start);
  } else {
    results.sort((a, b) => a.start - b.start || a.recordId.localeCompare(b.recordId));
  }

  return results.length > maxResults ? results.slice(0, maxResults) : results;
}
```

> **Behavior-preservation caveats (verify, don't hand-wave):**
> 1. The original computed `maxInlineMs = mode === 'fuzzy' ? 1800 : 6000` up-front. The refactor no longer needs the 6000 exact budget because the exact path now goes through `runExactSearch` (unbudgeted — as it effectively was, since exact matching is fast and the old exact loop never checked the budget mid-loop *inside a record*; it only checked at the top of each record). **This drops the per-record 6000ms early-`break` for exact mode.** For the small/normal inputs this app handles it is behavior-identical, but it IS a semantic change for a pathological many-record exact search. FLAG THIS in the handoff: if strict identity is required, keep the exact path inline with its budget instead of delegating, OR give `runExactSearch` an optional budget param. **DECISION (confirmed by the human): accept the drop** — the inline exact path delegates to the unbudgeted `runExactSearch`; exact matching is fast/bounded, so the near-never-firing 6000ms per-record guard is intentionally not preserved. Implement the drop as written; do not re-add a budget.
> 2. Fuzzy behavior (seq derivation via `typeof`-guard, empty-skip, whole-ungapped SW, rev remap `start = L - rcRange.end`) is moved verbatim — unchanged.

- [ ] **Step 2: Rewire `useSearchWorker`**

Replace the entire `executeSearchInline` `useCallback` (lines 118-232) with a thin wrapper that calls the extracted function, preserving the `useCallback` identity used by `runInlineFallback`/`handleSearch` deps:

```typescript
  const executeSearchInline = useCallback(
    (request: SearchWorkerRequest): SearchResult[] => runInlineSearch(request),
    [],
  );
```

Add `import { runInlineSearch } from '@/services/search/runInlineSearch';` to the imports. Remove now-unused imports from `@/services/searchLogic` **only if** they are no longer referenced elsewhere in the hook — CHECK: `degenerateToRegex`, `getNonGapSegments`, `mapUngappedRangeToAligned`, `removeGapsWithMap`, `reverseComplement`, `smithWaterman` were imported for `executeSearchInline`. After this task `searchState.ts` extraction (Task C) has not happened yet, so `getSequenceContext`/join still live in the hook but do not use those primitives. Run `npm run lint` / `tsc` — if any of those six imports is now unused, delete it; if `tsc`/eslint flags an unused import, remove exactly that one. Do not remove imports still in use.

- [ ] **Step 3: Write the equivalence test**

Create `services/search/__tests__/runInlineSearch.test.ts` (AGPL header + below). Exact-mode values pinned; fuzzy assertions are `>=` property bounds. Values recomputed from the real `executeSearchInline` logic via `tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { runInlineSearch } from '../runInlineSearch';
import type { SearchWorkerRequest } from '../../../src/workers/protocol';

function req(
  overrides: Partial<SearchWorkerRequest> & Pick<SearchWorkerRequest, 'searchQuery' | 'records' | 'mode'>,
): SearchWorkerRequest {
  return {
    requestId: 1,
    options: { minScore: 5, strand: 'both', maxResults: 100 },
    ...overrides,
  } as SearchWorkerRequest;
}

describe('runInlineSearch — guards', () => {
  it('returns [] for an empty query', () => {
    expect(runInlineSearch(req({ searchQuery: '', records: [{ id: 'r1', sequence: 'ACGT' }], mode: 'exact' }))).toEqual([]);
  });
});

describe('runInlineSearch — exact mode (delegates to runExactSearch)', () => {
  it('finds a forward match with pinned coordinates', () => {
    expect(runInlineSearch(req({
      searchQuery: 'ACG', records: [{ id: 'r1', sequence: 'TTACGTT' }],
      mode: 'exact', options: { minScore: 0, strand: 'fwd', maxResults: 100 },
    }))).toEqual([
      { start: 2, end: 5, sequence: 'ACG', recordId: 'r1', strand: 1, segments: [{ start: 2, end: 5 }] },
    ]);
  });

  it('remaps a reverse exact match onto forward coordinates', () => {
    expect(runInlineSearch(req({
      searchQuery: 'ACG', records: [{ id: 'r1', sequence: 'TTACGTT' }],
      mode: 'exact', options: { minScore: 0, strand: 'rev', maxResults: 100 },
    }))).toEqual([
      { start: 3, end: 6, sequence: 'ACG', recordId: 'r1', strand: -1, segments: [{ start: 3, end: 6 }] },
    ]);
  });

  it('sorts by start then recordId and applies maxResults', () => {
    const out = runInlineSearch(req({
      searchQuery: 'AA', records: [{ id: 'r1', sequence: 'AAAA' }],
      mode: 'exact', options: { minScore: 0, strand: 'fwd', maxResults: 2 },
    }));
    expect(out).toEqual([
      { start: 0, end: 2, sequence: 'AA', recordId: 'r1', strand: 1, segments: [{ start: 0, end: 2 }] },
      { start: 1, end: 3, sequence: 'AA', recordId: 'r1', strand: 1, segments: [{ start: 1, end: 3 }] },
    ]);
  });

  it('scans alignedSequence when present, splitting segments across a gap', () => {
    // executeSearchInline derives seq from alignedSequence via typeof-guard; the
    // IUPAC regex for 'ACG' matches the gapped run 'A-CG' → segments split.
    const out = runInlineSearch(req({
      searchQuery: 'ACG', records: [{ id: 'r1', sequence: 'AAA', alignedSequence: 'A-CGTT' }],
      mode: 'exact', options: { minScore: 0, strand: 'fwd', maxResults: 100 },
    }));
    expect(out).toEqual([
      { start: 0, end: 4, sequence: 'A-CG', recordId: 'r1', strand: 1, segments: [{ start: 0, end: 1 }, { start: 2, end: 4 }] },
    ]);
  });
});

describe('runInlineSearch — fuzzy mode (whole-ungapped Smith-Waterman)', () => {
  it('returns score-bearing hits sorted by score descending (property bounds only)', () => {
    const out = runInlineSearch(req({
      searchQuery: 'ACGTACGT', records: [{ id: 'r1', sequence: 'TTTACGTACGTTTT' }],
      mode: 'fuzzy', options: { minScore: 5, strand: 'fwd', maxResults: 100 },
    }));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].strand).toBe(1);
    expect(out[0].recordId).toBe('r1');
    expect(out[0].start).toBeLessThan(out[0].end);
    // score is Smith-Waterman-derived: assert a >= lower bound, never a pinned value
    expect(out[0].score ?? 0).toBeGreaterThanOrEqual(out[out.length - 1].score ?? 0);
    expect(out[0].score ?? 0).toBeGreaterThan(0);
  });

  it('finds fuzzy hits on the reverse strand', () => {
    const out = runInlineSearch(req({
      searchQuery: 'ACGTACGT', records: [{ id: 'r1', sequence: 'TTTACGTACGTTTT' }],
      mode: 'fuzzy', options: { minScore: 5, strand: 'rev', maxResults: 100 },
    }));
    expect(out.some(r => r.strand === -1)).toBe(true);
    out.forEach(r => expect(r.start).toBeLessThan(r.end));
  });
});
```

> **Gapped test — must match Task A exactly:** the `A-CGTT` exact case above asserts the **gap-spanning** match `{start:0,end:4,sequence:'A-CG',segments:[{0,1},{2,4}]}`. This is identical to Task A's `exact.test.ts` gapped assertion — as it must be, since Task B delegates the exact path to `runExactSearch`, so the shared function has ONE behavior. Both were computed from source (`degenerateToRegex('ACG').source === 'A-*C-*G'`). Keep the two assertions byte-identical; if you touch one, touch both.

- [ ] **Step 4: Run tests + typecheck + build**

```bash
rtk proxy npx vitest run services/search/__tests__/runInlineSearch.test.ts services/search/__tests__/runSearch.test.ts services/search/__tests__/exact.test.ts
npm run typecheck > /dev/null 2>&1; echo "tc=$?"    # 0
npm run build > /dev/null 2>&1; echo "build=$?"     # 0 (proves the hook still wires under Vite)
```

- [ ] **Step 5: Commit**

```bash
git add services/search/runInlineSearch.ts services/search/__tests__/runInlineSearch.test.ts src/app/hooks/useSearchWorker.ts
git commit -m "refactor(search): extract useSearchWorker.executeSearchInline to services/search/runInlineSearch"
```

---

## Task C: `searchState.ts` → `src/app/logic/searchState.ts` + rewire `useSearchWorker`

**Files:**
- Create: `src/app/logic/searchState.ts`
- Test: `src/app/logic/__tests__/searchState.test.ts`
- Modify: `src/app/hooks/useSearchWorker.ts` (`filteredResults`, `groupedSearchResults`, join-core, `getSequenceContext` call the extracted fns)

**Interfaces:**
- Consumes: `SearchResult`, `SeqRecord` from `@/src/domain/bio/types`; `GroupedSearchResults` from `../components/SearchPanel`.
- Produces:
  - `export function filteredResults(searchResults: SearchResult[], searchMode: 'exact' | 'fuzzy', maxScoreFound: number, minScore: number): SearchResult[]`
  - `export function groupedSearchResults(filtered: SearchResult[]): GroupedSearchResults`
  - `export function joinSegments(results: Pick<SearchResult, 'start' | 'end' | 'strand' | 'recordId'>[], mode: 'record' | 'selection'): { start: number; end: number; segments: { start: number; end: number }[] } | { error: 'few' } | { error: 'mixed' }`
  - `export function getSequenceContext(record: SeqRecord | undefined, start: number, end: number, contextLen?: number): { pre: string; match: string; post: string }`

> **Side-effect boundary:** `joinAllInRecord`/`joinSelectedMatches` in the hook do TWO things — validate+compute segments, and call `alert(...)` + `addAnnotationFromSearch(...)`. Extract ONLY the validation+computation into `joinSegments`, returning a discriminated result. The hook inspects the result: on `{error:'mixed'}` it calls `alert(...)`; on `{error:'few'}` it returns silently (matching the current `< 2` early-return); on success it calls `addAnnotationFromSearch(...)`. `alert` stays in the hook.

> **`joinSegments` mode difference (preserve exactly):** `joinAllInRecord` sorts segments by start (`.sort((a,b)=>a.start-b.start)`) and spans `segments[0].start`→`segments[last].end`. `joinSelectedMatches` does NOT sort — it maps in selected-index order and spans `Math.min(...starts)`→`Math.max(...ends)`, and additionally rejects mixed `recordId` (not just mixed strand). Encode both via the `mode` param: `mode==='record'` → sort + min/max via sorted ends, single-record already (grouped by recordId), reject mixed strand only. `mode==='selection'` → no sort, min-start/max-end, reject mixed recordId OR strand. Return the `segments` array in the same order the hook currently passes to `addAnnotationFromSearch` (sorted for record mode; selection-order for selection mode).

- [ ] **Step 1: Create `src/app/logic/searchState.ts`**

AGPL header, then:

```typescript
import type { SearchResult, SeqRecord } from '@/src/domain/bio/types';
import type { GroupedSearchResults } from '../components/SearchPanel';

/** Fuzzy results filtered by minScore percentage; passthrough for exact / no-max. */
export function filteredResults(
  searchResults: SearchResult[],
  searchMode: 'exact' | 'fuzzy',
  maxScoreFound: number,
  minScore: number,
): SearchResult[] {
  if (searchMode !== 'fuzzy' || maxScoreFound === 0) return searchResults;
  return searchResults.filter(
    r => ((r.score ?? 0) / maxScoreFound) * 100 >= minScore,
  );
}

/** Groups results by recordId, preserving each result's original filtered index. */
export function groupedSearchResults(filtered: SearchResult[]): GroupedSearchResults {
  const groups: GroupedSearchResults = {};
  filtered.forEach((r, idx) => {
    if (!groups[r.recordId]) groups[r.recordId] = { results: [], indices: [] };
    groups[r.recordId].results.push(r);
    groups[r.recordId].indices.push(idx);
  });
  return groups;
}

type JoinInput = Pick<SearchResult, 'start' | 'end' | 'strand' | 'recordId'>;

/**
 * Pure join-segment core for joinAllInRecord ('record') / joinSelectedMatches
 * ('selection'). Returns the spanned range + segments, or a discriminated error;
 * the `alert` side-effect stays in the hook.
 *
 * - 'record':    < 2 → {error:'few'}; mixed strand → {error:'mixed'};
 *                else segments sorted by start, span sorted[0].start→sorted[last].end.
 * - 'selection': < 2 → {error:'few'}; mixed recordId OR strand → {error:'mixed'};
 *                else segments in input order, span min(starts)→max(ends).
 */
export function joinSegments(
  results: JoinInput[],
  mode: 'record' | 'selection',
): { start: number; end: number; segments: { start: number; end: number }[] } | { error: 'few' } | { error: 'mixed' } {
  if (results.length < 2) return { error: 'few' };
  const strand = results[0].strand;
  if (mode === 'record') {
    if (results.some(r => r.strand !== strand)) return { error: 'mixed' };
    const segments = results
      .map(r => ({ start: r.start, end: r.end }))
      .sort((a, b) => a.start - b.start);
    return { start: segments[0].start, end: segments[segments.length - 1].end, segments };
  }
  // selection
  const recordId = results[0].recordId;
  if (results.some(m => m.recordId !== recordId || m.strand !== strand)) return { error: 'mixed' };
  const segments = results.map(m => ({ start: m.start, end: m.end }));
  return {
    start: Math.min(...segments.map(s => s.start)),
    end: Math.max(...segments.map(s => s.end)),
    segments,
  };
}

/** Extracts pre/match/post context around a match range within a record's sequence. */
export function getSequenceContext(
  record: SeqRecord | undefined,
  start: number,
  end: number,
  contextLen = 8,
): { pre: string; match: string; post: string } {
  if (!record) return { pre: '', match: '', post: '' };
  const seq = record.alignedSequence || record.sequence;
  return {
    pre: seq.substring(Math.max(0, start - contextLen), start),
    match: seq.substring(start, end),
    post: seq.substring(end, Math.min(seq.length, end + contextLen)),
  };
}
```

- [ ] **Step 2: Rewire `useSearchWorker`**

- `filteredResults` `useMemo` body → `useMemo(() => filteredResults(searchResults, searchMode, maxScoreFound, searchOptions.minScore), [searchResults, searchMode, maxScoreFound, searchOptions.minScore])`. **Watch the name clash:** the hook's local memo is also called `filteredResults`. Import the function under an alias, e.g. `import { filteredResults as computeFilteredResults, groupedSearchResults as computeGroupedSearchResults, joinSegments, getSequenceContext as computeSequenceContext } from '@/src/app/logic/searchState';`, then `const filteredResults = useMemo(() => computeFilteredResults(...), [...]);`.
- `groupedSearchResults` `useMemo` → `useMemo(() => computeGroupedSearchResults(filteredResults), [filteredResults])`.
- `joinAllInRecord`: keep the `groupedSearchResults[recordId]` lookup + early `if (!group) return;` in the hook; call `joinSegments(group.results, 'record')`; on `{error:'few'}` return; on `{error:'mixed'}` call the existing `alert('All matches in the record must have the same strand to be joined automatically.')`; on success call `addAnnotationFromSearch(recordId, res.start, res.end, \`Joined Record Search: ${searchQuery}\`, res.segments)`.
- `joinSelectedMatches`: keep the `selectedSearchIndices` → `matches` mapping in the hook; call `joinSegments(matches, 'selection')`; on `{error:'few'}` return; on `{error:'mixed'}` call `alert('All selected matches must be on the same sequence and strand to be joined.')`; on success call `addAnnotationFromSearch(recordId, res.start, res.end, \`Joined Search: ${searchQuery}\`, res.segments)`. Note `recordId = matches[0].recordId` still computed in the hook for the call.
- `getSequenceContext`: replace the body with `const record = records.find(r => r.id === recordId); return computeSequenceContext(record, start, end, contextLen);`.
- Remove now-unused imports (`GroupedSearchResults` may still be needed as a type in the hook's return type — keep it if referenced).

> **Behavior-preservation caveat:** `joinAllInRecord`'s `< 2` guard currently lives as `if (!group || group.results.length < 2) return;` in the hook. After extraction, keep `if (!group) return;` in the hook (guards the map lookup) and let `joinSegments` return `{error:'few'}` for `< 2`, which the hook treats as a silent return — identical net behavior.

- [ ] **Step 3: Write the test**

Create `src/app/logic/__tests__/searchState.test.ts` (AGPL header + below). All values recomputed from source via `tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  filteredResults,
  groupedSearchResults,
  joinSegments,
  getSequenceContext,
} from '../searchState';
import type { SearchResult, SeqRecord } from '@/src/domain/bio/types';

const mk = (o: Partial<SearchResult>): SearchResult => ({
  start: 0, end: 1, sequence: 'A', recordId: 'r1', strand: 1, ...o,
});

describe('filteredResults', () => {
  const rs = [mk({ score: 100 }), mk({ score: 50 }), mk({ score: 19 })];
  it('passes exact mode through unfiltered', () => {
    expect(filteredResults(rs, 'exact', 100, 20)).toHaveLength(3);
  });
  it('passes fuzzy through unfiltered when maxScoreFound is 0', () => {
    expect(filteredResults(rs, 'fuzzy', 0, 20)).toHaveLength(3);
  });
  it('keeps only fuzzy results at or above the minScore percentage', () => {
    // 100/100=100% keep, 50/100=50% keep, 19/100=19% < 20% drop
    expect(filteredResults(rs, 'fuzzy', 100, 20).map(r => r.score)).toEqual([100, 50]);
  });
  it('keeps a result exactly at the boundary (>=)', () => {
    expect(filteredResults([mk({ score: 20 })], 'fuzzy', 100, 20)).toHaveLength(1);
  });
  it('treats a missing score as 0', () => {
    expect(filteredResults([mk({})], 'fuzzy', 100, 20)).toHaveLength(0);
  });
});

describe('groupedSearchResults', () => {
  it('groups by recordId preserving original filtered indices', () => {
    const out = groupedSearchResults([mk({ recordId: 'r1' }), mk({ recordId: 'r2' }), mk({ recordId: 'r1' })]);
    expect(out.r1.results).toHaveLength(2);
    expect(out.r1.indices).toEqual([0, 2]);
    expect(out.r2.indices).toEqual([1]);
  });
  it('returns an empty object for no results', () => {
    expect(groupedSearchResults([])).toEqual({});
  });
});

describe('joinSegments — record mode', () => {
  it('rejects fewer than two matches', () => {
    expect(joinSegments([mk({ start: 0, end: 5 })], 'record')).toEqual({ error: 'few' });
  });
  it('rejects mixed strands', () => {
    expect(joinSegments([mk({ strand: 1 }), mk({ strand: -1 })], 'record')).toEqual({ error: 'mixed' });
  });
  it('sorts segments by start and spans first-start to last-end', () => {
    expect(joinSegments([mk({ start: 10, end: 15 }), mk({ start: 0, end: 5 })], 'record')).toEqual({
      start: 0, end: 15, segments: [{ start: 0, end: 5 }, { start: 10, end: 15 }],
    });
  });
});

describe('joinSegments — selection mode', () => {
  it('rejects mixed recordId (even when strand matches)', () => {
    expect(joinSegments([mk({ recordId: 'r1' }), mk({ recordId: 'r2' })], 'selection')).toEqual({ error: 'mixed' });
  });
  it('preserves input order and spans min-start to max-end', () => {
    expect(joinSegments([mk({ start: 10, end: 15 }), mk({ start: 0, end: 5 })], 'selection')).toEqual({
      start: 0, end: 15, segments: [{ start: 10, end: 15 }, { start: 0, end: 5 }],
    });
  });
});

describe('getSequenceContext', () => {
  const rec = (seq: string, aligned?: string): SeqRecord => ({
    id: 'r1', name: 'r1', sequence: seq, alignedSequence: aligned, features: [],
  });
  it('returns empty strings when the record is missing', () => {
    expect(getSequenceContext(undefined, 3, 6)).toEqual({ pre: '', match: '', post: '' });
  });
  it('clamps context to sequence bounds (contextLen 2)', () => {
    expect(getSequenceContext(rec('ACGTACGTAC'), 3, 6, 2)).toEqual({ pre: 'CG', match: 'TAC', post: 'GT' });
  });
  it('clamps at both edges when context exceeds the sequence', () => {
    expect(getSequenceContext(rec('ACGT'), 0, 4, 8)).toEqual({ pre: '', match: 'ACGT', post: '' });
  });
  it('prefers alignedSequence over sequence', () => {
    expect(getSequenceContext(rec('ACGT', 'A-CGT'), 0, 3, 2)).toEqual({ pre: '', match: 'A-C', post: 'GT' });
  });
});
```

- [ ] **Step 4: Run tests + typecheck + build**

```bash
rtk proxy npx vitest run src/app/logic/__tests__/searchState.test.ts
npm run typecheck > /dev/null 2>&1; echo "tc=$?"    # 0
npm run build > /dev/null 2>&1; echo "build=$?"     # 0
```

- [ ] **Step 5: Commit**

```bash
git add src/app/logic/searchState.ts src/app/logic/__tests__/searchState.test.ts src/app/hooks/useSearchWorker.ts
git commit -m "refactor(search): extract searchState derivations from useSearchWorker"
```

---

## Task D: `bioResponse.ts` → `src/app/logic/bioResponse.ts` + rewire `useBioWorker`

**Files:**
- Create: `src/app/logic/bioResponse.ts`
- Test: `src/app/logic/__tests__/bioResponse.test.ts`
- Modify: `src/app/hooks/useBioWorker.ts` (`onmessage` `setState` updaters call the extracted reducers)

**Interfaces:**
- Consumes: `SeqRecord`, `BioFeature`, `QuantitativeTrack` from `@/src/domain/bio/types`; `makeUniqueId` from `@/services/idHelpers`; `ParseFastaSuccessResponse` alignedData type from protocol.
- Produces:
  - `export function resolveAccession(incomingAccession: string | undefined, incomingId: string, uniqueId: string): string`
  - `export function applyParseSuccess(prev: SeqRecord[], incoming: SeqRecord[]): { next: SeqRecord[]; count: number }`
  - `export function applyAnnotations(prev: SeqRecord[], annotations: Record<string, (BioFeature | QuantitativeTrack)[]>): { next: SeqRecord[]; totalAdded: number; unmatched: string[] }`
  - `export function applyFastaResponse(prev: SeqRecord[], alignedData: FastaAlignedRecord[], asAlignment: boolean | undefined): { next: SeqRecord[] } & ({ kind: 'batch'; count: number } | { kind: 'overlay'; length: number } | { kind: 'reject-mismatch'; missing: string[]; extra: string[] } | { kind: 'reject-length'; lengths: number[] })`

> **Logging boundary:** the `onmessage` closures interleave `addLog(...)` calls with the record math. Extract ONLY the record math, returning the counts/ids the log lines need (`count`, `totalAdded`, `unmatched`, `length`, `missing`, `extra`, `lengths`, and a `kind` discriminant for FASTA). The hook keeps every `addLog(...)` call, reading those returned fields. This keeps `addLog` (a side effect) in the thin layer while making the reducers pure and fully testable.

- [ ] **Step 1: Create `src/app/logic/bioResponse.ts`**

AGPL header, then the reducer bodies lifted **verbatim** from `useBioWorker.ts` (`resolveAccession` 36-45; PARSE_SUCCESS 81-96; ANNOTATIONS_SUCCESS 100-142; FASTA_SUCCESS 146-194), with `postMessage`/`addLog`/`setState` stripped out and the needed counts returned:

```typescript
import { SeqRecord, BioFeature, QuantitativeTrack } from '@/src/domain/bio/types';
import { makeUniqueId } from '@/services/idHelpers';

/** The record shape carried in a FASTA_SUCCESS response's alignedData. */
export type FastaAlignedRecord = Pick<SeqRecord, 'id' | 'name' | 'sequence' | 'features' | 'moleculeType'>;

/** Accession precedence: trimmed incoming accession > incoming id (unless 'Unknown') > uniqueId. */
export function resolveAccession(
  incomingAccession: string | undefined,
  incomingId: string,
  uniqueId: string,
): string {
  const normalizedAccession = incomingAccession?.trim();
  if (normalizedAccession) return normalizedAccession;
  if (incomingId && incomingId !== 'Unknown') return incomingId;
  return uniqueId;
}

/** Batch-append parsed records with id dedup + accession resolution + visible:true. */
export function applyParseSuccess(
  prev: SeqRecord[],
  incoming: SeqRecord[],
): { next: SeqRecord[]; count: number } {
  const existingIds = prev.map(r => r.id);
  const newRecords = incoming.map(r => {
    const uniqueId = makeUniqueId(r.id, existingIds);
    existingIds.push(uniqueId);
    return {
      ...r,
      id: uniqueId,
      name: uniqueId,
      accession: resolveAccession(r.accession, r.id, uniqueId),
      visible: true,
    };
  });
  return { next: [...prev, ...newRecords], count: newRecords.length };
}

/** Merge annotation items into matching records, splitting features vs tracks by the `'data' in item` discriminant. */
export function applyAnnotations(
  prev: SeqRecord[],
  annotations: Record<string, (BioFeature | QuantitativeTrack)[]>,
): { next: SeqRecord[]; totalAdded: number; unmatched: string[] } {
  let totalAdded = 0;
  const matchedIds = new Set<string>();

  const lookupItems = (r: SeqRecord) =>
    annotations[r.id] ??
    annotations[r.name] ??
    (r.accession ? annotations[r.accession] : undefined) ??
    [];

  const next = prev.map(r => {
    const items = lookupItems(r);
    if (items.length > 0) {
      const newFeats = items.filter((i): i is BioFeature => !('data' in i));
      const newTracks = items.filter((i): i is QuantitativeTrack => 'data' in i);
      totalAdded += items.length;
      matchedIds.add(r.id);
      return {
        ...r,
        features: [...r.features, ...newFeats],
        tracks: [...(r.tracks ?? []), ...newTracks],
      };
    }
    return r;
  });

  const fileIds = Object.keys(annotations);
  const unmatched = fileIds.filter(
    id => !prev.some(r => r.id === id || r.name === id || r.accession === id),
  );
  return { next, totalAdded, unmatched };
}

/**
 * FASTA_SUCCESS reducer. When !asAlignment: batch-append with dedup (like
 * applyParseSuccess but accession resolves from undefined). When asAlignment:
 * validate exact ID match (missing/extra) and uniform length, then overlay
 * alignedSequence onto matching records. Returns a discriminated `kind`.
 */
export function applyFastaResponse(
  prev: SeqRecord[],
  alignedData: FastaAlignedRecord[],
  asAlignment: boolean | undefined,
):
  | ({ next: SeqRecord[]; kind: 'batch'; count: number })
  | ({ next: SeqRecord[]; kind: 'overlay'; length: number })
  | ({ next: SeqRecord[]; kind: 'reject-mismatch'; missing: string[]; extra: string[] })
  | ({ next: SeqRecord[]; kind: 'reject-length'; lengths: number[] }) {
  if (!asAlignment) {
    const existingIds = prev.map(r => r.id);
    const newRecords = alignedData.map(r => {
      const uniqueId = makeUniqueId(r.id, existingIds);
      existingIds.push(uniqueId);
      return {
        ...r,
        id: uniqueId,
        name: uniqueId,
        accession: resolveAccession(undefined, r.id, uniqueId),
        visible: true,
      };
    });
    return { next: [...prev, ...newRecords], kind: 'batch', count: newRecords.length };
  }

  const currentIds = new Set(prev.map(r => r.id));
  const uploadedIds = new Set(alignedData.map(d => d.id));
  const missing = prev.filter(r => !uploadedIds.has(r.id)).map(r => r.id);
  const extra = alignedData.filter(d => !currentIds.has(d.id)).map(d => d.id);

  if (missing.length > 0 || extra.length > 0) {
    return { next: prev, kind: 'reject-mismatch', missing, extra };
  }

  const lengths = new Set(alignedData.map(d => d.sequence.length));
  if (lengths.size > 1) {
    return { next: prev, kind: 'reject-length', lengths: Array.from(lengths) };
  }

  const next = prev.map(r => {
    const match = alignedData.find(d => d.id === r.id);
    return { ...r, alignedSequence: match?.sequence };
  });
  return { next, kind: 'overlay', length: alignedData[0]?.sequence.length ?? 0 };
}
```

- [ ] **Step 2: Rewire `useBioWorker` `onmessage`**

Replace the four inline updater bodies with calls; keep every `addLog` and `setIsProcessing`:

- PARSE_SUCCESS:
  ```typescript
  setRecords(prev => {
    const { next, count } = applyParseSuccess(prev, msg.records);
    addLog(`Batch ingestion complete: ${count} records added.`);
    return next;
  });
  ```
  (Note: the original `addLog` fires inside the updater; keep it there to preserve ordering.)
- ANNOTATIONS_SUCCESS:
  ```typescript
  setRecords(prev => {
    const { next, totalAdded, unmatched } = applyAnnotations(prev, msg.annotations);
    if (unmatched.length > 0) {
      addLog(`WARNING: Some IDs in file did not match active records: [${unmatched.slice(0, 5).join(', ')}${unmatched.length > 5 ? '...' : ''}]`);
    }
    addLog(`Annotation import complete: ${totalAdded} features added across records.`);
    return next;
  });
  ```
- FASTA_SUCCESS:
  ```typescript
  const { alignedData, asAlignment } = msg;
  setRecords(prev => {
    const res = applyFastaResponse(prev, alignedData, asAlignment);
    switch (res.kind) {
      case 'batch':
        addLog(`Batch ingestion complete: ${res.count} records added.`); break;
      case 'reject-mismatch':
        addLog(`ERROR: Sequence mismatch. Missing: [${res.missing.join(', ')}], Extra: [${res.extra.join(', ')}]`); break;
      case 'reject-length':
        addLog(`ERROR: Aligned sequences must have identical lengths. Found: ${res.lengths.join(', ')}`); break;
      case 'overlay':
        addLog(`External alignment applied successfully (${res.length} bp).`); break;
    }
    return res.next;
  });
  ```
- Remove the now-inlined local `resolveAccession` function (36-45) from the hook; import it (or don't import it if only used inside `bioResponse`). `makeUniqueId` import in the hook can be dropped if no longer referenced — CHECK and remove if unused.

Add `import { applyParseSuccess, applyAnnotations, applyFastaResponse } from '@/src/app/logic/bioResponse';`.

> **Behavior-preservation caveat:** the original log-string interpolations are reproduced byte-for-byte above (`[${unmatched.slice(0, 5)...}${... > 5 ? '...' : ''}]`, `${res.length} bp`, `Found: ${...join(', ')}`). Keep them exact — the tests assert on returned data, but `build`+manual read is the log-parity check.

- [ ] **Step 3: Write the test**

Create `src/app/logic/__tests__/bioResponse.test.ts` (AGPL header + below). All values recomputed from source via `tsx` (dedup suffix format is `"g1 (1)"`, confirmed against `makeUniqueId`):

```typescript
import { describe, it, expect } from 'vitest';
import {
  resolveAccession,
  applyParseSuccess,
  applyAnnotations,
  applyFastaResponse,
} from '../bioResponse';
import type { SeqRecord, BioFeature, QuantitativeTrack } from '@/src/domain/bio/types';

const rec = (o: Partial<SeqRecord> & { id: string }): SeqRecord => ({
  name: o.id, sequence: '', features: [], ...o,
});

describe('resolveAccession', () => {
  it('prefers a trimmed non-empty incoming accession', () => {
    expect(resolveAccession('  ACC1 ', 'id1', 'u1')).toBe('ACC1');
  });
  it('falls back to the incoming id when accession is blank', () => {
    expect(resolveAccession('   ', 'id1', 'u1')).toBe('id1');
  });
  it('skips the id when it is "Unknown", using the uniqueId', () => {
    expect(resolveAccession(undefined, 'Unknown', 'u1')).toBe('u1');
  });
  it('uses the uniqueId when both accession and id are empty', () => {
    expect(resolveAccession('', '', 'u1')).toBe('u1');
  });
});

describe('applyParseSuccess', () => {
  it('appends with id dedup, name=id, resolved accession, and visible:true', () => {
    const prev = [rec({ id: 'g1', accession: 'g1' })];
    const { next, count } = applyParseSuccess(prev, [
      rec({ id: 'g1', accession: 'ACC9' }),
      rec({ id: 'g2' }),
    ]);
    expect(count).toBe(2);
    expect(next.slice(1).map(r => ({ id: r.id, name: r.name, accession: r.accession, visible: r.visible }))).toEqual([
      { id: 'g1 (1)', name: 'g1 (1)', accession: 'ACC9', visible: true },
      { id: 'g2', name: 'g2', accession: 'g2', visible: true },
    ]);
    // prev record is preserved unchanged
    expect(next[0]).toBe(prev[0]);
  });
});

describe('applyAnnotations', () => {
  const feat = (name: string): BioFeature => ({ type: 'gene', name, start: 0, end: 5, strand: 1 });
  const track = (id: string): QuantitativeTrack => ({ id, name: id, data: [{ start: 0, end: 5, value: 1 }] });

  it('splits features vs tracks by the `data` discriminant, counts totalAdded, appends to existing', () => {
    const prev = [rec({ id: 'r1', features: [feat('f0')], tracks: [] })];
    const { next, totalAdded, unmatched } = applyAnnotations(prev, {
      r1: [feat('featA'), track('t1')],
      ghostId: [feat('x')],
    });
    expect(totalAdded).toBe(2);
    expect(unmatched).toEqual(['ghostId']);
    expect(next[0].features.map(f => f.name)).toEqual(['f0', 'featA']);
    expect(next[0].tracks?.map(t => t.id)).toEqual(['t1']);
  });

  it('leaves unmatched-id truncation to the caller (returns the full list)', () => {
    const annotations: Record<string, BioFeature[]> = {};
    for (let i = 0; i < 8; i++) annotations['id' + i] = [feat('f')];
    const { unmatched } = applyAnnotations([], annotations);
    expect(unmatched).toHaveLength(8);
    expect(unmatched.slice(0, 5)).toEqual(['id0', 'id1', 'id2', 'id3', 'id4']);
  });

  it('matches by name and accession, not just id', () => {
    const prev = [rec({ id: 'r1', name: 'displayName', accession: 'ACC1' })];
    const byAcc = applyAnnotations(prev, { ACC1: [feat('viaAcc')] });
    expect(byAcc.next[0].features.map(f => f.name)).toEqual(['viaAcc']);
    expect(byAcc.unmatched).toEqual([]);
  });
});

describe('applyFastaResponse', () => {
  const fa = (id: string, sequence: string) => ({ id, name: id, sequence, features: [] as BioFeature[], moleculeType: 'dna' as const });

  it('batch-appends with dedup when asAlignment is false', () => {
    const prev = [rec({ id: 'a' })];
    const res = applyFastaResponse(prev, [fa('a', 'ACGT'), fa('b', 'ACGT')], false);
    expect(res.kind).toBe('batch');
    if (res.kind === 'batch') {
      expect(res.count).toBe(2);
      expect(res.next.slice(1).map(r => r.id)).toEqual(['a (1)', 'b']);
      expect(res.next.slice(1).every(r => r.visible === true)).toBe(true);
    }
  });

  it('overlays alignedSequence onto matching records when ids match exactly and lengths agree', () => {
    const prev = [rec({ id: 'a', sequence: 'ACGT' }), rec({ id: 'b', sequence: 'ACGT' })];
    const res = applyFastaResponse(prev, [fa('a', 'AC-GT'), fa('b', 'ACGGT')], true);
    expect(res.kind).toBe('overlay');
    if (res.kind === 'overlay') {
      expect(res.length).toBe(5);
      expect(res.next.map(r => r.alignedSequence)).toEqual(['AC-GT', 'ACGGT']);
    }
  });

  it('rejects with kind reject-mismatch when a current record is missing from the upload', () => {
    const prev = [rec({ id: 'a', sequence: 'ACGT' }), rec({ id: 'b', sequence: 'ACGT' })];
    const res = applyFastaResponse(prev, [fa('a', 'ACGT')], true);
    expect(res.kind).toBe('reject-mismatch');
    if (res.kind === 'reject-mismatch') {
      expect(res.missing).toEqual(['b']);
      expect(res.extra).toEqual([]);
      expect(res.next).toBe(prev);
    }
  });

  it('rejects with kind reject-mismatch on an extra upload id', () => {
    const prev = [rec({ id: 'a', sequence: 'ACGT' }), rec({ id: 'b', sequence: 'ACGT' })];
    const res = applyFastaResponse(prev, [fa('a', 'ACGT'), fa('b', 'ACGT'), fa('c', 'ACGT')], true);
    expect(res.kind).toBe('reject-mismatch');
    if (res.kind === 'reject-mismatch') expect(res.extra).toEqual(['c']);
  });

  it('rejects with kind reject-length on non-uniform aligned lengths', () => {
    const prev = [rec({ id: 'a', sequence: 'ACGT' }), rec({ id: 'b', sequence: 'ACGT' })];
    const res = applyFastaResponse(prev, [fa('a', 'ACGT'), fa('b', 'ACGTA')], true);
    expect(res.kind).toBe('reject-length');
    if (res.kind === 'reject-length') expect(res.lengths).toEqual([4, 5]);
  });
});
```

- [ ] **Step 4: Run tests + typecheck + build**

```bash
rtk proxy npx vitest run src/app/logic/__tests__/bioResponse.test.ts
npm run typecheck > /dev/null 2>&1; echo "tc=$?"    # 0
npm run build > /dev/null 2>&1; echo "build=$?"     # 0
```

- [ ] **Step 5: Commit**

```bash
git add src/app/logic/bioResponse.ts src/app/logic/__tests__/bioResponse.test.ts src/app/hooks/useBioWorker.ts
git commit -m "refactor(bio): extract bioResponse reducers from useBioWorker"
```

---

## Task E: `featureManager.ts` → `src/app/logic/featureManager.ts` + rewire `useFeatureManager`

**Files:**
- Create: `src/app/logic/featureManager.ts`
- Test: `src/app/logic/__tests__/featureManager.test.ts`
- Modify: `src/app/hooks/useFeatureManager.ts` (mutations/derivations call the extracted fns)

**Interfaces:**
- Consumes: `SeqRecord`, `BioFeature`, `SelectionArea` from `@/src/domain/bio/types`; `getOriginalPos` from `@/services/bioUtils`; `FlatItem` from `../components/DatabaseHubPanel`.
- Produces:
  - `export function saveEditedFeature(records: SeqRecord[], recordId: string, featureIndex: number, feature: BioFeature): SeqRecord[]`
  - `export function removeFeature(records: SeqRecord[], recordId: string, featureIndex: number): { next: SeqRecord[]; removedName: string | undefined }`
  - `export function toggleRecordVisibility(records: SeqRecord[], recordId: string): SeqRecord[]`
  - `export function groupFeaturesBySearch(records: SeqRecord[], featureSearch: string): Record<string, (BioFeature & { index: number })[]>`
  - `export function buildFlattenedFeatures(records: SeqRecord[], featureSearch: string): FlatItem[]`
  - `export function newFeatureFromSelection(records: SeqRecord[], activeSelection: SelectionArea | null): { targetRecordId: string; start: number; end: number } | null`
  - `export function annotationCoords(targetRecord: SeqRecord | undefined, start: number, end: number, segments?: { start: number; end: number }[]): { start: number; end: number; segments?: { start: number; end: number }[] }`

> **Log boundary:** `removeFeature` currently does `addLog(\`Removed feature: ${removed[0].name}\`)` inside the updater. Extract the splice as a pure reducer returning `{ next, removedName }`; the hook keeps the `addLog`. **Watch the null-safety:** the original indexes `removed[0].name` — if `featureIndex` is out of range, `splice` returns `[]` and `removed[0]` throws. Preserve this exact behavior (return `removedName: removed[0]?.name` and let the hook log it; the hook's original would throw on a bad index, so to be byte-identical either keep the throw by using `removed[0].name` in the reducer, OR return `undefined` and note the divergence). **DECISION (confirmed by the human): return `removedName: removed[0]?.name`** (no throw) and have the hook log `Removed feature: ${removedName}`. This intentionally turns a latent crash on an out-of-range index into a `Removed feature: undefined` log — a strictly safer, near-identical behavior (the UI only ever passes valid indices). Implement the `?.` version as written.

- [ ] **Step 1: Create `src/app/logic/featureManager.ts`**

AGPL header, then bodies lifted **verbatim** from `useFeatureManager.ts` (groupedFeatures 84-101; flattenedFeatures 108-119; toggleRecordVisibility 123-127; removeFeature 129-142; saveEditedFeature 144-162; startNewFeature coord math 164-190; addAnnotationFromSearch coord math 192-233):

```typescript
import { SeqRecord, BioFeature, SelectionArea } from '@/src/domain/bio/types';
import { getOriginalPos } from '@/services/bioUtils';
import type { FlatItem } from '../components/DatabaseHubPanel';

/** Insert (featureIndex === -1) or replace a feature on the matching record. */
export function saveEditedFeature(
  records: SeqRecord[],
  recordId: string,
  featureIndex: number,
  feature: BioFeature,
): SeqRecord[] {
  return records.map(r => {
    if (r.id !== recordId) return r;
    const newFeatures = [...r.features];
    if (featureIndex === -1) newFeatures.push(feature);
    else newFeatures[featureIndex] = feature;
    return { ...r, features: newFeatures };
  });
}

/** Splice out a feature; returns the new records and the removed feature's name (undefined if out of range). */
export function removeFeature(
  records: SeqRecord[],
  recordId: string,
  featureIndex: number,
): { next: SeqRecord[]; removedName: string | undefined } {
  let removedName: string | undefined;
  const next = records.map(r => {
    if (r.id !== recordId) return r;
    const newFeatures = [...r.features];
    const removed = newFeatures.splice(featureIndex, 1);
    removedName = removed[0]?.name;
    return { ...r, features: newFeatures };
  });
  return { next, removedName };
}

/** Flip the `visible` flag on the matching record (undefined → true). */
export function toggleRecordVisibility(records: SeqRecord[], recordId: string): SeqRecord[] {
  return records.map(r => (r.id === recordId ? { ...r, visible: !r.visible } : r));
}

/** Per-record features filtered case-insensitively by name/type/definition/metadata, with original index attached. */
export function groupFeaturesBySearch(
  records: SeqRecord[],
  featureSearch: string,
): Record<string, (BioFeature & { index: number })[]> {
  const groups: Record<string, (BioFeature & { index: number })[]> = {};
  const search = featureSearch.toLowerCase();
  records.forEach(r => {
    groups[r.id] = r.features
      .map((f, idx) => ({ ...f, index: idx }))
      .filter(f => {
        const inName = f.name.toLowerCase().includes(search);
        const inType = f.type.toLowerCase().includes(search);
        const inDef = r.definition?.toLowerCase().includes(search);
        const inMeta = f.metadata
          ? Object.values(f.metadata).some(v => v.toLowerCase().includes(search))
          : false;
        return inName || inType || inDef || inMeta;
      });
  });
  return groups;
}

/** Flat header/track/feature list for the virtualised DatabaseHubPanel. */
export function buildFlattenedFeatures(records: SeqRecord[], featureSearch: string): FlatItem[] {
  const groupedFeatures = groupFeaturesBySearch(records, featureSearch);
  const items: FlatItem[] = [];
  Object.entries(groupedFeatures).forEach(([recordId, features]) => {
    const record = records.find(r => r.id === recordId);
    const tracks = record?.tracks || [];
    if (features.length === 0 && tracks.length === 0 && featureSearch) return;
    items.push({ type: 'header', recordId, count: features.length + tracks.length });
    tracks.forEach(t => items.push({ type: 'track', recordId, track: t }));
    features.forEach(f => items.push({ type: 'feature', recordId, feature: f }));
  });
  return items;
}

/** Default coordinates for a new feature, seeded from the current selection (or 0..100). */
export function newFeatureFromSelection(
  records: SeqRecord[],
  activeSelection: SelectionArea | null,
): { targetRecordId: string; start: number; end: number } | null {
  if (records.length === 0) return null;
  let start = 0;
  let end = 100;
  let targetRecordId = records[0].id;

  if (activeSelection) {
    targetRecordId = activeSelection.recordIds[0] || records[0].id;
    const targetRecord = records.find(r => r.id === targetRecordId);
    if (targetRecord) {
      start = getOriginalPos(
        targetRecord.alignedSequence || targetRecord.sequence,
        Math.min(activeSelection.start, activeSelection.end),
      );
      end = getOriginalPos(
        targetRecord.alignedSequence || targetRecord.sequence,
        Math.max(activeSelection.start, activeSelection.end),
      );
    }
  }
  return { targetRecordId, start, end };
}

/** Convert viewport (aligned) match coordinates to original-sequence coordinates for a new annotation. */
export function annotationCoords(
  targetRecord: SeqRecord | undefined,
  start: number,
  end: number,
  segments?: { start: number; end: number }[],
): { start: number; end: number; segments?: { start: number; end: number }[] } {
  let finalStart = start;
  let finalEnd = end;
  let finalSegments = segments;

  if (targetRecord) {
    const seq = targetRecord.alignedSequence || targetRecord.sequence;
    finalStart = getOriginalPos(seq, start);
    finalEnd = getOriginalPos(seq, end);
    if (segments) {
      finalSegments = segments
        .map(seg => ({
          start: getOriginalPos(seq, seg.start),
          end: getOriginalPos(seq, seg.end),
        }))
        .sort((a, b) => a.start - b.start);
    }
  }
  return { start: finalStart, end: finalEnd, segments: finalSegments };
}
```

- [ ] **Step 2: Rewire `useFeatureManager`**

- `groupedFeatures` `useMemo` → `useMemo(() => groupFeaturesBySearch(records, featureSearch), [records, featureSearch])`.
- `flattenedFeatures` `useMemo` → `useMemo(() => buildFlattenedFeatures(records, featureSearch), [records, featureSearch])`. (`allFeaturesCount` is a trivial reduce — LEAVE IT in the hook, not worth extracting.)
- `toggleRecordVisibility` → `setRecords(prev => toggleRecordVisibility(prev, recordId));` (alias the import to avoid the name clash, e.g. `toggleRecordVisibility as toggleVisibility`).
- `removeFeature` →
  ```typescript
  setRecords(prev => {
    const { next, removedName } = removeFeatureReducer(prev, recordId, featureIndex);
    addLog(`Removed feature: ${removedName}`);
    return next;
  });
  ```
  (import aliased as `removeFeature as removeFeatureReducer`.)
- `saveEditedFeature` →
  ```typescript
  setRecords(prev => saveEditedFeatureReducer(prev, recordId, featureIndex, feature));
  addLog(featureIndex === -1 ? `New feature '${feature.name}' created.` : 'Feature metadata updated.');
  setEditing(null);
  ```
  (import aliased as `saveEditedFeature as saveEditedFeatureReducer`; keep the destructure of `editing` and the `if (!editing) return;` guard in the hook.)
- `startNewFeature` →
  ```typescript
  const coords = newFeatureFromSelection(records, activeSelection);
  if (!coords) return;
  setEditing({ recordId: coords.targetRecordId, featureIndex: -1, feature: { name: 'New Feature', type: 'misc_feature', start: coords.start, end: coords.end, strand: 1 } });
  ```
- `addAnnotationFromSearch` →
  ```typescript
  const targetRecord = records.find(r => r.id === recordId);
  const c = annotationCoords(targetRecord, start, end, segments);
  setEditing({ recordId, featureIndex: -1, feature: { name, type: 'misc_feature', start: c.start, end: c.end, strand: 1, segments: c.segments } });
  addLog(`Preparing annotation for match${segments ? ' (multi-segment)' : ''} at ${c.start} bp.`);
  ```
- Remove the now-unused `getOriginalPos` import from the hook IF it is no longer referenced there (it moved into `featureManager.ts`). CHECK with `tsc`/eslint and delete only if flagged unused.

Add `import { saveEditedFeature as saveEditedFeatureReducer, removeFeature as removeFeatureReducer, toggleRecordVisibility as toggleVisibility, groupFeaturesBySearch, buildFlattenedFeatures, newFeatureFromSelection, annotationCoords } from '@/src/app/logic/featureManager';`.

> **Behavior-preservation caveat (removeFeature):** see the log-boundary note above — the reducer now returns `undefined` for an out-of-range index instead of throwing. Confirm the orchestrator accepts this; the UI never passes a bad index, so it is behavior-preserving in practice.

- [ ] **Step 3: Write the test**

Create `src/app/logic/__tests__/featureManager.test.ts` (AGPL header + below). All values recomputed from source via `tsx` (`getOriginalPos('A-CG-T', ...)` mapping: p0→0, p2→1, p4→3, p5→3, p6→4):

```typescript
import { describe, it, expect } from 'vitest';
import {
  saveEditedFeature,
  removeFeature,
  toggleRecordVisibility,
  groupFeaturesBySearch,
  buildFlattenedFeatures,
  newFeatureFromSelection,
  annotationCoords,
} from '../featureManager';
import type { SeqRecord, BioFeature } from '@/src/domain/bio/types';

const feat = (o: Partial<BioFeature> & { name: string }): BioFeature => ({
  type: 'misc_feature', start: 0, end: 5, strand: 1, ...o,
});
const rec = (o: Partial<SeqRecord> & { id: string }): SeqRecord => ({
  name: o.id, sequence: '', features: [], ...o,
});

describe('saveEditedFeature', () => {
  it('appends when featureIndex is -1', () => {
    const recs = [rec({ id: 'r1', features: [feat({ name: 'a' })] })];
    expect(saveEditedFeature(recs, 'r1', -1, feat({ name: 'b' }))[0].features.map(f => f.name)).toEqual(['a', 'b']);
  });
  it('replaces at the given index', () => {
    const recs = [rec({ id: 'r1', features: [feat({ name: 'a' })] })];
    expect(saveEditedFeature(recs, 'r1', 0, feat({ name: 'z' }))[0].features.map(f => f.name)).toEqual(['z']);
  });
  it('leaves non-matching records untouched (same reference)', () => {
    const recs = [rec({ id: 'r1', features: [] }), rec({ id: 'r2', features: [] })];
    expect(saveEditedFeature(recs, 'r1', -1, feat({ name: 'x' }))[1]).toBe(recs[1]);
  });
});

describe('removeFeature', () => {
  it('splices the feature and reports its name', () => {
    const recs = [rec({ id: 'r1', features: [feat({ name: 'a' }), feat({ name: 'b' })] })];
    const { next, removedName } = removeFeature(recs, 'r1', 0);
    expect(next[0].features.map(f => f.name)).toEqual(['b']);
    expect(removedName).toBe('a');
  });
  it('reports undefined for an out-of-range index (no throw)', () => {
    const recs = [rec({ id: 'r1', features: [feat({ name: 'a' })] })];
    const { next, removedName } = removeFeature(recs, 'r1', 9);
    expect(next[0].features.map(f => f.name)).toEqual(['a']);
    expect(removedName).toBeUndefined();
  });
});

describe('toggleRecordVisibility', () => {
  it('flips an explicit true to false', () => {
    expect(toggleRecordVisibility([rec({ id: 'r1', visible: true })], 'r1')[0].visible).toBe(false);
  });
  it('treats undefined visibility as flipping to true', () => {
    expect(toggleRecordVisibility([rec({ id: 'r1' })], 'r1')[0].visible).toBe(true);
  });
});

describe('groupFeaturesBySearch', () => {
  it('attaches the original index and filters case-insensitively by name', () => {
    const recs = [rec({ id: 'r1', features: [feat({ name: 'GeneAlpha' }), feat({ name: 'other' })] })];
    const out = groupFeaturesBySearch(recs, 'alpha');
    expect(out.r1.map(f => ({ name: f.name, index: f.index }))).toEqual([{ name: 'GeneAlpha', index: 0 }]);
  });
  it('matches on type, definition, and metadata values', () => {
    const recs = [rec({ id: 'r1', definition: 'plasmid', features: [feat({ name: 'x', metadata: { note: 'HELLO' } })] })];
    expect(groupFeaturesBySearch(recs, 'plasmid').r1).toHaveLength(1); // via definition
    expect(groupFeaturesBySearch(recs, 'hello').r1).toHaveLength(1);   // via metadata (case-insensitive)
  });
});

describe('buildFlattenedFeatures', () => {
  it('orders header, then tracks, then features; header count = features + tracks', () => {
    const recs = [rec({ id: 'r1', features: [feat({ name: 'g1' }), feat({ name: 'g2' })], tracks: [{ id: 't1', name: 'trk', data: [] }] })];
    const out = buildFlattenedFeatures(recs, '');
    expect(out.map(i => i.type)).toEqual(['header', 'track', 'feature', 'feature']);
    expect(out[0]).toMatchObject({ type: 'header', count: 3 });
  });
  it('drops a record whose features+tracks are empty when a search filter is active', () => {
    const recs = [rec({ id: 'r1', features: [feat({ name: 'x' })], tracks: [] })];
    expect(buildFlattenedFeatures(recs, 'zzz')).toEqual([]);
    expect(buildFlattenedFeatures(recs, '').map(i => i.type)).toEqual(['header', 'feature']);
  });
});

describe('newFeatureFromSelection', () => {
  it('returns null for no records', () => {
    expect(newFeatureFromSelection([], { recordIds: ['r1'], start: 0, end: 2 })).toBeNull();
  });
  it('defaults to 0..100 on the first record when there is no selection', () => {
    expect(newFeatureFromSelection([rec({ id: 'r1', sequence: 'ACGT' })], null)).toEqual({ targetRecordId: 'r1', start: 0, end: 100 });
  });
  it('maps a reversed selection to original coordinates via min/max', () => {
    // aligned 'A-CG-TAC': getOriginalPos(2)=1, getOriginalPos(5)=3
    const recs = [rec({ id: 'r1', sequence: 'ACGTAC', alignedSequence: 'A-CG-TAC' })];
    expect(newFeatureFromSelection(recs, { recordIds: ['r1'], start: 5, end: 2 })).toEqual({ targetRecordId: 'r1', start: 1, end: 3 });
  });
});

describe('annotationCoords', () => {
  it('passes coordinates through unchanged when the record is missing', () => {
    expect(annotationCoords(undefined, 3, 6)).toEqual({ start: 3, end: 6, segments: undefined });
  });
  it('converts aligned to original coordinates and sorts converted segments', () => {
    // aligned 'A-CG-T': getOriginalPos(2)=1, getOriginalPos(5)=3, getOriginalPos(4)=3, getOriginalPos(6)=4
    const record = rec({ id: 'r1', sequence: 'ACGT', alignedSequence: 'A-CG-T' });
    expect(annotationCoords(record, 2, 5, [{ start: 4, end: 6 }])).toEqual({
      start: 1, end: 3, segments: [{ start: 3, end: 4 }],
    });
  });
});
```

- [ ] **Step 4: Run tests + typecheck + build**

```bash
rtk proxy npx vitest run src/app/logic/__tests__/featureManager.test.ts
npm run typecheck > /dev/null 2>&1; echo "tc=$?"    # 0
npm run build > /dev/null 2>&1; echo "build=$?"     # 0
```

- [ ] **Step 5: Commit**

```bash
git add src/app/logic/featureManager.ts src/app/logic/__tests__/featureManager.test.ts src/app/hooks/useFeatureManager.ts
git commit -m "refactor(feature): extract featureManager reducers/derivations from useFeatureManager"
```

---

## Task F: Add `src/app/logic/**` to coverage include, re-baseline gate, full CI mirror, open PR

**Files:**
- Modify: `vite.config.ts` (add include entry + thresholds)

- [ ] **Step 1: Add `src/app/logic/**` to `coverage.include`**

In `vite.config.ts`, add `"src/app/logic/**"` to the `include` array (alongside `"services/**"`, `"src/app/recordRemoval.ts"`, `"src/domain/**"`). The existing `exclude` (`**/__tests__/**`, `**/*.test.ts`, `**/index.ts`, `**/types.ts`) already keeps test files and barrels out.

- [ ] **Step 2: Measure new achieved coverage on the scoped set**

```bash
rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "gate=$?"
node -e '
const s=require("./coverage/coverage-summary.json").total;
const pick=k=>Math.max(0, Math.floor(s[k].pct) - 4);
console.log("achieved:", JSON.stringify({lines:s.lines.pct,branches:s.branches.pct,functions:s.functions.pct,statements:s.statements.pct}));
console.log("suggested thresholds:", JSON.stringify({lines:pick("lines"),branches:pick("branches"),functions:pick("functions"),statements:pick("statements")}));
'
```
If `gate` is non-zero at the OLD thresholds, note which metric dropped (the new logic modules should raise lines/functions; a few defensive branches — e.g. `annotations[r.accession]` when `accession` is undefined, or the fuzzy `ungappedRcSeq.length === 0` continue — may pull branches down slightly). The re-baseline fixes it.

- [ ] **Step 3: Update thresholds in `vite.config.ts`**

Set the four `thresholds` values to the printed `suggested thresholds` (achieved floored −4). **Raise, never lower** from the current 94/85/93/92: for any metric whose `achieved − 4` exceeds the current floor, raise to that; for any metric that would drop below the current floor, KEEP the current floor and investigate why the aggregate fell (usually a genuinely-uncovered defensive branch — add a targeted test rather than lowering). Update the ratchet comment block (lines 58-61) to record the new achieved numbers and "Phase 2A PR2". Then:

```bash
rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "gate after rebaseline=$?"   # expect 0
```

- [ ] **Step 4: Full CI mirror**

```bash
npm run typecheck > /dev/null 2>&1; echo "typecheck=$?"
npm run lint > /dev/null 2>&1; echo "lint=$?"
rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "coverage=$?"
npm run build > /dev/null 2>&1; echo "build=$?"
```
All four must be `0` (lint `0` = warnings only, matching PR1's convention).

- [ ] **Step 5: Commit + push + PR**

```bash
git add vite.config.ts
git commit -m "ci(coverage): include src/app/logic and re-baseline ratchet after app-state extraction"
git push -u origin test-phase2-pr2-appstate
gh pr create --base main --title "refactor+test: Phase 2A PR2 — extract & test app-state logic" \
  --body "$(cat <<'BODY'
Behavior-preserving extraction of the app-state reducers/derivations out of the three hooks (useBioWorker, useSearchWorker, useFeatureManager) into src/app/logic/** (bioResponse, searchState, featureManager), plus the shared runExactSearch and the inline fallback runInlineSearch into services/search/**. Hooks become thin wiring; the extracted pure core is now unit-tested in node. No new deps. runSearch's existing tests stay green as the exact-path identity proof.

See docs/superpowers/specs/2026-07-01-test-phase2a-extraction-design.md and docs/superpowers/plans/2026-07-01-test-phase2a-pr2-appstate.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## Self-review

- **Spec coverage:** every PR2 item from the design maps to a task — `bioResponse` (`resolveAccession`, `applyBioResponse` split into `applyParseSuccess`/`applyAnnotations`/`applyFastaResponse`) → Task D; `searchState` (`filteredResults`, `groupedSearchResults`, join-core, `getSequenceContext`) → Task C; `featureManager` (reducers, `buildFlattenedFeatures`, new-feature coords) → Task E; `services/search/exact.ts` `runExactSearch` + `runSearch` refactor → Task A; `services/search/runInlineSearch.ts` → Task B; coverage include + re-baseline → Task F.
- **Behavior preservation:** each extraction moves a closure body verbatim; only the wrapper changes. Tasks A/B/C/D/E each run `npm run build` (proves the hooks/worker still wire under Vite) and Task A additionally keeps `runSearch`'s existing tests green as the exact-path identity proof. Side effects (`alert`, `addLog`, `setState`, `Worker`, `setTimeout`) all stay in the thin hook layer; the extracted core returns data for the hook to act on.
- **Test values:** every exact-mode coordinate, dedup id (`"g1 (1)"`), accession-precedence result, annotation split/count, FASTA reject kind, filter percentage, group index, join span, sequence-context clamp, and `getOriginalPos` conversion in this plan was computed by running the real `services/searchLogic`, `services/bioUtils`, and `services/idHelpers` against the closures via `tsx` — not guessed. Fuzzy `score` assertions are `>=` property bounds only (never pinned), per the determinism constraint.
- **Determinism:** `runInlineSearch` fuzzy tests use tiny inputs (time budget never trips) and property-bound score assertions; exact tests pin arithmetic coordinates.
- **Placeholder scan:** all new source (five modules) and all test code is shown in full — no TODOs. The two "verbatim move from lines N-M" references (Tasks A/B) point at exact existing source ranges rather than re-pasting; the target function bodies are also shown in full for clarity.
- **Decisions recorded (were open risks):** (1) the gapped-`alignedSequence` exact assertion must be pinned identically in `exact.test.ts` and `runInlineSearch.test.ts` after a confirming `tsx` run (Task A Step 4 / Task B Step 3 notes) — a verification step, not a change; (2) **RESOLVED** — dropping the inline 6000ms per-record exact budget is confirmed accepted (Task B); (3) **RESOLVED** — `removeFeature` uses the safe `removed[0]?.name` (logs `undefined` for an out-of-range index instead of throwing), confirmed accepted (Task E); (4) `runExactSearch` hoists `degenerateToRegex` out of the per-record loop — behavior-identical (loop resets `lastIndex=0` each use), no decision needed (Task A Step 1).
