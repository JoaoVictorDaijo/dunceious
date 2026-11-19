---
title: "Invalid /transl_table: a provisional table-1 view, labelled as assumed"
status: implemented
date: 2026-11-06
areas: ["translation", "viewer", "annotations"]
prs: [295]
issues: [288]
superseded_by: null
summary: "When a CDS's /transl_table is not an NCBI genetic code, the viewer shows a provisional table-1 translation, with code-sensitive codons drawn as dashed outlines, labelled 'assumed table 1' everywhere it appears, while computed translation, comparison, early-stop status and export still claim nothing for that CDS."
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

**Invariant codons are solid** (owner, 2026-11-06, answering this spec's open question):
- A codon that reads the same residue in all 27 NCBI codes is drawn as a normal solid cell. If
  the invalid value was meant to be any real code, that residue is right.
- Only code-sensitive codons, and ambiguous codons left as `?`, get the dashed outline.
- Every codon's hover still says the code is assumed, and the hub count still says
  unverified, with its hover giving the reason.
- Export and the #229 guarantee are unchanged.

## Standards and reference tools

- **INSDC Feature Table 11.4,** `/transl_table`: the value is an NCBI genetic code id. NCBI
  gc.prt 4.6 defines 27 of them: 1–6, 9–16 and 21–33.
- **NCBI validator** (C++ Toolkit at `d0d7af1`): `GenCodeInvalid`, "A coding region contains
  invalid genetic code." It is defined in `src/objects/valerr/ValidErrItem.cpp:2075` and raised
  from `src/objtools/validator/cdregion_validator.cpp:977`. That establishes that NCBI reports
  the CDS. Whether any NCBI translation path falls back to another code was not checked.
- **Biopython 1.88** (`Bio/Seq.py:2824`, tag `biopython-188`): an integer table is looked up
  with `CodonTable.ambiguous_generic_by_id[table_id]`. An unknown id raises `KeyError`, with no
  fallback.
- **What was checked:** NCBI's validator reports the CDS, and Biopython refuses to translate. The provisional view is Dunceious's own presentation choice, not a translation
  method. That is why it must never be mistaken for a
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

A test derives this table from the repo's independent Biopython 1.88 fixture
(`src/domain/bio/__tests__/fixtures/ncbi-genetic-codes.biopython.json`), not from
`NCBI_GENETIC_CODES`. It compares the result with both this literal list and the production
helper, so a gc.prt update that changes the table fails loudly.

## Design

### A separate, provisional view

```ts
/** src/domain/bio/assumedTranslation.ts (new). Never used for computed results. */
export interface AssumedTranslation {
  assumedTable: 1;
  residues: string;              // one per whole codon, literal table-1 reading, '*' for a table-1 stop, '?' if unresolved
  codeSensitive: boolean[];      // per codon: true when some NCBI code reads any expansion differently
  possibleStop: boolean[];       // per codon: some expansion is a table-1 stop (true for '*')
}

/**
 * Only for a feature the translation band already translates (`CDS_ORF_TYPES` in cds.ts: CDS,
 * cds, ORF, orf) whose /transl_table is present and not an NCBI code; otherwise undefined.
 */
export function assumedTranslation(feature: BioFeature, codingSeq: string): AssumedTranslation | undefined;

/** For one codon: the other NCBI readings, from the table above, for the tooltip. */
export function otherReadings(codon: string): { residue: string; tables: number[] }[];
```

- **Codon by codon, literally,** using table 1's amino-acid row.
  - **First codon** (owner, 2026-11-06), following NCBI's rule. In C++ Toolkit `x_Translate`
    (`sequence.cpp:3670` at 912b751), `check_start = (is_5prime_complete && frame == 0)` selects
    the table's Starts row for codon 1. Here that rule is applied to the assumed table 1. Codon 1
    reads M when all of these hold:
    - the CDS's 5′ end is known to be complete: its location text is present and not 5′-partial,
      or, after #226, its structured partial state says complete;
    - `/codon_start` is 1;
    - the literal codon is a table-1 start: ATG, TTG or CTG.

    An edited feature whose location text was cleared has an unknown 5′ end, so codon 1 stays
    literal until #226 lands. An ambiguous first codon is never rewritten.
  - **Code sensitivity of codon 1.** Starts-row sensitivity applies only in that same known-complete,
    `/codon_start=1` initiation context. A 5′-partial, edited/no-location or frame-offset first
    codon uses only its literal amino-acid rows for sensitivity (GTG then stays solid V).
    In initiation context, codon 1 is code-sensitive when its start status or its
    residue differs between NCBI codes. ATG is a start in all 27 codes, so a complete ATG start
    is a solid M. TTG and CTG are starts in only 9 and 8 codes, so their M is dashed. GTG is not
    a table-1 start, so it stays V, but it is a start in 13 codes, so it is dashed. Its hover says
    it would read M as a start in those codes.
  - No terminal-context rule (tables 27, 28 and 31 do not apply under table 1).
  - Bases are uppercased and U becomes T first.
  - An IUPAC-ambiguous codon is expanded:
    - every expansion gives the same table-1 residue: that residue, e.g. GCN gives A;
    - otherwise: `?`, e.g. TGN, which can be C, W or a stop.
  - A codon is code-sensitive when any of its expansions is.
- **It is never an input** to computed translation, comparison, the early-stop flag, the
  amino-acid count's DNA metric, `/translation` or any export. #253's spec on PR #291
  (`docs/specs/2026-11-06-translation-stored-protein-provenance.md`) defines those, and under
  it an invalid code gives `conceptualTranslation` → `unavailable: 'invalid-code'`. This spec
  doesn't change that contract.
- **A stored `/translation` wins.** If the CDS has one, the band shows the stored residues as
  today. They are the annotation's own claim, marked "can't verify against the DNA" under
  #253. **The assumed view fills only codons that have no stored residue:** every codon when
  there is no stored protein, or the codons past the end of a shorter one (codon index ≥ stored
  length; no comparison is involved). A full-length stored protein leaves nothing for it to
  fill. Every label below
  depends on which source is shown.
- `featureTranslTable` and `translateSequence` keep their contracts.

### Where the assumption shows, and how

Every surface that shows these residues, or a number derived from them, says "assumed table 1".

1. **Translation band** (`SequenceTrack.tsx`):
   - **Invariant codon** (one residue in all 27 NCBI codes, including resolved ambiguous codons
     whose every expansion is invariant, such as GCN → A): the normal solid cell in the strand
     colour, with a white letter, exactly as a valid-code residue is drawn.
   - **Code-sensitive codon, or unresolved `?`:** a dashed 1 px outline in the strand colour,
     with no fill and the letter in the strand colour, as in the mockup.
   - **A table-1 stop** is always code-sensitive (TAA, TAG and TGA all read as residues in some
     code). It is a dashed red outline with `*`, never the solid red `!` early-stop cell.
   - Search highlights stay beneath. They show through dashed cells, and are covered by solid
     cells as today.
2. **Codon hover.** Each assumed codon gets a hover target, like the existing warning targets.
   - Code-sensitive codon: "TGA: stop, assuming table 1. W in tables 2, 3, 4, …; C in 10; G in
     25."
   - Other codons: "W, assuming table 1. TGG reads W in every NCBI code."
   - Ambiguous codon, code-sensitive: "TGN: ambiguous, assuming table 1. In table 1 it can be C, W or a stop;
     other codes read some of these differently."
   - Ambiguous codon, not code-sensitive: "RAY: ambiguous, assuming table 1. D or N, in every NCBI code."
   - Resolved ambiguous codon: "A, assuming table 1. Every reading of GCN is A in every NCBI
     code."
3. **Band warning target and feature tooltip:** `geneticCodeWarning` takes the displayed source.
   An empty value reads `/transl_table=` (empty).
   - Assumed view: "/transl_table=99 is not an NCBI genetic code. Residues assume table 1
     (Standard) and may be wrong at code-sensitive codons such as TGA."
   - Stored protein shown: "/transl_table=99 is not an NCBI genetic code. The residues shown are
     the annotation's /translation and can't be checked against the DNA."
   - Stored protein shorter than the CDS: "The first 120 residues are the annotation's
     /translation and can't be checked; the rest assume table 1." The codons past the stored
     protein's end are drawn from the assumed view, solid or dashed by the same rule. They are not the computed `?` that
     `translateFeature` fills in today (`sequence.ts:317`). The tail is found from the stored
     length alone, so it works for an invalid code in both landing orders. #253's
     `storedShortBy` comes from comparing with an available conceptual translation, so it never
     applies to an invalid code. #253's rule that conceptual residues past a short stored
     protein aren't drawn as codons concerns valid codes. It is unaffected here, because these
     cells are assumed residues, not conceptual ones.
4. **Hub count** (`TrackTooltip.tsx`). One number, styled as unverified (owner, 2026-11-06):
   - **The number** is drawn in italics with a dotted underline, the hub's cue for a number
     that can't be verified. There is no separate "can't verify" text and no extra row.
   - **The reason is a footnote in the same hover card,** in small muted text at the bottom,
     e.g. "Count not verified: /transl_table=99 is not an NCBI genetic code; table 1 assumed."
     The number's `aria-describedby` points to that line. The card remains noninteractive;
     no second hover target or separate popover is required.
   - **What is counted,** following UniProt, Artemis, Ensembl and NCBI:
     - one position per translated codon;
     - an unresolved codon (`?`) counts as one residue, as X does in those tools;
     - a final codon that is a definite table-1 stop is dropped;
     - internal table-1 stops are positions. When there are any, the label follows #253
       decision 11: "103 positions, 1 stop" instead of "103 aa".
   - **With a stored protein** (full length, or short with an assumed tail), the number is the
     stored protein's length, with the same unverified style. Its footnote says it is the
     annotation's `/translation` and can't be checked against the DNA, and why.
     A trailing stored `*` is dropped first; internal stored stops use the same positions/stop wording (`MK*G` → "4 positions, 1 stop").
   - Before #253 lands, this replaces today's code-blind count for an invalid code. After #253,
     #253's DNA metric is unavailable for an invalid code, and this styled number is what the
     hub shows.
5. **Early-stop flag** (`computeBrokenFeatureMap`, which also drives the band's red cells): it
   is never derived from assumed residues. This follows NCBI: for an invalid code id, the
   validator cannot translate (`translation_problems.cpp:153` at 912b751), so it reports no
   internal stop.
   - **Stored residues** follow whichever contract is current. Today `isFeatureBroken` reads a
     stored internal `*` (`sequence.ts:342`), and the band draws that codon red. After #253 the
     flag is unavailable for an invalid code, so there is none.
   - **Assumed residues,** whether the whole CDS or the tail past a short stored protein, never
     contribute to the flag and are never drawn as a solid red early-stop cell. A table-1 stop
     among them is always the dashed red `*`.
   - With no stored protein, the feature tooltip's "⚠ Early stop codon" line is therefore
     absent, and the warning above explains why.

### What stays exactly as it is

- GenBank and GFF3 export, `/translation`, project files: unchanged, and none of them ever
  contain an assumed residue.
- Translation with a valid code, including an absent `/transl_table` (table 1 by INSDC): unchanged.
- The greeter: unchanged (#261 owns it).

## Order with #253

The two PRs may land in either order:

- **Before #253:** the assumed view replaces the `?` residues that `translateFeature` gives an
  invalid code: all of them without a stored protein, or the tail past a short one. The early-stop flag keeps today's behaviour: a stored
  internal `*` still flags, and assumed residues never do.
- **After #253:** the assumed view sits beside `conceptualTranslation`'s
  `unavailable: 'invalid-code'`, and the count switches to decision 11's wording.

## Validation

The oracle is literal gc.prt 4.6 rows, not the code's own output.

| Guarantee | Test | Cases |
|---|---|---|
| Code-sensitive codons | `assumedTranslation.test.ts` | Derived from the Biopython 1.88 fixture: equals the literal table above and the production set. `otherReadings` equals the fixture-derived readings for all 13 codons |
| Assumed residues | same | `/transl_table=99`, `ATGTGGTGAGCT` gives `MW*A`, with TGA code-sensitive. RNA lowercase `augugguga` gives `MW*`. Codon 1 under 99, complete start and `/codon_start=1`: ATG → M solid; TTG and CTG → M dashed; GTG → V dashed, with a hover naming the codes where it is a start. TTG with `/codon_start=2`, or with a 5′-partial location `<1..9`, or on an edited feature with no location text → L, literal. `TGN` gives `?`, code-sensitive and a possible stop; `GCN` gives `A` and is not code-sensitive; `RAY` gives `?` and is not code-sensitive. `/transl_table=` (empty) and `abc` behave as 99. Absent, `1` and `11` give `undefined` |
| Eligible types | same and `SequenceTrack` test | CDS, cds, ORF and orf with an invalid code get the assumed view; a `gene` does not |
| Never computed | same and `sequence.test.ts` | `translateSequence(seq, 99)` still gives `?` per codon; `conceptualTranslation` (once #253 lands) still `unavailable`; GenBank and GFF3 output for that CDS has no `/translation` added; project serialization contains no assumed residue |
| Stored wins | `SequenceTrack` and `Row` tests | Invalid code with a full-length stored `/translation`: band shows the stored residues with no dashed cells, the tooltip shows the stored-protein warning, and no provisional count appears |
| Early stop | `cds` test | Invalid code with stored `MK*G`: flagged today, not after #253. Invalid code with no stored protein whose table-1 reading has an internal stop: never flagged, no solid red early-stop cell (the codon is the dashed red `*`) |
| Drawing | `SequenceTrack` canvas spy | Invalid code, no stored protein, `ATGTGAGCNTGN`: ATG and GCN (A) drawn as solid `fillRect` cells with no line dash; TGA drawn as a red `setLineDash` outline with `*`, never `!`; TGN (`?`) drawn as a dashed outline with no fill. Every one of the four hovers says "assuming table 1" |
| Count | `TrackTooltip` test, oracle: a test-local loop expanding IUPAC codons over the Biopython fixture's table 1 | `ATGTGGTAA` gives "2 aa". `ATGTGATGG` gives "3 positions, 1 stop". `ATGTGNTGG` gives "3 aa" (`?` counts as one). `ATGTGGTGN` gives "3 aa". `ATGGCNTAA` gives "2 aa". Every number is italic with a dotted underline, and its hover-card footnote names the invalid code and table 1. Full stored `MVA`: "3 aa", same style, footnote names the annotation's protein. Unknown or unstranded strand: no number, generic warning |
| Short stored protein | `SequenceTrack`, `Row`, `TrackTooltip` and `cds` tests, before and after #253 | Invalid code, stored `M` over `ATGTGGGCT`: codon 1 shows stored M; codons 2–3 show `W` and `A` from the assumed view, solid because both are invariant, with assumed hovers; the tooltip names both sources; the hub shows the stored length `1 aa` in the unverified style, with a footnote naming the annotation's protein. Stored `MK*G` over a six-codon CDS whose assumed tail is `TAA TGG`: before #253 the stored `*` flags and is drawn red, the tail's `TAA` is a dashed red `*` and does not add to the flag; after #253 there is no flag |
| Labels | `Row`, `TrackTooltip` tests | Assumed view: tooltip shows the assumed warning, hub shows the count in the unverified style with its reason in the same hover-card footnote. Hover on TGA lists its other readings; on TGN the sensitive ambiguity text; on RAY the insensitive one; on GCN the resolved text. Every assumed-codon hover, including both ambiguity texts, contains "assuming table 1" |

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

## Owner questions

None open. The invariant-codon question was answered on 2026-11-06 (see Owner decision).
