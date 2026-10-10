# Mobile shell — design

**Date:** 2026-10-10 · **Branch:** `docs/mobile-shell-spec` (off `develop`) · **Status:** draft, in review (rev 2)

Dunceious is desktop-only today. On a 390×844 phone the sidebar takes ~80% of the width and the
viewer is ~50 px wide, and every interaction (pan, drag-select, minimap, ctrl+wheel zoom, hover
tooltips) is mouse-only. This design adds a **separate mobile UI** on the same engine, without
adding mobile branches to the desktop UI's markup.

Prototypes (11 phone screens, clickable, owner access): <https://claude.ai/artifact/B9AAXtGvC88hJb3AV4PXcU>,
rows "Option A". They are a visual reference only; **this document is the contract**. Row
"Option B" (greeter only) was considered and not chosen.

## Decisions locked in

| Decision | Ruling |
| --- | --- |
| Direction | **Option A** — a real mobile reader, not only a greeter page |
| Code structure | **Adaptive, not responsive:** two UIs (`desktop/`, `mobile/`) over one shared layer; neither imports the other |
| Version choice | Picked **once at load**; phones get mobile, everything else (tablets included) desktop; manual override, remembered per device |
| URL | Unchanged — `dunceious.pages.dev` serves both; each UI is a lazy chunk |
| Landscape base-level viewer | **Shared:** the existing `GenomeViewer` moves to `shared/`, gains pointer events, pinch zoom and a compact toolbar mode; mobile mounts it |
| Mobile write actions (v1) | **Light:** annotate from a reader selection or search hits, remove records, export. Full feature editor and remote EMBL-EBI alignment stay desktop-only |
| Desktop empty state | Unchanged ("Workspace Empty"); a desktop landing page is out of scope |
| Visual language | Existing slate palette, environment accent and fonts; no second palette. Theme picker stays desktop-only in v1 |

## Goals and non-goals

**Goals**
- A visitor on a phone can open an example or their own GenBank/FASTA file and: see the genome map,
  open a feature, read the sequence with translation, search a motif, see where aligned sequences
  differ, and export.
- The desktop UI's components carry no mobile branches. Desktop-visible changes are limited to:
  PR 1 file moves (no behavior change), PR 2 viewer input and toolbar-mode upgrade (mouse
  behavior identical, touch now works), and additive shared APIs that desktop does not call.

**Non-goals (v1)**
- Feature parity: no mobile feature editor (qualifiers, joins, circular features), no remote
  alignment, no BED quantitative tracks on mobile, no theme picker.
- Offline/PWA install. A desktop landing page.

## Coordinate contract

All shared state keeps **today's coordinate space**, so the desktop and the project format are
untouched:

- `SelectionArea`, `FocusTarget`, search results and the project JSON selection are in
  **alignment-column space** (positions in `alignedSequence` when a record has one, otherwise in
  `sequence`, where columns and residues coincide), with the same start/end convention the code
  uses today.
- The **mobile reader displays residue space**: the active record's ungapped residues, numbered
  1-based as biological positions.
- The reader converts **only at its own boundary**:
  - shared → reader: `alignedToOriginalPositions` / `getOriginalPos` (existing, `domain/bio/sequence.ts`);
  - reader → shared: a new pure inverse, `originalToAlignedPos(alignedSeq, residuePos)`, added to
    `domain/bio/sequence.ts` with tests (PR 5).
- Every mobile path that writes shared state (selection, annotate, search-hit focus) goes through
  these conversions; existing shared mutations (e.g. `featureManager.ts` converting a selection
  with `getOriginalPos`) keep receiving column-space input.

**Acceptance:** with a record `ACGTAC` aligned as `--AC-GTAC`, selecting residues 3–4 (`GT`) in
the reader, annotating, searching `GT`, exporting the selection and round-tripping a project all
identify `GT` in both shells.

## Architecture

### Folders

```
src/app/
  main.tsx                      ← entry (exists today); renders ShellRoot
  shell/
    pickShell.ts                ← the version rule + override (pure, tested)
    ShellRoot.tsx               ← lazy-loads DesktopApp or MobileApp
  shared/
    types/                      ← contracts today defined in components (see below)
    workspace/useWorkspace.ts   ← the state wiring App.tsx owns today
    hooks/                      ← useBioWorker, useSearchWorker, useFeatureManager, useFileHandlers,
                                  useRemoteAlignment, useAppLogger (moved)
    logic/                      ← today's app/logic/
    viewer/                     ← today's app/viewer/ (GenomeViewer, Row, tracks, layout, colors, cds…)
    recordRemoval.ts
  desktop/
    DesktopApp.tsx              ← today's App.tsx render + desktop-only UI state
    components/                 ← today's app/components/
  mobile/
    MobileApp.tsx
    screens/  sheets/  components/  logic/
```

Paths inside `shared/` mirror today's `app/` so the move is mechanical. Tests move with their files.

### Contracts that move first (PR 1)

Some shared code imports types from components that will live in `desktop/`. PR 1 moves these
contracts to `shared/types/` and makes both the shared code and the desktop components import them
from there:

- `EditingFeatureState` (today in `components/FeatureEditorModal.tsx`), imported by
  `useFeatureManager` and `logic/featureManager.ts`;
- `FlatItem` (today in `components/AnnotationHubPanel.tsx`), imported by `useFeatureManager`;
- every other type that `hooks/`, `logic/` or `viewer/` imports from `components/` (PR 1 starts by
  listing them with a grep; `useSearchWorker.ts` and `logic/searchState.ts` have such imports).

No type is duplicated; the component files re-export nothing.

### Import boundaries

Two layers of enforcement, both in CI:

1. **ESLint `no-restricted-imports`** (static imports, type-only included), same pattern style as
   the existing layer rules in `eslint.config.js`, tests exempt:
   - `src/app/shared/**` may not import `desktop/`, `mobile/` or `shell/`;
   - `src/app/desktop/**` may not import `mobile/`; `src/app/mobile/**` may not import `desktop/`;
   - `src/app/shell/**` may not statically import `desktop/` or `mobile/` at all.
2. **An architecture test** (`src/app/__tests__/boundaries.test.ts`), because ESLint's rule does
   not see dynamic `import()`: it parses every file under `src/app/` with the TypeScript compiler
   API (already a dev dependency) and asserts the same rules for **static and dynamic** imports,
   plus: the only dynamic imports of `desktop/` or `mobile/` are exactly
   `import('../desktop/DesktopApp')` and `import('../mobile/MobileApp')`, each the argument of a
   `React.lazy` call in `shell/ShellRoot.tsx`. Fixture snippets prove it rejects a cross-shell
   import, a dynamic import of a non-root module and an eager dynamic root import.

Plus the bundle check: after `vite build`, the build manifest shows the desktop chunk graph
contains no `src/app/mobile/` module and vice versa.

The domain ← core ← workers ← app rules are unchanged; `shared/`, `desktop/`, `mobile/` and
`shell/` are all inside the `app` layer. `ARCHITECTURE.md` and the `dunceious-architecture` skill
pointer get the new sub-layout.

### `useWorkspace()`

`App.tsx` is already a composition root: logic lives in hooks, and `App` wires them together.
The wiring both UIs need moves into `useWorkspace(options)`; desktop-only UI state stays in
`DesktopApp`.

| Moves to `useWorkspace()` (shared) | Stays in `DesktopApp` |
| --- | --- |
| logger; `useBioWorker`; `useRemoteAlignment`; `useFeatureManager`; `useSearchWorker`; `useFileHandlers` | `sidebarOpen`, `activeTab` / `changeTab`, `hubFocus`, `showHubReturn` |
| active selection, search-selection ref, `selectSearchResult`, `handleClearSearch` | record/feature details modal state, `viewingFeatureIndex`, `featureIndexOf`, `handleViewDetails`, `handleSetShowBases` |
| `focusedRegion`, `pendingFocus`, `focusOn` | `dragMode`, `jumpTo` |
| display toggles and `featureColors` (both persisted in project JSON) | the theme picker UI (pref helpers stay in `shared/logic/theme.ts`) |
| `removeRecord`, `deriveAlignmentState`, the `beforeunload` guard | |

Options, so shared code never touches shell state:

- `onNavigateToViewer()` — today `focusOn` and `selectSearchResult` call
  `setActiveTab('alignment')`; they call this instead. Desktop passes its tab switch; mobile
  passes its own navigation.
- `onRecordRemoved(recordId)` — called after the shared removal (records, selection, search
  state). Desktop closes its details modals for that record, exactly as `App.tsx` does today;
  mobile runs its own reconciliation (below).

Rule for anything not listed: **it stays in `DesktopApp` until a mobile screen needs it**, then
moves, in the PR that needs it.

### Picking the version

`pickShell(env, override)` is a pure function:

- `override` (`'desktop' | 'mobile'`, from `localStorage` key `dunceious.shell`, read with the
  try/catch pattern of `logic/theme.ts`) wins when present.
- Otherwise **mobile** iff `matchMedia('(pointer: coarse)')` matches **and**
  `min(screen.width, screen.height) < 600` CSS px. The shorter side keeps a sideways phone
  (844 px wide) in mobile; tablets (shorter side ≥ 600) get desktop.
- Evaluated once at startup. Rotation never swaps the UI.

Overrides: More → "Use desktop version" on mobile; on desktop, a small "Use mobile version" link
in the StatusBar, shown only when the window's shorter side is under 600 px. Both reload the page.

## Shared viewer changes (PR 2)

### Pointer input

`GenomeViewer`, `SelectionOverlay`, `useSelectionDrag`, `Minimap` and `useViewport` replace their
mouse listeners with pointer events. **Mouse behavior is preserved exactly**, including:

- Pan mode drags **both axes** (`startPan` moves `scrollLeft` and the list's `scrollTop` today;
  the vertical-drag regression test in `useSelectionDrag.test.tsx` must keep passing);
- Select-mode drag, autoscroll at the edges, commit on release;
- annotation clicks opening details (`Row.tsx`) and double-click selection;
- ctrl+wheel zoom.

Touch differs only where the platform requires it:

- **Pan mode, touch:** the viewer sets `touch-action: pan-y`; one-finger horizontal movement pans
  through our handler, vertical movement is left to native scrolling, and our handler ignores
  `dy` for `pointerType === 'touch'` so nothing is applied twice.
- **Select mode, touch:** `touch-action: none`; one-finger drag selects like the mouse.

### Gesture arbitration

One state machine per viewer, used by every pointer type:

1. **pointerdown** → `pending`. No pointer capture yet, so a plain click still reaches `Row.tsx`
   handlers.
2. Movement beyond a **6 px slop** → `drag` (pan or select per mode); pointer capture is taken now.
3. A **second pointer** at any time → `pinch`: an in-progress selection is **discarded without
   committing**, autoscroll stops, pan stops. Zoom follows the two pointers.
4. When pinch ends with one finger still down, no new drag starts until **all** pointers lift.
5. **pointerup** without leaving `pending` (and no pinch in the gesture) = a **tap**. Touch taps
   on an annotation call `onFeatureTap`; after any drag or pinch, the next synthesized `click` is
   suppressed so it cannot open details.
6. **pointercancel, lostpointercapture, rotation and unmount** → stop autoscroll, clear the
   gesture, commit nothing.

### Pinch zoom

`zoomAroundAnchor({ zoom, scrollX, anchorX, scale }) → { zoom, scrollX }` is a pure function,
clamped to the existing fit/`MAX_ZOOM` bounds. ctrl+wheel switches to it, so both paths behave
identically.

### Touch taps and tooltips

Tooltips stay hover-only for `pointerType === 'mouse'`. New optional prop
`onFeatureTap(recordId, feature)`; desktop leaves it unset.

### Compact toolbar mode

`GenomeViewer` owns its toolbar (minimap + zoom controls, 24 px buttons) and viewport state
internally, so a surrounding frame cannot drive it. New optional prop
`toolbar?: 'full' | 'compact'`, default `'full'` (today's rendering, unchanged). `'compact'`
renders the same minimap and the same internal zoom/fit handlers in one row with **44 px** touch
targets. No external viewport controller is introduced. Desktop regression is checked in PR 2;
PR 7 only sets `toolbar="compact"`.

## Mobile UI

Bottom tabs: **Map · Sequence · Features · Search · More**. A record chip in the header opens the
Workspace screen (record switcher). Alignment screens are reached from Workspace and More when an
alignment is loaded.

### Active record and cleanup

Map, Sequence and Features show the **active record** (mobile state):

| Event | Active record |
| --- | --- |
| first records loaded into an empty workspace (files, example, project) | first record in workspace order |
| more records imported while one is active | unchanged |
| project replaces the workspace | first record of the new project |
| active record removed | the next record in workspace order; if none, the previous one |
| last record removed | none → Landing |

On `onRecordRemoved`, mobile also closes any feature sheet, annotate sheet or reader selection that
refers to the removed record; a discarded annotate draft shows a short notice.

### Screens

| Screen | Content | Reuses |
| --- | --- | --- |
| Landing | Shown when the workspace is empty: pitch, privacy line, "Explore SARS-CoV-2", "Open your own file", "full workbench lives on desktop" card | — |
| Workspace | Records as cards, swipe left to remove, Add files, View alignment (when eligible) | `removeRecord` |
| Add sheet | Sequences / Annotations / Pre-aligned FASTA / Project pickers; example chips | `useFileHandlers` upload handlers |
| Map | Ring (default) or Linear; CDS outer lane, mat_peptide inner lane, other types a third lane; ticks; feature chips; selected-feature card | record features, feature colors |
| Feature sheet | Type, strand, location, length, qualifiers, protein (CDS), Copy / Export FASTA / Go to sequence | canonical translation path (below) |
| Sequence | Residues wrapped to screen width, translation row for overlapping CDS frames, feature bars, vertical scrubber, Go to position, long-press selection with handles, action bar (Copy, FASTA, Annotate) | `react-window` (existing dependency) |
| Annotate sheet | Name, type (default `misc_feature`), strand; from a reader selection or search hits | `addFeatures` (below) |
| Features | Annotation Hub as filterable cards (type chips, text filter) | `flattenedFeatures`, `featureSearch` |
| Search | Query, Exact (IUPAC) / Fuzzy (Smith-Waterman), results with context, multi-select, "Annotate as features" | `useSearchWorker` |
| More | Layer toggles, Export, Records, Alignment, Workspace log, "Remote alignment — available on desktop", Use desktop version, About | display toggles, export handlers |
| Alignment overview (portrait) | Per-record difference ticks vs the reference, conservation strip, gene bar, lens, previous/next difference | `transposedRecords`, `consensus` |
| Alignment viewer (landscape) | Shared `GenomeViewer` with `toolbar="compact"` and a left icon rail (back, Pan/Select, layers, More) | shared viewer |

### Ingestion, processing and errors

- **Sequences** and **Project** are always enabled. **Annotations** and **Pre-aligned FASTA** are
  disabled on an empty workspace with the reason shown ("Load sequences first"). Pre-aligned FASTA
  stays what it is today: an overlay whose IDs must match loaded records.
- `isProcessing` shows a mobile processing overlay.
- **Visible errors:** `addLog` gains an optional level, `addLog(message, level?: 'info' | 'error')`,
  default `'info'` (desktop's log rendering is unchanged). PR 3 passes `'error'` at the failure
  sites mobile must surface: unmatched alignment IDs (`bioResponse.ts`), invalid project JSON
  (`useFileHandlers.ts`), worker parse/processing failures (`useBioWorker.ts`), and
  annotation-upload failures. Mobile shows `'error'` entries as a dismissible notice and keeps the
  full log under More → Workspace log. Molecule-type mismatch already has state
  (`moleculeTypeMismatch`); mobile renders it as a sheet. After any error the workspace stays usable.

### Exports

Each mobile action has a defined scope; desktop export behavior does not change.

| Action | Records | Content |
| --- | --- | --- |
| Reader selection → FASTA / Copy | the active record only | its ungapped residues in the selected range, forward strand |
| Feature sheet → Export FASTA | that record | the feature's spliced, strand-oriented residues (nucleotides, or amino acids in a protein session) via `extractCodingSequence` (joins, reverse strand, origin-crossing handled there) |
| Feature sheet → Copy | that record | CDS in a nucleotide session: the protein shown in the sheet; everything else: the same residues as Export FASTA |
| More → Export FASTA / GFF3 / GenBank / Project | whole workspace | same as desktop's buttons today |

New shared inputs (PR 4/5, additive): `exportRecordRange(recordId, residueStart, residueEnd)` and
`exportFeatureSequence(recordId, featureIndex)`. All exports go through a new optional
`deliver(filename, blob)` seam in `useFileHandlers`: desktop keeps today's download; mobile
uses `navigator.share({ files })` when `navigator.canShare({ files })` is true, else the download.

### Annotating search hits

"Annotate as features" creates **one feature per selected hit**, each on its own record and with
the hit's strand; hits may span records. The sheet asks for a base name (default: the query) and a
type (default `misc_feature`); features are named `<base> 1…n` in result order. This needs a
shared batch mutation, `addFeatures(drafts[])` in `useFeatureManager` (PR 6, additive), that adds
all drafts in one state update and logs once. The existing `addAnnotationFromSearch` /
`joinSelectedMatches` desktop paths are untouched. A reader-selection annotation is a one-draft
call to the same function.

### Translation

The feature sheet and the reader use the **same path as the desktop viewer** (`SequenceTrack.tsx`):
`extractCodingSequence` + the CDS's genetic code + `translateFeature`, all in
`domain/bio/sequence.ts`, so joins, strand, `codon_start` and stored `/translation` overrides
behave identically. PR 4 extracts that composition from `SequenceTrack.tsx` into one shared helper
used by both, covered by the existing viewer tests. Protein records are never translated.

### Alignment

- **Eligibility:** mobile uses `deriveAlignmentState` unchanged (equal-length raw records count as
  aligned, as on desktop).
- **Reference:** the first record in workspace order; the overview header has a picker to change
  it. If the reference is removed, the new first record becomes the reference.
- **Difference:** a column is a difference for a record when its residue differs from the
  reference's (case-insensitive). Gap vs residue is a difference; gap vs gap is not; IUPAC
  ambiguity codes count as a difference unless the letters are identical.
- **Navigation:** previous/next steps through difference columns (any record) in column order,
  stopping at the ends; "No differences" when there are none.
- **Lens:** mobile state holds the lens column. Turning to landscape opens the viewer centered on
  that column; turning back sets the lens to the viewer's center column.

### Reader and map details

- **Line width** = the largest multiple of 10 residues that fits after gutter and scrubber (30 on a
  390 px phone), recomputed on rotation.
- **Protein sessions:** Map draws features the same way; the reader shows residues with no
  translation row; Search uses the peptide alphabet (already handled by `useSearchWorker`).
- **Dense records** (e.g. the 154 kb chloroplast): arcs have a minimum visible angle; ring labels
  only for the selected feature and the longest few; feature chips scroll horizontally.
- **Circular features** crossing the origin are drawn as one arc across 0 on the ring and as two
  pieces on the linear map.

### Platform details

- **Examples:** copy SARS-CoV-2, human mitochondrion, influenza A (8 segments) and the insulin
  protein record from `examples/` into `public/examples/`, fetched only when tapped and fed
  through the normal upload path as `File` objects; nothing enters the JS bundle.
- **Viewport:** full-height layouts use `100dvh`; long-press selection disables the native callout
  (`-webkit-touch-callout: none`, `user-select: none`) only inside the reader.
- **Accessibility:** touch targets ≥ 44 px, real buttons and links, `aria-label` on icon buttons,
  text contrast ≥ 4.5:1 on the dark ground.
- **License headers:** every new covered file carries the AGPL header (`npm run lint:headers`);
  the copied `.gb` examples are exempt.

## Delivery: PR sequence

Each PR targets `develop`. Versions bump at the `develop → main` promotion per `CLAUDE.md`.

| # | PR | Scope | Desktop risk |
| --- | --- | --- | --- |
| 1 | `refactor(app): split the app into shared and desktop shells` | `shared/types/` contracts, folder moves, `useWorkspace()` with its two callbacks, `ShellRoot` (desktop only), ESLint rules + boundaries test, ARCHITECTURE.md | High, mitigated: no behavior change; full suite + before/after screenshots |
| 2 | `feat(viewer): pan, select and pinch-zoom by touch` | Pointer events, gesture state machine, `zoomAroundAnchor`, `onFeatureTap`, `touch-action`, `toolbar="compact"` | Medium: mouse behavior and full toolbar must be identical |
| 3 | `feat(mobile): add the mobile shell with landing, workspace and export` | `pickShell` + overrides, `MobileApp`, tabs, active-record rules, Landing, Workspace, Add sheet + ingestion rules, examples, `addLog` level, notices, More, `deliver` seam | Low (additive `addLog` level) |
| 4 | `feat(mobile): map the genome and open features` | Map, Feature sheet, shared translation helper, `exportFeatureSequence` | Low (helper extraction under existing tests) |
| 5 | `feat(mobile): read the sequence and annotate selections` | Reader, `originalToAlignedPos`, selection, Annotate sheet, `addFeatures`, `exportRecordRange`, Features cards | None (additive) |
| 6 | `feat(mobile): search motifs` | Search screen, batch annotate | None |
| 7 | `feat(mobile): compare aligned sequences` | Overview + lens + reference picker, landscape viewer mount | None |

PR 3 is the first PR after which a phone visitor sees the mobile UI. Until their PRs land, the
Map, Sequence, Features and Search tabs show a "coming soon" placeholder and the alignment entry
points are hidden. Promotion to `main` waits until PR 6 is in, so production never ships an empty
tab; PR 7 can ride the same promotion or the next.

## Testing

- **Unit (Vitest + Testing Library, existing setup):**
  - `pickShell`: override, coarse pointer, shorter side, tablet;
  - `useWorkspace`: parity with today's `App` wiring, both callbacks;
  - boundaries test with its rejecting fixtures;
  - gesture state machine: drag→pinch promotion discards the selection, one-finger-left after pinch,
    cancel/lost-capture/unmount cleanup, click suppression, mouse click and double-click unchanged,
    two-axis mouse pan;
  - `zoomAroundAnchor`: anchor stays fixed, clamps;
  - `originalToAlignedPos` and the coordinate acceptance case above;
  - active-record transitions table, including removing the active record from the 8-record
    influenza workspace with a sheet open, and removing the last record;
  - exports: one-record selection, joined, reverse-strand and origin-crossing feature sequences;
  - `addFeatures`: one hit, several hits on one record, hits across records, mixed strands — exact
    counts, coordinates and strands;
  - ingestion: disabled actions on empty workspace, each `'error'` site produces a notice;
  - translation parity with the viewer for a mitochondrial CDS (table 2), a reverse-strand CDS,
    `codon_start` 2/3, a joined CDS and an annotated `/translation` override;
  - alignment: fixed alignment with substitutions, gaps and ambiguity codes → exact difference
    columns and navigation order; equal-length raw records; reference removal; no differences;
  - ring geometry: minimum angle, origin-crossing arcs; reader line width.
- **Regression:** the full suite stays green on PR 1 and PR 2. Desktop screenshots before and
  after PR 1 and PR 2 at 1440×900 with the influenza example loaded must match.
- **Phone checks:** each mobile PR is screenshotted at 390×844 and 844×390 with a throwaway
  Playwright script outside the repo. No browser-test dependency is added in v1.
- **Real device:** one pass on a real iPhone (Safari) and Android (Chrome) before the promotion to
  `main`: long-press selection, pinch zoom, the share sheet, the address-bar height.
- **Test runs** use a relative worker cap, per the repo's resource rules.

## Risks

| Risk | Mitigation |
| --- | --- |
| PR 1 silently changes desktop behavior | Pure moves, contract relocation and one hook extraction; no logic rewritten; screenshot diff; tests move with files |
| PR 2 changes mouse feel | Mouse paths specified above; existing viewer tests plus new state-machine tests; screenshot diff of the full toolbar |
| iOS Safari's long-press menu fights the reader selection | Callout disabled only in the reader; selection drawn by us, not native text selection |
| Pinch fights browser page zoom | `touch-action` on the viewer only; page keeps `width=device-width` |
| Large multi-record files on low-memory phones | Parsing already runs in workers; the reader is virtualized; limits unchanged in v1 |
| Mobile and desktop drift in shared behavior | Behavior lives in `shared/`; lint + boundaries test block cross-UI imports |
