---
title: "Showroom round two: the Annotation Hub, Export and an aligned variant workspace"
status: proposed
date: 2026-10-17
areas: ["showroom", "viewer", "app"]
prs: []
issues: []
superseded_by: null
summary: "The phone test drive opens on one aligned SARS-CoV-2 variant workspace that the Visual Viewport, the real Annotation Hub and the real Export dialog all share, so Conservation and Compare work. Anything that would change data or save a file explains instead, and a touch tap no longer opens the viewer's hover tooltip."
---
# Showroom round two — design

## Why

The first showroom (`2026-10-15-greeter-showroom.md`, PRs #174 and #175) gives phone visitors a
faithful test drive of the Visual Viewport, search and alignment. It deferred four things:

- the Annotation Hub;
- the Import and Export menus;
- an aligned sample, so Conservation can be shown working;
- touch selection.

Today a visitor who taps Annotation Hub gets "It is not part of this test drive yet". Import and
Export can't be reached. Conservation stays greyed out because the three samples (SARS-CoV-2,
the human mitochondrion, influenza A PR8) are unrelated genomes. Reference comparison (#176) and
its toolbar Compare control (#187) are switched off in the showroom (`Showroom.tsx` passes
`comparisonMenu={null}` and a Conservation toggle that only explains), since there was nothing
aligned to compare. Loading an alignment won't bring them back by itself; they need wiring.

The owner wants visitors to learn which file formats Dunceious exports, and to see the viewport
and the Hub working on the same sequences, so each part can be compared with the others.

A separate bug comes along: on any touchscreen, tapping an annotation leaves the viewer's mouse
hover tooltip ("Double-click to select region") on screen until the next tap.

## Decisions (owner, 2026-10-16 and 2026-10-17)

- **Export:** tapping Export opens the real workbench Export dialog, filled with the sample.
  Choosing sequences, formats and options, renaming the file, and the "What this file will
  contain" preview all work. Only the final "Export N sequences" button explains instead of
  saving, and it names the file and format the visitor picked.
- **Annotation Hub rule:** looking around works for real. That covers browsing, searching,
  filtering, grouping, selecting rows and jumping to an annotation in the viewer. Anything that
  would change the data explains instead: editing, deleting, adding, undo and importing.
- **Import menu:** opens as in the workbench. Each item explains what it does and which file
  types it takes. No file picker ever opens.
- **One shared workspace:** the test drive opens on one aligned workspace, the SARS-CoV-2
  reference plus a few well-known variants. It **replaces** the three current samples, with no
  way to switch back.
- **Local search** (#185) explains what it does instead of running. This can change later.
- **Details opens:** tapping an annotation, in the viewer or the Hub, opens the real details panel
  instead of explaining. The actions inside it that would copy, export or change the record
  explain instead.
- The touch tooltip fix is part of this round.

## Goals

- The visitor sees the same records in the Visual Viewport, the Annotation Hub and the Export
  dialog.
- With the variants aligned, these work exactly as on a computer:
  - Conservation and the reference comparison in the viewport (Compare in the viewport
    toolbar, its menu, and the Differences and Identity highlights);
  - the Export option "Keep alignment gaps".
- The Hub, its toolbar and the Export dialog fit a phone held sideways (740×360 and 844×390
  CSS px) with nothing overlapping or clipped, and every control can be reached.
- Every control that would change data, save a file, open a file picker, contact a server or run
  Local search shows a short explanation of what it does in the workbench.
- Nothing the visitor does is stored, sent or carried into the real workbench (the first spec's
  rules hold unchanged).
- A touch tap on any touchscreen never opens the viewer's hover tooltip. Mouse hover is
  unchanged.

## Non-goals and anti-goals

- No change to how the desktop workbench looks or behaves. Phone-sized layouts are scoped to the
  showroom. Shared components may gain optional props, but their defaults must render exactly as
  today.
- No real files in or out, no clipboard writes of sequence data, and no network requests beyond
  the app's own files (unchanged from the first spec).
- No copies of workbench logic in `showroom/`. Export contents, Hub filtering and grouping, and
  alignment overlay come from the workbench's own modules. A forked copy would drift from the
  real tool, which defeats the point.
- **Anti-goal:** fake or "illustrative" biological data. The variant sequences are real
  published genomes, and their alignment is computed by an established tool with its version
  and command recorded (see *The variant workspace*). The CLAUDE.md scientific-rigor rule
  applies: an alignment is a biological result.
- **Anti-goal:** a Hub that only looks right in screenshots, such as a frozen picture or a static
  table. Visitors must be able to scroll, search and filter it.
- Touch selection and selection handles remain deferred (mobile PR 2).

## Experience

The rotate prompt, the "Test drive" marker with Exit, the welcome strip and the explanation
callout all carry over from the first spec.

**Portrait and portals.** In portrait, the showroom makes its inner wrapper `inert` under the
rotate prompt. But `ExportDialog` portals into `.app-root`, outside that wrapper, so its document
focus trap keeps running and steals focus from the prompt's Back. The shortcuts sheet, the
details modal and the comparison panel's portal behave the same way. Every portal the showroom
opens must render inside the inert boundary, through an optional container prop whose default is
today's target, and its document listeners must not act while inert. Rotating back restores the
open dialog with its choices. A test rotates to portrait with Export open and with the shortcuts
sheet open, and checks that Back is reachable by keyboard and pointer.

### The variant workspace in the viewport

The showroom opens on four records:
- the SARS-CoV-2 reference NC_045512.2, which keeps its RefSeq annotations;
- one published genome each for Alpha (B.1.1.7), Delta (B.1.617.2) and Omicron (BA.1).

The alignment is already loaded, so:
- the viewer shows the aligned rows, with gaps where the genomes have deletions;
- the Conservation layer toggle in Layers works, off by default as in the workbench;
- Compare appears in the viewport toolbar (it shows only when at least two records are aligned)
  and opens the real comparison menu, with NC_045512 as the reference by default. Its arrival
  animation from #187 must not play on first mount.

Search keeps working on these records. The Align dialog still explains instead of submitting.

**Search hit marks (#185).** Today the showroom passes no `completedSearch` to the viewer or to
`SearchPanel`, so the per-base hit marks and the results' alignment summaries don't appear. This
round wires them in:
- The workbench builds the completed-search snapshot inline in `hooks/useSearchWorker.ts`. Move
  that construction into a pure builder in `logic/searchState.ts`, used by both the workbench and
  the showroom, rather than copying it.
- `HitAlignmentSummary`'s Copy button writes to the clipboard directly. It gains an optional copy
  handler (default unchanged), and in the showroom Copy explains.

**Session storage (a live bug from round one).** The search disclosures (`SearchDetails`,
`HitAlignment`, `LocalOptions`) remember whether they're open in `sessionStorage` through
`hooks/useSessionOpenState`. In the shipped showroom, opening "Search details" already writes
storage the workbench shares, which breaks the no-storage promise. These components gain an
optional memory-only mode (default unchanged), and the showroom uses it everywhere. A test checks
that no `sessionStorage` or `localStorage` read or write happens while a visitor searches, opens
every disclosure, exits and comes back.

### The Annotation Hub

The Visual Viewport / Annotation Hub switcher in the showroom top bar switches for real. In the
Hub, the top bar's workspace tools become the Hub toolbar (annotation search, Import and Export),
as they do in the workbench. Pan/Select and Layers give way to it.

These work as in the workbench:
- the By sequence and By feature tabs;
- the sequence index and its search;
- list and grouped views, density, sort, filters, "Needs attention";
- row selection and the selection bar's counts;
- annotation search and its previous/next navigation;
- tapping an annotation's "show in viewer" control, which switches to the viewport focused on
  it, as `onFocusItem` does in the workbench. The return pill comes back to the Hub.

These explain instead:
- Add annotation;
- editing an annotation or a record's details or label, deleting rows or records, undo, and
  clearing the workspace;
- dropping files on the Hub;
- each Import menu item.

**My call on forms:**
- A form that a reused component opens by itself opens, and the button that would commit the
  change explains, as Export's final button does. This covers the Hub's record details editor
  and label editing.
- A form that only the workbench's `App` mounts, such as the annotation editor
  (`FeatureEditorModal`, filled from `hooks/useFeatureManager`), is not mounted in the showroom.
  Its trigger explains straight away. So Add annotation and Edit annotation explain at the tap.

**Interception comes before confirmations and success messages.** Swapping the data callbacks
isn't enough, because some Hub controls act before calling them:
- `SelectionBar`'s remove calls `window.confirm` before `onRemoveRecords`;
- its Apply sets a "Set … on N sequences" success message right after `onSetDetail`;
- `HubList` asks `window.confirm` before discarding a dirty label or details draft when another
  editor opens.

These gain optional props (defaults unchanged) so the showroom can step in first. The builder
picks the mechanism, for example an injected confirm function plus a guard that runs before a
commit. In the showroom:
- remove and Apply explain, with no native dialog and no success message;
- switching away from a dirty draft discards it without asking, since nothing would be saved
  anyway (my call).

A test fails if `window.confirm` is ever called in the showroom, or if a success notice appears
after an explained action.

**Keyboard:** the Hub's own keys (`/ j k [ ] x o ?` and Escape) work. Ctrl/⌘+S and Ctrl/⌘+O are
caught anywhere in the showroom and show the Project explanation. Otherwise a hardware keyboard
would open the browser's own Save Page and Open File dialogs. The shortcuts sheet opens
normally.

### Details

Tapping an annotation in the viewer, or its details control in the Hub, opens the workbench's
real `RecordDetailsModal` for that annotation and record. The showroom mounts the modal itself,
because the workbench's `App` mounts it there.

These work:
- reading the annotation's type, location, strand, length and qualifiers;
- Focus, which moves the viewer to the annotation (`onFocusFeature`);
- closing the panel.

These explain instead:
- every Copy button (sequence, bases, protein translation);
- Export;
- "Bases inside" and "Show sequence in viewer", which change the annotation's stored display mode;
- "Remove search details".

In feature mode the modal shows the annotation's own fields, not the record's. The record's
source metadata (host, location, collection date and the other details fields) is what the Hub's
sequence details line and record details editor show. So visitors read the variants' metadata in
the Hub, and the modal isn't extended to show it.

Long qualifier values are truncated today and shown in full only through a `data-tip` hover
tooltip, which the showroom doesn't have. The modal gains an optional prop (default unchanged)
that wraps long values in full, and the showroom uses it.

**Height:** the modal is a centred card with no overall height limit, and its body alone may take
70% of the viewport. At 360 and 390 px of height, Close and the footer actions fall off screen.
The modal is part of the phone layout contract below: header and footer stay visible and the body
scrolls, checked with a long annotation such as ORF1ab.

The modal writes to the clipboard directly today (`navigator.clipboard.writeText`). It gains an
optional copy handler whose default keeps that behaviour, so the showroom can explain without
any clipboard write. The record-changing actions already go through optional callbacks
(`onSetBasesMode`, `onSetShowBases`, `onRemoveSearchDetails`), which the showroom wires to
explanations. The first spec's `view-details` explanation is no longer used for a tap.

### Export

The Hub toolbar's Export opens the real `ExportDialog` over the sample, in a phone-sized layout.
The final button shows an explanation over the dialog, and the dialog **stays open** behind it with
the visitor's choices intact, as in the mockup the owner picked. Today the dialog closes itself
after `onExport` (`ExportDialog.tsx`), so it needs an optional prop whose default keeps that
behaviour.

**Focus:** `ExportDialog` traps focus at the document level and pulls any outside focus back to
its first button. So the explanation must sit inside the dialog's focus boundary. One option is an
optional slot that the dialog renders inside itself. Another is an optional prop that suspends the
trap while an explanation is open. Then:
- the explanation's "Got it" gets focus and Tab stays in the explanation;
- dismissing it returns focus to the final button, with every choice intact.

The explanation along these lines: "On a computer, your browser would
build `<file name>` from these N sequences and save it to your computer. The test drive doesn't
download anything." The builder sets the final wording. It must name the visitor's chosen file
name and format, and the sequence count.

"Edit details", the link the dialog shows when organism names are missing, explains instead of
opening the editor.

### Local search

The Local button in the fuzzy-search method choice looks enabled. Tapping it shows an
explanation and does not switch the method. The status line under the method choice must not
claim "Local search ready". `SearchPanel` gains an optional prop for this (for example a handler
that replaces switching to Local, plus the status text to show). Its default keeps the workbench's
behaviour.

**Focus:** `ExportDialog` traps focus at the document level and pulls any outside focus back to
its first button. So the explanation must sit inside the dialog's focus boundary. One option is an
optional slot that the dialog renders inside itself. Another is an optional prop that suspends the
trap while an explanation is open. Then:
- the explanation's "Got it" gets focus and Tab stays in the explanation;
- dismissing it returns focus to the final button, with every choice intact.

The explanation says that Local finds several
non-overlapping local alignments per record and strand, runs entirely in the browser, and isn't
part of the test drive yet. The workbench's Local behaviour is unchanged.

### Explanations to update

- `hub`: no longer used by the switcher, which now switches for real. Remove it or repurpose it.
- `conservation`: the text about unrelated, unaligned samples no longer applies. The toggle now
  works, so this entry is probably no longer needed.
- `ingest-*`: reused for the Import menu items, with wording checked against `ImportMenu`'s
  current labels (Sequences, Annotations, Alignment, Dunceious project).
- New entries: the commit actions listed above, the export save explanation (which takes the
  file name, format and count as parameters), and `local-search`.

### Touch tooltip fix (shared viewer)

A tap with a finger on an annotation or a record row must not open the viewer's hover tooltip.
Today the tap fires compatibility mouse events, and `Row.tsx` sets the tooltip from them: from
`onMouseOver` on annotation rows, and from `onMouseMove` on tracks. The fix and its tests cover
both. Mouse hover keeps working exactly as today. A pen that can hover keeps today's behaviour.
The fix lives in the viewer and applies to the workbench on touchscreen laptops and tablets as well
as to the showroom.

**Mechanism constraint:** per W3C Pointer Events §11.3, a touch tap fires compatibility
`mousemove`, `mouseover` and `mouseenter` **before** `pointerdown`, and canceling `pointerdown`
never suppresses `mouseover`. So remembering the type at `pointerdown` comes too late. The
recommended mechanism is to drive the tooltip from pointer events (`pointerover` and
`pointermove`, which carry `pointerType`) instead of mouse events. Mouse and pen show the tooltip;
touch does not. The builder may choose another mechanism if it passes the tests below.

## The variant workspace (data)

- **Source:** INSDC GenBank records, fetched from NCBI. The reference is the existing
  `examples/sars-cov-2-NC_045512.gb`. Each variant must be:
  - a complete genome;
  - annotated with at least gene and CDS features;
  - assigned to its Pango lineage, either in the record (for example a `/note` or the strain
    name) or by Pango designation of that accession;
  - nearly free of N runs, preferring records with no ambiguity codes in spike.

  The builder picks the accessions and records why each was chosen. **No GISAID data.** GISAID's
  terms forbid redistribution.
- **Licence:** NCBI places no restrictions on GenBank data, but notes that submitters may claim
  rights. Record the accessions and the NCBI policy link in `examples/README.md` alongside the
  RefSeq note. Skip any record whose submitter claims rights.
- **Alignment:** compute it once, offline, with MAFFT using its default strategy (`--auto`). Run
  it on the four genomes as they appear in their GenBank records, with no trimming or masking.
  Record the exact command, the MAFFT version and SHA-256 checksums of the inputs and the output
  in a provenance file next to the data, following `wasm/local-align/PROVENANCE.json`.
  - **Case:** MAFFT writes nucleotides in lowercase by default, while the GenBank parser
    uppercases every sequence. Feed MAFFT uppercase sequences extracted from the GenBank records,
    and add `--preservecase` (a documented MAFFT option). The provenance records the full command
    with that flag.
  - **Running MAFFT:** a native install or a container image pinned by digest are both fine
    (`wasm/local-align/PROVENANCE.json` already pins a Docker image). Record which one was used.
    If neither works without owner action (for example it needs `sudo`), stop and ask. Don't
    substitute another tool.
  - A custom or hand-made alignment is not acceptable.
- **Files:** a multi-record GenBank file of the three variants (or one file each) plus the
  aligned FASTA, under `examples/sars-cov-2-variants/`. That way desktop users can load the same
  workspace through the normal file picker, and it doubles as a real example. The builder picks
  the file names. FASTA headers must equal the record IDs the GenBank parser assigns. The
  overlay doesn't strip version suffixes, and the reference parses as `NC_045512`, not
  `NC_045512.2`.
- **Loading:** the showroom builds its workspace by parsing the GenBank files with
  `handleBioMessage`, as it does today, and then overlays the alignment through the workbench's
  own pre-aligned FASTA path (`logic/bioResponse.ts`), never by setting `alignedSequence`
  directly. A test checks that the overlay is accepted, not rejected for mismatched IDs, lengths
  or empty sequences.

## Architecture constraints

- **Reuse:** `AnnotationHubPanel` and `ExportDialog` are reused, not copied. Their callback props
  are wired to explanations, or to the showroom's local view state for focus and tab switching.
  The Hub toolbar goes into the showroom top bar through the panel's existing `toolsSlot`.
- **Where the components act on their own,** they need optional props whose defaults keep
  today's behaviour, so the showroom can redirect them:
  - `ImportMenu`'s items, and the panel's own sequence and annotation import paths, click hidden
    file inputs directly;
  - "Edit details" is handled inside the panel and inside `ExportDialog`;
  - `ExportDialog` closes itself after exporting;
  - `SearchPanel`'s Local method needs a showroom override (see *Local search*).
  - `SelectionBar` and `HubList` ask `window.confirm`, and `SelectionBar` shows success messages,
    before or after their callbacks (see *Interception comes before confirmations*);
  - `RecordDetailsModal` and `HitAlignmentSummary` write to the clipboard directly, and the modal
    truncates long values behind hover tooltips;
  - the search disclosures persist their open state in `sessionStorage`;
  - `ExportDialog`, the shortcuts sheet, the details modal and the comparison panel portal outside
    the showroom's inert boundary, and `ExportDialog`'s focus trap would capture the explanation.

  A blanket click guard on `input[type=file]` stays in place as a backstop, but it doesn't replace
  the props: the visitor must see the explanation, not a dead tap.
- **Hub state:** the panel needs `useHubState`, which lives in `hooks/`, and the showroom lint
  rule forbids that folder. `useHubState` holds pure UI state, with no workers and no I/O.
  **My call:** add a narrow, named exception for `@/src/app/hooks/useHubState` to the showroom
  rule, with a comment saying why. Don't relax the rule for the rest of `hooks/`.
- **Phone layout:**
  - At showroom sizes, the Hub (index, tabs, list), the Export dialog and the details modal need a
    compact layout.
    Apply it from the showroom: a scoped stylesheet under the showroom root, or optional props
    whose defaults keep today's rendering.
  - The sequence index may become a drawer like the showroom sidebar.
  - The Export dialog may stack its two steps or scroll inside a full-height sheet.
  - Hard requirements: nothing overlaps or clips at 740×360 and 844×390, and the workbench's
    existing tests and its rendering at 1280×800 are unchanged.
- **Guards:** the context-menu and long-press guards are attached to the viewer's wrapper today,
  which unmounts when the Hub replaces the viewer. Move them to a container that holds both the
  viewer and the Hub, and make them cover the Export dialog's portal too. Editable fields stay
  exempt from the long-press guard. The document-level link guards (`click`, `auxclick`,
  `contextmenu`, and `dragstart` on links) are unchanged. File drops on the Hub reach
  `onDroppedFiles`, which explains.
- **No `data-tip` tooltips in the showroom.** `TooltipLayer` isn't mounted there, and that stays
  so; touch can't hover.
- **Bundle:** the greeter's initial load still pulls only its own chunks. The Hub, Export and the
  variant data load with the showroom chunk on demand. Report the showroom chunk's gzipped size
  before and after in the PR.

## Testing

- **Unit (jsdom):**
  - Hub interactions that work (tab switch, filter, search, focus jump);
  - every commit action, which must call the explanation and never a data callback;
  - no `input[type=file]` is clicked from any Import path;
  - Ctrl/⌘+S and Ctrl/⌘+O explain and are prevented;
  - after a search, the viewer shows per-base hit marks and the result's alignment summary
    appears; its Copy explains without a clipboard write;
  - Export's explanation takes focus, keeps Tab inside it, and on dismissal returns focus to the
    final button with the choices intact;
  - the Export dialog's final button, whose explanation names the file and format;
  - tapping an annotation opens the details panel; Focus moves the viewer; Copy, Export, "Bases
    inside", "Show sequence in viewer" and "Remove search details" explain, and
    `navigator.clipboard.writeText` is never called;
  - Local search explains without switching the method;
  - Compare is present and its menu opens;
  - the Conservation toggle works;
  - the alignment overlay is accepted, and the workspace has four aligned records of one length.
- **Tooltip fix:**
  - the full §11.3 tap sequence on a feature and on a track (`mousemove`, `pointerover`,
    `pointerenter`, `mouseover`, `mouseenter`, `pointerdown`, `mousedown`, `pointerup`, `mouseup`,
    `pointerout`, `pointerleave`, `mouseout`, `mouseleave`, `click`), with touch as the pointer
    type, shows no tooltip at any point;
  - a mouse hover still shows it, including a mouse hover straight after a touch tap with no click
    in between;
  - a hovering pen shows it;
  - a tooltip already showing from a mouse hover is hidden when a touch tap lands elsewhere.
- **e2e (Playwright, phone landscape with touch):**
  - open the Hub, filter, jump to an annotation in the viewer;
  - open Export, switch to GenBank and tap the final button: the explanation appears and no
    download event fires;
  - toggle Conservation;
  - open Compare;
  - no requests to other origins, as in the first spec.
- **Data tests.** The bundled aligned FASTA is MAFFT's output, unedited, and it serves as the
  oracle.
  - **Provenance:** its SHA-256 matches the provenance file.
  - **Sequence integrity:** each ungapped row equals its GenBank record's sequence exactly, case
    included. That proves MAFFT changed nothing but gaps. If MAFFT altered any ambiguity code,
    this test fails; stop and ask rather than patching the data. This checks the residues, not
    the alignment.
  - **Alignment as loaded:** after the showroom builds its workspace, each record's
    `alignedSequence` equals the bundled FASTA row with the same ID, character for character,
    gaps included. That catches a loader that shifts gaps.
  - **Coordinates:** at least one gapped position is checked against an expected column computed
    independently in the test, by counting residues in the bundled FASTA, not by the app's
    transposition code. Use an annotation that lies past a gap in at least one variant, and check
    that Focus lands the viewer on that column. This test is the independent check against the source records.
- Screenshots at 740×360 and 844×390 of the Hub, the Export dialog and the variant viewport go
  in the PR.

## Delivery

1. **`fix(viewer): no hover tooltip from a touch tap`**: the shared-viewer fix with its tests.
   This PR carries this spec as `proposed`.
2. **`feat(showroom): the Annotation Hub, Export and an aligned variant workspace`**: the data and
   its provenance, then the Hub, Export, Details, Compare, Conservation, the search hit marks,
   the memory-only search disclosures, the Local search explanation and the explanation updates. Update `USER_MANUAL.md` (the test drive section) and `ARCHITECTURE.md`
   (the showroom section and the lint exception), and add a `changes/unreleased/` fragment. Set
   this spec to `implemented` with both PR numbers.

## Left to the builder

- Which variant accessions to use, within the criteria above.
- How the compact Hub and Export layouts look, within the hard requirements.
- The mechanism for the tooltip fix.
- Final explanation wording (plain, two or three sentences, matching `explanations.ts`).
- Whether the export save explanation is a parameterised registry entry or a separate callout
  body.

## Still deferred

- Touch drag-to-select and selection handles (mobile PR 2).
- Running Local search for real in the showroom.
- A real-device check on iOS Safari and Android Chrome (so far only jsdom and Chromium touch
  emulation).
- Apple Pencil on iPad (documented limitation from the first round).
