---
title: "Stored CDS translations: recompute after edits, flag curated differences"
status: proposed
date: 2026-11-06
areas: ["translation", "viewer", "annotations", "genbank"]
prs: []
issues: [253, 261]
superseded_by: null
summary: "A CDS edit that changes its coding bases, frame, code or exceptions replaces the stored /translation with one recomputed under NCBI rules, while an imported /translation that differs from the DNA is kept and each differing codon is drawn with a lighter fill."
---
# Stored CDS translations — design

## Why

[#253](https://github.com/JoaoVictorDaijo/dunceious/issues/253) (OBS-26): editing an imported
CDS's position or strand keeps its old `/translation`. Three places trust it:

- the viewer (`translateFeature`, `sequence.ts:308`);
- the early-stop flag (`isFeatureBroken`, `sequence.ts:338`);
- GenBank export (`serialize.ts:76`).

Fixture `ATGAAATAAATGTGATAA`, CDS `[0,9)` with `/translation="MK"`, saved at `[9,18)`. The coding
sequence becomes `ATGTGATAA` and the computed protein `M__`. Yet the viewer shows `MK_`, there is
no early-stop flag, and export writes `/translation="MK"`.

`saveEditedFeature` (`featureManager.ts:35-42`) already detects geometry changes. It drops only
phase metadata.

**Found while designing this:** a feature keeps its protein twice.
- `featureParser.ts:92-95` sets both `feature.translation` and `metadata.translation`.
- The editor's qualifier rows edit `metadata.translation` only (`qualifiers.ts`).
- The viewer reads `feature.translation`. Export reads `metadata.translation` and falls back to
  `feature.translation`. The hub tooltip reads `metadata.translation`.

So a hand edit of `/translation` changes the exported protein but not the drawn one.

## Requirement (collaborator, 2026-11-06)

Murilo, on #253:

> On Editing: When a CDS geometry, strand, phase, or genetic code is edited, the stored
> translation must be invalidated and recomputed from the new sequence (replace).
> On Importing Curated Files: When loading a GenBank file where an annotated /translation
> differs from the computed sequence (e.g., curated variants), keep the original translation
> intact but flag it with a visual warning (lighter fill, as referenced in #261).

## Standards

- **INSDC Feature Table 11.4,** `/translation`: the amino-acid sequence "derived" from the CDS
  under `/transl_table`, `/codon_start` and `/transl_except`. An edited location no longer has
  the old protein as its derived sequence.
- **NCBI table2asn / validator** (C++ Toolkit `912b751`, `sequence.cpp:4024`
  `TranslateToProtein`):
  - the product drops the terminal stop;
  - an internal stop stays as `*` and is reported (InternalStop);
  - a stored protein that differs is reported: "The conceptual translation does not match the
    provided translation."
- **Translation rules in `docs/standards/translation.md`:**
  - TRANS-1: genetic code from `/transl_table`;
  - TRANS-2: `/codon_start`;
  - TRANS-3: the initiator of a 5′-complete CDS reads M when its table's Starts row marks it;
  - TRANS-4: `/transl_except`.
- **Owner decision on #259 (2026-11-06):** follow NCBI and Ensembl. A protein length counts
  translated positions without the terminal stop, and internal stops count as positions.

## Decisions (owner, 2026-11-06; numbered as in the decision list)

1. **A curated `/translation` that differs from the DNA is drawn with its stored residues,** and
   each differing codon gets the lighter fill. The tooltip shows both readings. The early-stop
   flag and the amino-acid count follow the DNA-derived protein.
2. **Export after an edit writes the recomputed `/translation`,** in NCBI form:
   - no terminal stop;
   - `X` for a codon that has no single residue;
   - `*` for an internal stop.
3. **What recomputes.** A change to any of these: `start`, `end`, `segments`, `strand`,
   `/codon_start`, `/transl_table`, `/transl_except`, the partial markers (`<`, `>`), or a
   `type` change into `CDS`. Label, colour, note and other qualifier edits keep the stored
   protein.
4. **A hand edit of `/translation` is curated.** It is kept and compared with the DNA, as on
   import. If the same save also changes a field from point 3, the hand edit wins, and it is
   compared.
5. **`/transl_except` is applied when the protein is recomputed.** An exception whose `pos` is
   still one whole codon inside the new CDS sets that residue. One that no longer fits is
   dropped from the feature, and the log says so.
6. **Import warns once per file,** for example "3 CDS have a /translation that differs from
   their DNA", and each such feature carries the mark.
7. **One initiator helper**, `initiatorResidue`, is shared with the greeter fix for
   [#261](https://github.com/JoaoVictorDaijo/dunceious/issues/261). Whichever PR lands first
   adds it.

## Goals

- A feature has one stored protein: `metadata.translation`, the qualifier. `feature.translation`
  is removed, and every reader goes through one accessor.
- After an edit from point 3, display, the early-stop flag, the hub tooltip and export all
  describe the current CDS.
- An imported or hand-edited protein is never overwritten silently, and where it differs from
  the DNA the difference is visible codon by codon.

## Non-goals

- A full `/transl_except` location grammar beyond `pos` as a single codon range
  (`complement(...)` included) and `aa` as an ALPHA-2 abbreviation. Other forms are kept and
  reported as unsupported.
- Changing how proteins are drawn when no stored translation exists.
- The greeter's codon readout itself (#261 owns it).

## Anti-goals

- A stored protein drawn or exported for a location it no longer describes.
- A curated protein replaced without the user changing a field from point 3.
- A "differs" mark that fires on the conventions themselves:
  - the omitted terminal stop;
  - `M` at an annotated alternative start;
  - `X` at an ambiguous codon;
  - an applied `/transl_except`.

## Model

```ts
/** src/domain/bio/translation.ts (new): the DNA-derived protein of a CDS under NCBI rules. */
export function conceptualTranslation(feature, codingSeq, translTable): {
  residues: string;        // one per whole codon; terminal stop removed; internal stops '*'
  exceptionsApplied: number[];
  exceptionsDropped: string[];
};

/** Codon indices where the stored protein and the conceptual one disagree. */
export function translationDifferences(stored: string, conceptual: string): number[];

/** gc.prt Starts row: 'M' for a start codon of `translTable`, otherwise undefined. */
export function initiatorResidue(codon: string, translTable: number): 'M' | undefined;

/** The one accessor for the stored /translation qualifier, whitespace removed. */
export function storedTranslation(feature): string | undefined;
```

**Conceptual translation, in order:**

1. Extract the coding sequence. `/codon_start` is already applied by `extractCodingSequence`.
2. Translate with `translateSequence(codingSeq, table)`.
3. If the CDS is 5′-complete, replace codon 1 with `initiatorResidue` when that returns `M`.
4. Apply `/transl_except` at its codon. Sec gives `U`, Pyl gives `O`, and TERM gives a stop.
5. Map a codon with no single residue to `X`.
6. Drop the terminal stop when the CDS is 3′-complete and its last codon is a stop. This matches
   `terminateLastCodon`.

**Comparison:** position by position, over the longer of the two strings, so a length difference
counts as differing tail codons. A stored `X` against any computed residue is not a difference.
Codon 1 under step 3, and positions under step 4, are compared after those rules apply.

## Edit boundary (`saveEditedFeature`)

- If the save changes a field from point 3 and does not change `metadata.translation`, set
  `metadata.translation` to the conceptual translation. Also set internal
  `metadata._translationSource = 'computed'`. Internal keys start with `_` and are not exported
  (`qualifiers.ts:29`).
- If `metadata.translation` changed, or nothing in point 3 changed, keep it and set
  `_translationSource = 'curated'`.
- Remove `feature.translation` from new and saved features. `projectFile.ts:78` still accepts it
  on load, and the loader moves it into `metadata.translation` when that is absent.
- Undo restores the previous feature object, so it restores the previous protein too.

## Import

After parsing, compute the differences for every CDS that has a `/translation`. The result is
recomputed in the viewer from the record and is not stored.

When any CDS differs, write one log warning per file, with the count. This follows the
validator's WARNING severity, matching the decision on
[#286](https://github.com/JoaoVictorDaijo/dunceious/issues/286) to warn, not refuse, for
annotation conformance.

## Display

- **`SequenceTrack`:** draw the stored residue, as today. For a codon in the difference set,
  use a lighter fill (`globalAlpha` 0.45 instead of 0.9) with the same hue, and keep the
  residue letter. The strand colour stays.
- **`isFeatureBroken`:** decide from the conceptual translation, so an internal `*` there flags
  the CDS. The early-stop fill (red, `!`) follows that, not the stored protein.
- **Tooltips** (`TrackTooltip`, viewer feature tooltip):
  - for a differing CDS: "Translation differs from DNA at N codons";
  - for the hovered codon: "annotated K · DNA reads *";
  - for a CDS with `_translationSource = 'computed'`: "Translation recomputed after edit".
- **Amino-acid count:** the conceptual translation's length. This matches #259 and makes ATGTAA
  1 aa with or without a stored `/translation`.

## Validation

Oracles are literal codons from gc.prt 4.6, not the code's own output.

| Guarantee | Test | Oracle |
|---|---|---|
| Recompute on move | `featureManager.test.ts` at the save boundary | Issue fixture moved to `[9,18)` gives `/translation="M*"`, broken = true, and serializer output `/translation="M*"` |
| Recompute on strand, codon_start, table | same | Each change replaces the protein; table 1→11 for an internal GTG keeps V; table 1→2 makes `AGA` a stop, which is `*` internally |
| Kept on label edit | same | Name or colour change keeps `MK` and `_translationSource = 'curated'` |
| Hand edit is curated | same | Editing `/translation` to `MR` keeps `MR`; display and export both read `MR` |
| One store | `featureParser.test.ts`, `serialize.test.ts`, `projectFile.test.ts` | Parsed features have no `feature.translation`; an old project file with only `feature.translation` loads into `metadata.translation` |
| Conventions are not differences | `translation.test.ts` | ATGTAA with `M`; complete table-11 GTG start with stored `M`; `NNN` with stored `K`; Sec exception at TGA with stored `U`: no differences |
| Real differences | same | Stored `MK` against conceptual `M*` gives codon 1; stored `MKV` against conceptual `MK` gives codon 2 |
| transl_except on recompute | same | `(pos:4..6,aa:Sec)` on `ATGTGATAA` gives `MU`; moved so `pos` lies outside, it is dropped and logged |
| Lighter fill | `SequenceTrack` canvas spy | The differing codon is filled at alpha 0.45, the others at 0.9 |
| Count | `TrackTooltip.test.tsx` | ATGTAA gives 1 aa with and without `/translation=M` |
| Import warning | `bioResponse.test.ts` | A file with one differing CDS logs one warning naming 1 CDS |

## Living documents

- **TRANS-3 / TRANS-4** (`docs/standards/translation.md`): record the computed initiator and
  exception rules and set their status.
- **#71:** add a note that its "edited features fall back to computed" assumption is now
  enforced at the edit boundary.

## Rejected alternatives

- **Dropping `/translation` after an edit, without writing a new one.** It loses Murilo's
  "replace". Export would also carry no protein for a valid CDS, which NCBI submissions expect.
- **Always overwriting an imported `/translation` that differs.** It destroys curated variants.
  INSDC lets a submitter supply the product.
- **Marking the whole CDS instead of codons.** It hides where the difference is. NCBI's
  Sequence Viewer colours mismatched codons.

## Left to the builder

- Whether the difference set is cached per feature in the viewer model or recomputed in the
  track's memo.
- Exact tooltip wording, within the meanings above.
