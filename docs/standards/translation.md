# Translation

Governing sources: **NCBI, The Genetic Codes** (page updated 2024-09-23; machine-readable
`gc.prt` version 4.6, pinned as `ncbi-genetic-codes`) and the CDS qualifiers of the **INSDC
Feature Table 11.4**. Code references are to `develop` at f5a6ad2.

## TRANS-1. Genetic code from `/transl_table`

**Rule.** INSDC `/transl_table`: "definition of genetic code table used if other than universal
genetic code table." The value is an NCBI genetic code id. gc.prt 4.6 defines 27 tables
(1–6, 9–16, 21–33), each with amino-acid and start-codon rows. Every table must be supported
exactly; computed translation reports an id outside the list and never replaces it by table 1.
The viewer may show a separate table-1 view, labelled as assumed and never exported.

**Reference tools.** Biopython 1.88 `Bio.Data.CodonTable` carries all NCBI tables; Tested: C1
with table 11 gives `MKF`. An unknown integer table raises `KeyError` in
[`Bio/Seq.py`](https://github.com/biopython/biopython/blob/biopython-188/Bio/Seq.py#L2824)
when looking up `CodonTable.ambiguous_generic_by_id`, without fallback. NCBI C++ Toolkit
`d0d7af1` reports `GenCodeInvalid`, "A coding region contains invalid genetic code"
([definition](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/d0d7af1/src/objects/valerr/ValidErrItem.cpp#L2075),
[validator](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/d0d7af1/src/objtools/validator/cdregion_validator.cpp#L977)).
Whether NCBI translation paths fall back was not checked. EMBOSS 6.6.0 `transeq` (Documented) numbers tables itself: its
default 0 is the standard code, 1 is the standard code with alternative initiation codons. It
does not read `/transl_table`.

**Applications.** Benchling supports the NCBI tables except 27, 28 and 31
([help, 2025-09-30](https://help.benchling.com/hc/en-us/articles/39768268305805-How-to-characterize-sequences-with-annotations-and-translations)).
Geneious Prime, SnapGene and CLC offer genetic-code selectors; whether they read the qualifier
is unknown.

**Dunceious.** Conforms. Computed translation uses all 27 NCBI tables, generated from gc.prt 4.6
(`src/domain/bio/geneticCodes.ts`, by `pnpm standards:genetic-codes` from the pinned copy) and
tested codon by codon against Biopython 1.88's tables. An absent qualifier means table 1. A value
that is not an NCBI code is never replaced in computed translation: no residue or stop is
claimed (`?`). The viewer separately shows a literal table-1 reading where no stored
`/translation` residue exists. In the assumed view only, codon 1 uses table 1's Starts row when
location text establishes a complete 5′ end and `/codon_start` is 1 (absent means 1), following
NCBI `x_Translate` at `912b751` (`check_start = is_5prime_complete && frame == 0`). ATG, TTG and
CTG then read M; ambiguous first codons are never rewritten. Missing normalized intervals means unknown
completeness; structured end flags survive edits without raw location text. Start-status differences across codes contribute
to codon-1 sensitivity only in that same initiation context. Invariant residues (including resolved IUPAC codons whose
expansions are all invariant) use normal solid cells; code-sensitive and unresolved codons use
dashed outlines. Every assumed codon's hover says "assuming table 1". Table-1 stops are dashed red `*`, never computed early-stop cells. The feature and
band warnings identify stored, assumed or mixed sources. For protein records and features
with unknown or unstranded direction, feature warnings report only the invalid code, since no
translation is displayed. For nucleotide records with an explicit forward or reverse strand,
the hub shows one unverified count in italics with a dotted underline, described by a small
reason footnote in the same hover card. Without stored protein, each assumed codon counts once
(`?` included), a definite final stop is dropped, and internal stops give "N positions, k stops"
instead of "N aa". With stored protein it counts that annotation's residues, dropping a trailing
`*` and using the same stop wording, without mixing in any assumed tail. The footnote names the
invalid code and either the table-1 assumption or the annotation's `/translation` that cannot
be checked against DNA. Unknown and unstranded features show only the generic invalid-code
warning and no protein count. These assumed
residues never enter computation, comparison, early-stop status, `/translation`, interchange
exports or project files. This provisional view is a Dunceious presentation choice, not a
reference-tool fallback. An empty `/transl_table=` counts as invalid, not absent. See the
[assumed-view design](../specs/2026-11-06-translation-assumed-genetic-code.md).

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
The markers are read from each interval's `partialStart`/`partialEnd` flags
(`isThreePrimePartialLocation`), so the verdict survives edits and selection export (#226).
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

**Dunceious.** Conforms for eligible CDSs. `conceptualTranslation` applies the shared
`initiatorResidue` at codon 1 only for a structured 5′-complete, frame-1 CDS. Imported
`metadata.translation` remains an assertion with imported provenance; the viewer can display
it, while DNA determines early-stop status and translation-position counts. Invalidating CDS
edits replace the stored product at `saveEditedFeature`; unavailable products and products with
internal stops are removed with a reason. This enforces the edited-feature recomputation
assumption in [#71](https://github.com/JoaoVictorDaijo/dunceious/issues/71).

The greeter conforms: `codonInGene` applies `initiatorResidue` only at codon 1 of its
verified complete, frame-1 table-11 CDSs. The pure domain helper reads gc.prt 4.6's
`sncbieaa` row, returning M only for an unambiguous initiation triplet in the selected table;
callers own the completeness and frame prerequisites. `translateSequence` remains
context-free. Tests compare tables 1 and 11 to literal Starts rows, every curated gene's
first residue to its stored `/translation`, and gene 19's internal GTG to V.
Both CDS computation and the greeter share this initiator helper.

## TRANS-4. `/transl_except`

**Rule.** INSDC `/transl_except`: "translational exception: single codon the translation of
which does not conform to genetic code defined by /organism or /transl_table", written
`(pos:<location>,aa:<amino_acid>)` with the abbreviations of ALPHA-2.

**Reference tools.** Biopython 1.88, Tested: not applied (C3 → `M*P*`; `cds=True` raises on the
in-frame TGA).

**Applications.** Unknown.

**Dunceious.** Partial. The qualifier is kept but not applied; the conceptual model returns
unsupported-exception and removes the stored product on invalidating edits;
the stored `/translation` is preferred (`src/app/viewer/tracks/SequenceTrack.tsx:343`).

Preferring a stored `/translation` does not establish that it remains valid after an edit;
[#253](https://github.com/JoaoVictorDaijo/dunceious/issues/253) tracks that separate fidelity issue.
Use [OP-8](operations.md#op-8-biological-codons-and-display-frames) for codon construction and
[FMT-11](formats.md#fmt-11-strand-relative-gff3-cds-phase) for exported phase. The initiation rule is enforced by the shared conceptual model; exception application remains deferred.

### Conceptual CDS products and comparison

`src/domain/bio/translation.ts` follows NCBI C++ Toolkit `912b751`, `x_Translate`
(sequence.cpp:3670–3741) and `TranslateToProtein` (:4024), as documented in the
[stored-protein design](../specs/2026-11-06-translation-stored-protein-provenance.md).
Every IUPAC codon expands under the selected gc.prt 4.6 table. A unique reading is retained;
{D,N}, {E,Q} and {I,L} use B, Z and J. Other mixed sets use X (Dunceious representation).
A one- or two-base remainder is padded with N and retained only if all expansions give one
non-stop residue. For a complete 3′ end with no remainder, terminal stop readings replace
ordinary readings expansion by expansion, including dual-coding tables 27, 28 and 31.
A definite final stop is removed even at a partial end; preceding definite stops remain.
A retained terminal stop/residue mixture is X and marks the end uncertain.

Counts are translation positions without the terminal stop, including internal stops and
X/U/O. They use “aa” only without internal stops. Declared protein records, unresolved
biological strands, nonlocal/multipart order locations and unknown completeness cannot
establish a CDS count or early-stop claim. `/transl_except` remains unsupported in the
conceptual model: no computed product is claimed or exported after an invalidating edit.

Comparison preserves supplied proteins. Stored X is compatible with an ordinary residue,
but not a definite DNA stop; ambiguous codons accept members of their contextual possible
set. Length differences count positions, including stops. Residue or length discrepancies
count once per CDS in the per-file warning; `/exception` suppresses that warning without
hiding the explanation. These wildcard and warning policies are Dunceious choices, validated
against the design's literal, hand-derived cases. No external validator execution is claimed.

The only stored protein is `metadata.translation`, with `_translationSource` imported,
computed or removed. The derived `_translationCheck` is disposable string-valued JSON,
recomputed at import attachment, save and format-2 project load. Loading never trusts it.
On a protein record, computed provenance is invalid derived data and is removed on load;
an imported protein qualifier remains supplied data. Protein GenBank export and the GFF3
phase editor retain their existing behavior pending the design's open owner decisions.
