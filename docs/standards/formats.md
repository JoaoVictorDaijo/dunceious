# File formats

Pinned versions are in [`sources.json`](sources.json); which tools read and write each format
is in [Tools](tools.md). Code references were checked on 2026-10-23 against `f5a6ad2`. Assessments below are static
code/document comparisons, not reference-tool conformance tests. Live documentation is dated
where no release is established; format support alone is not semantic evidence.

| Format | Governing document | Coordinates |
|---|---|---|
| GenBank flat file | NCBI GenBank release notes §3 (release 274.0) + INSDC Feature Table 11.4 | 1-based, inclusive |
| EMBL flat file | ENA/EMBL user manual, release 143 (stored in `sources/`) + INSDC Feature Table 11.4 | 1-based, inclusive |
| GFF3 | GFF3 specification 1.26 (2020-08-18) | 1-based, inclusive; start ≤ end |
| BED | GA4GH BED v1 (2022-01-05) | 0-based, half-open |
| SAM | SAM/BAM format specification 1.6 (2025-08-12) | POS 1-based |
| VCF | VCF 4.5 (2026-02-25) | POS 1-based |
| FASTA | No universal versioned specification. NCBI's nucleotide FASTA submission guidance (2025-06-18) is the usual reference | — |
| GTF | GTF2.2 (Brent Lab); original document unreachable, UCSC's description is the readable reference | 1-based, inclusive |

## FMT-1. INSDC feature key to SO term in GFF3

**Rule.** GFF3 1.26, column 3: the type "is constrained to be either a term from the Sequence
Ontology or an SO accession number", and must be `sequence_feature` (SO:0000110) or an `is_a`
descendant. The SO release is pinned separately (data-version 2026-08-07, stored in `sources/`).
The specification prescribes no INSDC-to-SO mapping, so each mapping choice needs its own
source.

**Reference tools.** Documented: NCBI writes the closest SOFA term and keeps the original
key: "The original GenBank feature type is also provided by the "gbkey" attribute"
([NCBI GFF3](https://www.ncbi.nlm.nih.gov/datasets/docs/v2/reference-docs/file-formats/annotation-files/about-ncbi-gff3/)).

**Applications.** Documented: CLC Genomics Workbench recognises SO term names on import but "will not translate accession
numbers to types" ([GFF3 format, 25.0.3](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=GFF3_format.html)).

**Dunceious.** Conforms to the grammar: every emitted term is in SO 2026-08-07. The mapping
lives in `src/core/formats/soTypes.ts`; the original key is kept in an `insdc_type` attribute
(`src/core/formats/gff3.ts:179`), where NCBI uses `gbkey`. Features crossing the origin are
written as split rows; see LOC-6.


## FMT-2. GenBank entries, headers and sequence layout

**Rule.** Read release 274.0 entries using `//` terminators, tokenized LOCUS field meanings,
declared header fields and 5′→3′ ORIGIN layout. Keep declared information distinct from display
labels ([GenBank 274.0](https://ftp.ncbi.nlm.nih.gov/genbank/gbrel.txt), §§3.4.2,
3.4.4–3.4.7, 3.4.10, 3.4.13–3.4.15). Nucleotide alphabets use ALPHA-1; this document does
not establish a protein GenPept contract.

**Reference tools.** Documented: NCBI's release notes define entry/header/sequence meanings and
the CONTIG alternative. No additional tested parser equivalence is claimed.

**Applications.** Unknown for exact header and malformed-input handling in the surveyed tools;
[format support](tools.md#format-support) does not settle it.

**Dunceious.** Mixed. Canonical terminated entries split correctly, but an unterminated final
piece is accepted (`src/core/genbank/recordSplitter.ts:24`). Header parsing reads the locus ID,
joins DEFINITION continuations and keeps only the primary ACCESSION
(`src/core/genbank/headerParser.ts:46`). Topology scans the whole LOCUS line, as does molecule
classification (`src/domain/bio/sequence.ts:382`), so name substrings can change biology:
[#243](https://github.com/JoaoVictorDaijo/dunceious/issues/243); declared molecule fields also
use OP-2. ORIGIN import strips digits/spacing but also silently drops punctuation, retains any
letter plus `-`/`*`, ignores declared length and does not assemble CONTIG
(`src/core/genbank/toSeqRecord.ts:30`): [#244](https://github.com/JoaoVictorDaijo/dunceious/issues/244).
Display-name truncation, SOURCE fallback and the legacy geography flag remain local policies.

## FMT-3. INSDC feature-table and qualifier fidelity

**Rule.** Preserve each qualifier occurrence and read/write descriptor, qualifier and
continuation lines, feature-key spelling, doubled quotes, flags and qualifier values according
to [INSDC FT 11.4](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html), §§3.3.2–3.3.3,
4.2–4.4 and individual qualifier definitions. GenBank qualifier/continuation data occupies
columns 22–80 ([GenBank 274.0](https://ftp.ncbi.nlm.nih.gov/genbank/gbrel.txt), §3.4.12).
Location meanings remain LOC-1–LOC-7; translation meanings remain TRANS-1–TRANS-4.

**Reference tools.** Documented: INSDC permits multiple values by repeating qualifiers and
empty quoted `/replace=""` for deletion; GenBank supplies the explicit column-80 boundary.
These syntax sources do not establish a full GenPept qualifier map.

**Applications.** Unknown for complete repeated-qualifier and import/edit/export fidelity.
Documented related NCBI naming practice is type-specific
([NCBI GFF3](https://www.ncbi.nlm.nih.gov/datasets/docs/v2/reference-docs/file-formats/annotation-files/about-ncbi-gff3/));
it does not prescribe Dunceious's name-selection algorithm.

**Dunceious.** Deviates: [#242](https://github.com/JoaoVictorDaijo/dunceious/issues/242).
The basic line layout, doubled quotes and translation concatenation are supported, but the
parser keeps only the last occurrence (`src/core/genbank/qualifierParser.ts:32`). The writer
drops empty quoted replacements and can exceed column 80 for unbroken tokens
(`src/core/genbank/qualifierRules.ts:149`); a whitelist does not prove value syntax,
feature applicability or deprecation compliance. Protein vocabulary conformance is Unknown.
Feature names follow parsed-object insertion order: every encountered gene/product/label/locus_tag
overwrites the prior name; `standard_name` is fallback when none is truthy
(`src/core/genbank/featureParser.ts:87`). This is not a fixed array priority. General free-text
whitespace normalization and the exact display-name algorithm remain unsupported local choices.

## FMT-4. Ordinary FASTA syntax and wrapping

**Rule.** Follow the named Biopython 1.88 ordinary FASTA practice: a single `>` title line,
first-token identifier, whitespace-removing sequence input and optional 60-character output
wrapping ([FastaIO](https://biopython.org/docs/latest/api/Bio.SeqIO.FastaIO.html), page verified
as 1.88). Apply [NCBI nucleotide submission guidance](https://www.ncbi.nlm.nih.gov/genbank/fastaformat/)
(updated 2025-06-18) only to that scope. Neither 60-column wrapping nor the nucleotide
submission alphabet is a universal FASTA requirement.

**Reference tools.** Documented: Biopython removes sequence whitespace and its configurable
writer defaults to 60 columns. NCBI's stricter SeqID, alphabet and line guidance is submission-specific.

**Applications.** Unknown for these exact parser/writer semantics across surveyed applications;
FASTA support in [Tools](tools.md) establishes only support.

**Dunceious.** Mixed: `src/core/formats/fasta.ts:31` handles first-token IDs and wrapped input,
but preserves internal whitespace, digits and punctuation, unlike the named Biopython practice:
[#244](https://github.com/JoaoVictorDaijo/dunceious/issues/244). Output has headers and 60-column
wrapping (`src/core/formats/fasta.ts:69`), including the original-residue single-record export
(`src/app/hooks/useFileHandlers.ts:380`). These paths do not prove NCBI-submission-valid IDs,
residues or metadata. Molecule inference uses OP-1. The private Slice field and filenames remain
application policy; aligned slicing uses FMT-6.

## FMT-5. NCBI FASTA definition-line modifiers

**Rule.** For NCBI-submission-compatible headers, write single-line bracketed
`[modifier=value]` fields with exactly supported names and omit modifiers deprecated for new
submissions from 2025-01-01 ([NCBI modifiers](https://www.ncbi.nlm.nih.gov/genbank/mods_fastadefline/),
General Format, Source Modifier List and Important update; observed 2026-10-23).

**Reference tools.** Documented: NCBI specifies spellings, bracket syntax and the dated
new-submission deprecation. Unknown retained names are not thereby submission-valid.

**Applications.** Unknown for exact modifier alias, unknown-key and deprecation handling.

**Dunceious.** Partial. Import recognizes documented keys plus case and legacy/underscore
aliases, retaining unknown keys (`src/core/formats/ncbiModifiers.ts:39`). Export uses the four
detail spellings, isolate/strain and the listed deprecation omissions, but emits retained unknown
keys without validating them against NCBI's list (`src/core/formats/fasta.ts:76`). Full header
submission compatibility is Unknown. Local invalid-detail omission is separate from the modifier
contract; OP-18 records date validation limits and
[#247](https://github.com/JoaoVictorDaijo/dunceious/issues/247).

## FMT-6. Aligned FASTA and alignment columns

**Rule.** Interpret aligned FASTA as equal-width rows with introduced gaps represented by `-`
([Biopython 1.88 AlignIO](https://biopython.org/docs/1.88/api/Bio.AlignIO.html);
[EMBOSS Alignment Formats](https://emboss.sourceforge.net/docs/themes/AlignFormats.html),
Gaps/Multiple sequence formats, observed 2026-10-23). Consequently, selection in gapped columns
must be distinguished from ungapped biological coordinates; OP-4 governs their correspondence.

**Reference tools.** Documented: Biopython requires equal row lengths for alignment reading;
EMBOSS documents gapped FASTA. Neither specifies a workspace-ID reconciliation algorithm.

**Applications.** Documented, scope limited: [NCBI Sequence Viewer](https://www.ncbi.nlm.nih.gov/tools/sviewer/extdata/)
(custom tracks, updated 2024-04-04) accepts MUSCLE/FASTA alignments. Exact header-prefix mapping,
selection windows and residue-integrity checks are Unknown there.

**Dunceious.** Partial. Local overlay checks equal, nonempty rows and ID sets
(`src/app/logic/bioResponse.ts:156`), but duplicate upload IDs can evade set comparison. Each row
must equal its record's loaded residues once `-` is removed from both, ignoring case, or the
overlay is refused with the offending IDs and the workspace unchanged; rows containing `.` are
refused as an unsupported gap symbol (owner decision,
[#249](https://github.com/JoaoVictorDaijo/dunceious/issues/249)). The remote path shares this
check (`isGappedCopyOf`, `src/domain/bio/sequence.ts`).
**Owner decision open:** reconcile exact IDs or retain an explicit alias mapping (FMT-9). Longest-prefix reconciliation has
no established reference contract. Selection
export slices aligned-or-raw strings (`src/app/hooks/useFileHandlers.ts:336`); equal widths are
conditional on the input and not independently checked there. `[Slice: start-end]` is private
metadata without externally established endpoints. Remote provider validation is narrower and
separately described in FMT-12.

## FMT-7. BED fields, coordinates and scores

**Rule.** Interpret BED as 0-based half-open intervals and enforce specified coordinate and
optional-field meanings, including integer score 0–1000
([GA4GH BED v1](https://samtools.github.io/hts-specs/BEDv1.pdf), 2022-01-05, revision 9ddbc52,
§§1.3, 1.5–1.9). Equal endpoints are legal for insertion sites. Distinguish absent or explicitly
uninformative scores from measured zero; the score does not supply a biological unit.

**Reference tools.** Documented: the GA4GH specification defines the BED contract; score 0
can be uninformative. No runtime reference-parser comparison is claimed.

**Applications.** Documented: [IGV Data Tracks](https://igv.org/doc/desktop/FileFormats/DataTracks/)
(observed 2026-10-23, live version unspecified) describes BED routing/support, not complete
numeric validation or scientific score semantics. Other exact behavior is Unknown.

**Dunceious.** Partial: coordinates and fifth-field score position agree, but
`src/core/formats/annotations.ts:39` accepts numeric prefixes and lacks coordinate, score-range,
consistent-field-count and block validation. All-whitespace splitting can shift columns in a
legal tab-separated name containing spaces. Missing scores become zero; names/strands/blocks
are not preserved in this quantitative-track interpretation:
[#250](https://github.com/JoaoVictorDaijo/dunceious/issues/250). Plot membership and score
presentation additionally use METRIC-7a/7b and
[#260](https://github.com/JoaoVictorDaijo/dunceious/issues/260).

## FMT-8. UCSC bedGraph intervals and values

**Rule.** Read chromosome, 0-based half-open start/end and signed integer-or-real value in
numerical position order ([UCSC bedGraph](https://genome.ucsc.edu/goldenPath/help/bedgraph.html),
General Structure/Data Values, observed 2026-10-23). Values describe specified positions only;
omitted rows are not evidence of measured zero. This is UCSC's documented format definition,
not a separately versioned universal plotting standard.

**Reference tools.** Unknown for additional exact parser behavior in NCBI, EMBOSS or Biopython.

**Applications.** Documented: UCSC graphs specified positions and defines these coordinates and
values in the linked originating-browser documentation. It does not prescribe local invalid-row handling.

**Dunceious.** Partial: four-field interpretation, signed real values and half-open coordinates
agree (`src/core/formats/annotations.ts:85`), but numeric prefixes/extra fields are accepted and
interval validity/order is unchecked: [#250](https://github.com/JoaoVictorDaijo/dunceious/issues/250).
NaN rows are skipped and track settings ignored; skipped rows do not establish biological zero.
Observed values versus interpolation uses METRIC-7a and
[#260](https://github.com/JoaoVictorDaijo/dunceious/issues/260).

## FMT-9. GFF3 attachment to the named landmark

**Rule.** Bind coordinates to the landmark named by column 1 `seqid`
([GFF3 1.26](https://raw.githubusercontent.com/The-Sequence-Ontology/Specifications/master/gff3.md),
2020-08-18, column 1 and `##sequence-region`). Preserving an explicit imported-to-workspace
identifier map is a derived application requirement whose alias policy remains an owner decision;
name similarity alone does not establish sequence or assembly identity.

**Reference tools.** Documented: the GFF3 specification defines the coordinate landmark and
sequence-region bounds; it does not supply an alias-equivalence algorithm.

**Applications.** Unknown for exact alias reconciliation and sequence/build verification in
the surveyed applications.

**Dunceious.** Partial: attachment requires exactly one match, preferring the batch ID map
before ID, name/accession and sanitized aliases (`src/app/logic/bioResponse.ts:98`). No assembly
or residue verification is performed: [#250](https://github.com/JoaoVictorDaijo/dunceious/issues/250).
**Owner decision open:** exact-ID-only attachment versus an explicitly retained alias mapping with
specified identity evidence; the standard does not select between them. Whole-length source
fill and qualifier merging are local policies, separately constrained by source fidelity OP-9;
[#251](https://github.com/JoaoVictorDaijo/dunceious/issues/251) tracks source provenance.

## FMT-10. The supported SAM CIGAR subset

**Rule.** For `= X I D S`, preserve SAM's sequence match/mismatch and consumption meanings:
`=`/`X` consume query and reference, `I`/`S` query only, `D` reference only. Restrict soft clips
to alignment ends ([SAM 1.6](https://samtools.github.io/hts-specs/SAMv1.pdf), 2025-08-12,
revision b5341fb, §1.4 field 6). When emitting canonical CIGAR, merge adjacent equal operations
following §2.2's recommendation; rejecting such input is a stronger local policy, not mandatory SAM grammar.

**Reference tools.** Documented: SAM gives operation/end-clip constraints and recommended
adjacency normalization. This subset is not a general SAM parser.

**Applications.** Unknown for exact subset, empty-path and noncanonical-input policies.

**Dunceious.** Partial: `src/domain/bio/cigar.ts:24` rejects nonpositive/unsafe runs and adjacent
equal operations, but accepts internal `S`. `M N H P` and unavailable `*` are unsupported; empty
string is a local no-residue convention. Consumption agrees (`src/domain/bio/cigar.ts:59`).
The writer merges runs (`src/domain/bio/cigar.ts:43`) but does not validate soft-clip placement;
the local producer constructs terminal clips (`src/core/search/local/engine.ts:96`). Literal
case-insensitive equality determines `=`/`X`, including unequal ambiguity-compatible symbols
(`src/core/search/editPath.ts:110`). Traceback is OP-20; glyphs are METRIC-6a. Reader clipping
validation remains incomplete. **Owner decision open:** accept and normalize noncanonical
adjacent runs, or disclose their stricter rejection as a local input policy; terminal clipping
constraints remain mandatory in either case.

## FMT-11. Strand-relative GFF3 CDS phase

**Rule.** Write CDS phase 0/1/2 as the bases from each row's strand-relative 5′ end to its next
codon, carrying continuity across parts rather than using genomic position modulo 3
([GFF3 1.26](https://raw.githubusercontent.com/The-Sequence-Ontology/Specifications/master/gff3.md),
column 8; [INSDC FT 11.4](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html), `/codon_start`).
For coherent ordinary parts, `(phase − partLength) mod 3` is a derivation from that meaning,
not a prescribed algorithm. Display frames remain OP-8; biological order remains LOC-1/LOC-3.

**Reference tools.** Documented: GFF3 requires CDS phase and distinguishes it from frame;
INSDC defines the initial coding offset. No runtime phase oracle was run.

**Applications.** Unknown for arbitrary/mixed-strand/slippage phase policies across applications.

**Dunceious.** Conforms for coherent ordinary parts and valid imported values
(`src/core/formats/gff3.ts:85`): whole-feature minus traversal reverses, non-CDS gets `.`, and
phase carries across parts. Imported values are checked for count and 0/1/2, not continuity.
Malformed `codon_start` is clamped/defaulted. Arbitrary part order, mixed strands, slippage
overlaps and unsupported type spellings remain Unknown; this assessment does not settle those
biological cases or authorize a fallback policy.

## FMT-12. Dated EBI submission and result contracts

**Rule.** Submit/consume remote alignments using the dated, tool-specific service contract,
and distinguish provider output from local aliasing, validation and stop restoration
([EBI programmatic access](https://www.ebi.ac.uk/jdispatcher/docs/webservices/), observed 2026-10-23).
This pins an observed API contract, not engine versions or scientific performance.

**Reference tools.** Documented, official parameter XML observed 2026-10-23:
[MAFFT format](https://www.ebi.ac.uk/Tools/services/rest/mafft/parameterdetails/format),
[stype](https://www.ebi.ac.uk/Tools/services/rest/mafft/parameterdetails/stype),
[order](https://www.ebi.ac.uk/Tools/services/rest/mafft/parameterdetails/order);
[Kalign format](https://www.ebi.ac.uk/Tools/services/rest/kalign/parameterdetails/format),
[stype](https://www.ebi.ac.uk/Tools/services/rest/kalign/parameterdetails/stype);
[Clustal Omega outfmt](https://www.ebi.ac.uk/Tools/services/rest/clustalo/parameterdetails/outfmt),
[stype](https://www.ebi.ac.uk/Tools/services/rest/clustalo/parameterdetails/stype),
[order](https://www.ebi.ac.uk/Tools/services/rest/clustalo/parameterdetails/order);
[MUSCLE format](https://www.ebi.ac.uk/Tools/services/rest/muscle/parameterdetails/format) and
[parameters](https://www.ebi.ac.uk/Tools/services/rest/muscle/parameters).
These establish `format=fasta` for MAFFT/Kalign/MUSCLE, `outfmt=fa` for Clustal Omega,
`order=input` for MAFFT/Clustal Omega and tool-specific molecule-type options; MUSCLE lists
`format`, `tree`, `sequence`, so omitting `stype` agrees. EBI requires a valid email.

**Applications.** Unknown for exact remote-result aliasing, validation and postprocessing in
surveyed applications. FMT-6 supplies aligned-FASTA practice separately.

**Dunceious.** Inspected parameter keys/values agree (`src/core/alignment/ebi.ts:35`), as does
submission with email (`src/app/logic/remoteAlignment.ts:229`). Local `s1…` aliases preserve
IDs (`src/core/alignment/ebi.ts:66`). Raw results must have exactly the aliases, positive equal
widths and case-insensitively identical dash-stripped residues
(`src/core/alignment/ebi.ts:109`). Saved terminal stops then append a synthetic `*`/`-` column;
returned alignment is locally postprocessed. Exact validation/postprocessing and provenance
remain **Owner decision open**: retain a disclosed transformed alignment or expose provider
output and local transformations separately; neither choice establishes engine reproducibility.
Related deviation:
[#252](https://github.com/JoaoVictorDaijo/dunceious/issues/252). The full status/error vocabulary,
`aln-fasta`→`fa`→`out` fallback and engine versions remain Unknown from these sources. Comparative
claims and provenance display use METRIC-8b/8c; the API contract does not validate them.

## FMT-13. EMBOSS-style pair text

**Rule.** For ordinary SRS pair rows, follow ungapped coordinate progression and 13-character
name/6-character coordinate fields from `alignWriteSrsAny`
([AJAX source snapshot](https://raw.githubusercontent.com/kimrutherford/EMBOSS/master/ajax/core/ajalign.c),
revision 1.132, 2012-07-02). Treat display width and reverse-label extensions as application choices.

**Reference tools.** Documented: the inspected source supports these fields and residue-only
counting. The [EMBOSS needle 6.6.0.0 example](https://emboss.sourceforge.net/apps/release/6.6/emboss/apps/needle.html)
corroborates appearance, but the source mirror's exact release identity is Unknown. It starts
with fallback width 50, then uses configured Width; a release-6.6 default of 60 is not established.

**Applications.** Unknown for exact SRS renderer equivalence in surveyed applications.

**Dunceious.** Conforms to those inspected layout aspects for ordinary forward rows
(`src/app/logic/hitAlignmentText.ts:24`). Reverse labels deliberately widen the name field and
coordinates descend; copy width 60 is local policy. **Owner decision open:** retain a declared
local width or follow a named renderer after its version/default is established. Exact release compatibility and exhaustive
edge-case rendering remain Unknown. Scoring stays ALN-1; glyph semantics stay METRIC-6a;
biological numbering stays COORD-1.

## FMT-14. Private project schema

**Rule.** Owner decision open: define accepted scientific states, required read/write round
trips, private-metadata retention and version migration for Dunceious `format: 2`. No external
standard or documented reference practice defining this exact schema was found in the bounded
2026-10-23 review of the source catalog and NCBI/EMBOSS/Biopython/IGV workspace documentation.
JSON grammar does not define scientific-state preservation.

**Reference tools.** Unknown for this exact schema; generic sequence/project APIs are not a
compatible external contract ([Biopython SeqIO](https://biopython.org/docs/latest/Tutorial/chapter_seqio.html),
1.88; [EMBOSS formats](https://emboss.sourceforge.net/docs/themes/SequenceFormats.html), observed 2026-10-23).

**Applications.** Unknown for this exact schema. Other applications' project formats do not
establish Dunceious migration or retention semantics.

**Dunceious.** Unknown against external authority: `src/app/logic/projectFile.ts:41` writes
private state with format 2; `src/app/logic/projectFile.ts:87` validates local shapes and rejects
case-insensitive duplicate IDs. No runtime round-trip evidence is claimed. The current exact-version
rejection and shape checks are implementation evidence only. Owner choices remain whether to
retain that contract or define migrations, and which states/fields must survive; no cited source
selects an alternative or a new schema.

## FMT-15. Private saved-search provenance and notes

**Rule.** Owner decision open: define `_searchHit` versioning, currency, reproducibility
claims and note/consent policy. No external standard or documented practice for this exact v1
object, geometry-only check or sentence was found in the bounded 2026-10-23 review. Embedded
CIGAR remains FMT-10; alignment identity remains METRIC-4. Text carriers have narrower syntax:
[INSDC FT 11.4](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html), `/note`, and
[GFF3 1.26](https://raw.githubusercontent.com/The-Sequence-Ontology/Specifications/master/gff3.md), `Note`.

**Reference tools.** Documented: INSDC/GFF3 permit note text and SAM defines CIGAR; they do
not define Dunceious's provenance object or reproducibility guarantee. Exact policy is Unknown.

**Applications.** Unknown for a matching private schema or geometry-based currency contract.

**Dunceious.** Unknown externally. `src/domain/bio/searchHit.ts:29` checks fields and CIGAR
query span; `src/domain/bio/searchHit.ts:56` compares feature geometry, not current residues,
scoring implementation/version, reference span or coordinate ordering. Metadata is serialized
at `src/domain/bio/searchHit.ts:47` and populated with version/time/search fields at
`src/app/hooks/useFeatureManager.ts:259`. Notes use consent plus this currency gate and an
edit-derived query percentage (`src/core/formats/searchHitNote.ts:23`):
[#258](https://github.com/JoaoVictorDaijo/dunceious/issues/258). METRIC-4 governs its identity
label separately. Owner choices are to scope “current” to unchanged geometry or require additional
residue/search-dependency evidence before reproducibility claims; neither a complete dependency
schema nor a replacement note sentence is established by the sources.

## FMT-16. Parser routing and ambiguous formats

**Rule.** Owner decision open: choose parser routing and ambiguous-format handling. The
following documented alternatives have different API/UI scopes; they establish no shared policy.
Molecule inference, sampling and mixed-session refusal remain separate OP-1/OP-2/OP-3 decisions.

**Reference tools.** Documented alternatives: [NCBI Sequence Viewer](https://www.ncbi.nlm.nih.gov/tools/sviewer/extdata/)
(updated 2024-04-04) asserts autodetection in its URL workflow;
[EMBOSS sequence input](https://emboss.sourceforge.net/docs/themes/SequenceFormats.html)
(observed 2026-10-23, unversioned) tries formats until one succeeds;
[Biopython SeqIO](https://biopython.org/docs/latest/Tutorial/chapter_seqio.html) (1.88) requires
an explicit format. None supplies Dunceious's fallback algorithm.

**Applications.** Documented: [IGV Data Tracks](https://igv.org/doc/desktop/FileFormats/DataTracks/)
(observed 2026-10-23, live version unspecified) routes by extension, distinguishing `.gff`
(GFF2) from `.gff3`. Exact ambiguity handling elsewhere is Unknown.

**Dunceious.** Partial match to extension routing: `src/workers/handlers/bio.ts:57` routes
BED/bedGraph/GFF extensions, treats `.gff` as GFF3, then tests the first physical line for nine
tab fields, otherwise defaults to BED. A leading GFF3 directive/comment defeats that fallback:
[#250](https://github.com/JoaoVictorDaijo/dunceious/issues/250). Drop routing also uses extensions
(`src/app/logic/dropRouting.ts:28`). The independent molecule preview
(`src/app/hooks/useFileHandlers.ts:48`) appends complete lines before checking a cumulative
1,200-character stopping trigger; it is not a hard cap. Its subsequent-header counter uses the
same nonempty cumulative sample without resetting per record, so it does not reliably count
three nonempty records. This algorithm does not gain scientific support from format-autodetection
practice. Owner options remain explicit format, scoped autodetection or extension routing, with
an explicit ambiguous-input policy; no option is selected here.

## FMT-17. GFF3 source column

**Rule.** Column 2 is "a free text qualifier intended to describe the algorithm or operating
procedure that generated this feature"; undefined fields are `.`; tab, newline, carriage return,
`%` and control characters must be percent-encoded, and no other characters may be
([GFF3 1.26](https://raw.githubusercontent.com/The-Sequence-Ontology/Specifications/master/gff3.md),
column 2 and the general escaping rule). Converting or re-exporting a feature does not generate it.

**Reference tools.** Documented: [NCBI GFF3](https://www.ncbi.nlm.nih.gov/datasets/docs/v2/reference-docs/file-formats/annotation-files/about-ncbi-gff3/)
(observed 2026-10-23) writes the pipeline method (for example `Gnomon`, `tRNAscan-SE`) and, when
the method is unavailable, the record's source database (`RefSeq`, `GenBank`, `EMBL`, `DDBJ`).
No runtime oracle was run.

**Applications.** Unknown.

**Dunceious.** Conforms (`src/core/formats/gff3.ts:49`, [#251](https://github.com/JoaoVictorDaijo/dunceious/issues/251)).
An imported source is decoded on import and written back unchanged, including after the feature is
edited; a literal non-conforming `%` is kept as text. Features added in Dunceious, and with no
source of their own, are written as `Dunceious`. Every other feature, and the `region` row of a
record whose GFF3 region carried no source, is written as `.`: a GenBank or EMBL file does not
show whether its records came from that database, so NCBI's database-name fallback is not applied.
The source never appears as a column-9 attribute, and GenBank export omits it as a non-INSDC
attribute (FMT-3).
