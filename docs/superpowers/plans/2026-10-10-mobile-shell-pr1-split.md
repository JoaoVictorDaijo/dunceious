# Mobile shell — PR 1: split the app into shared and desktop shells — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `src/app/` into `shared/` + `desktop/` + `shell/` with an extracted `useWorkspace()` hook and enforced boundaries, with **no behavior change**.

**Architecture:** Pure moves plus one hook extraction. Shared contracts leave component files first, then folders move, then `App.tsx` splits into `useWorkspace()` (shared wiring) and `DesktopApp` (desktop-only UI state), then `ShellRoot` lazy-loads `DesktopApp`, then three enforcement layers lock the boundaries in.

**Tech Stack:** React 19, TypeScript ~5.9, Vite, Vitest 4 + Testing Library, ESLint (typescript-eslint).

**Spec:** `docs/superpowers/specs/2026-10-10-mobile-shell-design.md` — sections "Architecture" (Folders, Contracts that move first, Import boundaries, `useWorkspace()`) and the PR 1 row of "Delivery". Later PRs get their own plans, written after this one merges.

## Global Constraints

- **No behavior change.** Every existing test passes unmodified except for import paths; the desktop looks identical (screenshot check in Task 6).
- Every new covered file starts with the project's AGPL header (copy from `vite.config.ts`); `npm run lint:headers` must pass.
- Commit types: `refactor(app): …` / `test(app): …` / `build: …` / `docs: …`; no version bump (bumps happen at promotion).
- Test runs: whole-suite runs use `npx vitest run --maxWorkers=25%`; single files run plain.
- Work in the worktree `.code/worktrees/mobile-shell/pr1` on branch `refactor/app-shells` off `develop`.
- `src/app/main.tsx`, `src/app/index.css`, `src/app/themes.css` and `src/app/testing/` stay where they are (entry, global styles, test harness).

## Review Focus

1. **Record removal during a running remote alignment** — still refused (`remoteAlignment.isLocked()`), and `onRecordRemoved` is not called. Pinned in Task 3.
2. **Leaving the page with records loaded** — the `beforeunload` prompt still fires after the guard moves into `useWorkspace`. Pinned in Task 3.
3. **Clearing a search** — clears the selection only if it is still the search-originated one, as today. Pinned in Task 3.
4. **Coverage gate after the move** — `vite.config.ts` `coverage.include` paths are rewritten so the ratchet thresholds still measure the same code. Checked in Task 2.
5. **First paint with the lazy root** — the page shows a fallback, then the desktop; no blank screen or thrown error if the chunk loads slowly. Pinned in Task 4.

---

### Task 1: Move shared contracts out of component files

**Files:**
- Create: `src/app/shared/types/search.ts` (`GroupedSearchResults`, moved from `components/SearchPanel.tsx:25`)
- Create: `src/app/shared/types/features.ts` (`FlatItem` from `components/AnnotationHubPanel.tsx:29`, `EditingFeatureState` from `components/FeatureEditorModal.tsx:35`)
- Modify: `components/SearchPanel.tsx`, `components/AnnotationHubPanel.tsx`, `components/FeatureEditorModal.tsx` (import the types instead of defining them; no re-export)
- Modify: `hooks/useFeatureManager.ts:22-23`, `hooks/useSearchWorker.ts:24`, `logic/searchState.ts:21`, `logic/featureManager.ts:22`, `components/__tests__/FeatureEditorModal.test.tsx`

**Interfaces:**
- Produces: `GroupedSearchResults` from `@/src/app/shared/types/search`; `FlatItem`, `EditingFeatureState` from `@/src/app/shared/types/features` — definitions byte-identical to today's.

- [ ] **Step 1: Capture the desktop baseline** before any change: run the scratch Playwright script (outside the repo) against `npm run dev` on `develop` at 1440×900 — empty workspace, then with `examples/influenza-a-pr8-8segments.gb` loaded, Annotation Hub tab, and a feature details modal open. Save 4 PNGs in the scratchpad as `baseline-*.png`.
- [ ] **Step 2: Move the three types** and repoint every importer (grep `GroupedSearchResults|FlatItem|EditingFeatureState` under `src/`).
- [ ] **Step 3: Verify** — `npm run typecheck` exits 0; `grep -rn "from '../components" src/app/hooks src/app/logic src/app/viewer` prints nothing; `npx vitest run --maxWorkers=25%` all green.
- [ ] **Step 4: Commit** — `refactor(app): move shared contracts out of component files`

### Task 2: Move folders into `shared/` and `desktop/`

**Files (all `git mv`, history preserved; tests move with their folders):**
- `src/app/hooks/` → `src/app/shared/hooks/`, **except** `useDraggableJobPill.ts` and `useFileDragActive.ts` (+ `__tests__/useFileDragActive.test.tsx`) → `src/app/desktop/hooks/`; split `hooks/index.ts` accordingly
- `src/app/logic/` → `src/app/shared/logic/`
- `src/app/lib/` → `src/app/shared/lib/`
- `src/app/viewer/` → `src/app/shared/viewer/`
- `src/app/recordRemoval.ts` → `src/app/shared/recordRemoval.ts`; `__tests__/recordRemoval.test.ts` → `src/app/shared/__tests__/`
- `src/app/components/` → `src/app/desktop/components/`
- `src/app/App.tsx` → `src/app/desktop/DesktopApp.tsx` (component renamed `DesktopApp`, default export); `__tests__/App.alignedAnnotations.test.tsx` and `__tests__/remoteAlignment.integration.test.tsx` → `src/app/desktop/__tests__/` (renamed `DesktopApp.*`)
- `__tests__/scrollbarStyles.test.ts` stays (it tests the global CSS)
- Modify: every import of the moved paths (`@/src/app/...` and relative), including `src/core/__tests__/rna.e2e.test.ts`; `src/app/main.tsx` imports `./desktop/DesktopApp`
- Modify: `vite.config.ts` `coverage.include` — `src/app/recordRemoval.ts` → `src/app/shared/recordRemoval.ts`, `src/app/viewer/layout.ts` → `src/app/shared/viewer/layout.ts`, `src/app/logic/**` → `src/app/shared/logic/**`

**Interfaces:**
- Produces: the folder layout of the spec's "Folders" section (minus `shell/`, `mobile/`, `shared/workspace/`).

- [ ] **Step 1: Move** with `git mv`, then fix imports mechanically (this step is suitable for a Haiku worker: it is search-and-replace with `npm run typecheck` as the oracle).
- [ ] **Step 2: Verify** — `npm run typecheck`, `npm run lint`, `npm run lint:headers` exit 0; `npx vitest run --maxWorkers=25%` green with the **same test count** as before the move (record both numbers in the commit body); `npx vitest run --coverage --maxWorkers=25%` passes the thresholds; `ls src/app` shows only `__tests__ desktop index.css main.tsx shared testing themes.css`.
- [ ] **Step 3: Commit** — `refactor(app): move app code into shared and desktop folders`

### Task 3: Extract `useWorkspace()`

**Files:**
- Create: `src/app/shared/workspace/useWorkspace.ts`
- Create: `src/app/shared/workspace/__tests__/useWorkspace.test.tsx`
- Modify: `src/app/desktop/DesktopApp.tsx` (consumes the hook; keeps only desktop UI state)

**Interfaces:**
- Produces:
  ```ts
  export interface WorkspaceOptions {
    onNavigateToViewer?: () => void;          // focusOn and selectSearchResult call it instead of setActiveTab('alignment')
    onRecordRemoved?: (recordId: string) => void; // after a successful removal only
  }
  export function useWorkspace(options?: WorkspaceOptions): Workspace;
  export type Workspace = ReturnType<typeof useWorkspace>;
  ```
  `Workspace` exposes, **under today's names in `App.tsx`**: `logs`, `addLog`; everything `useBioWorker`, `useFeatureManager`, `useSearchWorker` and `useFileHandlers` return today; `remoteAlignment`; `showAnnotations`/`showTranslation`/`showTracks`/`showConservation` + setters; `featureColors`, `setFeatureColors`; `activeSelection`, `setActiveSelection`; `selectSearchResult`, `handleClearSearch`; `focusedRegion`, `setFocusedRegion`, `pendingFocus`, `setPendingFocus`, `focusOn`; `removeRecord` (today's `handleRemoveRecord` minus the details-modal lines); `isAlignmentLoaded`, `alignmentLength`, `sessionMoleculeType`. The `beforeunload` effect lives inside the hook.
- Stays in `DesktopApp`: `sidebarOpen`, `activeTab`/`changeTab`, `hubFocus`, `showHubReturn`, both details-modal states, `viewingFeatureIndex`, `featureIndexOf`, `handleViewDetails`, `handleSetShowBases`, `dragMode`, `jumpTo`, `themeKey` + theme handlers, `envAccent`/`themeStyle`. `DesktopApp` passes `onNavigateToViewer: () => setActiveTab('alignment')` and an `onRecordRemoved` that closes the details modals when they show that record.

- [ ] **Step 1: Write the failing tests** in `useWorkspace.test.tsx` using the existing `@/src/app/testing/renderHarness` and the worker test doubles the hook tests already use:
  - `focusOn calls onNavigateToViewer and selects the target` — after `focusOn({ recordId: 'a', start: 10, end: 20, … })`: callback called once; `activeSelection` equals `{ start: 10, end: 20, recordIds: ['a'] }`; `pendingFocus` equals the target.
  - `selectSearchResult calls onNavigateToViewer` — callback called once; `activeSelection` is the passed selection.
  - `handleClearSearch clears only the search-originated selection` — select via `selectSearchResult`, clear → `activeSelection` null; select via `setActiveSelection` (manual), clear → unchanged.
  - `removeRecord removes the record and reports it` — with records `a`, `b`: `removeRecord('a')` → records `['b']`, `onRecordRemoved` called with `'a'` once.
  - `removeRecord is refused while a remote alignment is locked` — lock via the remote-alignment test double → records unchanged, `onRecordRemoved` not called.
  - `beforeunload is guarded only while records are loaded` — dispatch a cancelable `beforeunload` with no records → `defaultPrevented` false; after loading one record → true.
- [ ] **Step 2: Run** `npx vitest run src/app/shared/workspace` — FAIL (module not found).
- [ ] **Step 3: Implement** `useWorkspace` by moving the wiring out of `DesktopApp.tsx` (cut, don't rewrite: the hook body is today's `App.tsx` lines for the listed state and handlers, with `setActiveTab('alignment')` replaced by `options.onNavigateToViewer?.()`), then make `DesktopApp` consume it.
- [ ] **Step 4: Run** `npx vitest run src/app/shared/workspace` — PASS; then `npm run typecheck` and `npx vitest run --maxWorkers=25%` — green, including both `desktop/__tests__/DesktopApp.*` files unmodified apart from paths.
- [ ] **Step 5: Commit** — `refactor(app): extract the shared workspace hook`

### Task 4: Add `ShellRoot` with a lazy desktop root

**Files:**
- Create: `src/app/shell/ShellRoot.tsx`
- Create: `src/app/shell/__tests__/ShellRoot.test.tsx`
- Modify: `src/app/main.tsx` (renders `<ShellRoot />` instead of the app)

**Interfaces:**
- Produces: `export default function ShellRoot(): JSX.Element` — `const DesktopApp = React.lazy(() => import('../desktop/DesktopApp'))`, rendered inside `<Suspense fallback={<ShellFallback />}>`. `ShellFallback` is a full-height `bg-slate-900` div with the `fa-dna` icon pulsing and the visually hidden text "Loading Dunceious…". PR 3 adds the mobile branch; nothing here reads the device yet.

- [ ] **Step 1: Write the failing tests** — `renders the fallback first, then the desktop app` (render `ShellRoot`; `getByText('Loading Dunceious…')` present; then `await findByText('Workspace Empty')`; fallback gone).
- [ ] **Step 2: Run** `npx vitest run src/app/shell` — FAIL.
- [ ] **Step 3: Implement** `ShellRoot` and switch `main.tsx`.
- [ ] **Step 4: Run** the shell test — PASS; `npm run build` exits 0 and `dist/assets/` contains a separate `DesktopApp-*.js` chunk.
- [ ] **Step 5: Commit** — `refactor(app): mount the desktop app through a lazy shell root`

### Task 5: Enforce the boundaries

**Files:**
- Modify: `eslint.config.js` (three new blocks after the existing layer rules, same `no-restricted-imports` pattern style, tests exempt)
- Create: `src/app/__tests__/importGraph.ts`, `src/app/__tests__/boundaries.test.ts` + `src/app/__tests__/fixtures/boundaries/*.ts` (fixture snippets, read as text, never compiled into the app)
- Create: `scripts/shellIsolation.mjs` (pure checker) + `scripts/__tests__/shellIsolation.test.ts`
- Modify: `vite.config.ts` (plugin calling the checker in `generateBundle`)

**Interfaces:**
- Produces: `export function checkImports(files: { path: string; source: string }[]): string[]` in `src/app/__tests__/importGraph.ts` — returns violation messages; rules are applied by each file's `path` (fixtures pass a virtual path such as `src/app/shell/ShellRoot.tsx`), and it parses with the TypeScript compiler API, collecting static imports, `export … from`, type-only imports and `import()` calls.
- Produces: `export function checkShellIsolation(bundle: Record<string, { type: 'chunk' | 'asset'; isEntry?: boolean; facadeModuleId?: string | null; moduleIds?: string[]; imports?: string[] }>): string[]` in `scripts/shellIsolation.mjs`. Graphs per the spec ("A build check"): startup graph (entry + static imports, transitively) has no `src/app/desktop/` or `src/app/mobile/` module; desktop graph (from the chunk whose `facadeModuleId` ends with `src/app/desktop/DesktopApp.tsx`) has no `src/app/mobile/` module; mobile graph likewise without `src/app/desktop/`. A root chunk that does not exist yet (mobile in PR 1) is skipped, not an error.

ESLint rules (files → forbidden): `src/app/shared/**` → `desktop`, `mobile`, `shell`; `src/app/desktop/**` → `mobile`, `shell`; `src/app/mobile/**` → `desktop`, `shell`; `src/app/shell/**` → `desktop`, `mobile` (static). Patterns cover `@/src/app/<x>/**` and relative `**/<x>/**` forms, as the existing rules do.

- [ ] **Step 1: Write the failing tests:**
  - `boundaries.test.ts`: `the real app has no violations` (all `src/app/**/*.{ts,tsx}` except tests/fixtures → `[]`); fixtures each yield exactly one violation: `shared-imports-desktop.ts` (static), `desktop-imports-mobile-type.ts` (`import type`), `shell-dynamic-non-root.ts` (`import('../mobile/screens/Map')`), `shell-eager-root.ts` (`const p = import('../desktop/DesktopApp')` outside `React.lazy`); and `shell-lazy-roots.ts` (both allowed lazy roots) yields `[]`.
  - `shellIsolation.test.ts`: a synthetic bundle where a desktop-reachable chunk lists `src/app/mobile/screens/Map.tsx` in `moduleIds` → one violation naming that module; a clean bundle → `[]`; a bundle with no mobile root → `[]`.
- [ ] **Step 2: Run** both test files — FAIL.
- [ ] **Step 3: Implement** the checkers, the ESLint blocks, and the Vite plugin (`apply: 'build'`; on violations `this.error(violations.join('\n'))`).
- [ ] **Step 4: Verify** — both test files PASS; `npm run lint` exits 0; `npm run build` exits 0; temporarily add `import '@/src/app/desktop/DesktopApp'` to a `shared/` file → `npm run lint` fails with the layer message (revert).
- [ ] **Step 5: Commit** — `build: enforce the shared, desktop and shell boundaries`

### Task 6: Document and verify no visible change

**Files:**
- Modify: `ARCHITECTURE.md` §2 (folder tree + layer rules: add the `shared/desktop/mobile/shell` sub-layout and the three enforcement layers), §2 "Extension rules" (new UI component → `src/app/desktop/components/` or `src/app/mobile/`; shared logic → `src/app/shared/`), §5 (`App.tsx` → `ShellRoot` + `DesktopApp` + `useWorkspace`)
- Modify: `.claude/skills/dunceious-architecture/SKILL.md` (same pointers, if it names paths)

- [ ] **Step 1: Update the docs.**
- [ ] **Step 2: Screenshot check** — rerun Task 1 Step 1's script on this branch; compare against `baseline-*.png` with a pixel diff (e.g. `pixelmatch`/ImageMagick `compare -metric AE`); expected 0 differing pixels outside the StatusBar version text. Note the result in the PR body.
- [ ] **Step 3: Final verification** — `npm run typecheck && npm run lint && npm run lint:headers && npm run build` exit 0; `npx vitest run --maxWorkers=25%` green.
- [ ] **Step 4: Commit** — `docs: describe the shared, desktop and shell layout`
