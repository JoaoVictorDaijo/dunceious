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
standard conflict-resolution rule. The source trace additionally establishes these defaults (Documented, not executed):

- **Backed by: `src/objtools/cleanup/cleanup.cpp:CCleanup::ParseCodeBreak` at commit `912b751`:**
  skip whitespace after `pos:`/`aa:`, trim position text, assign known CDS strand to simple
  parsed locations even when omitted/contrary in text; preserve raw values separately.
- **Backed by: `src/objtools/cleanup/cleanup_utils.cpp:x_ValidAminoAcid` at commit `912b751`**
  ([source](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/cleanup/cleanup_utils.cpp#L640)):
  listed multi-letter names compare case-insensitively, single letters case-sensitively;
  unknown names (including full names) map to X, not to the intended amino acid. Xxx is a
  tool alias; INSDC Xaa remains standard. No silent fallback claim is authorized for the app.
- **Backed by: `src/objtools/cleanup/newcleanupp.cpp:CCodeBreakCompare`, `CCodeBreakEqual`,
  `CNewCleanup_imp::CdregionFeatBC`; `src/objmgr/util/sequence.cpp:CSeqTranslator::Translate`
  at commit `912b751`:** sort by offset, collapse equal adjacent normalized location/residue
  pairs, preserve same-offset order, then overwrite; differing same-location breaks use the
  last residue. App preserves raw occurrences and applies equal assertions once.
- **Backed by: `src/objtools/validator/cdregion_validator.cpp:CCdregionValidator::x_ValidateCodebreak`,
  `x_ReportTranslExceptProblems`; `src/objtools/validator/translation_problems.cpp:CCDSTranslationProblems::x_GetTranslExceptProblems`
  at commit `912b751`**
  ([checks](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/validator/cdregion_validator.cpp#L647)):
  duplicate locations are Error; partial flags on the break itself are Error TranslExceptIsPartial,
  not a test of parent-CDS completeness. Phase warnings test full triplets and short breaks at
  the CDS end; not all internal short breaks are rejected. Product mapping checks are conditional
  on product presence and skip terminal breaks. Neither parser nor these checks requires T/TA
  letters for short TERM; the permissive translator can substitute or append it. This tolerance
  is not evidence of biological TAA completion outside INSDC's specified suffix.
- **Backed by: `src/objmgr/util/sequence.cpp:CSeqTranslator::Translate`, `TranslateToProtein`
  at commit `912b751`:** explicit terminal TERM is not gated on parent-CDS completeness;
  final definite-stop removal is unconditional. Keep parent partialness distinct from a
  break's own partial flags.

Interactive edit maintenance and whole-CDS verification are app policies. **Backed by: owner
decision 2026-11-06**, the [proposed PR 2 design](../specs/2026-11-06-translation-transl-except.md)
requires malformed GenBank `/transl_except` to refuse file import (syntax, off-frame/partial
codon, unsupported short stop or unknown residue), overriding #286's warning-only qualifier
policy for this qualifier. Recognized INSDC names are case-insensitive, including one-letter
forms. Otherwise-valid unusable entries are dropped with visible notice and computation uses
the valid entries. OTHER/Xaa compares as any sense residue including U/O, never a definite stop.
No silent rounding, X fallback or automatic correction is allowed. Owner decisions A–F and H
(2026-11-07) resolve the import, editing, selection and export policies described below.

**Executed reference probes (orchestrator, 2026-11-07).** table2asn 1.29.324,
`-i X.fsa -f X.tbl -o results/X.sqn -V vb`, codon_start 1: split Sec MU, reverse Sec MUP,
partial TERM M, duplicate Sec MU (collapsed by NCBI). Diagnostics were ShortIntron for split,
PartialProblemHasStop for partial TERM, none for reverse/duplicate. Off-frame Sec gave MU with
Critical CDSrange/TranslExceptPhase; the app refuses it under decision 6. Conflicting Sec/Pyl
gave MO with DuplicateTranslExcept; the app drops both and computes DNA M* under decision E.
Pinned download gzip SHA-256 and the exact evidence scope are in the
[PR 2 spec](../specs/2026-11-06-translation-transl-except.md#executed-reference-evidence--2026-11-07).

**Reference tools.** Biopython 1.88, Tested: not applied (C3 → `M*P*`; `cds=True` raises on the
in-frame TGA).

**Applications.** Unknown.

**Dunceious.** `translationExceptions` preserves ordered raw occurrences. The conceptual model
maps exact entry bases through biological extraction, applies recognized residues after initiation
and before terminal-stop removal, and returns per-occurrence evidence, including removed-terminal
slots. GenBank refuses malformed syntax/shape with the CDS, occurrence, literal and rule.
Otherwise-valid outside/repeated-visit assertions are removed with visible notices; computation uses
the retained assertions. Stored imported proteins remain supplied data. Exact qualified identifiers
match only the record's accession or version fields; no display-name alias or remote fetching occurs.
OTHER/Xaa permits every sense residue including U/O, while definite stops remain incompatible.
Identical assertions preserve multiplicity and apply once; conflicting assertions all drop with
notices and their codon reads from DNA (owner E). Literal hand-derived regression tests supplement
the supplied NCBI execution evidence; no broader reference-tool coverage is inferred.

Preferring a stored `/translation` does not establish that it remains valid after an edit;
[#253](https://github.com/JoaoVictorDaijo/dunceious/issues/253) tracks that separate fidelity issue.
Use [OP-8](operations.md#op-8-biological-codons-and-display-frames) for codon construction and
[FMT-11](formats.md#fmt-11-strand-relative-gff3-cds-phase) for exported phase. The initiation rule is enforced by the shared conceptual model; exception application uses the shared conceptual model.

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
establish a CDS count or early-stop claim. Usable `/transl_except` assertions adjust that product. Malformed GFF3/project input refuses import atomically with the CDS/value/rule (owner B).
Nonmatching exact identities drop with notice and computation uses the remaining entries (C).
Plain moves compare ordered logical parts once before cleanup, including repeated and frame-skipped
parts: same count, strand, length and order, one coordinate offset, unchanged codon_start. Only
circular origin-contiguous same-strand splits normalize into one wrapping part. Unchanged surviving
assertions match previous occurrences independently of row index, with duplicate multiplicity (A); reverse/reframe removes newly
unusable inherited breaks with notices before Save completes. Malformed new authoring refuses Save.

Comparison preserves supplied proteins. Stored X is compatible with an ordinary residue,
but not a definite DNA stop; ambiguous codons accept members of their contextual possible
set. Length differences count positions, including stops. Residue or length discrepancies
count once per CDS in the per-file warning; `/exception` suppresses that warning without
hiding the explanation. These wildcard and warning policies are Dunceious choices, validated
against the design's literal, hand-derived cases. External validator evidence is limited to the executed probes above.

The only stored protein is `metadata.translation`, with `_translationSource` imported,
computed or removed. The derived `_translationCheck` is disposable string-valued JSON,
recomputed at import attachment, save and format-2 project load. Loading never trusts it.
On a protein record, computed provenance is invalid derived data and is removed on load;
an imported protein qualifier remains supplied data. Protein GenBank export and the GFF3
phase editor have owner decisions dated 2026-11-06: keep supplied `/translation` on
protein CDS export; make phase read-only and edit frame via `/codon_start`. The phase editor displays a read-only derived phase; frame edits use `/codon_start`.

### Exception interchange and export policy

GenBank and GFF3 preserve ordered exception arrays; GFF3 splits raw lists before decoding and
emits the array once on the first multipart row. Format 2 projects preserve arrays, discard caches
and refuse malformed assertions without migration. Selection JSON validates shape before rebasing
and preserves each position's strand. Malformed in-memory assertions stay literal and unavailable,
with a notice; strict project reopen refuses them. The source record is never mutated.

Clipped CDSs use the shared CDS predicate (CDS, cds, SO:0000316) for both frame adjustment and
recomputation, mark cut ends, retain INSDC frame through the existing removed-base formula and store
only a newly computed kept-part protein under ordinary eligibility/internal-stop guards (D).
After clipping/rebasing, the shared geometry evaluator rechecks each candidate against the kept
CDS and adjusted codon_start before protein computation. Keeping every named base does not ensure
codon membership when other multipart visits were cut. Newly unusable breaks are removed with
their original occurrence and literal value in the selection loss notice, independently of table
eligibility. Already malformed in-memory source assertions retain the literal-preservation policy above.
GenBank/GFF3 selection export and reversed selection remain future work.

GenBank refuses Unicode controls Cc and line/paragraph separators Zl/Zp, naming literal value and
rule (F). Printable non-ASCII values such as é/µ/± export unchanged with a warning naming the value
and INSDC's printable ASCII 32–126 rule through ExportReport, preview and download logs.
**Backed by: INSDC + owner decision (warn but allow), 2026-11-07.** GFF3/project retain all text.
General free-text wrapping limitations remain #308. Compact exceptions wrap after commas and their
continuations concatenate without added characters. No fitting comma retains the overlong-token
limitation. The writer defensively refuses malformed code breaks; no biological repairs are made.

### Geometry validation and unavailable products

`geometryCodeBreakEvidence` owns syntax, shape, membership, conflict classification and optional
selection rebasing/cut-loss evidence from local nucleotide geometry/frame without
requiring a supported genetic code or computing amino acids. All import boundaries consume
that evidence independently of the conceptual translator's primary reason. Thus table 999
retains invalid-code while off-frame, partial-codon and contrary-orientation assertions still
refuse import. Unknown/unavailable geometry is deferred rather than guessed; a valid but empty
coding visit list is known geometry, so obsolete inherited complete breaks are removed before Save.
A shape-valid assertion on an unavailable product is deferred application, never a verified residue.

Bare GFF3 transl_except attributes are refused even without '='; diagnostics name the feature,
literal attribute and required structured value syntax. The whole attachment remains atomic.

All geometry consumers use that shared evaluator directly for break decisions. Invalid table 999
cannot suppress conflicts or selection rebasing; conceptual translation alone decides whether a
protein may be computed. Selection evidence keeps original raw values/occurrence indices and a
separate rebased logical value. Conflicts are classified before the invalid-code primary return.
Protein records remain unmapped supplied data under PR 1's guard, including remote-qualified raw
values; their amino-acid coordinates are not treated as nucleotide coordinates.

GenBank/GFF3 writers trust normalized ingress/Save state, with no new writer cleanup. GFF3 preserves
raw arrays; GenBank retains its defensive malformed/text errors and whole-record invalid-table
omission. This record-level omission is separate from geometry decisions about individual breaks.
