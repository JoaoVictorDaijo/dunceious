# CI Pipeline — Phase 1 (Merge Gate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `ci.yml` with a working `pull_request`-triggered CI that gates every PR on type-check + lint + test + build, and make those four checks green from day one.

**Architecture:** Three small "make-it-green" tasks (type-check, lint, npm scripts) land first so the gate has something green to enforce; then the workflow file is written to call those scripts; then branch protection and an end-to-end PR verification. This is a verification-driven plan: for the type/lint fixes the "test" is running the actual tool (`tsc --noEmit`, `eslint .`) and watching it go RED → GREEN.

**Tech Stack:** GitHub Actions, Node 20, Vite 6, Vitest 4, TypeScript 5.9, ESLint 10 (flat config), typescript-eslint 8.

**Spec:** [`docs/superpowers/specs/2026-06-30-ci-pipeline-phase1-design.md`](../specs/2026-06-30-ci-pipeline-phase1-design.md)

---

## Working context (read before starting)

- **Branch:** all work happens on `ci-pipeline` (already created off `main`). Do **not** switch branches.
- **Do NOT `git add -A` or `git add .`** — the untracked `benchmark/` folder must stay out of every commit (it's a generated artifact handled in Phase 2). Always `git add <explicit paths>`.
- **Commit trailer:** end every commit message with:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **rtk note:** this repo proxies `eslint`/`tsc` through `rtk`, which summarizes output and can mangle exit codes when piped. To see a true exit code, run the bare command and check `$?` on its own line (no pipe). To see raw eslint output, use `rtk proxy npx eslint ...`.

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `package.json` | Add `@types/d3`, `@types/react-dom`, `globals` dev deps; split `lint`/`typecheck` scripts | Modify |
| `components/GenomeViewer.tsx` | Annotate any d3 callback params that remain implicit-`any` after `@types/d3` is installed | Modify (only if needed) |
| `eslint.config.js` | Fix Node-globals override (`bench/**/*.mjs` + `globals.node`) | Modify |
| `bench/searchLogic.perf.bench.ts` | Replace precision-losing LCG constants | Modify |
| `README.md` | Document `typecheck` script, redefine `lint` row | Modify |
| `.github/workflows/ci.yml` | The new CI workflow (replaces the conflict-marker file) | Overwrite |

---

## Task 1: Make `tsc --noEmit` green (type-check)

**Files:**
- Modify: `package.json` (devDependencies)
- Modify (only if needed): `components/GenomeViewer.tsx`

- [ ] **Step 1: Confirm the failing state**

Run: `npx tsc --noEmit ; echo "EXIT=$?"`
Expected: `EXIT=2`, with 12 errors — 2× TS7016 (`d3` in `components/GenomeViewer.tsx`, `react-dom/client` in `index.tsx`) and 10× TS7006 (implicit-`any` params in `components/GenomeViewer.tsx` at lines 72, 98, 99, 645, 646, 762, 1496, 1511, 1514, 1534).

- [ ] **Step 2: Install the missing type packages**

Run: `npm install -D @types/d3 @types/react-dom`
Expected: `package.json` `devDependencies` now lists `@types/d3` and `@types/react-dom`; `package-lock.json` updated.

- [ ] **Step 3: Re-run the type-checker and read what remains**

Run: `npx tsc --noEmit ; echo "EXIT=$?"`
Expected: the 2× TS7016 are gone. Most/all of the TS7006 are gone too (once `d3` is typed, `.data(number[])` callbacks and similar infer their params). Note any remaining errors with their `file(line,col)`.

- [ ] **Step 4: Annotate any residual implicit-`any` params**

For each remaining TS7006 in `components/GenomeViewer.tsx`, add an explicit type. The most likely survivor is the axis tick formatter at line 72:

```tsx
// before:
.tickFormat(d => d.toLocaleString())
// after (NumberValue from @types/d3 has no toLocaleString; coerce):
.tickFormat((d) => Number(d).toLocaleString())
```

For `.data(...).append(...).attr('x1', d => ...)` chains, the datum is already typed by the `.data()` argument — if one still errors, annotate it to match that array's element type (e.g. `(d: number) => ...`). For DOM/d3 event handlers (`event => ...`), annotate the parameter with the type TypeScript reports it expects (hover / read the d3 method signature); do **not** widen to `any`. These are type-only edits — no runtime behavior changes.

- [ ] **Step 5: Verify green**

Run: `npx tsc --noEmit ; echo "EXIT=$?"`
Expected: `EXIT=0`, no output.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json components/GenomeViewer.tsx
git commit -m "fix(types): install @types/d3 and @types/react-dom; resolve implicit-any

Adds the two missing @types packages and annotates any residual d3 callback
params so \`tsc --noEmit\` passes. Type-only; no runtime change.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(If Step 4 made no edits to `GenomeViewer.tsx`, drop it from the `git add`.)

---

## Task 2: Make `eslint .` green (lint config + perf literals)

**Files:**
- Modify: `package.json` (add `globals` dev dep)
- Modify: `eslint.config.js`
- Modify: `bench/searchLogic.perf.bench.ts`

- [ ] **Step 1: Confirm the failing state**

Run: `npx eslint . > /dev/null 2>&1 ; echo "EXIT=$?"`
Expected: `EXIT=1` (18 errors: 16× `no-undef` in the three `bench/*.mjs` scripts, 2× `no-loss-of-precision` in `bench/searchLogic.perf.bench.ts`; plus 56 warnings, which are fine).

- [ ] **Step 2: Install `globals`**

Run: `npm install -D globals`
Expected: `globals` appears in `package.json` `devDependencies`.

- [ ] **Step 3: Fix the ESLint Node-globals override**

In `eslint.config.js`, add the import at the top (next to the existing imports):

```js
import globals from 'globals';
```

Then replace the bench-scripts override block. Change this:

```js
  {
    // Plain Node.js scripts in the benchmark directory are not TypeScript and
    // need access to Node.js globals (process, etc.).
    files: ['benchmark/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
      },
    },
  },
```

to this:

```js
  {
    // Plain Node.js scripts in the bench directory are not TypeScript and
    // need access to the full set of Node.js globals (process, console,
    // URL, Buffer, etc.).
    files: ['bench/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
```

(The fix is two-fold: the glob was pointing at the non-existent `benchmark/` folder instead of `bench/`, and only `process` was declared.)

- [ ] **Step 4: Fix the precision-losing constants**

In `bench/searchLogic.perf.bench.ts`, line 58 inside `makeIupacQuery`, replace the 64-bit LCG constants (which exceed `Number.MAX_SAFE_INTEGER`) with the safe 32-bit constants already used by `makeDna`. Change:

```ts
    s = (s * 6364136223846793005 + 1442695040888963407) & 0x7fffffff;
```

to:

```ts
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
```

This keeps `makeIupacQuery` a deterministic pseudo-random generator (the exact sequence changes, but nothing asserts on specific values — it only generates benchmark input).

- [ ] **Step 5: Verify green**

Run: `npx eslint . > /dev/null 2>&1 ; echo "EXIT=$?"`
Expected: `EXIT=0` (warnings may still print to stderr in a non-suppressed run; only the exit code matters).

Also confirm the warning count is unchanged-ish and there are **zero errors**:
Run: `rtk proxy npx eslint . 2>&1 | tail -3`
Expected: a summary line showing `0 errors` (warnings allowed).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json eslint.config.js bench/searchLogic.perf.bench.ts
git commit -m "fix(lint): correct bench Node-globals glob and precision-safe LCG constants

Points the ESLint Node-globals override at bench/ (was benchmark/) and uses
globals.node, fixing 16 no-undef errors in the bench scripts. Replaces two
64-bit LCG constants that exceeded Number.MAX_SAFE_INTEGER with the safe
32-bit constants makeDna already uses, fixing 2 no-loss-of-precision errors.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Split npm scripts + update README

**Files:**
- Modify: `package.json` (scripts)
- Modify: `README.md`

- [ ] **Step 1: Split the scripts**

In `package.json`, change the `scripts` block. Replace:

```json
    "lint": "tsc --noEmit && eslint .",
```

with:

```json
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
```

- [ ] **Step 2: Verify both scripts work and exit 0**

Run: `npm run typecheck ; echo "TYPECHECK=$?"`
Expected: `TYPECHECK=0`.
Run: `npm run lint > /dev/null 2>&1 ; echo "LINT=$?"`
Expected: `LINT=0`.

- [ ] **Step 3: Update the README Available Scripts table**

In `README.md`, replace the `npm run lint` row:

```
| `npm run lint`    | Run the TypeScript type-checker (`tsc --noEmit`) — no output means no errors                                                                          |
```

with these two rows (keep the table in the same order — put `typecheck` directly above `lint`):

```
| `npm run typecheck` | Type-check the codebase with `tsc --noEmit` — no output means no type errors                                                                        |
| `npm run lint`      | Run ESLint over the codebase (`eslint .`)                                                                                                            |
```

- [ ] **Step 4: Commit**

```bash
git add package.json README.md
git commit -m "chore: split lint into typecheck + lint scripts

Separates tsc --noEmit (typecheck) from eslint . (lint) so CI can report
type errors and lint errors as independent steps instead of && short-circuiting.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Write the CI workflow

**Files:**
- Overwrite: `.github/workflows/ci.yml`

- [ ] **Step 1: Confirm the current file is broken**

Run: `grep -n '<<<<<<<\|=======\|>>>>>>>' .github/workflows/ci.yml ; echo "EXIT=$?"`
Expected: matches found (conflict markers), `EXIT=0`.

- [ ] **Step 2: Overwrite the workflow with the clean definition**

Replace the **entire** contents of `.github/workflows/ci.yml` with:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

# Cancel superseded runs on the same ref (e.g. successive pushes to a PR).
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      # Each gate runs even if an earlier one fails, so a single CI run
      # surfaces every failure at once. The job still fails if any gate fails.
      - name: Type-check
        if: ${{ !cancelled() }}
        run: npm run typecheck

      - name: Lint
        if: ${{ !cancelled() }}
        run: npm run lint

      - name: Test
        if: ${{ !cancelled() }}
        run: npm test

      - name: Build
        if: ${{ !cancelled() }}
        run: npm run build
```

- [ ] **Step 3: Verify there are no conflict markers and the YAML parses**

Run: `grep -n '<<<<<<<\|=======\|>>>>>>>' .github/workflows/ci.yml ; echo "EXIT=$?"`
Expected: no matches, `EXIT=1`.
Run: `node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/ci.yml','utf8');console.log('lines:',s.split('\n').length); if(/<<<<<<<|>>>>>>>/.test(s)) throw new Error('markers');"`
Expected: prints a line count, no throw. (If `js-yaml` or `yaml` is available you may additionally parse it; not required.)

- [ ] **Step 4: Dry-run every gate locally exactly as CI will**

Run each and confirm exit 0:
```bash
npm run typecheck ; echo "TYPECHECK=$?"
npm run lint > /dev/null 2>&1 ; echo "LINT=$?"
npm test ; echo "TEST=$?"
npm run build ; echo "BUILD=$?"
```
Expected: `TYPECHECK=0`, `LINT=0`, `TEST=0` (295 tests pass), `BUILD=0`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: replace broken workflow with pull_request gate (test/typecheck/lint/build)

Removes the committed merge-conflict markers and the privileged
pull_request_target trigger. New workflow runs on pull_request + push to
main, requires type-check + lint + test + build, and uses an unprivileged
read-only context (no secrets needed). Benchmarks are intentionally not
part of the gate (deferred to Phase 2).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Branch protection (run only with the maintainer's explicit go-ahead)

**Files:** none — this is a GitHub repo setting applied via the API. Requires repo **admin**. The required status-check context name will be **`ci`** (the job id, since the job has no `name:`).

- [ ] **Step 1: Confirm `gh` is authenticated as a repo admin**

Run: `gh auth status` and `gh api repos/JoaoVictorDaijo/dunceious --jq '.permissions'`
Expected: authenticated; `admin: true`.

- [ ] **Step 2: Ask the maintainer for explicit approval before mutating the repo**

This changes the live GitHub repository. Do not run Step 3 until the maintainer says go. (Recommended timing: after Task 6 confirms the `ci` check has run green once, so the context exists and is selectable in the UI too.)

- [ ] **Step 3: Apply branch protection on `main`**

```bash
gh api -X PUT repos/JoaoVictorDaijo/dunceious/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["ci"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

This requires: the `ci` check to pass (and the branch to be up to date — `strict: true`), and a pull request before merging (0 required approvals so a solo maintainer isn't blocked). `enforce_admins: false` leaves an admin escape hatch for emergencies.

- [ ] **Step 4: Verify protection is active**

Run: `gh api repos/JoaoVictorDaijo/dunceious/branches/main/protection --jq '{checks: .required_status_checks.contexts, strict: .required_status_checks.strict, pr: .required_pull_request_reviews}'`
Expected: `checks: ["ci"]`, `strict: true`, a non-null `pr` object.

---

## Task 6: End-to-end verification via a real PR (push requires maintainer go-ahead)

**Files:** none — exercises the workflow on GitHub.

- [ ] **Step 1: Push the branch (ask before the first push)**

Pushing is an outward action. With the maintainer's OK:
```bash
git push -u origin ci-pipeline
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base main --head ci-pipeline \
  --title "CI: working PR merge gate (test + typecheck + lint + build)" \
  --body "Phase 1 of the CI program. Replaces the broken ci.yml with a pull_request-triggered gate and fixes the previously-red typecheck and eslint so all four checks are green. See docs/superpowers/specs/2026-06-30-ci-pipeline-phase1-design.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 3: Watch the checks**

Run: `gh pr checks ci-pipeline --watch`
Expected: a single check named **`ci`** completes **green**. (For same-repo branches it runs automatically — no approval needed.)

- [ ] **Step 4: Confirm the gate blocks red (optional sanity check)**

Optionally verify the gate has teeth: this is implicitly proven once branch protection (Task 5) is on and the `ci` check is required — GitHub will mark the PR "merge blocked" until `ci` is green. No separate failing commit is required.

- [ ] **Step 5: Report status to the maintainer**

Summarize: PR URL, the `ci` check result, and whether branch protection is applied. Hand off the merge decision to the maintainer.

---

## Self-Review (completed during planning)

- **Spec coverage:** Workflow (§Design.1 → Task 4), type-check fix (§Design.2 → Task 1), eslint fix (§Design.3 → Task 2), script split + README (§Design.4 → Task 3), branch protection (§Design.5 → Task 5), acceptance criteria (→ Tasks 4 Step 4 & Task 6). Out-of-scope items are not tasked. ✅
- **Placeholders:** none — every code step shows exact content; the only deliberately conditional step (Task 1 Step 4 residual annotations) is a verify-then-fix loop with concrete patterns and exact candidate line numbers, which is the honest shape of a library-inference type fix. ✅
- **Type/name consistency:** the required status-check context is `ci` everywhere (job id with no `name:`); script names `typecheck`/`lint` are consistent across Tasks 3, 4, 6 and the workflow. ✅
```
