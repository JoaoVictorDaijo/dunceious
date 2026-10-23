# Displayed metrics and sequence summaries

Code assessments below are static inspections of `f5a6ad2` on 2026-10-23, not new runtime or
reference-tool conformance tests. Sources marked Documented describe the cited version or
observation date only; live manuals are not assigned the releases in [Tools](tools.md).
**Owner decision open** identifies an unresolved contract, not an adopted scientific method.
Scientific choices still require an established source, its defaults and an independent oracle
under [scientific rigor](../../CLAUDE.md#scientific-rigor-first-priority).

Each suffixed ID below is a separate rule. Unsuffixed METRIC-3, -5, -6, -7, -8, -9 and -10
family names are not additional rules. Strand meaning uses OP-6 and LOC-3; repeated
qualifiers use FMT-3; extraction uses LOC-7; CIGAR consumption uses FMT-10; biological numbering
uses COORD-1. Those guarantees are not duplicated here.

## METRIC-1. Sequence length and alignment width

**Rule.** Name raw residue counts separately from alignment-column counts, and select units
for the counted object: nucleotide base pairs or amino-acid residues versus alignment columns.
The [NCBI Sample GenBank Record, Sequence Length](https://www.ncbi.nlm.nih.gov/genbank/samplerecord/)
(unversioned, observed 2026-10-23) defines record residue units;
[EMBOSS Alignment Formats, Length](https://emboss.sourceforge.net/docs/themes/AlignFormats.html)
(unversioned, observed 2026-10-23) includes inserted gaps in alignment length. LOC-7 owns
feature-sequence versus region extraction; METRIC-11 owns context extent.

**Reference tools.** Documented: NCBI and EMBOSS distinguish those counted objects. An alignment
width is not a record's ungapped residue length.

**Applications.** No additional application-specific length convention is established here.

**Dunceious.** Mixed — [#259](https://github.com/JoaoVictorDaijo/dunceious/issues/259).
`src/app/components/RecordDetailsModal.tsx:278` still counts aligned-or-raw width as `bp`;
the raw-sequence badge at :333 also uses `bp` for proteins. Feature lengths at :219, :228 and
the selected-view badge at :333 now choose `aa`/`bp` and name the counted view. Raw hub/index
and export-tree lengths use correct units (`src/app/components/hub/SequenceSectionHeader.tsx:50`,
`HubIndex.tsx:56`, `ExportSequenceTree.tsx:61`); annotation-row units at `AnnotationRow.tsx:84`
are correct. `src/app/logic/bioResponse.ts:205` still calls alignment width `bp`.

## METRIC-2. Feature length

**Rule.** For supported valid exact locations, count the residues described by the component
intervals, excluding intervening gaps. This is documented
[Biopython 1.88 `SeqFeature.__len__`](https://biopython.org/docs/1.88/api/Bio.SeqFeature.html)
practice, not the outer-envelope length. **Owner decision open:** uncertain or malformed
locations need an explicit supported contract; an absolute value cannot establish validity or
circular topology. LOC-4/LOC-5/LOC-6 govern uncertain bounds, sites and origin crossing.

**Reference tools.** Documented: Biopython compound-location length sums component lengths;
its `SimpleLocation` requires `0 <= start <= end <= n`.

**Applications.** Feature-comparison length summaries have related practice in the
[Roary manual](https://sanger-pathogens.github.io/Roary/) (based on 3.11.2, 2018-01-22),
but neither Roary nor name equality establishes homology or Dunceious's classifier (OP-10).

**Dunceious.** Conforms for valid supported interval lengths; malformed/uncertain inputs remain
unresolved. `src/app/logic/viewModel.ts:46` sums parts, treats descending spans as wraps when
source length is supplied, otherwise uses an absolute difference. `featureSequenceViews` at
:82 exposes interval-sum and envelope lengths separately. Consumers include
`src/app/components/RecordDetailsModal.tsx:219`, `src/app/components/hub/AnnotationRow.tsx:59`
and `FeatureSectionHeader.tsx:44`. Do not extend this narrow assessment to unsupported locations
or the biological comparisons tracked in [#256](https://github.com/JoaoVictorDaijo/dunceious/issues/256).

## METRIC-3a. Accession label

**Rule.** Keep a database accession distinct from a local record ID. GenBank release 274.0
(2026-10-15), [§3.4.6](https://ftp.ncbi.nlm.nih.gov/genbank/gbrel.txt), defines the primary
accession as a stable database identifier; an arbitrary ID fallback is not an accession.
The supplied version is pinned in [Sources](sources.md); the upstream URL rolls forward.

**Reference tools.** Contract: GenBank's ACCESSION field has the database meaning above.

**Applications.** No application fallback policy is inferred from database semantics.

**Dunceious.** Deviates — [#259](https://github.com/JoaoVictorDaijo/dunceious/issues/259).
`src/app/components/RecordDetailsModal.tsx:272` displays `accession?.trim() || id` under
Accession. METRIC-10a separately governs the feature count beside it.

## METRIC-3b. Detail-warning provenance

**Rule.** **Owner decision open:** define which stored values receive validation warnings and
what an edited marker denotes. Supported interface choices include warning for every stored
value, or warning only for changed values while making imported validity unknown. Neither
choice changes the qualifier grammar under OP-18 or source-span fidelity under OP-9.
[INSDC FT 11.4 §7.3](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html) (April 2026)
defines qualifier meanings, not an edited badge or proof of imported validity.

**Reference tools.** The INSDC contract constrains values; no matching warning/provenance UI
contract was established in the opened reference documents.

**Applications.** No exact imported-versus-edited warning policy established.

**Dunceious.** Owner decision open. `src/app/components/hub/DetailsLine.tsx:30` validates only
edited values. `src/domain/bio/details.ts:61` defines edited as a difference from the imported
snapshot. Imported invalid values can therefore appear without warnings; the marker is edit
provenance, not biological evidence. Validation deviations are separately tracked by
[#247](https://github.com/JoaoVictorDaijo/dunceious/issues/247).

## METRIC-4. Alignment identity naming

**Rule.** A statistic using a reference tool's alignment-identity name must use its definition:
identical alignment columns divided by alignment length, including gap columns in the denominator.
This is [EMBOSS Identity/Length](https://emboss.sourceforge.net/docs/themes/AlignFormats.html)
(unversioned, observed 2026-10-23), independently corroborated by
[Boratyn et al., 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3692093/), around Figure 1.
A query-normalized edit percentage is different. **Owner decision open:** rename that percentage
with its explicit formula, or compute reference-defined alignment identity; neither renaming nor
approval establishes its scientific method or the present 60% threshold. Establish the method
and independent oracle before adoption. Declare rounding separately.

**Reference tools.** Documented: EMBOSS and the BLAST report use the alignment-length denominator.
BLAST coverage is a separate quantity; Appendix Table C1 distinguishes per-subject/all-HSP
`qcovs` from per-HSP `qcovhsp` ([manual, updated 2021-03-14](https://www.ncbi.nlm.nih.gov/sites/books/NBK279684/)).

**Applications.** No application convention makes query-normalized edits interchangeable with
alignment identity.

**Dunceious.** Mixed — [#257](https://github.com/JoaoVictorDaijo/dunceious/issues/257),
[#258](https://github.com/JoaoVictorDaijo/dunceious/issues/258).
`src/core/search/local/metrics.ts:28` and `src/app/components/search/HitAlignment.tsx:84` use
identities/all columns. `src/core/search/fuzzy.ts:249` instead computes
`100 × (queryLength − edits) / queryLength`, disclosed as query identity at
`src/app/components/SearchPanel.tsx:192`, floored at `search/SearchResultGroup.tsx:108` and
in `src/core/formats/searchHitNote.ts:30`. OP-12 owns whole-query matching; FMT-15 owns the
private note/provenance contract. Query coverage at `HitAlignment.tsx:87` is a single local
query span divided by query length, including residues paired to reference gaps; it is not
asserted to be a multiple-HSP union. Raw local score at `local/metrics.ts:36` is the engine's
half-unit score divided by two, not a bit score, probability or percentage; scoring uses ALN-1.

## METRIC-5a. Consensus method

**Rule.** **Owner decision open:** select and name an established consensus method and its
defaults/parameters. [EMBOSS `cons` 6.6.0.0, Algorithm/`-plurality`](https://emboss.sourceforge.net/apps/release/6.6/emboss/apps/cons.html)
uses matrix/sequence weights and a weighted positive-match support cutoff (default half total
weight). [Jalview consensus help](https://www.jalview.org/help/html/calculations/consensus.html)
(unversioned, observed 2026-10-23) documents modal-residue percentage and `+` for ties. These are
supported alternatives, not one shared default. An unsupported custom statistic needs established
evidence and an independent oracle; owner approval alone supplies neither.

**Reference tools.** Documented: EMBOSS's best-scoring residue and support threshold differ
from an unweighted literal mode.

**Applications.** Documented: Jalview includes gaps by default, offers ignore-gaps and group
options, and marks modal ties; its live help is not proven bound to cohort release 2.11.5.2.

**Dunceious.** Owner decision open; differs from both complete documented defaults —
[#254](https://github.com/JoaoVictorDaijo/dunceious/issues/254).
`src/domain/bio/consensus.ts:28` takes the literal mode, gaps eligible, of truthy aligned rows.
Ties choose the first maximal key in `Object.entries(counts)` at :51. Letter/gap ties follow
first appearance; retained integer-like keys enumerate numerically first, so arbitrary imported
characters do not universally follow first-seen order. A plurality need not exceed 50%.

## METRIC-5b. Conservation meaning

**Rule.** A display named after Jalview conservation must compute its documented physicochemical
protein-property index. [Jalview conservation help](https://www.jalview.org/help/html/calculations/conservation.html)
(unversioned, observed 2026-10-23; citing Livingstone/Barton 1993) distinguishes identity
(default score 11) from conservation of all property groups without identity (10).
**Owner decision open:** select that method where applicable, or another established method
with appropriate naming, defaults and independent validation. A literal agreement fraction does
not inherit the Jalview definition by sharing the word conservation.

**Reference tools.** EMBOSS consensus (METRIC-5a) is a different operation, not this property index.

**Applications.** Documented: Jalview's method is protein-property conservation, not a general
nucleotide agreement percentage.

**Dunceious.** Owner decision open; differs from Jalview conservation —
[#254](https://github.com/JoaoVictorDaijo/dunceious/issues/254).
`src/app/viewer/GenomeViewer.tsx:219` counts the largest literal nongap symbol frequency divided
by all rows; `src/app/viewer/Minimap.tsx:194` instead counts equality to supplied consensus divided
by all rows, forcing gap/absent consensus to zero. These displays can disagree. Neither computes
a property index; `tracks/ConservationTrack.tsx:23` renders the main fraction.

## METRIC-5c. Column-statistic population

**Rule.** Define population, alphabet/case normalization, gaps, absent short-row positions,
denominator and sampling in agreement with the selected documented method (METRIC-5a/5b).
Apply the same definition wherever the same quantity is computed and displayed.
**Owner decision open:** the gap/group options in [Jalview consensus](https://www.jalview.org/help/html/calculations/consensus.html)
and weight/matrix choices in [EMBOSS `cons` 6.6.0.0](https://emboss.sourceforge.net/apps/release/6.6/emboss/apps/cons.html)
are documented alternatives; they do not validate arbitrary local combinations.

**Reference tools.** Documented: EMBOSS's population weights and plurality are algorithm parameters.

**Applications.** Documented: Jalview exposes gap and group choices; this is not authority for
Dunceious's exact visibility/missing-row policy.

**Dunceious.** Owner decision open — [#254](https://github.com/JoaoVictorDaijo/dunceious/issues/254).
`src/app/hooks/useBioWorker.ts:189` dispatches visible records; `src/domain/bio/consensus.ts:31`
then keeps truthy aligned strings, ignores absent positions and compares case-sensitive literal
symbols. The viewer at `src/app/viewer/GenomeViewer.tsx:223` uses aligned-or-raw strings, excludes
gaps from candidates but keeps all rows in the denominator. The minimap at `Minimap.tsx:156`
samples every `max(1, floor(alignmentLength / 1000))` columns and uses its separate denominator
and consensus-gap policy at :194. Case and nucleotide U/T distinctions remain literal.

## METRIC-6a. Pair glyph meanings

**Rule.** State format- and mode-specific glyph meanings for equality, ambiguity acceptance,
positive matrix substitutions, mismatches and gaps.
[EMBOSS Alignment Formats, Markup Line/pair](https://emboss.sourceforge.net/docs/themes/AlignFormats.html)
(unversioned, observed 2026-10-23) describes differing format conventions. The inspected
[`ajalign.c` rev. 1.132, 2012-07-02](https://raw.githubusercontent.com/kimrutherford/EMBOSS/master/ajax/core/ajalign.c),
`alignWriteSrsAny`/`alignSim`, supports the pair mapping `| : . space`; it does not establish
exact EMBOSS 6.6 provenance or every ambiguity edge case. Positions/layout use COORD-1/FMT-13,
CIGAR consumption FMT-10, and anchored unit-cost traceback OP-20.

**Reference tools.** Documented source snapshot: pair glyphs are selected by that renderer;
the general theme manual is not a universal glyph specification.

**Applications.** Canvas colors, carets, lane placement and zoom thresholds remain interface
policy; no matching external recipe established.

**Dunceious.** Conforms to the inspected basic pair mapping; full reference equivalence unknown.
`src/core/search/hitColumns.ts:94` maps identical to `|`, ambiguity or similar to `:`, mismatch
to `.`, gaps to space. Local `:` means a nonidentical positive substitution; nonlocal `:` means
ambiguity acceptance. `src/app/components/search/SearchDetails.tsx:44` exposes the legend;
`src/app/viewer/tracks/SequenceTrack.tsx:272` renders query marks. Nonlocal ambiguity acceptance
is not matrix similarity. Width 60 is a local choice, not a verified EMBOSS 6.6 default (FMT-13).

## METRIC-6b. Positive-score and exclusive-substitution counts

**Rule.** Distinguish nongap positive-matrix-score counts from nonidentical positive-substitution
counts. Identity is counted independently of matrix score. The
[EMBOSS Similarity manual](https://emboss.sourceforge.net/docs/themes/AlignFormats.html)
(unversioned, observed 2026-10-23) additionally asserts that all identities are similar;
that assertion conflicts with the inspected
[`ajalign.c` rev. 1.132 private `alignConsStats`](https://raw.githubusercontent.com/kimrutherford/EMBOSS/master/ajax/core/ajalign.c),
which independently counts identity and positive-score similarity. Preserve this discrepancy
for nonpositive self-comparisons. An eventual conformance decision must identify and validate
the selected reference implementation/version.

**Reference tools.** Documented source: `alignWriteSrsAny` calls private `alignConsStats` and
`alignSim`; positive comparisons and identity flags are independent. Exact release 6.6
runtime equivalence is unverified.

**Applications.** No application convention resolves that manual/source disagreement.

**Dunceious.** Two distinct implemented counts; **Owner decision open** on names and the
reference implementation/version for eventual conformance. Positive-score similarity and
nonidentical positive substitutions must remain separately named quantities.
`src/core/search/local/metrics.ts:28` counts every positive-score nongap pair, including
identities only when their scores are positive. EDNAFULL N/N and EBLOSUM62 X/X have diagonal −1
(`local/matrices/EDNAFULL:24`, `EBLOSUM62:30`): each can yield identity 1/similarity 0 by inspection.
`src/core/search/hitColumns.ts:72` classifies identities first, so its prose similar count is
exclusively nonidentical positive substitutions (`src/app/logic/hitAlignmentText.ts:45`).
No claim that either count necessarily includes every identity follows.

## METRIC-6c. Reference comparison policy

**Rule.** **Owner decision open:** select and substantiate equality, case/U normalization,
ambiguity and gap handling for reference comparison displays.
[EMBOSS `showalign` 6.6.0.0, Description/`-show`/`-refseq`](https://emboss.sourceforge.net/apps/release/6.6/emboss/apps/showalign.html)
provides selectable comparison presentation, not proof of Dunceious's exact algorithm.
ALPHA-1/2 govern symbols only. OP-reference-compare is a partly covered inventory item outside
the original uncovered scope, not an existing rule defining this algorithm.

**Reference tools.** Documented: `showalign` offers reference and display selections. A suitable
established comparison policy and independent oracle must be identified before adoption.

**Applications.** No exact normalization/ambiguity convention established for this display.

**Dunceious.** Owner decision open. `src/domain/bio/referenceComparison.ts:37` uppercases and
maps U→T only for nucleotides. At :52 absent residues count as gaps; gap/gap is identical.
Known concrete residues compare literally; equal ambiguous symbols such as N/N remain ambiguous
at :60. Proteins include standard residues, U/O and stop. The viewer at
`src/app/viewer/tracks/SequenceTrack.tsx:207` uses these classes for residue presentation.

## METRIC-7a. Observed interval values and interpolation

**Rule.** Distinguish supplied interval values, missing regions and explicitly declared
interpolation. [UCSC bedGraph, Data Values](https://genome.ucsc.edu/goldenPath/help/bedgraph.html)
(unversioned, observed 2026-10-23) graphs specified positions; a line connecting interval
midpoints must not silently imply additional observed values. Half-open membership uses
FMT-7/FMT-8; residue-to-alignment transposition uses OP-4; displayed numbering uses COORD-1.
**Owner decision open:** interval bars/points or a declared interpolation can express different
presentation contracts; no replacement interpolation method is selected here.

**Reference tools.** Documented: UCSC offers bar/points and optional smoothing/windowing;
these choices do not turn missing spans into supplied observations.

**Applications.** No universal plotting aesthetic inferred from the bedGraph contract.

**Dunceious.** Deviates in interval presentation —
[#260](https://github.com/JoaoVictorDaijo/dunceious/issues/260).
`src/app/viewer/tracks/QuantitativeTrack.tsx:117` connects midpoint values through missing spans.
`src/app/viewer/Row.tsx:511` and :529 include exclusive ends in hit testing. Features are
transposed at `src/domain/bio/coordinate.ts:178`, but quantitative tracks retain source coordinates
through the record spread at :181 even when drawn on an aligned x-axis. These coordinate defects
belong to FMT-7/FMT-8/OP-4 rather than a new metric coordinate rule.

## METRIC-7b. BED score meaning

**Rule.** Interpret BED score as [BED v1 §1.7](https://samtools.github.io/hts-specs/BEDv1.pdf)
(2022-01-05, rev. 9ddbc52): integer 0–1000, possibly used for display shading. A plotted score
has no intrinsic biological unit. An absent BED3 score is not a measured zero; explicitly
uninformative zero scores are permitted. FMT-7 owns field validation.

**Reference tools.** Contract: the BED specification describes shading/score semantics, not a
universal measured quantity.

**Applications.** No biological interpretation follows solely from browser graph support.

**Dunceious.** Limited interpretation —
[#260](https://github.com/JoaoVictorDaijo/dunceious/issues/260).
`src/core/formats/annotations.ts:39` reads BED into a quantitative track, including missing-score
fallback; `src/app/viewer/tracks/QuantitativeTrack.tsx:40` renders numeric values. These paths
do not establish measurement units or full BED score validation.

## METRIC-7c. Numeric display precision

**Rule.** **Owner decision open:** declare label rounding separately from stored values and
exact tooltips. Rounded compact labels with exact inspection, or more precise labels, are
interface alternatives; no opened BED/bedGraph source prescribes one decimal or a palette.
The [BED v1 score field](https://samtools.github.io/hts-specs/BEDv1.pdf) and
[UCSC bedGraph Data Values](https://genome.ucsc.edu/goldenPath/help/bedgraph.html)
(versions/dates as above) constrain the source values, not this presentation precision.

**Reference tools.** No exact one-decimal display rule established.

**Applications.** No universal precision/palette convention established.

**Dunceious.** Owner decision open — [#260](https://github.com/JoaoVictorDaijo/dunceious/issues/260).
`src/app/viewer/tracks/QuantitativeTrack.tsx:201` and `src/app/viewer/Row.tsx:167`, :176 round
visible labels to one decimal. `Row.tsx:516` interpolates the unrounded value into the tooltip;
stored precision is not lost by label rounding.

## METRIC-8a. Service limits

**Rule.** Describe EBI MSA input caps as dated service limits, with the client's safety margin
separate. The [Job Dispatcher Bioinformatics FAQ, maximum MSA input table](https://ebi-biows.gitdocs.ebi.ac.uk/documentation/faqs/bioinformatics/)
(unversioned, observed 2026-10-23) gives MAFFT/MUSCLE 500 sequences and 1 MB, Kalign 2,000 and
2 MB, Clustal Omega 4,000 and 4 MB. Retain the table's tool-specific and/or conditions; do not
infer performance, exact MB byte convention or a scientific-engine version from these caps.

**Reference tools.** Documented service practice only; local aligner limits need not be these caps.

**Applications.** No comparative accuracy/speed ranking follows from a service quota.

**Dunceious.** Cap magnitudes conform by inspection (`src/core/alignment/ebi.ts:36`). The client
uses decimal byte caps and a stricter 0.995 margin at :49 and `preflight.ts:79`; that margin
is local policy. **Owner decision open:** retain a disclosed conservative client margin, or
follow an established dated byte-limit contract once the provider convention is known. No new
margin or byte convention is selected. FMT-12 separately governs the known EBI parameter/output contract.

## METRIC-8b. Comparative alignment claims

**Rule.** Comparative speed/accuracy and whole-genome recommendations need a matching sourced,
versioned benchmark or documented reference claim. The
[EBI FAQ](https://ebi-biows.gitdocs.ebi.ac.uk/documentation/faqs/bioinformatics/)
(observed 2026-10-23) establishes service caps and warns that these tools are not intended
for genome synteny maps; it does not establish Dunceious's comparative claims.

**Reference tools.** No matching versioned performance benchmark was established in the opened
sources. Unknown claims are not thereby proved false.

**Applications.** Owner decision open: remove unsupported comparisons or substantiate them
for the actual engine versions, inputs and parameters. No performance winner is selected here.

**Dunceious.** Unverified. `src/core/alignment/ebi.ts:36` recommends MAFFT on whole genomes;
:38 calls Kalign fastest/about 3× MAFFT and less precise on divergent sequences; :40/:42 make
further relative-speed claims. The FAQ alone neither verifies nor refutes those statements.

## METRIC-8c. Remote-alignment provenance

**Rule.** **Owner decision open:** define retained/displayed engine, version, submitted
parameters, provider job and local postprocessing information. A minimal dated submission
record or a fuller reproducibility record are different contracts; unavailable metadata must
remain unknown. [EBI programmatic-access documentation](https://www.ebi.ac.uk/jdispatcher/docs/webservices/)
(observed 2026-10-23) and the tool-specific parameter/output contract (FMT-12) do not establish
that engine-version metadata is available or define a complete provenance schema. Never invent
a version or imply a pinned engine from a pinned client contract.

**Reference tools.** Documented service workflow; complete engine/version provenance unestablished.

**Applications.** No exact Dunceious provenance schema established externally.

**Dunceious.** Owner decision open — [#252](https://github.com/JoaoVictorDaijo/dunceious/issues/252).
`src/app/hooks/useRemoteAlignment.ts:120` logs engine label/job ID and :124 elapsed time;
version/complete parameters are absent from those log messages. FMT-12 distinguishes provider
output from alias remapping, local validation and terminal-stop restoration. Overlay width/ID
checks alone do not establish residue identity, so the overlay also requires ungapped residue
equality ([#249](https://github.com/JoaoVictorDaijo/dunceious/issues/249)).

## METRIC-9a. Compact-strip overflow

**Rule.** **Owner decision open:** choose an individually distinguishable feature display or
an explicitly summarized compact strip and disclose forced lane overflow.
[UCSC TrackDb v2, `visibility`](https://genome.ucsc.edu/goldenPath/help/trackDb/trackDbHub.v2.html)
(observed 2026-10-23) documents dense, pack and full modes as related alternatives; it prescribes
neither Dunceious's lane cap nor spacing. COORD-1 owns positions.

**Reference tools.** No exact packing/cap/tick recipe established for Dunceious.

**Applications.** Documented: UCSC dense summarizes/overlays items, pack/full have different
individual-item presentation. These are precedents, not a mandatory mode for another viewer.

**Dunceious.** Owner decision open. `src/app/logic/trackLayout.ts:60` reserves 0.004 of raw
sequence length as spacing; :68 forces conflicting overflow into the final allowed lane.
Ruler ticks/kb at :87 are local presentation choices. No external default is adopted for these.

## METRIC-9b. Minimap density

**Rule.** **Owner decision open:** define each density/opacity value's counted objects,
coordinate/pixel population and saturation. [UCSC TrackDb v2 display modes](https://genome.ucsc.edu/goldenPath/help/trackDb/trackDbHub.v2.html)
(observed 2026-10-23) supply summary-display precedent, not a density formula. Options such as
explicit projected-envelope occupancy or a separately validated feature-per-base statistic must
retain their distinct definitions; neither is selected. Column-statistic sampling uses METRIC-5c.

**Reference tools.** No matching documented 0.1-per-projected-envelope-pixel statistic established.

**Applications.** UCSC dense overlay is related practice only; no exact opacity calibration follows.

**Dunceious.** Owner decision open. `src/app/viewer/Minimap.tsx:168` projects each feature envelope
onto pixels, adds 0.1 per covered pixel at :173, keeps the first color and caps opacity at 1
at :182. This is not an established feature-per-base density measure.

## METRIC-10a. Annotation-count population

**Rule.** **Owner decision open:** state numerator/denominator and whether source features,
filtered/hidden records, duplicates and custom groups are included. Reuse one population
where labels promise the same quantity. [INSDC FT 11.4 feature definitions](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html)
and [NCBI FEATURES/source](https://www.ncbi.nlm.nih.gov/genbank/samplerecord/)
(observed 2026-10-23) establish that source is a feature, not whether a UI annotation count must
include it. All-feature and non-source counts are supported bookkeeping alternatives when named;
biological prevalence also needs a substantiated grouping/population under OP-10.

**Reference tools.** No matching exact UI population contract established.

**Applications.** Documented: [Roary manual](https://sanger-pathogens.github.io/Roary/)
(based on 3.11.2, 2018-01-22), `gene_presence_absence.csv`/`.Rtab`, gives cluster/sample presence,
isolate/sequence counts and length summaries; a gene name may occur in separate clusters.
[Geneious Compare Annotations](https://manual.geneious.com/en/latest/Annotations.html)
(unversioned, observed 2026-10-23) allows name/property/interval criteria. Neither validates
Dunceious's name-only grouping, 3% odd or <50% accessory thresholds or cross-record raw-start medians.

**Dunceious.** Owner decision open — [#259](https://github.com/JoaoVictorDaijo/dunceious/issues/259),
[#256](https://github.com/JoaoVictorDaijo/dunceious/issues/256).
Details count every feature at `src/app/components/RecordDetailsModal.tsx:283`; hub composition
excludes source (`src/domain/bio/recordStatus.ts:38`, `src/app/components/hub/SequenceSectionHeader.tsx:39`).
`src/app/logic/featureComparison.ts:132` counts present records and :137 all group records as pool,
displayed by `FeatureSectionHeader.tsx:56` and `HubIndex.tsx:71`. The classifier baseline at :89
has additional exclusions. Export counts are non-source at `ExportDialog.tsx:132` and
`ExportSequenceTree.tsx:61`. These are literal counts, not verified orthology/prevalence conclusions.

## METRIC-10b. Export reconciliation

**Rule.** **Owner decision open:** define annotation/edit/detail/omission/ID-adjustment quantities
and reconcile preview reports with serialized output. Sharing a serializer is evidence of a
shared path, not independent proof of correctness. An unpopulated ledger cannot prove that
no adjustment occurred. Destination-format biological warnings retain their own source rules;
[INSDC FT 11.4](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html) does not define this
application report schema. METRIC-1 governs the raw residue length in the composite preview.

**Reference tools.** No matching external contract established for these exact report fields.

**Applications.** Related annotation/export capabilities do not settle the ledger. Options include
counts of selected objects versus counts of actually serialized objects; labels and reconciliation
must make that distinction explicit, without selecting a policy here.

**Dunceious.** Owner decision open. `src/app/logic/exportPlan.ts:75` shares serializer dispatch
between preview and download. `src/app/components/hub/ExportDialog.tsx:132` counts annotations/edits,
and :170 displays quantities/reports. `src/core/exportReport.ts:38` initializes `adjustedIds`;
a whole-source search finds its declaration, initializer and two consumers, no writer. Thus
an empty ledger does not independently establish no ID adjustment. Source/validation deviations
remain [#251](https://github.com/JoaoVictorDaijo/dunceious/issues/251) and
[#247](https://github.com/JoaoVictorDaijo/dunceious/issues/247), not new export-count definitions.

## METRIC-10c. Returned-hit counts

**Rule.** **Owner decision open:** define one result per search mode and disclose configured
caps and completeness. Count records with returned hits separately from all searched records.
[NLM KA-03485](https://support.nlm.nih.gov/knowledgebase/article/KA-03485/en-us)
(unversioned, observed 2026-10-23) documents configurable default-100 Web BLAST reporting;
[NCBI BLAST Table C1](https://www.ncbi.nlm.nih.gov/sites/books/NBK279684/)
(updated 2021-03-14) distinguishes sequence and per-subject HSP caps. This supports capped
reporting practice, not Dunceious enumeration equivalence. Explicitly capped reporting versus
verified exhaustive reporting are distinct contracts; no new enumeration policy is selected.

**Reference tools.** Documented: BLAST count universes depend on reporting limits, filters and
stringency; a result cap is not an exhaustive search total.

**Applications.** No exact interchangeable count definition established for overlapping exact,
greedy fuzzy and filtered local results.

**Dunceious.** Owner decision open — [#257](https://github.com/JoaoVictorDaijo/dunceious/issues/257).
`src/app/components/SearchPanel.tsx:223` exposes a configurable limit;
`src/app/hooks/useSearchWorker.ts:52`, :125 default it to 100. `SearchPanel.tsx:240` labels
returned-list length, with a Top-n caveat only when local cutoff is nonnull. At :248 it counts
records with returned hits, not all searched records. Exact/fuzzy count labels do not themselves
disclose truncation; exhaustiveness is unestablished.

## METRIC-10d. Local-search count ledger

**Rule.** **Owner decision open:** define streams, no-positive streams, skipped records,
overlap/filter exclusions and beyond-limit counts inside their declared score-cutoff universe.
[NCBI BLAST Table C1](https://www.ncbi.nlm.nih.gov/sites/books/NBK279684/)
(updated 2021-03-14) documents related thresholds, culling and reporting caps, not these exact
counters. Raw score uses ALN-1 and [EMBOSS Score](https://emboss.sourceforge.net/docs/themes/AlignFormats.html)
(observed 2026-10-23), not a probability/percentage. A complete-enumeration ledger and a
cutoff-bounded ledger are distinct reporting options; no counter equivalence is adopted here.

**Reference tools.** Documented threshold/cap practice; exact stream ledger unestablished.

**Applications.** No matching external schema for these exclusions established.

**Dunceious.** Owner decision open — [#257](https://github.com/JoaoVictorDaijo/dunceious/issues/257).
`src/app/components/search/SearchDetails.tsx:34` declares the cutoff/count universe and :35–41
displays categories. Zero applies only within that universe; the display does not independently
prove the generation semantics. Local merge/count generation remains OP-13 scope; the legend
at :44 independently uses METRIC-6a.

## METRIC-10e. Completeness assertions

**Rule.** **Owner decision open:** substantiate whole-record Partial and not-determined/missing
interpretations before presenting them as biological completeness conclusions.
[INSDC FT 11.4 §3.4.2.1](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html)
defines uncertain feature bounds, not whole-record incompleteness. Feature-level uncertainty,
a record explicitly described as partial, and lack of annotations are distinct evidence states.
An interface can expose those observations separately or use a substantiated completeness method;
no biological rule/3%/50% threshold is selected by this document. OP-10 owns the classifier.

**Reference tools.** The INSDC contract does not derive whole-record status from any one partial feature.

**Applications.** Related Geneious/Roary comparisons (METRIC-10a) do not validate Dunceious's
completeness heuristics.

**Dunceious.** Owner decision open — [#256](https://github.com/JoaoVictorDaijo/dunceious/issues/256).
`src/domain/bio/recordStatus.ts:32` records any partial feature; :53 calls the record Partial
from that flag or the word partial in its definition, while :46 defines unannotated as no
non-source features. `src/app/logic/featureComparison.ts:89` excludes those records from the
baseline and :122 assigns not-determined to absent groups on Partial records; missing/absent
then depend on the custom classifier. `src/app/components/hub/SequenceSectionHeader.tsx:55`
shows whole-record badges. Their biological completeness meaning remains unestablished.

## METRIC-11. Sequence context

**Rule.** **Owner decision open:** define context as biological residues or alignment columns
and declare its extent. [Geneious Working with Annotations, Extraction Context/Bulk extraction](https://manual.geneious.com/en/latest/Annotations.html)
(unversioned, observed 2026-10-23) documents configurable upstream/downstream flanks;
it establishes no universal eight-column default. Residue flanks and gap-inclusive column flanks
are different supported presentation choices. COORD-1 owns positions; METRIC-1 names counted objects.

**Reference tools.** No exact eight-unit default established in the opened sources.

**Applications.** Documented: Geneious extraction offers configurable context; the live manual
is not proven tied to the cohort release.

**Dunceious.** Owner decision open. `src/app/logic/searchState.ts:74` defaults context length to 8,
slices aligned-or-raw strings and clips at ends. It includes gaps, so eight columns need not
contain eight biological residues. `src/app/components/search/SearchResultGroup.tsx:119`
uses this fallback when a completed search is absent.
