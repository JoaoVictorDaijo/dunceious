# Test Hardening — Phase 1 Design

**Date:** 2026-07-01
**Branch:** `test-hardening`
**Status:** Approved (pending spec review)

## Context

The repo just gained a CI pipeline (`.github/workflows/ci.yml`) that runs
type-check → lint → test → build, but there is **no coverage gate** and no
coverage provider installed. Measured baseline (v8, `all: true`, source only):

```
TOTAL: statements 16.26%  branches 12.1%  functions 11.84%  lines 16.25% (417/2566)
```

Coverage splits cleanly into three buckets:

- **Well covered (~100%):** genbank parsers (header/feature/location/qualifier
  minus edge branches / recordSplitter / toSeqRecord), `src/domain/bio/*`
  (coordinate/consensus/intervals), `idHelpers`, worker `protocol`.
- **Partially covered pure logic (Phase 1 targets):** `services/bioUtils.ts`
  (64% ln / 40% br), `services/searchLogic.ts` (64% ln / 58% br),
  `src/app/recordRemoval.ts` (55% ln / 29% br), `services/genbank/qualifierParser.ts`
  (79% ln / 82% br).
- **Zero coverage (Phase 2 — deferred):** `components/GenomeViewer.tsx` (935 lines),
  all `src/app/hooks/*`, `src/workers/bioWorker.ts` and `src/workers/searchWorker.ts`
  (note: `src/workers/protocol.ts` is already ~100% covered), `src/app/App.tsx`, and
  the modal/panel components. These need React test infra (jsdom/happy-dom +
  `@testing-library`), a decision deferred to the Phase 2 checkpoint.

This is the first of two phases. **Phase 1 = improve existing partial-coverage
tests** (raise coverage + fix weak tests). Phase 2 = protect the zero-coverage
areas. The goal is a regression safety net before a future cycle of larger
feature work.

## Goals

1. Raise the four partially-covered **pure-logic** files to high coverage.
2. Audit the existing tests that touch those files and fix weak assertions.
3. Wire a **ratchet coverage gate** into CI, scoped to the hardened logic, with
   thresholds set a safety margin below achieved so normal jitter does not
   break the build.

## Non-goals (deferred to Phase 2)

- Any React component, hook, or worker-wiring tests.
- Adding jsdom/happy-dom or `@testing-library`.
- Raising coverage of the zero-coverage bucket.
- No production code changes except where a test surfaces a genuine bug (which
  will be raised, not silently patched).

## Target files, concrete gaps, and per-file aims

Coverage aims below are what the **tests** target; the **enforced CI thresholds**
are lower (see CI Gate).

### `src/app/recordRemoval.ts` — aim 100%
- `sanitizeSearchStateAfterRecordRemoval` (lines 26–37) is **entirely untested**.
  Cover all branches: current index invalid (`<0` or `>= length`); current index
  on the removed record; current index valid on a kept record; and the
  `selectedSearchIndices` filter (indices pointing at the removed record dropped,
  others kept).

### `services/genbank/qualifierParser.ts` — aim 100%
- Continuation line that is indented-21 but does **not** start with `/` (49–50 skip).
- Malformed `/key` line where the `/^\/(\w+)(?:=(.*))?$/` regex fails to match
  (55–56 skip).

### `services/searchLogic.ts` — aim ~95%
- `removeGapsWithMap` — **fully untested**: gapped and gap-free input, all-gap
  input, verify `ungapped` string and index `map` alignment.
- `mapUngappedRangeToAligned` — **fully untested**: empty map (returns `{0,0}`),
  in-range, out-of-range `start`/`end` clamping, single-element map.
- `traceback` gap-state branches (Iq/It, lines ~354–372): alignments that require
  insertions/deletions so the traceback walks gap states.
- `ungappedFuzzyScan` large-target fallback (247–307): drive via `smithWaterman`
  with a target large enough to cross the `MAX_SW_CELLS` (600k) threshold; assert
  deterministic hits, the `minScore` filter, and overlap de-dup. Keep inputs
  bounded so the `Date.now()` time budget is not the thing under test.

### `services/bioUtils.ts` — aim ~98%
- `getNucleotideColor` (123–129) — untested: A/T/C/G/gap/unknown.
- `getAminoAcidColor` (148–190) — most branches untested: one case per colour
  group + the `default`/unknown.
- `getFeatureColor` (192–211) — custom-colour override, a known type, the default.
- `exportToGff` (224–234) — untested export path: `+`/`-` strand, attribute
  formatting, whitespace→`_` in names.
- `exportToGenBank` (236–307) — cover the branches: protein `LOCUS` line,
  `DUNCEIOUS_MARKER` de-duplication on re-export, `_`-prefixed and empty metadata
  skipped, source/organism fallback to `.`.
- `getOriginalPos` (421–430) — untested: gap-free, leading/internal gaps,
  `alignedPos` past end (clamped by `limit`).
- `downloadBlob` (309–319) — the one DOM-touching export. Cover with
  `vi.stubGlobal` on `document`, `URL.createObjectURL`/`revokeObjectURL`, and
  `Blob`; assert the anchor is created, `download`/`href` set, clicked, and the
  object URL revoked. No jsdom needed.

Also audit `services/__tests__/translationHelpers.test.ts` and
`services/__tests__/selectionExport.test.ts` (which indirectly cover bioUtils):
strengthen weak assertions, add missing edge cases (e.g. `clipInterval` no-overlap
and zero-length results, minus-strand `extractCodingSequence`, `detectEarlyStop`
boundary at the last codon).

## CI Coverage Gate (Approach A — scoped ratchet)

- Add `@vitest/coverage-v8` to `devDependencies` (already installed on branch).
- Add coverage config to the vitest test config: `provider: 'v8'`, `all: true`,
  `include` scoped to hardened pure-logic only —
  `services/**`, `src/app/recordRemoval.ts`, `src/domain/**` — with test/bench/perf
  excluded. (Zero-coverage components/hooks are **out of the gate's denominator**
  until Phase 2 decides on infra, so the bar stays meaningful now.)
- `thresholds`: set **~3–5 points below** the Phase-1-achieved scoped-aggregate
  (measured after tests land), e.g. lines ≈ 88–90, branches ≈ 80–85, functions
  ≈ 88–90. **No 100% thresholds anywhere** — this is deliberate, to absorb
  hard-to-hit defensive branches and v8 line-counting drift between local and CI
  Node. Ratchet upward in later phases; never downward.
- Add an `npm run test:coverage` script.
- `ci.yml`: run coverage in the existing `Test` gate (or a dedicated
  `Coverage` gate under the same `if: !cancelled()` pattern) so a threshold
  breach fails CI.

### Approaches considered
- **A (chosen):** thresholds scoped to hardened logic. Meaningful bar now,
  expands in Phase 2.
- **B:** global thresholds including 0%-covered components → bar starts ~16%,
  weak signal. Rejected.
- **C:** strict per-file 100% thresholds. Strongest but brittle/noisy. Rejected
  (matches the jitter concern).

## Verification & deliverables

- `npm test` green (existing 295 tests + new ones).
- `npm run test:coverage` green with thresholds enforced; the four target files
  at their aims.
- `ci.yml` updated; `package.json`/`package-lock.json` include coverage-v8.
- Design doc (this file) + a short Phase 1 summary.
- Work committed on `test-hardening` for a PR off `main`.

## Test-quality principles (applied throughout)

- Assert on **behaviour and exact values**, not just "truthy"/length.
- One clear reason per test; descriptive names.
- Cover branch pairs (the true *and* false side), boundaries, and empty/degenerate
  inputs — not just the happy path.
- If a test cannot pass because the code is genuinely wrong, **stop and surface
  the bug** rather than writing a test that encodes the wrong behaviour.

## Phase 1 Results

Executed via subagent-driven development (one implementer per file) followed by
an adversarial verification pass (5 independent opus reviewers that recomputed
every expected value and mutation-tested each assertion).

**Suite:** 295 → **347 tests** (19 files), all green. No production code changed
(no bugs surfaced; the added tests confirm existing behaviour).

**Per-file coverage (target files):**

| File | lines | branches | funcs |
|---|---|---|---|
| `src/app/recordRemoval.ts` | 100 | 100 | 100 |
| `services/genbank/qualifierParser.ts` | 100 | 100 | 100 |
| `services/bioUtils.ts` | ~99 | ~89 | ~97 |
| `services/searchLogic.ts` | 93.8 | 76.3 | 84.6 |

**Scoped-gate aggregate** (`services/**`, `src/app/recordRemoval.ts`,
`src/domain/**`): **lines 98.1 / branches 88.9 / functions 97.3 / statements 96.8**
(up from a whole-repo baseline of ~16%).

**Enforced ratchet thresholds** (committed in `vite.config.ts`, ~4–5 pts below
achieved to absorb jitter): **lines 94 / branches 83 / functions 93 / statements 92.**
No 100% thresholds. Wired into `ci.yml` via `npm run test:coverage`.

**Adversarial pass — fixed before finalizing:**
- *searchLogic (important):* the gapped-alignment tests asserted only `score > 8`,
  but a gap-broken Smith-Waterman still scores 10 → not mutation-sensitive. Now
  pin the exact score (12) and full span.
- *qualifierParser (important):* the "orphan text" test could not isolate the
  line-48 guard (logically redundant with line-54); relabelled to the observable
  contract and added `lastIdx` assertions + two edge cases.
- *minors:* replaced a near-tautological empty-set test; added an out-of-range
  selected-index case; added `exportToFasta` coverage; asserted the full GFF
  minus-strand line; added GenBank ORIGIN + plus/complement/passthrough
  assertions; verified Blob content/mimeType wiring in `downloadBlob`.

**Intentionally left uncovered** (accepted, not worth brittle tests): the
Smith-Waterman candidate-trimming path (`TRIM_THRESHOLD`, needs >4000 candidate
endpoints) and the `?? fallback` defensive branches in
`mapUngappedRangeToAligned` (unreachable while `map.length > 0`).

**Deferred to Phase 2:** `src/workers/protocol.ts` is ~100% covered today but sits
outside the gate's `include` scope, so it is not yet protected against regression —
either widen the scope or fold it in when the component/hook infra decision lands.
