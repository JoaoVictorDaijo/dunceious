# CI Pipeline — Phase 1: The Merge Gate

**Date:** 2026-06-30
**Status:** Approved (design)
**Branch:** `ci-pipeline`

## Context

`dunceious` is a frontend-only React 19 + TypeScript + Vite bioinformatics app
(MSA visualization). The goal of this program of work is to make every PR merge
properly tested by automated checks, then raise test coverage before deeper
changes are made.

The work is decomposed into **three phases**, each with its own
spec → plan → implementation → PR cycle:

1. **CI merge gate** (this spec) — a working, enforced CI pipeline that gates PRs
   on tests, type-checking, linting, and build.
2. **Benchmark/perf pipeline cleanup** — collapse the `bench/` + `benchmark/`
   folders into one, fix `.gitignore`, unify the two benchmark systems
   (`npm run bench` vs `npm run perf`), simplify the scripts.
3. **Test coverage uplift** — add coverage tooling, audit weak/low-quality
   areas, write more tests.

This document specifies **Phase 1 only**.

### Starting state (verified 2026-06-30)

| Gate          | Command            | Status                                              |
| ------------- | ------------------ | --------------------------------------------------- |
| Unit tests    | `npm test`         | ✅ Green — 295 tests / 18 files in ~0.6s            |
| Production build | `npm run build` | ✅ Green (note: Vite does **not** type-check)       |
| Type-check    | `tsc --noEmit`     | ❌ Red — 12 errors (10× TS7006, 2× TS7016)          |
| ESLint        | `eslint .`         | ❌ Red — 18 errors, 56 warnings                     |

Three pre-existing problems:

1. **The CI workflow is broken.** [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)
   contains committed git merge-conflict markers (`<<<<<<<` / `=======` /
   `>>>>>>>`), making it invalid YAML — CI effectively does not run.
2. **Type-checking was never gated.** The old workflow only ran `npm test`,
   never `npm run lint`. The build passes because Vite transpiles without
   type-checking, so 12 type errors accumulated unnoticed.
3. **A `bench/` vs `benchmark/` naming mismatch** appears in two places (the CI
   benchmark step references a non-existent `benchmark/summarize.mjs`, and the
   ESLint Node-globals override targets the wrong folder). The CI benchmark
   handling is removed in Phase 1; the folder consolidation itself is Phase 2.

## Decisions

- **Gate strictness:** fix the currently-red type-check and lint first, then make
  the gate require all four checks. (Strongest guarantee before deeper changes.)
- **Trigger model:** `pull_request` (unprivileged, read-only context). The CI
  needs no secrets, so this is the safe default. Same-repo branches (including
  Copilot's `copilot/*` branches) run automatically; first-time fork
  contributors get GitHub's one-click approval. Replaces the privileged
  `pull_request_target` + same-repo guard, under which fork PRs got **no** CI.
- **Benchmarks:** out of the blocking gate. They are a local/CI-artifact perf
  tool, slow (300s timeout) and noisy on shared runners. All benchmark-in-CI
  decisions are deferred to Phase 2.
- **Workflow structure:** a single `ci` job running all gates as steps (one
  `npm ci`, one required status check). Chosen over parallel-jobs-per-gate
  (which would re-install deps 3–4× for sub-5s checks) and a Node-version matrix
  (YAGNI for a browser-targeted app).
- **Node version:** single version, Node 20 (LTS).

## Design

### 1. Workflow — `.github/workflows/ci.yml`

Replaces the broken file entirely.

- **Triggers:** `pull_request:` (all PRs) and `push: branches: [main]`.
- **Permissions:** `contents: read` (minimal).
- **Concurrency:** group keyed on the workflow + ref so superseded runs on the
  same PR are auto-cancelled.
- **Job `ci`** on `ubuntu-latest`:
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` with `node-version: '20'`, `cache: 'npm'`
  3. `npm ci`
  4. `npm run typecheck` — `if: ${{ !cancelled() }}`
  5. `npm run lint` — `if: ${{ !cancelled() }}`
  6. `npm test` — `if: ${{ !cancelled() }}`
  7. `npm run build` — `if: ${{ !cancelled() }}`

The `if: ${{ !cancelled() }}` on each gate means a failure in one step does not
skip the others, so a contributor sees every failure in a single run. The job
still fails if any gate fails.

Removed from the old file: `pull_request_target`, the same-repo `if:` guard, the
benchmark job, the `node benchmark/summarize.mjs` step, and the artifact upload.

### 2. Fix type-check (`tsc --noEmit` → exit 0)

- Add dev dependencies `@types/d3` and `@types/react-dom`.
  - `@types/react-dom` resolves the TS7016 for `react-dom/client` in
    [`index.tsx`](../../../index.tsx).
  - `@types/d3` resolves the TS7016 for `d3` and is expected to resolve the 10
    TS7006 implicit-`any` errors in
    [`components/GenomeViewer.tsx`](../../../components/GenomeViewer.tsx) (d3
    callback params get typed once d3 itself is typed).
- If any implicit-`any` params remain after installing `@types/d3`, add explicit
  type annotations at those call sites. No behavior changes — types only.
- **Acceptance:** `npm run typecheck` exits 0.

### 3. Fix ESLint (`eslint .` → exit 0)

- In [`eslint.config.js`](../../../eslint.config.js), correct the Node-script
  override: change the `files` glob from `benchmark/**/*.mjs` to `bench/**/*.mjs`
  (the actual location), and replace the single `process: 'readonly'` global with
  the full Node global set — the `globals` package's `globals.node` (add `globals`
  to `devDependencies` if it is not already resolvable as a transitive dep).
  This fixes all 16 `no-undef` errors in `bench/runBench.mjs`,
  `bench/summarize.mjs`, and `bench/visualize.mjs`.
- Fix the 2 `no-loss-of-precision` errors in
  [`bench/searchLogic.perf.bench.ts`](../../../bench/searchLogic.perf.bench.ts)
  by correcting the offending numeric literals.
- **Warnings stay warnings.** The 56 `max-lines` / `max-lines-per-function`
  warnings are intentionally deferred by the config's own comments to "Phase 2-3
  refactoring." `eslint .` exits 0 with warnings present, and CI will **not**
  pass `--max-warnings 0`.
- **Acceptance:** `npm run lint` exits 0.

### 4. npm scripts — split for granular CI feedback

In `package.json`:

- Add `"typecheck": "tsc --noEmit"`.
- Change `"lint"` from `"tsc --noEmit && eslint ."` to `"eslint ."`.

This lets CI report type errors and lint errors as independent steps (instead of
`&&` short-circuiting). Update the "Available Scripts" table in
[`README.md`](../../../README.md): `npm run lint` now means ESLint, and document
the new `npm run typecheck`.

### 5. Branch protection (GitHub repo setting)

Not a file in the repo — configured via the GitHub API. Documented here and
applied **only with the maintainer's explicit go-ahead** (requires admin):

- Require the `ci` status check to pass before merging to `main`.
- Require a pull request before merging to `main`.
- Require the branch to be up to date before merging.

The exact `gh api` command(s) will be provided in the implementation plan. The
maintainer runs them, or authorizes the assistant to run them, separately from
the code change.

## Acceptance criteria

- [ ] `.github/workflows/ci.yml` is valid YAML with no conflict markers.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` each exit 0
      locally.
- [ ] On a test PR, the `ci` check runs and passes.
- [ ] A fork PR triggers CI (after the one-time GitHub approval).
- [ ] Branch protection blocks merging to `main` while `ci` is red (once applied).
- [ ] README "Available Scripts" reflects the `typecheck` / `lint` split.

## Out of scope (later phases)

- `bench/` + `benchmark/` folder consolidation and the `.gitignore` path fix
  (Phase 2).
- Unifying the two benchmark systems — `npm run bench` (`vitest.bench.config.ts`)
  vs `npm run perf` (`vitest.perf.config.ts`) (Phase 2).
- Any benchmark automation in CI (Phase 2).
- Coverage tooling and coverage thresholds (Phase 3).
- The `max-lines` / `max-lines-per-function` refactors (deferred by the existing
  ESLint config; future phase).
