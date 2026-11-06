# Translation

Governing sources: **NCBI, The Genetic Codes** (page updated 2024-09-23; machine-readable
`gc.prt` version 4.6, pinned as `ncbi-genetic-codes`) and the CDS qualifiers of the **INSDC
Feature Table 11.4**. Code references are to `develop` at f5a6ad2.

## TRANS-1. Genetic code from `/transl_table`

**Rule.** INSDC `/transl_table`: "definition of genetic code table used if other than universal
genetic code table." The value is an NCBI genetic code id. gc.prt 4.6 defines 27 tables
(1–6, 9–16, 21–33), each with amino-acid and start-codon rows. Every table must be supported
exactly; an id outside the list is reported, never replaced by table 1.

**Reference tools.** Biopython 1.88 `Bio.Data.CodonTable` carries all NCBI tables; Tested: C1
with table 11 gives `MKF`. EMBOSS 6.6.0 `transeq` (Documented) numbers tables itself: its
default 0 is the standard code, 1 is the standard code with alternative initiation codons. It
does not read `/transl_table`.

**Applications.** Benchling supports the NCBI tables except 27, 28 and 31
([help, 2025-09-30](https://help.benchling.com/hc/en-us/articles/39768268305805-How-to-characterize-sequences-with-annotations-and-translations)).
Geneious Prime, SnapGene and CLC offer genetic-code selectors; whether they read the qualifier
is unknown.

**Dunceious.** Conforms. Computed translation uses all 27 NCBI tables, generated from gc.prt 4.6
(`src/domain/bio/geneticCodes.ts`, by `pnpm standards:genetic-codes` from the pinned copy) and
tested codon by codon against Biopython 1.88's tables. An absent qualifier means table 1. A value
that is not an NCBI code is never replaced by table 1: no residue or stop is claimed (`?`), and
the feature's tooltip and its translation band say the code is not an NCBI genetic code. An empty
`/transl_table=` counts as invalid, not absent. Fixed in #229.

Tables 27, 28 and 31 let some codons be a residue or a stop depending on context (gc.prt gives
the residue in `ncbieaa` and `*` in `sncbieaa`). Inside a CDS they read as the residue; the last
codon of a CDS whose 3′ end is complete reads as the stop, as Biopython 1.88
`translate(cds=True)` does. Only the 3′ end decides: NCBI C++ Toolkit `x_Translate`
(`src/objmgr/util/sequence.cpp`, ncbi-cxx-toolkit-public `912b751`) applies the stop on
`is_3prime_complete` alone, and the NCBI validator (table2asn 1.29.324) reports it for
`<1..9`, `complement(1..>9)` and `join(<1..6,complement(10..12))` as well. The 3′ end is the
end of the interval translated last, in INSDC evaluation order: its `>` when that interval is
read forward, its `<` when it is complemented. A marker on any other end leaves it complete. A
3′-partial CDS keeps the residue at its last codon, since that codon need not end the protein.
Without the raw location text (after an edit or a selection export) the markers are lost, so a
3′-partial CDS reads as complete (#226).
Tested against the validator's output in
`src/domain/bio/__tests__/fixtures/ncbi-validator-terminal-stop.json`.

The greeter uses table 11 explicitly for its curated T7 CDS codons
(`src/app/greeter/genomeZoom.ts`, `codonInGene`), matching the bundled NC_001604.1
`/transl_table` annotations. Tests verify every curated CDS is 5′-complete with
`/codon_start=1` and `/transl_table=11`. Its first codon uses the table's initiation row
([TRANS-3](#trans-3-alternative-initiation-codons)); internal codons use its ordinary amino-acid row.
The displayed genes are a curated subset that omits nested CDSs
(`src/app/greeter/greeterContent.ts:51`); **Owner decision open** on keeping that curated subset
or presenting the full annotated CDS population. Neither option changes the genetic-code rules.
The bundled record supplies annotation evidence; external accession freshness is unknown.

## TRANS-2. `/codon_start`

**Rule.** INSDC `/codon_start`: "indicates the offset at which the first complete codon of a
coding feature can be found, relative to the first base of that feature. Coding regions with
complete amino-termini must be set to 1." Values 1, 2 or 3.

**Reference tools.** Biopython 1.88, Tested: C2 (`<51..63`, `/codon_start=2`) translates to
`MAC` with `cds=True`.

**Applications.** Unknown. Jalview's "Translate as cDNA" ignores frames and introns by design
([Calculate menu](https://www.jalview.org/help/html/menus/alwcalculate.html)); it is not a
qualifier handler.

**Dunceious.** Conforms (`src/domain/bio/sequence.ts:230`).

## TRANS-3. Alternative initiation codons

**Rule.** NCBI Genetic Codes: "The possible intiator codons are marked as 'M' in the second
('Starts') row" (spelling as in the source). NCBI translates the initiator of a complete CDS as
Met when its 5′ end is complete and `/codon_start=1`; internal codons retain their
ordinary residue. The start codons come from the selected table's own Starts row.

**Reference tools.** Biopython 1.88, Tested: `translate(cds=True)` turns the GTG start of C1
(table 11) into M; `cds=False` gives V. EMBOSS `transeq` has a methionine option.
NCBI C++ Toolkit [`x_Translate`, `912b751`, sequence.cpp:3670](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objmgr/util/sequence.cpp#L3670)
gates initiation on `is_5prime_complete && frame == 0` (frame 0 corresponds to `/codon_start=1`).

**Applications.** Benchling has an optional initial-Met setting in sequence analysis only; UGENE
uses alternative starts to find ORFs. Neither documents the translated residue of a CDS.

**Dunceious.** Partial. The computed path translates an alternative GTG initiator as V.
The track shows the stored
`/translation` when present (`src/domain/bio/sequence.ts:116, 301`;
`src/app/viewer/tracks/SequenceTrack.tsx:343`).

The greeter conforms: `codonInGene` applies `initiatorResidue` only at codon 1 of its
verified complete, frame-1 table-11 CDSs. The pure domain helper reads gc.prt 4.6's
`sncbieaa` row, returning M only for an unambiguous initiation triplet in the selected table;
callers own the completeness and frame prerequisites. `translateSequence` remains
context-free. Tests compare tables 1 and 11 to literal Starts rows, every curated gene's
first residue to its stored `/translation`, and gene 19's internal GTG to V.
The general computed-feature initiation gap remains; this greeter fix does not close it.

## TRANS-4. `/transl_except`

**Rule.** INSDC `/transl_except`: "translational exception: single codon the translation of
which does not conform to genetic code defined by /organism or /transl_table", written
`(pos:<location>,aa:<amino_acid>)` with the abbreviations of ALPHA-2.

**Code-break details (Documented, not runtime-tested; PR 2 design evidence).** INSDC 11.4
§7.3.1 also permits a terminal T or TA completed to TAA by mRNA polyadenylation, represented
by a point or two-base TERM range. Sec maps to U, Pyl to O, and OTHER to X with an explanatory
note. Locations use entry bases, including complement and accession-qualified syntax; this
syntax does not authorize implicit remote sequence fetching.
NCBI C++ Toolkit `912b751`
[`CSeqTranslator::Translate`](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objmgr/util/sequence.cpp#L4209)
substitutes normalized code breaks after ordinary translation and initiation: LocationOffset
minus frame identifies the protein position; TERM may append at protein length. With
`include_stop=false` it truncates at the first stop. This permissive loop is not a validator:
[`ValidErrItem.cpp`](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objects/valerr/ValidErrItem.cpp#L1367)
names unparsed, off-codon, out-of-CDS and conflicting-break diagnostics.
[`CCleanup::ParseCodeBreak`](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/cleanup/cleanup.cpp#L4520)
checks length/containment of simple locations and takes strand from the CDS;
[`CdregionFeatBC`](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/cleanup/newcleanupp.cpp#L6582)
sorts and deduplicates equal normalized breaks. Raw translator overwrite order is not a
standard conflict-resolution rule. Interactive edit maintenance, ambiguous mappings and
invalid-entry policies are not settled by these sources; the proposed
[PR 2 design](../specs/2026-11-06-translation-transl-except.md#open-decisions) records the choices
without claiming current application support. NCBI parser/validator execution remains unverified.

**Reference tools.** Biopython 1.88, Tested: not applied (C3 → `M*P*`; `cds=True` raises on the
in-frame TGA).

**Applications.** Unknown.

**Dunceious.** Partial. In the computed path, like Biopython, the qualifier is kept but not applied;
the stored `/translation` is preferred (`src/app/viewer/tracks/SequenceTrack.tsx:343`).

Preferring a stored `/translation` does not establish that it remains valid after an edit;
[#253](https://github.com/JoaoVictorDaijo/dunceious/issues/253) tracks that separate fidelity issue.
Use [OP-8](operations.md#op-8-biological-codons-and-display-frames) for codon construction and
[FMT-11](formats.md#fmt-11-strand-relative-gff3-cds-phase) for exported phase. Neither rule
closes the computed initiation or exception gaps above.
