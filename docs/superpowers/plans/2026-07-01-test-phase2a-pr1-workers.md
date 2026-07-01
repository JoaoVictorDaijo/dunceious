# Phase 2A · PR1 — Workers & Parsing Extraction Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relocate the pure parsing and search logic out of the two Web Workers into node-testable `services/` modules (behavior-preserving), then unit-test it — with no new dependencies.

**Architecture:** Move the 5 bio parsers + `detectMoleculeType` into `services/parsers/` and `services/moleculeType.ts`; lift the bio worker's message routing into a pure `handleBioMessage(msg): BioWorkerResponse` and the search worker's body into a pure `runSearch(request): SearchWorkerResponse`. Each worker's `onmessage` becomes a one-line `postMessage(handler(e.data))`. The moved logic is byte-for-byte identical; `npm run build` + `typecheck` staying green is the behavior-preservation proof.

**Tech Stack:** TypeScript, Vitest 4.1.2 (env `node`), `@vitest/coverage-v8`.

## Global Constraints

- No new dependencies. Test env stays `node`.
- Every new source file starts with the 18-line AGPL header **identical to `services/bioUtils.ts` lines 1-18**.
- Extraction is **behavior-preserving**: move code verbatim (only add `export`, adjust imports). Do not rewrite logic. If a test cannot pass, recompute the expected value from the source; if the code is genuinely wrong, STOP and report — do not weaken the test or "fix" production code in this plan.
- Coverage gate `include` already covers `services/**`; new files are auto-measured. Thresholds are re-baselined in the final task (a few points below achieved; raise never lower).
- After each task: `npm run typecheck` and `npm run build` must stay green (behavior-preservation), plus the task's tests.
- RTK note: if `vitest` output looks garbled/truncated, prefix the command with `rtk proxy`.

## File structure

| File | Responsibility |
|---|---|
| `services/moleculeType.ts` (create) | `detectMoleculeType(seq)` |
| `services/parsers/fasta.ts` (create) | `FastaRecord` type + `parseFasta(content)` |
| `services/parsers/annotations.ts` (create) | `AnnotationTrack` type + `parseBED` / `parseGFF3` / `parseBedGraph` |
| `services/bio/handleBioMessage.ts` (create) | `handleBioMessage(msg): BioWorkerResponse` (routing + annotation-format dispatch + error wrap) |
| `services/search/runSearch.ts` (create) | `runSearch(request): SearchWorkerResponse` + `collectSeededFuzzyHits` |
| `src/workers/bioWorker.ts` (modify) | thin: `self.onmessage = e => self.postMessage(handleBioMessage(e.data))` |
| `src/workers/searchWorker.ts` (modify) | thin: `self.onmessage = e => self.postMessage(runSearch(e.data))` |
| `services/**/__tests__/*.test.ts` (create) | unit tests for each module |
| `vite.config.ts` (modify) | re-baseline ratchet thresholds |

---

## Task 1: `detectMoleculeType` → `services/moleculeType.ts`

**Files:**
- Create: `services/moleculeType.ts`
- Test: `services/__tests__/moleculeType.test.ts`
- (later) consumed by `services/parsers/fasta.ts`

**Interfaces:**
- Produces: `export const detectMoleculeType = (seq: string): 'dna' | 'rna' | 'protein'`

- [ ] **Step 1: Create `services/moleculeType.ts`**

Prepend the AGPL header (identical to `services/bioUtils.ts` lines 1-18), then move the `detectMoleculeType` body **verbatim** from `src/workers/bioWorker.ts:59-65`, adding `export`:

```typescript
/**
 * Detects whether a sequence is a protein (amino-acid) sequence.
 *
 * Amino-acid sequences may contain D, E, F, H, I, K, L, M, P, Q, R, S, V, W, Y
 * which do not appear in a strict DNA/RNA alphabet. If any protein-only
 * character is present the sequence is classified as protein; else RNA if it
 * contains U; otherwise DNA. Sequences composed only of nucleotide-overlapping
 * characters (A/C/G/T/N) are classified DNA even if they are protein.
 */
export const detectMoleculeType = (seq: string): 'dna' | 'rna' | 'protein' => {
  const upper = seq.toUpperCase();
  if (/[DEFHIKLMPQRSVWY]/.test(upper)) return 'protein';
  if (/U/.test(upper)) return 'rna';
  return 'dna';
};
```

- [ ] **Step 2: Write the test**

Create `services/__tests__/moleculeType.test.ts` (AGPL header + the below):

```typescript
import { describe, it, expect } from 'vitest';
import { detectMoleculeType } from '../moleculeType';

describe('detectMoleculeType', () => {
  it('classifies a pure ACGT sequence as dna', () => {
    expect(detectMoleculeType('ACGTACGT')).toBe('dna');
  });
  it('classifies a sequence with U (and no protein chars) as rna', () => {
    expect(detectMoleculeType('ACGU')).toBe('rna');
  });
  it('classifies a sequence with a protein-only char as protein', () => {
    expect(detectMoleculeType('ACGTM')).toBe('protein'); // M is protein-only
  });
  it('prioritises protein over rna when both signals present', () => {
    expect(detectMoleculeType('ACGUM')).toBe('protein');
  });
  it('is case-insensitive', () => {
    expect(detectMoleculeType('mkv')).toBe('protein');
  });
  it('treats an empty sequence as dna', () => {
    expect(detectMoleculeType('')).toBe('dna');
  });
  it('treats ambiguous nucleotide codes (N) as dna', () => {
    expect(detectMoleculeType('ACGTN')).toBe('dna');
  });
});
```

- [ ] **Step 3: Run tests** — `rtk proxy npx vitest run services/__tests__/moleculeType.test.ts` → PASS.
- [ ] **Step 4: Typecheck** — `npm run typecheck > /dev/null 2>&1; echo $?` → `0`. (bioWorker still defines its own copy until Task 4; that's fine — this task only adds the new module.)
- [ ] **Step 5: Commit**

```bash
git add services/moleculeType.ts services/__tests__/moleculeType.test.ts
git commit -m "refactor(bio): extract detectMoleculeType to services/moleculeType"
```

---

## Task 2: `parseFasta` → `services/parsers/fasta.ts`

**Files:**
- Create: `services/parsers/fasta.ts`
- Test: `services/parsers/__tests__/fasta.test.ts`

**Interfaces:**
- Consumes: `detectMoleculeType` from `services/moleculeType.ts`
- Produces: `export interface FastaRecord { id: string; name: string; sequence: string; features: BioFeature[]; moleculeType: 'dna' | 'rna' | 'protein' }` and `export const parseFasta = (content: string): FastaRecord[]`

- [ ] **Step 1: Create `services/parsers/fasta.ts`**

AGPL header, then move `FastaRecord` (from `bioWorker.ts:37-44`) and `parseFasta` (from `bioWorker.ts:70-93`) verbatim, adding `export` and importing `detectMoleculeType`. `BioFeature` comes from the domain types:

```typescript
import type { BioFeature } from '../../src/domain/bio/types';
import { detectMoleculeType } from '../moleculeType';

/** Minimal FASTA record (subset of SeqRecord). */
export interface FastaRecord {
  id: string;
  name: string;
  sequence: string;
  features: BioFeature[];
  moleculeType: 'dna' | 'rna' | 'protein';
}

/** Parses FASTA content into simple record objects. */
export const parseFasta = (content: string): FastaRecord[] => {
  const lines = content.split('\n');
  const results: FastaRecord[] = [];
  let currentId = '';
  let currentSeq = '';

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) {
      if (currentId) {
        results.push({ id: currentId, name: currentId, sequence: currentSeq, features: [], moleculeType: detectMoleculeType(currentSeq) });
      }
      currentId = trimmed.substring(1).split(/\s+/)[0];
      currentSeq = '';
    } else if (trimmed) {
      currentSeq += trimmed;
    }
  });

  if (currentId) {
    results.push({ id: currentId, name: currentId, sequence: currentSeq, features: [], moleculeType: detectMoleculeType(currentSeq) });
  }
  return results;
};
```

- [ ] **Step 2: Write the test**

Create `services/parsers/__tests__/fasta.test.ts` (AGPL header + below):

```typescript
import { describe, it, expect } from 'vitest';
import { parseFasta } from '../fasta';

describe('parseFasta', () => {
  it('parses a single record and takes the id from the first whitespace token', () => {
    expect(parseFasta('>seq1 a description\nACGT')).toEqual([
      { id: 'seq1', name: 'seq1', sequence: 'ACGT', features: [], moleculeType: 'dna' },
    ]);
  });

  it('concatenates wrapped sequence lines', () => {
    const [rec] = parseFasta('>s\nAC\nGT\nAA');
    expect(rec.sequence).toBe('ACGTAA');
  });

  it('parses multiple records and infers molecule type per record', () => {
    const recs = parseFasta('>a\nACGT\n>b\nMKV');
    expect(recs.map(r => r.id)).toEqual(['a', 'b']);
    expect(recs[1].moleculeType).toBe('protein');
  });

  it('flushes the trailing record after the last header', () => {
    expect(parseFasta('>only\nACGT')).toHaveLength(1);
  });

  it('returns an empty array for empty or header-less content', () => {
    expect(parseFasta('')).toEqual([]);
    expect(parseFasta('ACGT\nACGT')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests** — `rtk proxy npx vitest run services/parsers/__tests__/fasta.test.ts` → PASS.
- [ ] **Step 4: Typecheck** — `npm run typecheck > /dev/null 2>&1; echo $?` → `0`.
- [ ] **Step 5: Commit**

```bash
git add services/parsers/fasta.ts services/parsers/__tests__/fasta.test.ts
git commit -m "refactor(bio): extract parseFasta to services/parsers/fasta"
```

---

## Task 3: BED/GFF3/BedGraph parsers → `services/parsers/annotations.ts`

**Files:**
- Create: `services/parsers/annotations.ts`
- Test: `services/parsers/__tests__/annotations.test.ts`

**Interfaces:**
- Produces: `export interface AnnotationTrack extends QuantitativeTrack { type: string }`; `export const parseBED = (content: string, filename: string): Record<string, AnnotationTrack[]>`; `export const parseGFF3 = (content: string): Record<string, BioFeature[]>`; `export const parseBedGraph = (content: string, filename: string): Record<string, AnnotationTrack[]>`

- [ ] **Step 1: Create `services/parsers/annotations.ts`**

AGPL header, then move `AnnotationTrack` (from `bioWorker.ts:32-35`), `parseBED` (`98-134`), `parseGFF3` (`139-194`), `parseBedGraph` (`199-234`) **verbatim**, adding `export` and the type imports:

```typescript
import type { BioFeature, FeatureSegment, QuantitativeTrack } from '../../src/domain/bio/types';

/** Annotation track as returned by BED/BedGraph/GFF3 parsers (extends QuantitativeTrack). */
export interface AnnotationTrack extends QuantitativeTrack {
  type: string;
}
```
Then paste `parseBED`, `parseGFF3`, `parseBedGraph` exactly as they appear in `src/workers/bioWorker.ts` (lines 98-234), each prefixed with `export `. `FeatureSegment` is used inside `parseGFF3`.

- [ ] **Step 2: Write the test**

Create `services/parsers/__tests__/annotations.test.ts` (AGPL header + below):

```typescript
import { describe, it, expect } from 'vitest';
import { parseBED, parseGFF3, parseBedGraph } from '../annotations';

describe('parseBED', () => {
  it('parses a track grouped by chromosome with score from column 5', () => {
    const out = parseBED('chr1\t10\t20\tnameCol\t7', 'f.bed');
    expect(out.chr1).toHaveLength(1);
    expect(out.chr1[0]).toMatchObject({ type: 'track', kind: 'interval', id: 'f.bed_chr1', name: 'f.bed' });
    expect(out.chr1[0].data).toEqual([{ start: 10, end: 20, value: 7 }]);
  });
  it('defaults a missing/NaN score to 0', () => {
    expect(parseBED('chr1\t10\t20', 'f.bed').chr1[0].data[0].value).toBe(0);
  });
  it('skips lines with fewer than 3 columns and NaN coordinates', () => {
    expect(parseBED('chr1\t10', 'f.bed')).toEqual({});
    expect(parseBED('chr1\tx\t20', 'f.bed')).toEqual({});
  });
  it('ignores header/#/track/browser lines and reuses one track per chrom', () => {
    const out = parseBED('track name=x\nchr1\t0\t5\nchr1\t8\t9', 'f.bed');
    expect(out.chr1).toHaveLength(1);
    expect(out.chr1[0].data).toHaveLength(2);
  });
});

describe('parseGFF3', () => {
  it('converts the 1-based start to 0-based and maps strand', () => {
    const out = parseGFF3('chr1\tsrc\tgene\t10\t20\t.\t-\t0\tID=g1');
    const f = out.chr1[0];
    expect(f.start).toBe(9); // 10 - 1
    expect(f.end).toBe(20);
    expect(f.strand).toBe(-1);
    expect(f.segments).toEqual([{ start: 9, end: 20 }]);
  });
  it('prefers Name over ID for the feature name and omits a "." score', () => {
    const f = parseGFF3('c\ts\tgene\t5\t9\t.\t+\t0\tID=g1;Name=myGene').c[0];
    expect(f.name).toBe('myGene');
    expect(f.metadata).not.toHaveProperty('score');
    expect(f.metadata).toMatchObject({ source: 's', phase: '0', ID: 'g1', Name: 'myGene' });
  });
  it('falls back to `${type}_${start+1}` when no ID/Name', () => {
    expect(parseGFF3('c\ts\tCDS\t5\t9\t.\t+\t0\tfoo=bar').c[0].name).toBe('CDS_5');
  });
  it('keeps a non-"." score in metadata and URL-decodes attribute values', () => {
    const f = parseGFF3('c\ts\tgene\t1\t9\t3.2\t+\t0\tID=a;note=a%20b').c[0];
    expect(f.metadata.score).toBe('3.2');
    expect(f.metadata.note).toBe('a b');
  });
  it('skips rows with fewer than 9 tab columns', () => {
    expect(parseGFF3('c\ts\tgene\t1\t9')).toEqual({});
  });
});

describe('parseBedGraph', () => {
  it('parses a line track with a numeric value', () => {
    const out = parseBedGraph('chr1\t10\t20\t3.5', 'f.bedgraph');
    expect(out.chr1[0]).toMatchObject({ kind: 'line', name: 'f.bedgraph' });
    expect(out.chr1[0].data).toEqual([{ start: 10, end: 20, value: 3.5 }]);
  });
  it('skips a row whose value is NaN (unlike BED, which defaults score to 0)', () => {
    expect(parseBedGraph('chr1\t10\t20\tx', 'f.bedgraph')).toEqual({});
  });
  it('skips lines with fewer than 4 columns', () => {
    expect(parseBedGraph('chr1\t10\t20', 'f.bedgraph')).toEqual({});
  });
});
```

- [ ] **Step 3: Run tests** — `rtk proxy npx vitest run services/parsers/__tests__/annotations.test.ts` → PASS. If a computed value differs, recompute from source (do not weaken).
- [ ] **Step 4: Typecheck** — `echo $?` → `0`.
- [ ] **Step 5: Commit**

```bash
git add services/parsers/annotations.ts services/parsers/__tests__/annotations.test.ts
git commit -m "refactor(bio): extract BED/GFF3/BedGraph parsers to services/parsers/annotations"
```

---

## Task 4: `handleBioMessage` → `services/bio/handleBioMessage.ts` + thin `bioWorker.ts`

**Files:**
- Create: `services/bio/handleBioMessage.ts`
- Test: `services/bio/__tests__/handleBioMessage.test.ts`
- Modify: `src/workers/bioWorker.ts` (replace the whole body)

**Interfaces:**
- Consumes: `parseFasta` (Task 2), `parseBED`/`parseGFF3`/`parseBedGraph` + `AnnotationTrack` (Task 3), `processTransposition`/`calculateConsensus` (`src/domain/bio/index`), `parseGenBank` (`services/genbank/index`), protocol types.
- Produces: `export function handleBioMessage(msg: BioWorkerRequest): BioWorkerResponse`

- [ ] **Step 1: Create `services/bio/handleBioMessage.ts`**

AGPL header, then a pure function that returns the response the worker used to post. This is the routing body from `bioWorker.ts:236-291` refactored from `self.postMessage(x)` side-effects into `return x`:

```typescript
import { processTransposition, calculateConsensus } from '../../src/domain/bio/index';
import { parseGenBank } from '../genbank/index';
import type { BioFeature } from '../../src/domain/bio/types';
import type { BioWorkerRequest, BioWorkerResponse } from '../../src/workers/protocol';
import { parseFasta } from '../parsers/fasta';
import { parseBED, parseGFF3, parseBedGraph, type AnnotationTrack } from '../parsers/annotations';

/** Pure router for bio-worker messages: maps a request to its response. */
export function handleBioMessage(msg: BioWorkerRequest): BioWorkerResponse {
  if (msg.type === 'PROCESS_RECORDS') {
    try {
      const transposed = processTransposition(msg.records);
      const consensus = calculateConsensus(transposed);
      return { type: 'SUCCESS', records: transposed, consensus };
    } catch (error) {
      return { type: 'ERROR', error: (error as Error).message };
    }
  } else if (msg.type === 'PARSE_GENBANK') {
    try {
      return { type: 'PARSE_SUCCESS', records: parseGenBank(msg.content) };
    } catch (error) {
      return { type: 'ERROR', error: (error as Error).message };
    }
  } else if (msg.type === 'PARSE_FASTA') {
    try {
      return { type: 'FASTA_SUCCESS', alignedData: parseFasta(msg.content), asAlignment: msg.asAlignment };
    } catch (error) {
      return { type: 'ERROR', error: (error as Error).message };
    }
  } else {
    // PARSE_ANNOTATIONS
    try {
      const ext = msg.filename.split('.').pop()?.toLowerCase();
      let parsed: Record<string, AnnotationTrack[] | BioFeature[]>;
      if (ext === 'bed') parsed = parseBED(msg.content, msg.filename);
      else if (ext === 'gff' || ext === 'gff3') parsed = parseGFF3(msg.content);
      else if (ext === 'bedgraph') parsed = parseBedGraph(msg.content, msg.filename);
      else if (msg.content.includes('\t') && msg.content.split('\n')[0].split('\t').length === 9) {
        parsed = parseGFF3(msg.content);
      } else {
        parsed = parseBED(msg.content, msg.filename);
      }
      return { type: 'ANNOTATIONS_SUCCESS', annotations: parsed };
    } catch (error) {
      return { type: 'ERROR', error: (error as Error).message };
    }
  }
}
```

Note: the original used an `if/else if` chain ending on `PARSE_ANNOTATIONS`; the discriminated union makes the trailing `else` exhaustive. Verify `tsc` is happy with the narrowing (it should be, since the four `type` values are the full union).

- [ ] **Step 2: Replace `src/workers/bioWorker.ts` body**

Replace the entire file (keep the AGPL header lines 1-18 and the `// bioWorker.ts` comment) with the thin dispatcher:

```typescript
// bioWorker.ts
// Thin worker shell — all logic lives in services/bio/handleBioMessage.ts.
import { handleBioMessage } from '../../services/bio/handleBioMessage';
import type { BioWorkerRequest } from './protocol';

self.onmessage = (e: MessageEvent<BioWorkerRequest>) => {
  self.postMessage(handleBioMessage(e.data));
};
```

- [ ] **Step 3: Write the test**

Create `services/bio/__tests__/handleBioMessage.test.ts` (AGPL header + below):

```typescript
import { describe, it, expect } from 'vitest';
import { handleBioMessage } from '../handleBioMessage';

describe('handleBioMessage — PARSE_FASTA', () => {
  it('returns FASTA_SUCCESS with parsed records and echoes asAlignment', () => {
    const res = handleBioMessage({ type: 'PARSE_FASTA', content: '>a\nACGT', asAlignment: true });
    expect(res).toMatchObject({ type: 'FASTA_SUCCESS', asAlignment: true });
    if (res.type === 'FASTA_SUCCESS') {
      expect(res.alignedData).toHaveLength(1);
      expect(res.alignedData[0].id).toBe('a');
    }
  });
});

describe('handleBioMessage — PARSE_ANNOTATIONS format dispatch', () => {
  it('routes .bed to the BED parser (interval track)', () => {
    const res = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'x.bed', content: 'chr1\t0\t5\tn\t2' });
    expect(res.type).toBe('ANNOTATIONS_SUCCESS');
    if (res.type === 'ANNOTATIONS_SUCCESS') {
      expect((res.annotations.chr1[0] as { kind: string }).kind).toBe('interval');
    }
  });
  it('routes .gff3 to the GFF3 parser (0-based start)', () => {
    const res = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'x.gff3', content: 'chr1\ts\tgene\t10\t20\t.\t+\t0\tID=g' });
    expect(res.type).toBe('ANNOTATIONS_SUCCESS');
    if (res.type === 'ANNOTATIONS_SUCCESS') {
      expect((res.annotations.chr1[0] as { start: number }).start).toBe(9);
    }
  });
  it('routes .bedgraph to the BedGraph parser (line track)', () => {
    const res = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'x.bedgraph', content: 'chr1\t0\t5\t1.5' });
    if (res.type === 'ANNOTATIONS_SUCCESS') {
      expect((res.annotations.chr1[0] as { kind: string }).kind).toBe('line');
    } else { throw new Error('expected ANNOTATIONS_SUCCESS'); }
  });
  it('falls back to GFF3 for an extensionless 9-tab-column first line', () => {
    const res = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'noext', content: 'chr1\ts\tgene\t10\t20\t.\t+\t0\tID=g' });
    if (res.type === 'ANNOTATIONS_SUCCESS') {
      expect((res.annotations.chr1[0] as { start: number }).start).toBe(9); // GFF3 0-based
    } else { throw new Error('expected ANNOTATIONS_SUCCESS'); }
  });
  it('falls back to BED for extensionless non-9-column content', () => {
    const res = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'noext', content: 'chr1\t0\t5\tn\t2' });
    if (res.type === 'ANNOTATIONS_SUCCESS') {
      expect((res.annotations.chr1[0] as { kind: string }).kind).toBe('interval'); // BED
    } else { throw new Error('expected ANNOTATIONS_SUCCESS'); }
  });
});
```

(PROCESS_RECORDS and PARSE_GENBANK delegate to already-tested functions; if you can construct a minimal valid input quickly, add a `type === 'SUCCESS'` / `'PARSE_SUCCESS'` smoke test, but do not spend long — the routing + format dispatch above is the value.)

- [ ] **Step 4: Run tests + typecheck + build**

Run: `rtk proxy npx vitest run services/bio/__tests__/handleBioMessage.test.ts` → PASS.
Run: `npm run typecheck > /dev/null 2>&1; echo "tc=$?"` → `0`.
Run: `npm run build > /dev/null 2>&1; echo "build=$?"` → `0` (proves the thin worker still wires up under Vite).

- [ ] **Step 5: Commit**

```bash
git add services/bio/handleBioMessage.ts services/bio/__tests__/handleBioMessage.test.ts src/workers/bioWorker.ts
git commit -m "refactor(bio): extract bio worker routing to handleBioMessage; thin the worker"
```

---

## Task 5: `runSearch` → `services/search/runSearch.ts` + thin `searchWorker.ts`

**Files:**
- Create: `services/search/runSearch.ts`
- Test: `services/search/__tests__/runSearch.test.ts`
- Modify: `src/workers/searchWorker.ts` (replace the whole body)

**Interfaces:**
- Consumes: `SearchResult`, `degenerateToRegex`, `reverseComplement`, `getNonGapSegments`, `removeGapsWithMap`, `mapUngappedRangeToAligned`, `smithWaterman` from `services/searchLogic`; protocol types.
- Produces: `export function runSearch(request: SearchWorkerRequest): SearchWorkerResponse`; `export function collectSeededFuzzyHits(queryUpper, seq, recordId, strand, minScore): SearchResult[]`

- [ ] **Step 1: Create `services/search/runSearch.ts`**

AGPL header, then move `collectSeededFuzzyHits` (from `searchWorker.ts:31-109`) **verbatim** with `export`, and convert the `onmessage` body (`111-217`) into `runSearch(request): SearchWorkerResponse` — replacing each `self.postMessage(x); return;` / `self.postMessage(x)` with `return x`, and reading fields from `request` instead of `e.data`:

```typescript
import {
  SearchResult,
  degenerateToRegex,
  reverseComplement,
  getNonGapSegments,
  removeGapsWithMap,
  mapUngappedRangeToAligned,
  smithWaterman,
} from '../searchLogic';
import type { SearchWorkerRequest, SearchWorkerResponse } from '../../src/workers/protocol';

export function collectSeededFuzzyHits(
  queryUpper: string,
  seq: string,
  recordId: string,
  strand: 1 | -1,
  minScore: number,
): SearchResult[] {
  // ... paste lines 38-108 of src/workers/searchWorker.ts verbatim ...
}

export function runSearch(request: SearchWorkerRequest): SearchWorkerResponse {
  const { requestId, searchQuery, records, mode, options, moleculeType } = request;
  const { minScore = 5, strand = 'both', maxResults = 100 } = options;
  const isProtein = moleculeType === 'protein';

  if (!searchQuery || searchQuery.length < 1) {
    return { requestId, results: [] };
  }

  try {
    let results: SearchResult[] = [];
    const queryUpper = searchQuery.toUpperCase();
    // ... paste the records.forEach(...) body from lines 126-196 verbatim ...
    if (mode === 'fuzzy') {
      results.sort((a, b) => (b.score || 0) - (a.score || 0) || a.start - b.start);
    } else {
      results.sort((a, b) => a.start - b.start || a.recordId.localeCompare(b.recordId));
    }
    if (results.length > maxResults) {
      results = results.slice(0, maxResults);
    }
    return { requestId, results };
  } catch (error) {
    return { requestId, error: String(error) };
  }
}
```
Copy the `collectSeededFuzzyHits` body and the `records.forEach` body **character-for-character** from `src/workers/searchWorker.ts`; only the surrounding wrapper changes (params + `return` instead of `postMessage`). Drop the original's `console.error` in the catch (it referenced the worker console; returning the error response is the behavior that matters — the worker shell can log if desired, but keep it out of the pure function).

- [ ] **Step 2: Replace `src/workers/searchWorker.ts` body**

Replace the entire file (keep AGPL header) with:

```typescript
import { runSearch } from '../../services/search/runSearch';
import type { SearchWorkerRequest } from './protocol';

self.onmessage = (e: MessageEvent<SearchWorkerRequest>) => {
  self.postMessage(runSearch(e.data));
};
```

- [ ] **Step 3: Write the test**

Create `services/search/__tests__/runSearch.test.ts` (AGPL header + below):

```typescript
import { describe, it, expect } from 'vitest';
import { runSearch, collectSeededFuzzyHits } from '../runSearch';
import type { SearchWorkerRequest } from '../../../src/workers/protocol';

function req(overrides: Partial<SearchWorkerRequest> & Pick<SearchWorkerRequest, 'searchQuery' | 'records' | 'mode'>): SearchWorkerRequest {
  return {
    requestId: 1,
    options: { minScore: 5, strand: 'both', maxResults: 100 },
    ...overrides,
  } as SearchWorkerRequest;
}

describe('runSearch — guards & echo', () => {
  it('short-circuits an empty query to results:[] and echoes requestId', () => {
    const res = runSearch(req({ requestId: 7, searchQuery: '', records: [{ id: 'r1', sequence: 'ACGT' }], mode: 'exact' }));
    expect(res).toEqual({ requestId: 7, results: [] });
  });
});

describe('runSearch — exact mode', () => {
  it('finds a forward match with rebased coordinates', () => {
    const res = runSearch(req({
      searchQuery: 'ACG', records: [{ id: 'r1', sequence: 'TTACGTT' }],
      mode: 'exact', options: { minScore: 5, strand: 'fwd', maxResults: 100 },
    }));
    if ('error' in res) throw new Error(res.error);
    expect(res.results).toEqual([
      { start: 2, end: 5, sequence: 'ACG', recordId: 'r1', strand: 1, segments: [{ start: 2, end: 5 }] },
    ]);
  });

  it('finds a reverse-strand match remapped onto the forward coordinates', () => {
    const res = runSearch(req({
      searchQuery: 'ACG', records: [{ id: 'r1', sequence: 'TTACGTT' }],
      mode: 'exact', options: { minScore: 5, strand: 'rev', maxResults: 100 },
    }));
    if ('error' in res) throw new Error(res.error);
    expect(res.results).toHaveLength(1);
    expect(res.results[0]).toMatchObject({ strand: -1, start: 3, end: 6 });
  });

  it('skips the reverse strand for a protein molecule type', () => {
    const res = runSearch(req({
      searchQuery: 'ACG', records: [{ id: 'r1', sequence: 'TTACGTT' }],
      mode: 'exact', moleculeType: 'protein',
      options: { minScore: 5, strand: 'both', maxResults: 100 },
    }));
    if ('error' in res) throw new Error(res.error);
    expect(res.results.every(r => r.strand === 1)).toBe(true);
  });

  it('sorts by start then recordId and applies maxResults', () => {
    const res = runSearch(req({
      searchQuery: 'A', records: [{ id: 'r1', sequence: 'AAA' }],
      mode: 'exact', options: { minScore: 5, strand: 'fwd', maxResults: 2 },
    }));
    if ('error' in res) throw new Error(res.error);
    expect(res.results).toHaveLength(2);
    expect(res.results[0].start).toBeLessThanOrEqual(res.results[1].start);
  });
});

describe('runSearch — fuzzy mode', () => {
  it('returns score-bearing hits sorted by score descending', () => {
    const res = runSearch(req({
      searchQuery: 'ACGTACGT',
      records: [{ id: 'r1', sequence: 'TTTACGTACGTTTT' }],
      mode: 'fuzzy', options: { minScore: 5, strand: 'fwd', maxResults: 100 },
    }));
    if ('error' in res) throw new Error(res.error);
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0].score).toBeGreaterThanOrEqual(res.results[res.results.length - 1].score ?? 0);
    expect(res.results[0].recordId).toBe('r1');
  });
});

describe('collectSeededFuzzyHits', () => {
  it('returns [] for an all-gap sequence', () => {
    expect(collectSeededFuzzyHits('ACGT', '----', 'r1', 1, 5)).toEqual([]);
  });
  it('finds the query region in an ungapped sequence with the given recordId/strand', () => {
    const hits = collectSeededFuzzyHits('ACGTACGT', 'TTTACGTACGTTTT', 'r1', 1, 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(h => h.recordId === 'r1' && h.strand === 1)).toBe(true);
  });
});
```

Note (determinism): fuzzy inputs are tiny so the `Date.now()` time budget never trips. If a fuzzy `score` assertion is brittle, keep it a `>=` property bound — do not pin an exact fuzzy score.

- [ ] **Step 4: Run tests + typecheck + build**

Run: `rtk proxy npx vitest run services/search/__tests__/runSearch.test.ts` → PASS. Recompute any coordinate that fails (the exact-mode values are arithmetic and should hold; a failure there is a real regression — report it).
Run: `npm run typecheck > /dev/null 2>&1; echo "tc=$?"` → `0`.
Run: `npm run build > /dev/null 2>&1; echo "build=$?"` → `0`.

- [ ] **Step 5: Commit**

```bash
git add services/search/runSearch.ts services/search/__tests__/runSearch.test.ts src/workers/searchWorker.ts
git commit -m "refactor(search): extract search worker body to services/search/runSearch; thin the worker"
```

---

## Task 6: Re-baseline coverage gate, full CI mirror, open PR

**Files:**
- Modify: `vite.config.ts` (thresholds only)

- [ ] **Step 1: Measure new achieved coverage on the scoped set**

```bash
rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "gate=$?"
node -e '
const s=require("./coverage/coverage-summary.json").total;
const pick=k=>Math.max(0, Math.floor(s[k].pct) - 4);
console.log("achieved:", JSON.stringify({lines:s.lines.pct,branches:s.branches.pct,functions:s.functions.pct,statements:s.statements.pct}));
console.log("suggested thresholds:", JSON.stringify({lines:pick("lines"),branches:pick("branches"),functions:pick("functions"),statements:pick("statements")}));
'
```
If `gate` is non-zero, the current thresholds (94/83/93/92) already fail because a new file lowered an aggregate — inspect which metric and continue; the re-baseline fixes it. New well-tested modules should *raise* line/function coverage; `runSearch`/`collectSeededFuzzyHits` have hard-to-hit branches (candidate-window 256 cap, time-budget) that may pull branches down a little.

- [ ] **Step 2: Update thresholds in `vite.config.ts`**

Set the four `thresholds` values to the printed `suggested thresholds` (achieved floored −4). Only *raise* from 94/83/93/92 where achieved supports it; if a metric dropped (e.g. branches), set it to `floor(achieved) − 4` so the gate passes with a buffer, and note it. Then:

```bash
rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "gate after rebaseline=$?"
```
Expect `0`.

- [ ] **Step 3: Full CI mirror**

```bash
npm run typecheck > /dev/null 2>&1; echo "typecheck=$?"
npm run lint > /dev/null 2>&1; echo "lint=$?"
rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "coverage=$?"
npm run build > /dev/null 2>&1; echo "build=$?"
```
All four must be `0` (lint `0` = warnings only).

- [ ] **Step 4: Commit + push + PR**

```bash
git add vite.config.ts
git commit -m "ci(coverage): re-baseline ratchet thresholds after worker extraction"
git push -u origin test-phase2-extraction
gh pr create --base main --title "refactor+test: Phase 2A PR1 — extract & test worker parsing/search logic" \
  --body "Behavior-preserving extraction of the bio/search worker pure logic into services/** (parsers, moleculeType, handleBioMessage, runSearch), now unit-tested in node. Workers become thin dispatchers. No new deps. See docs/superpowers/specs/2026-07-01-test-phase2a-extraction-design.md."
```

---

## Self-review

- **Spec coverage:** PR1 items from the spec — parsers (`fasta`, `annotations`), `moleculeType`, `runSearch` + `collectSeededFuzzyHits`, `handleBioMessage`, thin workers, gate re-baseline — each maps to a task (1-6). The exact-helper factor-out and the hook/inline engine are correctly deferred to PR2 (not in this plan).
- **Behavior preservation:** every extraction is a verbatim move; Tasks 4 & 5 additionally run `npm run build` to prove the thin workers still wire under Vite.
- **Placeholder scan:** the two "paste verbatim lines N-M" instructions in Tasks 3 & 5 reference exact existing source ranges rather than re-pasting long bodies — this is a precise move instruction, not a TODO. All new code (tests, thin workers, `handleBioMessage`, `runSearch` wrapper) is shown in full.
- **Type consistency:** `handleBioMessage(msg: BioWorkerRequest): BioWorkerResponse` and `runSearch(request: SearchWorkerRequest): SearchWorkerResponse` match the protocol unions; `AnnotationTrack`/`FastaRecord` exported from the parser modules and imported by `handleBioMessage`; `collectSeededFuzzyHits` signature identical to the worker original.
- **Determinism:** fuzzy tests use tiny inputs (time budget never trips) and property bounds for scores.
