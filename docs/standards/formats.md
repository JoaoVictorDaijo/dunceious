# File formats

Pinned versions are in [`sources.json`](sources.json); which tools read and write each format
is in [Tools](tools.md). Code references are to `develop` at 13aff79.

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

**Reference practice** (Documented): NCBI writes the closest SOFA term and keeps the original
key: "The original GenBank feature type is also provided by the "gbkey" attribute"
([NCBI GFF3](https://www.ncbi.nlm.nih.gov/datasets/docs/v2/reference-docs/file-formats/annotation-files/about-ncbi-gff3/)).
CLC Genomics Workbench recognises SO term names on import but "will not translate accession
numbers to types" ([GFF3 format, 25.0.3](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=GFF3_format.html)).

**Dunceious.** Conforms to the grammar: every emitted term is in SO 2026-08-07. The mapping
lives in `src/core/formats/soTypes.ts`; the original key is kept in an `insdc_type` attribute
(`src/core/formats/gff3.ts:179`), where NCBI uses `gbkey`. Features crossing the origin are
written as split rows; see LOC-6.
