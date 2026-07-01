# Benchmark/Perf Pipeline Cleanup — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the two benchmark systems into sibling `perf/` (regression guardrails) and `bench/` (data-collection grid) folders, delete dead code, fix `benchmark/`→`bench/` comment rot, and DRY the vitest configs — with no change to what the benchmarks measure.

**Architecture:** Pure reorganization. Files move via `git mv` (history preserved); the two pipelines share no code, so they split cleanly. A tiny root `vitest.shared.ts` holds the common config; each folder gets a thin `vitest.config.ts`. Verification is command-driven: after each task the relevant gate (`npm run perf`, a reduced `bench` run, `npm test`, `npm run typecheck`/`lint`/`build`) stays green.

**Tech Stack:** Vitest 4, Vite 6, TypeScript 5.9, Node 20, `@vitejs/plugin-react`.

**Spec:** [`docs/superpowers/specs/2026-06-30-benchmark-pipeline-cleanup-design.md`](../specs/2026-06-30-benchmark-pipeline-cleanup-design.md)

---

## Working context (read before starting)

- **Branch:** all work on `bench-cleanup` (already created off `main`). Do not switch branches. Verify with `git branch --show-current`.
- **Commit trailer:** end every commit message with:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Use `git mv`** for relocations (preserve history). Use explicit `git add <paths>` — never `git add -A`.
- **rtk note:** `tsc`/`eslint` are proxied through `rtk` (summarizes output, can mangle piped exit codes). Run bare commands and `echo "EXIT=$?"` on their own line.
- **Why moves don't break imports:** `perf/` and `bench/` are both one level below the repo root (same depth as today's `bench/`), so `../services/...`, `../src/...`, `../types`, and `./perfUtils` relative imports in moved files stay valid.
- **Why `npm test` is unaffected:** Vitest's default include is `**/*.{test,spec}.*`. The renamed files (`*.perf.ts`, `genbank.grid.bench.ts`) don't match it, and `vite.config.ts` also excludes both folders. The grid test was never part of the 295-test unit suite.

---

## File Structure (target)

| Path | Responsibility | Action |
| --- | --- | --- |
| `vitest.shared.ts` | Common vitest config (plugins, `@` alias, node env, `--expose-gc`) | Create |
| `perf/*.perf.ts` (4) | Performance regression guardrails | `git mv` + rename from `bench/*.perf.bench.ts` |
| `perf/perfUtils.ts` | `bench()` helper for the guardrails | `git mv` from `bench/perfUtils.ts` |
| `perf/vitest.config.ts` | Perf suite config | Create (replaces `vitest.perf.config.ts`) |
| `perf/README.md` | Perf folder docs | Create |
| `bench/genbank.grid.bench.ts` | The data-collection grid | `git mv` + rename from `bench/genbank.bench.test.ts` |
| `bench/measureGenBank.ts`, `bench/syntheticGenbank.ts` | Grid helpers | Unchanged |
| `bench/visualize.mjs` | SVG plotter | Comment fixes only |
| `bench/runBench.mjs` | Grid CLI wrapper | Edit `--config` path |
| `bench/vitest.config.ts` | Grid suite config | Create (replaces `vitest.bench.config.ts`) |
| `bench/README.md` | Bench folder docs | Create |
| `vite.config.ts` | App + unit-test config | Edit `test.exclude` |
| `package.json` | Scripts | Edit `perf` script path |
| `.gitignore` | Ignore generated output | Edit stale comment |
| `README.md` | Available Scripts table | Edit `perf`/`bench`/`plot` rows |
| `bench/summarize.mjs`, `benchmark/` | Dead code / stale artifact | Delete |

---

## Task 1: Remove dead code

**Files:**
- Delete: `bench/summarize.mjs` (orphaned; only caller was the removed CI step)
- Delete: `benchmark/` (untracked stale April artifact)

- [ ] **Step 1: Confirm `summarize.mjs` is orphaned**

Run: `grep -rn "summarize" --include=*.ts --include=*.mjs --include=*.yml --include=*.json . | grep -v node_modules | grep -v "docs/" | grep -i "summarize.mjs"`
Expected: only matches inside `bench/summarize.mjs` itself (no external caller).

- [ ] **Step 2: Delete both**

```bash
git rm bench/summarize.mjs
rm -rf benchmark/
```
(`benchmark/` is untracked, so plain `rm -rf`. `summarize.mjs` is tracked, so `git rm`.)

- [ ] **Step 3: Verify nothing broke**

```bash
npm test ; echo "TEST=$?"
git status --short
```
Expected: `TEST=0` (295 tests). `git status --short` shows `summarize.mjs` staged for deletion and NO `?? benchmark/` line (the folder is gone).

- [ ] **Step 4: Commit**

```bash
git add -u bench/summarize.mjs
git commit -m "chore(bench): remove dead summarize.mjs and stale benchmark/ artifact

summarize.mjs was orphaned when the CI benchmark step was removed in Phase 1
and read the wrong path. benchmark/ was a stale April artifact from an old
layout; current code writes to bench/results/ (git-ignored).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Shared vitest base + bench/ grid suite

**Files:**
- Create: `vitest.shared.ts`
- Rename: `bench/genbank.bench.test.ts` → `bench/genbank.grid.bench.ts`
- Create: `bench/vitest.config.ts` (from `vitest.bench.config.ts`)
- Delete: `vitest.bench.config.ts`
- Modify: `bench/runBench.mjs`, `bench/genbank.grid.bench.ts` (comments), `bench/visualize.mjs` (comments)

- [ ] **Step 1: Create the shared base config**

Create `vitest.shared.ts`:

```ts
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

/**
 * Shared Vitest configuration for the perf/ (regression guardrails) and
 * bench/ (data-collection grid) suites. Each suite's vitest.config.ts spreads
 * this and adds its own `include` (and, for the grid, a longer testTimeout).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export const sharedBenchConfig = {
  plugins: [react()],
  resolve: {
    alias: { '@': ROOT },
  },
  test: {
    environment: 'node' as const,
    // Expose global.gc() to worker processes for GC-aware memory sampling.
    execArgv: ['--expose-gc'],
  },
};
```

- [ ] **Step 2: Rename the grid test (preserve history)**

```bash
git mv bench/genbank.bench.test.ts bench/genbank.grid.bench.ts
```

- [ ] **Step 3: Create the bench suite config**

Create `bench/vitest.config.ts`:

```ts
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

/**
 * Vitest config for the GenBank parse-time data-collection grid.
 * Run via:  npm run bench   (and npm run plot to regenerate SVGs)
 */
import { defineConfig } from 'vite';
import { sharedBenchConfig } from '../vitest.shared';

export default defineConfig({
  ...sharedBenchConfig,
  test: {
    ...sharedBenchConfig.test,
    include: ['bench/**/*.grid.bench.ts'],
    // The grid spawns child processes per replicate; allow a long budget.
    testTimeout: 300000,
  },
});
```

- [ ] **Step 4: Delete the old root bench config**

```bash
git rm vitest.bench.config.ts
```

- [ ] **Step 5: Point runBench.mjs at the new config**

In `bench/runBench.mjs`, change the `spawnSync` config argument. Find:

```js
const result = spawnSync(vitestBin, ['run', '--config', 'vitest.bench.config.ts'], {
```

Replace with:

```js
const result = spawnSync(vitestBin, ['run', '--config', 'bench/vitest.config.ts'], {
```

- [ ] **Step 6: Fix comment rot in the grid test**

In `bench/genbank.grid.bench.ts`, two edits:
- Line ~36: replace `JSON to \`benchmark/results/benchmark.json\` at the end of the run.` → `JSON to \`bench/results/benchmark.json\` at the end of the run.`
- Line ~221: replace `// Refresh SVG tables & charts in benchmark/plots/. Failures here must not` → `// Refresh SVG tables & charts in bench/plots/. Failures here must not`

(Use find-and-replace on the substrings `benchmark/results/benchmark.json` → `bench/results/benchmark.json` and `benchmark/plots/` → `bench/plots/` within this file.)

- [ ] **Step 7: Fix comment rot in visualize.mjs**

In `bench/visualize.mjs`, replace the substring `benchmark/results/benchmark.json` → `bench/results/benchmark.json` (line ~4), `benchmark/plots/` → `bench/plots/` (line ~5), and `node benchmark/visualize.mjs` → `node bench/visualize.mjs` (line ~429). The code (DEFAULT_RESULTS/DEFAULT_OUT via `__dirname`) is already correct and must not change — comments only.

- [ ] **Step 8: Verify the grid pipeline end-to-end (reduced, fast run)**

Run a minimal grid (1 record × 1 replicate) that still exercises test → JSON → plot generation:
```bash
rm -rf bench/results bench/plots
BENCH_RECORD_COUNTS=1 BENCH_REPLICATES=1 node --expose-gc node_modules/.bin/vitest run --config bench/vitest.config.ts ; echo "BENCH=$?"
ls bench/results/benchmark.json bench/plots/*.svg
```
Expected: `BENCH=0`; `bench/results/benchmark.json` exists and `bench/plots/` contains one or more `.svg` files. (This proves the config wiring, the rename, and the visualize import all work.)

- [ ] **Step 9: Verify unit tests + typecheck unaffected**

```bash
npm test ; echo "TEST=$?"
npx tsc --noEmit ; echo "TYPECHECK=$?"
```
Expected: `TEST=0` (295 tests), `TYPECHECK=0`.

- [ ] **Step 10: Commit** (do NOT commit generated `bench/results` or `bench/plots` — they are git-ignored)

```bash
git add vitest.shared.ts bench/vitest.config.ts bench/runBench.mjs bench/genbank.grid.bench.ts
git add -u vitest.bench.config.ts
git status --short   # confirm no bench/results or bench/plots staged
git commit -m "refactor(bench): rename grid test, add bench/vitest.config.ts + shared base

Renames genbank.bench.test.ts -> genbank.grid.bench.ts, moves the bench
vitest config into bench/ (sharing the new root vitest.shared.ts), points
runBench.mjs at it, and fixes benchmark/->bench/ comment rot.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Move the perf guardrails to perf/

**Files:**
- Rename: `bench/{searchLogic,bioUtils,parseGenBank,grid2d}.perf.bench.ts` → `perf/{...}.perf.ts`
- Rename: `bench/perfUtils.ts` → `perf/perfUtils.ts`
- Create: `perf/vitest.config.ts`; Delete: `vitest.perf.config.ts`
- Modify: `package.json` (perf script), `vite.config.ts` (exclude), the 4 perf headers (comment rot)

- [ ] **Step 1: Move + rename the perf files (preserve history)**

```bash
git mv bench/searchLogic.perf.bench.ts perf/searchLogic.perf.ts
git mv bench/bioUtils.perf.bench.ts    perf/bioUtils.perf.ts
git mv bench/parseGenBank.perf.bench.ts perf/parseGenBank.perf.ts
git mv bench/grid2d.perf.bench.ts      perf/grid2d.perf.ts
git mv bench/perfUtils.ts              perf/perfUtils.ts
```

- [ ] **Step 2: Create the perf suite config**

Create `perf/vitest.config.ts`:

```ts
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

/**
 * Vitest config for the performance regression guardrails.
 * Run via:  npm run perf
 */
import { defineConfig } from 'vite';
import { sharedBenchConfig } from '../vitest.shared';

export default defineConfig({
  ...sharedBenchConfig,
  test: {
    ...sharedBenchConfig.test,
    include: ['perf/**/*.perf.ts'],
  },
});
```

- [ ] **Step 3: Delete the old root perf config**

```bash
git rm vitest.perf.config.ts
```

- [ ] **Step 4: Update the `perf` npm script**

In `package.json`, change:
```json
    "perf": "node --expose-gc node_modules/.bin/vitest run --config vitest.perf.config.ts"
```
to:
```json
    "perf": "node --expose-gc node_modules/.bin/vitest run --config perf/vitest.config.ts"
```

- [ ] **Step 5: Update `vite.config.ts` test excludes**

In `vite.config.ts`, replace the `test.exclude` array:
```ts
      exclude: [
        "bench/**",
        "**/*.bench.ts",
        "**/*.bench.test.ts",
        "**/node_modules/**",
      ],
```
with:
```ts
      exclude: [
        "perf/**",
        "bench/**",
        "**/node_modules/**",
      ],
```

- [ ] **Step 6: Fix the perfUtils path rot in the 4 perf headers**

In each of `perf/grid2d.perf.ts`, `perf/bioUtils.perf.ts`, `perf/searchLogic.perf.ts`, replace the substring:
`src/__tests__/perfUtils.ts and parseGenBank.perf.bench.ts` → `perfUtils.ts and parseGenBank.perf.ts`

In `perf/parseGenBank.perf.ts`, replace the substring:
`src/__tests__/perfUtils.ts for a detailed explanation` → `perfUtils.ts for a detailed explanation`

- [ ] **Step 7: Verify the perf suite runs from its new home**

```bash
npm run perf ; echo "PERF=$?"
```
Expected: `PERF=0`. The run should report 4 test files under `perf/` (searchLogic, bioUtils, parseGenBank, grid2d) and all assertions pass. If it reports "no test files found", the `include` glob or `--config` path is wrong — fix before continuing.

- [ ] **Step 8: Verify unit tests + typecheck + lint + build all green**

```bash
npm test ; echo "TEST=$?"
npx tsc --noEmit ; echo "TYPECHECK=$?"
npx eslint . > /dev/null 2>&1 ; echo "LINT=$?"
npm run build ; echo "BUILD=$?"
```
Expected: `TEST=0` (295), `TYPECHECK=0`, `LINT=0`, `BUILD=0`.

- [ ] **Step 9: Commit**

```bash
git add perf/ vite.config.ts package.json
git add -u vitest.perf.config.ts
git commit -m "refactor(perf): move guardrails to perf/ as *.perf.ts with own config

Moves the four *.perf.bench.ts guardrail files + perfUtils.ts into perf/
(renamed *.perf.ts), adds perf/vitest.config.ts using the shared base,
updates the perf npm script and vite.config.ts excludes, and fixes the
stale src/__tests__/perfUtils.ts methodology references.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Docs — per-folder READMEs, main README, .gitignore

**Files:**
- Create: `perf/README.md`, `bench/README.md`
- Modify: `README.md`, `.gitignore`

- [ ] **Step 1: Create `perf/README.md`**

```markdown
# perf/ — Performance regression guardrails

Fast, assertion-based micro-benchmarks that guard against performance
regressions in core algorithms. Each file pins one source module and asserts
*relative* time/memory budgets (median/p95, GC-aware) via `perfUtils.bench()`.
Console output only — no artifacts, not a CI gate.

| File | Covers |
| --- | --- |
| `searchLogic.perf.ts` | `services/searchLogic` — reverseComplement, smithWaterman, degenerateToRegex |
| `bioUtils.perf.ts` | `services/bioUtils` — translateSequence, sliceRecordsBySelection, exportToGenBank |
| `parseGenBank.perf.ts` | `services/genbank` — parseGenBank |
| `grid2d.perf.ts` | `src/domain/bio` — transposeCoordinates, processTransposition, calculateConsensus, … |

## Run

```bash
npm run perf
```

Runs with `--expose-gc` so memory assertions are meaningful. See
`perfUtils.ts` for the measurement methodology (why V8 memory numbers are
noisy and how the noise is reduced).
```

- [ ] **Step 2: Create `bench/README.md`**

```markdown
# bench/ — GenBank parse-time data-collection grid

An exploratory benchmark that measures `parseGenBank` time/memory across a 2-D
grid of inputs (sequence length × number of records), then renders SVG plots.
Unlike `perf/`, this is a data-collection/analysis tool, not a pass/fail gate —
it is slow (spawns a child process per replicate) and produces artifacts.

| File | Role |
| --- | --- |
| `genbank.grid.bench.ts` | Grid orchestrator (spawns replicates, writes JSON, triggers plots) |
| `measureGenBank.ts` | Child-process measurement helper |
| `syntheticGenbank.ts` | Deterministic synthetic GenBank generator |
| `visualize.mjs` | Renders SVG charts/tables from the JSON |
| `runBench.mjs` | CLI wrapper (`npm run bench`) |
| `vitest.config.ts` | Vitest config (`include: bench/**/*.grid.bench.ts`) |

## Run

```bash
npm run bench            # full grid, default record counts [1, 10, 30, 50]
npm run bench 1 10 100   # custom record counts
npm run plot             # regenerate SVGs from an existing results file
```

Output (git-ignored) goes to `bench/results/benchmark.json` and
`bench/plots/*.svg`.
```

- [ ] **Step 3: Update the main README Available Scripts rows**

In `README.md`, replace the `perf`, `bench`, and `plot` rows with:

```
| `npm run perf`      | Run the performance regression guardrails in `perf/` — relative time/memory budgets on core algorithms (console only)                                 |
| `npm run bench`     | Run the GenBank parse-time data grid in `bench/` and write results to `bench/results/benchmark.json` + SVG plots to `bench/plots/`                     |
| `npm run plot`      | Regenerate the SVG plots in `bench/plots/` from an existing `bench/results/benchmark.json` without re-running the grid                                  |
```

- [ ] **Step 4: Fix the `.gitignore` comment**

In `.gitignore`, replace:
```
# Benchmark files generated at runtime; uploaded as CI artifact
```
with:
```
# Benchmark output generated at runtime by `npm run bench` / `npm run plot`
```
(The three ignore lines `bench/results/`, `bench/fixtures/`, `bench/plots/` stay as-is — they are still the correct output locations.)

- [ ] **Step 5: Verify docs don't break any gate**

```bash
npx eslint . > /dev/null 2>&1 ; echo "LINT=$?"
npx tsc --noEmit ; echo "TYPECHECK=$?"
```
Expected: `LINT=0`, `TYPECHECK=0` (markdown/.gitignore aren't linted, but confirm nothing regressed).

- [ ] **Step 6: Commit**

```bash
git add perf/README.md bench/README.md README.md .gitignore
git commit -m "docs(bench): add per-folder READMEs, update scripts table + .gitignore note

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Final whole-pipeline verification

**Files:** none (verification only — no commit unless a fix is needed).

- [ ] **Step 1: All gates green**

```bash
npm run typecheck ; echo "TYPECHECK=$?"
npm run lint > /dev/null 2>&1 ; echo "LINT=$?"
npm test ; echo "TEST=$?"
npm run build ; echo "BUILD=$?"
```
Expected: all `=0`; `TEST` = 295 tests / 18 files.

- [ ] **Step 2: Both benchmark systems work**

```bash
npm run perf ; echo "PERF=$?"
rm -rf bench/results bench/plots
BENCH_RECORD_COUNTS=1 BENCH_REPLICATES=1 node --expose-gc node_modules/.bin/vitest run --config bench/vitest.config.ts ; echo "BENCH=$?"
ls bench/results/benchmark.json bench/plots/*.svg
npm run plot ; echo "PLOT=$?"
```
Expected: `PERF=0`, `BENCH=0`, results + svg files exist, `PLOT=0`.

- [ ] **Step 3: No stale `benchmark/` paths remain in code**

```bash
git grep -n "benchmark/" -- ':(exclude)docs/' ; echo "GREP=$?"
```
Expected: `GREP=1` (no matches). Any match outside `docs/` is a leftover to fix. (The string `benchmark.json` without a trailing slash is fine and won't match.)

- [ ] **Step 4: Confirm structure + history**

```bash
ls perf/ bench/
git log --follow --oneline -1 -- perf/searchLogic.perf.ts   # should trace back through the rename
git status --short                                          # clean (no stray generated files staged)
```
Expected: `perf/` and `bench/` contain the files from the target layout; `--follow` shows history pre-rename; working tree clean (generated `bench/results`/`bench/plots` are git-ignored).

---

## Self-Review (completed during planning)

- **Spec coverage:** sibling folders (Tasks 2–3), deletions (Task 1), shared config + vite excludes (Tasks 2–3), script/runBench updates (Tasks 2–3), all comment-rot fixes incl. the 4 perfUtils-path refs and 5 `benchmark/` refs (Tasks 2–3), per-folder READMEs + main README + .gitignore (Task 4), every acceptance criterion (Task 5). ✅
- **Placeholder scan:** none — exact file contents and substring edits given; verification commands have explicit expected output. ✅
- **Consistency:** `vitest.shared.ts` export name `sharedBenchConfig` is used identically in both folder configs; include globs (`perf/**/*.perf.ts`, `bench/**/*.grid.bench.ts`) match the renamed files; `vite.config.ts` excludes both folders; `runBench.mjs` and `package.json` point at the new config paths. ✅
