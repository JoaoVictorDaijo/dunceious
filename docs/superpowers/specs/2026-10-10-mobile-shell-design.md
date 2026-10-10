# Mobile shell — design

**Date:** 2026-10-10 · **Branch:** `docs/mobile-shell-spec` (off `develop`) · **Status:** draft, in review (rev 4)

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

### One storage rule: `sequence` is never gapped

The engine's overlay model assumes a record's `sequence` holds residues only and that gaps live
in `alignedSequence`: `applyFastaResponse` attaches an overlay without touching features,
`processTransposition` maps stored feature positions from residue space to columns, and today's
`annotationCoords` (`logic/featureManager.ts`) ungaps every new annotation into residue space.
GenBank and GFF features are residue positions too. The one input that breaks this is a plain
FASTA with gap characters imported through **Sequences**: it is stored as-is in `sequence`, so its
annotations are drawn at the wrong columns (selecting `GT` in `--AC-GTAC` stores `[2,4)`, drawn
over `AC`), and they would move again if an alignment overlay were later applied.

**Fix: normalize at ingestion** (a `fix` commit in PR 3, with regression tests):

- a Sequences-path FASTA record whose string contains gap characters (the gap definition of
  `alignedToOriginalPositions`) is stored as `sequence` = the string with gaps removed and
  `alignedSequence` = the original string. Ungapped records are unchanged;
- a project whose record has a gapped `sequence` is normalized the same way on load: if it has no
  `alignedSequence`, the gapped string becomes it; if it has one, it is kept. Its features stay as
  stored, because every path that could have created them already wrote residue positions;
- nothing else changes: the viewer draws the same string, `deriveAlignmentState` sees the same
  lengths, FASTA export (which prefers `alignedSequence`) writes the same text, and GenBank / GFF
  exports and remote alignment now receive gap-free residues, as they should.

After this, **stored feature coordinates are always residue positions of `sequence`**, and an
overlay applied later re-maps them correctly through `processTransposition`.

### Spaces the UIs use

- Each record's **display string** is `alignedSequence ?? sequence`, the string the desktop viewer
  draws.
- `SelectionArea`, `FocusTarget`, search results and the project JSON selection are in
  **column space**: positions in the display string, with today's start/end convention.
- **Residue space** is `sequence` (equivalently, the display string without gaps). The **mobile
  reader displays residue space**, numbered 1-based as biological positions.
- The reader converts **only at its own boundary**:
  - shared → reader: `alignedToOriginalPositions` / `getOriginalPos` (existing, `domain/bio/sequence.ts`);
  - reader → shared: a new pure inverse, `originalToAlignedPos(displayString, residuePos)`, added
    to `domain/bio/sequence.ts` with tests (PR 5).
- Paths that turn a column-space draft into a stored feature (`annotationCoords`, the new
  `addFeatures`) convert with `getOriginalPos(displayString, column)`, as `annotationCoords` does
  today. With the normalization above this is correct for every record.

**Acceptance:** for each of (a) a record `ACGTAC` with an alignment overlay `--AC-GTAC`, (b) a
plain FASTA `>r` / `--AC-GTAC` imported through Sequences, and (c) a project JSON whose record has
`sequence: "--AC-GTAC"` and no `alignedSequence`: selecting residues 3–4 (`GT`) in the reader,
annotating it, then checking the feature's desktop bar, its focus target, its feature FASTA, a
search for `GT`, the selection export and a project round-trip all identify `GT`, in both shells.
Then, for (b), applying the identical alignment and an alignment with different gap placement
(e.g. `A--CG-TAC`) keeps the existing annotation on `GT`, and annotating after the overlay gives
an equivalent feature.

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

3. **A build check** with source-module evidence. A small Rollup plugin in `vite.config.ts`
   (`generateBundle` hook, every production build) reads each output chunk's `moduleIds` and its
   static `imports`, then:
   - the **startup graph** = the entry chunk plus its static imports, transitively; it may contain
     no module under `src/app/desktop/` or `src/app/mobile/`;
   - the **desktop graph** = the chunk whose `facadeModuleId` is `src/app/desktop/DesktopApp.tsx`
     plus its static imports, transitively; it may contain no module under `src/app/mobile/`;
   - the **mobile graph** is the same from `src/app/mobile/MobileApp.tsx`, with no `src/app/desktop/` module.
   Chunks shared by both graphs (from `shared/`) are allowed. The build fails on a violation. The
   checker is a pure function over the bundle object, unit-tested with a synthetic bundle that
   places a non-entry mobile module inside a desktop-reachable chunk. No manifest is needed.

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
- `onWorkspaceReplaced()` — called after a project load succeeds and replaces the records. Before
  calling it, the shared code resets the state that referred to the old workspace: the active
  selection becomes the project's selection **or `null`** (today `handleProjectUpload` keeps the
  old selection when the project's is `null`, so record IDs that reappear in the new project can
  point at different sequences); `focusedRegion`, `pendingFocus` and the search results are
  cleared. Desktop closes its details modals and any open feature editor; mobile runs its
  reconciliation. This is a desktop bug fix as well, shipped as its own `fix` commit in PR 3 with
  a regression test.

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

**Mouse** (`pointerType === 'mouse'`) keeps today's semantics exactly: the drag starts on
pointerdown with no movement threshold, a nonempty interval commits on release using the
**release** coordinate (also when no move event arrived between down and up, as
`useSelectionDrag.test.tsx` covers), Shift-click extension and double-click work as today. The
mouse never enters the state machine below.

**Touch and pen** use one state machine per viewer:

1. **pointerdown** → `pending`. No pointer capture yet.
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

`zoomAroundAnchor({ zoom, scrollX, anchorX, scale, minZoom, maxZoom }) → { zoom, scrollX }` is a
pure function. It **clamps first** (`minZoom` = the viewer's current fit zoom, `maxZoom` =
`MAX_ZOOM`) and computes the new `scrollX` from the **clamped** zoom so the anchor column stays
under the anchor, as `handleZoom` in `useViewport.ts` does today. ctrl+wheel switches to it, so
both paths behave identically.

### Touch taps and tooltips

Tooltips stay hover-only for `pointerType === 'mouse'`. New optional prop
`onFeatureTap(recordId, feature)`; desktop leaves it unset.

### Compact toolbar mode

`GenomeViewer` owns its toolbar (minimap + zoom controls, 24 px buttons) and viewport state
internally, so a surrounding frame cannot drive it. New optional prop
`toolbar?: 'full' | 'compact'`, default `'full'` (today's rendering, unchanged). `'compact'`
renders the same minimap and the same internal zoom/fit handlers in one row with **44 px** touch
targets. No external viewport controller is introduced. Desktop regression is checked in PR 2.

### Viewport position in and out

Two more optional props, also PR 2, both unused by desktop:

- `initialCenterColumn?: number` — applied once on mount: the viewer centers that column at its
  current zoom.
- `onViewportChange?({ centerColumn, zoom })` — reported after every viewport change, throttled to
  one call per animation frame.

Mobile keeps the last reported value. When the orientation media query changes, mobile **freezes**
that value before the layout resizes or the viewer unmounts, and ignores later reports. PR 7 only
wires these props and `toolbar="compact"`.

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

On `onWorkspaceReplaced`, mobile discards **all** open sheets, annotate drafts, pending
navigation and the lens column, resets the alignment reference to the first record, and sets the
active record per the table, regardless of whether record IDs reappear in the new project. The
shared selection is already the incoming project's selection or `null` (see `useWorkspace()`).

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
| Feature sheet → Export FASTA | that record | the feature's **full** residues via `extractFeatureResidues` (below) |
| Feature sheet → Copy | that record | CDS in a nucleotide session: the protein shown in the sheet (translation path); everything else: the same residues as Export FASTA |
| More → Export FASTA / GFF3 / GenBank / Project | whole workspace | same as desktop's buttons today |

`extractCodingSequence` is **not** used for export: it prepares translation (it drops
`codon_start - 1` residues and reverse-complements with the DNA alphabet only). PR 4 adds a
separate pure domain function, `extractFeatureResidues(record, feature, moleculeType)` in
`domain/bio/sequence.ts`:

- takes every part of the feature in annotated order (joins, origin-crossing parts), keeping all
  annotated residues — no `codon_start` trimming — and drops gap characters from the output;
- **orientation**, nucleotide records only, following the same precedence as the existing
  extraction (`sequence.ts`, per-segment branch): when any segment carries its own strand, each
  segment is oriented by its own strand, in join order, with **no** whole-feature reversal
  (`join(complement(1..3),complement(7..9))` on `ATGAAACCC` gives `CATGGG`); otherwise a
  minus-strand feature's concatenation is reverse-complemented as a whole;
- complements use a **molecule-aware** alphabet (`U` for RNA, `T` for DNA, IUPAC codes
  complemented);
- protein records are **never** complemented, whatever strand metadata the feature carries.

New shared inputs (additive): `exportFeatureSequence(recordId, featureIndex)` (PR 4) and
`exportRecordRange(recordId, residueStart, residueEnd)` (PR 5). All exports go through a new optional
`deliver(filename, blob)` seam in `useFileHandlers`: desktop keeps today's download; mobile
uses `navigator.share({ files })` when `navigator.canShare({ files })` is true, else the download.

### Annotating search hits

"Annotate as features" creates **one feature per selected hit**, each on its own record and with
the hit's strand; hits may span records. The sheet asks for a base name (default: the query) and a
type (default `misc_feature`); features are named `<base> 1…n` in result order.

Both annotate flows use one shared batch mutation, `addFeatures(drafts[])` in
`useFeatureManager`, **introduced in PR 5** (with its draft type
`{ recordId, start, end, strand, name, type }` in column space and its mutation tests), where the
reader-selection annotation is a one-draft call. It adds all drafts in one state update and logs
once. PR 6 only consumes it for search hits. The existing `addAnnotationFromSearch` /
`joinSelectedMatches` desktop paths are untouched.

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
- **Lens:** mobile state holds the lens column. Turning to landscape mounts the viewer with
  `initialCenterColumn` = the lens column; turning back sets the lens to the `centerColumn` frozen
  from `onViewportChange` before the resize (see "Viewport position in and out").

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
| 1 | `refactor(app): split the app into shared and desktop shells` | `shared/types/` contracts, folder moves, `useWorkspace()` with `onNavigateToViewer` and `onRecordRemoved`, `ShellRoot` (desktop only), ESLint rules, boundaries test, build isolation check, ARCHITECTURE.md | High, mitigated: no behavior change; full suite + before/after screenshots |
| 2 | `feat(viewer): pan, select and pinch-zoom by touch` | Pointer events (mouse path unchanged), touch/pen state machine, `zoomAroundAnchor`, `onFeatureTap`, `touch-action`, `toolbar="compact"`, `initialCenterColumn` / `onViewportChange` | Medium: mouse behavior and full toolbar must be identical |
| 3 | `feat(mobile): add the mobile shell with landing, workspace and export` | `pickShell` + overrides, `MobileApp`, tabs, active-record rules, Landing, Workspace, Add sheet + ingestion rules, examples, `addLog` level, notices, More, `deliver` seam, `onWorkspaceReplaced`, and two `fix` commits: the project-load selection reset and the gapped-FASTA normalization | Low: additive `addLog` level; both fixes change desktop only where it was wrong |
| 4 | `feat(mobile): map the genome and open features` | Map, Feature sheet, shared translation helper, `extractFeatureResidues`, `exportFeatureSequence` | Low (helper extraction under existing tests) |
| 5 | `feat(mobile): read the sequence and annotate selections` | Reader, `originalToAlignedPos`, selection, Annotate sheet, `addFeatures`, `exportRecordRange`, Features cards | None (additive) |
| 6 | `feat(mobile): search motifs` | Search screen, batch annotate (consumes `addFeatures`) | None |
| 7 | `feat(mobile): compare aligned sequences` | Overview + lens + reference picker, landscape viewer mount | None |

PR 3 is the first PR after which a phone visitor sees the mobile UI. Until their PRs land, the
Map, Sequence, Features and Search tabs show a "coming soon" placeholder and the alignment entry
points are hidden. Promotion to `main` waits until PR 6 is in, so production never ships an empty
tab; PR 7 can ride the same promotion or the next.

## Testing

- **Unit (Vitest + Testing Library, existing setup):**
  - `pickShell`: override, coarse pointer, shorter side, tablet;
  - `useWorkspace`: parity with today's `App` wiring, all three callbacks; project load with a
    `null` selection after a selection in the previous project, with overlapping record IDs,
    leaves no old selection, focus, search result or mobile draft; a valid incoming selection is kept;
  - build isolation checker: synthetic bundle with a mobile module inside a desktop-reachable chunk fails;
  - boundaries test with its rejecting fixtures;
  - gesture state machine: drag→pinch promotion discards the selection, one-finger-left after pinch,
    cancel/lost-capture/unmount cleanup, click suppression; mouse: sub-6 px drags still commit,
    down/up with no move uses the release coordinate, Shift-click and double-click unchanged,
    two-axis pan;
  - viewport props: enter landscape at a known lens column, pan and zoom, rotate back — the lens
    gets the frozen pre-rotation center;
  - `zoomAroundAnchor`: anchor stays fixed; identical requests against different `minZoom`,
    including crossing the lower bound, give the right zoom and scroll;
  - gapped-FASTA normalization: Sequences import and project load (with and without an existing
    `alignedSequence`); GenBank/GFF exports gap-free; FASTA export text unchanged;
  - `originalToAlignedPos` and the coordinate acceptance case above, including the later overlays
    with identical and different gap placement;
  - active-record transitions table, including removing the active record from the 8-record
    influenza workspace with a sheet open, and removing the last record;
  - exports: one-record selection; `extractFeatureResidues` for joined, reverse-strand and
    origin-crossing features, an independently complemented join (`CATGGG` case) and a mixed-strand
    join with exact order and orientation, CDSs with `codon_start` 2/3 (full length kept), RNA minus strand
    (`U`), and protein features with minus-strand metadata (unchanged); CDS Copy equals the
    displayed translation;
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
