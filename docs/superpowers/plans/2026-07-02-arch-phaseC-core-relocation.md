# Phase C · Core Relocation Plan — `services/` → `src/core/`, worker bodies → `workers/handlers/`, split `bioUtils`, DOM/presentation → `app/`, kill `types.ts`, normalize `@/`

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is the **largest, highest-conflict** phase — it is deliberately split into **six independently-mergeable PRs (C1–C6)**, each green at every task. Run it in a **dedicated git worktree** (`git worktree add /tmp/dunceious-phaseC -b arch/phaseC develop`) so it does not collide with sibling-phase sessions.

**Goal:** Finish the unfinished migration: move all pure format/search logic out of repo-root `services/` into `src/core/` (importing **domain only**), relocate the two worker bodies into `src/workers/handlers/` to **fix the `core → workers/protocol` layer inversion**, split the `bioUtils.ts` grab-bag across its true homes (serializers → `core`, display colors → `app/viewer`, `downloadBlob` → `app/lib`, selection slicing → `domain`), delete the root `types.ts` shim, rename the worker shells to `*.worker.ts`, move the app entry under `src/app/`, and normalize every cross-module import to the `@/` alias. **Every move is behavior-preserving** (verbatim body; only `export`/import specifiers and file location change). `npm run build` staying green after each task is the behavior-preservation proof for the Vite/worker wiring.

**Architecture (target after Phase C — the parts this phase produces):**

```
src/
├── domain/bio/          # unchanged by C except: intervals.ts gains the selection-slicing cluster,
│                        #   sequence.ts gains getOriginalPos, types.ts gains SearchableRecord.
├── core/                # NEW top-level layer (was repo-root services/). Imports DOMAIN ONLY.
│   ├── genbank/         # read sub-parsers (git-moved) + serialize.ts (exportToGenBank)
│   ├── formats/         # fasta.ts (parseFasta + exportToFasta), annotations.ts (parseBED/GFF3/BedGraph + exportToGff)
│   └── search/          # query.ts (degenerateToRegex), align.ts (smithWaterman), exact.ts (runExactSearch), fuzzy.ts (collectSeededFuzzyHits)
├── workers/
│   ├── protocol.ts      # unchanged except: re-exports SearchableRecord from domain
│   ├── bio.worker.ts / search.worker.ts   # RENAMED shells importing ./handlers/*
│   └── handlers/
│       ├── bio.ts       # handleBioMessage (was services/bio/handleBioMessage.ts)
│       └── search.ts    # runSearch (was services/search/runSearch.ts)
└── app/
    ├── main.tsx + index.css   # entry (moved from repo root; index.html updated)
    ├── logic/runInlineSearch.ts   # app-fallback search (was services/search/runInlineSearch.ts)
    ├── viewer/colors.ts       # display palette (was bioUtils get*Color)
    └── lib/download.ts        # downloadBlob (the one DOM-coupled fn)
```

**Layer rule enforced by this phase (spec §4):** `domain ← core ← workers/handlers ← app`. The success check for C is: `grep -rn "workers/protocol" src/core/` returns **nothing** (core imports domain only), and repo-root `services/`, `types.ts`, `index.tsx`, `index.css` no longer exist.

**PR breakdown (each = a branch off `develop`, its own PR into `develop`):**

| PR | Subfolder / concern | Ends by |
|---|---|---|
| **C1** | `src/core/genbank/` (sub-parsers + `serialize.ts`) | add `src/core/**` to coverage `include` |
| **C2** | `src/core/formats/` (`fasta.ts`, `annotations.ts` + serializers) | — |
| **C3** | `src/core/search/` (`query`/`align`/`exact`/`fuzzy`), relocate `SearchableRecord`, delete `searchLogic.ts`, move e2e test | verify `src/core` has no protocol import |
| **C4** | `src/workers/handlers/` (`bio.ts`, `search.ts`) — **inversion fix** + thin shells | add `src/workers/handlers/**` to coverage `include`; re-verify inversion |
| **C5** | `app/logic/runInlineSearch`, `app/viewer/colors`, `app/lib/download`, slicing→domain, `getOriginalPos`→domain; delete `bioUtils.ts` | confirm `services/**` holds only leftovers |
| **C6** | delete `types.ts`, normalize `@/`, rename `*.worker.ts`, move entry, drop `services/**` from `include` | full success-criteria check |

---

## Global Constraints

- **Behavior-preserving.** Every relocation moves the body **verbatim**; only the file location, the `export` keyword, and import specifiers change. Do **not** rewrite logic. If a moved test fails, recompute the expected value from source; if code is genuinely wrong, **STOP and report** — do not weaken a test or silently "fix" production logic in this phase.
- **Prefer `git mv`** when relocating a whole file (preserves history and the existing AGPL header). Extractions into a **new** file are created fresh.
- **AGPL header (enforced by `npm run lint:headers`).** Every **new** `.ts` file created in this phase — `src/core/genbank/serialize.ts`, `src/core/search/{query,align,fuzzy}.ts`, `src/app/viewer/colors.ts`, `src/app/lib/download.ts`, and any freshly-created test file — must begin with the 18-line AGPL header copied verbatim from lines 1–18 of any existing source file (e.g. `src/domain/bio/types.ts`). Files moved with `git mv` already carry it. Run `node scripts/check-license-headers.mjs --fix` then `npm run lint:headers` before each commit.
- **CI mirror after every task** (all must be green; `build` proves Vite/worker wiring survives):
  ```bash
  npm run typecheck > /dev/null 2>&1; echo "tc=$?"      # 0
  npm run lint      > /dev/null 2>&1; echo "lint=$?"    # 0 (warnings ok)
  npm run lint:headers > /dev/null 2>&1; echo "hdr=$?"  # 0
  rtk proxy npx vitest run                              # all PASS
  npm run build     > /dev/null 2>&1; echo "build=$?"   # 0
  ```
- **Coverage ratchet.** The gate `include` (in `vite.config.ts`) follows the code: `services/**` → `src/core/**` (C1) + `src/workers/handlers/**` (C4); `services/**` is dropped only in C6 once empty. **Presentation/DOM code is intentionally NOT measured** — `src/app/viewer/**` and `src/app/lib/**` stay out of `include` (they were only ever counted incidentally under `services/**`). **Per spec §8, raise thresholds, never silently lower them.** Moving well-covered presentation code (colors, `downloadBlob`) into `src/app/viewer` + `src/app/lib` (both OUTSIDE `include`) can dip the aggregate — do NOT drop thresholds to hide that. Either keep those tests contributing to the measured set, OR — if a metric legitimately dips only because measured code left the set — document an explicit ONE-TIME re-baseline in that PR's description. **Maintainer decision (2026-07-02): a one-time re-baseline IS pre-approved for a dip caused solely by measured presentation code leaving the gate — no further sign-off needed; just note the before/after numbers in the PR.** Raise any metric the achieved numbers support at the end of any PR that changes the measured set.
- **RTK note:** if `vitest`/tool output looks garbled or truncated, prefix the command with `rtk proxy`.
- **PR base branch is `develop`** (integration branch; `main` is production and deploys to CF Pages). Use `gh pr create --base develop`.
- **Import-normalization convention (spec §4 "normalize `@/`"):** cross-module imports use the `@/…` alias (resolves to repo root, per `vite.config.ts` and `tsconfig.json` `paths`); **same-directory sibling** imports stay relative (`./sibling`). When you touch a file to relocate it, convert any `../…`/`../../…` cross-module import it carries (e.g. `'../../src/domain/bio/types'`, `'../searchLogic'`) to the alias form.
- **Locate by symbol, not by line.** Cited line numbers are **as of this plan's authoring on the pre-Phase-A/B tree** and will have drifted after A and B run. Before moving anything, `grep -n <symbol>` to find its current location and move the whole symbol verbatim.

### Phase A/B post-conditions this plan assumes (verify at the start of PR C1)

Phase C depends on **B**, which depends on **A**. Confirm these before starting; if any is false, coordinate with the sibling session rather than improvising:

```bash
# domain/bio/sequence.ts exists and exports the consolidated sequence primitives
grep -rn "reverseComplement\|removeGapsWithMap\|mapUngappedRangeToAligned\|getNonGapSegments\|translateSequence\|detectMoleculeType" src/domain/bio/
# only re-export shims remain in searchLogic.ts/bioUtils.ts (no local definitions) — Phase B leaves shim
#   lines carrying these exact names, so match DEFINITIONS, not re-exports
grep -nE "^(export )?(function|const) (reverseComplement|getNonGapSegments|removeGapsWithMap|mapUngappedRangeToAligned)" services/searchLogic.ts   # expect: none (only re-export shims remain)
grep -nE "^(export )?(function|const) (translateSequence|GENETIC_CODE|extractCodingSequence|detectEarlyStop)" services/bioUtils.ts                 # expect: none (only re-export shims remain)
# SearchResult is the single domain type (Phase A dedup); searchLogic no longer declares it
grep -rn "interface SearchResult" services/searchLogic.ts   # expect: none
# the dead makeUniqueId re-export is gone from bioUtils (Phase A)
grep -n "export { makeUniqueId }" services/bioUtils.ts       # expect: none
```

**Assumed available from `@/src/domain/bio` (the barrel) or `@/src/domain/bio/sequence`** (Phase B's home): `reverseComplement`, `getNonGapSegments`, `removeGapsWithMap`, `mapUngappedRangeToAligned` (plus `translateSequence`, `detectMoleculeType`, `extractCodingSequence`, `detectEarlyStop`). When a moved file needs one, import it from `@/src/domain/bio`; **if the barrel does not re-export it, import from `@/src/domain/bio/sequence`** — confirm with `grep -rn "export" src/domain/bio/index.ts src/domain/bio/sequence.ts` and use whichever specifier resolves. **Note:** `getNonGapSegments` is provided by Phase B as an **alias export in the barrel** `src/domain/bio/index.ts` (`export { buildAlignedSegments as getNonGapSegments }`) — there is no function literally named `getNonGapSegments` in `sequence.ts`. Import it only from `@/src/domain/bio`; the `@/src/domain/bio/sequence` fallback yields `buildAlignedSegments`, not `getNonGapSegments`. The verbatim `import { getNonGapSegments } from '@/src/domain/bio'` call sites keep working unchanged (no call-body changes).

**Expected residents of `services/` at Phase C start** (what C actually moves): `services/genbank/**`, `services/parsers/{fasta,annotations}.ts`, `services/searchLogic.ts` (now only `degenerateToRegex` + IUPAC maps + `smithWaterman`/`ungappedFuzzyScan`/`traceback`), `services/search/{exact,runInlineSearch,runSearch}.ts`, `services/bio/handleBioMessage.ts`, `services/idHelpers.ts`, `services/bioUtils.ts` (now only: `get*Color`, `exportToFasta`/`exportToGff`/`exportToGenBank`, `downloadBlob`, the selection-slicing cluster `Interval`/local-`clipInterval`/`clipFeature`/`sliceRecordsBySelection`, and `getOriginalPos`). `services/moleculeType.ts` is left by Phase B as a re-export shim (Phase B repoints nothing by design); Phase C deletes it in the `formats/fasta.ts` relocation task (Task 6) once `fasta.ts` — its sole importer — is repointed, and also deletes the now-redundant `services/__tests__/moleculeType.test.ts` (its `detectMoleculeType` coverage already lives in the domain `sequence.test.ts`). The test is deleted, not moved (same de-dup precedent as `getOriginalPos` in Task 16).

> **Note on `services/idHelpers.ts`:** `makeUniqueId` is imported by `src/app/logic/bioResponse.ts` (`@/services/idHelpers`) and `services/__tests__/idHelpers.test.ts`. It is an ID utility, not format/search logic. It moves to `src/core/genbank/` **no** — it has no genbank affinity. Route it in **PR C5** to `src/app/logic/idHelpers.ts` (its only runtime consumer is `bioResponse.ts`, already in `app/logic`), or leave it as the final `services/` file that C6 relocates. This plan routes it in **C6** (see Task 19) so C5 stays focused on the `bioUtils` teardown.

---

## PR C1 — `services/genbank/` → `src/core/genbank/` (+ `serialize.ts`)

**Branch:** `arch/phaseC-pr1-core-genbank` off `develop`.

### Task 1: Move the GenBank read sub-parsers to `src/core/genbank/`

**Files:**
- Move: `services/genbank/{index,recordSplitter,headerParser,locationParser,qualifierParser,featureParser,toSeqRecord}.ts` → `src/core/genbank/`
- Move: `services/genbank/__tests__/*` → `src/core/genbank/__tests__/`
- Move: `services/__tests__/genbankParser.test.ts` → `src/core/genbank/__tests__/genbankParser.test.ts`
- Modify (importers): `services/bio/handleBioMessage.ts`, `perf/parseGenBank.perf.ts`, `bench/measureGenBank.ts`, `src/workers/__tests__/protocol.test.ts`

**Interfaces:** unchanged — `parseGenBank(content: string): SeqRecord[]` and the sub-parser exports keep their signatures.

- [ ] **Step 1: `git mv` the directory.** `git mv services/genbank src/core/genbank`. All intra-module `./sibling` imports (`./recordSplitter`, `./headerParser`, …) are preserved automatically.
- [ ] **Step 2: Re-point the domain-type imports** in the moved files. In `src/core/genbank/{index,toSeqRecord,featureParser,locationParser}.ts`, change `from '../../src/domain/bio/types'` → `from '@/src/domain/bio/types'` (the relative path is now wrong after the move; the alias is correct and matches the normalization convention). Confirm none remain: `grep -rn "\.\./\.\./src/domain" src/core/genbank` → empty.
- [ ] **Step 3: Move the standalone parser test.** `git mv services/__tests__/genbankParser.test.ts src/core/genbank/__tests__/genbankParser.test.ts`; change its import `from '../genbank/index'` → `from '../index'`.
- [ ] **Step 4: Update external importers** (grep first to catch drift — `grep -rn "services/genbank" . | grep -v node_modules`):
  - `services/bio/handleBioMessage.ts`: `import { parseGenBank } from '../genbank/index'` → `from '@/src/core/genbank/index'`.
  - `perf/parseGenBank.perf.ts`: `from '../services/genbank/index'` → `from '../src/core/genbank/index'`.
  - `bench/measureGenBank.ts`: `from '../services/genbank/index'` → `from '../src/core/genbank/index'`.
  - `src/workers/__tests__/protocol.test.ts`: `from '../../../services/genbank/index'` → `from '@/src/core/genbank/index'`.
- [ ] **Step 5: Verify + commit.** Run the CI mirror (all green). Then:
  ```bash
  git add -A
  git commit -m "refactor(core): relocate genbank read sub-parsers services/genbank -> src/core/genbank"
  ```

### Task 2: `exportToGenBank` → `src/core/genbank/serialize.ts` (write side)

**Files:**
- Create: `src/core/genbank/serialize.ts`
- Create: `src/core/genbank/__tests__/serialize.test.ts` (from the `exportToGenBank` block of `services/__tests__/bioUtils.test.ts`)
- Modify: `services/bioUtils.ts` (remove `exportToGenBank`), `src/app/hooks/useFileHandlers.ts`, `perf/bioUtils.perf.ts`, `services/__tests__/bioUtils.test.ts` (trim moved block)

**Interfaces:** `export const exportToGenBank = (records: SeqRecord[]): string`.

- [ ] **Step 1: Create `src/core/genbank/serialize.ts`.** AGPL header, then `import type { SeqRecord } from '@/src/domain/bio/types';`, then the `exportToGenBank` body moved **verbatim** from `services/bioUtils.ts` (function at ~lines 236–307 as of authoring — locate by `grep -n "export const exportToGenBank" services/bioUtils.ts`), prefixed with `export`.
- [ ] **Step 2: Remove `exportToGenBank` from `services/bioUtils.ts`.** Delete the function. Keep the `SeqRecord` import (still used by `exportToFasta`/`exportToGff`/slicing until C2/C5).
- [ ] **Step 3: Move the test.** Create `src/core/genbank/__tests__/serialize.test.ts` (AGPL header) and move the `describe('exportToGenBank', …)` block verbatim from `services/__tests__/bioUtils.test.ts`, importing `import { exportToGenBank } from '../serialize';` and `import type { SeqRecord } from '@/src/domain/bio/types';`. Delete that block (and any now-unused `SeqRecord` import if it becomes unused) from `bioUtils.test.ts`.
- [ ] **Step 4: Update importers** (`grep -rn "exportToGenBank" . | grep -v node_modules`):
  - `src/app/hooks/useFileHandlers.ts`: drop `exportToGenBank` from the `@/services/bioUtils` import group and add `import { exportToGenBank } from '@/src/core/genbank/serialize';`.
  - `perf/bioUtils.perf.ts`: drop `exportToGenBank` from `'../services/bioUtils'` group; add `import { exportToGenBank } from '../src/core/genbank/serialize';`.
  - `services/__tests__/scu49845.e2e.test.ts:37`: `from '../bioUtils'` → `from '@/src/core/genbank/serialize'` (the e2e file itself relocates in C3).
- [ ] **Step 5: Verify + commit.** CI mirror green; `rtk proxy npx vitest run src/core/genbank`.
  ```bash
  git add -A
  git commit -m "refactor(core): move exportToGenBank to src/core/genbank/serialize (write side)"
  ```

### Task 3: Point the coverage gate at `src/core/**` and re-baseline

**Files:** `vite.config.ts`

- [ ] **Step 1:** In `coverage.include`, add `"src/core/**",` (keep `"services/**"` — it still holds format/search/bio code until later PRs).
- [ ] **Step 2: Re-baseline** using the achieved numbers:
  ```bash
  rtk proxy npx vitest run --coverage > /dev/null 2>&1; echo "gate=$?"
  node -e 'const s=require("./coverage/coverage-summary.json").total;const f=k=>Math.max(0,Math.floor(s[k].pct)-3);console.log("achieved",JSON.stringify({l:s.lines.pct,b:s.branches.pct,fn:s.functions.pct,st:s.statements.pct}));console.log("suggested",JSON.stringify({lines:f("lines"),branches:f("branches"),functions:f("functions"),statements:f("statements")}))'
  ```
  Set the four `thresholds` to the suggested values, **raising** any that current-achieved supports and only lowering a metric if the moved set genuinely reduced it (note it in the commit). Current gate: `lines 94 / branches 85 / functions 93 / statements 92`.
- [ ] **Step 3: Full CI mirror + push + PR.**
  ```bash
  git add vite.config.ts
  git commit -m "ci(coverage): extend gate include to src/core after genbank relocation"
  git push -u origin arch/phaseC-pr1-core-genbank
  gh pr create --base develop --title "refactor(core): Phase C · PR1 — relocate genbank read+write to src/core/genbank" \
    --body "Behavior-preserving: git-moved services/genbank -> src/core/genbank and exportToGenBank -> src/core/genbank/serialize. Imports normalized to @/. Coverage gate now includes src/core/**. See docs/superpowers/plans/2026-07-02-arch-phaseC-core-relocation.md."
  ```

---

## PR C2 — `services/parsers/` → `src/core/formats/` (+ `exportToFasta` / `exportToGff`)

**Branch:** `arch/phaseC-pr2-core-formats` off `develop` (after C1 merges).

### Task 4: Move `fasta.ts` → `src/core/formats/fasta.ts` and fold in `exportToFasta`

**Files:**
- Move: `services/parsers/fasta.ts` → `src/core/formats/fasta.ts`; `services/parsers/__tests__/fasta.test.ts` → `src/core/formats/__tests__/fasta.test.ts`
- Modify: `services/bioUtils.ts` (remove `exportToFasta`), `services/bio/handleBioMessage.ts`, `src/app/hooks/useFileHandlers.ts`, `perf/bioUtils.perf.ts` (if it imports `exportToFasta` — grep), the moved test
- Delete: `services/moleculeType.ts` (Phase-B re-export shim, orphaned once `fasta.ts` — its sole importer — is repointed) and `services/__tests__/moleculeType.test.ts` (redundant; the canonical `detectMoleculeType` is covered by the domain `sequence.test.ts`)

**Interfaces:** `FastaRecord`, `parseFasta(content): FastaRecord[]`, and `exportToFasta(records: SeqRecord[], start?, end?): string`.

- [ ] **Step 1: `git mv services/parsers/fasta.ts src/core/formats/fasta.ts`** and `git mv services/parsers/__tests__/fasta.test.ts src/core/formats/__tests__/fasta.test.ts`.
- [ ] **Step 2: Normalize the moved file's imports.** In `src/core/formats/fasta.ts`, change `import type { BioFeature } from '../../src/domain/bio/types'` → `from '@/src/domain/bio/types'`, and the `detectMoleculeType` import (Phase B relocated it to domain) → `import { detectMoleculeType } from '@/src/domain/bio';` (fallback `@/src/domain/bio/sequence` — verify per Global Constraints). Confirm `grep -n "services/moleculeType\|\.\./moleculeType" src/core/formats/fasta.ts` → empty. `fasta.ts` was the sole remaining importer of the Phase-B `services/moleculeType.ts` shim, so delete the now-orphaned shim and its redundant test: `git rm services/moleculeType.ts services/__tests__/moleculeType.test.ts` (the canonical `detectMoleculeType` is already covered by the domain `sequence.test.ts` — delete, don't move, per the Task 16 `getOriginalPos` precedent). Confirm `grep -rn "moleculeType" services/` → empty.
- [ ] **Step 3: Add `exportToFasta`.** Append to `src/core/formats/fasta.ts`: add `import type { SeqRecord } from '@/src/domain/bio/types';` (merge into the existing type import) and paste `exportToFasta` **verbatim** from `services/bioUtils.ts` (~lines 213–222; locate by grep) with `export`. Remove `exportToFasta` from `bioUtils.ts`.
- [ ] **Step 4: Update importers** (`grep -rn "parseFasta\|exportToFasta" . | grep -v node_modules`):
  - `services/bio/handleBioMessage.ts`: `import { parseFasta } from '../parsers/fasta'` → `from '@/src/core/formats/fasta'`.
  - `src/app/hooks/useFileHandlers.ts`: move `exportToFasta` from the `@/services/bioUtils` group into `import { exportToFasta } from '@/src/core/formats/fasta';`.
  - `perf/bioUtils.perf.ts`: if present, repoint.
  - Moved test `src/core/formats/__tests__/fasta.test.ts`: `from '../fasta'` still resolves (same relative depth). Move the `exportToFasta` describe block from `services/__tests__/bioUtils.test.ts` into this file (import `exportToFasta` from `'../fasta'`, `SeqRecord` from `'@/src/domain/bio/types'`); trim it from `bioUtils.test.ts`.
- [ ] **Step 5: Verify + commit.** CI mirror green; `rtk proxy npx vitest run src/core/formats`.
  ```bash
  git add -A
  git commit -m "refactor(core): move parseFasta + exportToFasta to src/core/formats/fasta"
  ```

### Task 5: Move `annotations.ts` → `src/core/formats/annotations.ts` and fold in `exportToGff`

**Files:**
- Move: `services/parsers/annotations.ts` → `src/core/formats/annotations.ts`; `services/parsers/__tests__/annotations.test.ts` → `src/core/formats/__tests__/annotations.test.ts`
- Modify: `services/bioUtils.ts` (remove `exportToGff`), `services/bio/handleBioMessage.ts`, `src/app/hooks/useFileHandlers.ts`, the moved test

**Interfaces:** `AnnotationTrack`, `parseBED`, `parseGFF3`, `parseBedGraph`, and `exportToGff(records: SeqRecord[]): string`.

- [ ] **Step 1: `git mv`** both files as above. Remove the now-empty `services/parsers/` (and `services/parsers/__tests__/`) directories.
- [ ] **Step 2: Normalize imports** in `src/core/formats/annotations.ts`: `import type { BioFeature, FeatureSegment, QuantitativeTrack } from '../../src/domain/bio/types'` → `from '@/src/domain/bio/types'`.
- [ ] **Step 3: Add `exportToGff`.** Add `SeqRecord` to the domain-type import; paste `exportToGff` **verbatim** from `services/bioUtils.ts` (~lines 224–234) with `export`. Remove `exportToGff` from `bioUtils.ts` (the `SeqRecord` import there is now used only by the slicing cluster — keep it).
- [ ] **Step 4: Update importers** (`grep -rn "parseBED\|parseGFF3\|parseBedGraph\|AnnotationTrack\|exportToGff" . | grep -v node_modules`):
  - `services/bio/handleBioMessage.ts`: `import { parseBED, parseGFF3, parseBedGraph, type AnnotationTrack } from '../parsers/annotations'` → `from '@/src/core/formats/annotations'`.
  - `src/app/hooks/useFileHandlers.ts`: move `exportToGff` into `import { exportToGff } from '@/src/core/formats/annotations';`.
  - Move the `exportToGff` describe block from `bioUtils.test.ts` into `src/core/formats/__tests__/annotations.test.ts` (import from `'../annotations'`, `SeqRecord` from domain); trim `bioUtils.test.ts`.
- [ ] **Step 5: Verify + commit + push + PR.** CI mirror green.
  ```bash
  git add -A
  git commit -m "refactor(core): move annotation parsers + exportToGff to src/core/formats/annotations"
  git push -u origin arch/phaseC-pr2-core-formats
  gh pr create --base develop --title "refactor(core): Phase C · PR2 — relocate parsers+serializers to src/core/formats" \
    --body "Behavior-preserving: services/parsers -> src/core/formats; exportToFasta/exportToGff folded in alongside their parsers. Imports normalized to @/. See the Phase C plan."
  ```

---

## PR C3 — `services/searchLogic.ts` + `services/search/*` → `src/core/search/*` (split + inversion prep)

**Branch:** `arch/phaseC-pr3-core-search` off `develop` (after C2 merges).

This PR splits `searchLogic.ts` into `query.ts` (query builder) + `align.ts` (alignment engine), moves the pure matching strategies into `exact.ts` + `fuzzy.ts`, and **relocates `SearchableRecord` into domain** so `core/search/exact.ts` never imports the worker protocol. The worker body `runSearch` and the app-fallback `runInlineSearch` are updated in place here and physically relocated in C4/C5.

### Task 6: Relocate `SearchableRecord` type to `domain/bio/types.ts`

**Files:** `src/domain/bio/types.ts`, `src/domain/bio/index.ts`, `src/workers/protocol.ts`

**Interfaces:** `export interface SearchableRecord { id: string; sequence: string; alignedSequence?: string }`.

- [ ] **Step 1:** Move the `SearchableRecord` interface **verbatim** from `src/workers/protocol.ts` (~lines 116–121) into `src/domain/bio/types.ts` (append near `SearchResult`). Add `SearchableRecord` to the `export type { … }` list in `src/domain/bio/index.ts`.
- [ ] **Step 2:** In `src/workers/protocol.ts`, delete the local declaration and re-export for a stable public surface: add `SearchableRecord` to the existing `import type { … } from '../domain/bio/types';` block **and** add `export type { SearchableRecord } from '../domain/bio/types';`. (protocol continues to reference domain types — consistent with spec §4 rule 5.)
- [ ] **Step 3: Verify.** `grep -rn "SearchableRecord" src/ services/ | grep -v node_modules` — every consumer still resolves (importers of `@/src/workers/protocol` are unaffected because protocol re-exports it). Typecheck green. Commit:
  ```bash
  git add -A
  git commit -m "refactor(domain): move SearchableRecord to domain/bio/types; protocol re-exports it"
  ```

### Task 7: Split `searchLogic.ts` → `src/core/search/query.ts` + `src/core/search/align.ts`

**Files:**
- Create: `src/core/search/query.ts`, `src/core/search/align.ts`
- Move: `services/__tests__/searchLogic.test.ts` → `src/core/search/__tests__/engine.test.ts`
- Delete (at end): `services/searchLogic.ts`
- Modify importers: `services/search/{exact,runSearch,runInlineSearch}.ts`, `perf/searchLogic.perf.ts`, `src/workers/__tests__/protocol.test.ts`, `services/__tests__/scu49845.e2e.test.ts`

**Interfaces:** `query.ts`: `export function degenerateToRegex(query, moleculeType?): RegExp`. `align.ts`: `export function smithWaterman(query, target, matchScore?, mismatchPenalty?, gapOpen?, gapExtend?, minScore?): {score;start;end;sequence}[]`.

- [ ] **Step 1: Create `src/core/search/query.ts`.** AGPL header, then move **verbatim** from `services/searchLogic.ts`: the `IUPAC_MAP` const (~35–40), `PROTEIN_IUPAC_MAP` const (~42–55), and `degenerateToRegex` (~57–71). No imports needed (self-contained). `degenerateToRegex` is already exported; keep the two maps module-private.
- [ ] **Step 2: Create `src/core/search/align.ts`.** AGPL header, then move **verbatim** the alignment engine from `services/searchLogic.ts`: `smithWaterman` (exported, ~138–245) plus its private helpers `ungappedFuzzyScan` (~247–308) and `traceback` (~310–397). Self-contained (operates on plain strings) — no imports. Keep the leading `/** Optimized Smith-Waterman … */` doc comment.
- [ ] **Step 3: Move + trim + repoint the engine test.** `git mv services/__tests__/searchLogic.test.ts src/core/search/__tests__/engine.test.ts`. At Phase C start this file still contains describe blocks for `reverseComplement`/`getNonGapSegments`/`removeGapsWithMap`/`mapUngappedRangeToAligned` (Phase B kept them, exercised through the `searchLogic.ts` re-export shim) **plus** `degenerateToRegex` + `smithWaterman`. **Delete the four primitive describe blocks and their now-dangling imports** — they are redundantly covered by the domain tests (`src/domain/bio/__tests__/sequence.test.ts` for `reverseComplement`/`removeGapsWithMap`/`mapUngappedRangeToAligned`; `coordinate.test.ts` for `buildAlignedSegments` ≡ `getNonGapSegments`). Then repoint the two remaining engine imports: `degenerateToRegex` from `'../query'`, `smithWaterman` from `'../align'`. (Delete the duplicate, don't move it — same precedent as `getOriginalPos` in Task 16.)
- [ ] **Step 4: Repoint the remaining `searchLogic` importers** (`grep -rn "searchLogic" . | grep -v node_modules`), then delete the file:
  - `services/search/exact.ts`, `services/search/runSearch.ts`, `services/search/runInlineSearch.ts`: replace `from '../searchLogic'` — route `degenerateToRegex` → `@/src/core/search/query`, `smithWaterman` → `@/src/core/search/align`, and `SearchResult`/`reverseComplement`/`getNonGapSegments`/`removeGapsWithMap`/`mapUngappedRangeToAligned` → `@/src/domain/bio` (these are already domain post-B). (These three files are physically relocated later in this PR / in C4 / in C5; repoint them now so the tree stays green.)
  - `perf/searchLogic.perf.ts`: `smithWaterman`/`degenerateToRegex` → `../src/core/search/{align,query}`; `reverseComplement` → `@/src/domain/bio` (should already be domain post-B — grep to confirm).
  - `src/workers/__tests__/protocol.test.ts`: `degenerateToRegex`/`smithWaterman` → `@/src/core/search/{query,align}`; `reverseComplement`/`getNonGapSegments` → `@/src/domain/bio`.
  - `services/__tests__/scu49845.e2e.test.ts`: `degenerateToRegex` → `@/src/core/search/query`.
  - `rm services/searchLogic.ts` (or `git rm`).
- [ ] **Step 5: Verify + commit.** CI mirror green; `rtk proxy npx vitest run src/core/search src/workers/__tests__/protocol.test.ts`.
  ```bash
  git add -A
  git commit -m "refactor(core): split searchLogic into src/core/search/{query,align}; delete searchLogic.ts"
  ```

### Task 8: `runExactSearch` → `src/core/search/exact.ts`; `collectSeededFuzzyHits` → `src/core/search/fuzzy.ts`

**Files:**
- Move: `services/search/exact.ts` → `src/core/search/exact.ts`; `services/search/__tests__/exact.test.ts` → `src/core/search/__tests__/exact.test.ts`
- Create: `src/core/search/fuzzy.ts` + `src/core/search/__tests__/fuzzy.test.ts` (from the `collectSeededFuzzyHits` block of `services/search/__tests__/runSearch.test.ts`)
- Modify: `services/search/runSearch.ts`, `services/search/runInlineSearch.ts`, `services/search/__tests__/runSearch.test.ts`

**Interfaces:** `exact.ts`: `export function runExactSearch(searchQuery, records: SearchableRecord[], isProtein, strand): SearchResult[]`. `fuzzy.ts`: `export function collectSeededFuzzyHits(queryUpper, seq, recordId, strand, minScore): SearchResult[]`.

- [ ] **Step 1: `git mv services/search/exact.ts src/core/search/exact.ts`** and `git mv services/search/__tests__/exact.test.ts src/core/search/__tests__/exact.test.ts`. Rewrite the moved `exact.ts` import block to satisfy **core imports domain only**:
  ```typescript
  import { degenerateToRegex } from '@/src/core/search/query';
  import { reverseComplement, getNonGapSegments } from '@/src/domain/bio';
  import type { SearchResult, SearchableRecord } from '@/src/domain/bio/types';
  ```
  (`SearchableRecord` now comes from domain per Task 6 — **not** from `@/src/workers/protocol`.) The function body is unchanged. The moved test imports `runExactSearch` from `'../exact'` (unchanged depth).
- [ ] **Step 2: Create `src/core/search/fuzzy.ts`.** AGPL header, then move `collectSeededFuzzyHits` **verbatim** from `services/search/runSearch.ts` (~lines 31–109) with `export`. Imports:
  ```typescript
  import { smithWaterman } from '@/src/core/search/align';
  import { removeGapsWithMap, mapUngappedRangeToAligned, getNonGapSegments } from '@/src/domain/bio';
  import type { SearchResult } from '@/src/domain/bio/types';
  ```
  No protocol import (the function takes primitives).
- [ ] **Step 3: Move the fuzzy test.** Create `src/core/search/__tests__/fuzzy.test.ts` (AGPL header) with the `describe('collectSeededFuzzyHits', …)` block moved verbatim from `services/search/__tests__/runSearch.test.ts`, importing `import { collectSeededFuzzyHits } from '../fuzzy';`. Remove that block (and the now-unused `collectSeededFuzzyHits` name) from `runSearch.test.ts`.
- [ ] **Step 4: Repoint the still-in-`services` consumers** so the tree stays green (they relocate in C4/C5):
  - `services/search/runSearch.ts`: remove the inline `collectSeededFuzzyHits`; `import { collectSeededFuzzyHits } from '@/src/core/search/fuzzy';` and `import { runExactSearch } from '@/src/core/search/exact';`; its other primitives (`reverseComplement`, `getNonGapSegments`, `SearchResult`) already point at domain from Task 7.
  - `services/search/runInlineSearch.ts`: `import { runExactSearch } from '@/src/core/search/exact';` (was `./exact`); `smithWaterman` → `@/src/core/search/align` (from Task 7).
- [ ] **Step 5: Verify + commit.** CI mirror green; `rtk proxy npx vitest run src/core/search`.
  ```bash
  git add -A
  git commit -m "refactor(core): move runExactSearch->core/search/exact and collectSeededFuzzyHits->core/search/fuzzy"
  ```

### Task 9: Relocate the SCU49845 e2e test and verify `src/core` has no protocol import

**Files:** move `services/__tests__/scu49845.e2e.test.ts` → `src/core/__tests__/scu49845.e2e.test.ts`; `vite.config.ts` (re-baseline)

- [ ] **Step 1: `git mv services/__tests__/scu49845.e2e.test.ts src/core/__tests__/scu49845.e2e.test.ts`.** Fix the imports to the final homes: `parseGenBank` from `'@/src/core/genbank/index'`, `exportToGenBank` from `'@/src/core/genbank/serialize'`, `degenerateToRegex` from `'@/src/core/search/query'`, `processTransposition` from `'@/src/domain/bio'` (was `'../../src/domain/bio/index'`), types from `'@/src/domain/bio/types'` (was `'../../types'`). **Fix the fixture path:** the file is now one directory deeper, so `resolve(__dirname, '../../SCU49845.gb')` → `resolve(__dirname, '../../../SCU49845.gb')` (from `src/core/__tests__/` up three = repo root).
- [ ] **Step 2: Verify the inversion is fixed on the pure layer** (partial — worker bodies still in `services/`):
  ```bash
  grep -rn "workers/protocol" src/core/ ; echo "core-protocol-import-count=$(grep -rln 'workers/protocol' src/core/ | wc -l)"
  ```
  Expect **0** hits. If any core file still imports `workers/protocol`, STOP and resolve (likely a missed `SearchableRecord` import).
- [ ] **Step 3: Re-baseline** coverage (the measured set changed: search primitives now in `src/core/**`; run the snippet from Task 3 Step 2 and update `thresholds`, raising where supported).
- [ ] **Step 4: Full CI mirror + push + PR.**
  ```bash
  git add -A
  git commit -m "test(core): relocate scu49845 e2e to src/core/__tests__; ci: re-baseline gate"
  git push -u origin arch/phaseC-pr3-core-search
  gh pr create --base develop --title "refactor(core): Phase C · PR3 — search logic to src/core/search (query/align/exact/fuzzy)" \
    --body "Behavior-preserving split of searchLogic into query+align; runExactSearch/collectSeededFuzzyHits moved to core as pure primitives; SearchableRecord relocated to domain so core imports domain only (verified: 0 protocol imports under src/core). runSearch/runInlineSearch repointed in place (relocated in C4/C5). See the Phase C plan."
  ```

---

## PR C4 — Layer-inversion fix: worker bodies → `src/workers/handlers/`

**Branch:** `arch/phaseC-pr4-worker-handlers` off `develop` (after C3 merges).

### Task 10: `handleBioMessage` → `src/workers/handlers/bio.ts`; thin `bio.worker.ts`

**Files:**
- Move: `services/bio/handleBioMessage.ts` → `src/workers/handlers/bio.ts`; `services/bio/__tests__/handleBioMessage.test.ts` → `src/workers/handlers/__tests__/bio.test.ts`
- Modify: `src/workers/bioWorker.ts` (shell import)

**Interfaces:** `export function handleBioMessage(msg: BioWorkerRequest): BioWorkerResponse`.

- [ ] **Step 1: `git mv services/bio/handleBioMessage.ts src/workers/handlers/bio.ts`** and `git mv services/bio/__tests__/handleBioMessage.test.ts src/workers/handlers/__tests__/bio.test.ts`.
- [ ] **Step 2: Rewrite `src/workers/handlers/bio.ts` imports** (handlers may import `core` + `domain` + own `protocol`):
  ```typescript
  import { processTransposition, calculateConsensus } from '@/src/domain/bio';
  import { parseGenBank } from '@/src/core/genbank/index';
  import type { BioFeature } from '@/src/domain/bio/types';
  import type { BioWorkerRequest, BioWorkerResponse } from '@/src/workers/protocol';
  import { parseFasta } from '@/src/core/formats/fasta';
  import { parseBED, parseGFF3, parseBedGraph, type AnnotationTrack } from '@/src/core/formats/annotations';
  ```
  The `handleBioMessage` body is unchanged. In the moved test, repoint `import { handleBioMessage } from '../handleBioMessage'` → `from '../bio'`.
- [ ] **Step 3: Update the worker shell.** In `src/workers/bioWorker.ts`, change `import { handleBioMessage } from '../../services/bio/handleBioMessage'` → `from './handlers/bio'`.
- [ ] **Step 4: Verify + commit.** CI mirror green (esp. `npm run build`). `rtk proxy npx vitest run src/workers/handlers`.
  ```bash
  git add -A
  git commit -m "refactor(workers): move handleBioMessage to src/workers/handlers/bio; shell imports handler"
  ```

### Task 11: `runSearch` → `src/workers/handlers/search.ts`; thin `searchWorker.ts`

**Files:**
- Move: `services/search/runSearch.ts` → `src/workers/handlers/search.ts`; `services/search/__tests__/runSearch.test.ts` → `src/workers/handlers/__tests__/search.test.ts`
- Modify: `src/workers/searchWorker.ts` (shell import)

**Interfaces:** `export function runSearch(request: SearchWorkerRequest): SearchWorkerResponse`.

- [ ] **Step 1: `git mv services/search/runSearch.ts src/workers/handlers/search.ts`** and `git mv services/search/__tests__/runSearch.test.ts src/workers/handlers/__tests__/search.test.ts`.
- [ ] **Step 2: Rewrite `src/workers/handlers/search.ts` imports** (after Task 8 it no longer defines `collectSeededFuzzyHits`):
  ```typescript
  import { reverseComplement, getNonGapSegments } from '@/src/domain/bio';
  import type { SearchResult } from '@/src/domain/bio/types';
  import type { SearchWorkerRequest, SearchWorkerResponse } from '@/src/workers/protocol';
  import { runExactSearch } from '@/src/core/search/exact';
  import { collectSeededFuzzyHits } from '@/src/core/search/fuzzy';
  ```
  The `runSearch` body is unchanged. In the moved test, repoint `import { runSearch } from '../runSearch'` → `from '../search'`, drop the `collectSeededFuzzyHits` import (moved to `src/core/search/__tests__/fuzzy.test.ts` in Task 8), and change `import type { SearchWorkerRequest } from '../../../src/workers/protocol'` → `from '@/src/workers/protocol'`.
- [ ] **Step 3: Update the worker shell.** In `src/workers/searchWorker.ts`, change `import { runSearch } from '../../services/search/runSearch'` → `from './handlers/search'`.
- [ ] **Step 4: Verify + commit.** CI mirror green. `rtk proxy npx vitest run src/workers/handlers`.
  ```bash
  git add -A
  git commit -m "refactor(workers): move runSearch to src/workers/handlers/search; shell imports handler"
  ```

### Task 12: Coverage `include` for handlers; re-verify inversion; PR

**Files:** `vite.config.ts`

- [ ] **Step 1:** Add `"src/workers/handlers/**"` to `coverage.include` (the two handlers are node-testable pure functions; their tests moved with them). Do **not** add `src/workers/**` (that would pull in the `self.onmessage` shells, which use `self` and are not node-testable).
- [ ] **Step 2: Success check for the phase's headline goal:**
  ```bash
  echo "core->protocol imports: $(grep -rln 'workers/protocol' src/core/ | wc -l)"   # 0
  echo "core->workers/app imports: $(grep -rEn \"from '@?/?\\.*src/(workers|app)\" src/core/ | grep -v 'domain' | wc -l)"  # 0
  ```
  Both must be 0 — `src/core/**` now imports domain only.
- [ ] **Step 3: Re-baseline** coverage (Task 3 snippet), full CI mirror, push, PR.
  ```bash
  git add -A
  git commit -m "ci(coverage): include src/workers/handlers after inversion fix"
  git push -u origin arch/phaseC-pr4-worker-handlers
  gh pr create --base develop --title "refactor(workers): Phase C · PR4 — worker bodies to src/workers/handlers (fix core->protocol inversion)" \
    --body "Behavior-preserving: handleBioMessage->handlers/bio, runSearch->handlers/search; thin shells import the handlers. src/core now imports domain only (verified 0 protocol/workers/app imports). build green proves Vite worker wiring survives. See the Phase C plan."
  ```

---

## PR C5 — Distribute the rest of `bioUtils`: presentation → `app/`, slicing → `domain`; delete `bioUtils.ts`

**Branch:** `arch/phaseC-pr5-bioutils-teardown` off `develop` (after C4 merges).

At this PR's start `services/bioUtils.ts` holds only: `getNucleotideColor`/`getAminoAcidColor`/`getFeatureColor`, `downloadBlob`, the selection-slicing cluster (`Interval`, local-`clipInterval`, `clipFeature`, `sliceRecordsBySelection`, `TrackDataItem`), and `getOriginalPos`. And `services/search/` holds only `runInlineSearch.ts`.

### Task 13: `runInlineSearch` → `src/app/logic/runInlineSearch.ts`

**Files:**
- Move: `services/search/runInlineSearch.ts` → `src/app/logic/runInlineSearch.ts`; `services/search/__tests__/runInlineSearch.test.ts` → `src/app/logic/__tests__/runInlineSearch.test.ts`
- Modify: `src/app/hooks/useSearchWorker.ts`

**Interfaces:** `export function runInlineSearch(request: SearchWorkerRequest): SearchResult[]`.

- [ ] **Step 1: `git mv`** both files. Remove the now-empty `services/search/` (+ `__tests__`) directory.
- [ ] **Step 2: Rewrite imports** in `src/app/logic/runInlineSearch.ts` (app may import core/domain/protocol):
  ```typescript
  import { reverseComplement, getNonGapSegments, removeGapsWithMap, mapUngappedRangeToAligned } from '@/src/domain/bio';
  import type { SearchResult } from '@/src/domain/bio/types';
  import { smithWaterman } from '@/src/core/search/align';
  import type { SearchWorkerRequest } from '@/src/workers/protocol';
  import { runExactSearch } from '@/src/core/search/exact';
  ```
  Body unchanged. In the moved test, `import { runInlineSearch } from '../runInlineSearch'` (unchanged depth) and `import type { SearchWorkerRequest } from '../../../src/workers/protocol'` → `from '@/src/workers/protocol'`.
- [ ] **Step 3: Update the importer.** `src/app/hooks/useSearchWorker.ts:24`: `from '@/services/search/runInlineSearch'` → `from '@/src/app/logic/runInlineSearch'`.
- [ ] **Step 4: Verify + commit.** CI mirror green (`runInlineSearch` is under `src/app/logic/**`, already in coverage `include`). `rtk proxy npx vitest run src/app/logic`.
  ```bash
  git add -A
  git commit -m "refactor(app): move runInlineSearch (app-fallback search) to src/app/logic"
  ```

### Task 14: Display colors → `src/app/viewer/colors.ts`

**Files:**
- Create: `src/app/viewer/colors.ts` + `src/app/viewer/__tests__/colors.test.ts`
- Modify: `services/bioUtils.ts` (remove colors), `components/GenomeViewer.tsx`, `src/app/components/{DatabaseHubPanel,Sidebar,FeatureEditorModal}.tsx`, `services/__tests__/bioUtils.test.ts` (move color blocks)

**Interfaces:** `getNucleotideColor(char): string`, `getAminoAcidColor(char): string`, `getFeatureColor(type, customColors?): string`.

- [ ] **Step 1: Create `src/app/viewer/colors.ts`.** AGPL header, then move **verbatim** `getNucleotideColor` (~122–130), `getAminoAcidColor` (~148–190, keep its doc comment), `getFeatureColor` (~192–211) from `bioUtils.ts`, each with `export`. No imports needed. Remove all three from `bioUtils.ts`.
- [ ] **Step 2: Move the color tests.** Create `src/app/viewer/__tests__/colors.test.ts` (AGPL header) and move the `getNucleotideColor`/`getAminoAcidColor`/`getFeatureColor` describe blocks verbatim from `bioUtils.test.ts`, importing from `'../colors'`. Trim them from `bioUtils.test.ts`. (These tests still run for correctness; `src/app/viewer/**` is intentionally not in coverage `include`.)
- [ ] **Step 3: Update importers** (`grep -rn "getNucleotideColor\|getAminoAcidColor\|getFeatureColor" . | grep -v node_modules`):
  - `components/GenomeViewer.tsx`: in its `bioUtils` import (currently `../services/bioUtils`), drop the three color names and add `import { getAminoAcidColor, getFeatureColor, getNucleotideColor } from '@/src/app/viewer/colors';`. Also repoint the translation names `detectEarlyStop`/`extractCodingSequence`/`translateSequence` in that same import to `import { detectEarlyStop, extractCodingSequence, translateSequence } from '@/src/domain/bio';` (their final home). (Phase C must repoint every consumer that imported through a Phase-B re-export shim to the final home before deleting the shim; Phase B repoints nothing by design.)
  - `src/app/components/DatabaseHubPanel.tsx`, `Sidebar.tsx`, `FeatureEditorModal.tsx`: `import { getFeatureColor } from '@/services/bioUtils'` → `from '@/src/app/viewer/colors'`.
- [ ] **Step 4: Verify + commit.** CI mirror green. `rtk proxy npx vitest run src/app/viewer`.
  ```bash
  git add -A
  git commit -m "refactor(app): move display colors to src/app/viewer/colors (presentation)"
  ```

### Task 15: `downloadBlob` → `src/app/lib/download.ts`

**Files:**
- Create: `src/app/lib/download.ts` + `src/app/lib/__tests__/download.test.ts`
- Modify: `services/bioUtils.ts` (remove `downloadBlob`), `src/app/hooks/useFileHandlers.ts`, `services/__tests__/bioUtils.test.ts` (move `downloadBlob` block)

**Interfaces:** `downloadBlob(content: string, filename: string, mimeType: string): void`.

- [ ] **Step 1: Create `src/app/lib/download.ts`.** AGPL header, then move `downloadBlob` **verbatim** from `bioUtils.ts` (~309–319) with `export`. Remove it from `bioUtils.ts`.
- [ ] **Step 2: Move the test.** Create `src/app/lib/__tests__/download.test.ts` (AGPL header) with the `downloadBlob` describe block moved verbatim from `bioUtils.test.ts` — including its `vi`/`afterEach` DOM mocking of `document.createElement`/`URL.createObjectURL` (the block currently drives the `vi, afterEach` imports at the top of `bioUtils.test.ts`). Import `downloadBlob` from `'../download'`. Trim the block (and the now-unused `vi, afterEach` from `bioUtils.test.ts`).
- [ ] **Step 3: Update the importer.** `src/app/hooks/useFileHandlers.ts`: move `downloadBlob` out of the `@/services/bioUtils` group into `import { downloadBlob } from '@/src/app/lib/download';`.
- [ ] **Step 4: Verify + commit.** CI mirror green. `rtk proxy npx vitest run src/app/lib`.
  ```bash
  git add -A
  git commit -m "refactor(app): move downloadBlob (DOM-coupled) to src/app/lib/download"
  ```

### Task 16: Selection-slicing cluster → `src/domain/bio/intervals.ts`; `getOriginalPos` → `src/domain/bio/sequence.ts`; delete `bioUtils.ts`

**Decision (stated per the task):** the slicing cluster operates purely on the biology model (`SeqRecord`/`BioFeature`/tracks) with no format/search/DOM concern — it is **domain**, not core. It lands in `src/domain/bio/intervals.ts` (the existing clip/split home). `getOriginalPos` is a pure aligned→ungapped position map (the gap-mapping family) and lands in `src/domain/bio/sequence.ts` alongside the other Phase-B gap-mapping primitives.

**Files:**
- Modify: `src/domain/bio/intervals.ts` (+ append slicing), `src/domain/bio/sequence.ts` (+ `getOriginalPos`), `src/domain/bio/index.ts` (barrel exports)
- Move test: `services/__tests__/selectionExport.test.ts` → `src/domain/bio/__tests__/selectionExport.test.ts`; `getOriginalPos` block from `bioUtils.test.ts` → a domain test
- Modify importers: `src/app/hooks/useFileHandlers.ts`, `src/app/components/Sidebar.tsx`, `src/app/logic/featureManager.ts`, `perf/bioUtils.perf.ts`
- Delete: `services/bioUtils.ts` (now empty) + `services/__tests__/bioUtils.test.ts` (now empty)

**Interfaces:** `sliceRecordsBySelection(records, selStart, selEnd): SeqRecord[]`; the local-rebasing clip + `clipFeature` + `Interval`/`TrackDataItem` move with it (`Interval` may already be `FeatureSegment` if Phase A deduped — grep and reuse). `getOriginalPos(alignedSeq, alignedPos): number`.

- [ ] **Step 1: Move the slicing cluster into `src/domain/bio/intervals.ts`.** Append (verbatim, with `export` on the public entry points) the `Interval` type (~336), `TrackDataItem` (~337), the **local-rebasing** clip function (Phase A renamed `bioUtils`'s `clipInterval` to avoid the collision with `intervals.ts`'s canonical `clipInterval` — locate it by grep; ~344–357), `clipFeature` (~364–379), and `sliceRecordsBySelection` (~385–416). Rewrite the inline `import('../types').BioFeature`/`SeqRecord` references to the module's `import type { BioFeature, SeqRecord } from './types';` (intervals.ts already imports `FeatureSegment` from `./types`). If Phase A already collapsed `Interval` into `FeatureSegment`, use `FeatureSegment` and drop the duplicate.
- [ ] **Step 2: Move `getOriginalPos` into `src/domain/bio/sequence.ts`** (verbatim, ~421–430) with `export`. (Confirm `sequence.ts` exists from Phase B; if Phase B already relocated `getOriginalPos`, skip and just repoint importers.)
- [ ] **Step 3: Barrel exports.** Add `sliceRecordsBySelection` (and `getOriginalPos` if not already) to `src/domain/bio/index.ts` so consumers import via `@/src/domain/bio`.
- [ ] **Step 4: Move/repoint the tests.** `git mv services/__tests__/selectionExport.test.ts src/domain/bio/__tests__/selectionExport.test.ts`; repoint its imports — the local clip + `sliceRecordsBySelection` from `'../intervals'`, types from `'../types'`. (At Phase C start `selectionExport.test.ts` already imports the Phase-A-renamed local clip name — carry that name through.) **Delete** the `getOriginalPos` describe block from `bioUtils.test.ts` (do NOT move it) — Phase B already adds a `getOriginalPos` suite in `src/domain/bio/__tests__/sequence.test.ts`, so moving it here would duplicate that suite.
- [ ] **Step 5: Update runtime importers** (`grep -rn "sliceRecordsBySelection\|getOriginalPos\|from '@/services/bioUtils'\|services/bioUtils" . | grep -v node_modules`):
  - `src/app/hooks/useFileHandlers.ts`: move `sliceRecordsBySelection` to `import { sliceRecordsBySelection } from '@/src/domain/bio';` and delete the now-empty `@/services/bioUtils` import statement.
  - `src/app/components/Sidebar.tsx`: `import { getOriginalPos } from '@/services/bioUtils'` → `from '@/src/domain/bio';`.
  - `src/app/logic/featureManager.ts`: `import { getOriginalPos } from '@/services/bioUtils'` → `from '@/src/domain/bio';`.
  - `perf/bioUtils.perf.ts`: repoint `sliceRecordsBySelection` (and any leftover) to `@/src/domain/bio`; `translateSequence` should already be domain (Phase B). Rename the perf file to `perf/domainSlice.perf.ts` **only if** trivially safe; otherwise leave the filename and just fix imports (perf is excluded from the test run but is typechecked+linted).
- [ ] **Step 6: Delete the emptied files.** Confirm `services/bioUtils.ts` has no remaining exports (`grep -n "export" services/bioUtils.ts`), then `git rm services/bioUtils.ts services/__tests__/bioUtils.test.ts`. Confirm nothing imports it: `grep -rn "bioUtils" . | grep -v node_modules` → empty.
- [ ] **Step 7: Re-baseline + verify + push + PR.** Coverage measured set changed (colors/download left the set; slicing/`getOriginalPos` joined `src/domain/**`). Re-baseline (Task 3 snippet), full CI mirror.
  ```bash
  git add -A
  git commit -m "refactor(domain): move selection slicing to intervals + getOriginalPos to sequence; delete bioUtils"
  git push -u origin arch/phaseC-pr5-bioutils-teardown
  gh pr create --base develop --title "refactor: Phase C · PR5 — tear down bioUtils (colors->app/viewer, download->app/lib, slicing->domain); runInlineSearch->app/logic" \
    --body "Behavior-preserving distribution of the bioUtils grab-bag to its true layers; bioUtils.ts deleted. runInlineSearch relocated to app/logic. See the Phase C plan."
  ```

---

## PR C6 — Kill `types.ts`, normalize `@/`, rename `*.worker.ts`, move the app entry

**Branch:** `arch/phaseC-pr6-normalize-entry` off `develop` (after C5 merges).

### Task 17: Delete the root `types.ts` shim; migrate its remaining consumers

**Files:** `types.ts` (delete), `components/GenomeViewer.tsx`, `perf/grid2d.perf.ts`, `src/domain/bio/__tests__/{consensus,coordinate}.test.ts`, `services/__tests__/alignmentLogic.test.ts` (+ any others grep finds)

- [ ] **Step 1: Enumerate consumers.** `grep -rn "from '\.\.*/types'\|from '@/types'" . | grep -v node_modules | grep -v "domain/bio/types"` — every hit is a shim consumer (root `types.ts` re-exports `./src/domain/bio/types`). Expected: `components/GenomeViewer.tsx:25`, `perf/grid2d.perf.ts`, `services/__tests__/alignmentLogic.test.ts`, `src/domain/bio/__tests__/{consensus,coordinate}.test.ts` (these use `'../types'` = domain's own `types.ts`, which is **correct** — do NOT change those; the shim is only the repo-root `types.ts`).
- [ ] **Step 2: Repoint the true shim consumers to the canonical module:**
  - `components/GenomeViewer.tsx:25`: `import { BioFeature, SearchResult, SelectionArea, SeqRecord } from '../types'` → `from '@/src/domain/bio/types'`.
  - `perf/grid2d.perf.ts`: `import type { … } from '../types'` → `from '@/src/domain/bio/types'` (or `'../src/domain/bio/types'`).
  - `services/__tests__/alignmentLogic.test.ts`: this test imports `transposeCoordinates/processTransposition/calculateConsensus` from `'../../src/domain/bio/index'` and `SeqRecord` from `'../../types'`. It has no `services/` affinity — `git mv services/__tests__/alignmentLogic.test.ts src/domain/bio/__tests__/alignmentLogic.test.ts` and repoint: domain fns from `'../index'`, `SeqRecord` from `'../types'`.
- [ ] **Step 3: Delete the shim.** `git rm types.ts`. Confirm: `grep -rn "root types shim\|from '\.\./\.\./types'\|from '\.\./types'" . | grep -v node_modules | grep -v "domain/bio"` → empty (only domain-internal `'./types'`/`'../types'` remain).
- [ ] **Step 4: Verify + commit.** CI mirror green.
  ```bash
  git add -A
  git commit -m "refactor: delete root types.ts shim; consumers import @/src/domain/bio/types"
  ```

### Task 18: Rename worker shells to `*.worker.ts`

**Files:** `src/workers/bioWorker.ts` → `src/workers/bio.worker.ts`; `src/workers/searchWorker.ts` → `src/workers/search.worker.ts`; `src/app/hooks/useBioWorker.ts`, `src/app/hooks/useSearchWorker.ts`

- [ ] **Step 1: `git mv src/workers/bioWorker.ts src/workers/bio.worker.ts`** and `git mv src/workers/searchWorker.ts src/workers/search.worker.ts`. (Their `import … from './handlers/bio'`/`'./handlers/search'` are unaffected.)
- [ ] **Step 2: Update the `new URL(...)` worker instantiation:**
  - `src/app/hooks/useBioWorker.ts:56`: `new URL('@/src/workers/bioWorker.ts', import.meta.url)` → `new URL('@/src/workers/bio.worker.ts', import.meta.url)`.
  - `src/app/hooks/useSearchWorker.ts:192`: `new URL('@/src/workers/searchWorker.ts', import.meta.url)` → `new URL('@/src/workers/search.worker.ts', import.meta.url)`.
- [ ] **Step 3: Verify — `npm run build` is the critical check** (Vite resolves the worker via the `new URL(..., import.meta.url)` + `new Worker` pattern; the filename suffix is cosmetic, but build must confirm the URL still resolves and the worker bundles). Run the full CI mirror; then a quick smoke that the built output contains a worker chunk: `npm run build > /dev/null 2>&1 && ls -1 dist/assets | grep -i worker || echo "(worker chunk name may differ; build exit 0 is the gate)"`.
- [ ] **Step 4: Commit.**
  ```bash
  git add -A
  git commit -m "refactor(workers): rename shells to bio.worker.ts / search.worker.ts; update new URL() sites"
  ```

### Task 19: Move the app entry under `src/app/`; relocate `idHelpers`; drop `services/**` from coverage

**Files:** `index.tsx` → `src/app/main.tsx`; `index.css` → `src/app/index.css`; `index.html`; `services/idHelpers.ts` → `src/app/logic/idHelpers.ts` (+ its test + importer); `vite.config.ts`

- [ ] **Step 1: Move the entry.** `git mv index.tsx src/app/main.tsx` and `git mv index.css src/app/index.css`. In `src/app/main.tsx`: `import './index.css'` stays (now colocated); `import App from './src/app/App'` → `import App from './App'`; the fontawesome CSS import is unchanged.
- [ ] **Step 2: Update `index.html`.** Line ~59: `<script type="module" src="/index.tsx"></script>` → `<script type="module" src="/src/app/main.tsx"></script>`.
- [ ] **Step 3: Relocate `idHelpers`.** `git mv services/idHelpers.ts src/app/logic/idHelpers.ts` and `git mv services/__tests__/idHelpers.test.ts src/app/logic/__tests__/idHelpers.test.ts`. Repoint: `src/app/logic/bioResponse.ts` `import { makeUniqueId } from '@/services/idHelpers'` → `from '@/src/app/logic/idHelpers';`; in the moved test, `from '../idHelpers'` (or `from '../bioUtils'` at Phase C start → `from '../idHelpers'`). Confirm `grep -rn "services/idHelpers\|idHelpers" . | grep -v node_modules` resolves.
- [ ] **Step 4: `services/` is now empty — remove it.** `grep -rn "services/" . | grep -v node_modules | grep -v "/dist/"` → empty; `rmdir` any leftover empty `services/` directories (`git status` should show no tracked file under `services/`).
- [ ] **Step 5: Drop `"services/**"` from `coverage.include`** in `vite.config.ts` (nothing lives there anymore). Verify the remaining `include` = `["src/core/**", "src/workers/handlers/**", "src/app/recordRemoval.ts", "src/app/logic/**", "src/domain/**"]`. Re-baseline thresholds (Task 3 snippet).
- [ ] **Step 6: Final full CI mirror + success-criteria check + push + PR.**
  ```bash
  # Phase C success criteria
  ls index.tsx index.css types.ts 2>/dev/null && echo "FAIL: root entry/shim still present" || echo "OK: root entry/shim gone"
  test -d services && echo "FAIL: services/ still present" || echo "OK: services/ gone"
  test -d components && echo "NOTE: components/ remains (GenomeViewer moves in Phase D)"
  echo "core->protocol imports: $(grep -rln 'workers/protocol' src/core/ | wc -l)"   # 0
  npm run typecheck > /dev/null 2>&1; echo "tc=$?"
  npm run lint > /dev/null 2>&1; echo "lint=$?"
  npm run lint:headers > /dev/null 2>&1; echo "hdr=$?"
  rtk proxy npx vitest run --coverage
  npm run build > /dev/null 2>&1; echo "build=$?"
  ```
  All green; the two "OK" lines print. Then:
  ```bash
  git add -A
  git commit -m "refactor(app): move entry to src/app/main.tsx + index.css; relocate idHelpers; drop services from coverage"
  git push -u origin arch/phaseC-pr6-normalize-entry
  gh pr create --base develop --title "refactor: Phase C · PR6 — kill types.ts shim, normalize @/, rename *.worker.ts, move app entry" \
    --body "Final Phase C normalization: root types.ts deleted; app entry under src/app/main.tsx (+ index.css, index.html updated); worker shells renamed to *.worker.ts; services/ removed and dropped from coverage include. src/core imports domain only. build green. See docs/superpowers/plans/2026-07-02-arch-phaseC-core-relocation.md."
  ```

---

## Self-review

- **Spec conformance (§3/§4):** targets match the locked structure exactly — pure layer is `src/core/` (genbank/formats/search), worker bodies in `src/workers/handlers/`, presentation colors in `src/app/viewer/colors.ts`, `downloadBlob` in `src/app/lib/download.ts`, entry `src/app/main.tsx`. The layer rule `domain ← core ← workers/handlers ← app` is enforced by relocating `SearchableRecord` to domain (Task 6) and the worker bodies out of `services/` (Tasks 10–11), with an explicit `grep -rn "workers/protocol" src/core/` = 0 success check (Tasks 9, 12, 19).
- **`fuzzy.ts` placement:** `collectSeededFuzzyHits` is a pure primitive (no protocol) → `src/core/search/fuzzy.ts`, satisfying spec §3's `core/search: … exact.ts, fuzzy.ts — pure primitives, NO protocol import`; `runSearch` (handler) imports it. This resolves the §3 tension (the "search.ts: runSearch + collectSeededFuzzyHits" note described the pre-split bundling). Flagged as a key decision.
- **Slicing home decision:** stated and justified — selection slicing operates only on the domain model, so it goes to `src/domain/bio/intervals.ts` (domain), not `core`. `getOriginalPos` → `src/domain/bio/sequence.ts` (gap-mapping family). Both flagged.
- **Behavior preservation:** every move is `git mv` (whole file, header + history preserved) or a verbatim symbol extraction; no logic is rewritten. `npm run build` runs after each task (proves Vite worker/entry wiring), and the worker rename task treats build as the gate.
- **Coverage ratchet:** `include` gains `src/core/**` (C1), `src/workers/handlers/**` (C4), and drops `services/**` (C6); presentation/DOM (`app/viewer`, `app/lib`) is deliberately excluded; thresholds re-baselined (raise-only) in every PR that shifts the measured set. Tests move with their code so counts never drop.
- **AGPL header:** listed for every new `.ts` (`serialize`, `query`, `align`, `fuzzy`, `colors`, `download`, new tests); `git mv` files keep theirs; `lint:headers` in the per-task CI mirror.
- **Cross-phase honesty:** the plan is written against the **post-A/B** tree it will execute on, with a start-of-phase verification block and explicit "assumed domain exports" so it degrades gracefully if a sibling phase's internal layout differs; line numbers are flagged as authoring-time and every move says "locate by symbol/grep."
- **No placeholders:** all paths, symbols, and commands are concrete; long bodies use "move lines N–M verbatim (locate by grep)" per the template's precedent rather than re-pasting.
