# Benchmark/Perf Pipeline Cleanup — Phase 2

**Date:** 2026-06-30
**Status:** Approved (design)
**Branch:** `bench-cleanup`

## Context

Phase 2 of a three-phase program (Phase 1 = CI merge gate, merged in PR #37;
Phase 3 = test coverage uplift). This phase reorganizes the benchmarking code so
the two distinct systems are cleanly separated, removes dead code, and fixes
stale `benchmark/` path references — making the pipeline straightforward.

### Starting state (verified 2026-06-30)

Everything currently lives flat in one `bench/` folder, but it actually contains
**two unrelated systems** with **no shared code** between them and **no consumers
outside `bench/`**:

1. **Performance regression guardrails** (`npm run perf`, `vitest.perf.config.ts`):
   four assertion-based micro-benchmark files, each pinned to one source module,
   all using `perfUtils.bench()` (median/p95 + GC-aware memory, *relative* budget
   assertions). Console output only, no artifacts.
   - `bench/searchLogic.perf.bench.ts` → `services/searchLogic`
   - `bench/bioUtils.perf.bench.ts` → `services/bioUtils`
   - `bench/parseGenBank.perf.bench.ts` → `services/genbank`
   - `bench/grid2d.perf.bench.ts` → `src/domain/bio`
   - shared helper: `bench/perfUtils.ts`

2. **Data-collection grid** (`npm run bench` / `npm run plot`,
   `vitest.bench.config.ts`): the GenBank parse-time grid (seqLength × numRecords).
   `genbank.bench.test.ts` spawns per-replicate child processes
   (`measureGenBank.ts` + `syntheticGenbank.ts`), writes `bench/results/benchmark.json`,
   and renders SVG plots via `visualize.mjs` (432 lines). Exploratory analysis
   tool; not a pass/fail gate.
   - orchestrator/CLI: `bench/genbank.bench.test.ts`, `bench/runBench.mjs`
   - helpers: `bench/measureGenBank.ts`, `bench/syntheticGenbank.ts`
   - plotter: `bench/visualize.mjs`

### Problems

- **Dead code:** `bench/summarize.mjs` (45 lines) — its only caller was the CI
  benchmark step removed in Phase 1, and it reads the wrong path
  (`benchmark/results/`).
- **Stale artifact:** an untracked `benchmark/` folder containing one April-dated
  `results/benchmark.json` from an old layout. The current code already writes to
  `bench/results/` (git-ignored); `benchmark/` is leftover and creates the false
  impression of "two folders."
- **Comment rot:** `benchmark/` path references in `genbank.bench.test.ts:36`,
  `visualize.mjs:4` and `:429`, `summarize.mjs` (deleted), and the `.gitignore`
  "uploaded as CI artifact" comment (no longer true). Also, all three perf
  headers point readers to `src/__tests__/perfUtils.ts` for methodology — that
  file does not exist; it is `perfUtils.ts`.
- **No separation:** the two systems are stacked flat in one folder, with no
  structural signal that they are different tools.

## Decisions

- **Keep both systems**, reorganized — no changes to what they measure or to
  assertion thresholds. Pure reorganization + cleanup.
- **Separate into sibling top-level folders**: `perf/` (guardrails) and `bench/`
  (data grid). Folder names match the npm scripts (`perf`↔`perf`, `bench`↔`bench`).
- **Full clarity incl. renames**: perf files become `*.perf.ts`; the grid test
  becomes `genbank.grid.bench.ts`.
- **Shared vitest base**: a tiny root `vitest.shared.ts` holds the ~8 common
  config lines; each folder has its own thin `vitest.config.ts`.
- **Imports unchanged**: `perf/` and `bench/` are both one level below the repo
  root (same depth as today's `bench/`), so the `../services/...`, `../src/...`,
  and `../types` relative imports in moved files stay valid — no rewrites.

## Design

### 1. Target layout

```
perf/                         # performance regression guardrails (npm run perf)
  searchLogic.perf.ts         # git mv from bench/searchLogic.perf.bench.ts
  bioUtils.perf.ts            # git mv from bench/bioUtils.perf.bench.ts
  parseGenBank.perf.ts        # git mv from bench/parseGenBank.perf.bench.ts
  grid2d.perf.ts              # git mv from bench/grid2d.perf.bench.ts
  perfUtils.ts                # git mv from bench/perfUtils.ts
  vitest.config.ts            # from vitest.perf.config.ts; include: perf/**/*.perf.ts
  README.md                   # purpose + how to run

bench/                        # data-collection grid + plots (npm run bench / plot)
  genbank.grid.bench.ts       # git mv from bench/genbank.bench.test.ts
  measureGenBank.ts           # unchanged
  syntheticGenbank.ts         # unchanged
  visualize.mjs               # unchanged code; comment fixes only
  runBench.mjs                # point --config at bench/vitest.config.ts
  vitest.config.ts            # from vitest.bench.config.ts; include: bench/**/*.grid.bench.ts
  README.md                   # purpose + how to run
  results/ plots/             # generated at runtime, git-ignored (unchanged)
```

All file relocations use `git mv` to preserve history.

### 2. Deletions

- `bench/summarize.mjs` — dead code, wrong path.
- `benchmark/` — stale untracked artifact folder (`rm -rf benchmark/`).

### 3. Configs

- New root `vitest.shared.ts` exporting the common config object: `plugins:
  [react()]`, `resolve.alias` `@` → repo root, `test.environment: 'node'`,
  `test.execArgv: ['--expose-gc']`.
- `perf/vitest.config.ts`: spreads the shared base, sets
  `test.include: ['perf/**/*.perf.ts']`.
- `bench/vitest.config.ts`: spreads the shared base, sets
  `test.include: ['bench/**/*.grid.bench.ts']` and `test.testTimeout: 300000`.
- `vite.config.ts`: change `test.exclude` to
  `['perf/**', 'bench/**', '**/node_modules/**']` (replaces the stale
  `**/*.bench.ts` / `**/*.bench.test.ts` globs so `npm test` keeps excluding both
  pipelines).

### 4. Script + reference updates

- `package.json`:
  - `perf`: `node --expose-gc node_modules/.bin/vitest run --config perf/vitest.config.ts`
  - `bench`: `node bench/runBench.mjs` (unchanged)
  - `plot`: `node bench/visualize.mjs` (unchanged)
- `bench/runBench.mjs`: change its vitest `--config` argument from
  `vitest.bench.config.ts` to `bench/vitest.config.ts`.
- `bench/genbank.grid.bench.ts`: the `await import('./visualize.mjs')` stays
  correct (both remain in `bench/`).

### 5. Comment-rot fixes

- `bench/genbank.grid.bench.ts:36`, `bench/visualize.mjs:4` & `:429`:
  `benchmark/results/...` → `bench/results/...` (and `node benchmark/visualize.mjs`
  → `node bench/visualize.mjs`).
- The three perf headers' "see `src/__tests__/perfUtils.ts`" → `perf/perfUtils.ts`.
- `.gitignore`: update the "Benchmark files generated at runtime; uploaded as CI
  artifact" comment — they are no longer a CI artifact (benchmarks are not in CI).

### 6. Docs

- New `perf/README.md`: what the guardrails cover (the four modules) and how to
  run (`npm run perf`); note it is regression budgets, not a CI gate.
- New `bench/README.md`: what the grid measures (seqLength × numRecords),
  `npm run bench` / `npm run plot`, and that output goes to git-ignored
  `bench/results/` + `bench/plots/`.
- Main `README.md` "Available Scripts": update the `perf`, `bench`, and `plot`
  rows to reflect the new folder/intent (and the `perf/` vs `bench/` split).

## Acceptance criteria

- [ ] `npm run perf` runs the four `perf/*.perf.ts` guardrail files and passes.
- [ ] `npm run bench` produces `bench/results/benchmark.json` and
      `bench/plots/*.svg`.
- [ ] `npm run plot` regenerates plots from an existing results file.
- [ ] `npm test` still passes 295 tests and excludes both `perf/` and `bench/`.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` each exit 0.
- [ ] `git grep benchmark/` finds no stale path references in tracked code
      (docs/specs describing history excepted).
- [ ] `bench/summarize.mjs` and the `benchmark/` folder no longer exist.
- [ ] File history preserved (moves done via `git mv`).

## Out of scope

- Phase 3: test coverage tooling and new tests.
- Any change to what the benchmarks measure, their inputs, or assertion
  thresholds (this is reorganization only).
- Adding benchmarks to CI (a possible future decision; not this phase).
