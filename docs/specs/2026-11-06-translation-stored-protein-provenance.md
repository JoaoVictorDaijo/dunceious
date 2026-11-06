---
title: "Stored CDS translations: one read-only protein, recomputed after edits, curated differences shown"
status: proposed
date: 2026-11-06
areas: ["translation", "viewer", "annotations", "genbank", "project-file"]
prs: [291]
issues: [253, 261, 288]
superseded_by: null
summary: "A CDS keeps one stored /translation that users cannot type over. Edits that change its coding bases, frame, code or ends replace it with the conceptual translation under NCBI rules, or remove it with a warning when the CDS no longer translates cleanly. Imported proteins that differ from the DNA are kept and marked codon by codon."
---
# Stored CDS translations — design

## Why

[#253](https://github.com/JoaoVictorDaijo/dunceious/issues/253) (OBS-26): editing an imported
CDS's location or strand keeps its old `/translation`. Three places trust it:

- the viewer (`translateFeature`, `sequence.ts:308`);
- the early-stop flag (`isFeatureBroken`, `sequence.ts:338`);
- GenBank export (`serialize.ts:76`).

With `ATGAAATAAATGTGATAA`, a CDS at `[0,9)` with `/translation="MK"` moved to `[9,18)` encodes
`ATG TGA TAA`, which has an internal stop. The viewer still shows `MK_`, raises no early-stop
flag, and export writes `/translation="MK"`.

**There are also two copies of the protein:**
- `featureParser.ts:92-95` sets both `feature.translation` and `metadata.translation`.
- The editor's qualifier rows change only `metadata.translation`.
- The viewer, the early-stop flag, the details modal and its copy button
  (`RecordDetailsModal.tsx:148-150, 341-355`) and feature comparison (`featureComparison.ts:81`)
  read `feature.translation`.
- Export and the hub tooltip read `metadata.translation`.

## Requirement (collaborator, 2026-11-06)

Murilo, on #253:

> On Editing: When a CDS geometry, strand, phase, or genetic code is edited, the stored
> translation must be invalidated and recomputed from the new sequence (replace).
> On Importing Curated Files: When loading a GenBank file where an annotated /translation
> differs from the computed sequence (e.g., curated variants), keep the original translation
> intact but flag it with a visual warning (lighter fill, as referenced in #261).

## Standards and reference tools

- **INSDC Feature Table 11.4 (April 2026):**
  - `/translation` is the amino-acid sequence derived from the CDS under `/transl_table`,
    `/codon_start` and `/transl_except`, written in one-letter amino-acid codes. It is allowed
    on CDS only.
  - `/exception` marks a CDS whose product differs from its conceptual translation.
  - A complete amino terminus requires `/codon_start=1`.
- **NCBI C++ Toolkit `912b751`:**
  - `x_Translate` (`sequence.cpp:3670`) reads the initiator as M only for a 5′-complete CDS in
    frame 0.
  - The same function (`:3724-3729`) reads the last codon of a 3′-complete CDS as a stop in
    tables where that codon can be either a stop or a residue (27, 28, 31).
  - `TranslateToProtein` (`:4024`) drops a trailing `*`.
  - The flatfile writer (`feature_item.cpp:2386-2425`) has two paths. Its recompute path
    translates with `include_stop=false`, which cuts at the first stop (`sequence.cpp:3741`).
    Its product-copy path copies an existing product, which can keep an internal `*`.
  - The validator reports a stored protein that differs from the conceptual one, and an internal
    stop, as separate diagnostics (`translation_problems.cpp`, `cdregion_validator.cpp:622`).
- **Project rules** in `docs/standards/translation.md`:
  - TRANS-1, genetic code from `/transl_table`; an invalid code yields no residue claim;
  - TRANS-2, `/codon_start`;
  - TRANS-3, alternative initiators;
  - TRANS-4, `/transl_except`.
- **How other tools treat a stored translation** (documentation and source survey, 2026-11-06;
  nothing was run):
  - Geneious separates a computed "Automatic Translation", which is not exported, from a stored
    Translation property.
  - CLC lets the user extract the stored translation or compute one.
  - table2asn replaces computed products only through a separate protein file.
  - Benchling recomputes a translation when its genetic code changes.
  - None documents an outright ban on hand edits. The strongest examples keep computed and
    stored proteins apart, which this design does.

## Decisions (owner, 2026-11-06)

1. **Display.** A curated `/translation` that differs from the DNA is drawn with its stored
   residues. Each differing codon is marked as in the approved mockup, and every mark explains
   itself on hover. The early-stop flag and the amino-acid count follow the DNA.
2. **`/translation` cannot be hand-edited.** The editor shows it read-only, labelled
   "Imported" or "Computed from the DNA".
3. **What triggers a recompute.** A change to any of these: `start`, `end`, `segments`, `strand`,
   `/codon_start`, `/transl_table`, a partial end (`<`, `>`), or any `/transl_except` value
   (added, removed or changed). Label, colour, note and other qualifier edits keep the stored
   protein.
4. **Export after an edit** writes the recomputed `/translation`. **When the edited CDS has an
   internal stop, export omits `/translation` and warns** that the CDS needs fixing or
   `/pseudo`. The same applies when the edited CDS has no valid genetic code, or carries a
   `/transl_except` that cannot yet be applied (see PR 2).
5. **`/transl_except`** follows NCBI and ships in its own PR (PR 2). Until then, a CDS that
   carries it is never recomputed and is marked "can't verify".
6. **Import** warns once per file with a count. The count is an application choice: NCBI's
   validator treats a mismatch as an error, but Dunceious keeps the file and shows the
   difference. A CDS with `/exception` keeps its stored protein without a warning, because INSDC
   expects it to differ. Its marks still show on hover, with the exception named.
7. **Edit undo** is not part of this work. The app can only undo deletions
   (`useFeatureManager.ts:131-170`), and saving an edit cannot be undone today.
8. **Ships as three PRs:**
   - PR 1: one stored protein, read-only, recomputed on edit;
   - PR 2: `/transl_except`;
   - PR 3: the codon marks.
9. **The project file format goes from 2 to 3.** Versioning exists already
   (`projectFile.ts:41-44, 93-94`). Format 2 files still load: the loader moves
   `feature.translation` into `metadata.translation` when that is absent. There is no
   compatibility work beyond this, since nobody uses project files yet.
10. **One initiator helper,** `initiatorResidue`, is shared with the
    [#261](https://github.com/JoaoVictorDaijo/dunceious/issues/261) greeter fix.
11. **Counts follow NCBI and Ensembl (#259).** The metric is *translation positions*: the
    conceptual translation's length without the terminal stop. Internal stops count as one
    position each, and so do X, U and O. The display labels it "aa" only when there is no
    internal stop. Otherwise it reads, for example, "3 positions, 1 internal stop", because a
    stop is not an amino acid.

## Goals

- One stored protein per feature, `metadata.translation`, read through one accessor.
  `feature.translation` is removed.
- After an edit from decision 3, the display, early-stop flag, counts, details and export all
  describe the current CDS. Export says so when it cannot.
- Imported proteins are never overwritten silently, and their differences from the DNA are
  visible and explained.

## Non-goals

- Edit undo (decision 7).
- `/transl_except` application in PR 1 (decision 5).
- Restructuring the editor beyond making `/translation` read-only.

## Anti-goals

- A stored protein drawn, counted or exported for a location it no longer describes.
- A guessed protein exported as if it were the derived one: under an invalid code, an
  unapplied exception, or with an internal stop.
- A "differs" mark caused by the conventions themselves:
  - the omitted terminal stop;
  - `M` at a valid alternative start;
  - `X` against a residue its ambiguous codon allows;
  - an applied exception.

## Model

```ts
/** src/domain/bio/translation.ts (new). */

type ConceptualTranslation =
  | {
      status: 'ok';
      residues: string;           // one per translated codon; terminal stop removed; internal stops '*'
      possible: string[];         // per codon: every residue its IUPAC expansions allow under the table
      internalStops: number[];
      threePrimeIndeterminate: boolean;  // last codon's expansions mix stops and residues
    }
  | { status: 'unavailable'; reason: 'invalid-code' | 'unsupported-exception' | 'empty' };

/** The CDS's conceptual translation under NCBI rules. Never reads the stored protein. */
export function conceptualTranslation(feature: BioFeature, record: SeqRecord): ConceptualTranslation;

/** gc.prt Starts row: 'M' when `codon` is a start of `translTable`, else undefined. */
export function initiatorResidue(codon: string, translTable: number): 'M' | undefined;

/** Per-codon comparison of a stored protein with an 'ok' conceptual translation. */
export function compareTranslation(stored: string, conceptual: Extract<ConceptualTranslation, { status: 'ok' }>): {
  differing: number[];          // codon indices with a definite disagreement
  storedExtra: string;          // stored residues past the last codon
  storedShortBy: number;        // conceptual residues past the end of the stored protein
};

/** The one accessor for the stored /translation qualifier, whitespace removed. */
export function storedTranslation(feature: BioFeature): string | undefined;

/** INSDC CDS, including GFF3's SO:0000316. ORF display eligibility stays a separate check. */
export function isCds(feature: BioFeature): boolean;
```

**Conceptual translation, in order.** Each step names the reference behaviour it follows.

1. **Genetic code.** If `/transl_table` is not an NCBI code (TRANS-1), the result is
   `unavailable: 'invalid-code'`. The #288 assumed-table display is a separate view, and its
   residues never feed this function.
2. **Exceptions.** In PR 1, any `/transl_except` gives `unavailable: 'unsupported-exception'`.
   PR 2 replaces this step with NCBI code-break substitution.
3. **Coding sequence.** `extractCodingSequence` applies segments, strand and `/codon_start`. An
   empty result is `unavailable: 'empty'`.
4. **Codons.** Each codon is expanded over its IUPAC bases, and `possible` records every
   residue the expansions give. The residue is then chosen:
   - one possible residue: that residue, e.g. GCN gives A;
   - exactly {D, N}: B; {E, Q}: Z; {I, L}: J;
   - anything else: X.

   This follows NCBI's codon-state alphabet. X for every other mixed set is Dunceious's own
   representation, documented in TRANS-1. It is new code beside `translateSequence`, which
   keeps its context-free contract.
5. **Initiator.** Codon 1 becomes `M` when all three hold:
   - the CDS is 5′-complete;
   - `/codon_start` is 1;
   - `initiatorResidue` returns `M` for the literal codon (TRANS-3, NCBI `sequence.cpp:3670`).

   An ambiguous first codon is not rewritten.
6. **Leftover bases.** One or two bases after the last whole codon are padded with N, as NCBI's
   `x_Translate` does (`sequence.cpp:3696`). The padded codon is kept only when step 4 gives a
   single residue. For example, `ATGGC` gives `MA`, because GC plus any base is A. Otherwise it
   is dropped. Either way, the result is never a stop.
7. **Terminal stop.** For a 3′-complete CDS, look at the last codon's expansions under the
   table's stop rows. This includes the context-dependent stops of tables 27, 28 and 31 (NCBI
   `sequence.cpp:3724-3729`, which checks the codon state):
   - every expansion is a stop: the codon is the terminal stop and is dropped;
   - none is: it stays a residue;
   - mixed, e.g. a codon that may or may not end the protein: it stays X and
     `threePrimeIndeterminate` is set. The display says the end is uncertain.

   This replaces `terminateLastCodon`'s ACGT-only check for this function. That helper stays for
   its current callers.
8. **Internal stops.** A codon whose only possible readings are stops is `*`, and its index goes
   in `internalStops`. These are never exported (decision 4).

**Partial ends.** Steps 5 and 7 need to know whether each end is complete. Today that comes from
`locationString`, which the editor clears on any geometry change (`FeatureEditorModal.tsx:79,
168`). Selection export clears it too (`intervals.ts:134-142`).
[#226](https://github.com/JoaoVictorDaijo/dunceious/issues/226) owns structured partial ends:
storing them, keeping them through edits and clipping, and writing them back into GenBank and
GFF3 locations at the right strand-relative end. **#226 lands before PR 1.** PR 1 reads its
5′/3′ state and never infers completeness from a missing marker.

**Comparison contract.** This is Dunceious's application policy. Like the NCBI validator, it
checks the stored protein against the conceptual one. The wildcard rules below are Dunceious's
own.
- Stored residue equals the conceptual residue, including stop against stop: no difference.
- Stored `X`: no difference, because the stored protein declares the residue unknown.
- Conceptual residue from an ambiguous codon (X, B, Z, J): no difference when the stored residue
  is in that codon's `possible` set for the CDS's table, and a difference otherwise. For example,
  YTN allows F or L under table 1, and F, L or T under table 3.
- Conceptual internal stop against a stored residue: a difference. This is the "DNA stops here"
  case in the mockup.
- Stored residues past the last codon go to `storedExtra`. Conceptual residues past the end of
  the stored protein are counted in `storedShortBy`. Neither is shown as a codon.
- The conceptual protein has its terminal stop removed already, so an ordinary stored protein
  with no `*` lines up.

## Edit boundary (`saveEditedFeature`)

- **If the save changes a field from decision 3:**
  - `conceptualTranslation` gives `ok` with no internal stops: set `metadata.translation` to
    its residues and `metadata._translationSource = 'computed'`.
  - It gives `ok` with internal stops, or `unavailable`: remove `metadata.translation`, set
    `_translationSource = 'removed'`, and log one warning naming the feature and the reason:
    - "internal stop at codon 2; fix the CDS or mark it /pseudo";
    - "/transl_table=99 is not an NCBI genetic code";
    - "/transl_except can't be applied yet".
- **Otherwise**, keep `metadata.translation` and `_translationSource` as they are.
  `_translationSource` starts as `'imported'` for a parsed `/translation`.
- **Type changes away from CDS** (by `isCds`) remove `/translation` and `_translationSource`,
  with a log line. The serializer writes `/translation` only where `isCds` holds, so an
  SO:0000316 CDS keeps it and a non-CDS can never carry one. Changing back to CDS counts as a
  decision-3 change and recomputes.
- **`feature.translation`** is removed from the type, the parser and every reader listed under
  "Why". The details modal copy button reads through `storedTranslation`.

## Import

- Parsing sets `metadata.translation` only, with `_translationSource = 'imported'`.
- **The check runs where a CDS first meets its DNA, for every import path:**
  - GenBank records arrive with both, so they are checked in the worker after parsing.
  - GFF3 annotations reach their sequences only when `bioResponse` attaches them
    (`bioResponse.ts:100-154`; the annotation worker request carries no DNA). So they are
    checked at attachment.
  - Both paths call the same function and add to the same per-file warning.
- The result is kept as internal `_translationCheck` metadata. It is recomputed whenever the
  feature or its record's sequence changes, not on every redraw.
- Differing CDSs without `/exception` add to one warning per file, e.g. "3 CDS have a
  /translation that differs from their DNA".
- An `unavailable` result is recorded as "can't verify", with its reason.

## Display

- **Codon marks (PR 3)** follow the approved mockup
  (`.code/docs/translation-marks/translation-marks.html`, untracked). Each codon is drawn from
  two channels: the displayed residue (stored when present) and the conceptual residue.
  - **Differs:** white base, the strand hue at low alpha, and the letter in the strand hue.
  - **DNA stops, annotation doesn't:** the same, plus a red edge on the side facing the bases.
  - **Both stop:** today's red cell with `!`.
  - **Stored longer or shorter:** a "+n aa" or "−n aa" chip after the last codon.
  - **Under a search hit:** the hit is redrawn as an outline on top, so the mark survives.
  - **Hover targets:** every marked codon and chip gets one. The translation canvas has
    `pointerEvents: none` (`SequenceTrack.tsx:391-393`), so the targets are absolutely
    positioned buttons, like the existing genetic-code warning targets.
- **Early-stop flag** (`isFeatureBroken`) and the **count** (decision 11) read the conceptual
  translation. ATGTAA gives "1 aa" with or without a stored protein. `ATGTAAGGGTAA` gives
  "3 positions, 1 internal stop". An `unavailable` result shows "can't verify", with the reason.
  `threePrimeIndeterminate` adds "end uncertain". The tooltip defines the metric: translation
  positions without the terminal stop, internal stops and X/U/O included.
- **Both stop** (stored `*` over a DNA stop): no difference, drawn as today's red `!` cell.
- **Tooltips:**
  - for a CDS whose stored protein differs: "Annotation differs from DNA at N codons";
  - for a CDS recomputed after an edit: "Translation recomputed after edit";
  - for one removed after an edit: "Translation removed after edit", with the reason.
- **Editor:** `/translation` is read-only, with its source label. The edit's outcome
  (recomputed, or removed and why) shows before Save.

## Project file (format 3)

- `serializeProject` writes `format: 3`.
- The loader accepts 2 and 3, and migrates format 2 as in decision 9.
- Today's refusal message assumes an older file ("saved by an earlier version"). It is split so a
  newer format says "saved by a newer version of Dunceious".

## PR breakdown

| PR | Contents | Depends on |
|---|---|---|
| 1 (#291) | One protein field; read-only `/translation`; `conceptualTranslation` with steps 1, 3–8 and step 2 returning `unavailable`; edit boundary; export omission; import check on both paths and the warning; early-stop and count from the DNA; `isCds`; project format 3; TRANS-1/3 doc updates | #226 (structured partial ends, merged first) |
| 2 | `/transl_except`: lossless repeated qualifiers through parse, metadata, editor, project and serializer; NCBI code-break mapping through segment order, strand and `/codon_start`; partial TERM; diagnostics for unparsed, off-codon, remote and conflicting entries; rebasing on selection export; TRANS-4 update | PR 1; its own validation table, written and reviewed before implementation |
| 3 | Codon marks, chips, hover targets, mockup tooltips | PR 1; its own drawing and hover assertions, written and reviewed before implementation |

## Validation

This table is **PR 1's acceptance coverage**. PR 2 and PR 3 each add their own table before
implementation. PR 2's must cover hand-enumerated record-base-to-codon mappings for:
- forward, reverse, nonzero-start, joined and offset-frame CDSs;
- repeated exceptions and partial TERM;
- selection export and reimport.

PR 3's must cover drawing and hover assertions for:
- a difference over a DNA stop;
- a search-hit overlap;
- the chips.

Oracles are literal codons from gc.prt 4.6 and hand-written expected proteins, never the code's
own output.

| Guarantee | Test | Cases |
|---|---|---|
| Recompute on move | `featureManager.test.ts` at the save boundary | A CDS moved so it encodes `ATG AAA TAA`: `/translation="MK"`, source `computed` |
| Omit on internal stop | same, then `serialize.test.ts` | Issue fixture moved to `[9,18)`: no `/translation` in output, one warning naming codon 2; early-stop flag true |
| Omit on invalid code or exception | same | `/transl_table=99` edit: removed, reason named. Adding, changing or removing a `/transl_except`: removed with the PR 1 reason; removing the last one recomputes; a removal that exposes an internal stop omits and warns |
| Kept on unrelated edits | same | A name or colour change keeps `MK` and `imported`. Recompute, then a label edit: stays `computed` |
| Read-only | `FeatureEditorModal` test | The `/translation` row can't be edited and shows its source label |
| Type change | same, then serializer | CDS→misc_feature: no `/translation` in GenBank output; back to CDS recomputes. A GFF3 `SO:0000316` CDS keeps its `/translation` through import and export |
| One store | parser, serializer, project, details-copy tests | No `feature.translation`. Details copy reads the stored protein. A format 2 file with only `feature.translation` loads it into `metadata.translation`. A format 4 file is refused with the newer-version message |
| Conceptual translation | `translation.test.ts` | GCN→A; NNN→X; GAN-like {D,N} codon `RAY`→B; RNA `AUG`→M. Complete table-11 GTG start→M; GTG start with `/codon_start=2`→not M. Table 27 complete `ATGAAATGA`→`MK`; 3′-partial same→`MKW`. Table 28 complete ending `TAR`→terminal stop dropped; table 1 ending `TRA` (TAA or TGA, both stops)→dropped; ending `TMA` (TAA stop or TCA Ser)→X with `threePrimeIndeterminate`. `ATGGC`→`MA`; `ATGNN`→`M`. Invalid code→`unavailable` |
| Partial ends | `featureManager.test.ts`, with #226's state | A 5′-partial CDS starting GTG, moved: codon 1 stays V. Forward and reverse strands |
| Comparison | `translation.test.ts` | Stored X vs K: no difference. `ATGYTNTAA` with stored `MT`: a difference under table 1, none under table 3. Conceptual `AAN` (K/N) vs stored K: none; vs stored W: difference. Stored K vs internal stop: difference. Stored `M*G` vs conceptual `M*G`: none, and the early-stop flag is still true. Stored `MKV` vs `MK`: `storedExtra="V"`. ATGTAA with stored `M`: none |
| Import warning | `bioResponse.test.ts` | A GenBank file with one differing CDS logs one warning naming 1 CDS. FASTA plus GFF3 with a mismatching `translation` attribute warns at attachment. A CDS with `/exception` adds none |
| Count | `TrackTooltip.test.tsx` | ATGTAA: "1 aa" with and without stored `M`. `ATGTAAGGGTAA`: "3 positions, 1 internal stop". Invalid code: "can't verify" |

## Living documents

- **TRANS-1:** codon-state ambiguity resolution and the leftover-base rule.
- **TRANS-3:** the computed initiator rule.
- **TRANS-4 (PR 2):** exception application.
- **#71:** a note that its "edited features fall back to computed" assumption is now enforced.
- **Edit undo:** a new issue, filed with the owner's go-ahead.

## Rejected alternatives

- **Writing `*` inside an exported `/translation`.** INSDC defines `/translation` as amino-acid
  letters. NCBI's recompute path cuts at the first stop, while its product-copy path can keep an
  internal `*`. So NCBI does not settle it either way, and omitting it is Dunceious's choice
  (decision 4).
- **Cutting at the first stop.** That exports a protein the CDS does not describe as a whole.
- **Keeping hand edits of `/translation`.** It mixes computed and asserted proteins in one
  field, which Geneious and CLC both keep apart.
- **Always overwriting an imported `/translation` that differs.** It destroys curated variants.
  INSDC's `/exception` and table2asn's protein override both allow a supplied product.
- **Applying `/transl_except` partially in PR 1.**
  - Biopython 1.88 ignores it and copies its positions unchanged when a region is sliced.
  - Artemis 18.2.0 computes the offset by endpoint subtraction, ignoring introns
    (`Feature.java:1876`).
  - JBrowse 2 reads only the first range of a join (`geneticCodes.ts:255` at `c8142241`).

  Each of these asserts a wrong protein in some case. Doing it properly is PR 2.

## Left to the builder

- Where `_translationCheck` is cached, provided it is recomputed when the record or feature
  changes.
- Exact log and tooltip wording, within the meanings above.
