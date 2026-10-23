# Sequence standards

Dunceious records published standards and documented reference practice for sequence operations.
This folder records which source governs each operation, what it says, how the reference tools behave, and where
Dunceious stands. Cite a rule by its ID (for example `LOC-2`) in code comments, issues and PRs.

Coverage and code references checked: 2026-10-23, against `develop` at f5a6ad2 (v3.7.3).
Existing conformance evidence retains its recorded fixture/tool scope; the coverage update is a
static code/document comparison, not a new runtime conformance run. Tool survey
([Tools](tools.md), data in [`tools.json`](tools.json)): 2026-10-23.

## Order of authority

When an operation computes or shows a sequence result:

1. **The standard's text**, at the version pinned in [`sources.json`](sources.json). Read the
   document itself (see [Sources](sources.md)); the rules below summarise it, they do not
   replace it.
2. **A rule recorded here.** If a rule turns out to contradict the standard, the standard wins
   and the rule is corrected.
3. **The standard is silent:** follow the documented behaviour of the reference tools (NCBI,
   EMBOSS 6.6.0, Biopython), then of the major applications listed in [Tools](tools.md).
   Record the exact scope of a tool default; never generalise it into a universal rule.
4. **Tools disagree, or nothing is documented:** stop and ask the owner. Record the decision
   here as a new rule, with its sources.

Never invent a convention. A format being widely supported (see [Tools](tools.md)) says
nothing about what is scientifically correct.

## Evidence levels

Every claim about a tool carries one of these:

- **Tested**: run on the [conformance fixture](conformance/README.md) and compared with the
  hand-applied INSDC oracle.
- **Documented**: stated in the tool's official manual, specification or source code, with
  version or date.
- **Contract**: the declared format contract of an INSDC database (GenBank, ENA, DDBJ).
- **Unknown**: not established. Never a basis for a decision, and never evidence that a tool
  lacks a behaviour.

## Rules

| ID | Operation | Governing source | Dunceious | Rule file |
|---|---|---|---|---|
| LOC-1 | `join()` concatenates in written order | INSDC FT 11.4 §3.4.2.2 | Conforms | [locations](locations.md#loc-1-join-concatenates-in-written-order) |
| LOC-2 | `order()` is not `join()` | INSDC FT 11.4 §3.4.2.2 | Deviates: #225 | [locations](locations.md#loc-2-order-is-not-join) |
| LOC-3 | `complement()`, whole feature or per interval | INSDC FT 11.4 §3.4.2.2 | Conforms, including nested outer complements | [locations](locations.md#loc-3-complement-whole-feature-or-per-interval) |
| LOC-4 | `<` `>` uncertain bounds | INSDC FT 11.4 §3.4.2.1, §3.4.3 | Deviates: #226 | [locations](locations.md#loc-4-uncertain-bounds) |
| LOC-5 | `n^(n+1)` between-base sites | INSDC FT 11.4 §3.4.2.1 | Deviates: #230 | [locations](locations.md#loc-5-between-base-sites) |
| LOC-6 | Features crossing the origin | INSDC FT 11.4; GFF3 1.26 | Partial | [locations](locations.md#loc-6-features-crossing-the-origin) |
| LOC-7 | The sequence of a multi-interval feature | INSDC FT 11.4 §3.4.2.2 | Conforms; decided in #81 | [locations](locations.md#loc-7-the-sequence-of-a-multi-interval-feature) |
| COORD-1 | Positions shown to users | INSDC FT 11.4 §3.4.2.1 | Deviates: #231 | [alphabets and coordinates](alphabets-and-coordinates.md#coord-1-positions-shown-to-users) |
| ALPHA-1 | Nucleotide ambiguity codes, T and U | NC-IUB 1984; INSDC FT 11.4 §7.4.1 | Conforms | [alphabets and coordinates](alphabets-and-coordinates.md#alpha-1-nucleotide-ambiguity-codes-t-and-u) |
| ALPHA-2 | Amino-acid codes U O B Z J X | INSDC FT 11.4 §7.4.3 | Conforms, mode-specific | [alphabets and coordinates](alphabets-and-coordinates.md#alpha-2-amino-acid-codes) |
| TRANS-1 | Genetic code from `/transl_table` | NCBI genetic codes, gc.prt 4.6 | Partial (greeter); computed path conforms (#229) | [translation](translation.md#trans-1-genetic-code-from-transl_table) |
| TRANS-2 | `/codon_start` | INSDC FT 11.4 | Conforms | [translation](translation.md#trans-2-codon_start) |
| TRANS-3 | Alternative initiation codons | NCBI genetic codes | Partial; greeter deviation: #261 | [translation](translation.md#trans-3-alternative-initiation-codons) |
| TRANS-4 | `/transl_except` | INSDC FT 11.4 | Partial | [translation](translation.md#trans-4-transl_except) |
| FMT-1 | INSDC feature key to SO term in GFF3 | GFF3 1.26; SO 2026-08-07 | Conforms to grammar | [formats](formats.md#fmt-1-insdc-feature-key-to-so-term-in-gff3) |
| ALN-1 | Local alignment scoring defaults | EMBOSS 6.6.0 `water` | Conforms | [alignment](alignment.md#aln-1-local-alignment-scoring-defaults) |
| FMT-2 | GenBank entries, headers and sequence layout | GenBank 274.0 §3 | Deviates: #243, #244 | [formats](formats.md#fmt-2-genbank-entries-headers-and-sequence-layout) |
| FMT-3 | INSDC feature-table and qualifier fidelity | INSDC FT 11.4; GenBank 274.0 §3.4.12 | Deviates: #242 | [formats](formats.md#fmt-3-insdc-feature-table-and-qualifier-fidelity) |
| FMT-4 | Ordinary FASTA syntax and wrapping | Biopython 1.88; scoped NCBI FASTA guidance | Deviates: #244 | [formats](formats.md#fmt-4-ordinary-fasta-syntax-and-wrapping) |
| FMT-5 | NCBI FASTA definition-line modifiers | NCBI FASTA modifiers, 2026-10-23 | Partial | [formats](formats.md#fmt-5-ncbi-fasta-definition-line-modifiers) |
| FMT-6 | Aligned FASTA and alignment columns | Biopython 1.88; EMBOSS aligned FASTA | Partial; Owner decision open | [formats](formats.md#fmt-6-aligned-fasta-and-alignment-columns) |
| FMT-7 | BED fields, coordinates and scores | GA4GH BED v1 | Deviates: #250 | [formats](formats.md#fmt-7-bed-fields-coordinates-and-scores) |
| FMT-8 | UCSC bedGraph intervals and values | UCSC bedGraph, 2026-10-23 | Deviates: #250 | [formats](formats.md#fmt-8-ucsc-bedgraph-intervals-and-values) |
| FMT-9 | GFF3 attachment to the named landmark | GFF3 1.26 column 1 | Partial; Owner decision open | [formats](formats.md#fmt-9-gff3-attachment-to-the-named-landmark) |
| FMT-10 | The supported SAM CIGAR subset | SAM 1.6 §1.4 and recommended practice §2.2 | Partial; Owner decision open | [formats](formats.md#fmt-10-the-supported-sam-cigar-subset) |
| FMT-11 | Strand-relative GFF3 CDS phase | GFF3 1.26 column 8; INSDC codon_start | Partial | [formats](formats.md#fmt-11-strand-relative-gff3-cds-phase) |
| FMT-12 | Dated EBI submission and result contracts | EBI API/parameter observations, 2026-10-23 | Partial; Owner decision open | [formats](formats.md#fmt-12-dated-ebi-submission-and-result-contracts) |
| FMT-13 | EMBOSS-style pair text | AJAX rev. 1.132; EMBOSS 6.6 example | Conforms (scoped layout); width Owner decision open | [formats](formats.md#fmt-13-emboss-style-pair-text) |
| FMT-14 | Private project schema | Bounded private-schema search | No standard found; Owner decision open | [formats](formats.md#fmt-14-private-project-schema) |
| FMT-15 | Private saved-search provenance and notes | Bounded private-provenance search; separate SAM/identity rules | No standard found; Owner decision open | [formats](formats.md#fmt-15-private-saved-search-provenance-and-notes) |
| FMT-16 | Parser routing and ambiguous formats | NCBI/EMBOSS autodetection; Biopython explicit format; IGV extensions | Owner decision open | [formats](formats.md#fmt-16-parser-routing-and-ambiguous-formats) |
| FMT-17 | GFF3 source column | GFF3 1.26 column 2 | Conforms (#251) | [formats](formats.md#fmt-17-gff3-source-column) |
| OP-1 | Molecule type inferred from composition | Geneious composition inference/correction | Owner decision open | [operations](operations.md#op-1-molecule-type-inferred-from-composition) |
| OP-2 | Declared GenBank molecule type | GenBank 274.0 §3.4.4.1–2 | Deviates: #243; fallback Owner decision open | [operations](operations.md#op-2-declared-genbank-molecule-type) |
| OP-3 | Mixed molecule types in a workspace | Bounded gate search; contrary Geneious list-container practice | No standard found; Owner decision open | [operations](operations.md#op-3-mixed-molecule-types-in-a-workspace) |
| OP-4 | Residues, alignment columns and boundaries | Biopython 1.88 indices/inverse_indices | Deviates: #260; boundaries Owner decision open | [operations](operations.md#op-4-residues-alignment-columns-and-boundaries) |
| OP-5 | Linear interval clipping | bedtools 2.31.0 intersect | Conforms (nonempty linear intervals) | [operations](operations.md#op-5-linear-interval-clipping) |
| OP-6 | Four strand states | GFF3 1.26 column 7 | Conforms (accessor scope) | [operations](operations.md#op-6-four-strand-states) |
| OP-7 | Ribosomal slippage and inferred junctions | INSDC FT 11.4 ribosomal_slippage | Deviates: #255; inference Owner decision open | [operations](operations.md#op-7-ribosomal-slippage-and-inferred-junctions) |
| OP-8 | Biological codons and display frames | INSDC join/codon_start; GFF3 phase/frame distinction | Partial; display Owner decision open | [operations](operations.md#op-8-biological-codons-and-display-frames) |
| OP-9 | Source qualifier and span fidelity | INSDC FT 11.4 source qualifiers | Deviates: #242 | [operations](operations.md#op-9-source-qualifier-and-span-fidelity) |
| OP-10 | Feature comparison and biological labels | Geneious Compare Annotations; Roary 3.11.2 manual | Owner decision open: #256 | [operations](operations.md#op-10-feature-comparison-and-biological-labels) |
| OP-11 | Metadata grouping, filtering and sorting | Geneious metadata; INSDC qualifier meanings | Owner decision open | [operations](operations.md#op-11-metadata-grouping-filtering-and-sorting) |
| OP-12 | Whole-query approximate occurrences | Edlib 1.1.2 HW | Partial; enumeration Owner decision open | [operations](operations.md#op-12-whole-query-approximate-occurrences) |
| OP-13 | Ranking and merging local alignments | EMBOSS matcher 6.6 pairwise best-N | Partial; merge Owner decision open | [operations](operations.md#op-13-ranking-and-merging-local-alignments) |
| OP-14 | New annotations seeded from a selection | Geneious selection seeding; Biopython 1.88 bounds | Partial; defaults Owner decision open | [operations](operations.md#op-14-new-annotations-seeded-from-a-selection) |
| OP-15 | Rectangular alignment state | Biopython 1.88 MultipleSeqAlignment | Conforms (representation); provenance Owner decision open | [operations](operations.md#op-15-rectangular-alignment-state) |
| OP-16 | Identifier boundaries and import namespaces | Scoped NCBI nucleotide FASTA guidance | Partial; namespace Owner decision open | [operations](operations.md#op-16-identifier-boundaries-and-import-namespaces) |
| OP-17 | Coding strand, template strand and transcription | Biopython 1.88 Transcription | Conforms (inspected example) | [operations](operations.md#op-17-coding-strand-template-strand-and-transcription) |
| OP-18 | Dates, geography and missing-value validation | INSDC FT 11.4; dated geography/missing-value vocabularies | Deviates: #247; editing Owner decision open | [operations](operations.md#op-18-dates-geography-and-missing-value-validation) |
| OP-19 | Biological joining of search hits | INSDC misc_feature and join/complement | Partial; Owner decision open | [operations](operations.md#op-19-biological-joining-of-search-hits) |
| OP-20 | Anchored edit traceback and CIGAR | Edlib 1.1.2 NW/path; SAM 1.6 | Partial; tie/equality Owner decision open | [operations](operations.md#op-20-anchored-edit-traceback-and-cigar) |
| OP-21 | Ordinary translation and biological recoding | INSDC transl_except/Sec/Pyl; NCBI gc.prt 4.6 | Partial (expression unknown) | [operations](operations.md#op-21-ordinary-translation-and-biological-recoding) |
| METRIC-1 | Sequence length and alignment width | NCBI residue length; EMBOSS alignment length | Deviates: #259 | [metrics](metrics.md#metric-1-sequence-length-and-alignment-width) |
| METRIC-2 | Feature length | Biopython 1.88 SeqFeature length | Conforms (valid locations); input contract Owner decision open | [metrics](metrics.md#metric-2-feature-length) |
| METRIC-3a | Accession label | GenBank 274.0 §3.4.6 | Deviates: #259 | [metrics](metrics.md#metric-3a-accession-label) |
| METRIC-3b | Detail-warning provenance | INSDC qualifier semantics; no exact UI contract | Owner decision open | [metrics](metrics.md#metric-3b-detail-warning-provenance) |
| METRIC-4 | Alignment identity naming | EMBOSS Identity/Length; BLAST report 2013 | Owner decision open: #257, #258 | [metrics](metrics.md#metric-4-alignment-identity-naming) |
| METRIC-5a | Consensus method | EMBOSS cons 6.6; Jalview consensus | Owner decision open: #254 | [metrics](metrics.md#metric-5a-consensus-method) |
| METRIC-5b | Conservation meaning | Jalview protein-property conservation | Owner decision open: #254 | [metrics](metrics.md#metric-5b-conservation-meaning) |
| METRIC-5c | Column-statistic population | Selected documented consensus/conservation method | Owner decision open: #254 | [metrics](metrics.md#metric-5c-column-statistic-population) |
| METRIC-6a | Pair glyph meanings | EMBOSS format-dependent markup; AJAX rev. 1.132 | Conforms (basic mapping) | [metrics](metrics.md#metric-6a-pair-glyph-meanings) |
| METRIC-6b | Positive-score and exclusive-substitution counts | EMBOSS manual/source discrepancy; AJAX rev. 1.132 | Partial; reference choice Owner decision open | [metrics](metrics.md#metric-6b-positive-score-and-exclusive-substitution-counts) |
| METRIC-6c | Reference comparison policy | EMBOSS showalign 6.6 presentation precedent | Owner decision open | [metrics](metrics.md#metric-6c-reference-comparison-policy) |
| METRIC-7a | Observed interval values and interpolation | UCSC bedGraph Data Values | Deviates: #260; interpolation Owner decision open | [metrics](metrics.md#metric-7a-observed-interval-values-and-interpolation) |
| METRIC-7b | BED score meaning | GA4GH BED v1 §1.7 | Partial: #260 | [metrics](metrics.md#metric-7b-bed-score-meaning) |
| METRIC-7c | Numeric display precision | BED/bedGraph source values; no precision default | Owner decision open | [metrics](metrics.md#metric-7c-numeric-display-precision) |
| METRIC-8a | Service limits | EBI FAQ, observed 2026-10-23 | Conforms (cap magnitudes); margin Owner decision open | [metrics](metrics.md#metric-8a-service-limits) |
| METRIC-8b | Comparative alignment claims | EBI FAQ scope; no matching benchmark established | Owner decision open (claims unverified) | [metrics](metrics.md#metric-8b-comparative-alignment-claims) |
| METRIC-8c | Remote-alignment provenance | Dated EBI workflow; no complete provenance schema | Owner decision open: #252 | [metrics](metrics.md#metric-8c-remote-alignment-provenance) |
| METRIC-9a | Compact-strip overflow | UCSC TrackDb v2 visibility modes | Owner decision open | [metrics](metrics.md#metric-9a-compact-strip-overflow) |
| METRIC-9b | Minimap density | UCSC compact-display precedent; no exact formula | Owner decision open | [metrics](metrics.md#metric-9b-minimap-density) |
| METRIC-10a | Annotation-count population | INSDC source feature; Geneious/Roary comparisons | Owner decision open: #256, #259 | [metrics](metrics.md#metric-10a-annotation-count-population) |
| METRIC-10b | Export reconciliation | Destination-format rules; no exact report schema | Owner decision open | [metrics](metrics.md#metric-10b-export-reconciliation) |
| METRIC-10c | Returned-hit counts | NLM KA-03485; BLAST Table C1 | Owner decision open: #257 | [metrics](metrics.md#metric-10c-returned-hit-counts) |
| METRIC-10d | Local-search count ledger | BLAST Table C1; EMBOSS raw score | Owner decision open: #257 | [metrics](metrics.md#metric-10d-local-search-count-ledger) |
| METRIC-10e | Completeness assertions | INSDC feature uncertainty; no whole-record inference | Owner decision open: #256 | [metrics](metrics.md#metric-10e-completeness-assertions) |
| METRIC-11 | Sequence context | Geneious configurable Extraction Context | Owner decision open | [metrics](metrics.md#metric-11-sequence-context) |

## Not covered yet

All 80 surfaces in the uncovered-item review have a rule or an explicit open contract here:
29 format read/write surfaces (including the two EBI surfaces previously only mentioned in
ALN-1), 25 operations and 26 displayed metrics/sequences. The corrected evidence classification
is **26 standard / 49 documented reference practice / 5 neither found**. These are item counts,
not rule counts or conformance totals. The five bounded negative findings concern project
read/write, private saved-hit read/write and the exact restrictive mixed-type session gate.
Related practices do not validate unsupported subbehaviors of a composite item.

**Owner decision open** records a gap; it adopts no method, threshold or interface policy.
Scientific methods still need established evidence, standard defaults and an independent oracle;
owner approval or renaming alone does not establish an unsupported biological statistic.
“No standard found” is bounded by the reviewed NCBI/EMBOSS/Biopython and relevant application
sources; it is not a claim that no related publication exists. Each rule narrows its assessment.
The tool-survey data remains the dated cohort survey; new rule citations do not extend its
per-tool conformance coverage.

Coverage still needs independent fixture/oracle work for complete versus 5′/3′-partial CDS,
context-dependent terminal stops, split-exon codons, arbitrary/mixed/slippage GFF3 phase,
minus-strand partial ends, `length^1` sites, origin-crossing parts that do not touch base 1,
and remote-accession locations ([#245](https://github.com/JoaoVictorDaijo/dunceious/issues/245)).
The distinctions between accepting, matching, comparing and scoring symbols now have scoped
rules, but full algorithm/oracle equivalence remains unestablished. So do exact GenPept vocabulary,
full EBI status/error/result contracts, engine releases, EMBOSS release-6.6 renderer/default-width
identity, worker/pruning invariance and private schema round trips. Open policy options are
recorded under their rule IDs, including column statistics, fuzzy metric naming, comparison
populations, format routing, overflow, interpolation, performance claims and biological hit joins.

## Changing this folder

- Add or change a rule with its supporting evidence and update the table above. A documentation-only
  coverage update may record an existing deviation or open decision without changing application code.
- Re-run the [conformance fixture](conformance/README.md) when a reference tool version changes.
- Run `npm run standards:fetch` to download the pinned documents into `.cache/standards/` and
  check their checksums. It reports three different things:
  - `FAIL … checksum`: a pinned document no longer matches. Re-read it, then update the version,
    checksum and any affected rule together.
  - `WARN … upstream changed`: a rolling URL now serves a newer revision. The run still passes;
    re-verify the pin when convenient.
  - `FAIL … HTTP` or a network error: the download failed. Nothing about the document is known;
    retry later and do not change the pin.
