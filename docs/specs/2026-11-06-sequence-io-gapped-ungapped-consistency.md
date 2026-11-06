---
title: "Gapped and ungapped sequences: loading, exporting and mixing them consistently"
status: proposed
date: 2026-11-06
areas: ["sequence-io", "viewer", "export", "project-file"]
prs: [296]
issues: [286]
superseded_by: null
summary: "A pre-aligned FASTA loads on an empty workspace, a gapped FASTA on the batch input is loaded ungapped only after the user agrees, every FASTA export offers gapped or ungapped, GenBank export and project files never carry gap characters as residues, and the viewer marks unaligned rows and leaves them out of conservation."
---
# Gapped and ungapped sequences — design

## Why

[#286](https://github.com/JoaoVictorDaijo/dunceious/issues/286) (Murilo, 2026-11-05) sets four
expectations. Checked against `develop` (`a9e97df`):

| Expectation | Today |
|---|---|
| A. A gapped FASTA on the pre-aligned input adds the alignment | Works only as an overlay on records already loaded. On an empty workspace `handleAlignmentUpload` returns without a word (`useFileHandlers.ts:204-207`), and the input is shown as unavailable (`Sidebar.tsx:381`, `ImportMenu.tsx:49` "Load sequences first") |
| B. A gapped FASTA on the batch input loads ungapped, after a pop-up asks permission | Gaps are removed (`bioResponse.ts:183-197`), but records are committed first (`useBioWorker.ts:169-175`). The dialog then tells the user after the fact, and its only button is Dismiss (`GapRemovalNotice.tsx`). `.` is kept as a residue |
| C. GenBank exports are ungapped, and LOCUS length doesn't count gaps | The writer uses `record.sequence`, which is ungapped for FASTA loads. But nothing stops `-` reaching it: the GenBank reader keeps `-` and `*` (`toSeqRecord.ts:42`), and project files don't check `sequence` (`projectFile.ts:112-115`) |
| D. FASTA exports can be gapped or ungapped | Only the Hub export dialog offers both ("Keep alignment gaps", `ExportDialog.tsx:57,159`). The viewer's selection export is always gapped (`useFileHandlers.ts:336-345`), and the record context-menu export is always ungapped (`useFileHandlers.ts:382-388`) |

Allowing A creates a new everyday state: some rows aligned, and later-loaded rows not. **In that
state the conservation track is wrong today.** `GenomeViewer.tsx:215-235` reads an unaligned
row's raw positions as if they were alignment columns, and divides by every record. The consensus
already skips unaligned rows (`consensus.ts:30`).

## Decisions (owner, 2026-11-06)

1. **A:** allow it. On an empty workspace, a pre-aligned FASTA loads its rows as records plus
   their alignment.
2. **B:** a confirm before loading, with Load and Cancel. Cancel loads nothing from that file and
   logs it. `.` is treated as a gap, like `-`.
3. **D:** every FASTA export offers both gapped and ungapped.
4. **Project files:** refuse a damaged file whose ungapped `sequence` field holds gap characters.
   A project keeps the full ungapped sequence and the alignment separately, as today.
5. **Mixed rows:**
   - unaligned rows are left out of conservation, and the track's tooltip says so;
   - a toolbar chip reads "N of M aligned";
   - an unaligned row's label is dashed, with a dashed tick where its sequence ends;
   - all of this follows the approved mockup (`.code/docs/translation-marks/translation-marks.html`,
     #286 section, untracked at the primary checkout root).

   An unaligned row simply shows its own, shorter length.

## Standards

- **[FMT-4](../standards/formats.md#fmt-4-ordinary-fasta-syntax-and-wrapping):** sequences
  loaded outside an alignment have gaps removed. This follows
  [NCBI FASTA guidance](https://www.ncbi.nlm.nih.gov/genbank/fastaformat/), which says not to use
  "?" or "-" characters because they "will be stripped from the sequence". It is an owner
  decision from #267.
- **[FMT-6](../standards/formats.md#fmt-6-aligned-fasta-and-alignment-columns):**
  - aligned FASTA is equal-width rows with gaps as `-`, following Biopython 1.88 AlignIO and
    EMBOSS alignment formats;
  - `.` in an alignment is refused, an owner decision from #249.
- **INSDC Feature Table 11.4 and the GenBank flat file:** the sequence in ORIGIN is residues only.
  A gap of unknown length is a run of `n` described by a `gap` or `assembly_gap` feature, never
  `-`. LOCUS gives the sequence length in residues.
- **[FMT-14](../standards/formats.md#fmt-14-private-project-schema):** project files are a
  private schema, so their checks are Dunceious's own contract.

## Goals

- Every load path ends in a documented state: aligned records, ungapped records, or nothing,
  with the user told which and why.
- Gap characters are never stored as residues, never written into GenBank, and never counted as
  sequence length.
- Every FASTA export lets the user choose gapped or ungapped. In a gapped export, the requested
  aligned file contains only rows that are actually aligned, and any unaligned rows go to a
  second `_unaligned` file.
- Mixed aligned and unaligned rows are visibly marked and kept out of column statistics.

## Non-goals

- **GenBank import validation tiers** (refusing files with `-` or `*` in ORIGIN, LOCUS mismatch,
  and so on). A sibling spec owns them. This spec only adds the writer-side backstop in C.
- Other non-residue characters in FASTA (`?`, digits, internal whitespace): that is
  [#244](https://github.com/JoaoVictorDaijo/dunceious/issues/244).
- Aligning sequences. Dunceious still takes alignments from files or the remote aligner.
- Overlaying an alignment onto a subset of the loaded records. Today's rule, that the overlay
  must name every loaded record, stays as it is.

## Anti-goals

- A record committed before the user agreed to its gaps being removed.
- A gapped FASTA whose rows have different lengths, or that mixes aligned and unaligned rows.
- A GenBank file whose ORIGIN contains `-` or `.`, or whose LOCUS length counts them.
- A column statistic computed over positions that are not alignment columns.

## A. Pre-aligned FASTA on an empty workspace

`handleAlignmentUpload` no longer returns when `records.length === 0`. It reads the workspace
revision before reading the file and carries it in the request, as B does for batch loads. A
response whose revision is stale is discarded and logged before either the aligned load or an
overlay is applied, so an alignment never lands in a replacement workspace. The worker request stays
`PARSE_FASTA` with `asAlignment: true`. `applyFastaResponse` gains a branch for an empty `prev`,
which returns a new kind, `aligned-load`.

- **Checks**, the same as an overlay where they apply, in this order:
  - empty rows refuse the file (`reject-empty`);
  - unequal row lengths refuse it (`reject-length`);
  - `.` refuses it (`reject-dot-gap`, FMT-6);
  - a row with no residues after removing `-` refuses it (`reject-no-residues`).
- **Records:** each row becomes a record whose `sequence` is the row with `-` removed and whose
  `alignedSequence` is the row as written. IDs go through `applyParseSuccess`, so duplicate IDs
  get unique ones as in a batch load, and the batch `idMap` and provenance apply. Details from
  NCBI modifiers are written as in a batch load.
- **Result:** the response replies with the `idMap`, as a batch load does, so a dropped batch can
  attach annotations. It logs "Loaded N aligned sequences (L columns) from <file>".
- **UI:**
  - the Sidebar "Pre-aligned FASTA" input and the Hub import menu's Alignment item become
    available on an empty workspace;
  - their text reads "A pre-aligned FASTA: loads its sequences and alignment" when empty, and
    keeps today's overlay text otherwise;
  - the alignment lock (`isAlignmentLocked`) still disables both.
- **Molecule type** is sniffed as for any FASTA. An empty workspace has no session type to clash
  with.

## B. Confirm before removing gaps on the batch input

`useBioWorker` changes what it does with a batch `FASTA_SUCCESS` whose rows contain `-` or `.`.
The worker changes in one small way: the protocol gains two optional request fields,
`workspaceRevision` and `incomingCategory`, which the `PARSE_FASTA` and `PARSE_GENBANK` handlers
echo back in their responses unchanged, as they echo `filename` today. Parsing is untouched.

**Entry paths.** All three batch paths reach the same branch:
- the Sidebar file picker and the Hub import menu, through `handleFileUpload`, which posts
  untracked messages (`useFileHandlers.ts:170-199`, `upload.ts:90-96`);
- drag-and-drop, through `importDroppedBatch`, which uses tracked requests with a promise and a
  workspace-revision guard (`useFileHandlers.ts:287-300`).

**Every batch commit is checked against the state it started from.** This applies to every
batch sequence response, gapped or not, FASTA or GenBank, and to alignment responses (A). The
confirm step only adds a wait in the middle. The checks, in order, right before any commit:
1. the workspace revision (below);
2. the alignment lock (`isAlignmentLocked`). A response arriving after a remote alignment started
   commits nothing, and the log says the workspace is locked;
3. the molecule category (below).
- **Workspace identity at import start.**
  - `handleFileUpload` reads the workspace revision once, before any file is read, as the drop
    path already does (`useFileHandlers.ts:287-289`).
  - The request carries it (`workspaceRevision`), and the worker echoes it in the response, as
    it echoes `filename` today.
  - A response whose revision differs from the current one is discarded before it is queued or
    committed. The log says "<file> was not loaded: the workspace was replaced". This is
    invalidation, not a per-file refusal: a tracked request rejects and a dropped batch stops.
- **Molecule category at dispatch.**
  - The dispatch-time category (`sniffFastaCategory` or `sniffGenBankCategory`,
    `useFileHandlers.ts:49-71`) is carried the same way, as `incomingCategory`.
  - Right before committing, it is checked against `getLoadedCategory` of the **current**
    records, for every batch response. An empty workspace has no session category and accepts
    either, as the picker does today (`useFileHandlers.ts:186-197`). The comparison runs only
    when records exist.
  - This closes today's gap, where files picked together are all checked against the records
    captured when the picker fired (`useFileHandlers.ts:177-199`). A gap-free nucleotide file
    could then be committed after a protein file was.
  - A mismatch commits nothing. It opens the existing molecule-type mismatch dialog and logs as
    today.
  - A tracked request **settles as handled**, with every parsed ID of the file mapped to `null`.
    This is the rule under "Refusals and invalidation" below, the same for immediate and
    confirmed responses.
  - **Where the drop path refuses.** Today the drop path refuses a mismatch before sending the
    request (`useFileHandlers.ts:306`), when no IDs are known yet. That early refusal moves to
    commit time: the request is sent, the worker parses the file, and the commit-time check
    refuses it with the parsed IDs.
  - **The picker's early check** (`useFileHandlers.ts:186-197`):
    - FASTA files keep it as it is, since picker files carry no annotation mapping;
    - GenBank files are no longer refused or stopped by the early sniff. They always reach the
      worker, and their category is settled only by the commit-time check. This lets the GenBank
      import-validation spec (#298) show a mismatch together with the file's other findings in
      one dialog.

**The pending queue.** Instead of committing, a gapped response becomes a queue entry. Each entry holds:
- the response, plus a preview: the file name, and each record's ID with the number of gap
  characters that would be removed;
- its source: tracked (with the pending request and its `shouldCommit` guard) or untracked;
- the workspace revision and `incomingCategory` captured when its import started, never when it
  was queued.

The entry is the only owner of that response, and it settles exactly once:
1. **Before anything else,** the entry is taken off the queue. A second choice on the same entry
   is impossible.
2. **Load:**
   - First the commit-time checks, in this order:
     - the entry's guard: `shouldCommit` for drops, and the import-start revision against the
       current one for picker and Hub entries;
     - the alignment lock (`isAlignmentLocked`);
     - the session molecule gate against the **current** records, the same `getLoadedCategory`
       check the picker runs at dispatch (`useFileHandlers.ts:186-197`).
   - Any failure: nothing is committed and the log names the reason, for example "<file> was not
     loaded: the session now holds nucleotide sequences". A stale workspace is invalidation and
     rejects a tracked request. A lock or category refusal settles it as handled, with all of the
     file's IDs mapped to `null` (see "Refusals and invalidation" below).
   - Otherwise `applyFastaAndLog` runs against the current records. It strips `-` and `.`,
     commits, logs the removal as today, and resolves a tracked request with the `idMap`.
3. **Don't load:** nothing is committed. The log says "<file> was not loaded: gap removal
   declined".
   - **Picker and Hub** entries have no request to settle.
   - **A dropped file** settles its request as handled, with an ID map that maps **every ID in
     that file to `null`**. It does not reject.
   - `importDroppedBatch` (`dropRouting.ts:52-66`) merges the map and carries on with the next
     files, so one declined file doesn't stop the rest of the batch.
   - A `null` entry already means "attach nothing": `applyAnnotations` skips the name, accession
     and sanitized-ID fallbacks for it and reports the ID as unmatched (`bioResponse.ts:111-112`).
     So an annotation naming a declined ID is never attached to an existing record with the same
     name, or to another file's record. It is reported by the existing "did not match active
     records" warning.
   - When an accepted file in the same batch uses the same ID, the merge already keeps it `null`
     (ambiguous, `dropRouting.ts:62`), so it stays unattached too.

**Refusals and invalidation in a dropped batch** (aligned with the GenBank import-validation
spec, #298):
- **Every per-file refusal settles as handled,** in the same way: no residues, a category
  mismatch, the alignment lock, a declined gap removal, and the sibling spec's validation
  refusals. Each one maps all of that file's IDs to `null`, logs the reason, and lets the batch
  continue.
- **Only invalidation rejects and stops the batch:** the workspace replaced, a worker failure,
  or unmount.
- **The picker and Hub paths** have no batch: each file is logged on its own.
4. **Invalidation.** These clear every entry, rejecting tracked requests and logging one line
   per file ("<file> was not loaded: <reason>"):
   - the workspace is replaced (project load, new session);
   - the worker fails (`useBioWorker.ts:190-204`);
   - the hook unmounts.

**Busy state.** Pending confirmations are a separate piece of state.
- The app derives `busy = isProcessing || pendingConfirmations.length > 0`. While `busy` holds,
  every control that changes the workspace is blocked:
  - project open, through the menu, the Ctrl/Command+O shortcut (`useProjectActions.ts:32`, via
    its `locked` prop), and drag-and-drop;
  - workspace clear;
  - sequence, alignment and annotation imports;
  - the remote aligner's start.

  Other worker responses can still clear `isProcessing` without unblocking these. Anything
  already in flight is still covered by the revision and lock checks above.
- While a confirmation is pending, the processing overlay (`ProcessingOverlay`, `z-[200]`) is not
  shown. The confirm dialog is the topmost layer, so both buttons can be reached.

**The dialog.** It replaces `GapRemovalNotice`, reusing its structure: alertdialog, focus trap,
Escape handling and the NCBI link.
- Title: "Remove alignment gaps?"
- Body: "<file> contains gap characters. Loaded as sequences, gaps are removed and positions refer
  to the ungapped sequence. To keep the alignment, load it as a pre-aligned FASTA instead." Then
  the per-record list.
- Buttons: **Load without gaps**, the default focus, and **Don't load**. Escape means Don't load.
- Entries are asked one at a time, in arrival order, and the dialog shows "1 of 3".

**Gap characters.** On this path `-` and `.` are both removed and both counted. A record left
with no residues still refuses the whole file, as today. A file without gap characters loads
straight away, with no dialog.

## C. GenBank writer backstop

`exportToGenBank` (`serialize.ts:45`) checks each record's `sequence` before writing it.

- **A `-` or `.` in it means the record is damaged.** Stripping would silently shift every
  feature coordinate after the gap.
- The writer leaves that record out of the file, and the export report and log name it:
  "<id> not exported: its sequence contains gap characters".
- With the sibling spec refusing such GenBank imports, and decision 4 refusing such project
  files, this should never trigger. It is a backstop, not a repair.
- LOCUS length and ORIGIN keep reading `record.sequence`, which is residues only. The Hub export
  preview (`describeExport`) shows the same omission before the user exports.

## D. Every FASTA export offers gapped or ungapped

There is one rule for every path. **Gapped** writes each aligned row's `alignedSequence`.
**Ungapped** writes `sequence`. With a selection, both slice the same aligned window:

- gapped writes the aligned slice;
- ungapped writes the residues inside it, which is the aligned slice with `-` removed.

For an unaligned row the window is its own positions, which is what the viewer shows under the
selection.

**Edges of the window.**
- **Wider than the alignment.** The viewer's width is the longest row (`GenomeViewer.tsx:186-189`),
  so a selection can run past the alignment's columns. A gapped export clips the window to the
  alignment width. When nothing of the window is inside it, the gapped item is disabled, with the
  tooltip "The selection is outside the alignment".
- **No residues in the window.** A gapped export still writes an aligned row that has only gaps
  in the window. It is a valid aligned FASTA row (FMT-6), and every row keeps the same width. The
  log names such rows, since A would refuse them on reload. An ungapped export leaves out rows
  with no residues in the window and names them.

- **Viewer selection and alignment export** (toolbar download button, and the Sidebar export):
  - the button opens a two-item menu: "Aligned, with gaps" and "Sequences only, no gaps";
  - the first item is disabled, with a tooltip saying why, when no row is aligned;
  - file names stay `selection_export.fasta` and `msa_export.fasta`.
- **Record context menu and the record details dialog's Export FASTA button**
  (`RecordDetailsModal.tsx:163-165, 397-404`). Both call `handleExportRecord`, which gains a mode
  argument:
  - an aligned record offers "FASTA (no gaps)" and "FASTA (aligned)";
  - an unaligned record offers only the first.
- **Hub export dialog:** keeps "Keep alignment gaps", with the mixed-rows rule below.
- **Mixed rows in a gapped export (owner, 2026-11-06): two files.**
  - The aligned rows go into the requested file. A gapped FASTA must be equal-width rows
    (FMT-6).
  - The unaligned rows go into a second file beside it, named with `_unaligned` before the
    extension, e.g. `selection_export_unaligned.fasta`. They are written as plain sequences,
    since they have no alignment columns.
  - The log says why, briefly, after saving: "2 sequences aren't in the alignment, so they have
    no alignment columns and were saved separately in <name>_unaligned.fasta". The Hub
    dialog's preview says it before saving: "2 sequences aren't in the alignment and will be
    saved separately in <name>_unaligned.fasta".
  - With a selection, the unaligned rows are sliced over their own positions, as the viewer
    shows them.
  - An ungapped export writes every chosen row into one file.

`exportToFasta` (`fasta.ts:69`) gets this rule once. A `residues: 'aligned'` export returns the
aligned text plus the unaligned rows as a second text, reported, and there is an ungapped slice
mode. Every caller downloads both files when there are two, so no path keeps its own variant.

## Project files

`parseProject` (`projectFile.ts:89-118`) adds two checks. The existing per-record
`alignedSequence` checks stay, and the format number does not change here.
- **A record whose `sequence` contains `-` or `.`** is refused: "This project file contains gap
  characters in the sequence of <id>; the file is damaged".
- **All aligned rows must have one common width** (FMT-6). A project whose `alignedSequence`
  values differ in length is refused: "This project file contains an alignment whose rows have
  different lengths". Today such a file passes, because each row is only checked against its own
  record (`projectFile.ts:107-116`). Without this check, gapped exports and conservation would
  read unequal rows as columns.

## Mixed aligned and unaligned rows

- **Which rows count.** The conservation toggle, the track, its tooltip counts and the toolbar
  chip all count the same rows: **visible** records. Hidden records are not processed by the
  worker (`useBioWorker.ts:212`) and are not drawn (`App.tsx:541`), so they count for none of
  these.
- **Conservation control:** its availability follows the visible aligned rows, not today's
  equal-length test.
  - Today `isAlignmentLoaded` (`viewModel.ts:111`) requires every row, aligned or raw, to have
    the same length, and the toolbar toggle uses it to disable itself (`TopNav.tsx:166`,
    `App.tsx:327`). One longer unaligned row would lock the track off.
  - The toggle is enabled when at least two visible rows have an `alignedSequence`.
  - When it is disabled, its tooltip says "Conservation needs at least two aligned sequences".
  - Other uses of `isAlignmentLoaded` are checked and kept as they are, on purpose.
- **Conservation** (`GenomeViewer.tsx:215-235`):
  - computed over aligned rows only, at alignment columns;
  - the score keeps today's definition: the count of the most frequent residue, divided by the
    number of rows taking part, which is now the aligned rows. The metric itself belongs to
    OBS-30, and this change narrows only which rows count;
  - with fewer than two aligned rows the track shows nothing, and its label tooltip says
    "Conservation needs at least two aligned sequences";
  - when some rows are left out, the tooltip says "From N aligned sequences; <ids> not in the
    alignment".
- **Toolbar chip:**
  - "N of M aligned", shown only when at least one row is aligned and at least one isn't;
  - it uses the ghost style of the viewer toolbar from the mockup;
  - its tooltip names the unaligned rows and says they are left out of conservation, and saved
    to a separate file in gapped exports.
- **Row label:** an unaligned row in a mixed workspace gets a dashed outline. Its tooltip reads
  "Not in the alignment. Positions are this sequence's own, so its row doesn't line up with the
  aligned rows."
- **End tick:** a dashed tick marks where an unaligned row's sequence ends, with the tooltip
  "<id> ends here: L bp, not aligned". The unit is `aa` in a protein workspace.
- **Other paths, checked:**
  - Selection drag works on each row's own positions.
  - JSON selection export maps aligned rows through `getOriginalPos` and leaves unaligned rows
    as they are (`useFileHandlers.ts:351-356`).
  - Search reads `alignedSequence || sequence` (`exact.ts:129-141`; `fuzzy.ts:253-261` removes
    gaps and maps back). So an unaligned row is searched in its own positions, and an aligned row
    across its gaps, as today.
  - Consensus already skips unaligned rows.
  - None of these change.
- **Overlay import later:** importing another alignment that leaves out a loaded unaligned record
  is refused, as today (`reject-mismatch`). The log adds which missing IDs are the unaligned
  ones, so the reason is clear.

## Validation

Expected results are written by hand from the input strings: residues are counted directly, and
gaps by character. They never come from the code under test.

| Guarantee | Test | Cases |
|---|---|---|
| A: aligned load | `bioResponse.test.ts` | Empty workspace, `>a AC--GT` / `>b ACTTGT`: records `a` with `ACGT` aligned `AC--GT`, `b` with `ACTTGT`. Unequal lengths, `.`, an empty row and an all-gap row each refuse with nothing loaded. Duplicate IDs get unique IDs. The reply carries an `idMap` |
| A: UI | `Sidebar` / `ImportMenu` tests | The pre-aligned input is enabled on an empty workspace with the new text, and disabled while the alignment is locked |
| B: hold and confirm | `useBioWorker.test.tsx` | A gapped batch file commits nothing until Load, then commits ungapped records. Don't load: nothing committed, the log line is written, and a dropped file settles as handled with every one of its IDs mapped to `null`. Two files queue as "1 of 2". A file without gaps loads with no dialog. Each of the picker, Hub and drop paths reaches the dialog |
| B: settle once, invalidate | `useBioWorker.test.tsx` | Workspace replaced while a dropped file waits: Load commits nothing and the request rejects. Worker failure while waiting: the queue clears with log lines. A second click on the same entry does nothing |
| B: declined or refused drop continues | `dropRouting` / `useFileHandlers` tests | Drop gapped A, valid B and an annotation file. Declining A loads B and its annotations, and the annotation rows for A's IDs are reported as unmatched. The workspace already holds a record `a`, and the declined file also has ID `a`: the annotation for `a` is not attached to the existing record. An accepted file in the same drop also using `a`: `a` stays unattached. A gap-free category-refused file followed by a valid file and an annotation file: the valid file and its annotations load, and the refused file's annotation IDs are reported as unmatched. Workspace replaced mid-batch: the batch stops |
| B: lock and empty session | `useBioWorker.test.tsx` | A gap-free response arriving after a remote alignment started commits nothing. A protein FASTA (immediate and confirmed) and a protein GenBank file each load into an empty workspace |
| Busy blocks the workspace | `App` test with the dialog mounted | While a confirmation is pending, Ctrl/Command+O, workspace clear, imports and the remote aligner do nothing |
| A: stale alignment | `useFileHandlers` test | The workspace is replaced, empty or with matching records, before the alignment read finishes or before its response arrives: nothing is applied, and the log says why |
| B: molecule gate on every commit | `useFileHandlers` / `useBioWorker` tests | Empty workspace, a gapped protein file and an ungapped nucleotide file picked together. Nucleotide commits first: Load on the protein refuses. Protein is confirmed first, then the slower nucleotide file's read finishes: the nucleotide file refuses. The same with a GenBank file in place of the nucleotide FASTA |
| B: replacement before queueing | same | Pick a fast file and a slow gapped file. The fast response clears processing, then the workspace is replaced, then the slow response arrives: it is discarded and never queued, and the log says why. A slow read across replacement behaves the same. Two files in the same workspace still both load |
| B: dialog on top | `App` test with the real overlay mounted | While a confirmation is pending and another response arrives, the dialog stays reachable, both buttons work, and workspace actions stay blocked |
| B: `.` | `bioResponse.test.ts` | Batch `AC..GT` loads as `ACGT`, counting 2 removed |
| B: stale state | `useBioWorker.test.tsx` | A file confirmed after another load committed is applied to the current records, and no records are lost |
| C: writer backstop | `serialize.test.ts`, `exportPlan.test.ts` | A record whose `sequence` is `AC-GT` is left out and reported. The preview shows it. A clean record's LOCUS is `4 bp` for `ACGT` |
| D: one rule | `fasta.test.ts` | Aligned `AC--GT` with selection `[1,5)`: gapped `C--G`, ungapped `CG`. Mixed set: gapped returns the aligned rows as one text and the unaligned rows as a second `_unaligned` text, with the message; ungapped writes all rows in one text. Every export path downloads both files when there are two. Selection `[2,4)` on `AC--GT`: gapped writes `--` and names the row; ungapped leaves it out and names it. Aligned width 4 with an unaligned row of 8, selection `[5,7)`: gapped item disabled |
| D: every path | `useFileHandlers`, context-menu and `RecordDetailsModal` tests | The toolbar menu, the Sidebar export, the record context menu and the details dialog each offer both modes. The aligned item is disabled when no row is aligned. An unaligned record offers one item |
| Project refusal | `projectFile.test.ts` | `sequence: "AC-GT"` refuses with the damaged-file message. Rows `AC--GT` (6 columns) and `ACTTGT--` (8 columns) refuse with the unequal-width message. A valid aligned project still loads |
| Conservation | `GenomeViewer` / pure helper and `TopNav` tests | Two aligned rows of width 6 plus one unaligned row of length 8: the toggle is enabled, and scores use the two aligned rows only, against hand-computed values. One aligned row: the toggle is disabled with its tooltip, and there are no scores. Hiding one of two aligned rows disables the toggle and updates the chip; showing it again restores both |
| Mixed marks | `ViewerToolbar` / `Row` tests | The chip appears only in mixed workspaces and names the unaligned IDs. The unaligned label is dashed. The end tick sits at the row's length and says `bp`, or `aa` in a protein workspace |

## Living documents

- **FMT-4:** the confirm before removal, and `.` removed on the batch path.
- **FMT-6:** loading on an empty workspace, and gapped exports splitting unaligned rows into a
  second file.
- **FMT-14:** the project-file refusal.
- **FMT-2:** the GenBank writer backstop, coordinated with the sibling import-validation spec.

## Rejected alternatives

- **Strip gaps in the GenBank writer.** Feature coordinates after the gap would silently shift.
- **Keep the after-the-fact notice and add Undo.** The records are already committed, and
  annotations from a dropped batch are already attached. The owner asked for permission first.
- **Write unaligned rows into a gapped FASTA, padded with `-`.** That invents an alignment the
  data does not have.
- **Leave unaligned rows out of a gapped export.** The first draft did this. The owner chose a
  second file instead, so no chosen sequence is silently missing from the export.
- **Show conservation over all rows in a mixed workspace.** Raw positions are not alignment
  columns, so the score would mean nothing.

## Related

- [#267](https://github.com/JoaoVictorDaijo/dunceious/issues/267) and its PRs
  [#269](https://github.com/JoaoVictorDaijo/dunceious/pull/269) and
  [#270](https://github.com/JoaoVictorDaijo/dunceious/pull/270): batch gap removal and its
  notice.
- [#249](https://github.com/JoaoVictorDaijo/dunceious/issues/249): `.` refused in alignments.
- [#244](https://github.com/JoaoVictorDaijo/dunceious/issues/244): other FASTA characters.
- [#266](https://github.com/JoaoVictorDaijo/dunceious/pull/266): overlay residue check.
- The sibling GenBank import-validation spec (#286 point C, refusal tiers). It owns import-side
  refusal, and this spec owns the writer backstop.

## Left to the builder

- Whether the pending-confirmation queue lives in `useBioWorker` or a small hook beside it.
- Exact wording within the meanings above.
