# Mobile shell — design

**Date:** 2026-10-10 · **Branch:** `docs/mobile-shell-spec` (off `develop`) · **Status:** draft, awaiting review

Dunceious is desktop-only today. On a 390×844 phone the sidebar takes ~80% of the width and the
viewer is ~50 px wide, and every interaction (pan, drag-select, minimap, ctrl+wheel zoom, hover
tooltips) is mouse-only. This design adds a **separate mobile UI** on the same engine, without
touching the desktop UI's markup.

Prototypes (11 phone screens, clickable): <https://claude.ai/artifact/B9AAXtGvC88hJb3AV4PXcU>,
rows "Option A". Row "Option B" (greeter only) was considered and not chosen.

## Decisions locked in

| Decision | Ruling |
| --- | --- |
| Direction | **Option A** — a real mobile reader, not only a greeter page |
| Code structure | **Adaptive, not responsive:** two UIs (`desktop/`, `mobile/`) over one shared layer; neither imports the other |
| Version choice | Picked **once at load**; phones get mobile, everything else (tablets included) desktop; manual override, remembered per device |
| URL | Unchanged — `dunceious.pages.dev` serves both; each UI is a lazy chunk |
| Landscape base-level viewer | **Shared:** the existing `GenomeViewer` moves to `shared/` and gains pointer events + pinch zoom; mobile mounts it in a compact frame |
| Mobile write actions (v1) | **Light:** annotate from a selection or search hit (name, type, strand), remove records, export. Full feature editor and remote EMBL-EBI alignment stay desktop-only |
| Desktop empty state | Unchanged ("Workspace Empty"); a desktop landing page is out of scope |
| Visual language | Existing slate palette, environment accent and fonts; no second palette. Theme picker stays desktop-only in v1 |

## Goals and non-goals

**Goals**
- A visitor on a phone can open an example or their own GenBank/FASTA file and: see the genome map,
  open a feature, read the sequence with translation, search a motif, see where aligned sequences
  differ, and export.
- The desktop UI's files carry no mobile branches. The only desktop-visible changes are the PR 1
  file moves (no behavior change) and the PR 2 viewer input upgrade (touch now works; mouse
  behavior identical).

**Non-goals (v1)**
- Feature parity: no mobile feature editor (qualifiers, joins, circular features), no remote
  alignment, no BED quantitative tracks on mobile, no theme picker.
- Offline/PWA install.
- A desktop landing page.

## Architecture

### Folders

```
src/app/
  shared/
    workspace/useWorkspace.ts   ← the state wiring App.tsx owns today (see below)
    hooks/                      ← useBioWorker, useSearchWorker, useFeatureManager, useFileHandlers,
                                  useRemoteAlignment, useAppLogger (moved, not rewritten)
    logic/                      ← today's app/logic/ (theme, viewModel, focusTarget, upload, …)
    viewer/                     ← today's app/viewer/ (GenomeViewer, Row, tracks, layout, colors, cds…)
    recordRemoval.ts
  desktop/
    DesktopApp.tsx              ← today's App.tsx render + desktop-only UI state
    components/                 ← today's app/components/ (Sidebar, TopNav, hub, modals, …)
  mobile/
    MobileApp.tsx
    screens/  sheets/  components/  logic/
  shell/
    pickShell.ts                ← the version rule + override (pure, tested)
    ShellRoot.tsx               ← lazy-loads DesktopApp or MobileApp
main.tsx                        ← renders ShellRoot
```

Paths inside `shared/` mirror today's `app/` so the move is mechanical. Tests move with their files.

### Import boundaries (ESLint)

Extend the existing layer rules in `eslint.config.js` (same `no-restricted-imports` pattern
style, tests exempt):

- `src/app/shared/**` may not import `desktop/`, `mobile/` or `shell/`.
- `src/app/desktop/**` may not import `mobile/`; `src/app/mobile/**` may not import `desktop/`.
- `src/app/shell/**` may import `desktop/` and `mobile/` **only** through `React.lazy(() => import(...))`
  of their root components (one entry each), so the chunks stay separate.

The domain ← core ← workers ← app rules are unchanged; `shared/`, `desktop/`, `mobile/` and
`shell/` are all inside the `app` layer. `ARCHITECTURE.md` and the `dunceious-architecture`
skill pointer get the new sub-layout.

### `useWorkspace()`

`App.tsx` is already a composition root: logic lives in hooks, and `App` wires them together. The
wiring that both UIs need moves into `useWorkspace()`; what only the desktop UI needs stays in
`DesktopApp`.

| Moves to `useWorkspace()` (shared) | Stays in `DesktopApp` |
| --- | --- |
| logger; `useBioWorker` (records, transposed records, consensus, processing); `useRemoteAlignment`; `useFeatureManager`; `useSearchWorker`; `useFileHandlers` | `sidebarOpen`, `activeTab` / `changeTab`, `hubFocus`, `showHubReturn` |
| active selection, search-selection ref, `selectSearchResult`, `handleClearSearch` | record/feature details modal state, `viewingFeatureIndex`, `featureIndexOf`, `handleViewDetails`, `handleSetShowBases` |
| `focusedRegion`, `pendingFocus`, `focusOn` (minus the desktop tab switch, see below) | `dragMode`, `jumpTo` |
| display toggles (annotations, translation, tracks, conservation) — persisted in project JSON, so shared | `themeKey` UI (the pref helpers stay in `shared/logic/theme.ts`) |
| `featureColors` — persisted in project JSON | |
| `handleRemoveRecord`, derived alignment state (`deriveAlignmentState`), the `beforeunload` guard | |

Where today's code mixes the two (e.g. `focusOn` and `selectSearchResult` also call
`setActiveTab('alignment')`), `useWorkspace` takes an optional `onNavigateToViewer` callback that
each UI supplies; the desktop passes its tab switch, mobile passes its own navigation. Rule for
anything not listed: **it stays in `DesktopApp` until a mobile screen needs it**, then moves.

### Picking the version

`pickShell(env, override)` is a pure function:

- `override` (`'desktop' | 'mobile'`, read from `localStorage` key `dunceious.shell` with the same
  try/catch pattern as `logic/theme.ts`) wins when present.
- Otherwise **mobile** iff `matchMedia('(pointer: coarse)')` matches **and**
  `min(screen.width, screen.height) < 600` CSS px. Using the shorter side keeps a phone in mobile
  when it is held sideways (844 px wide); tablets (shorter side ≥ 600) get desktop.
- Evaluated once at startup. Rotation never swaps the UI.

Overrides: More → "Use desktop version" on mobile; on desktop, a small "Use mobile version" link
appears in the StatusBar only when the window's shorter side is under 600 px. Both reload the page.

`ShellRoot` lazy-loads the chosen root inside `Suspense` with the existing `ProcessingOverlay`-style
spinner. Acceptance check: `vite build` produces separate chunks, and the desktop entry's import
graph contains no `src/app/mobile/` module (verified from the build manifest).

### Shared viewer: pointer events and pinch zoom

`GenomeViewer`, `SelectionOverlay`, `useSelectionDrag`, `Minimap` and `useViewport` replace their
mouse listeners (`onMouseDown/Move/Leave`, window `mousemove`/`mouseup`) with pointer events and
`setPointerCapture`. One code path serves mouse, pen and touch.

- **Pan mode:** one-pointer horizontal drag pans as today; the viewer sets `touch-action: pan-y` so
  the virtualized rows keep native vertical scrolling.
- **Select mode:** `touch-action: none`; one-pointer drag selects exactly as the mouse does.
- **Pinch:** two active pointers zoom around their midpoint. The math is a pure function,
  `zoomAroundAnchor({ zoom, scrollX, anchorX, scale }) → { zoom, scrollX }`, clamped to the existing
  fit/`MAX_ZOOM` bounds, shared with the ctrl+wheel path so both behave the same.
- **Tooltips:** stay hover-only for `pointerType === 'mouse'`. A new optional `onFeatureTap`
  prop fires on a touch tap of an annotation; desktop leaves it unset, mobile opens the feature
  sheet.
- Mouse behavior must be identical; the existing viewer tests are the regression net.

## Mobile UI

Bottom tabs: **Map · Sequence · Features · Search · More**. A record chip in the header opens the
Workspace screen (record switcher). Alignment screens are reached from Workspace and More when an
alignment is loaded.

| Screen | Content | Reuses |
| --- | --- | --- |
| Landing | Shown when the workspace is empty: pitch, privacy line, "Explore SARS-CoV-2", "Open your own file", "full workbench lives on desktop" card | — |
| Workspace | Records as cards, swipe left to remove, Add files, View alignment | `handleRemoveRecord` |
| Add sheet | Sequences / Annotations / Pre-aligned FASTA / Project pickers; example chips | `useFileHandlers` upload handlers |
| Map | Ring (default) or Linear; CDS outer lane, mat_peptide inner lane, other types a third lane; ticks; feature chips; selected-feature card | feature colors, record features |
| Feature sheet | Type, strand, location, length, qualifiers, protein translation (CDS), Copy / Export FASTA / Go to sequence | `shared/viewer/cds.ts` translation (honours each CDS's genetic code) |
| Sequence | Bases wrapped to screen width, translation row for overlapping CDS frames, feature bars, vertical scrubber, Go to position, long-press selection with handles and action bar (Copy, FASTA, Annotate) | `react-window` (already a dependency), cds helpers |
| Annotate sheet | Name, type (default `misc_feature`), strand; from a sequence selection or search hits | `useFeatureManager` add path (extended for name/type/strand if it lacks them) |
| Features | Annotation Hub as filterable cards (type chips, text filter) | `flattenedFeatures`, `featureSearch` |
| Search | Query, Exact (IUPAC) / Fuzzy (Smith-Waterman), results with context, multi-select, "Annotate as features" | `useSearchWorker` as is |
| More | Layer toggles, Export (FASTA, GFF3, GenBank, Project JSON), Records, Alignment, "Remote alignment — available on desktop", Use desktop version, About | display toggles, export handlers |
| Alignment overview (portrait) | Per-record difference ticks vs the reference, conservation strip, gene bar, a lens showing ~28 columns of every record at base level, previous/next difference | consensus / transposed records |
| Alignment viewer (landscape) | The shared `GenomeViewer` with a left icon rail (back, Pan/Select, layers, More) and a compact zoom/minimap bar | shared viewer |

Details that the plan must honour:

- **Line width in the reader** = the largest multiple of 10 bases that fits the width after gutter
  and scrubber (30 on a 390 px phone), recomputed on rotation.
- **Protein sessions:** Map shows features on a ring the same way; the reader shows residues with
  no translation row; Search uses the peptide alphabet (already handled by `useSearchWorker`).
- **Dense records** (e.g. the 154 kb chloroplast): arcs have a minimum visible angle; ring labels
  only for the selected feature and the longest few; feature chips scroll horizontally.
- **Examples:** copy SARS-CoV-2, human mitochondrion, influenza A (8 segments) and the insulin
  protein record from `examples/` into `public/examples/`. They are fetched only when tapped and
  fed through the normal upload path as `File` objects; nothing enters the JS bundle.
- **Export delivery:** `useFileHandlers` gains an optional `deliver(filename, blob)` seam.
  Desktop keeps today's download; mobile passes a delivery that uses `navigator.share({ files })`
  when `navigator.canShare({ files })` is true and falls back to the download otherwise.
- **Viewport:** full-height layouts use `100dvh`; long-press selection disables the native
  callout (`-webkit-touch-callout: none`, `user-select: none`) only inside the reader.
- **Accessibility:** touch targets ≥ 44 px, real buttons and links, `aria-label` on icon buttons,
  text contrast ≥ 4.5:1 on the dark ground.
- **License headers:** every new covered file carries the AGPL header (`npm run lint:headers`).
  The copied `.gb` examples are exempt.

## Delivery: PR sequence

Each PR targets `develop`. Versions bump at the `develop → main` promotion per `CLAUDE.md`, not per PR.

| # | PR | Scope | Desktop risk |
| --- | --- | --- | --- |
| 1 | `refactor(app): split the app into shared and desktop shells` | Folder moves, `useWorkspace()`, `ShellRoot` (desktop only for now), ESLint boundaries, ARCHITECTURE.md | High, mitigated: no behavior change; full test suite + before/after desktop screenshots |
| 2 | `feat(viewer): pan, select and pinch-zoom by touch` | Pointer events, `zoomAroundAnchor`, `onFeatureTap`, `touch-action` | Medium: mouse behavior must be identical |
| 3 | `feat(mobile): add the mobile shell with landing, workspace and export` | `pickShell` + overrides, `MobileApp`, tabs, Landing, Workspace, Add sheet, bundled examples, More, `deliver` seam | Low |
| 4 | `feat(mobile): map the genome and open features` | Map (ring/linear), Feature sheet | None |
| 5 | `feat(mobile): read the sequence and annotate selections` | Sequence reader, selection, Annotate sheet, Features cards | None |
| 6 | `feat(mobile): search motifs` | Search screen, annotate hits | None |
| 7 | `feat(mobile): compare aligned sequences` | Alignment overview + lens, landscape viewer frame | None |

PR 3 is the first PR after which a phone visitor sees the mobile UI. Until their PRs land, the
Map, Sequence, Features and Search tabs show a "coming soon" placeholder and the alignment entry
points are hidden. Promotion to `main` waits until PR 6 is in, so production never ships an empty
tab; PR 7 can ride the same promotion or the next.

## Testing

- **Unit (Vitest + Testing Library, existing setup):** `pickShell` (override, coarse pointer,
  shorter side, tablet); `useWorkspace` (wiring parity with today's `App` behavior, the
  `onNavigateToViewer` callback); `zoomAroundAnchor` (anchor stays fixed, clamps); reader
  line-width and selection math; ring arc geometry (minimum angle, wrap at origin for circular
  features); each mobile screen's behavior (tab switching, sheet open/close, annotate submits).
- **Regression:** the full suite stays green on PR 1 and PR 2. Desktop screenshots before and
  after PR 1 at 1440×900 with the influenza example loaded must match.
- **Phone checks:** each mobile PR is screenshotted at 390×844 (portrait) and 844×390 (landscape)
  with a throwaway Playwright script outside the repo. No browser-test dependency is added in v1.
- **Real device:** one pass on a real iPhone (Safari) and Android (Chrome) before the promotion to
  `main`, covering long-press selection, pinch zoom, the share sheet and the address-bar height.
- **Test runs** use a relative worker cap, per the repo's resource rules.

## Risks

| Risk | Mitigation |
| --- | --- |
| PR 1 silently changes desktop behavior | Pure moves + one hook extraction; no logic rewritten; screenshot diff; tests move with files |
| iOS Safari's own long-press menu fights the reader selection | Callout disabled only in the reader; selection drawn by us, not native text selection |
| Pinch fights browser page zoom | `touch-action` on the viewer only; the page keeps the default `width=device-width` viewport |
| Large multi-record files on low-memory phones | Parsing already runs in workers; the reader is virtualized; no change to limits in v1 |
| Mobile and desktop drift in shared behavior | All behavior lives in `shared/`; the lint boundary blocks the shortcut of importing across UIs |
