# Phase B · Domain Sequence Primitives — Consolidation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish `src/domain/bio/sequence.ts` as the ONE canonical home for the scattered pure sequence primitives — `reverseComplement`, the translation cluster (`GENETIC_CODE` + `translateSequence` + `extractCodingSequence` + `detectEarlyStop`), molecule-type detection, and gap↔ungapped coordinate mapping — as plain exported functions (NO class). All moves are behavior-preserving **except** the molecule-type consolidation, which is a deliberate, documented behavior change (the 4 current implementations disagree). This lands **before** Phase C relocates `services/` → `src/core/`, so B leaves the old `services/*` sites as thin re-export shims; Phase C deletes the shims and normalizes paths.

**Architecture:** The pristine `src/domain/bio/` layer imports nothing outside `domain` (spec §4.1). Phase B adds one new module, `sequence.ts`, that imports **only sibling `domain` modules** (`./intervals`, for `splitWrapAround` — a legal `domain`→`domain` import per §4.1; every other function is self-contained over strings/arrays), and dedups the aligned-segment builder into the existing `coordinate.ts`. Each old definition site (`services/searchLogic.ts`, `services/bioUtils.ts`, `services/moleculeType.ts`) becomes a re-export from the domain barrel so every existing importer keeps compiling untouched; only the molecule-type call sites are rewired to the new canonical functions (they change behavior). `npm run build` staying green after each task proves the Vite/worker wiring survives the moves.

**Tech Stack:** TypeScript 5.9, Vitest 4.1.2 (env `node`), `@vitest/coverage-v8`. React 19 / Vite 6 app. No new dependencies.

**Depends on:** Phase A (`…arch-phaseA-dedupe-deadcode.md`) — dead-code/type cleanup and the `clipInterval` name-collision fix. Phase A does **not** touch any of the functions moved here. (The is-protein-session dedup is **owned and implemented by Phase B** — see Task 1's `isProteinSession` helper — not Phase A.)

## Global Constraints

- **Behavior-preserving except one flagged item.** Every move is verbatim (only `export`/imports adjusted). The **single non-preserving change** is the molecule-type consolidation (Task 4): the canonical `detectMoleculeType` adopts an IUPAC-aware protein-only alphabet, which reclassifies a few edge sequences. It is called out explicitly, its alphabet is documented, tests pin the new behavior, and a manual fixture check is required. **Maintainer sign-off (2026-07-02): this behavior change is approved — proceed without further approval, but still complete the Task 4 fixture check (Step 7).** If any other test cannot pass, recompute the expected value from source; if the code is genuinely wrong, STOP and report — do not weaken tests or silently "fix" logic.
- **AGPL header** (18 lines, `/* … */`) at the top of every new covered source file (`.ts`), **identical to `services/bioUtils.ts` lines 1-18**. `npm run lint:headers` enforces (CI-blocking). New files created here: `src/domain/bio/sequence.ts`, `src/domain/bio/__tests__/sequence.test.ts`. Auto-insert with `node scripts/check-license-headers.mjs --fix` if forgotten.
- **Functions, not classes** (spec §2.2). `sequence.ts` is a flat set of exported pure functions + one exported constant.
- **CI mirror after each task** — all four green:
  ```bash
  npm run typecheck > /dev/null 2>&1; echo "typecheck=$?"
  npm run lint      > /dev/null 2>&1; echo "lint=$?"      # 0 = warnings only
  rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "coverage=$?"
  npm run build     > /dev/null 2>&1; echo "build=$?"
  ```
- **Coverage ratchet:** the gate `include` already covers `src/domain/**` and `services/**` (see `vite.config.ts:46-51`), so moved code stays measured with **no `include` change**. Baseline achieved at plan time: **statements 96.62 / branches 89.97 / functions 97.6 / lines 98.29**; current thresholds **94/85/93/92**. Re-baseline in the final task (raise, never lower).
- **Branch:** work on a feature branch off `develop` (e.g. `feat/arch-phaseB-domain-sequence`); the final PR targets `develop` (integration), per the repo branch workflow.
- **RTK note:** if `vitest`/tool output looks garbled or truncated, prefix the command with `rtk proxy`.

## File structure

| File | Change | Responsibility after Phase B |
|---|---|---|
| `src/domain/bio/sequence.ts` | **create** | Canonical: `reverseComplement`, `translateSequence` (+internal `GENETIC_CODE`), `extractCodingSequence`, `detectEarlyStop`, `PROTEIN_ONLY_RESIDUES`, `detectMoleculeType`, `classifyLocusMoleculeType`, `removeGapsWithMap`, `mapUngappedRangeToAligned`, `getOriginalPos`, `isProteinSession` |
| `src/domain/bio/__tests__/sequence.test.ts` | **create** | Unit tests for every `sequence.ts` export; pins the NEW molecule-type behavior |
| `src/domain/bio/index.ts` | modify | Barrel: add `export … from './sequence'` (incl. `isProteinSession`) + the `getNonGapSegments` alias re-exported from `./coordinate` |
| `src/domain/bio/coordinate.ts` | (unchanged) | Keeps `buildAlignedSegments` as the ONE canonical non-gap segment builder |
| `services/searchLogic.ts` | modify | Drop `reverseComplement`/`getNonGapSegments`/`removeGapsWithMap`/`mapUngappedRangeToAligned` bodies → re-export from domain barrel (shim). Keeps `SearchResult`, `degenerateToRegex`, `smithWaterman` |
| `services/bioUtils.ts` | modify | Drop translation cluster + `getOriginalPos` (+ its private `reverseComplement`) → re-export the 4 externally-used ones from domain barrel (shim). Keeps colors/exporters/selection-slicing |
| `services/moleculeType.ts` | modify | Becomes a re-export shim of `detectMoleculeType` |
| `services/genbank/headerParser.ts` | modify | LOCUS classification calls `classifyLocusMoleculeType` |
| `src/app/hooks/useFileHandlers.ts` | modify | `sniffFastaCategory`/`sniffGenBankCategory` delegate to the canonical domain functions; drop now-unused constants; reconcile JSDoc; rewire the is-protein-session dedup (`getLoadedCategory`) to `isProteinSession` |
| `src/app/hooks/useSearchWorker.ts` | modify | Rewire the duplicate `records.some(r => r.moleculeType === 'protein')` computation to `isProteinSession` |
| `services/__tests__/moleculeType.test.ts` | modify | Update assertions to the new canonical behavior |
| `services/parsers/__tests__/fasta.test.ts` | modify | Update the one molecule-type assertion (`MKV` was contrived) |
| `vite.config.ts` | modify (final task) | Re-baseline ratchet thresholds |

---

## File-granularity decision (recommended: ONE `sequence.ts`)

**Decision: a single `src/domain/bio/sequence.ts`, not a `sequence.ts`/`gaps.ts`/`translation.ts` split.** Rationale:

1. **Spec-locked.** Spec §3 names exactly one new module, `sequence.ts`, and enumerates all these primitives as its contents. Matching it keeps the target reference and Phase C relocation simple.
2. **Comfortably under the size guards.** Assembled, the module is ≈300 lines including header/JSDoc — well under the `max-lines` **warn=400 / error=600** thresholds (`eslint.config.js:39-48`). No fragmentation needed to satisfy the size net.
3. **Cohesion is fine.** Every function is a pure operation over a residue string; internal comment banners (`// Reverse complement`, `// Translation`, `// Molecule-type detection`, `// Gap ↔ ungapped mapping`) give the structure a multi-file split would, without extra barrel plumbing or premature churn.
4. **Aligned-segment builder stays put.** The `getNonGapSegments`/`buildAlignedSegments` dedup does NOT move into `sequence.ts`: spec §3 assigns "aligned-segment building" to `coordinate.ts`, which already owns the fully-tested `buildAlignedSegments`. We dedup **into** `coordinate.ts` (make `getNonGapSegments` an alias of it) rather than create a competing copy. `sequence.ts` therefore holds only the *other three* gap↔ungapped helpers (`removeGapsWithMap`, `mapUngappedRangeToAligned`, `getOriginalPos`).

If a future maintainer wants finer modules, splitting behind the barrel is a trivial follow-up; do not pre-split now.

---

## Task 1: Create `src/domain/bio/sequence.ts` + barrel export + tests

**Files:**
- Create: `src/domain/bio/sequence.ts`
- Create: `src/domain/bio/__tests__/sequence.test.ts`
- Modify: `src/domain/bio/index.ts`

**Interfaces (all pure; the module imports only `./intervals` for `splitWrapAround`):**
- `export function reverseComplement(seq: string): string`
- `export const translateSequence: (seq: string) => string`
- `export function extractCodingSequence(feature, seq): { codingSeq: string; alignedIndices: number[] }`
- `export function detectEarlyStop(codingSeq: string): boolean`
- `export const PROTEIN_ONLY_RESIDUES: string`
- `export const detectMoleculeType: (seq: string) => 'dna' | 'rna' | 'protein'`
- `export const classifyLocusMoleculeType: (locusLine: string) => 'dna' | 'rna' | 'protein'`
- `export function removeGapsWithMap(seq: string): { ungapped: string; map: number[] }`
- `export function mapUngappedRangeToAligned(map: number[], start: number, end: number): { start: number; end: number }`
- `export const getOriginalPos: (alignedSeq: string, alignedPos: number) => number`
- `export function isProteinSession(records: { moleculeType?: 'dna' | 'rna' | 'protein' }[]): boolean`

At the end of Task 1 the old definitions still exist in `services/*`; there is temporarily a second (differently-behaving) `detectMoleculeType`, but **no shared consumer imports the new module yet**, so everything stays green. Coverage of the new file is provided entirely by `sequence.test.ts` (nothing else imports it yet), so the tests below are mandatory, not optional.

- [ ] **Step 1: Create `src/domain/bio/sequence.ts`.** Prepend the AGPL header (identical to `services/bioUtils.ts` lines 1-18), then a module JSDoc, then assemble the functions in the order below. Blocks marked "move verbatim" must be copied **character-for-character** from the cited source ranges (only the surrounding placement changes); blocks marked "as shown" are written exactly as printed here.

Module JSDoc + reverse-complement (**as shown** — chosen canonical copy; the `services/searchLogic.ts:73` and `services/bioUtils.ts:321` copies are byte-identical apart from `function` vs `const` and a trailing comma, verified identical IUPAC map + case/gap handling):

```typescript
/**
 * Pure sequence primitives — the canonical home for biology algorithms that
 * operate on raw residue strings: reverse-complement, codon translation,
 * molecule-type detection, and gap↔ungapped coordinate mapping.
 *
 * This module imports only sibling `domain` modules (`./intervals`, for
 * `splitWrapAround` — a legal `domain`→`domain` import per spec §4.1); every
 * export is a pure function over strings/number arrays.
 */

import { splitWrapAround } from './intervals';

// ---------------------------------------------------------------------------
// Reverse complement
// ---------------------------------------------------------------------------

/** Reverse-complements a nucleotide string, preserving case and gap ('-') characters. */
export function reverseComplement(seq: string): string {
  const complement: Record<string, string> = {
    'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C', 'N': 'N',
    'R': 'Y', 'Y': 'R', 'S': 'S', 'W': 'W', 'K': 'M',
    'M': 'K', 'B': 'V', 'D': 'H', 'H': 'D', 'V': 'B',
    'a': 't', 't': 'a', 'c': 'g', 'g': 'c', 'n': 'n',
    '-': '-',
  };
  return seq.split('').reverse().map(base => complement[base] || base).join('');
}
```

Translation cluster:
```
// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------
```
- **Move `services/bioUtils.ts` lines 24-42 verbatim** (the `const GENETIC_CODE` table — keep it module-private, NOT exported — and `export const translateSequence`).
- **Move `services/bioUtils.ts` lines 44-99 verbatim** (`extractCodingSequence` with its JSDoc). Its internal `reverseComplement(codingSeq)` call (was `bioUtils.ts:94`) now binds to the local `reverseComplement` above. After Phase A's rewrite this body also calls `splitWrapAround`, which resolves via the `import { splitWrapAround } from './intervals';` added at the top of the module (a legal `domain`→`domain` import).
- **Move `services/bioUtils.ts` lines 101-120 verbatim** (`detectEarlyStop` with its JSDoc). Its internal `translateSequence(...)` call now binds locally.

Molecule-type detection (**as shown** — NEW canonical; behavior differs from the 4 current impls, see Task 4):
```typescript
// ---------------------------------------------------------------------------
// Molecule-type detection  (canonical — IUPAC-aware alphabet)
// ---------------------------------------------------------------------------

/**
 * Residues that occur ONLY in protein sequences — the complement of the IUPAC
 * nucleotide alphabet (A C G T U N R Y S W K M B D H V) within A–Z, plus the
 * stop symbol `*`. Presence of any of these proves a sequence is protein.
 * `U` (selenocysteine) is deliberately EXCLUDED because it is also RNA uracil.
 */
export const PROTEIN_ONLY_RESIDUES = 'EFIJLOPQXZ*';

// '*' is a literal inside a character class; the set has no other regex-special
// characters, and the pattern is non-global so `.test()` is stateless.
const PROTEIN_ONLY_PATTERN = new RegExp(`[${PROTEIN_ONLY_RESIDUES}]`);

/**
 * Classifies a residue string as DNA, RNA, or protein from its alphabet alone.
 *
 * `protein` when the sequence contains any residue that never occurs in the
 * IUPAC nucleotide alphabet (see {@link PROTEIN_ONLY_RESIDUES}); otherwise
 * `rna` when it contains `U`; otherwise `dna`.
 *
 * Note: nucleotide ambiguity codes (R Y S W K M B D H V) and the amino-acid
 * letters overlapping them are treated as *nucleotide*, so a hypothetical
 * protein composed only of nucleotide-overlapping residues (e.g. "MKV") is
 * classified `dna`. Such sequences are vanishingly rare; load them via GenBank,
 * where the LOCUS line declares the molecule type explicitly.
 */
export const detectMoleculeType = (seq: string): 'dna' | 'rna' | 'protein' => {
  const upper = seq.toUpperCase();
  if (PROTEIN_ONLY_PATTERN.test(upper)) return 'protein';
  if (upper.includes('U')) return 'rna';
  return 'dna';
};

/**
 * Classifies a GenBank LOCUS line by its molecule-type/unit field.
 *
 * Protein records use "aa" (amino acids); RNA molecule tokens contain "rna"
 * (mRNA, rRNA, tRNA, ncRNA…); everything else is DNA. Reproduces the exact
 * logic previously inlined in `services/genbank/headerParser.ts`.
 */
export const classifyLocusMoleculeType = (locusLine: string): 'dna' | 'rna' | 'protein' => {
  const lower = locusLine.toLowerCase();
  if (/\baa\b/.test(lower)) return 'protein';
  if (lower.includes('rna')) return 'rna';
  return 'dna';
};
```

Gap↔ungapped mapping:
```
// ---------------------------------------------------------------------------
// Gap ↔ ungapped coordinate mapping
// ---------------------------------------------------------------------------
```
- **Move `services/searchLogic.ts` lines 108-118 verbatim** (`removeGapsWithMap`).
- **Move `services/searchLogic.ts` lines 120-132 verbatim** (`mapUngappedRangeToAligned`).
- **Move `services/bioUtils.ts` lines 418-430 verbatim** (`getOriginalPos` with its JSDoc).

> Note: `getNonGapSegments` (`searchLogic.ts:84`) is NOT moved here — it is the same algorithm as `coordinate.ts:54` `buildAlignedSegments` and is deduped into `coordinate.ts` in Task 2.

Session-level molecule-type (**as shown** — NEW canonical helper; **Phase B owns the is-protein-session dedup**, it is not Phase A's):
```typescript
// ---------------------------------------------------------------------------
// Session-level molecule-type
// ---------------------------------------------------------------------------

/**
 * True when any loaded record is a protein — the single canonical replacement
 * for the duplicated `records.some(r => r.moleculeType === 'protein')` checks in
 * the app hooks. `viewModel.deriveAlignmentState` still receives the resulting
 * boolean as a parameter (unchanged); this only dedups the computation.
 */
export function isProteinSession(records: { moleculeType?: 'dna' | 'rna' | 'protein' }[]): boolean {
  return records.some(r => r.moleculeType === 'protein');
}
```

- [ ] **Step 2: Update the barrel `src/domain/bio/index.ts`.** After the existing `export { … } from './consensus';` / `./intervals'` lines, add:

```typescript
export {
  reverseComplement,
  translateSequence,
  extractCodingSequence,
  detectEarlyStop,
  PROTEIN_ONLY_RESIDUES,
  detectMoleculeType,
  classifyLocusMoleculeType,
  removeGapsWithMap,
  mapUngappedRangeToAligned,
  getOriginalPos,
  isProteinSession,
} from './sequence';

// Alias exposing the deduped implementation from the domain barrel, so the
// search code's `import { getNonGapSegments } from '@/src/domain/bio'` (Phase C:
// exact.ts, fuzzy.ts, workers/handlers/search.ts, runInlineSearch.ts,
// protocol.test.ts) keeps resolving after services/searchLogic.ts is deleted.
export { buildAlignedSegments as getNonGapSegments } from './coordinate';
```
None of these names — including the new `isProteinSession` and the `getNonGapSegments` alias — are already exported by the barrel (verified: it exports `transposeCoordinates`/`buildAlignedSegments`/`processTransposition`/`calculateConsensus`/`clipInterval`/`clipSegments`/`splitWrapAround` + types), so there is no duplicate-export conflict.

- [ ] **Step 3: Create `src/domain/bio/__tests__/sequence.test.ts`** (AGPL header + the below). These pin every export, including the NEW molecule-type behavior:

```typescript
import { describe, it, expect } from 'vitest';
import {
  reverseComplement,
  translateSequence,
  extractCodingSequence,
  detectEarlyStop,
  detectMoleculeType,
  classifyLocusMoleculeType,
  removeGapsWithMap,
  mapUngappedRangeToAligned,
  getOriginalPos,
  PROTEIN_ONLY_RESIDUES,
  isProteinSession,
} from '../sequence';

describe('reverseComplement', () => {
  it('reverse-complements a simple DNA sequence', () => {
    expect(reverseComplement('ATCG')).toBe('CGAT');
  });
  it('maps N to N and preserves gap characters', () => {
    expect(reverseComplement('N')).toBe('N');
    expect(reverseComplement('A-T')).toBe('A-T');
  });
  it('preserves lowercase', () => {
    expect(reverseComplement('atcg')).toBe('cgat');
  });
  it('is its own inverse', () => {
    expect(reverseComplement(reverseComplement('AATTCCGG'))).toBe('AATTCCGG');
  });
});

describe('translateSequence', () => {
  it('translates whole codons and stops', () => {
    expect(translateSequence('ATGTAA')).toBe('M_');
  });
  it('ignores a trailing partial codon', () => {
    expect(translateSequence('ATGA')).toBe('M');
  });
  it('emits ? for an unknown codon', () => {
    expect(translateSequence('ATGNNN')).toBe('M?');
  });
});

describe('extractCodingSequence', () => {
  it('extracts a forward single-segment CDS', () => {
    const { codingSeq, alignedIndices } = extractCodingSequence(
      { strand: 1, start: 0, end: 3 }, 'ATGCCC',
    );
    expect(codingSeq).toBe('ATG');
    expect(alignedIndices).toEqual([0, 1, 2]);
  });
  it('reverse-complements a minus-strand CDS and reverses the indices', () => {
    const { codingSeq, alignedIndices } = extractCodingSequence(
      { strand: -1, start: 0, end: 3 }, 'ATGCCC',
    );
    expect(codingSeq).toBe('CAT');
    expect(alignedIndices).toEqual([2, 1, 0]);
  });
  it('splits a circular wrap-around (start > end) at the origin', () => {
    const { codingSeq, alignedIndices } = extractCodingSequence(
      { strand: 1, start: 4, end: 2 }, 'GGTTAA',
    );
    expect(codingSeq).toBe('AAGG');
    expect(alignedIndices).toEqual([4, 5, 0, 1]);
  });
  it('skips gap characters', () => {
    const { codingSeq, alignedIndices } = extractCodingSequence(
      { strand: 1, start: 0, end: 5 }, 'AT-GC',
    );
    expect(codingSeq).toBe('ATGC');
    expect(alignedIndices).toEqual([0, 1, 3, 4]);
  });
});

describe('detectEarlyStop', () => {
  it('is false when there is no internal stop', () => {
    expect(detectEarlyStop('ATGCCCGAG')).toBe(false);
  });
  it('is false for a normal terminal stop', () => {
    expect(detectEarlyStop('ATGCCCTAA')).toBe(false);
  });
  it('is true for an internal stop before the last codon', () => {
    expect(detectEarlyStop('ATGTAGGAG')).toBe(true);
  });
});

describe('detectMoleculeType (canonical alphabet)', () => {
  it('classifies a pure ACGT sequence as dna', () => {
    expect(detectMoleculeType('ACGTACGT')).toBe('dna');
  });
  it('classifies a U-bearing non-protein sequence as rna', () => {
    expect(detectMoleculeType('ACGU')).toBe('rna');
    expect(detectMoleculeType('acgu')).toBe('rna');
  });
  it('classifies a sequence with a protein-only residue as protein', () => {
    expect(detectMoleculeType('ACGTL')).toBe('protein'); // L never occurs in the nucleotide alphabet
    expect(detectMoleculeType('MKLEP')).toBe('protein'); // realistic peptide
  });
  it('lets a protein-only residue win over the U/rna signal', () => {
    expect(detectMoleculeType('ACGUL')).toBe('protein');
  });
  it('treats nucleotide ambiguity codes (R Y S W K M B D H V N) as dna', () => {
    expect(detectMoleculeType('ACGTRYSWKMBDHVN')).toBe('dna');
  });
  it('treats a nucleotide-overlapping "protein" (MKV) as dna', () => {
    expect(detectMoleculeType('MKV')).toBe('dna');
  });
  it('classifies protein-only ambiguity codes (X J O Z) as protein', () => {
    expect(detectMoleculeType('ACGTX')).toBe('protein');
    expect(detectMoleculeType('ACGTZ')).toBe('protein');
  });
  it('treats an empty sequence as dna', () => {
    expect(detectMoleculeType('')).toBe('dna');
  });
  it('exposes the documented alphabet constant', () => {
    expect(PROTEIN_ONLY_RESIDUES).toBe('EFIJLOPQXZ*');
  });
});

describe('classifyLocusMoleculeType', () => {
  it('classifies an "aa" LOCUS as protein', () => {
    expect(classifyLocusMoleculeType('LOCUS  P1  100 aa  linear  UNK 01-JAN-2020')).toBe('protein');
  });
  it('classifies an RNA molecule token as rna', () => {
    expect(classifyLocusMoleculeType('LOCUS  R1  100 bp  mRNA  linear')).toBe('rna');
  });
  it('classifies a bp/DNA LOCUS as dna', () => {
    expect(classifyLocusMoleculeType('LOCUS  D1  100 bp  DNA  linear')).toBe('dna');
  });
});

describe('removeGapsWithMap', () => {
  it('maps ungapped indices back to aligned positions', () => {
    expect(removeGapsWithMap('A-C--G')).toEqual({ ungapped: 'ACG', map: [0, 2, 5] });
  });
  it('returns empties for an all-gap or empty sequence', () => {
    expect(removeGapsWithMap('----')).toEqual({ ungapped: '', map: [] });
    expect(removeGapsWithMap('')).toEqual({ ungapped: '', map: [] });
  });
});

describe('mapUngappedRangeToAligned', () => {
  it('returns {0,0} for an empty map', () => {
    expect(mapUngappedRangeToAligned([], 0, 4)).toEqual({ start: 0, end: 0 });
  });
  it('maps a mid-range and clamps out-of-range ends', () => {
    const map = [0, 2, 4, 5, 6, 7];
    expect(mapUngappedRangeToAligned(map, 1, 3)).toEqual({ start: 2, end: 5 });
    expect(mapUngappedRangeToAligned(map, 10, 20)).toEqual({ start: 6, end: 7 });
  });
});

describe('getOriginalPos', () => {
  it('counts non-gap characters up to the aligned position', () => {
    expect(getOriginalPos('ACGT', 4)).toBe(4);
    expect(getOriginalPos('--AC', 4)).toBe(2);
    expect(getOriginalPos('A-C-G', 5)).toBe(3);
  });
  it('clamps an aligned position beyond the sequence length', () => {
    expect(getOriginalPos('ACGT', 100)).toBe(4);
  });
});

describe('isProteinSession', () => {
  it('is true when any record is protein', () => {
    expect(isProteinSession([{ moleculeType: 'dna' }, { moleculeType: 'protein' }])).toBe(true);
  });
  it('is false when no record is protein', () => {
    expect(isProteinSession([{ moleculeType: 'dna' }, { moleculeType: 'rna' }])).toBe(false);
  });
  it('is false for an empty session', () => {
    expect(isProteinSession([])).toBe(false);
  });
});
```

- [ ] **Step 4: Verify (full CI mirror).**
  ```bash
  npm run lint:headers > /dev/null 2>&1; echo "headers=$?"
  npm run typecheck    > /dev/null 2>&1; echo "typecheck=$?"
  npm run lint         > /dev/null 2>&1; echo "lint=$?"
  rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "coverage=$?"
  npm run build        > /dev/null 2>&1; echo "build=$?"
  ```
  All `0`. If `coverage` is non-zero, inspect which metric dipped and add the missing assertion to `sequence.test.ts` (do not lower the gate here).

- [ ] **Step 5: Commit.**
  ```bash
  git add src/domain/bio/sequence.ts src/domain/bio/__tests__/sequence.test.ts src/domain/bio/index.ts
  git commit -m "refactor(domain): add canonical sequence primitives module (domain/bio/sequence)"
  ```

---

## Task 2: Collapse `reverseComplement` + gap-mapping in `services/searchLogic.ts` to domain re-exports

**Files:**
- Modify: `services/searchLogic.ts`

**What & why:** `reverseComplement`, `removeGapsWithMap`, `mapUngappedRangeToAligned` now live in `sequence.ts`; `getNonGapSegments` is the same algorithm as `coordinate.ts` `buildAlignedSegments`. Replace all four definitions with re-exports from the domain barrel so every current importer (`services/search/exact.ts`, `runSearch.ts`, `runInlineSearch.ts`, `src/workers/__tests__/protocol.test.ts`, `services/__tests__/searchLogic.test.ts`, `perf/searchLogic.perf.ts`) keeps compiling **unchanged**. This achieves the `getNonGapSegments`/`buildAlignedSegments` dedup (one implementation, aliased) with zero caller churn; Phase C removes the shim and normalizes imports.

Verified safe: `searchLogic.ts`'s remaining code (`degenerateToRegex`, `smithWaterman`, `ungappedFuzzyScan`, `traceback`, `SearchResult`, the IUPAC maps) does **not** call any of the four removed functions.

- [ ] **Step 1: Remove the four function bodies** from `services/searchLogic.ts`:
  - `reverseComplement` (lines 73-82)
  - `getNonGapSegments` (lines 84-106)
  - `removeGapsWithMap` (lines 108-118)
  - `mapUngappedRangeToAligned` (lines 120-132)

- [ ] **Step 2: Add the re-export block** near the top of `services/searchLogic.ts` (after the module JSDoc / `SearchResult` interface). `getNonGapSegments` is aliased to the canonical `buildAlignedSegments` (identical output shape — `FeatureSegment[]` is structurally `{start,end}[]`; all current callers pass in-bounds ranges, verified, so the substring-vs-direct-index edge case cannot manifest):

```typescript
// Sequence primitives now live in the domain layer; re-exported here so existing
// `services/*` importers keep resolving until Phase C normalizes the paths.
export {
  reverseComplement,
  removeGapsWithMap,
  mapUngappedRangeToAligned,
  buildAlignedSegments as getNonGapSegments,
} from '../src/domain/bio';
```

- [ ] **Step 3: Verify (full CI mirror).** Same five commands as Task 1 Step 4 → all `0`.
  - `services/__tests__/searchLogic.test.ts` still tests `reverseComplement`/`getNonGapSegments`/`removeGapsWithMap`/`mapUngappedRangeToAligned` through the re-exports; its `getNonGapSegments` cases (`'ACGTACGT'`/`'AC--GT'`/`'----'`/`'XXXXAC--GT'`, all in-bounds) match `buildAlignedSegments` exactly and pass.
  - `src/workers/__tests__/protocol.test.ts` (imports `getNonGapSegments` from `searchLogic`) and `perf/searchLogic.perf.ts` (imports `reverseComplement`) stay green under typecheck.

- [ ] **Step 4: Commit.**
  ```bash
  git add services/searchLogic.ts
  git commit -m "refactor(search): re-export reverseComplement/gap-mapping from domain; dedup getNonGapSegments into buildAlignedSegments"
  ```

---

## Task 3: Collapse the translation cluster + `getOriginalPos` in `services/bioUtils.ts` to domain re-exports

**Files:**
- Modify: `services/bioUtils.ts`

**What & why:** `translateSequence`, `GENETIC_CODE`, `extractCodingSequence`, `detectEarlyStop`, `getOriginalPos`, and the private `reverseComplement` now live in `sequence.ts`. Remove them from `bioUtils.ts` and re-export the four **externally-consumed** ones from the domain barrel so `components/GenomeViewer.tsx` (`translateSequence`/`detectEarlyStop`/`extractCodingSequence`), `src/app/components/Sidebar.tsx` + `src/app/logic/featureManager.ts` (`getOriginalPos`), and the tests `translationHelpers.test.ts` + `bioUtils.test.ts` keep compiling unchanged.

**Deviation from the spec's literal "update both former sites to import it" for `reverseComplement`:** `bioUtils`'s `reverseComplement` had exactly one consumer — the internal `extractCodingSequence` call at `bioUtils.ts:94` — and **no external importer** (verified: every `reverseComplement` import in the tree resolves to `searchLogic`, none to `bioUtils`). Since `extractCodingSequence` moves out with it, `bioUtils` no longer references `reverseComplement`, so it is dropped entirely (no dead re-export). Flagged in the summary.

Verified safe: `bioUtils.ts`'s remaining code (`getNucleotideColor`, `getAminoAcidColor`, `getFeatureColor`, `exportToFasta`, `exportToGff`, `exportToGenBank`, `downloadBlob`, `Interval`, `clipInterval`, `clipFeature`, `sliceRecordsBySelection`) does not call any removed function. The `export { makeUniqueId } from './idHelpers';` re-export (a Phase A dead-code item) is left untouched.

- [ ] **Step 1: Remove from `services/bioUtils.ts`:**
  - `GENETIC_CODE` (lines 24-33)
  - `translateSequence` (lines 35-42)
  - `extractCodingSequence` (lines 44-99, with JSDoc)
  - `detectEarlyStop` (lines 101-120, with JSDoc)
  - `reverseComplement` (lines 321-330)
  - `getOriginalPos` (lines 418-430, with JSDoc)

- [ ] **Step 2: Add the re-export** (near the top, after `export { makeUniqueId } from './idHelpers';`):

```typescript
// Translation + coordinate-mapping primitives now live in the domain layer;
// re-exported here for existing `services/bioUtils` importers until Phase C.
export {
  translateSequence,
  extractCodingSequence,
  detectEarlyStop,
  getOriginalPos,
} from '../src/domain/bio';
```

- [ ] **Step 3: Verify (full CI mirror).** Same five commands → all `0`.
  - `services/__tests__/translationHelpers.test.ts` (imports `extractCodingSequence`/`detectEarlyStop`/`translateSequence` from `../bioUtils`) and `services/__tests__/bioUtils.test.ts` (imports `getOriginalPos` from `../bioUtils`) pass through the re-exports.
  - `npm run build` proves `components/GenomeViewer.tsx` still resolves its `bioUtils` import (line 24) under Vite.

- [ ] **Step 4: Commit.**
  ```bash
  git add services/bioUtils.ts
  git commit -m "refactor(bio): re-export translation cluster + getOriginalPos from domain"
  ```

---

## Task 4: Molecule-type consolidation — BEHAVIOR-CHANGING (rewire the 4 sites + update tests)

> **This is the one non-behavior-preserving task in Phase B.** The 4 current molecule-type implementations disagree (3 different protein alphabets + a JSDoc/code mismatch). They are unified onto the canonical `detectMoleculeType` / `classifyLocusMoleculeType` / `PROTEIN_ONLY_RESIDUES` from `sequence.ts`.

**Files:**
- Modify: `services/moleculeType.ts`
- Modify: `services/genbank/headerParser.ts`
- Modify: `src/app/hooks/useFileHandlers.ts`
- Modify: `src/app/hooks/useSearchWorker.ts`
- Modify: `services/__tests__/moleculeType.test.ts`
- Modify: `services/parsers/__tests__/fasta.test.ts`

**The behavior change, precisely:** the canonical `detectMoleculeType` uses an **IUPAC-aware** protein-only alphabet (`EFIJLOPQXZ*` = letters absent from `ACGTUNRYSWKMBDHV`, plus `*`). The old `services/moleculeType.ts` alphabet was `DEFHIKLMPQRSVWY`, which (a) called nucleotide ambiguity codes `D H K M R S V W Y` "protein" and (b) called the genuinely protein-only codes `J O X Z` "dna" — i.e. backwards from IUPAC. Net effect on `parseFasta` record classification:
- Sequences whose only non-ACGTU letters are nucleotide-overlapping AAs (`MKV`, etc.) → **now `dna`/`rna`** (were `protein`).
- Sequences containing `X`/`J`/`O`/`Z` → **now `protein`** (were `dna`).
- **Real proteins are unaffected** — they almost always contain `E`/`F`/`I`/`L`/`P`/`Q`, which are protein-only in both alphabets.

**Equivalence facts (so the GenBank + FASTA-sniff paths stay behavior-preserving despite reusing the new functions):**
- `classifyLocusMoleculeType` reproduces `headerParser`'s exact old logic → GenBank `moleculeType` and `sniffGenBankCategory` are **unchanged** (its `\baa\b` protein test is identical; RNA still maps to `nucleotide` in the sniffer).
- `sniffFastaCategory` was **already dominated** by its `nonNucleotide > 0` fallback: the old `strongProtein` counters were redundant because `strongProteinAlphabet ⊂ non-nucleotide letters`, so the function returned `protein` **iff** the sample contained any char outside `ACGTUNRYSWKMBDHV` (excluding `-`) — which is **exactly** `detectMoleculeType(sample) === 'protein'` under the new alphabet. Delegating is therefore behavior-preserving for the FASTA category sniff. (Manual fixture check still required, below.)

- [ ] **Step 1: `services/moleculeType.ts` → re-export shim.** Replace the entire body below the AGPL header (the old JSDoc + `detectMoleculeType` definition, lines 20-39) with:

```typescript
// Canonical implementation lives in src/domain/bio/sequence.ts (Phase C removes
// this compatibility shim and normalizes the import in services/parsers/fasta.ts).
export { detectMoleculeType } from '../src/domain/bio';
```
`services/parsers/fasta.ts` keeps importing `detectMoleculeType` from `../moleculeType` (now the shim) → picks up the new behavior with no import change.

- [ ] **Step 2: `services/genbank/headerParser.ts` → use `classifyLocusMoleculeType`.** Add the import (after the AGPL header, before `export interface HeaderData`):

```typescript
import { classifyLocusMoleculeType } from '../../src/domain/bio';
```
Then replace the inline classification block (lines 60-71 — the `// Determine molecule type…` comment through the `if/else if/else` assigning `moleculeType`) with:

```typescript
      moleculeType = classifyLocusMoleculeType(line);
```
`classifyLocusMoleculeType` lowercases internally, so passing the raw `line` is correct and byte-equivalent. `services/genbank/__tests__/headerParser.test.ts` moleculeType cases (bp→dna, aa→protein, mRNA→rna, ncRNA→rna, empty→dna) pass unchanged.

- [ ] **Step 3: `src/app/hooks/useFileHandlers.ts` → delegate the sniffers to the canonical functions.**
  - Add the import (after the existing `@/services/bioUtils` import, or grouped with the domain-types import):
    ```typescript
    import { detectMoleculeType, classifyLocusMoleculeType, isProteinSession } from '@/src/domain/bio';
    ```
  - Remove the now-unused constants `FASTA_STRONG_PROTEIN_MIN_COUNT` and `FASTA_STRONG_PROTEIN_MIN_RATIO` (lines 33-34). Keep `FASTA_SAMPLE_MAX_RECORDS` and `FASTA_SAMPLE_MAX_LENGTH` (still used by the sampling loop).
  - Replace `sniffGenBankCategory` (lines 36-41) with:
    ```typescript
    /** Returns 'protein' if the GenBank LOCUS line declares amino-acid units, else 'nucleotide'. */
    function sniffGenBankCategory(content: string): 'nucleotide' | 'protein' {
      const match = content.match(/^LOCUS\s+.+$/m);
      if (match && classifyLocusMoleculeType(match[0]) === 'protein') return 'protein';
      return 'nucleotide';
    }
    ```
  - Replace `sniffFastaCategory` (lines 43-87) — keep the sampling loop verbatim, replace only the classification tail (the `sample` line through the final `return`) and the JSDoc:
    ```typescript
    /**
     * Samples the first few records of a FASTA string and classifies the sample
     * via the canonical `detectMoleculeType` (protein-only alphabet =
     * PROTEIN_ONLY_RESIDUES). RNA maps to 'nucleotide'.
     */
    function sniffFastaCategory(content: string): 'nucleotide' | 'protein' {
      const lines = content.split('\n');
      let seq = '';
      let seenHeader = false;
      let sampledRecords = 0;
      for (const line of lines) {
        const t = line.trim();
        if (t.startsWith('>')) {
          if (seenHeader && seq) {
            sampledRecords += 1;
            if (sampledRecords >= FASTA_SAMPLE_MAX_RECORDS || seq.length >= FASTA_SAMPLE_MAX_LENGTH) break;
          }
          seenHeader = true;
          continue;
        } else if (seenHeader && t) {
          seq += t;
          if (seq.length >= FASTA_SAMPLE_MAX_LENGTH) break;
        }
      }

      const sample = seq.toUpperCase().replace(/[^A-Z*-]/g, '');
      if (!sample) return 'nucleotide';
      return detectMoleculeType(sample) === 'protein' ? 'protein' : 'nucleotide';
    }
    ```
  - **Is-protein-session dedup (behavior-preserving).** Replace the two duplicate `records.some(r => r.moleculeType === 'protein')` computations — `src/app/hooks/useSearchWorker.ts:105` and `src/app/hooks/useFileHandlers.ts:91` (in `getLoadedCategory`) — with `isProteinSession(records)` from `@/src/domain/bio`. In `useSearchWorker.ts` add its own `import { isProteinSession } from '@/src/domain/bio';`; in `useFileHandlers.ts` it joins the domain import added above. `viewModel.deriveAlignmentState` still receives the resulting boolean as a parameter (unchanged) — this dedups the computation only, it is **not** behavior-changing.

- [ ] **Step 4: Update `services/__tests__/moleculeType.test.ts`** to pin the new canonical behavior. Apply these exact edits:
  - Replace:
    ```typescript
      it('classifies a sequence with a protein-only char as protein', () => {
        expect(detectMoleculeType('ACGTM')).toBe('protein'); // M is protein-only
      });
    ```
    with:
    ```typescript
      it('classifies a sequence with a protein-only residue as protein', () => {
        expect(detectMoleculeType('ACGTL')).toBe('protein'); // L never occurs in the nucleotide alphabet
      });
    ```
  - Replace `expect(detectMoleculeType('ACGUM')).toBe('protein');` with `expect(detectMoleculeType('ACGUL')).toBe('protein'); // L (protein) wins over U (rna)`.
  - Replace `expect(detectMoleculeType('mkv')).toBe('protein');` with `expect(detectMoleculeType('mkle')).toBe('protein'); // lowercase L/E are protein-only`.
  - Replace:
    ```typescript
      it('classifies excluded/ambiguous codes (B/J/O/X/Z) as dna', () => {
        expect(detectMoleculeType('ACGTX')).toBe('dna');
      });
    ```
    with:
    ```typescript
      it('classifies IUPAC nucleotide ambiguity codes as dna', () => {
        expect(detectMoleculeType('ACGTRYSWKMBDHVN')).toBe('dna');
      });
      it('classifies protein-only ambiguity codes (X/J/O/Z) as protein', () => {
        expect(detectMoleculeType('ACGTX')).toBe('protein');
        expect(detectMoleculeType('ACGTZ')).toBe('protein');
      });
    ```

- [ ] **Step 5: Update `services/parsers/__tests__/fasta.test.ts`** — the `MKV` sample was contrived (nucleotide-overlapping AAs). Replace the literal `'>a\nACGT\n>b\nMKV'` with `'>a\nACGT\n>b\nMKLEP'` (a realistic peptide containing `L`/`E`/`P`); the assertion `expect(recs[1].moleculeType).toBe('protein')` stays and now holds under the canonical alphabet.

- [ ] **Step 6: Verify (full CI mirror).** Same five commands → all `0`. If any assertion outside the two updated test files fails, STOP and report (it would indicate an unaccounted consumer of `detectMoleculeType`; the only verified caller is `parseFasta`).

- [ ] **Step 7: Manual fixture eyeball (behavior-change guard).** Load a real nucleotide FASTA (e.g. an ACGT alignment), a real protein FASTA, and a GenBank file (`SCU49845.gb` in repo root) via the running app, and confirm records classify correctly (nucleotide alignment stays nucleotide even with ambiguity codes; real protein stays protein; GenBank `aa` LOCUS stays protein). Use `npm run dev` and the file-upload UI. Record the outcome in the commit body / PR description.

- [ ] **Step 8: Commit.**
  ```bash
  git add services/moleculeType.ts services/genbank/headerParser.ts src/app/hooks/useFileHandlers.ts src/app/hooks/useSearchWorker.ts \
    services/__tests__/moleculeType.test.ts services/parsers/__tests__/fasta.test.ts
  git commit -m "refactor(bio)!: unify molecule-type detection on IUPAC-aware canonical alphabet

BEHAVIOR CHANGE: detectMoleculeType now treats nucleotide ambiguity codes as
nucleotide and protein-only codes (X/J/O/Z) as protein, fixing the divergent
alphabets across moleculeType/headerParser/useFileHandlers. GenBank LOCUS and
FASTA category-sniff paths are behavior-preserving (see plan Task 4)."
  ```

---

## Task 5: Re-baseline coverage gate + full CI mirror + PR

**Files:**
- Modify: `vite.config.ts` (thresholds only, if achieved rose)

- [ ] **Step 1: Measure achieved coverage.**
  ```bash
  rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "gate=$?"
  node -e '
  const s=require("./coverage/coverage-summary.json").total;
  const f=k=>Math.max(0, Math.floor(s[k].pct)-4);
  console.log("achieved:", JSON.stringify({lines:s.lines.pct,branches:s.branches.pct,functions:s.functions.pct,statements:s.statements.pct}));
  console.log("suggested (floor-4):", JSON.stringify({lines:f("lines"),branches:f("branches"),functions:f("functions"),statements:f("statements")}));
  '
  ```
  Baseline before Phase B was 96.62/89.97/97.6/98.29 (stmts/branches/functions/lines) against thresholds 94/85/93/92. The moves are covered code redistributed plus one new tested function, so achieved should hold or rise.

- [ ] **Step 2: Re-baseline thresholds in `vite.config.ts`** (`thresholds` block, lines 64-69) — set each to `min(currentThreshold + gain, floor(achieved) - 4)` such that the value **only rises** from 94/85/93/92 (never lower). If a metric somehow dipped below its current threshold, STOP and investigate (a move dropped coverage — that should not happen); do not lower the gate to paper over a regression. Update the ratchet comment (lines 59-63) with the new achieved figures. Re-run `rtk proxy npx vitest run --coverage`; expect `gate=0`.

- [ ] **Step 3: Full CI mirror** (all `0`):
  ```bash
  npm run lint:headers > /dev/null 2>&1; echo "headers=$?"
  npm run typecheck    > /dev/null 2>&1; echo "typecheck=$?"
  npm run lint         > /dev/null 2>&1; echo "lint=$?"
  rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "coverage=$?"
  npm run build        > /dev/null 2>&1; echo "build=$?"
  ```
  Confirm the test count is ≥ 499 (the pre-Phase-B baseline).

- [ ] **Step 4: Commit + push + PR (targets `develop`).**
  ```bash
  git add vite.config.ts
  git commit -m "ci(coverage): re-baseline ratchet thresholds after Phase B sequence consolidation"
  git push -u origin feat/arch-phaseB-domain-sequence
  gh pr create --base develop --title "refactor: Phase B — consolidate sequence primitives into domain/bio/sequence" \
    --body "$(cat <<'EOF'
Consolidates the scattered pure sequence primitives into `src/domain/bio/sequence.ts` (functions, no class): reverseComplement, the translation cluster, molecule-type detection, and gap↔ungapped mapping. Old `services/*` sites become thin re-export shims (Phase C removes them). `getNonGapSegments` is deduped into `coordinate.ts`'s `buildAlignedSegments`.

One deliberate BEHAVIOR CHANGE: molecule-type detection is unified onto an IUPAC-aware canonical alphabet (`PROTEIN_ONLY_RESIDUES`); the GenBank-LOCUS and FASTA category-sniff paths are behavior-preserving. Real GenBank/FASTA fixtures were eyeballed (Task 4 Step 7). See docs/superpowers/plans/2026-07-02-arch-phaseB-domain-sequence.md and the design spec docs/superpowers/specs/2026-07-02-architecture-restructure-design.md.
EOF
)"
  ```

---

## Self-review

- **Spec conformance:** target path `src/domain/bio/sequence.ts` with functions-not-classes (spec §2.2, §3); `domain` imports only itself — `sequence.ts` imports only sibling `domain` modules (`./intervals`, a legal `domain`→`domain` import) (§4.1); `PROTEIN_ONLY_RESIDUES` is the single documented protein-alphabet constant; aligned-segment building stays in `coordinate.ts` (§3) with `getNonGapSegments` deduped into it. Molecule-type consolidation is flagged as the one behavior-changing item (§5, §8).
- **File-line references re-verified against live code:** `reverseComplement` `bioUtils.ts:321` / `searchLogic.ts:73`; `detectMoleculeType` `moleculeType.ts:33`; `sniffFastaCategory` `useFileHandlers.ts:47`, `sniffGenBankCategory` `:37`, JSDoc mismatch `:45`; `getNonGapSegments` `searchLogic.ts:84`, `removeGapsWithMap` `:108`, `mapUngappedRangeToAligned` `:120`; `buildAlignedSegments` `coordinate.ts:54`; translation cluster `bioUtils.ts:24-120`, `getOriginalPos` `:421`. Correction to spec: the LOCUS `aa` check is at `headerParser.ts:65` (the spec cites `:64`, which is the `const locusLower` line just above); block replaced spans lines 60-71.
- **Behavior preservation:** Tasks 1-3 are verbatim moves + re-export shims — no importer changes, so `build` staying green proves preservation. Task 2's `getNonGapSegments`→`buildAlignedSegments` alias verified equivalent (both fully-tested with identical in-bounds cases; every caller passes in-bounds ranges). Task 3's dropping of `bioUtils.reverseComplement` verified safe (zero external importers; sole consumer `extractCodingSequence` moved with it).
- **The one behavior change (Task 4)** is isolated to `detectMoleculeType`'s alphabet (only `parseFasta` calls it — verified by tree grep); the GenBank + FASTA-sniff reuse is proven behavior-preserving; the two affected test assertions (`moleculeType.test.ts`, `fasta.test.ts`) are updated in the same task; a manual fixture check is mandated.
- **Green sequencing:** every task ends with the full CI mirror (typecheck + lint + headers + coverage + build). Task 1 self-covers the new file; Tasks 2-4 keep aggregate coverage stable (code redistributed within the already-included `src/domain/**` + `services/**` scope). Coverage `include` needs no change; thresholds re-baselined in Task 5.
- **AGPL headers:** the two new `.ts` files carry the 18-line header (Task 1); `lint:headers` is run every task.
- **Cross-phase:** the is-protein-session dedup is **owned and implemented here** (Phase B), not Phase A: `isProteinSession` lands in `sequence.ts` (Task 1, per spec §3) and the two duplicate `records.some(r => r.moleculeType === 'protein')` computations at `useSearchWorker.ts:105` and `useFileHandlers.ts:91` (`getLoadedCategory`) are rewired to it (Task 4); `viewModel.deriveAlignmentState` (`viewModel.ts:99`) still receives the boolean as a parameter (unchanged). Phase C deletes the re-export shims left in `services/searchLogic.ts` / `bioUtils.ts` / `moleculeType.ts` and normalizes `@/`/relative paths; Phase E adds the import-boundary ESLint rule and JSDoc pass.
