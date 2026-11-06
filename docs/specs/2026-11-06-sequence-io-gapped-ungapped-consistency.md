---
title: "Gapped and ungapped sequences: loading, exporting and mixing them consistently"
status: proposed
date: 2026-11-06
areas: ["sequence-io", "viewer", "export", "project-file"]
prs: []
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
- Every FASTA export lets the user choose gapped or ungapped. A gapped export contains only rows
  that are actually aligned.
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

`handleAlignmentUpload` no longer returns when `records.length === 0`. The worker request stays
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

The worker stays unchanged. `useBioWorker` changes what it does with a batch `FASTA_SUCCESS`
that has gaps:

1. **Hold, don't commit.** If any row contains `-` or `.`, nothing is committed. The response
   goes into a pending queue with a preview: the file name, plus each record's ID and the number
   of gap characters that would be removed. Its request promise stays unsettled.
2. **Ask.** A confirm dialog replaces `GapRemovalNotice`, reusing its structure: alertdialog,
   focus trap, Escape handling and the NCBI link.
   - Title: "Remove alignment gaps?"
   - Body: "<file> contains gap characters. Loaded as sequences, gaps are removed and positions
     refer to the ungapped sequence. To keep the alignment, load it as a pre-aligned FASTA
     instead." Then the per-record list.
   - Buttons: **Load without gaps**, the default focus, and **Don't load**.
   - Several pending files are asked one at a time, and the dialog shows "1 of 3".
3. **Load.** `applyFastaAndLog` runs against the **current** records, not the ones from when the
   file arrived, because other loads may have finished meanwhile. It strips `-` and `.`, commits,
   logs the removal as today, and settles the request with the `idMap`.
4. **Don't load.** Nothing is committed. The log says "<file> was not loaded: gap removal
   declined". The request settles as an `ERROR`, so a dropped batch attaches no annotations to
   it, the same path as `reject-no-residues` (`useBioWorker.ts:52`).
5. **Gap characters.** On this path `-` and `.` are both removed, and both are counted. A record
   left with no residues still refuses the whole file, as today.
6. **No gaps, no dialog.** A file without gap characters loads straight away, as today.

`isProcessing` stays true while a confirmation is pending, so other actions wait as they do for
a running load.

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

- **Viewer selection and alignment export** (toolbar download button, and the Sidebar export):
  - the button opens a two-item menu: "Aligned, with gaps" and "Sequences only, no gaps";
  - the first item is disabled, with a tooltip saying why, when no row is aligned;
  - file names stay `selection_export.fasta` and `msa_export.fasta`.
- **Record context menu:**
  - an aligned record shows two items, "Export FASTA (no gaps)" and "Export FASTA (aligned)";
  - an unaligned record shows only the first.
- **Hub export dialog:** keeps "Keep alignment gaps", with the mixed-rows rule below.
- **Mixed rows in a gapped export:**
  - only aligned rows are written, since a gapped FASTA must be equal-width rows (FMT-6);
  - unaligned rows are left out, and the log, plus the Hub dialog's preview, names them:
    "2 sequences not in the alignment were left out of the aligned FASTA";
  - an ungapped export writes every chosen row.

`exportToFasta` (`fasta.ts:69`) gets this rule once: a `residues: 'aligned'` option that skips
rows without `alignedSequence` and reports them, plus an ungapped slice mode. Every caller then
uses it, so no path keeps its own variant.

## Project files

`validateProject` (`projectFile.ts:89-118`) refuses a record whose `sequence` contains `-` or
`.`: "This project file contains gap characters in the sequence of <id>; the file is damaged".
The existing `alignedSequence` checks stay. The format number does not change here.

## Mixed aligned and unaligned rows

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
  - its tooltip names the unaligned rows and says they are left out of conservation and of
    gapped exports.
- **Row label:** an unaligned row in a mixed workspace gets a dashed outline. Its tooltip reads
  "Not in the alignment. Positions are this sequence's own, so its row doesn't line up with the
  aligned rows."
- **End tick:** a dashed tick marks where an unaligned row's sequence ends, with the tooltip
  "<id> ends here: L bp, not aligned".
- **Other paths, checked:**
  - Selection drag works on each row's own positions.
  - JSON selection export maps aligned rows through `getOriginalPos` and leaves unaligned rows
    as they are (`useFileHandlers.ts:351-356`).
  - Search runs on each record's own residues.
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
| B: hold and confirm | `useBioWorker.test.tsx` | A gapped batch file commits nothing until Load, then commits ungapped records. Don't load: nothing committed, the request rejects, the log line is written, and a dropped batch attaches no annotations. Two files queue as "1 of 2". A file without gaps loads with no dialog |
| B: `.` | `bioResponse.test.ts` | Batch `AC..GT` loads as `ACGT`, counting 2 removed |
| B: stale state | `useBioWorker.test.tsx` | A file confirmed after another load committed is applied to the current records, and no records are lost |
| C: writer backstop | `serialize.test.ts`, `exportPlan.test.ts` | A record whose `sequence` is `AC-GT` is left out and reported. The preview shows it. A clean record's LOCUS is `4 bp` for `ACGT` |
| D: one rule | `fasta.test.ts` | Aligned `AC--GT` with selection `[1,5)`: gapped `C--G`, ungapped `CG`. Mixed set: gapped writes only aligned rows and reports the others; ungapped writes all |
| D: every path | `useFileHandlers` and context-menu tests | The toolbar menu, the Sidebar export and the record context menu each offer both modes. The aligned item is disabled when no row is aligned. An unaligned record's menu shows one item |
| Project refusal | `projectFile.test.ts` | `sequence: "AC-GT"` refuses with the damaged-file message. A valid aligned project still loads |
| Conservation | `GenomeViewer` / pure helper test | Two aligned rows plus one unaligned: scores use the two aligned rows only, against hand-computed values. One aligned row: no scores, plus the tooltip text |
| Mixed marks | `ViewerToolbar` / `Row` tests | The chip appears only in mixed workspaces and names the unaligned IDs. The unaligned label is dashed. The end tick sits at the row's length |

## Living documents

- **FMT-4:** the confirm before removal, and `.` removed on the batch path.
- **FMT-6:** loading on an empty workspace, and gapped exports containing only aligned rows.
- **FMT-14:** the project-file refusal.
- **FMT-2:** the GenBank writer backstop, coordinated with the sibling import-validation spec.

## Rejected alternatives

- **Strip gaps in the GenBank writer.** Feature coordinates after the gap would silently shift.
- **Keep the after-the-fact notice and add Undo.** The records are already committed, and
  annotations from a dropped batch are already attached. The owner asked for permission first.
- **Write unaligned rows into a gapped FASTA, padded with `-`.** That invents an alignment the
  data does not have.
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
