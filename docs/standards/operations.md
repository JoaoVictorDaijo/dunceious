# Sequence operations

These rules distinguish source-defined biological meanings from application policy. Code
references were checked at `f5a6ad2` on 2026-10-23. Assessments are static inspection, not
reference-tool conformance tests. **Owner decision open** means the cited evidence does not
settle the policy; recording options does not adopt one. A scientific method also needs an
established source and independent oracle under [scientific rigor](../../CLAUDE.md#scientific-rigor-first-priority).
Live manuals below were observed on 2026-10-23; their versions are unspecified unless stated.
The [authority order](README.md#order-of-authority) applies throughout.

## OP-1. Molecule type inferred from composition

**Rule.** Describe composition-based molecule typing as inference, with its exact heuristic
and correction path recorded. Overlapping nucleotide and protein alphabets do not uniquely
determine molecule type; ALPHA-1/ALPHA-2 define symbols, not a detector.

**Reference tools.** No reference-tool method in the verified evidence establishes this
detector or a numerical inference threshold.

**Applications.** Documented: Geneious infers a newly created sequence's type from composition
and permits correction through Type ([Sequences, Creating new sequences](https://manual.geneious.com/en/latest/Sequences.html)).
Its live manual does not specify the inference algorithm.

**Dunceious.** Inference remains unverified: `src/domain/bio/sequence.ts:369` returns protein
for `EFIJLOPQXZ*`, otherwise RNA when U occurs, otherwise DNA. A protein such as `MKV` is
therefore inferred as DNA. **Owner decision open:** retain a disclosed inference with a type
override, following the documented correction precedent, or require an explicit type when
composition is ambiguous. No source validates the present detector as proof of type; import
validation is tracked in [#244](https://github.com/JoaoVictorDaijo/dunceious/issues/244).

## OP-2. Declared GenBank molecule type

**Rule.** Determine a GenBank record's declared molecule type from the LOCUS molecule-type
and unit elements, without allowing the locus identifier or unrelated fields to override
them ([GenBank 274.0, 2026-10-15, §3.4.4.1–2](https://ftp.ncbi.nlm.nih.gov/genbank/gbrel.txt)).

**Reference tools.** Contract: GenBank documents distinct LOCUS elements and recommends
whitespace-token parsing. This nucleotide-format source does not settle the complete GenPept
protein grammar.

**Applications.** Unknown for exact LOCUS-field classification in the verified cohort;
format support alone is not evidence of correct parsing.

**Dunceious.** Deviates — [#243](https://github.com/JoaoVictorDaijo/dunceious/issues/243).
`src/domain/bio/sequence.ts:382` searches the whole line for a word `aa` or substring `rna`,
then defaults to DNA; an identifier can change classification. **Owner decision open:** keep
an unknown/NA declaration unresolved or request explicit clarification, with a separately
sourced protein-format fallback before claiming GenPept conformance.

## OP-3. Mixed molecule types in a workspace

**Rule.** **Owner decision open:** define whether nucleotide and protein records may coexist
in a workspace and what evidence can justify refusing an import. No standard or documented
practice was found for the exact restrictive any-protein session gate and preview policy.

**Reference tools.** The verified search of NCBI, EMBOSS and Biopython typing/alignment
documentation did not establish this viewer-wide restriction.

**Applications.** Documented contrary container practice: Geneious's unversioned
[SequenceListDocument API](https://assets.geneious.com/developer/geneious/javadoc/latest/com/biomatters/geneious/publicapi/documents/sequence/SequenceListDocument.html)
permits nucleotide and protein sequences together; this does not establish that untranslated
mixed types belong in one biological alignment. Evidence-supported options are a mixed list
with operation-specific type requirements, or an explicitly defined homogeneous viewer policy.

**Dunceious.** Policy unestablished: `src/domain/bio/sequence.ts:471` classifies the session
as protein if any record is protein; `src/app/hooks/useFileHandlers.ts:186` uses that category
for import gating. Its FASTA preview (`useFileHandlers.ts:48`) appends complete sequence lines
and checks the 1,200-character trigger after each append, so a long line can exceed it. On a
subsequent header, its counter advances whenever a header was already seen and the cumulative
sample is nonempty, stopping at three. The sample is not reset between records, so this is
not reliably three nonempty records. Later unsampled records can escape classification.
The preview and inference limitations also concern [#244](https://github.com/JoaoVictorDaijo/dunceious/issues/244).

## OP-4. Residues, alignment columns and boundaries

**Rule.** Keep biological residue indices, alignment columns and interval boundaries distinct;
use an explicit residue-to-column correspondence for aligned features and quantitative tracks.

**Reference tools.** Documented: Biopython 1.88
[`Alignment.indices` and `inverse_indices`](https://biopython.org/docs/1.88/api/Bio.Align.html)
represent residue/column correspondence; gap columns have no residue index. Its gap sentinel
is not a policy for mapping interval boundaries.

**Applications.** Unknown for the precise boundary, clamping and annotation-flank policies
in the verified application evidence.

**Dunceious.** Residue correspondence conforms within scope at
`src/domain/bio/sequence.ts:398`; boundary policy remains open at `sequence.ts:416`.
For a nonempty map, the start is clamped and the end forced to at least `safeStart + 1`,
including empty or reversed input ranges; an empty map returns 0..0. The prefix-count map
at `sequence.ts:439` counts residues before a boundary, rather than assigning a gap residue.
`src/domain/bio/coordinate.ts:178` transposes features, while `coordinate.ts:181` preserves
quantitative tracks in source coordinates, a deviation tracked in
[#260](https://github.com/JoaoVictorDaijo/dunceious/issues/260).
**Owner decision open:** use a gap sentinel for residue lookup and a separate prefix-count
boundary map, and decide explicitly whether invalid/empty ranges are preserved, refused or
clamped. The reference does not authorize forcing a site to nonzero width; LOC-5 still applies.

## OP-5. Linear interval clipping

**Rule.** Clipping a nonempty linear interval returns only its nonempty intersection with the
requested interval, dropping nonoverlaps. This is a geometric rule; LOC-4/LOC-5 separately
govern uncertain ends and between-base sites.

**Reference tools.** Documented: [bedtools intersect 2.31.0, default behavior](https://bedtools.readthedocs.io/en/latest/content/tools/intersect.html)
reports the overlapping portion. It supplies no general requirement about list order.

**Applications.** Unknown for this exact clipping/list-order contract in the verified cohort.

**Dunceious.** Conforms for nonempty linear half-open intervals at
`src/domain/bio/intervals.ts:28`: `[max(start,min), min(end,max))` is returned only if nonempty.
`intervals.ts:48` retains input segment order as the current application contract, not a
bedtools-derived guarantee. Circular inputs first need splitting. For ordered biological
parts, LOC-1/LOC-3 govern evaluation order independently of this geometry rule.

## OP-6. Four strand states

**Rule.** Preserve positive, negative, unstranded and relevant-but-unknown strand states as
distinct values wherever GFF3-derived orientation affects behavior
([GFF3 1.26, column 7](https://github.com/The-Sequence-Ontology/Specifications/blob/master/gff3.md)).

**Reference tools.** The specification defines `+`, `-`, `.` and `?`; the verified evidence
does not establish every reference parser's downstream handling.

**Applications.** Unknown for full lifecycle preservation of all four states in the
verified cohort.

**Dunceious.** Conforms within accessor scope: `src/domain/bio/strand.ts:26` restores imported
`.`/`?` from `_gffStrand` and otherwise returns ±1 or `?`. This assessment does not prove
every caller uses the accessor. Complement semantics remain LOC-3.

## OP-7. Ribosomal slippage and inferred junctions

**Rule.** Interpret `/ribosomal_slippage` and its joined CDS location according to
[INSDC FT 11.4, §7.3.1](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html).
Present coordinate-only junction classifications as a defined inference. The standard does
not make every one- or two-base gap/overlap proof of slippage or wider gaps proof of introns.

**Reference tools.** The verified evidence establishes the INSDC representation, not a
distance/type detector or its sensitivity and specificity.

**Applications.** Unknown for an equivalent coordinate-only classifier in the verified cohort.

**Dunceious.** Biological inference unestablished —
[#255](https://github.com/JoaoVictorDaijo/dunceious/issues/255).
`src/domain/bio/frameshift.ts:37` sets a two-base maximum;
`frameshift.ts:65` uses written-order segments but evaluates consecutive end/start pairs as
forward genomic steps, without checking CDS type or `/ribosomal_slippage`. This can miss valid
descending minus-strand joins. **Owner decision open:** distinguish explicit qualifier-based
events from disclosed geometric junction observations; a biological detector or discriminator
requires an established method and independent oracle. Preserve LOC-1/LOC-3 order and strand.

## OP-8. Biological codons and display frames

**Rule.** Construct codons from the feature's biological sequence/order and `/codon_start`;
keep genomic display frame separate from per-part GFF3 CDS phase. This follows
[INSDC FT 11.4, join and `/codon_start`](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html)
and [GFF3 1.26, column 8](https://github.com/The-Sequence-Ontology/Specifications/blob/master/gff3.md).
Reuse LOC-1/LOC-3 and TRANS-2; this rule does not replace TRANS-3/TRANS-4.

**Reference tools.** GFF3 expressly distinguishes phase from frame. The verified evidence
does not settle six-frame row numbering or lane packing.

**Applications.** Unknown for an exact matching reverse-lane numbering convention.

**Dunceious.** Partial static agreement: `src/domain/bio/sequence.ts:223` extracts the oriented
feature before applying its offset. `src/app/viewer/cds.ts:72` uses forward first-base mod 3
and reverse `(firstBase + 1)` mod 3; `cds.ts:78` groups codon pieces by biological adjacency.
These row indices are not GFF3 phase values. Full split-exon and descending-minus correctness
has not been established by a reference run. **Owner decision open:** label rows by an explicitly
declared genomic frame convention or a feature-relative codon convention, with lane packing
kept separate from biological phase; neither exact layout is prescribed by these sources.

## OP-9. Source qualifier and span fidelity

**Rule.** Read and write source qualifiers with their specified meanings and source spans,
preserving distinct values from multiple source features and mandatory source qualifiers for
the target format ([INSDC FT 11.4, source; `/organism`, `/host`, `/geo_loc_name`, `/collection_date`](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html)).
Edited-value validation is OP-18; qualifier multiplicity/syntax is FMT-3.

**Reference tools.** Contract: INSDC permits multiple source features and requires source
`/organism` and `/mol_type` for nucleotide entries. The `/country` transition to
`/geo_loc_name` does not authorize discarding source-specific values.

**Applications.** Unknown for equivalent multi-source editing and export behavior in the
verified application evidence.

**Dunceious.** Basic mapping conforms; multi-source fidelity deviates —
[#242](https://github.com/JoaoVictorDaijo/dunceious/issues/242).
`src/domain/bio/details.ts:27` reads only the first source; `details.ts:38` edits that source
while retaining its other qualifiers. Editing one source is not itself prohibited, but the
record-wide details object cannot represent all source spans. `src/core/genbank/serialize.ts:77`
deletes a qualifier from every source when the first source's record-wide value is absent,
including a value present on a later source. `serialize.ts:84` supplies `/mol_type` but does
not restore missing mandatory `/organism`. Legacy geography spelling can be retained; it
does not resolve the multi-source loss.

## OP-10. Feature comparison and biological labels

**Rule.** **Owner decision open:** select and cite the exact feature identity criterion,
baseline population and evidence-backed biological labels before assigning “odd,” “accessory”
or “missing.” Keep identifier-based annotation comparison distinct from verified homology.
No replacement numerical threshold is adopted.

**Reference tools.** Documented: [Roary's manual, based on 3.11.2, 2018-01-22](https://sanger-pathogens.github.io/Roary/)
defines cluster/sample presence outputs, isolate counts and cluster length summaries. One
gene name can occur in different clusters. This practice does not establish applicability
to every sequence type or the local median-based classifier.

**Applications.** Documented: [Geneious, Compare Annotations](https://manual.geneious.com/en/latest/Annotations.html)
offers common/unique comparisons with optional name/property/interval matching. Options
supported by this evidence are a clearly described annotation-set comparison or a separately
sourced homologous-cluster presence analysis; neither supplies the local cutoffs.

**Dunceious.** Exact classifier unestablished —
[#256](https://github.com/JoaoVictorDaijo/dunceious/issues/256).
`src/app/logic/featureComparison.ts:37` uses product for three peptide types, otherwise
gene/locus_tag/name; grouping also uses organism. `featureComparison.ts:88` excludes partial
and unannotated records from the baseline; type medians further exclude duplicate and partial
features. `featureComparison.ts:110` calls presence in less than half the baseline accessory;
`featureComparison.ts:119` calls length differences greater than 3% of the median odd.
Missing states rely on completeness heuristics. Neither cited method validates these rules;
equal names do not establish homology, and median raw starts need not share a coordinate frame.

## OP-11. Metadata grouping, filtering and sorting

**Rule.** Preserve the source qualifier meanings when grouping, filtering or sorting metadata,
with an explicit policy for date ranges and missing terms
([INSDC FT 11.4, source qualifiers](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html)).

**Reference tools.** No exact group-key or sort-priority contract is established by the
verified reference-tool evidence.

**Applications.** Documented: [Geneious, Using Meta-Data](https://manual.geneious.com/en/latest/Sequences.html#using-meta-data)
supports metadata search/filter/sort; it does not prescribe this application's group keys.

**Dunceious.** Broad capability conforms; exact semantics remain policy.
`src/app/logic/hubModel.ts:32` takes geography before `:` and the first four-digit year;
`hubModel.ts:46` implements case-insensitive substring matching and `hubModel.ts:113` sorts
numeric/text row values. Cross-year ranges therefore enter only their first year and
`missing: ...` geography becomes group `missing`. **Owner decision open:** retain literal
metadata grouping with those disclosed extraction rules, or define range-aware and missing-term
groups consistent with INSDC; the cited capability does not select either interpretation.

## OP-12. Whole-query approximate occurrences

**Rule.** Define whole-query approximate occurrence search using unit-cost edit distance and
a stated query-to-target equality model, with explicit infix target-boundary behavior. Record
thresholds, span refinement, overlap selection, ranking and result limits as application policy.
Anchored traceback is OP-20; metric naming is METRIC-4.

**Reference tools.** Documented: [Edlib 1.1.2 manual](https://martinsos.github.io/edlib/)
and [`EdlibAlignMode` HW](https://martinsos.github.io/edlib/edlib_8h.html) establish whole-query
infix edit distance with free target flanks, rather than a local query-substring objective.
They do not prescribe this application's greedy occurrence enumeration.

**Applications.** Unknown for the exact threshold, directional ambiguity and overlap policies
in the verified cohort.

**Dunceious.** Objective agrees by inspection; reference equivalence is untested.
`src/core/search/fuzzy.ts:194` scans candidate ends, refines spans and greedily rejects
overlaps; `fuzzy.ts:237` removes alignment gaps before searching and maps results back.
`fuzzy.ts:165` sets the 60% floor; the displayed percentage uses query-normalized edits,
not alignment-column identity. **Owner decision open:** define whether reporting means the
current disclosed greedy nonoverlapping occurrences or a separately specified enumeration of
qualifying spans. Thresholds, directional equality and caps need explicit sourced justification
where they affect scientific interpretation; no replacement floor is invented.
Completeness is tracked in [#257](https://github.com/JoaoVictorDaijo/dunceious/issues/257).

## OP-13. Ranking and merging local alignments

**Rule.** Rank a requested best-alignment set by its documented alignment score, with
cross-record ties, cutoff/count scope and pruning equivalence recorded as an application
contract. ALN-1 remains the scoring rule.

**Reference tools.** Documented partial precedent: [EMBOSS matcher 6.6.0.0, Description and example 2](https://emboss.sourceforge.net/apps/release/6.6/emboss/apps/matcher.html)
returns a requested number of top-scoring local alignments for one sequence pair. This does
not prescribe cross-record merging or make matcher the oracle for water scoring.

**Applications.** Unknown for a matching multi-stream tie/count/pruning contract.

**Dunceious.** Descending-score ranking conforms within scope at
`src/core/search/local/selection.ts:33`, then ties use record index, strand, positions and
query start. `selection.ts:41` restricts hidden counts to the final cutoff universe;
`src/core/search/local/bound.ts:21` maintains a monotone lower score bound.
**Owner decision open:** define a global score-ranked set across record/strand streams, or
separate pairwise sets before presentation; matcher supports only the pairwise top-N precedent.
The exact cross-stream contract and schedule-independent pruning remain unverified, including
[#257](https://github.com/JoaoVictorDaijo/dunceious/issues/257)'s completeness concerns.

## OP-14. New annotations seeded from a selection

**Rule.** Seed a selected-region annotation in the selected target's biological coordinates,
with explicit handling of alignment gaps, empty selections, absent targets and no-selection
defaults. Biological joining of search hits is separately OP-19.

**Reference tools.** Documented: [Biopython 1.88 `SimpleLocation`](https://biopython.org/docs/1.88/api/Bio.SeqFeature.html)
uses bounds `0 <= start <= end <= n`; this supports bounds validity, not an automatic default.

**Applications.** Documented: [Geneious, Manual creation](https://manual.geneious.com/en/latest/Annotations.html)
seeds an annotation from the selected sequence/alignment region and permits interval editing.

**Dunceious.** Selected-coordinate conversion agrees within scope at
`src/app/logic/featureManager.ts:75`: it uses the first selected target and counts residues
before aligned boundaries. Gap-only selections, invalid target IDs and the no-selection
0..100 default are not validated here; 100 can exceed a short record.
**Owner decision open:** require a valid nonempty selection, or allow manual interval entry
with bounds validation; the sources support selected seeding/editable bounds but no universal
0..100 default. Related editor validation is tracked in
[#246](https://github.com/JoaoVictorDaijo/dunceious/issues/246).

## OP-15. Rectangular alignment state

**Rule.** Treat equal-width sequences as a rectangular alignment representation and report
its column count separately from evidence of biological alignment provenance.

**Reference tools.** Documented: [Biopython 1.88 `MultipleSeqAlignment` and `get_alignment_length`](https://biopython.org/docs/1.88/api/Bio.Align.html)
describe equal-width rows and the maximum alignment width. Rectangular representation alone
does not show homology or that an aligner ran.

**Applications.** Unknown for the exact minimum-row and empty-input UI predicate.

**Dunceious.** Conforms to the rectangular-width predicate at
`src/app/logic/viewModel.ts:110`, requiring at least two equal-width aligned-or-raw rows and
otherwise reporting maximum width. Equal raw lengths and empty equal-width rows can satisfy
the predicate. **Owner decision open:** label this state as rectangular presentation, or
require retained alignment provenance for an “alignment loaded” assertion. The representation
source supports the first meaning; provenance needs a separate application contract, related
to [#252](https://github.com/JoaoVictorDaijo/dunceious/issues/252).

## OP-16. Identifier boundaries and import namespaces

**Rule.** Apply identifier grammar at the format/submission boundary it governs; record
application import-namespace transformations separately from database accessions.

**Reference tools.** Documented scoped practice: [NCBI nucleotide FASTA guidance, updated 2025-06-18](https://www.ncbi.nlm.nih.gov/genbank/fastaformat/)
requires unique submission SeqIDs, no spaces, an allowed character set and 25-character
guidance. It does not define a universal import namespace or require case folding.

**Applications.** Unknown for the precise reversible mapping, punctuation set and case
sensitivity required by this application.

**Dunceious.** Partial agreement on unique whitespace-free local IDs, not the whole NCBI
submission grammar. `src/app/logic/idHelpers.ts:20` replaces a punctuation subset;
`idHelpers.ts:25` adds suffixes case-insensitively, while `?`, `+`, `/` and unrestricted length
remain. `src/app/logic/bioResponse.ts:85` rewrites imported ID/name while keeping accession
separate. **Owner decision open:** preserve incoming identity with a distinct unique local
key, or retain and expose an explicit reversible import mapping. NCBI submission rules alone
authorize neither destructive renaming nor the present case-folding policy. Destination
format validation must still apply at export.

## OP-17. Coding strand, template strand and transcription

**Rule.** Show coding and template strands in their correct antiparallel orientation and
construct mRNA from the coding strand by T→U transcription.

**Reference tools.** Documented: [Biopython 1.88, Transcription](https://biopython.org/docs/1.88/Tutorial/chapter_seq_objects.html#transcription)
shows coding/template antiparallel strands and coding-strand transcription.

**Applications.** Unknown for this exact decorative presentation in the verified cohort.

**Dunceious.** Conforms in the inspected synthetic example:
`src/app/logic/easterEgg.ts:56` complements position by position with the template read
3′→5′ left to right; `easterEgg.ts:60` replaces coding-strand T with U. Sec/Pyl interpretation
is separately OP-21; this does not assert functional expression of the example.

## OP-18. Dates, geography and missing-value validation

**Rule.** Validate collection dates, geography and missing-value reporting against INSDC
grammar and applicable vocabularies, including allowed date/time ranges, timestamp forms
and mandatory-field-only missing-value usage. Distinguish stricter editing limits from invalid
INSDC values. Source preservation is OP-9.

**Reference tools.** Contract: [INSDC FT 11.4 `/collection_date` and `/geo_loc_name`](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html)
allows slash-delimited date/time ranges; listed timestamp forms use full numeric dates.
[Geography vocabulary](https://www.insdc.org/submitting-standards/geo_loc_name-qualifier-vocabulary/)
and [Missing Value Reporting, Usage](https://www.insdc.org/technical-specifications/missing-value-reporting/)
were observed 2026-10-23, not release-pinned. Missing terms apply when a mandatory value is
missing; optional/recommended fields should instead be omitted. Reporting-level terms need
the `missing:` prefix.

**Applications.** Unknown for exact equivalent validation; application editing limits do not
change the permitted interchange grammar.

**Dunceious.** Deviates — [#247](https://github.com/JoaoVictorDaijo/dunceious/issues/247).
`src/domain/bio/details.ts:67` rejects slash ranges but accepts times after year-only,
month-only and named-month forms, beyond the listed timestamp forms.
`details.ts:92` accepts missing terms for every detail key, including optional host.
The verified complete geography comparison found 280 entries on both sides, differing only
in straight versus curly apostrophe in Cote d'Ivoire; no exhaustive-vocabulary uncertainty
remains for that observed snapshot. `src/core/exportReport.ts:43` omits edited values rejected
by this validator, so valid INSDC ranges can disappear. **Owner decision open:** support the
full grammar in editing, or disclose a narrower editor while preserving valid interchange
values; any vocabulary snapshot and typography normalization needs explicit provenance.

## OP-19. Biological joining of search hits

**Rule.** Write search-derived feature keys and multi-interval locations with their INSDC
meanings and preserve the selected biological evaluation order. Reuse LOC-1/LOC-3 for
join/complement; automatic genomic sorting is not a universal biological join rule
([INSDC FT 11.4, §3.4.2.2 and `misc_feature`](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html)).

**Reference tools.** Contract: `misc_feature` is for biological interest not described by a
more specific key; `join` evaluates its written parts. Neither establishes when arbitrary
search hits constitute one feature.

**Applications.** Unknown for a matching policy for joining arbitrary overlapping or
disconnected search hits.

**Dunceious.** Partial; biological join policy unestablished. `src/app/logic/searchState.ts:49`
sorts record-mode parts and initially preserves selection-mode input order, but
`src/app/logic/featureManager.ts:102` maps parts and then sorts them ascending at
`featureManager.ts:122`, losing selection order before creation.
`src/app/hooks/useFeatureManager.ts:246` creates `misc_feature`; abutting mapped parts remain
separate. **Owner decision open:** create separate annotations for independent hits, or offer
an explicit biological join whose order and key are reviewed; determine overlap/disconnected
meaning and whether abutting parts can merge. The standard constrains the chosen result,
not which hits should be combined. OP-14 separately owns selection seeding.

## OP-20. Anchored edit traceback and CIGAR

**Rule.** Define a selected hit's anchored traceback with full-query and selected-target-span
boundaries, unit-cost insertion/deletion/substitution under the stated equality model, and a
tie policy. Serialize supported path operations with SAM consumption semantics; FMT-10 owns
the CIGAR grammar and METRIC-6a owns glyphs.

**Reference tools.** Documented: [Edlib 1.1.2 NW/path practice](https://martinsos.github.io/edlib/edlib_8h.html)
uses global boundaries and can return an optimal path. [SAM 1.6, 2025-08-12, §1.4 field 6](https://samtools.github.io/hts-specs/SAMv1.pdf)
defines I as query-only, D as reference-only and =/X as consuming both. Edlib does not prescribe
the local tie order, checkpoint strategy or directional IUPAC equality model.

**Applications.** Unknown for the exact anchored traceback contract in the verified cohort.

**Dunceious.** Unit-cost recurrence and path consumption agree by inspection at
`src/core/search/editPath.ts:32`; no oracle/tie equivalence is established. The path uses
full-query/full-span boundaries, diagonal before I before D ties, and checkpointed rows.
Zero-cost query ambiguity acceptance is distinguished from literal `=`/`X`, so an X may cost
zero under the equality model. **Owner decision open:** retain an explicitly documented
deterministic tie/equality contract, or select a named reference's exact path contract and
validate it independently. Neither may be claimed equivalent without that check; occurrence
enumeration remains OP-12.

## OP-21. Ordinary translation and biological recoding

**Rule.** Distinguish ordinary genetic-code assignments from context-dependent Sec/Pyl
recoding. Labeling a synthetic codon recoded does not establish functional recoding context
or production of that residue in vivo ([INSDC FT 11.4, `/transl_except` and §7.4.3](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html)).
Reuse TRANS-1/TRANS-4 for runtime translation; this rule does not claim those paths were repaired.

**Reference tools.** Contract: [NCBI Genetic Codes, table 1, page updated 2024-09-23; gc.prt 4.6](https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi#SG1)
assigns ordinary sense codons and stops. INSDC identifies Sec/U and Pyl/O and confines
stop-codon exceptions to biological reasons; it does not supply recoding machinery for a
decorative sequence.

**Applications.** Unknown for an equivalent synthetic example in the verified cohort.

**Dunceious.** Recoding labels agree within scope at `src/app/logic/easterEgg.ts:38`:
TGA→U and TAG→O carry explicit recoded-stop notes, while ordinary sense codons agree with
table 1. Biological expression is unknown: the nine-codon spelling supplies no functional
Sec/Pyl recoding context, so it is not evidence that this molecule produces the shown peptide.
Strand/transcription correctness is OP-17.
