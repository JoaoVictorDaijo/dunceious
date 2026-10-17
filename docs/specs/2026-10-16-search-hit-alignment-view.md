---
title: "Search hit alignments: per-base matches in the viewer and the query on annotations"
status: proposed
date: 2026-10-16
areas: ["search", "viewer", "annotations", "app"]
prs: []
issues: []
superseded_by: null
summary: "Every search hit carries its exact alignment path as a SAM extended CIGAR, so the viewer shows which bases match, mismatch or are inserted or deleted, the results list summarizes them, and annotations created from a hit keep the query and can draw it aligned over the record without changing the record's region."
---
# Search hit alignments — design

Companion to `2026-10-16-search-local-alignment.md` (Local mode). Both need the alignment path of
each hit, so they are built together. The interface follows the owner-approved mockup
`hit-alignment-mockup.html` (untracked, `.code/docs/local-search/` at the primary repository root).

## Why

Owner feedback (2026-10-16), from scientists using the tool:

1. **Hits look the same whatever they contain.** The viewer paints every hit as one solid block
   (`SequenceTrack.tsx`: amber forward, pink reverse). For many biological uses it matters *which*
   positions of a hit are matches and which are mismatches, insertions or deletions, and how often
   each occurs at the chosen thresholds.
2. **Annotations from a hit mirror the record.** `addAnnotationFromSearch` creates a
   `misc_feature` with the hit's coordinates. Its displayed bases come from the record
   (`AnnotationText.tsx`), and the query that found it is not kept. Scientists want to see the
   sequence they searched with on the annotation, without breaking what annotations already do.

## Decisions (owner, 2026-10-16)

- **The mockup is the design.** The owner confirmed it shows what both points meant.
- **The annotation stays the record's region.** Its coordinates, exported bases, GenBank/GFF3
  output and translation still come from the record. The query is an *aligned layer* drawn over
  those columns, not a replacement.
- **Scientific rigor** (`CLAUDE.md`) governs every number and mark shown.
- **The search note in exports is off by default** and opt-in. Today's exports of annotations made
  from hits stay exactly as they are. The full provenance is always kept in the project file.
- **Joined annotations keep today's behaviour,** record bases only. The details say the query layer
  isn't available for them.

## Goals

- Each hit carries an exact alignment path, using a standard notation.
- **The viewer marks every column** of a hit:
  - identical;
  - mismatch;
  - matched through an ambiguity code (whole-query and IUPAC modes);
  - similar (Local mode);
  - record base absent from the query;
  - extra query base.

  Marks are distinguished by shape as well as colour.
- **The results list** shows each hit's counts and an alignment barcode: where along the alignment
  the differences fall.
- **Each hit's alignment text** is available in the EMBOSS pair layout, and can be copied.
- **Annotations created from a hit** keep how they were found, can show "Query aligned to record",
  and lose that layer visibly when edited.

## Non-goals

- Changing how hits are found, or their scores.
- A query layer for joined annotations (Join selected / Join all). Each piece would need its own
  alignment, and one layer over several separately aligned pieces would be easy to misread.
- Editing alignments by hand.

## Anti-goals

- A path whose cost differs from the hit's reported edits or score.
- A mark that changes meaning between modes without saying so.
- An annotation whose exported bases or coordinates change because of the query layer.
- A query layer that stays visible after the annotation no longer covers the aligned region.

## The alignment path

**Notation:** a SAM extended CIGAR, record as reference, query as read (SAMv1 §1.4, hts-specs
`510c107`):

| Op | Meaning | Consumes query | Consumes record |
|---|---|---|---|
| `=` | sequence match | yes | yes |
| `X` | sequence mismatch | yes | yes |
| `I` | insertion to the reference (extra query base) | yes | no |
| `D` | deletion from the reference (record base absent from the query) | no | yes |
| `S` | soft clip (unaligned query end, Local mode) | yes | no |

**Identity rule:**
- `=` and `X` are decided by **symbol identity**: same letter, case-insensitive, with T ≠ U and
  N = N. This is the SAM meaning. Mode rules such as IUPAC acceptance never change a `=` or an `X`.
- What a mode counts as a match is derived *from* the path, never written *into* it
  (*Display classes*).
- The lengths of `=`, `X`, `I` and `S` sum to the query length.
- The lengths of `=`, `X` and `D` sum to the hit's record span, in ungapped record coordinates.

**How each mode gets its path:**
- **Whole query:**
  - the search returns start, end and edits;
  - an exact edit-distance traceback (Wagner–Fischer) over that span recovers a path. A column
    costs 0 when the query's IUPAC alternatives accept the record base, otherwise 1;
    insertions and deletions cost 1;
  - the path's cost must equal the hit's edits; if it doesn't, the search fails visibly;
  - ties between equally cheap paths are broken in this fixed order: diagonal, then `I`, then
    `D`, scanning from the end. Results are therefore deterministic;
  - **bounded memory:** when query length × span fits a fixed cell budget (the builder sets it,
    for example 16 million cells), a full-matrix traceback is used. Above it, rows of the forward
    DP are checkpointed and each block is recomputed from its checkpoint during the traceback
    (recursively while a block exceeds the budget). The recomputed values are the full matrix's,
    so the path is identical by construction; tests require identical paths wherever both can
    run. A plain Hirschberg middle-row split (the method edlib uses) was set aside because it
    doesn't by itself reproduce this tie rule. A very long whole query therefore can't exhaust
    memory. The traceback runs in the worker.
- **IUPAC (exact):** every column is `=` or `X` (ambiguity-accepted), with no indels; the path is
  built directly.
- **Local:** each alignment comes with the engine's own traceback (Huang–Miller, as in
  `matcher`). It is written in this notation: `=` or `X` by symbol identity, `I`, `D`, and `S` for
  unaligned query ends. Path checks follow the Local spec.

**Reverse strand:** the path is computed against the reverse complement, as the hit is, and kept in
that orientation. The display maps it onto forward columns (*Viewer*).

**Gapped (aligned) records:** paths use ungapped coordinates. Alignment gap columns (`-` in the
record) inside a hit's span carry no path operation and keep the existing gap style.

**Protocol:** each result gains `cigar: string` (for example `11=1X12=1I13=1X11=1D14=`). Counts
come from the display classes, not from the raw CIGAR (*Display classes*). The type lives in its
canonical home (`src/domain/bio/types.ts`).

## Display classes

Derived from the path, the two residues and the mode. The match line uses EMBOSS's pair-format
symbols (`ajalign.c`, `alignSim`: identity `|`, similarity `:`, mismatch `.`, gap space).

**In whole-query and IUPAC modes, the class follows the mode's cost** (spec author's call). The
search compares record letters literally against the query's alternatives (`residueAlternatives`),
so the counts always equal the reported edits.

- **Nucleotide:** a query ambiguity code never accepts the same code in the record. A query `N`
  expands to `ACGTU`, not `N`. A record `N` against a query `N` therefore costs an edit and is shown
  as a **mismatch**, even though its CIGAR column is `=` by symbol identity. The tooltip says:
  "Ambiguity code in the record: the search doesn't count it as a match".
- **Protein:** `N` is asparagine and accepts `N`, so N/N is **identical**. `X` expands to the 20
  standard amino acids, not `X`, so X/X is a **mismatch** with the same tooltip. B and Z follow
  their alternatives (`DN`, `EQ`).
- **Local mode** follows matrix scores. Nucleotide N/N is identical and, at −1, not similar;
  protein N/N is identical and similar (+6).

| Class | When | Viewer mark | Match line |
|---|---|---|---|
| Identical | `=`, and the mode counts it as a match (always in Local mode) | hit tint, black letter | `\|` |
| Matched through an ambiguity code | `X`, whole-query or IUPAC mode, and the query's IUPAC alternatives accept the record base | hit tint, dotted underline | `:` |
| Similar | `X`, Local mode, positive matrix score | hit tint, dashed outline | `:` |
| Mismatch | any other `X`; in whole-query or IUPAC mode also a `=` the mode doesn't accept (an ambiguity code in the record) | ink cell (`#0f172a`), white letter; query base shown above | `.` |
| Record base absent from the query | `D` | dark slate cell (`#475569`, as comparison mode marks deletions); `−` in the query row | space |
| Extra query base | `I` | violet caret (`#7c3aed`) between record bases; the inserted bases in a violet flag above the query row; hover or focus names them and the two flanking record positions | none |

- Each mode's legend lists only the classes it can produce. `:` means "matched through an
  ambiguity code" in whole-query and IUPAC modes, and "similar" in Local mode; the legend says
  which.
- The hit tint stays amber (forward) and pink (reverse), active stronger. The marks sit on top of
  it.

## Interface placement: nothing new until it's needed (owner, 2026-10-16)

The owner's main concern is the program filling up with buttons and options. Every new control
therefore lives in the search context, appears only when it applies, and can be minimized. Anything
minimizable uses the app's existing collapsible pattern: a native `<details>`/`<summary>` with a
`SectionTitle` header and a rotating chevron, as the Log Terminal uses.

- **Sequence Search panel, default view:** unchanged from today, apart from one extra row when
  **Fuzzy** is selected: the **Whole query | Local** switch, plus the main threshold of the chosen
  mode (Whole query: the min query identity slider and its edit badge).
- **Local options:** a collapsed "Local options" section, shown only in Local mode, holding min
  identity, min query coverage, the scoring scheme and the notes on ambiguity codes, T/U, ties and
  the overlap filter. Closed by default.
- **Waiting for a long local search** works exactly like waiting for a remote alignment, and reuses
  its components (`AlignmentJobMonitor`, `AlignmentJobPill`, `useDraggableJobPill`), generalized
  rather than duplicated:
  - for the first second the panel shows only a spinner, so quick searches never flash a dialog;
  - after that, a **search job monitor** shows streams searched out of the total, elapsed time,
    **Cancel** and **Minimize**;
  - **Minimize** turns it into the draggable pill, for example "Local search · 12/50 · 8 s"; clicking
    the pill reopens the monitor;
  - when the search finishes, the monitor or pill reports "Search done" and the results appear in
    the panel;
  - if an alignment pill is also showing, the two stack without overlapping.

  Nothing about this waiting state appears until a local search is actually running.
- **Result cards:** compact by default. Each shows position, strand, percentage, edits or score,
  the thin barcode and the counts line. The alignment text sits in a collapsed **Alignment**
  section on each card. Opening it shows the EMBOSS-layout text and a **Copy** button, the card's
  only extra button.
- **Search details:** one collapsed section under the results holds the hidden-hit and skipped
  counts and the legend for the marks. The results header shows only the hit count, plus "more not
  counted" when applicable.
- **Viewer:** the query lane and match line exist only while a search has results, in rows that
  have hits. They are drawn for the active hit and disappear when the search is cleared. No new
  viewer buttons or toolbar items.
- **Annotations:** the third display choice, "Query aligned to record", appears only on
  annotations that carry `_searchHit`. The "Add search details to the note" checkbox appears only in
  the feature editor when the annotation is being created from a hit.
- **Remembered state:** whether a section is open is remembered for the session only, so the panel
  returns to its quiet default in a new session.

## Viewer (sequence track)

- **Zoomed in (letters visible):**
  - every visible hit shows its per-column marks in the record row. Where hits overlap (forward
    and reverse hits, or overlapping IUPAC matches), the active hit's marks win, then the earlier
    hit in results order, so drawing is deterministic;
  - the **active** hit also shows a **Query** row and the **match line** directly above the
    record row, as in the mockup;
  - for a reverse-strand hit, that row is labelled "Query (reverse complement)" and compares like
    with like against the forward record row:
    - identical columns show the record's own forward letter;
    - every other column shows the complement of the aligned query base, in the alphabet that
      `complementAlphabet` gives the record (the alphabet the search used).

    So a mixed `TU` RNA record never shows "identical" over two different letters.
- **Zoomed out:**
  - mismatches are ink ticks above the hit;
  - extra query bases are violet carets with a line through the row;
  - deletions are slate segments in the row.

  Mark density shows how often each kind occurs.
- **Layout stability:** the query and match-line lane is reserved in every record row that has
  hits, so moving between hits never shifts the layout.
- **Performance:** only columns inside the viewport are decoded and drawn. A CIGAR is expanded at
  most once per hit and cached.

## Results list

- **Counts per hit** in words, for example "61 identical, 2 mismatches, 1 insertion,
  1 deletion". "Matched through an ambiguity code" or "similar" is added when present.
- **Alignment barcode:** a thin strip, one cell per alignment column, **in query orientation on
  both strands** (5′→3′; N→C for proteins), so it answers "where in my query are the
  differences". Mismatches are light ticks,
  insertions violet carets, deletions slate notches, on the hit's strand tint. It has an
  `aria-label` with the counts, so nothing depends on colour or sight alone.
- **Alignment text:** expandable per hit, in the EMBOSS pair layout: query line, match line,
  record line, 60 columns per block, with 1-based coordinates at both ends. It can be copied as
  plain text.
  - **Forward hits:** both lines read left to right with ascending coordinates.
  - **Reverse hits** (nucleotide only): the query reads 5′→3′, and the record line shows the reverse-complement strand
    the query matched. Its forward 1-based coordinates count down, which is BLAST's Plus/Minus
    convention, and the line is labelled "NC_… (reverse strand)". The `water` cross-check in
    *Validation 4* covers forward hits only.

## Annotations from a hit

- **Provenance:** an annotation created from a hit stores one internal metadata key,
  `_searchHit`, a JSON string with:
  - the query, mode, parameters (threshold or scoring scheme), strand and CIGAR;
  - the edits, or the score and metrics;
  - the record span at creation;
  - the app version and date.

  Internal (`_`) keys travel in project files but are never exported as qualifiers, the same
  mechanism as `_showBases`.
- **Display choice:** the annotation details offer **Bases inside: Nothing | Record bases |
  Query aligned to record** (today's switch, with a third state). "Query aligned to record" draws
  the query's letters over the record columns, with the same marks as the viewer.
- **Reverse-strand annotations:** follow the minus-strand convention of `annotationBase`, where
  letters read 3′→5′ left to right. The query letters are drawn in reverse column order. Identical
  columns show exactly the letter `annotationBase` shows for the record base there; other columns
  show the query base itself.
- **`annotationBase` fix** (part of this work): it complements in the alphabet
  `complementAlphabet` gives the whole record, as reverse search already does. Minus-strand bases of
  a T-written RNA genome such as SARS-CoV-2 then show T, not U, and the query layer and record bases
  agree. This is the display follow-up noted in #180.
- **Staleness:** the layer is drawn only while the annotation's start, end, strand and segments
  equal the stored record span. After a move, resize or strand change, it is not drawn, and the
  details say: "The search alignment no longer matches this annotation's region." The provenance
  stays, and a **Remove search details** action is offered.
- **Export:**
  - when created from a hit, the feature editor offers **Add search details to the note**, **off
    by default** (owner decision), stored as a flag inside `_searchHit`;
  - the note is **generated at export time** from `_searchHit`, so there is one source of truth.
    It is never written into the feature's own qualifiers;
  - GenBank gets an additional `/note` qualifier and GFF3 a `Note` value. Example: "Found by
    Dunceious fuzzy search (whole query, min query identity 80%): query ATAAG…TAATA (64 nt), 93%
    query identity, 4 edits, CIGAR 11=1X12=1I13=1X11=1D14=". It is free text: shown and preserved,
    never parsed back as data;
  - a **stale** annotation exports no search note, and **Remove search details** removes
    `_searchHit` and with it the note.
- **Unchanged:** coordinates, `segments`, exported sequence, translation, undo and the Hub.

## Validation

1. **Paths:** for every hit, test code checks that:
   - the CIGAR consumes exactly the query and the record span (SAM length rules);
   - `=`/`X` match symbol identity;
   - the whole-query path's cost equals the reported edits. An independent textbook edit-distance
     DP in the test confirms it is minimal;
   - the Local path rescores to the reported score.

   Ties resolve to the documented order.
2. **Display classes:** a unit test for every row of the class table, including:
   - `ATAT`/`AUAU` (T ≠ U);
   - nucleotide `N`/`N`: a mismatch in whole-query and IUPAC modes, with counts equal to the edits;
     identical but not similar in Local mode;
   - protein N/N (identical in every mode) and X/X (a mismatch in whole-query and IUPAC modes);
   - a query `R` against `A` (ambiguity-accepted);
   - a positive BLOSUM62 substitution (similar).
3. **Viewer:** component tests assert the marks by data attribute: class per column, insertion
   caret positions, the reverse-complement query row on reverse hits, reserved lane height, and
   gap columns in aligned records.
4. **Barcode and alignment text:** counts and `aria-label`; the EMBOSS-layout text against a
   fixture hand-checked against `water`'s pair output for the same alignment.
5. **Annotations:**
   - a joined annotation shows record bases only, with the "isn't available" message;
   - an annotation from a hit exports with no search note unless the box was ticked;
   - project save/load round trip of `_searchHit`;
   - staleness after move, resize and strand change;
   - minus-strand letter order;
   - **RNA display alphabets:**
     - a T-written RNA record `TA`, with query `TA` found on the reverse strand, shows `AT` in both
       the minus-strand record bases and the query layer, never `AU` against `AT`;
     - a mixed `TU` record, with query `AA` on the reverse strand, never shows "identical" over two
       different letters in the sequence track;
   - GenBank `/note` and GFF3 `Note` text, with no `_searchHit` in either export.
6. **E2E:** on the bundled SARS-CoV-2 genome, a query with known substitutions, an insertion and a
   deletion shows the expected marks at the expected record positions. Annotating it and switching
   to "Query aligned to record" shows the query.

## Rejected alternatives

- **Replacing the annotation's bases with the query.** It would make the annotation describe a
  sequence the record doesn't contain, breaking exports and translation.
- **Storing the query as a GenBank qualifier only.** A free-text note can't be drawn reliably.
  The internal key carries the data; the note is optional, human-readable provenance.
- **Writing IUPAC acceptance into the CIGAR as `=`.** It contradicts SAM's "sequence match"
  meaning and would mislead anyone reading the CIGAR outside the app.

## Left to the builder

- Canvas drawing details within the class table and the mockup.
- The JSON layout of `_searchHit`, versioned so it can evolve.
- Exact wording of the help texts, following the interface's sentence-case style.

## References

- SAM/BAM format specification v1 (samtools/hts-specs `SAMv1.tex`, commit `510c107`), §1.4 CIGAR.
- Wagner & Fischer (1974), "The string-to-string correction problem", *J ACM* 21:168–173,
  doi:10.1145/321796.321811.
- NCBI BLAST pairwise output, Plus/Minus strand convention (descending subject coordinates).
- Hirschberg (1975), *Commun ACM* 18:341–343, doi:10.1145/360825.360861 (linear-space traceback,
  considered).
- Šošić & Šikić (2017), *Bioinformatics* 33:1394–1395, doi:10.1093/bioinformatics/btw753 (edlib).
- EMBOSS 6.6.0 `matcher.c` (Local mode's traceback, via the Local spec).
- EMBOSS 6.6.0 `ajax/core/ajalign.c` (`alignSim`) and the `water` pair output format.
