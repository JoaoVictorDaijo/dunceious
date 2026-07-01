# Test Hardening — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the four partially-covered pure-logic files to high coverage and wire a scoped ratchet coverage gate into CI, creating a regression safety net before a future cycle of larger features.

**Architecture:** Add plain Vitest tests (env stays `node`, no new test infra) in the existing `__tests__` folders for the currently-untested pure functions. Then add a v8 coverage config scoped to hardened logic (`services/**`, `src/app/recordRemoval.ts`, `src/domain/**`) with thresholds set a safety margin below achieved, and run it in CI.

**Tech Stack:** TypeScript, Vitest 4.1.2, `@vitest/coverage-v8` (already installed on branch), GitHub Actions.

---

## Note on TDD for characterization tests

These tests are added to **existing, already-correct code**, so the classic "write a failing test first" is adapted: write the test, run it, and it should **PASS** because the behaviour is already correct. The "verify it exercises the code" guarantee comes from the coverage delta, not a red-first run.

**If a new test FAILS, do not edit the test to match the code.** A failure means either (a) the test's expected value is wrong — recompute it, or (b) the production code has a genuine bug — **STOP and report it** to the human rather than encoding wrong behaviour. Do not modify production code in this plan except in the CI-gate task.

## File structure

| File | Responsibility |
|---|---|
| `src/app/__tests__/recordRemoval.test.ts` (modify) | Add coverage for `sanitizeSearchStateAfterRecordRemoval` |
| `services/genbank/__tests__/qualifierParser.test.ts` (modify) | Add malformed-line skip branches |
| `services/__tests__/searchLogic.test.ts` (modify) | Add `removeGapsWithMap`, `mapUngappedRangeToAligned`, SW gap-traceback, ungapped fallback |
| `services/__tests__/bioUtils.test.ts` (create) | Cover color helpers, `exportToGff`, `exportToGenBank`, `getOriginalPos`, `downloadBlob` |
| `vite.config.ts` (modify) | Add scoped v8 coverage config + thresholds |
| `package.json` (modify) | Add `test:coverage` script |
| `.github/workflows/ci.yml` (modify) | Run coverage (with threshold enforcement) in CI |
| `.gitignore` (modify) | Ignore coverage output |
| `docs/superpowers/specs/2026-07-01-test-hardening-phase1-design.md` (modify) | Record final achieved numbers + enforced thresholds |

---

## Task 1: `sanitizeSearchStateAfterRecordRemoval` coverage

**Files:**
- Modify: `src/app/__tests__/recordRemoval.test.ts`
- Under test: `src/app/recordRemoval.ts:20-37`

- [ ] **Step 1: Update the import line**

Replace the existing import (line 3) with:

```typescript
import type { SelectionArea, SeqRecord, SearchResult } from '@/src/domain/bio/types';
import {
  removeRecordFromProject,
  updateSelectionAfterRecordRemoval,
  sanitizeSearchStateAfterRecordRemoval,
} from '../recordRemoval';
```

- [ ] **Step 2: Append the failing test block**

Append to the end of `src/app/__tests__/recordRemoval.test.ts`:

```typescript
function makeResult(recordId: string): SearchResult {
  return { start: 0, end: 3, sequence: 'ATG', recordId, strand: 1 };
}

describe('sanitizeSearchStateAfterRecordRemoval', () => {
  // filteredResults index → recordId: 0→r1, 1→r2, 2→r1
  const results = [makeResult('r1'), makeResult('r2'), makeResult('r1')];

  it('drops selected indices pointing at the removed record, keeps the rest', () => {
    const { selectedSearchIndices } = sanitizeSearchStateAfterRecordRemoval(
      results, 1, new Set([0, 1, 2]), 'r1',
    );
    expect([...selectedSearchIndices].sort()).toEqual([1]);
  });

  it('resets currentSearchIdx to -1 when it points at the removed record', () => {
    const { currentSearchIdx } = sanitizeSearchStateAfterRecordRemoval(
      results, 0, new Set(), 'r1',
    );
    expect(currentSearchIdx).toBe(-1);
  });

  it('keeps currentSearchIdx when it points at a surviving record', () => {
    const { currentSearchIdx } = sanitizeSearchStateAfterRecordRemoval(
      results, 1, new Set(), 'r1',
    );
    expect(currentSearchIdx).toBe(1);
  });

  it('resets a negative currentSearchIdx to -1', () => {
    const { currentSearchIdx } = sanitizeSearchStateAfterRecordRemoval(
      results, -1, new Set(), 'r1',
    );
    expect(currentSearchIdx).toBe(-1);
  });

  it('resets an out-of-range currentSearchIdx to -1', () => {
    const { currentSearchIdx } = sanitizeSearchStateAfterRecordRemoval(
      results, 5, new Set(), 'r1',
    );
    expect(currentSearchIdx).toBe(-1);
  });

  it('returns an empty selection set when it was empty', () => {
    const { selectedSearchIndices } = sanitizeSearchStateAfterRecordRemoval(
      results, 1, new Set(), 'r2',
    );
    expect(selectedSearchIndices.size).toBe(0);
  });
});
```

- [ ] **Step 3: Run the new tests**

Run: `npx vitest run src/app/__tests__/recordRemoval.test.ts`
Expected: PASS (all describe blocks green). If any fail, recompute the expected value or report a code bug — do not silence it.

- [ ] **Step 4: Confirm the coverage delta**

Run:
```bash
npx vitest run src/app/__tests__/recordRemoval.test.ts \
  --coverage.enabled --coverage.provider=v8 \
  --coverage.include='src/app/recordRemoval.ts' --coverage.reporter=text 2>/dev/null | grep recordRemoval
```
Expected: `recordRemoval.ts` at 100% statements / 100% lines (branches may be <100% only if a genuinely dead branch exists).

- [ ] **Step 5: Commit**

```bash
git add src/app/__tests__/recordRemoval.test.ts
git commit -m "test(recordRemoval): cover sanitizeSearchStateAfterRecordRemoval"
```

---

## Task 2: `parseQualifiers` malformed-line branches

**Files:**
- Modify: `services/genbank/__tests__/qualifierParser.test.ts`
- Under test: `services/genbank/qualifierParser.ts:48-56`

- [ ] **Step 1: Append the failing test block**

Append to the end of `services/genbank/__tests__/qualifierParser.test.ts` (inside the file, after the closing `});` of the existing `describe`):

```typescript
describe('parseQualifiers – malformed / skip branches', () => {
  const INDENT = ' '.repeat(21);

  it('skips a leading indented line that does not start with "/"', () => {
    // An orphan continuation-style line at fromIdx (not preceded by a matched
    // qualifier) hits the `!qualLine.startsWith('/')` skip branch.
    const lines = [`${INDENT}orphan text`, `${INDENT}/gene="AXL2"`];
    const { qualifiers, lastIdx } = parseQualifiers(lines, 0);
    expect(qualifiers).not.toHaveProperty('orphan');
    expect(qualifiers['gene']).toBe('AXL2');
    expect(lastIdx).toBe(1);
  });

  it('skips a "/" line that fails the /key(=value) pattern', () => {
    // A bare "/" has no \w+ after it → regex match fails → skip branch.
    const lines = [`${INDENT}/`, `${INDENT}/gene="AXL2"`];
    const { qualifiers } = parseQualifiers(lines, 0);
    expect(Object.keys(qualifiers)).toEqual(['gene']);
    expect(qualifiers['gene']).toBe('AXL2');
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `npx vitest run services/genbank/__tests__/qualifierParser.test.ts`
Expected: PASS.

- [ ] **Step 3: Confirm the coverage delta**

Run:
```bash
npx vitest run services/genbank/__tests__/qualifierParser.test.ts \
  --coverage.enabled --coverage.provider=v8 \
  --coverage.include='services/genbank/qualifierParser.ts' --coverage.reporter=text 2>/dev/null | grep qualifierParser
```
Expected: `qualifierParser.ts` at 100% statements / 100% lines.

- [ ] **Step 4: Commit**

```bash
git add services/genbank/__tests__/qualifierParser.test.ts
git commit -m "test(qualifierParser): cover malformed-qualifier skip branches"
```

---

## Task 3: `removeGapsWithMap` + `mapUngappedRangeToAligned`

**Files:**
- Modify: `services/__tests__/searchLogic.test.ts`
- Under test: `services/searchLogic.ts:108-132`

- [ ] **Step 1: Extend the import**

Change the import block (lines 21-26) to add the two functions:

```typescript
import {
  degenerateToRegex,
  reverseComplement,
  getNonGapSegments,
  smithWaterman,
  removeGapsWithMap,
  mapUngappedRangeToAligned,
} from '../searchLogic';
```

- [ ] **Step 2: Append the failing test block**

Append to the end of `services/__tests__/searchLogic.test.ts`:

```typescript
// ---------------------------------------------------------------------------
// removeGapsWithMap
// ---------------------------------------------------------------------------

describe('removeGapsWithMap', () => {
  it('returns the sequence unchanged with an identity map when gap-free', () => {
    expect(removeGapsWithMap('ACGT')).toEqual({ ungapped: 'ACGT', map: [0, 1, 2, 3] });
  });

  it('strips gaps and maps each kept base to its original index', () => {
    // 'A-C--G' → kept A(0) C(2) G(5)
    expect(removeGapsWithMap('A-C--G')).toEqual({ ungapped: 'ACG', map: [0, 2, 5] });
  });

  it('returns empty ungapped and empty map for an all-gap sequence', () => {
    expect(removeGapsWithMap('----')).toEqual({ ungapped: '', map: [] });
  });

  it('returns empty results for an empty string', () => {
    expect(removeGapsWithMap('')).toEqual({ ungapped: '', map: [] });
  });
});

// ---------------------------------------------------------------------------
// mapUngappedRangeToAligned
// ---------------------------------------------------------------------------

describe('mapUngappedRangeToAligned', () => {
  // ungapped indices 0,1,2,3 → aligned positions 0,2,4,6
  const map = [0, 2, 4, 6];

  it('returns {0,0} for an empty map', () => {
    expect(mapUngappedRangeToAligned([], 0, 4)).toEqual({ start: 0, end: 0 });
  });

  it('maps an in-range half-open ungapped range to aligned coordinates', () => {
    // start=1,end=3 → alignedStart=map[1]=2, alignedEnd=map[2]+1=5
    expect(mapUngappedRangeToAligned(map, 1, 3)).toEqual({ start: 2, end: 5 });
  });

  it('clamps a negative start up to 0', () => {
    // start=-5→0, end=2 → alignedStart=map[0]=0, alignedEnd=map[1]+1=3
    expect(mapUngappedRangeToAligned(map, -5, 2)).toEqual({ start: 0, end: 3 });
  });

  it('clamps an out-of-range start/end to the last index', () => {
    // start=10→3, end=20→4 → alignedStart=map[3]=6, alignedEnd=map[3]+1=7
    expect(mapUngappedRangeToAligned(map, 10, 20)).toEqual({ start: 6, end: 7 });
  });

  it('handles a single-element map', () => {
    expect(mapUngappedRangeToAligned([5], 0, 1)).toEqual({ start: 5, end: 6 });
  });
});
```

- [ ] **Step 3: Run the new tests**

Run: `npx vitest run services/__tests__/searchLogic.test.ts -t "removeGapsWithMap|mapUngappedRangeToAligned"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add services/__tests__/searchLogic.test.ts
git commit -m "test(searchLogic): cover removeGapsWithMap and mapUngappedRangeToAligned"
```

---

## Task 4: Smith-Waterman gap traceback + ungapped fallback

**Files:**
- Modify: `services/__tests__/searchLogic.test.ts`
- Under test: `services/searchLogic.ts` — `traceback` gap states (~356-372), `ungappedFuzzyScan` (247-308), and the `size > MAX_SW_CELLS` branch (157-159)

Note: `ungappedFuzzyScan` is private; it is reached by giving `smithWaterman` a query×target large enough to exceed `MAX_SW_CELLS` (600,000 cells). Assertions are property-based (not exact coordinates) because the traceback path is an approximation — this keeps the test robust.

- [ ] **Step 1: Append the failing test block**

Append to the end of `services/__tests__/searchLogic.test.ts`:

```typescript
// ---------------------------------------------------------------------------
// smithWaterman – gapped traceback (exercises Iq / It gap states)
// ---------------------------------------------------------------------------

describe('smithWaterman – gapped alignments', () => {
  it('aligns across an insertion in the target (It gap state)', () => {
    // query 'ACGTACGT' vs target with 'TT' inserted in the middle.
    // Optimal local alignment must open a gap in the query to skip 'TT'.
    const results = smithWaterman('ACGTACGT', 'ACGTTTACGT');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].start).toBeLessThan(results[0].end);
    // Spanning both halves scores higher than either 4-mer half alone (8).
    expect(results[0].score).toBeGreaterThan(8);
  });

  it('aligns across an insertion in the query (Iq gap state)', () => {
    // Mirror image: the query carries the extra 'TT'.
    const results = smithWaterman('ACGTTTACGT', 'ACGTACGT');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].start).toBeLessThan(results[0].end);
    expect(results[0].score).toBeGreaterThan(8);
  });
});

// ---------------------------------------------------------------------------
// smithWaterman – ungapped fallback for very large targets (> MAX_SW_CELLS)
// ---------------------------------------------------------------------------

describe('smithWaterman – large-target ungapped fallback', () => {
  it('falls back and finds a strong ungapped match when the DP matrix is too large', () => {
    // (1000+1) * (700+1) = 701,701 cells > 600,000 → ungapped fallback path.
    const query = 'A'.repeat(1000);
    const target = 'A'.repeat(700);
    const results = smithWaterman(query, target);
    expect(results).toHaveLength(1);
    expect(results[0].start).toBe(0);
    expect(results[0].end).toBe(700);
    expect(results[0].score).toBe(1400); // 700 matches × matchScore(2)
  });

  it('returns no hits when the fallback window scores below minScore', () => {
    // All-mismatch window → negative score → filtered out.
    const query = 'A'.repeat(1000);
    const target = 'T'.repeat(700);
    expect(smithWaterman(query, target)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `npx vitest run services/__tests__/searchLogic.test.ts -t "gapped alignments|large-target"`
Expected: PASS. If a `score`/coordinate assertion fails, the property bounds may need loosening (recompute) — but the fallback test's exact values (1400, 0, 700) are arithmetic and should hold. A failure there means a real regression — report it.

- [ ] **Step 3: Confirm the coverage delta for searchLogic**

Run:
```bash
npx vitest run services/__tests__/searchLogic.test.ts \
  --coverage.enabled --coverage.provider=v8 \
  --coverage.include='services/searchLogic.ts' --coverage.reporter=text 2>/dev/null | grep searchLogic
```
Expected: lines ≥ ~88%. The candidate-trimming path (`TRIM_THRESHOLD`, lines ~207-230) and some traceback `break` guards are intentionally left uncovered — do not contort tests to reach them.

- [ ] **Step 4: Commit**

```bash
git add services/__tests__/searchLogic.test.ts
git commit -m "test(searchLogic): cover gapped traceback and large-target fallback"
```

---

## Task 5: bioUtils color helpers + `getOriginalPos`

**Files:**
- Create: `services/__tests__/bioUtils.test.ts`
- Under test: `services/bioUtils.ts` — `getNucleotideColor` (122-130), `getAminoAcidColor` (148-190), `getFeatureColor` (192-211), `getOriginalPos` (421-430)

- [ ] **Step 1: Create the test file with the license header + first blocks**

Create `services/__tests__/bioUtils.test.ts`:

```typescript
/*
 * Dunceious
 *
 * This file is part of Dunceious.
 *
 * Dunceious is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Dunceious is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Dunceious.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect } from 'vitest';
import {
  getNucleotideColor,
  getAminoAcidColor,
  getFeatureColor,
  getOriginalPos,
} from '../bioUtils';

describe('getNucleotideColor', () => {
  it('returns the canonical colour for each base (case-insensitive)', () => {
    expect(getNucleotideColor('A')).toBe('#22c55e');
    expect(getNucleotideColor('t')).toBe('#f43f5e');
    expect(getNucleotideColor('C')).toBe('#3b82f6');
    expect(getNucleotideColor('g')).toBe('#eab308');
  });

  it('returns the gap colour for "-"', () => {
    expect(getNucleotideColor('-')).toBe('#64748b');
  });

  it('returns the fallback colour for an unknown character', () => {
    expect(getNucleotideColor('X')).toBe('#94a3b8');
  });
});

describe('getAminoAcidColor', () => {
  it('colours hydrophobic non-polar residues amber', () => {
    for (const aa of ['A', 'V', 'I', 'L', 'M']) {
      expect(getAminoAcidColor(aa)).toBe('#f59e0b');
    }
  });

  it('colours each special/grouped residue by its convention', () => {
    expect(getAminoAcidColor('G')).toBe('#94a3b8'); // slate
    expect(getAminoAcidColor('P')).toBe('#d97706'); // dark amber
    expect(getAminoAcidColor('F')).toBe('#a855f7'); // aromatic purple
    expect(getAminoAcidColor('W')).toBe('#a855f7');
    expect(getAminoAcidColor('Y')).toBe('#8b5cf6'); // violet
    expect(getAminoAcidColor('K')).toBe('#3b82f6'); // positive blue
    expect(getAminoAcidColor('R')).toBe('#3b82f6');
    expect(getAminoAcidColor('H')).toBe('#60a5fa'); // sky blue
    expect(getAminoAcidColor('D')).toBe('#ef4444'); // negative red
    expect(getAminoAcidColor('E')).toBe('#f97316'); // orange-red
    expect(getAminoAcidColor('S')).toBe('#22c55e'); // polar green
    expect(getAminoAcidColor('T')).toBe('#22c55e');
    expect(getAminoAcidColor('N')).toBe('#10b981'); // emerald
    expect(getAminoAcidColor('Q')).toBe('#10b981');
    expect(getAminoAcidColor('C')).toBe('#eab308'); // cysteine yellow
  });

  it('colours stop codons (* and _) red and gaps slate', () => {
    expect(getAminoAcidColor('*')).toBe('#ef4444');
    expect(getAminoAcidColor('_')).toBe('#ef4444');
    expect(getAminoAcidColor('-')).toBe('#64748b');
  });

  it('is case-insensitive and falls back for unknown residues', () => {
    expect(getAminoAcidColor('a')).toBe('#f59e0b');
    expect(getAminoAcidColor('Z')).toBe('#94a3b8');
  });
});

describe('getFeatureColor', () => {
  it('returns the mapped colour for a known feature type', () => {
    expect(getFeatureColor('CDS')).toBe('#8b5cf6');
    expect(getFeatureColor('gene')).toBe('#0ea5e9');
  });

  it('prefers a custom colour override when provided', () => {
    expect(getFeatureColor('CDS', { CDS: '#123456' })).toBe('#123456');
  });

  it('falls through to the built-in map when the override lacks the type', () => {
    expect(getFeatureColor('gene', { CDS: '#123456' })).toBe('#0ea5e9');
  });

  it('returns the fallback colour for an unknown feature type', () => {
    expect(getFeatureColor('totally_unknown')).toBe('#94a3b8');
  });
});

describe('getOriginalPos', () => {
  it('is the identity for a gap-free sequence', () => {
    expect(getOriginalPos('ACGT', 4)).toBe(4);
    expect(getOriginalPos('ACGT', 0)).toBe(0);
  });

  it('discounts leading and internal gaps before the position', () => {
    // '--AC' up to pos 4 → 2 real bases
    expect(getOriginalPos('--AC', 4)).toBe(2);
    // 'A-C-G' up to pos 5 → A,C,G = 3
    expect(getOriginalPos('A-C-G', 5)).toBe(3);
  });

  it('clamps a position past the end of the aligned sequence', () => {
    expect(getOriginalPos('ACGT', 100)).toBe(4);
  });
});
```

- [ ] **Step 2: Run the new file**

Run: `npx vitest run services/__tests__/bioUtils.test.ts`
Expected: PASS. Any mismatch means an expected hex/number was miscopied — recheck against `services/bioUtils.ts`.

- [ ] **Step 3: Commit**

```bash
git add services/__tests__/bioUtils.test.ts
git commit -m "test(bioUtils): cover colour helpers and getOriginalPos"
```

---

## Task 6: bioUtils exporters + `downloadBlob`

**Files:**
- Modify: `services/__tests__/bioUtils.test.ts`
- Under test: `services/bioUtils.ts` — `exportToGff` (224-234), `exportToGenBank` (236-307), `downloadBlob` (309-319)

- [ ] **Step 1: Extend the imports and add `vi`, `afterEach`, `SeqRecord`**

Change the top imports of `services/__tests__/bioUtils.test.ts` to:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SeqRecord } from '../../types';
import {
  getNucleotideColor,
  getAminoAcidColor,
  getFeatureColor,
  getOriginalPos,
  exportToGff,
  exportToGenBank,
  downloadBlob,
} from '../bioUtils';
```

- [ ] **Step 2: Append the exporter + downloadBlob blocks**

Append to the end of `services/__tests__/bioUtils.test.ts`:

```typescript
function record(overrides: Partial<SeqRecord> = {}): SeqRecord {
  return { id: 'REC1', name: 'Record 1', sequence: 'ATGCAAATAG', features: [], ...overrides };
}

describe('exportToGff', () => {
  it('emits the version header and a tab-delimited feature line with 1-based start', () => {
    const gff = exportToGff([record({
      features: [{ type: 'CDS', name: 'my gene', start: 9, end: 20, strand: 1 }],
    })]);
    expect(gff.startsWith('##gff-version 3\n')).toBe(true);
    // start is 0-based 9 → GFF 1-based 10; end stays 20; strand '+'
    expect(gff).toContain('REC1\tDunceious\tCDS\t10\t20\t.\t+\t0\tID=my_gene;Name=my gene');
  });

  it('renders the minus strand as "-"', () => {
    const gff = exportToGff([record({
      features: [{ type: 'gene', name: 'g1', start: 0, end: 5, strand: -1 }],
    })]);
    expect(gff).toContain('\t-\t0\t');
  });
});

describe('exportToGenBank', () => {
  it('writes a DNA LOCUS with a de-duplicated Dunceious definition marker', () => {
    const gb = exportToGenBank([record({
      definition: 'Sample seq Exported by Dunceious.',
      features: [{
        type: 'source', name: 'source', start: 0, end: 10, strand: 1,
        metadata: { organism: 'E. coli', _internal: 'hidden', empty: '' },
      }],
    })]);
    expect(gb).toContain('LOCUS');
    expect(gb).toContain('bp    DNA');
    // Marker must appear exactly once (not accumulated on re-export).
    expect(gb.match(/Exported by Dunceious\./g)).toHaveLength(1);
    expect(gb).toContain('ORGANISM  E. coli');
    // '_'-prefixed and empty metadata are omitted; real qualifier is kept.
    expect(gb).toContain('/organism="E. coli"');
    expect(gb).not.toContain('_internal');
    expect(gb).not.toContain('/empty=');
    expect(gb.trimEnd().endsWith('//')).toBe(true);
  });

  it('writes a protein LOCUS using "aa" units', () => {
    const gb = exportToGenBank([record({ moleculeType: 'protein', sequence: 'MKV' })]);
    expect(gb).toContain(' aa ');
    expect(gb).not.toContain('DNA');
  });
});

describe('downloadBlob', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wires up an anchor, triggers a click, and revokes the object URL', () => {
    const click = vi.fn();
    const anchor: Record<string, unknown> = { click };
    const createElement = vi.fn(() => anchor);
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();

    vi.stubGlobal('document', { createElement, body: { appendChild, removeChild } });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('Blob', class {
      parts: unknown; opts: unknown;
      constructor(parts: unknown, opts: unknown) { this.parts = parts; this.opts = opts; }
    });

    downloadBlob('hello', 'out.txt', 'text/plain');

    expect(createElement).toHaveBeenCalledWith('a');
    expect(anchor.href).toBe('blob:mock-url');
    expect(anchor.download).toBe('out.txt');
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledWith(anchor);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
```

- [ ] **Step 3: Run the file**

Run: `npx vitest run services/__tests__/bioUtils.test.ts`
Expected: PASS. The `exportToGenBank` LOCUS assertions are substring checks (the date is real-time and not asserted).

- [ ] **Step 4: Confirm bioUtils coverage**

Run:
```bash
npx vitest run services/__tests__/bioUtils.test.ts services/__tests__/translationHelpers.test.ts services/__tests__/selectionExport.test.ts \
  --coverage.enabled --coverage.provider=v8 \
  --coverage.include='services/bioUtils.ts' --coverage.reporter=text 2>/dev/null | grep bioUtils
```
Expected: `bioUtils.ts` lines ≥ ~95%.

- [ ] **Step 5: Commit**

```bash
git add services/__tests__/bioUtils.test.ts
git commit -m "test(bioUtils): cover GFF/GenBank exporters and downloadBlob"
```

---

## Task 7: Scoped ratchet coverage gate in CI

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.gitignore`
- (`package.json`/`package-lock.json` already carry `@vitest/coverage-v8` from branch setup)

- [ ] **Step 1: Add the coverage config to `vite.config.ts`**

Replace the `test:` block (lines 36-43) with:

```typescript
    test: {
      environment: "node",
      exclude: [
        "perf/**",
        "bench/**",
        "**/node_modules/**",
      ],
      coverage: {
        provider: "v8",
        all: true,
        include: [
          "services/**",
          "src/app/recordRemoval.ts",
          "src/domain/**",
        ],
        exclude: [
          "**/__tests__/**",
          "**/*.test.ts",
          "**/index.ts",
          "**/types.ts",
        ],
        reporter: ["text", "text-summary", "json-summary"],
        // Thresholds are a RATCHET: set a few points below achieved so normal
        // v8 jitter and hard-to-hit defensive branches don't break CI. Raise
        // (never lower) in later phases. Numbers set in Step 3.
        thresholds: {
          lines: 0,
          branches: 0,
          functions: 0,
          statements: 0,
        },
      },
    },
```

- [ ] **Step 2: Add the `test:coverage` script to `package.json`**

In the `"scripts"` block, add after the `"test"` line:

```json
    "test:coverage": "vitest run --coverage",
```

- [ ] **Step 3: Measure achieved coverage and set the thresholds**

Run:
```bash
npx vitest run --coverage 2>/dev/null
node -e '
const s=require("./coverage/coverage-summary.json").total;
const pick=k=>Math.max(0, Math.floor(s[k].pct) - 4);
console.log(JSON.stringify({
  lines: pick("lines"), branches: pick("branches"),
  functions: pick("functions"), statements: pick("statements"),
}));
'
```
This prints the four threshold numbers (achieved percentage floored, minus a 4-point buffer). Edit `vite.config.ts` Step 1's `thresholds` block, replacing each `0` with the printed value. Then confirm the gate passes:

Run: `npm run test:coverage`
Expected: PASS, no "ERROR: Coverage for X does not meet threshold" lines.

- [ ] **Step 4: Ignore coverage output**

Append to `.gitignore` (if `coverage` is not already listed):

```
coverage/
```

- [ ] **Step 5: Run coverage in CI**

In `.github/workflows/ci.yml`, change the `Test` step (lines 43-45) `run:` value so coverage + thresholds run in CI:

```yaml
      - name: Test
        if: ${{ !cancelled() }}
        run: npm run test:coverage
```

- [ ] **Step 6: Verify the whole CI sequence locally**

Run: `npm run typecheck && npm run lint && npm run test:coverage && npm run build`
Expected: all four succeed.

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts package.json package-lock.json .github/workflows/ci.yml .gitignore
git commit -m "ci(coverage): add scoped v8 ratchet gate and run it in CI"
```

---

## Task 8: Final verification, docs, and PR

**Files:**
- Modify: `docs/superpowers/specs/2026-07-01-test-hardening-phase1-design.md`

- [ ] **Step 1: Full suite + coverage summary**

Run: `npm run test:coverage 2>/dev/null | tail -30`
Expected: all test files pass (295 baseline + the new tests); coverage summary printed; thresholds met.

- [ ] **Step 2: Record final numbers in the design doc**

In `docs/superpowers/specs/2026-07-01-test-hardening-phase1-design.md`, under a new `## Phase 1 Results` heading at the end, record: the four target files' final coverage, the scoped-aggregate totals, and the enforced threshold numbers chosen in Task 7 Step 3. Note any intentionally-uncovered paths (searchLogic candidate-trimming; `mapUngappedRangeToAligned` `??` defensive fallbacks).

- [ ] **Step 3: Commit the docs**

```bash
git add docs/superpowers/specs/2026-07-01-test-hardening-phase1-design.md
git commit -m "docs(test): record Phase 1 coverage results and thresholds"
```

- [ ] **Step 4: Push and open the PR (only when the human approves)**

```bash
git push -u origin test-hardening
gh pr create --base main --title "test: Phase 1 test hardening + coverage gate" \
  --body "Raises coverage of four partially-covered pure-logic files and adds a scoped ratchet coverage gate to CI. See docs/superpowers/specs/2026-07-01-test-hardening-phase1-design.md."
```

---

## Self-review

- **Spec coverage:** recordRemoval (Task 1), qualifierParser (Task 2), searchLogic remove/map + fallback + traceback (Tasks 3-4), bioUtils colors/exporters/getOriginalPos/downloadBlob (Tasks 5-6), existing-test audit (bioUtils tests complement translationHelpers/selectionExport which were reviewed and found solid — no rewrite needed), CI ratchet gate scoped to hardened logic with buffered thresholds (Task 7), results recorded (Task 8). All spec sections mapped.
- **Placeholders:** none — every test body and config change is concrete. The only runtime-derived values are the threshold numbers, which Step 3 of Task 7 computes deterministically and instructs to paste in.
- **Type consistency:** `SearchResult`/`SelectionArea`/`SeqRecord` used per `src/domain/bio/types.ts`; `BioFeature`/`SeqRecord` for bioUtils per root `types.ts` (re-export shim). Function names match `recordRemoval.ts`, `searchLogic.ts`, `qualifierParser.ts`, `bioUtils.ts` exports verified against source.
