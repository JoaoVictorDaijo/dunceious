# Phase 2A · PR3 — View-Model Helper Extraction Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the five inline pure view-model helpers currently trapped inside JSX/closures in `RecordDetailsModal`, `DatabaseHubPanel`, `SearchPanel`, `App`, and `FeatureEditorModal` into a single node-testable module `src/app/logic/viewModel.ts` — behavior-preserving — then unit-test each with no new dependencies. Every extracted helper is a pure string/number/array computation; all side effects (clipboard, `onChange` callbacks, navigation, `useMemo` wiring) stay in the components.

**Architecture:** Each inline expression/IIFE/`useMemo` body moves **verbatim** into a pure exported function in `viewModel.ts`; the component then imports it and calls it in place of the inline logic. The five helpers are independent (no shared state), so each is its own task ending in an independently-committable deliverable. `npm run typecheck` + `npm run build` staying green after each task is the behavior-preservation proof — `build` proving the components still wire under Vite. None of these helpers call Phase-1 `services`/`domain` code (they are self-contained string/number/array math), so there is nothing to re-verify from earlier phases. `src/app/logic/**` is already in the coverage `include` (added in PR2), so `viewModel.ts` is auto-measured; the final task only re-baselines the ratchet thresholds if achieved rose.

**Tech Stack:** TypeScript, Vitest 4.1.2 (env `node`), `@vitest/coverage-v8`.

## Global Constraints

- No new dependencies. Test env stays `node`. Branch: `test-phase2-pr3-viewmodel` (already checked out, off `main` which already contains the merged PR2 — `src/app/logic/{bioResponse,searchState,featureManager}.ts` exist; `viewModel.ts` is a NEW sibling in that existing dir).
- Every new source file starts with the 18-line AGPL header **identical to `services/bioUtils.ts` lines 1-18** (same header the existing `src/app/logic/*.ts` files carry).
- Extraction is **behavior-preserving**: move the inline expression/IIFE/`useMemo` body verbatim — only the wrapper (params in, value out) changes. Do NOT rewrite logic or "improve" it. In particular **keep the `parseInt`-NaN quirk as-is** (an unparseable coordinate yields `NaN`; document it, do not guard it). If a test cannot pass, recompute the expected value from source; if the code is genuinely wrong, STOP and report — do not weaken the test or change production semantics.
- **Reuse, don't re-verify Phase-1 code.** These helpers do not call `getOriginalPos` or any `services`/`domain` helper — they are self-contained. (The feature-coordinate-to-original mapping via `getOriginalPos` lives in `featureManager.ts` and was covered in PR2; it is out of scope here.) If that turns out to be wrong for any helper, trust the already-tested callee and test only the new orchestration.
- **Side effects stay in the component.** `navigator.clipboard.writeText`, `onCopyLog`, `onChange`/`setFeature`, `onFocusFeature`, `useMemo`/React wiring, `.toLocaleString()` formatting, and JSX all stay in the components. Extract ONLY the pure computation (the raw string, the raw number, the plain patch object). Formatting (`.toLocaleString()`) is a presentation concern and stays in JSX — the helper returns the raw `number`.
- **Determinism / exact values:** these are pure string/number/array helpers — pin exact expected values. Every value in this plan was computed from the real inline source via a `tsx` scratch run (see per-task "Verified values" notes). The one non-obvious case is the `parseInt('abc') → NaN` coordinate patch: `Object.is(NaN, NaN)` is `true`, so vitest `toEqual({ start: NaN })` passes, but the plan uses explicit `Number.isNaN(...)` assertions for clarity.
- Coverage gate `include` already covers `src/app/logic/**` (auto-measures `viewModel.ts`). No `vite.config.ts` `include` change is needed. The final task ONLY re-baselines the ratchet thresholds if achieved rose (raise, never lower). Current floors: lines 94 / branches 85 / functions 93 / statements 92 (ratchet comment records PR2 achieved 98.3 / 89.4 / 97.5 / 96.5).
- After each task: `npm run typecheck` and `npm run build` must stay green (behavior-preservation), plus the task's tests.
- RTK note: if `vitest`/`npx` output looks garbled/truncated, prefix the command with `rtk proxy`.

## File structure

| File | Responsibility |
|---|---|
| `src/app/logic/viewModel.ts` (create in Task A, append in B–E) | `getDisplaySeq`, `featureLength`, `scorePercent`, `deriveAlignmentState`, `featureCoordPatch` — the five pure view-model helpers |
| `src/app/logic/__tests__/viewModel.test.ts` (create in Task A, append in B–E) | unit tests for the five helpers |
| `src/app/components/RecordDetailsModal.tsx` (modify — Task A) | `getDisplaySeq` closure → call the extracted fn |
| `src/app/components/DatabaseHubPanel.tsx` (modify — Task B) | per-feature length IIFE → call the extracted fn |
| `src/app/components/SearchPanel.tsx` (modify — Task C) | score-percentage expression → call the extracted fn |
| `src/app/App.tsx` (modify — Task D) | three alignment-state `useMemo` bodies → call the extracted fn |
| `src/app/components/FeatureEditorModal.tsx` (modify — Task E) | start/end `onChange` patch logic → call the extracted fn |
| `vite.config.ts` (modify — Task F, only if thresholds rose) | re-baseline ratchet thresholds |

**Task order (each ends in an independently-committable deliverable):**
A → create `viewModel.ts` with `getDisplaySeq` + rewire `RecordDetailsModal`. B → append `featureLength` + rewire `DatabaseHubPanel`. C → append `scorePercent` + rewire `SearchPanel`. D → append `deriveAlignmentState` + rewire `App`. E → append `featureCoordPatch` + rewire `FeatureEditorModal`. F → full CI mirror + threshold re-baseline (if needed) + PR.

Each of A–E appends its function to the SAME `viewModel.ts` and its tests to the SAME `viewModel.test.ts` (do not create five modules — the spec's Module layout locks `viewModel.ts` as one file).

---

## Task A: `getDisplaySeq` → create `src/app/logic/viewModel.ts` + rewire `RecordDetailsModal`

**Files:**
- Create: `src/app/logic/viewModel.ts`
- Create: `src/app/logic/__tests__/viewModel.test.ts`
- Modify: `src/app/components/RecordDetailsModal.tsx` (replace the `getDisplaySeq` closure body with a call)

**Interfaces:**
- Consumes: nothing (pure string math). Optionally `Pick<BioFeature, 'start' | 'end'>` from `@/src/domain/bio/types` for the param type.
- Produces: `export function getDisplaySeq(sequence: string, feature: { start: number; end: number } | null): string`

**Source (verbatim, `RecordDetailsModal.tsx:44-49`):**
```typescript
const getDisplaySeq = (): string => {
  if (!feature) return record.sequence;
  const { start, end } = feature;
  if (start <= end) return record.sequence.substring(start, end);
  return record.sequence.substring(start) + record.sequence.substring(0, end);
};
```
The closure closes over `feature` and `record`. Extraction parameterises both: `sequence = record.sequence`, `feature = feature`. Behavior is identical — the circular-wrap branch (`start > end` → `substring(start) + substring(0, end)`) and the `null`-feature full-sequence branch are moved byte-for-byte.

**Verified values (`tsx` scratch, from the verbatim logic):**
- `getDisplaySeq('ACGTACGT', null)` → `'ACGTACGT'` (null → full sequence)
- `getDisplaySeq('ACGTACGT', { start: 2, end: 5 })` → `'GTA'` (start ≤ end → `substring(2,5)`)
- `getDisplaySeq('ACGTACGT', { start: 6, end: 2 })` → `'GTAC'` (wrap → `substring(6)`=`'GT'` + `substring(0,2)`=`'AC'`)
- `getDisplaySeq('ACGTACGT', { start: 3, end: 3 })` → `''` (start ≤ end → `substring(3,3)` = empty)

- [ ] **Step 1: Create `src/app/logic/viewModel.ts`**

AGPL header (identical to `services/bioUtils.ts` lines 1-18), then:

```typescript
/**
 * The sequence slice a record/feature detail view should display.
 *
 * Extracted verbatim from RecordDetailsModal's inline `getDisplaySeq`. With no
 * feature the whole sequence is shown. A normal feature (`start <= end`) shows
 * `substring(start, end)`. A circular wrap-around feature (`start > end`, which
 * crosses the origin) shows the tail then the head: `substring(start) +
 * substring(0, end)`. Pure string math; the clipboard/log side-effects stay in
 * the component.
 */
export function getDisplaySeq(
  sequence: string,
  feature: { start: number; end: number } | null,
): string {
  if (!feature) return sequence;
  const { start, end } = feature;
  if (start <= end) return sequence.substring(start, end);
  return sequence.substring(start) + sequence.substring(0, end);
}
```

- [ ] **Step 2: Rewire `RecordDetailsModal`**

Replace the local `getDisplaySeq` closure (lines 44-49) with a call to the extracted function. The component keeps `displaySeq` (line 51) and every side effect (`handleCopy` → `navigator.clipboard.writeText(displaySeq)` + `onCopyLog`, `handleFocus`, `handleExport`) unchanged:

```typescript
  const displaySeq = getDisplaySeq(record.sequence, feature);
```

Add `import { getDisplaySeq } from '@/src/app/logic/viewModel';` to the imports. Delete the now-removed inline closure. (The `logLabel`/`handleCopy`/`handleFocus`/`handleExport` block below stays — only lines 44-49 change to the single `displaySeq` line above, which folds the old line 51.)

- [ ] **Step 3: Write the test**

Create `src/app/logic/__tests__/viewModel.test.ts` (AGPL header + below). Values from the `tsx` scratch above:

```typescript
import { describe, it, expect } from 'vitest';
import { getDisplaySeq } from '../viewModel';

describe('getDisplaySeq', () => {
  it('returns the whole sequence when there is no feature', () => {
    expect(getDisplaySeq('ACGTACGT', null)).toBe('ACGTACGT');
  });
  it('slices substring(start, end) for a normal feature (start <= end)', () => {
    expect(getDisplaySeq('ACGTACGT', { start: 2, end: 5 })).toBe('GTA');
  });
  it('wraps around the origin for a circular feature (start > end)', () => {
    // substring(6) = 'GT', substring(0,2) = 'AC' -> 'GTAC'
    expect(getDisplaySeq('ACGTACGT', { start: 6, end: 2 })).toBe('GTAC');
  });
  it('returns an empty string for a zero-width feature (start === end)', () => {
    expect(getDisplaySeq('ACGTACGT', { start: 3, end: 3 })).toBe('');
  });
});
```

- [ ] **Step 4: Run tests + typecheck + build**

```bash
rtk proxy npx vitest run src/app/logic/__tests__/viewModel.test.ts
npm run typecheck > /dev/null 2>&1; echo "tc=$?"    # 0
npm run build > /dev/null 2>&1; echo "build=$?"     # 0
```

- [ ] **Step 5: Commit**

```bash
git add src/app/logic/viewModel.ts src/app/logic/__tests__/viewModel.test.ts src/app/components/RecordDetailsModal.tsx
git commit -m "refactor(viewModel): extract getDisplaySeq from RecordDetailsModal"
```

---

## Task B: `featureLength` → append to `viewModel.ts` + rewire `DatabaseHubPanel`

**Files:**
- Modify: `src/app/logic/viewModel.ts` (append)
- Modify: `src/app/logic/__tests__/viewModel.test.ts` (append)
- Modify: `src/app/components/DatabaseHubPanel.tsx` (replace the length IIFE with a call, keep `.toLocaleString()` in JSX)

**Interfaces:**
- Consumes: `FeatureSegment` from `@/src/domain/bio/types` (optional — the inline uses `seg: any`; a typed `{ start: number; end: number }[]` is behavior-identical).
- Produces: `export function featureLength(seqLen: number | undefined, start: number, end: number, segments?: { start: number; end: number }[]): number`

**Source (verbatim, `DatabaseHubPanel.tsx:238-248` IIFE):**
```typescript
{(() => {
  if (f.segments && f.segments.length > 0) {
    return f.segments.reduce((acc: number, seg: any) => acc + Math.abs(seg.end - seg.start), 0).toLocaleString();
  }
  if (f.start > f.end) {
    const record = records.find(r => r.id === recordId);
    const len = record ? (record.sequence.length - f.start) + f.end : Math.abs(f.end - f.start);
    return len.toLocaleString();
  }
  return Math.abs(f.end - f.start).toLocaleString();
})()}
```

**Extraction boundary (important):** the helper returns the raw **number**; `.toLocaleString()` stays in JSX. The circular branch needs `record.sequence.length`, which the IIFE resolves via `records.find(r => r.id === recordId)`. The `find` (a lookup over component state) stays in the component; the helper takes the resolved `seqLen` as a parameter. **Preserve the `record`-not-found fallback exactly:** when `f.start > f.end` but the record is missing, the original falls back to `Math.abs(f.end - f.start)`. Model this by passing `seqLen` only when the record is found, and having the helper treat a missing/undefined `seqLen` as the fallback. Concretely the helper signature takes `seqLen: number` and the component passes `record ? record.sequence.length : NaN`… — but a cleaner behavior-preserving shape is to pass a **nullable** `seqLen` and branch inside. Use this signature:

```typescript
export function featureLength(
  seqLen: number | undefined,
  start: number,
  end: number,
  segments?: { start: number; end: number }[],
): number
```

- [ ] **Step 1: Append `featureLength` to `viewModel.ts`**

```typescript
/**
 * The displayed length (in bp) of a feature, matching DatabaseHubPanel's inline
 * calc. Priority: (1) if it has segments, the sum of each segment's |end-start|;
 * (2) a circular wrap-around (`start > end`) on a known-length sequence spans
 * `(seqLen - start) + end`; (3) otherwise the simple `|end - start|`. If the
 * feature wraps but the owning record's length is unknown (`seqLen` undefined),
 * fall back to `|end - start|` (the component's record-not-found path). Returns
 * a raw number; the `.toLocaleString()` formatting stays in the component.
 */
export function featureLength(
  seqLen: number | undefined,
  start: number,
  end: number,
  segments?: { start: number; end: number }[],
): number {
  if (segments && segments.length > 0) {
    return segments.reduce((acc, seg) => acc + Math.abs(seg.end - seg.start), 0);
  }
  if (start > end) {
    return seqLen !== undefined ? (seqLen - start) + end : Math.abs(end - start);
  }
  return Math.abs(end - start);
}
```

> **Behavior-preservation note:** the original guarded the circular branch on `record` being truthy (`record ? ... : Math.abs(...)`). Here `seqLen === undefined` stands in for "record not found". The component passes `record ? record.sequence.length : undefined`, so the two paths map 1:1. The segment-sum and simple branches are byte-identical (`reduce`/`Math.abs`), and the `f.segments.length > 0` guard (empty `segments` array falls through to the length branches) is preserved.

- [ ] **Step 2: Rewire `DatabaseHubPanel`**

Replace the IIFE (lines 238-248) with:

```typescript
{(() => {
  const record = records.find(r => r.id === recordId);
  return featureLength(record?.sequence.length, f.start, f.end, f.segments).toLocaleString();
})()}
```

The `records.find` and the `.toLocaleString()` formatting stay in the component (lookup over component state + presentation). Add `import { featureLength } from '@/src/app/logic/viewModel';`. (You may drop the wrapping IIFE entirely and inline the two lines if the JSX allows, but keeping the IIFE is the minimal diff and equally behavior-preserving.)

**Verified values (`tsx` scratch):**
- `featureLength(100, 0, 0, [{start:5,end:10},{start:20,end:23}])` → `8` (5 + 3; note segments branch ignores start/end)
- `featureLength(100, 90, 10)` → `20` (circular: `(100-90)+10`)
- `featureLength(100, 5, 15)` → `10` (simple `|15-5|`)
- `featureLength(100, 20, 5)` → `85` (start>end circular path: `(100-20)+5`)
- `featureLength(undefined, 20, 5)` → `15` (circular but record missing → fallback `|5-20|`)
- `featureLength(100, 5, 15, [])` → `10` (empty segments array falls through to simple branch)

- [ ] **Step 3: Append the test**

Append to `src/app/logic/__tests__/viewModel.test.ts` (add `featureLength` to the top-level import from `'../viewModel'`):

```typescript
describe('featureLength', () => {
  it('sums |end - start| across all segments when segments are present', () => {
    expect(featureLength(100, 0, 0, [{ start: 5, end: 10 }, { start: 20, end: 23 }])).toBe(8);
  });
  it('spans (seqLen - start) + end for a circular wrap-around (start > end)', () => {
    expect(featureLength(100, 90, 10)).toBe(20);
  });
  it('returns |end - start| for a normal feature', () => {
    expect(featureLength(100, 5, 15)).toBe(10);
  });
  it('uses the circular formula for a reversed simple feature on a known-length record', () => {
    // start(20) > end(5) with seqLen 100 -> (100-20)+5
    expect(featureLength(100, 20, 5)).toBe(85);
  });
  it('falls back to |end - start| when the feature wraps but seqLen is unknown', () => {
    expect(featureLength(undefined, 20, 5)).toBe(15);
  });
  it('falls through an empty segments array to the length branch', () => {
    expect(featureLength(100, 5, 15, [])).toBe(10);
  });
});
```

- [ ] **Step 4: Run tests + typecheck + build**

```bash
rtk proxy npx vitest run src/app/logic/__tests__/viewModel.test.ts
npm run typecheck > /dev/null 2>&1; echo "tc=$?"    # 0
npm run build > /dev/null 2>&1; echo "build=$?"     # 0
```

- [ ] **Step 5: Commit**

```bash
git add src/app/logic/viewModel.ts src/app/logic/__tests__/viewModel.test.ts src/app/components/DatabaseHubPanel.tsx
git commit -m "refactor(viewModel): extract featureLength from DatabaseHubPanel"
```

---

## Task C: `scorePercent` → append to `viewModel.ts` + rewire `SearchPanel`

**Files:**
- Modify: `src/app/logic/viewModel.ts` (append)
- Modify: `src/app/logic/__tests__/viewModel.test.ts` (append)
- Modify: `src/app/components/SearchPanel.tsx` (replace the inline expression with a call, keep the `{match.score && (…)}` guard + `%` in JSX)

**Interfaces:**
- Consumes: nothing (pure number math).
- Produces: `export function scorePercent(score: number, maxScoreFound: number): number`

**Source (verbatim, `SearchPanel.tsx:294`):**
```typescript
{maxScoreFound > 0 ? Math.round((match.score / maxScoreFound) * 100) : 0}%
```
This sits inside `{match.score && ( … )}` (line 291), so `match.score` is truthy at the call site. The helper's `score` param is a plain `number`; the truthiness guard and the trailing `%` literal stay in JSX.

- [ ] **Step 1: Append `scorePercent` to `viewModel.ts`**

```typescript
/**
 * Fuzzy-match score as a whole-number percentage of the best score found,
 * matching SearchPanel's inline calc. Guards divide-by-zero: when
 * `maxScoreFound <= 0` returns 0. Otherwise `round((score / maxScoreFound) * 100)`.
 * The `%` suffix and the `match.score` truthiness guard stay in the component.
 */
export function scorePercent(score: number, maxScoreFound: number): number {
  return maxScoreFound > 0 ? Math.round((score / maxScoreFound) * 100) : 0;
}
```

- [ ] **Step 2: Rewire `SearchPanel`**

Replace line 294's inline expression with `{scorePercent(match.score, maxScoreFound)}%`. Keep the surrounding `{match.score && ( … )}` guard and the `%` literal. Add `import { scorePercent } from '@/src/app/logic/viewModel';`.

**Verified values (`tsx` scratch):**
- `scorePercent(50, 100)` → `50`
- `scorePercent(50, 0)` → `0` (divide-by-zero guard)
- `scorePercent(1, 3)` → `33` (33.33 → round down)
- `scorePercent(2, 3)` → `67` (66.66 → round up)
- `scorePercent(1, 8)` → `13` (12.5 → `Math.round` rounds half up to 13)

- [ ] **Step 3: Append the test**

Append to `viewModel.test.ts` (add `scorePercent` to the import):

```typescript
describe('scorePercent', () => {
  it('returns the exact percentage for a clean ratio', () => {
    expect(scorePercent(50, 100)).toBe(50);
  });
  it('guards divide-by-zero, returning 0 when maxScoreFound is 0', () => {
    expect(scorePercent(50, 0)).toBe(0);
  });
  it('rounds down below the half boundary', () => {
    expect(scorePercent(1, 3)).toBe(33); // 33.33...
  });
  it('rounds up above the half boundary', () => {
    expect(scorePercent(2, 3)).toBe(67); // 66.66...
  });
  it('rounds a .5 up (Math.round half-up)', () => {
    expect(scorePercent(1, 8)).toBe(13); // 12.5 -> 13
  });
});
```

- [ ] **Step 4: Run tests + typecheck + build**

```bash
rtk proxy npx vitest run src/app/logic/__tests__/viewModel.test.ts
npm run typecheck > /dev/null 2>&1; echo "tc=$?"    # 0
npm run build > /dev/null 2>&1; echo "build=$?"     # 0
```

- [ ] **Step 5: Commit**

```bash
git add src/app/logic/viewModel.ts src/app/logic/__tests__/viewModel.test.ts src/app/components/SearchPanel.tsx
git commit -m "refactor(viewModel): extract scorePercent from SearchPanel"
```

---

## Task D: `deriveAlignmentState` → append to `viewModel.ts` + rewire `App`

**Files:**
- Modify: `src/app/logic/viewModel.ts` (append)
- Modify: `src/app/logic/__tests__/viewModel.test.ts` (append)
- Modify: `src/app/App.tsx` (collapse the three `useMemo` bodies to call the extracted fn)

**Interfaces:**
- Consumes: `SeqRecord` from `@/src/domain/bio/types` (or a minimal `{ sequence: string; alignedSequence?: string }[]` projection — behavior-identical since only those two fields are read).
- Produces:
  ```typescript
  export function deriveAlignmentState(
    records: { sequence: string; alignedSequence?: string }[],
    isProteinSession: boolean,
  ): { isAlignmentLoaded: boolean; alignmentLength: number; sessionMoleculeType: 'nucleotide' | 'protein' | null }
  ```

**Source (verbatim, `App.tsx:195-208`, three separate `useMemo`s):**
```typescript
const isAlignmentLoaded = useMemo(() => {
  if (records.length < 2) return false;
  return new Set(records.map(r => (r.alignedSequence || r.sequence).length)).size === 1;
}, [records]);

const alignmentLength = useMemo(() => {
  if (records.length === 0) return 0;
  return Math.max(...records.map(r => (r.alignedSequence || r.sequence).length));
}, [records]);

const sessionMoleculeType = useMemo<'nucleotide' | 'protein' | null>(
  () => records.length === 0 ? null : (isProteinSession ? 'protein' : 'nucleotide'),
  [records, isProteinSession],
);
```

> **Source of `isProteinSession` (do not confuse with a component-local flag):** `isProteinSession` is destructured from `useSearchWorker(...)` at `App.tsx:126`. It is a boolean already in scope in `App`. The helper takes it as a parameter — no derivation of it inside `viewModel.ts`.

- [ ] **Step 1: Append `deriveAlignmentState` to `viewModel.ts`**

```typescript
/**
 * Alignment-related derived state for the App shell, combining the three inline
 * `useMemo` derivations verbatim:
 *  - `isAlignmentLoaded`: >= 2 records AND all (aligned-or-raw) lengths equal.
 *  - `alignmentLength`: max (aligned-or-raw) length; 0 for no records.
 *  - `sessionMoleculeType`: null for no records, else 'protein'/'nucleotide'
 *    from the session flag.
 * `alignedSequence || sequence` is the per-record length source. Pure; the
 * `useMemo` wiring stays in App.
 */
export function deriveAlignmentState(
  records: { sequence: string; alignedSequence?: string }[],
  isProteinSession: boolean,
): { isAlignmentLoaded: boolean; alignmentLength: number; sessionMoleculeType: 'nucleotide' | 'protein' | null } {
  const isAlignmentLoaded =
    records.length < 2
      ? false
      : new Set(records.map(r => (r.alignedSequence || r.sequence).length)).size === 1;
  const alignmentLength =
    records.length === 0
      ? 0
      : Math.max(...records.map(r => (r.alignedSequence || r.sequence).length));
  const sessionMoleculeType: 'nucleotide' | 'protein' | null =
    records.length === 0 ? null : isProteinSession ? 'protein' : 'nucleotide';
  return { isAlignmentLoaded, alignmentLength, sessionMoleculeType };
}
```

- [ ] **Step 2: Rewire `App`**

Replace the three `useMemo`s (lines 195-208) with a single memoised derivation destructured into the same three names, preserving memoisation and the exact dependency set (`records`, `isProteinSession`):

```typescript
  // ── Derived state ─────────────────────────────────────────────────────────
  const { isAlignmentLoaded, alignmentLength, sessionMoleculeType } = useMemo(
    () => deriveAlignmentState(records, isProteinSession),
    [records, isProteinSession],
  );
```

Add `import { deriveAlignmentState } from '@/src/app/logic/viewModel';`. Confirm `useMemo` is still imported in `App.tsx` (it is — the three originals use it). The downstream consumers (`isAlignmentLoaded={...}` line 296, `sessionMoleculeType={...}` lines 297 & 437, `alignmentLength={...}` line 308) are unchanged — they read the same three names.

> **Behavior-preservation note:** the original used three separate `useMemo`s; the rewire uses one. This is behavior-identical for the values (same inputs, same outputs) — the only change is one memo cell instead of three. The combined dep array `[records, isProteinSession]` is the union of the originals' deps (the first two depended on `[records]`, the third on `[records, isProteinSession]`), so nothing recomputes more or less often in a way that changes a rendered value. `build` + `typecheck` green confirms wiring.

**Verified values (`tsx` scratch):**
- `deriveAlignmentState([], false)` → `{ isAlignmentLoaded: false, alignmentLength: 0, sessionMoleculeType: null }`
- `deriveAlignmentState([{sequence:'ACGT'}], false)` → `{ isAlignmentLoaded: false, alignmentLength: 4, sessionMoleculeType: 'nucleotide' }` (1 record → not loaded)
- `deriveAlignmentState([{sequence:'ACGT'},{sequence:'TGCA'}], false)` → `{ isAlignmentLoaded: true, alignmentLength: 4, sessionMoleculeType: 'nucleotide' }` (2 equal)
- `deriveAlignmentState([{sequence:'ACGT'},{sequence:'TGC'}], false)` → `{ isAlignmentLoaded: false, alignmentLength: 4, sessionMoleculeType: 'nucleotide' }` (unequal lengths)
- `deriveAlignmentState([{sequence:'ACGT',alignedSequence:'AC-GT'},{sequence:'TGCA',alignedSequence:'TG-CA'}], true)` → `{ isAlignmentLoaded: true, alignmentLength: 5, sessionMoleculeType: 'protein' }` (alignedSequence preferred → length 5)
- `deriveAlignmentState([{sequence:'MK'}], true)` → `{ isAlignmentLoaded: false, alignmentLength: 2, sessionMoleculeType: 'protein' }`

- [ ] **Step 3: Append the test**

Append to `viewModel.test.ts` (add `deriveAlignmentState` to the import):

```typescript
describe('deriveAlignmentState', () => {
  it('reports no alignment and zero length for no records', () => {
    expect(deriveAlignmentState([], false)).toEqual({
      isAlignmentLoaded: false, alignmentLength: 0, sessionMoleculeType: null,
    });
  });
  it('requires at least two records to be considered aligned', () => {
    expect(deriveAlignmentState([{ sequence: 'ACGT' }], false)).toEqual({
      isAlignmentLoaded: false, alignmentLength: 4, sessionMoleculeType: 'nucleotide',
    });
  });
  it('is aligned when two records share an equal length', () => {
    expect(deriveAlignmentState([{ sequence: 'ACGT' }, { sequence: 'TGCA' }], false)).toEqual({
      isAlignmentLoaded: true, alignmentLength: 4, sessionMoleculeType: 'nucleotide',
    });
  });
  it('is not aligned when two records differ in length', () => {
    expect(deriveAlignmentState([{ sequence: 'ACGT' }, { sequence: 'TGC' }], false)).toEqual({
      isAlignmentLoaded: false, alignmentLength: 4, sessionMoleculeType: 'nucleotide',
    });
  });
  it('prefers alignedSequence length and honours the protein session flag', () => {
    expect(deriveAlignmentState(
      [{ sequence: 'ACGT', alignedSequence: 'AC-GT' }, { sequence: 'TGCA', alignedSequence: 'TG-CA' }],
      true,
    )).toEqual({ isAlignmentLoaded: true, alignmentLength: 5, sessionMoleculeType: 'protein' });
  });
  it('sets sessionMoleculeType to protein for a single protein record', () => {
    expect(deriveAlignmentState([{ sequence: 'MK' }], true)).toEqual({
      isAlignmentLoaded: false, alignmentLength: 2, sessionMoleculeType: 'protein',
    });
  });
});
```

- [ ] **Step 4: Run tests + typecheck + build**

```bash
rtk proxy npx vitest run src/app/logic/__tests__/viewModel.test.ts
npm run typecheck > /dev/null 2>&1; echo "tc=$?"    # 0
npm run build > /dev/null 2>&1; echo "build=$?"     # 0
```

- [ ] **Step 5: Commit**

```bash
git add src/app/logic/viewModel.ts src/app/logic/__tests__/viewModel.test.ts src/app/App.tsx
git commit -m "refactor(viewModel): extract deriveAlignmentState from App"
```

---

## Task E: `featureCoordPatch` → append to `viewModel.ts` + rewire `FeatureEditorModal`

**Files:**
- Modify: `src/app/logic/viewModel.ts` (append)
- Modify: `src/app/logic/__tests__/viewModel.test.ts` (append)
- Modify: `src/app/components/FeatureEditorModal.tsx` (both start/end `onChange` handlers call the extracted fn; `setFeature`/`onChange` side-effect stays)

**Interfaces:**
- Consumes: `BioFeature`, `FeatureSegment` from `@/src/domain/bio/types`.
- Produces:
  ```typescript
  export function featureCoordPatch(
    feature: Pick<BioFeature, 'start' | 'end' | 'segments'>,
    field: 'start' | 'end',
    rawValue: string,
  ): Partial<BioFeature>
  ```

**Source (verbatim, `FeatureEditorModal.tsx` — start handler 172-179, end handler 192-199):**
```typescript
// start onChange:
const val = parseInt(e.target.value);
const patch: Partial<BioFeature> = { start: val };
if (!feature.segments || feature.segments.length <= 1) {
  patch.segments = [{ start: val, end: feature.end }];
}
setFeature(patch);

// end onChange:
const val = parseInt(e.target.value);
const patch: Partial<BioFeature> = { end: val };
if (!feature.segments || feature.segments.length <= 1) {
  patch.segments = [{ start: feature.start, end: val }];
}
setFeature(patch);
```
The two handlers are identical modulo the edited field. Extract the patch **computation** (everything up to but not including `setFeature(patch)`) into `featureCoordPatch(feature, field, rawValue)`. `setFeature(patch)` (which calls `onChange({ ...editing, feature: { ...feature, ...patch } })`) stays in the component — it is the side effect. `parseInt(e.target.value)` becomes `parseInt(rawValue)` inside the helper (the `e.target.value` string is passed in).

> **Preserve the `parseInt`-NaN quirk (do NOT fix):** `parseInt('abc')` is `NaN`. The original stores that `NaN` into `patch.start`/`patch.end` and into the rewritten segment. This is a latent quirk (an unparseable coordinate yields `NaN`), but it is EXISTING behavior — reproduce it verbatim. Document it in the JSDoc; do not add a `Number.isNaN` guard or a `|| 0`.

> **Segment-rewrite semantics (preserve exactly):** the `segments` rewrite fires ONLY when the feature has 0 or 1 segments (`!feature.segments || feature.segments.length <= 1`) — a single-segment (or segmentless) feature gets its `segments` rebuilt to a single `[{ start, end }]` reflecting the new coordinate. A multi-segment feature (`length > 1`) gets NO `segments` in the patch (the envelope start/end changes but the explicit segment list is left untouched / edited separately below in the Segments editor). Encode both via the `field` param and the length guard.

- [ ] **Step 1: Append `featureCoordPatch` to `viewModel.ts`**

```typescript
import type { BioFeature } from '@/src/domain/bio/types';

/**
 * The patch produced by editing a feature's start or end coordinate in
 * FeatureEditorModal, extracted verbatim from its two `onChange` handlers.
 *
 * The edited field is set to `parseInt(rawValue)`. When the feature has 0 or 1
 * segment, its `segments` is rebuilt to a single `[{ start, end }]` reflecting
 * the new coordinate (a single-range feature keeps segments and coordinates in
 * sync). A multi-segment feature (`length > 1`) gets NO `segments` in the patch
 * — only the envelope coordinate changes; the explicit segment list is edited
 * separately.
 *
 * NOTE: `parseInt` of an unparseable value yields `NaN`, which is stored as-is
 * (existing behavior — intentionally NOT guarded here). The `setFeature`/
 * `onChange` side-effect stays in the component.
 */
export function featureCoordPatch(
  feature: Pick<BioFeature, 'start' | 'end' | 'segments'>,
  field: 'start' | 'end',
  rawValue: string,
): Partial<BioFeature> {
  const val = parseInt(rawValue);
  const patch: Partial<BioFeature> = field === 'start' ? { start: val } : { end: val };
  if (!feature.segments || feature.segments.length <= 1) {
    patch.segments =
      field === 'start'
        ? [{ start: val, end: feature.end }]
        : [{ start: feature.start, end: val }];
  }
  return patch;
}
```

> If Task A did not already import from `@/src/domain/bio/types`, add the `import type { BioFeature }` line to the top of `viewModel.ts` with the other imports (do not duplicate it). `FeatureSegment` is not needed explicitly — the inline `{ start, end }` object matches it structurally.

- [ ] **Step 2: Rewire `FeatureEditorModal`**

Replace the start `onChange` (lines 172-179) with:
```typescript
onChange={e => setFeature(featureCoordPatch(feature, 'start', e.target.value))}
```
Replace the end `onChange` (lines 192-199) with:
```typescript
onChange={e => setFeature(featureCoordPatch(feature, 'end', e.target.value))}
```
Add `import { featureCoordPatch } from '@/src/app/logic/viewModel';`. `setFeature` and `onChange` are unchanged. The `isCircularWrap` badge (line 59, `feature.start > feature.end`), the segment editor (lines 205-253), the strand `parseInt` (line 130), and all other handlers stay untouched — they are out of scope for this task.

**Verified values (`tsx` scratch):**
- `featureCoordPatch({start:10,end:50}, 'start', '20')` → `{ start: 20, segments: [{ start: 20, end: 50 }] }`
- `featureCoordPatch({start:10,end:50}, 'end', '60')` → `{ end: 60, segments: [{ start: 10, end: 60 }] }`
- `featureCoordPatch({start:10,end:50,segments:[{start:10,end:20},{start:30,end:50}]}, 'start', '5')` → `{ start: 5 }` (multi-segment → no `segments` in patch)
- `featureCoordPatch({start:10,end:50,segments:[{start:10,end:50}]}, 'start', '5')` → `{ start: 5, segments: [{ start: 5, end: 50 }] }` (single-segment → rewrite)
- `featureCoordPatch({start:10,end:50}, 'start', 'abc')` → `{ start: NaN, segments: [{ start: NaN, end: 50 }] }` (parseInt NaN preserved)

- [ ] **Step 3: Append the test**

Append to `viewModel.test.ts` (add `featureCoordPatch` to the import):

```typescript
describe('featureCoordPatch', () => {
  it('patches start and rewrites the single segment for a segmentless feature', () => {
    expect(featureCoordPatch({ start: 10, end: 50 }, 'start', '20')).toEqual({
      start: 20, segments: [{ start: 20, end: 50 }],
    });
  });
  it('patches end and rewrites the single segment for a segmentless feature', () => {
    expect(featureCoordPatch({ start: 10, end: 50 }, 'end', '60')).toEqual({
      end: 60, segments: [{ start: 10, end: 60 }],
    });
  });
  it('does NOT clobber segments for a multi-segment feature', () => {
    expect(
      featureCoordPatch(
        { start: 10, end: 50, segments: [{ start: 10, end: 20 }, { start: 30, end: 50 }] },
        'start',
        '5',
      ),
    ).toEqual({ start: 5 });
  });
  it('rewrites the segment when the feature has exactly one segment (length <= 1)', () => {
    expect(
      featureCoordPatch({ start: 10, end: 50, segments: [{ start: 10, end: 50 }] }, 'start', '5'),
    ).toEqual({ start: 5, segments: [{ start: 5, end: 50 }] });
  });
  it('preserves the parseInt NaN quirk for an unparseable value (not guarded)', () => {
    const patch = featureCoordPatch({ start: 10, end: 50 }, 'start', 'abc');
    expect(Number.isNaN(patch.start as number)).toBe(true);
    expect(patch.segments).toHaveLength(1);
    expect(Number.isNaN(patch.segments![0].start)).toBe(true);
    expect(patch.segments![0].end).toBe(50);
  });
});
```

> **NaN assertion note:** `expect(patch).toEqual({ start: NaN, segments: [{ start: NaN, end: 50 }] })` would also pass (vitest's structural equality treats `NaN === NaN` via `Object.is`), but the explicit `Number.isNaN` form above is clearer about the intent and less likely to be mistaken for a copy-paste error. Use the `Number.isNaN` form.

- [ ] **Step 4: Run the FULL viewModel test suite + typecheck + build**

```bash
rtk proxy npx vitest run src/app/logic/__tests__/viewModel.test.ts   # all 5 describe blocks green
npm run typecheck > /dev/null 2>&1; echo "tc=$?"    # 0
npm run build > /dev/null 2>&1; echo "build=$?"     # 0
```

- [ ] **Step 5: Commit**

```bash
git add src/app/logic/viewModel.ts src/app/logic/__tests__/viewModel.test.ts src/app/components/FeatureEditorModal.tsx
git commit -m "refactor(viewModel): extract featureCoordPatch from FeatureEditorModal"
```

---

## Task F: Full CI mirror + threshold re-baseline (if needed) + PR

**Files:**
- Modify (only if thresholds rose): `vite.config.ts`

`src/app/logic/**` is ALREADY in `coverage.include` (vite.config.ts line 49, added in PR2). `viewModel.ts` is therefore auto-measured — NO `include` edit is needed. The `exclude` (`**/__tests__/**`, `**/*.test.ts`, `**/index.ts`, `**/types.ts`) already keeps the new test file out.

- [ ] **Step 1: Measure achieved coverage on the scoped set**

```bash
rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "gate=$?"
node -e '
const s=require("./coverage/coverage-summary.json").total;
const pick=k=>Math.max(0, Math.floor(s[k].pct) - 4);
console.log("achieved:", JSON.stringify({lines:s.lines.pct,branches:s.branches.pct,functions:s.functions.pct,statements:s.statements.pct}));
console.log("suggested thresholds:", JSON.stringify({lines:pick("lines"),branches:pick("branches"),functions:pick("functions"),statements:pick("statements")}));
'
```

`viewModel.ts` is small and fully covered (every branch of all five helpers is exercised by the tests above), so the aggregate should move UP or hold. If `gate` is `0` at the current floors (94/85/93/92) AND the suggested thresholds do not exceed the current floors, **skip Step 2** — no `vite.config.ts` change (the ratchet only raises).

- [ ] **Step 2: Re-baseline thresholds ONLY if achieved rose (raise, never lower)**

If `achieved - 4` for any metric now EXCEEDS the current floor, raise that metric's threshold to `achieved - 4`. For any metric whose `achieved - 4` is at or below the current floor, KEEP the current floor. Never lower. Update the four `thresholds` values in `vite.config.ts` (lines 64-69) accordingly, and update the ratchet comment block (lines 59-63) to record the new achieved numbers and "Phase 2A PR3". Then re-run:

```bash
rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "gate after rebaseline=$?"   # expect 0
```

If achieved did NOT rise above the floors, leave `vite.config.ts` untouched and note "thresholds unchanged; viewModel.ts folded under the existing PR2 buffer" in the PR body.

- [ ] **Step 3: Full CI mirror**

```bash
npm run typecheck > /dev/null 2>&1; echo "typecheck=$?"
npm run lint > /dev/null 2>&1; echo "lint=$?"
rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "coverage=$?"
npm run build > /dev/null 2>&1; echo "build=$?"
```

All four must be `0` (lint `0` = warnings only, matching the PR1/PR2 convention). `build` green is the behavior-preservation proof for all five component rewires.

- [ ] **Step 4: Commit (only if vite.config.ts changed) + push + PR**

```bash
# Only if Step 2 modified vite.config.ts:
git add vite.config.ts
git commit -m "ci(coverage): re-baseline ratchet after view-model extraction"

git push -u origin test-phase2-pr3-viewmodel
gh pr create --base main --title "refactor+test: Phase 2A PR3 — extract & test view-model helpers" \
  --body "$(cat <<'BODY'
Behavior-preserving extraction of the five inline view-model helpers out of RecordDetailsModal, DatabaseHubPanel, SearchPanel, App, and FeatureEditorModal into a single pure module src/app/logic/viewModel.ts (getDisplaySeq, featureLength, scorePercent, deriveAlignmentState, featureCoordPatch), each now unit-tested in node. Components keep all side effects (clipboard, onChange, useMemo wiring, .toLocaleString formatting); the extracted core is pure. No new deps. No semantic changes — the parseInt-NaN coordinate quirk is preserved verbatim. src/app/logic/** was already in the coverage gate (PR2); thresholds re-baselined only if achieved rose.

See docs/superpowers/specs/2026-07-01-test-phase2a-extraction-design.md and docs/superpowers/plans/2026-07-01-test-phase2a-pr3-viewmodel.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## Self-review

- **Spec coverage:** every PR3 item from the design maps to a task — `getDisplaySeq` → Task A; `featureLength` → Task B; `scorePercent` → Task C; `deriveAlignmentState` → Task D; `featureCoordPatch` → Task E; coverage re-baseline + PR → Task F. All five land in the single locked module `src/app/logic/viewModel.ts` (per the design's Module layout), not five files.
- **Behavior preservation:** each extraction moves an inline expression/IIFE/`useMemo` body verbatim; only the wrapper (params in, value out) changes. Every task runs `npm run build` (proves the component still wires under Vite) + `npm run typecheck`. Side effects (`navigator.clipboard`, `onCopyLog`, `setFeature`/`onChange`, `useMemo`, `.toLocaleString()`) all stay in the components; the extracted core returns raw data. The `parseInt`-NaN quirk (Task E) is documented and preserved, not fixed. The three-`useMemo`→one-`useMemo` collapse in Task D is value-identical (union dep array; same inputs → same outputs). The `featureLength` record-not-found fallback (Task B) is preserved via a nullable `seqLen` param mapping 1:1 to the original `record ? … : Math.abs(…)`.
- **Test values:** every expected value (`getDisplaySeq` wrap/null/zero-width; `featureLength` segment-sum/circular/simple/fallback/empty-array; `scorePercent` div-by-zero + all three rounding cases; `deriveAlignmentState` for 0/1/2/unequal/aligned-pref/protein; `featureCoordPatch` single/multi/one-segment/NaN) was computed by running the verbatim inline logic through `tsx` — not guessed. Recorded under each task's "Verified values".
- **Determinism:** all five helpers are pure string/number/array math with no `Date.now()`, locale-dependent output, or async — every value is pinned exactly. The only subtlety, `parseInt('abc') → NaN`, is asserted via explicit `Number.isNaN` (though `toEqual` with `NaN` would also pass under `Object.is`).
- **No Phase-1 re-verification:** none of the five helpers call `getOriginalPos` or any `services`/`domain` code — they are self-contained, so there is nothing to re-test from earlier phases. (Confirmed by reading each source region.)
- **Coverage gate:** `src/app/logic/**` is already in `include` (PR2, vite.config.ts:49) — no `include` change. Task F re-baselines thresholds ONLY if achieved rose (raise never lower); if `viewModel.ts` folds under the existing ~4pt PR2 buffer, `vite.config.ts` is left untouched.
- **Placeholder scan:** all five function bodies and all test code are shown in full — no TODOs, no "…". The source ranges are cited (file:line) so the executor can diff against the real inline code before lifting.
- **Task independence:** A–E each end in a standalone commit (one helper + its component rewire + its tests). B–E append to the A-created `viewModel.ts`/`viewModel.test.ts`; the shared `import type { BioFeature }` (needed only by E) is added once (Task E Step 1 note). F is the CI/PR wrap.
