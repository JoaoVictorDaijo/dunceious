---
title: "Invalid /transl_table: a provisional table-1 view, labelled as assumed"
status: proposed
date: 2026-11-06
areas: ["translation", "viewer", "annotations"]
prs: []
issues: [288]
superseded_by: null
summary: "When a CDS's /transl_table is not an NCBI genetic code, the viewer shows a provisional table-1 translation drawn as dashed outlines and labelled 'assumed table 1' everywhere it appears, while computed translation, comparison, early-stop status and export still claim nothing for that CDS."
---
# Assumed genetic code for an invalid `/transl_table` — design

## Why

[#288](https://github.com/JoaoVictorDaijo/dunceious/issues/288) (Murilo, 2026-11-05):

> If they have a invalid value and it creates a ?, keep the warning, but we could try to also use
> table 1 as fallback.

**Today** (`develop` at `a9e97df`):
- `featureTranslTable` returns `NaN` for a non-integer or empty `/transl_table`, and the id
  itself for an integer (`src/domain/bio/sequence.ts:97-102`).
- `translateSequence` gives `?` for every codon when the id is not one of the 27 NCBI codes
  (`sequence.ts:118-128`).
- `geneticCodeWarning` (`src/app/viewer/cds.ts:32-35`) says
  "⚠ /transl_table=… is not an NCBI genetic code; codons are not translated".
  - It is shown in the feature tooltip (`src/app/viewer/Row.tsx:322`).
  - It is also shown on transparent targets over the translation band
    (`src/app/viewer/tracks/SequenceTrack.tsx:83-87, 412-419`).
- The hub tooltip's amino-acid count (`src/app/components/hub/TrackTooltip.tsx:46`) ignores the
  code entirely. It reports a number either way.

That behaviour came from [#229](https://github.com/JoaoVictorDaijo/dunceious/issues/229)
(computed translation silently used the standard code) and its fix
[#237](https://github.com/JoaoVictorDaijo/dunceious/pull/237). TRANS-1 records it: "an id outside
the list is reported, never replaced by table 1".

## Owner decision (2026-11-06)

**Middle ground.** Show a table-1 translation, drawn as provisional, keep the warning reworded to
say table 1 is assumed, and label the count "assumed table 1". The approved mockup's #288
section (`.code/docs/translation-marks/translation-marks.html` at the primary checkout, untracked)
shows the look. Every mark explains itself on hover.

## Standards and reference tools

- **INSDC Feature Table 11.4,** `/transl_table`: the value is an NCBI genetic code id. NCBI
  gc.prt 4.6 defines 27 of them: 1–6, 9–16 and 21–33.
- **NCBI validator** (C++ Toolkit, `src/objects/valerr/ValidErrItem.cpp:2075` at `d0d7af1`):
  `GenCodeInvalid`, "A coding region contains invalid genetic code." It reports the CDS. It
  does not translate it with another code.
- **Biopython 1.88** (`Bio/Seq.py:2824`, tag `biopython-188`): an integer table is looked up
  with `CodonTable.ambiguous_generic_by_id[table_id]`. An unknown id raises `KeyError`, with no
  fallback.
- **So no reference tool substitutes table 1.** The provisional view is Dunceious's own
  presentation choice, not a translation method. That is why it must never be mistaken for a
  computed result (CLAUDE.md: no silent approximation).

## Which codons depend on the code

From the pinned gc.prt rows (`src/domain/bio/geneticCodes.ts`), these are the codons whose
amino-acid row differs from table 1 in at least one NCBI code:

| Codon | Table 1 | Other readings (tables) |
|---|---|---|
| TGA | stop | W (2, 3, 4, 5, 9, 13, 14, 21, 24, 27, 28, 31, 33); C (10); G (25) |
| TAA | stop | Q (6, 27, 28); Y (14, 29, 33); E (30, 31) |
| TAG | stop | Q (6, 15, 27, 28); L (16, 22); Y (29); E (30, 31); W (32) |
| AGA | R | stop (2); S (5, 9, 14, 21, 24, 33); G (13) |
| AGG | R | stop (2); S (5, 9, 14, 21); G (13); K (24, 33) |
| ATA | I | M (2, 3, 5, 13, 21) |
| AAA | K | N (9, 14, 21) |
| CTT, CTC, CTA | L | T (3) |
| CTG | L | T (3); S (12); A (26) |
| TCA | S | stop (22) |
| TTA | L | stop (23) |

The other 51 codons read the same in all 27 codes.

The table is generated in a test from `NCBI_GENETIC_CODES` and checked against this literal
list, so a gc.prt update that changes it fails loudly.

## Design

### A separate, provisional view

```ts
/** src/domain/bio/assumedTranslation.ts (new). Never used for computed results. */
export interface AssumedTranslation {
  assumedTable: 1;
  residues: string;              // one per whole codon, literal table-1 reading, '*' for a table-1 stop
  codeSensitive: boolean[];      // per codon: true when some NCBI code reads it differently
}

/** Only for a CDS whose /transl_table is present and not an NCBI code; otherwise undefined. */
export function assumedTranslation(feature: BioFeature, codingSeq: string): AssumedTranslation | undefined;

/** For one codon: the other NCBI readings, from the table above, for the tooltip. */
export function otherReadings(codon: string): { residue: string; tables: number[] }[];
```

- **Codon by codon, literally,** using table 1's amino-acid row.
  - No initiator rewrite: start codons are code-specific, so codon 1 is never turned into M.
  - No terminal-context rule.
  - An ambiguous codon is `?`, as today.
- **It is never an input** to computed translation, comparison, the early-stop flag, the
  amino-acid count's DNA metric, `/translation` or any export. #253's spec on PR #291
  (`docs/specs/2026-11-06-translation-stored-protein-provenance.md`) defines those, and under
  it an invalid code gives `conceptualTranslation` → `unavailable: 'invalid-code'`. This spec
  doesn't change that contract.
- **A stored `/translation` wins.** If the CDS has one, the band shows the stored residues as
  today. They are the annotation's own claim, marked "can't verify against the DNA" under
  #253. The assumed view appears only when there is no stored protein.
- `featureTranslTable` and `translateSequence` keep their contracts.

### Where the assumption shows, and how

Every surface that shows these residues, or a number derived from them, says "assumed table 1".

1. **Translation band** (`SequenceTrack.tsx`). Drawn as in the mockup:
   - each codon is a dashed 1 px outline in the strand colour, with no fill and the letter in
     the strand colour;
   - a table-1 stop is a dashed red outline with `*`, never the solid red `!` early-stop cell,
     since the code itself is unknown;
   - search highlights stay beneath and show through the empty cell.
2. **Codon hover.** Each assumed codon gets a hover target, like the existing warning targets.
   - Code-sensitive codon: "TGA: stop in table 1, assumed. W in tables 2, 3, 4, …; C in 10; G in
     25."
   - Other codons: "W, assuming table 1. TGG reads W in every NCBI code."
3. **Band warning target and feature tooltip:** `geneticCodeWarning` is reworded to
   "/transl_table=99 is not an NCBI genetic code. Residues assume table 1 (Standard) and may be
   wrong at code-sensitive codons such as TGA." An empty value reads `/transl_table=` (empty).
4. **Hub count** (`TrackTooltip.tsx`):
   - For example, "103 aa, assumed table 1": the assumed residues without a final table-1 stop.
     Internal table-1 stops follow #253 decision 11's wording, e.g. "103 positions, 1 stop,
     assumed table 1".
   - When the CDS has a stored `/translation`, the count follows #253 and says
     "can't verify against the DNA".
5. **Early-stop flag:** never raised from assumed residues. The feature tooltip's
   "⚠ Early stop codon" line is suppressed for an invalid code, and the warning above explains
   why.

### What stays exactly as it is

- GenBank and GFF3 export, `/translation`, project files: unchanged, and none of them ever
  contain an assumed residue.
- Translation with a valid code, including an absent `/transl_table` (table 1 by INSDC): unchanged.
- The greeter: unchanged (#261 owns it).

## Order with #253

The two PRs may land in either order:

- **Before #253:** the assumed view replaces only the `?` residues of `translateFeature` for an
  invalid code with no stored protein. The early-stop flag keeps today's behaviour, which never
  flags `?`.
- **After #253:** the assumed view sits beside `conceptualTranslation`'s
  `unavailable: 'invalid-code'`, and the count switches to decision 11's wording.

## Validation

The oracle is literal gc.prt 4.6 rows, not the code's own output.

| Guarantee | Test | Cases |
|---|---|---|
| Code-sensitive codons | `assumedTranslation.test.ts` | Generated set equals the literal table above. `otherReadings('TGA')` equals the literal TGA row |
| Assumed residues | same | `/transl_table=99`, `ATGTGGTGAGCT` gives `MW*A`, with TGA code-sensitive. Codon 1 GTG under 99 stays V. `/transl_table=` (empty) and `abc` behave as 99. Absent, `1` and `11` give `undefined` |
| Never computed | same and `sequence.test.ts` | `translateSequence(seq, 99)` still gives `?` per codon; `conceptualTranslation` (once #253 lands) still `unavailable`; serializer output for that CDS has no `/translation` added |
| Stored wins | `SequenceTrack` test | Invalid code with stored `/translation`: band shows the stored residues, no dashed cells |
| Drawing | `SequenceTrack` canvas spy | Invalid code: every codon drawn as `setLineDash` outline, no `fillRect` for residue cells; a table-1 stop drawn red dashed with `*`, never `!` |
| Labels | `Row`, `TrackTooltip` tests | Feature tooltip shows the reworded warning and no early-stop line. Hub count reads "… aa, assumed table 1". Hover text on TGA lists its other readings |

## Living documents

TRANS-1 (`docs/standards/translation.md`) changes from "an id outside the list is reported,
never replaced by table 1" to:
- computed translation still never replaces an invalid code;
- the viewer may show a separate table-1 view, labelled as assumed and never exported.

It cites the NCBI `GenCodeInvalid` and Biopython `KeyError` behaviour above.

## Rejected alternatives

- **Translating with table 1 as if it were the code** (Murilo's wording, taken literally). This
  reintroduces #229's silent substitution, wherever the residues feed counts, flags or export.
- **Showing nothing** (today). It is correct but unhelpful when the value is an obvious typo.
  The owner chose the middle ground.
- **Guessing the intended code** from the organism or a nearby valid value. No reference tool
  does this, and it would be a heuristic hidden behind a residue.

## Open for the owner

- **Draw invariant codons solid?** 51 of 64 codons read the same in all 27 NCBI codes. If the
  invalid value is a typo for a real code, those residues are right whatever the code was. The
  design keeps every codon dashed, as approved. Drawing invariant codons solid would show more
  certainty where it exists, but would mix two looks in one CDS.
