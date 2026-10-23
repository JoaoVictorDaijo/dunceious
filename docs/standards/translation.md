# Translation

Governing sources: **NCBI, The Genetic Codes** (page updated 2024-09-23; machine-readable
`gc.prt` version 4.6, pinned as `ncbi-genetic-codes`) and the CDS qualifiers of the **INSDC
Feature Table 11.4**. Code references are to `develop` at 13aff79.

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
(`src/domain/bio/geneticCodes.ts`, by `npm run standards:genetic-codes` from the pinned copy) and
tested codon by codon against Biopython 1.88's tables. An absent qualifier means table 1. A value
that is not an NCBI code is never replaced by table 1: no residue or stop is claimed (`?`), and
the feature's tooltip and its translation band say the code is not an NCBI genetic code. An empty
`/transl_table=` counts as invalid, not absent. Fixed in #229.

Tables 27, 28 and 31 let some codons be a residue or a stop depending on context (gc.prt gives
the residue in `ncbieaa` and `*` in `sncbieaa`). Inside a CDS they read as the residue; the last
codon of a complete CDS reads as the stop, as Biopython 1.88 `translate(cds=True)` does. A
partial CDS (`<` or `>`) keeps the residue at its last codon, since that codon need not end the
protein.

## TRANS-2. `/codon_start`

**Rule.** INSDC `/codon_start`: "indicates the offset at which the first complete codon of a
coding feature can be found, relative to the first base of that feature. Coding regions with
complete amino-termini must be set to 1." Values 1, 2 or 3.

**Reference tools.** Biopython 1.88, Tested: C2 (`<51..63`, `/codon_start=2`) translates to
`MAC` with `cds=True`.

**Applications.** Unknown. Jalview's "Translate as cDNA" ignores frames and introns by design
([Calculate menu](https://www.jalview.org/help/html/menus/alwcalculate.html)); it is not a
qualifier handler.

**Dunceious.** Conforms (`src/domain/bio/sequence.ts:199`).

## TRANS-3. Alternative initiation codons

**Rule.** NCBI Genetic Codes: "The possible intiator codons are marked as 'M' in the second
('Starts') row" (spelling as in the source). NCBI translates the initiator of a complete CDS as
Met.

**Reference tools.** Biopython 1.88, Tested: `translate(cds=True)` turns the GTG start of C1
(table 11) into M; `cds=False` gives V. EMBOSS `transeq` has a methionine option.

**Applications.** Benchling has an optional initial-Met setting in sequence analysis only; UGENE
uses alternative starts to find ORFs. Neither documents the translated residue of a CDS.

**Dunceious.** Gap in the computed path: GTG translates as V. The track shows the stored
`/translation` when present (`src/domain/bio/sequence.ts:86-117, 247-259`;
`src/app/viewer/tracks/SequenceTrack.tsx:336`).

## TRANS-4. `/transl_except`

**Rule.** INSDC `/transl_except`: "translational exception: single codon the translation of
which does not conform to genetic code defined by /organism or /transl_table", written
`(pos:<location>,aa:<amino_acid>)` with the abbreviations of ALPHA-2.

**Reference tools.** Biopython 1.88, Tested: not applied (C3 → `M*P*`; `cds=True` raises on the
in-frame TGA).

**Applications.** Unknown.

**Dunceious.** Gap in the computed path, like Biopython: the qualifier is kept but not applied;
the stored `/translation` is preferred (`src/app/viewer/tracks/SequenceTrack.tsx:336`).
