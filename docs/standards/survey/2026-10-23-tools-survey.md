# Additional sequence-tool standards survey

Research date: 2026-10-23. Adoption/cohort evidence: [cohort](2026-10-23-cohort.md). All new behavior evidence is **Documented**, not Tested. Old Tested cells are inherited explicitly from the supplied conformance report; no sequence tool or project test suite was run in this research session.

## 1. Summary

The additional evidence distinguishes joined feature sequence, individual parts, and the complete genomic span.
Several APIs and CLIs offer more than one of these, so capability counts overlap.
Strand-aware feature extraction must be distinguished from a standalone reverse-complement command.
`bedtools getfasta -split -s`, AGAT extraction, and Bioconductor range methods expose explicit choices.[^6][^14][^36]
BioJava separates resolved sublocations from outer bounds.[^25]
Gffread distinguishes spliced output from a full-span output that follows the forward genomic sequence.[^8][^9][^10]
IGB and Apollo document feature/transcript versus genomic sequence choices, but examined GUI sources do not establish extraction strand.[^37][^39]
Full partial-end import/edit/export preservation and between-base extraction remain largely unknown.
Format support is not evidence that every location or translation rule is implemented.
Adoption evidence, maintenance exclusions and ranking are kept separate from semantic evidence.
Release age is informational; EMBOSS, BioPerl, Artemis/ACT and Tablet are not dropped for age.
No combined app/CLI/reference vote is scientifically implied.
The owner-approved cohort and group-specific counts are recorded in section5.

## 2. Scope and evidence rules

**C** = documented conformance for the named operation and scope; **D** = documented difference from the stated INSDC convention; **N** = explicitly unsupported in that interface; **U** = not verified. **N/A** = no documented applicability to that operation in this evidence set; this is a relevance decision, not a claim that the product cannot do it. C is not a claim of whole-tool conformance. A generic selectable table does not prove automatic `/transl_table` handling. A model flag does not prove round-trip preservation. Every U/`?` cell means the examined documentation did not establish the behavior, not absence.[^0]

The owner-approved matrix covers18 new tools:8 CLI/library entries (BioPerl, BioJava, Bioconductor package group, bedtools, gffread, SeqKit, samtools, AGAT),1 NCBI reference utility (table2asn), and9 interactive tools (IGB, Apollo, MEGA, AliView, Clone Manager, Sequencher, Addgene analyzer, SeaView, Tablet). Bioconductor here means Biostrings2.80.2, GenomicFeatures1.64.0 and the concrete BSgenome1.80.0 `getSeq` method, not every ecosystem package. Current releases and behavior-document versions are separately listed in the cohort ledger; old manuals are not passed off as current conformance testing.

Official exclusions: Genome Workbench retired March2024; Vector NTI support ended2020-12-31; GBrowse officially unsupported. Evidence and quotations are in the cohort ledger and sources51–52.[^51][^52] Serial Cloner, GENtle and TeselaGen are reserves with unresolved adoption/maintenance evidence, not declared discontinued or niche. Neutral registry/review candidates and proposed scope decisions are fully listed in the cohort ledger. Existing matrices are reused with their evidence levels in the combined comparison and machine-readable records.

## 3. Operations matrix

Row1 is separated into joined extraction, separate parts, region and strand. **P** after C means a standalone primitive only, not proof that feature extraction applies strand. **R** means an explicitly requested coordinate region, not a feature-envelope button. **M** means a manual orientation option. These qualifications also control counts. U cells inherit the examined-source scope in their tool heading and source0.

### Libraries and command-line tools

| Operation / rule | BioPerl[^20][^21] | BioJava[^25][^26] | Bioconductor[^34][^35][^36] | bedtools[^6] | gffread[^8][^9] | SeqKit[^11] | samtools faidx[^13] | AGAT[^14] |
|---|---|---|---|---|---|---|---|---|
| 1a. Joined feature/transcript sequence (LOC-1/7) | C `spliced_seq`[^20] | C resolved sublocations[^25] | C transcript exon-rank order[^34] | C BED12 `-split`[^6] | C `-w` exons / `-x` CDS[^8] | U | U | C CDS/UTR default; exons `--merge`[^14] |
| 1b. Separate parts of one multipart feature | U | U | C `getSeq(GRangesList)`[^36] | U; separate BED records are not BED12 splitting | U | U; per-region output only[^11] | U; per-region output only[^13] | C `--split`[^14] |
| 1c. Genomic span, including intervening gaps | U | C `getSubSequence` outer bounds[^25] | C-R caller supplies span[^36] | C default BED12 extraction[^6] | C `-u`, forward genomic[^8][^9] | C-R `subseq -r`[^11] | C-R indexed region[^13] | C `--full`[^14] |
| 1d. Reverse-complement extraction (LOC-3/7) | C-P `revcom`; feature path U[^21] | C-P DNA inverse; feature path U[^26] | C strand argument to `getSeq`[^36] | C with `-s`; default ignores strand[^6] | C spliced source path; build caveat below[^9][^10] | C-M descending `faidx` coordinates[^11] | C-M `-i`[^13] | C feature strand default; override available[^14] |
| 2. `order()` kept distinct from `join()` (LOC-2) | U | U lifecycle; parser distinguishes terms[^27] | U | U | U | U | U | U |
| 3. `<`/`>` preserved import/edit/export (LOC-4) | U | U | U | U | U | U | U | U |
| 4. `^` zero-length sites (LOC-5) | U | U extraction; model has between-base flag[^25] | U | U | U | U | U | U |
| 5. Origin-spanning annotated feature (LOC-6) | U | U extraction; parser circular settings[^27] | U | U | U | U; circular windows only[^11] | U | U |
| 6. User/API coordinate convention (COORD-1) | C 1-based inclusive API[^21] | C 1-based API[^28] | U for general interface convention | D BED start0/end-exclusive input[^7] | U | C `subseq`1-based inclusive; negative extensions[^11] | U | U |
| 7a. Genetic table selection (TRANS-1) | C explicit table ID; automatic qualifier U[^21][^22] | U | C `getGeneticCode`; qualifier U[^35] | U | U | C selected NCBI table; qualifier U[^11] | U | C selectable codon table; NCBI coverage U[^14] |
| 7b. `/codon_start` (TRANS-2) | C explicit `-offset`1/2/3; qualifier automatic U[^21] | U | U | U | U; GFF phase is separate | U | U | U; GFF phase is separate |
| 7c. Alternative initiators become Met (TRANS-3) | U | U | C `translate` default initiation handling[^35] | U | U | C explicit `-M` option[^11] | U | C opt-in alternative start, phase0 only[^14] |
| 7d. `/transl_except` (TRANS-4) | U | U | U | U | U | U | U | U |
| 8a. IUPAC nucleotide symbols (ALPHA-1) | C documented ambiguity recognition[^22] | U | C alphabet/complement[^35] | U | U | C library alphabet; version caveat[^12] | U | U |
| 8b. IUPAC amino-acid U/O/B/Z/J/X (ALPHA-2) | D manual defines J as Ile/Val; implementation U[^22] | U | C documented alphabet[^35] | U | U | C library alphabet; version caveat[^12] | U | U |
| 8c. INSDC key ↔ SO (FMT-1) | U | U | U | U | U | U | U | U |
| Local alignment defaults (ALN-1) | U | U | U | U | U | U | U | U |

### Interactive applications and NCBI utility

| Operation / rule | table2asn[^16][^17] | IGB[^37] | Apollo[^39] | MEGA[^42] | AliView[^2] | Clone Manager[^1] | Sequencher[^3][^4] | Addgene analyzer[^5] | SeaView[^53] | Tablet[^54] |
|---|---|---|---|---|---|---|---|---|---|---|
| 1a. Joined feature/transcript sequence | U nucleotide output; joined CDS translation documented[^19] | C exon-only selected annotation[^37] | C cDNA/CDS output[^39] | N/A | N/A | U; join model + export button insufficient[^1] | U; joined-feature model insufficient[^4] | U | U; feature-key import only[^53] | U; rows not linked[^54] |
| 1b. Separate parts of one multipart feature | U | U | U | N/A | N/A | U | U | U | U | U |
| 1c. Genomic span including gaps | U | C drag region includes introns[^37] | C genomic option[^39] | N/A | N/A | U multipart span; fragment exists[^1] | U | U | U | U |
| 1d. Reverse-complement extraction | U output; complement annotation documented[^17] | U | U | C-P selected whole rows[^42] | C-P clipboard/sequences[^2] | C-M fragment feature orientation[^1] | U feature; manual export orientation exists[^3] | C-P whole input sequence[^5] | C-P complement + reverse[^53] | U |
| 2. `order()` distinct from `join()` | U | U | U | N/A | N/A | U | U | U | U | U |
| 3. Partial ends through import/edit/export | U lifecycle; D GFF range hints ignored[^18] | U | U | N/A | N/A | U | U | U | U | U |
| 4. `^` zero-length sites | U | U | U | N/A | N/A | U | U | U | U | U |
| 5. Origin-spanning features | C multi-interval circular genes in input[^17] | U | U | N/A | N/A | U | U | U | U | U |
| 6. Coordinates shown/API | U | U UI; GTF conversion not proof | U | U | U | U | U; reference insertions can use decimals[^4] | U | U | C first base1; padded/unpadded[^56] |
| 7a. Genetic table selection | C genetic-code selection[^16] | U | C configurable NCBI tables[^40] | C selectable/custom tables; NCBI mapping U[^44] | U | C molecule table; CDS qualifier can change default[^1] | C selectable/custom table; NCBI mapping U[^3] | U | C `/transl_table` in names/comments; coverage U[^53] | U |
| 7b. `/codon_start` | C default1, configurable[^19] | U | U | U | U | C feature offset1/2/3[^1] | U | U | U | U |
| 7c. Alternative initiation as Met | U | U | U; selecting non-ATG start insufficient[^39] | U | U | U | U | U | U | U |
| 7d. `/transl_except` | C parsed qualifier[^17][^18] | U | U; readthrough editing insufficient[^39] | U | U | U | U | U | U | U |
| 8a. IUPAC nucleotide symbols | U | U | U | C listed ambiguity symbols[^43] | C ambiguity-aware search[^2] | C valid ambiguity input[^1] | C default IUPAC-IUB coding[^3] | U | C ambiguity and consensus output[^53] | U |
| 8b. IUPAC aa U/O/B/Z/J/X | U | U | U | U for extended alphabet[^43] | U | U | U | U | U | U |
| 8c. INSDC key ↔ SO | C recognized mappings; unknown types dropped[^18] | U; SO category displayed[^37] | U mapping; SO types interpreted[^40] | U | U | U | U | U | U | U |
| Local alignment defaults (ALN-1) | U | U | U | U | U | U | U | U | U | U |

### Scope notes that prevent false conformance claims

- **bedtools:** the BED convention deliberately differs from INSDC coordinates; D is not a BED implementation bug. A BED12 interval without `-split` yields the envelope; `-s` is required for feature-strand orientation. Separate input records do not demonstrate a split-one-feature command.[^6][^7]
- **gffread:** v0.12.9 `-w/-x` call `getSpliced`; the separately pinned GCLib implementation reverses segment/base traversal on minus strand and complements bases. This is source-level inference, not a tested binary/dependency pairing. `-u` directly prints the genomic subsequence; it does not apply that strand path. `-y` translates CDS.[^8][^9][^10]
- **Bioconductor:** `extractTranscriptSeqs` expects transcript exon rank; `getSeq(GRangesList)` preserves a list of separate extracted intervals. `XStringSet[GRangesList]` instead concatenates within each element. These APIs must not be conflated. Caller-selected full spans are available; automatic feature-envelope derivation is not established.[^34][^36]
- **BioJava:** `getRelevantSubSequence` resolves sublocations; `getSubSequence` returns outer bounds. Distinct parser terms and between-base/circular model fields do not prove faithful import/edit/export or zero-length extraction.[^25][^27]
- **BioPerl:** explicit translation parameters are established; automatically reading CDS qualifiers is not. CodonTable documentation lists J incorrectly as Ile/Val; this is a documentation discrepancy, not a demonstrated runtime bug.[^21][^22]
- **Clone Manager12:** Make Fragment offers feature or original orientation, but the manual does not resolve multipart gaps. Tables listed are1–6,9–14,16,21–31,33;32 is not listed. The molecule table defaults to1 unless CDS qualifiers specify an alternative. This is not evidence of all current NCBI-table coverage.[^1]
- **Sequencher:** joined features are represented through numbered elements; complement-strand numbering reverses. This proves representation, not concatenated extraction. Full sequence/selection export can choose orientation; the feature-extraction path remains U.[^3][^4]
- **table2asn:** `.tbl` input is NCBI five-column format, not the INSDC flat-file feature table. GFF processing derives partialness and ignores `start_range/end_range`, may extend CDS to an adjacent stop, and drops unrecognized SO types. Do not call this lossless conversion.[^17][^18]
- **SeaView/Tablet:** alignment selection, database-fragment import, and feature-copy menus do not establish multipart extraction semantics. Tablet explicitly does not link imported feature rows. Its Save/Save As menu items are placeholders; this supports N for those commands, not a blanket no-export claim.[^53][^54][^57]

## 4. Formats and vocabularies

R=reads/interprets, W=writes, RW=both, no=explicitly unsupported in the named interface, ?=unverified. INSDC FT requires evidence beyond GenBank support; location-grammar parsers alone are not standalone FT readers. Rows are transposed relative to tools.md (2026-10-22 version) so columns match the operations matrix. Format support is directional, not a claim of lossless preservation.

### CLI/library scope

| Format / vocabulary | BioPerl | BioJava | Bioconductor | bedtools getfasta | gffread | SeqKit | samtools faidx | AGAT suite |
|---|---|---|---|---|---|---|---|---|
| INSDC FT | ? | ? | ? | ? | ? | ? | ? | ? |
| GenBank | RW[^23] | RW[^29][^30] | ? | ? | ? | ? | ? | ? |
| EMBL | RW[^23] | ? | ? | ? | ? | ? | ? | R[^15] |
| FASTA | RW[^23] | RW[^31][^32] | RW[^35] | RW[^6] | RW[^8] | RW[^11] | RW[^13] | RW[^14] |
| GFF3 | ? | R[^33] | W[^34] | R[^6][^7] | RW[^8] | ? | ? | RW[^15] |
| GTF | ? | R[^33] (dialect U) | ? | R[^7] | RW[^8] | RW[^11] | ? | RW[^15] |
| BED | ? | ? | W[^34] | RW[^6] | RW[^8] | RW[^11] | ? | RW[^15] |
| SAM/BAM | ? | ? | ? | ? | ? | RW BAM[^11] | ? | R minimap2 BAM[^15] |
| VCF | ? | ? | ? | R[^6] | ? | ? | ? | ? |
| SBOL | ? | ? | ? | ? | ? | ? | ? | ? |
| NCBI codes | R[^22] | ? | R[^35] | ? | ? | R[^11] | ? | ? |
| IUPAC nt | R[^22] | ? | R[^35] | ? | ? | R[^12] | ? | ? |
| IUPAC aa | R[^22] (J caveat) | ? | R[^35] | ? | ? | R[^12] | ? | ? |
| SO | ? | ? | ? | ? | ? | ? | ? | ? |

### Interactive/reference scope

| Format / vocabulary | NCBI table2asn | IGB | Apollo | MEGA | AliView | Clone Manager | Sequencher | Addgene analyzer | SeaView | Tablet |
|---|---|---|---|---|---|---|---|---|---|---|
| INSDC FT | ? (five-column input) | ? | ? | ? | ? | ? | W embedded[^3] | ? | ? | ? |
| GenBank | W[^16] | ? | ? | ? | ? | RW[^1] | RW[^3] | W view[^5] | ? (database import) | ? |
| EMBL | ? | ? | ? | ? | ? | R[^1] | RW[^3] | ? | ? (database import) | ? |
| FASTA | R[^16] | R[^37] | RW[^39][^41] | RW[^42][^45] | RW[^2] | RW[^1] | RW[^3] | W view[^5] | RW[^53] | R[^58] |
| GFF3 | R[^18] | R[^37][^38] | RW[^39][^41] | ? | ? | ? | ? | ? | ? | R[^54] |
| GTF | R[^18] | R[^37] | ? | ? | ? | ? | ? | ? | ? | R[^55] |
| BED | ? | RW[^37] | W evidence[^39] | ? | ? | ? | ? | ? | ? | R[^55] |
| SAM/BAM | ? | R BAM[^38] | R BAM[^41] | ? | ? | ? | ? | ? | ? | R[^58] |
| VCF | ? | ? | ? | ? | ? | ? | ? | ? | ? | R[^55] |
| SBOL | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| NCBI codes | R[^16] | ? | R[^40] | ? | ? | R[^1] | ? | ? | ? (numbered tables) | ? |
| IUPAC nt | ? | ? | ? | R[^43] | R search[^2] | R[^1] | R[^3] | ? | RW[^53] | ? |
| IUPAC aa | ? | ? | ? | R basic20[^43] | ? | ? | ? | ? | ? | ? |
| SO | R[^18] | R[^37] | R[^40] | ? | ? | ? | ? | ? | ? | ? |

The Sequencher FT cell refers only to explicitly documented embedded GenBank feature-table output, not a standalone FT-file writer. Clone Manager exports a compact or commented GenBank dialect. Generic GFF/GTF wording in BioJava establishes parsing only, not ontology interpretation. Apollo's paper lists additional formats without per-format direction; those cells remain ?. SAM/BAM cells name the verified member; samtools **faidx** is scoped separately from samtools alignment commands. No SBOL cell was verified. “no” is deliberately unused where absence is not explicit.[^1][^3][^13][^33][^39]

## 5. Adoption-filtered, group-specific extraction comparison

The owner approved the cohort on 2026-10-23 with the relevance filter. See [cohort](2026-10-23-cohort.md) for release evidence, the full ranked candidate table, exact citation queries and vendor-count sources. Rank only applicable tools within each group/metric stratum; take ceil(n/2), retaining ties. Unknown-usage tools have no numerical rank. Clone Manager, Sequencher and Addgene analyzer are evidence-only and excluded from these counts.

Counts measure **documented capabilities**, not conformance percentages or votes determining a scientific rule. They overlap: a tool can offer both concatenated and separate extraction. Only Tested or Documented positive cells count. A standalone reverse-complement primitive does not count as documented reverse-complement **extraction**; an explicit orientation option attached to a region extractor does. User-defined coordinate spans are included in region capability counts and labelled R in the matrix. Mixed-strand/written-order semantics are not inferred.

### Row1: all applicable versus top half, by group and metric

| Group / usage stratum | Applicable tools | Joined | Separate parts of one feature | Genomic region/span | Reverse-complement extraction |
|---|---:|---:|---:|---:|---:|
|Interactive, paper-ranked, all|9|5|2|3|0 documented|
|Interactive, paper-ranked, top half|5|2|2|0 documented|0 documented|
|Interactive, vendor scientist-count, all|1|0 documented|0 documented|1|0 documented|
|Interactive, vendor scientist-count, top half|1|0 documented|0 documented|1|0 documented|
|CLI/libraries, paper-ranked, all|9|7|2|6|7|
|CLI/libraries, paper-ranked, top half|5|3|1|3|5|
|CLI/libraries, unranked usage (AGAT), evidence supplement|1|1|1|1|1|
|Interactive, unranked usage (CLC), evidence supplement|1|0 documented|0 documented|0 documented|0 documented|
|NCBI/reference services, applicable Sequence Viewer|1|0 documented|1|0 documented|0 documented|

These are lower bounds. A zero means no qualifying affirmative evidence, not that the capability is absent. AGAT's row is displayed separately to avoid giving unknown numerical adoption a ranked vote. Databases, BLAST, ORFfinder and table2asn annotation/translation semantics are reference context, not interchangeable feature-extraction UI evidence. The later supplied primary survey and reopened NCBI manual establish Sequence Viewer's separate-exon option; joined/minus behavior remains U.[^60]

**Auditable applicable/ranked sets (recent2024–2026 citations; all values and query URLs in the cohort ledger):**

- Interactive paper stratum: Geneious2670 (Basic predecessor proxy), UCSC1000, UGENE723, SeaView451, Artemis217, Tablet158, Ensembl97, Apollo89, IGB84. Top half is **Geneious, UCSC, UGENE, SeaView, Artemis**. UGENE and Artemis document feature export, but their within-feature multipart/strand details remain U in the inherited matrix.[^59] SeaView/Tablet document feature handling but their multipart details remain U; they do not add affirmative counts. Joined positives: Geneious,UCSC,Ensembl,Apollo,IGB. Separate positives: Geneious,UCSC. Region positives: Ensembl,Apollo,IGB. All extraction-strand cells remain U. UCSC is specifically CDS FASTA **alignment** output; IGB uses historical2007 documentation.
- Interactive vendor stratum: **SnapGene** is the only applicable product with a direct scientist-count metric (vendor-stated>50000). Its selected span is documented. Benchling's vendor-stated200000+ does not qualify it for this extraction row: intron-skipping translation is not nucleotide extraction. MEGA/AliView are N/A for feature extraction on these sources, even though their overall usage ranks are high.
- CLI/library paper stratum: samtools11081 (SAMtools/BCFtools proxy), bedtools8747, Biopython1965, SeqKit1816, EMBOSS1187, gffread888 (GffRead/GffCompare proxy), Bioconductor745 (2015 framework paper, selected by recent citations), BioPerl48, BioJava11 (version5 proxy). Top half is **samtools, bedtools, Biopython, SeqKit, EMBOSS**. Joined positives: bedtools,Biopython,EMBOSS,gffread,Bioconductor,BioPerl,BioJava. Separate positives: EMBOSS,Bioconductor. Region positives: samtools,bedtools,SeqKit,gffread,Bioconductor,BioJava. Reverse-complement extraction positives: samtools,bedtools,Biopython,SeqKit,EMBOSS,gffread,Bioconductor. BioPerl/BioJava standalone primitives are not counted as extraction-strand proof. The gffread source/dependency caveat remains attached to its positive cell.

For the CLI/library group, an **all-applicable inventory including unranked AGAT** is10tools:8joined,3separate,7region,8reverse-complement. This inventory is deliberately not merged with the interactive group or presented as a popularity-weighted vote. Removing the source-qualified gffread strand cell reduces only its all-group reverse-complement lower bound by1; the top-half result is unchanged.

### Applicability for the remaining rows

The comparison below includes the existing apps using their supplied primary matrix and the later fixture reports, plus the new tools.[^59] Each result is **C/D/N/U**, never a conformance percentage. U is displayed for auditability but contributes no affirmative evidence. Scope remains attached to each underlying cell: selectable tables are not proof of qualifier import, and alphabet recognition is not proof of every search policy. New and inherited rows sometimes have different sub-operation coverage, so counts describe only those scoped findings.

Applicability is based on documented operation families, as approved by the owner: annotation handlers for location/ontology questions; documented translators for translation/amino-acid questions; sequence handlers for coordinates/nucleotide alphabets. Missing details within an applicable family are U. Other families are N/A, not explicitly unsupported. The member lists below make these relevance decisions reproducible. Vendor metrics rank Benchling before SnapGene; CLC's parent-company count is not a product metric. AGAT is unranked. Reference contracts/services are reported separately without a popularity top half. Unknown usage never earns a rank.

| Rule | Group / metric | All applicable members | All C/D/N/U | Top-half members | Top C/D/N/U |
|---|---|---|---|---|---|
|LOC-2|Interactive / papers|Geneious Prime, SeqBuilder, MacVector, UGENE, ApE, Jalview, Artemis, IGV, JBrowse 2, Ensembl, UCSC, IGB, Apollo, SeaView, Tablet|0/0/0/15|IGV, Geneious Prime, Jalview, JBrowse 2, UCSC, UGENE, SeaView, Artemis|0/0/0/8|
|LOC-2|Interactive / vendor|Benchling, SnapGene|0/0/0/2|Benchling|0/0/0/1|
|LOC-2|Interactive / unranked|CLC|0/0/0/1|Not ranked|—|
|LOC-2|CLI/library / papers|BioPerl, BioJava, Bioconductor, bedtools, gffread, SeqKit, Biopython, EMBOSS|0/2/0/6 (combined sub-operations; see tools.json)|bedtools, Biopython, SeqKit, EMBOSS|0/2/0/2 (combined)|
|LOC-2|CLI/library / unranked|AGAT|0/0/0/1|Not ranked|—|
|LOC-2|Reference contracts/services|GenBank / RefSeq, ENA, DDBJ, NCBI Sequence Viewer, table2asn|3/0/0/2|Not ranked|—|
|LOC-4|Interactive / papers|Geneious Prime, SeqBuilder, MacVector, UGENE, ApE, Jalview, Artemis, IGV, JBrowse 2, Ensembl, UCSC, IGB, Apollo, SeaView, Tablet|0/0/0/15|IGV, Geneious Prime, Jalview, JBrowse 2, UCSC, UGENE, SeaView, Artemis|0/0/0/8|
|LOC-4|Interactive / vendor|Benchling, SnapGene|0/0/0/2|Benchling|0/0/0/1|
|LOC-4|Interactive / unranked|CLC|0/0/0/1|Not ranked|—|
|LOC-4|CLI/library / papers|BioPerl, BioJava, Bioconductor, bedtools, gffread, SeqKit, Biopython, EMBOSS|0/0/0/8|bedtools, Biopython, SeqKit, EMBOSS|0/0/0/4|
|LOC-4|CLI/library / unranked|AGAT|0/0/0/1|Not ranked|—|
|LOC-4|Reference contracts/services|GenBank / RefSeq, ENA, DDBJ, NCBI Sequence Viewer, table2asn|0/0/0/5|Not ranked|—|
|LOC-5|Interactive / papers|Geneious Prime, SeqBuilder, MacVector, UGENE, ApE, Jalview, Artemis, IGV, JBrowse 2, Ensembl, UCSC, IGB, Apollo, SeaView, Tablet|0/0/0/15|IGV, Geneious Prime, Jalview, JBrowse 2, UCSC, UGENE, SeaView, Artemis|0/0/0/8|
|LOC-5|Interactive / vendor|Benchling, SnapGene|0/0/0/2|Benchling|0/0/0/1|
|LOC-5|Interactive / unranked|CLC|0/0/0/1|Not ranked|—|
|LOC-5|CLI/library / papers|BioPerl, BioJava, Bioconductor, bedtools, gffread, SeqKit, Biopython, EMBOSS|2/0/0/6|bedtools, Biopython, SeqKit, EMBOSS|2/0/0/2|
|LOC-5|CLI/library / unranked|AGAT|0/0/0/1|Not ranked|—|
|LOC-5|Reference contracts/services|GenBank / RefSeq, ENA, DDBJ, NCBI Sequence Viewer, table2asn|3/0/0/2|Not ranked|—|
|LOC-6|Interactive / papers|Geneious Prime, SeqBuilder, MacVector, UGENE, ApE, Jalview, Artemis, IGV, JBrowse 2, Ensembl, UCSC, IGB, Apollo, SeaView, Tablet|0/0/0/15|IGV, Geneious Prime, Jalview, JBrowse 2, UCSC, UGENE, SeaView, Artemis|0/0/0/8|
|LOC-6|Interactive / vendor|Benchling, SnapGene|1/0/0/1|Benchling|1/0/0/0|
|LOC-6|Interactive / unranked|CLC|1/0/0/0|Not ranked|—|
|LOC-6|CLI/library / papers|BioPerl, BioJava, Bioconductor, bedtools, gffread, SeqKit, Biopython, EMBOSS|2/0/0/6|bedtools, Biopython, SeqKit, EMBOSS|2/0/0/2|
|LOC-6|CLI/library / unranked|AGAT|0/0/0/1|Not ranked|—|
|LOC-6|Reference contracts/services|GenBank / RefSeq, ENA, DDBJ, NCBI Sequence Viewer, table2asn|4/0/0/1|Not ranked|—|
|COORD-1|Interactive / papers|Geneious Prime, SeqBuilder, MacVector, UGENE, ApE, Jalview, Artemis, IGV, JBrowse 2, Ensembl, UCSC, IGB, Apollo, MEGA, AliView, SeaView, Tablet|3/0/0/14|MEGA, IGV, Geneious Prime, Jalview, JBrowse 2, AliView, UCSC, UGENE, SeaView|1/0/0/8|
|COORD-1|Interactive / vendor|Benchling, SnapGene|1/0/0/1|Benchling|0/0/0/1|
|COORD-1|Interactive / unranked|CLC|0/0/0/1|Not ranked|—|
|COORD-1|CLI/library / papers|BioPerl, BioJava, Bioconductor, bedtools, gffread, SeqKit, samtools, Biopython, EMBOSS|3/2/0/4|samtools, bedtools, Biopython, SeqKit, EMBOSS|1/2/0/2|
|COORD-1|CLI/library / unranked|AGAT|0/0/0/1|Not ranked|—|
|COORD-1|Reference contracts/services|GenBank / RefSeq, ENA, DDBJ, BLAST, ORFfinder, NCBI Sequence Viewer, table2asn|4/0/0/3|Not ranked|—|
|TRANS-1|Interactive / papers|Geneious Prime, UGENE, ApE, Jalview, Artemis, UCSC, Apollo, MEGA, SeaView, AliView, Tablet, IGV, MacVector|3/0/0/10|MEGA, IGV, Geneious Prime, Jalview, AliView, UCSC, UGENE|1/0/0/6|
|TRANS-1|Interactive / vendor|Benchling, SnapGene|0/1/0/1|Benchling|0/1/0/0|
|TRANS-1|Interactive / unranked|CLC|0/0/0/1|Not ranked|—|
|TRANS-1|CLI/library / papers|BioPerl, BioJava, Bioconductor, gffread, SeqKit, Biopython, EMBOSS|4/1/0/2|Biopython, SeqKit, EMBOSS, gffread|2/1/0/1|
|TRANS-1|CLI/library / unranked|AGAT|1/0/0/0|Not ranked|—|
|TRANS-1|Reference contracts/services|GenBank / RefSeq, ENA, DDBJ, BLAST, ORFfinder, NCBI Sequence Viewer, table2asn|4/0/0/3|Not ranked|—|
|TRANS-2|Interactive / papers|Geneious Prime, UGENE, ApE, Jalview, Artemis, UCSC, Apollo, MEGA, SeaView, AliView, Tablet, IGV, MacVector|0/1/0/12|MEGA, IGV, Geneious Prime, Jalview, AliView, UCSC, UGENE|0/1/0/6|
|TRANS-2|Interactive / vendor|Benchling, SnapGene|0/0/0/2|Benchling|0/0/0/1|
|TRANS-2|Interactive / unranked|CLC|0/0/0/1|Not ranked|—|
|TRANS-2|CLI/library / papers|BioPerl, BioJava, Bioconductor, gffread, SeqKit, Biopython, EMBOSS|2/0/0/5|Biopython, SeqKit, EMBOSS, gffread|1/0/0/3|
|TRANS-2|CLI/library / unranked|AGAT|0/0/0/1|Not ranked|—|
|TRANS-2|Reference contracts/services|GenBank / RefSeq, ENA, DDBJ, BLAST, ORFfinder, NCBI Sequence Viewer, table2asn|4/0/0/3|Not ranked|—|
|TRANS-3|Interactive / papers|Geneious Prime, UGENE, ApE, Jalview, Artemis, UCSC, Apollo, MEGA, SeaView, AliView, Tablet, IGV, MacVector|0/0/0/13|MEGA, IGV, Geneious Prime, Jalview, AliView, UCSC, UGENE|0/0/0/7|
|TRANS-3|Interactive / vendor|Benchling, SnapGene|0/0/0/2|Benchling|0/0/0/1|
|TRANS-3|Interactive / unranked|CLC|0/0/0/1|Not ranked|—|
|TRANS-3|CLI/library / papers|BioPerl, BioJava, Bioconductor, gffread, SeqKit, Biopython, EMBOSS|3/0/0/4|Biopython, SeqKit, EMBOSS, gffread|2/0/0/2|
|TRANS-3|CLI/library / unranked|AGAT|1/0/0/0|Not ranked|—|
|TRANS-3|Reference contracts/services|GenBank / RefSeq, ENA, DDBJ, BLAST, ORFfinder, NCBI Sequence Viewer, table2asn|1/0/0/6|Not ranked|—|
|TRANS-4|Interactive / papers|Geneious Prime, UGENE, ApE, Jalview, Artemis, UCSC, Apollo, MEGA, SeaView, AliView, Tablet, IGV, MacVector|0/0/0/13|MEGA, IGV, Geneious Prime, Jalview, AliView, UCSC, UGENE|0/0/0/7|
|TRANS-4|Interactive / vendor|Benchling, SnapGene|0/0/0/2|Benchling|0/0/0/1|
|TRANS-4|Interactive / unranked|CLC|0/0/0/1|Not ranked|—|
|TRANS-4|CLI/library / papers|BioPerl, BioJava, Bioconductor, gffread, SeqKit, Biopython, EMBOSS|0/1/0/6|Biopython, SeqKit, EMBOSS, gffread|0/1/0/3|
|TRANS-4|CLI/library / unranked|AGAT|0/0/0/1|Not ranked|—|
|TRANS-4|Reference contracts/services|GenBank / RefSeq, ENA, DDBJ, BLAST, ORFfinder, NCBI Sequence Viewer, table2asn|4/0/0/3|Not ranked|—|
|ALPHA-1|Interactive / papers|Geneious Prime, SeqBuilder, MacVector, UGENE, ApE, Jalview, Artemis, IGV, JBrowse 2, Ensembl, UCSC, IGB, Apollo, MEGA, AliView, SeaView, Tablet|3/0/0/14|MEGA, IGV, Geneious Prime, Jalview, JBrowse 2, AliView, UCSC, UGENE, SeaView|3/0/0/6|
|ALPHA-1|Interactive / vendor|Benchling, SnapGene|0/0/0/2|Benchling|0/0/0/1|
|ALPHA-1|Interactive / unranked|CLC|0/0/0/1|Not ranked|—|
|ALPHA-1|CLI/library / papers|BioPerl, BioJava, Bioconductor, bedtools, gffread, SeqKit, samtools, Biopython, EMBOSS|3/0/0/6 (combined sub-operations; see tools.json)|samtools, bedtools, Biopython, SeqKit, EMBOSS|1/0/0/4 (combined)|
|ALPHA-1|CLI/library / unranked|AGAT|0/0/0/1|Not ranked|—|
|ALPHA-1|Reference contracts/services|GenBank / RefSeq, ENA, DDBJ, BLAST, ORFfinder, NCBI Sequence Viewer, table2asn|0/0/0/7|Not ranked|—|
|ALPHA-2|Interactive / papers|Geneious Prime, UGENE, ApE, Jalview, Artemis, UCSC, Apollo, MEGA, SeaView, AliView, Tablet, IGV, MacVector|0/1/0/12|MEGA, IGV, Geneious Prime, Jalview, AliView, UCSC, UGENE|0/1/0/6|
|ALPHA-2|Interactive / vendor|Benchling, SnapGene|0/0/0/2|Benchling|0/0/0/1|
|ALPHA-2|Interactive / unranked|CLC|1/0/0/0|Not ranked|—|
|ALPHA-2|CLI/library / papers|BioPerl, BioJava, Bioconductor, gffread, SeqKit, Biopython, EMBOSS|2/1/0/4|Biopython, SeqKit, EMBOSS, gffread|1/0/0/3|
|ALPHA-2|CLI/library / unranked|AGAT|0/0/0/1|Not ranked|—|
|ALPHA-2|Reference contracts/services|GenBank / RefSeq, ENA, DDBJ, BLAST, ORFfinder, NCBI Sequence Viewer, table2asn|3/0/0/4|Not ranked|—|
|FMT-1|Interactive / papers|Geneious Prime, SeqBuilder, MacVector, UGENE, ApE, Jalview, Artemis, IGV, JBrowse 2, Ensembl, UCSC, IGB, Apollo, SeaView, Tablet|0/0/0/15|IGV, Geneious Prime, Jalview, JBrowse 2, UCSC, UGENE, SeaView, Artemis|0/0/0/8|
|FMT-1|Interactive / vendor|Benchling, SnapGene|0/0/0/2|Benchling|0/0/0/1|
|FMT-1|Interactive / unranked|CLC|0/0/0/1|Not ranked|—|
|FMT-1|CLI/library / papers|BioPerl, BioJava, Bioconductor, bedtools, gffread, SeqKit, Biopython, EMBOSS|0/0/0/8|bedtools, Biopython, SeqKit, EMBOSS|0/0/0/4|
|FMT-1|CLI/library / unranked|AGAT|0/0/0/1|Not ranked|—|
|FMT-1|Reference contracts/services|GenBank / RefSeq, ENA, DDBJ, NCBI Sequence Viewer, table2asn|2/0/0/3|Not ranked|—|
|LOC-2.preserve|CLI/library / papers|BioPerl, BioJava, Bioconductor, bedtools, gffread, SeqKit, Biopython, EMBOSS|2/0/0/6|bedtools, Biopython, SeqKit, EMBOSS|2/0/0/2|
|LOC-2.preserve|CLI/library / unranked|AGAT|0/0/0/1|Not ranked|—|
|LOC-2.extract|CLI/library / papers|BioPerl, BioJava, Bioconductor, bedtools, gffread, SeqKit, Biopython, EMBOSS|0/2/0/6|bedtools, Biopython, SeqKit, EMBOSS|0/2/0/2|
|LOC-2.extract|CLI/library / unranked|AGAT|0/0/0/1|Not ranked|—|
|ALPHA-1.complement|CLI/library / papers|BioPerl, BioJava, Bioconductor, bedtools, gffread, SeqKit, samtools, Biopython, EMBOSS|4/0/0/5|samtools, bedtools, Biopython, SeqKit, EMBOSS|2/0/0/3|
|ALPHA-1.complement|CLI/library / unranked|AGAT|0/0/0/1|Not ranked|—|
|ALPHA-1.search|CLI/library / papers|BioPerl, BioJava, Bioconductor, bedtools, gffread, SeqKit, samtools, Biopython, EMBOSS|2/0/0/7|samtools, bedtools, Biopython, SeqKit, EMBOSS|1/0/0/4|
|ALPHA-1.search|CLI/library / unranked|AGAT|0/0/0/1|Not ranked|—|

For LOC-2, Biopython and EMBOSS retain the `order` token but their extraction paths concatenate it (EMBOSS only with explicit joining): D here concerns contiguous extraction, not parser token loss. For LOC-4 their tested import/export preservation does not verify the requested editing lifecycle, so that full row stays U. ALN-1 has no INSDC conformance rule and therefore no C/D consensus: inherited EMBOSS/Biopython defaults differ, CLC's 10/1 costs belong to multiple alignment, Benchling's named default is MAFFT Auto, and BLAST defaults are task-specific.[^59] New-tool local-scoring defaults remain U in section3.

### Existing evidence ledger (not new tests)

| Existing tool | Joined | Separate parts | Region including gaps | Reverse-complement extraction | Evidence |
|---|---|---|---|---|---|
|Biopython1.88|Yes|U|U|Yes|Tested J1/J2/J3/W1 in supplied report[^46]|
|EMBOSS6.6.0|Yes, `-join Y`|Yes, default|U|Yes|Tested in supplied report[^46]|
|Geneious Prime|Yes, option|Yes, when concatenate disabled|U multipart envelope|U|Documented annotations manual[^47]|
|Ensembl|Yes, cDNA/CDS|U|Yes, genomic default|U in supplied evidence|Documented supplied LOC-7; upstream open failed this pass[^46][^48]|
|UCSC Table Browser|Yes|Yes|U in supplied evidence|U in supplied evidence|Documented **CDS FASTA alignment** output, not arbitrary feature extraction[^49]|
|SnapGene|U|U|Yes, selected span|U|Documented span between selected features[^50]|

UGENE, Artemis and CLC have documented extraction interfaces but unresolved multipart/strand details; Sequence Viewer has a documented separate-exon option.[^59][^60] Other old-app row1 details remain U from the supplied records. Benchling's translation groups skipping introns are not counted as nucleotide extraction. INSDC database contracts are not UI-extraction votes. No arbitrary interval-order or mixed-strand support is inferred from normal exon extraction. A positive capability count would be a lower bound, not a percentage of verified behavior among all users.

## 6. Claims not verified and methodological limits

- Most tools have no verified full lifecycle for `order()`, partial bounds, `^`, remote locations or origin-crossing features. Circular window extraction is not proof of circular-feature import/extraction.
- Arbitrary written interval order and mixed-strand joins are unverified for new tools. Normal transcript ordering must not be generalized to trans-splicing.
- Automatic `/transl_table`, `/codon_start` and `/transl_except` interpretation is unverified where only manual parameters or GFF phase exist. Full current NCBI-table coverage is not assumed. SeqKit's examined manual lists numbered tables through31 with gaps; Clone Manager's list lacks32; these are source-specific inventories, not declarations of current universal coverage.
- IUPAC symbol acceptance, ambiguity matching, translation resolution and alignment scoring are distinct. Basic amino-acid20 support does not establish U/O/B/Z/J/X. BioPerl's J text discrepancy requires source/runtime verification before a scientific conclusion.
- IGB extraction evidence is a February2007 manual. Apollo behavior docs identify2.7.0 while latest release evidence identifies2.9.0; BioJava behavior API7.1.4 versus latest7.3.0. These documentation-version gaps are visible and warrant fixture testing before implementation decisions.
- gffread/GCLib and SeqKit/alphabet evidence combines separately pinned source components; binary dependency pairing was not tested. No biological conformance claim is labelled Tested from these code reads.
- Adoption is incomplete for unranked products, and some release dates remain unknown or are artifact dates. Citations are paper-level proxies, sometimes shared by several products. Recent citations demonstrate recent literature engagement, not necessarily successful software use or community respect. Bio.tools and package availability are not popularity counts.
- No whole-workflow equivalence is inferred from file extensions. No sequencing data was uploaded. The only local installation was an approved temporary PDF-reading environment, removed after use; no sequence-tool runtime was installed.

## 7. Sources

All positive new claims use sources opened by the research team on2026-10-23. Inherited evidence and access failures are explicitly identified below. Rolling pages are identified by access date rather than silently assigned a software version. Quotes below are short anchors; claims use the cited sections as well as the quoted phrase. Each URL has less than25 quoted words in this survey. Adoption sources, query URLs and scope caveats are in the cohort ledger.

[^0]: Evidence policy: supplied [README](../README.md), accessed2026-10-23. Quote: “Unknown is never evidence of absence” is the research-brief rule; the supplied index says “not established”. U/`?` applies to the examined source set, not a universal negative.
[^1]: [Clone Manager12 Help](https://scied.com/downloads/CM12_Help.pdf), version12, accessed2026-10-23; PDF pages55–59,333,340–341. Quotes: “Extracts the sequence of the selected feature”; “Codon Start”; “IUPAC codes for ambiguous bases”; “Translation table”. Official PDF downloaded and read locally; browser opener failed. Format sections describe GenBank/EMBL/FASTA import and GenBank/FASTA export.
[^2]: [AliView help](https://www.ormbunkar.se/aliview/), page advertises1.33 (2026-09-28), accessed2026-10-23. Quotes: “Save selection as Fasta”; “Reverse complement clipboard”; “follows IUPAC codes”. File/Edit sections document alignment sequence manipulation, not annotated-feature extraction.
[^3]: [Gene Codes Sequencher5 User Manual](https://www.uv.es/scsieweb/SCSIE/SCSIE-BIO/Documents/Sequencher_5_User_Manual.pdf), official authored manual,2011, university-hosted copy; pp17–18,157–162,168–170. Quotes: “GenBank Feature Table”; “Reverse Complement”; “IUPAC-IUB coding system”. Format import/export tables, orientation options and genetic-code editor support scoped claims; this is not proof of current5.4.6 behavior.
[^4]: [Sequencher Working with Features](https://www.genecodes.com/sites/default/files/documents/Tutorials/Working%20with%20Features.pdf), Gene Codes2017, pp10–12. Quote: “Any time the feature is harbored on the Complement strand, the sequential numbering should be reversed.” Numbered feature elements do not establish concatenated extraction.
[^5]: [Addgene Analyze Sequence Guide](https://www.addgene.org/analyze-sequence/guide/), undated live guide, accessed2026-10-23. Quotes: “View your sequence in FASTA format”; “View your sequence in GenBank format”; “View the reverse complement of your sequence.” These describe whole submitted sequence views.
[^6]: [bedtools getfasta](https://bedtools.readthedocs.io/en/latest/content/tools/getfasta.html), documentation2.31.0, accessed2026-10-23. Quote: “extract and concatenate the sequences from the BED ‘blocks’”. Sections `-split`, `-s`, `-bedOut` and default behavior establish the distinct modes.
[^7]: [bedtools general usage](https://bedtools.readthedocs.io/en/latest/content/general-usage.html),2.31.0, accessed2026-10-23. Quote: “The zero-based starting position”. Use getfasta's specific documentation for its split behavior rather than the older general BED12 warning.
[^8]: [gffread.cpp](https://raw.githubusercontent.com/gpertea/gffread/v0.12.9/gffread.cpp), tagv0.12.9, `VERSION`0.12.9, usage block. Quote: “write a fasta file with spliced exons for each transcript”. `-u/-w/-x/-y`, `--bed`, `--gtf` and input options define the interface.
[^9]: [gff_utils.cpp](https://raw.githubusercontent.com/gpertea/gffread/v0.12.9/gff_utils.cpp), tagv0.12.9; `getSpliced` calls and `f_u` branch. Quote: “const char* tseq=faseq->subseq(fstart, fspan);”. Source inference: `-u` prints this substring directly; spliced branches use the GCLib method instead.
[^10]: [GCLib gff.cpp](https://github.com/gpertea/gclib/blob/35376c8f69889178306ce80d986a3cc09e726a22/gff.cpp), commit35376c8f69889178306ce80d986a3cc09e726a22, accessed through official GitHub contents API2026-10-23. Quote: “spliced[s] = ntComplement(gsubseq[i-start]);”. `GffObj::getSpliced` minus-strand branch traverses intervals and bases backward. This commit is separately pinned; no exact gffread release-binary dependency match was established.
[^11]: [SeqKit usage](https://bioinf.shenwei.me/seqkit/usage/), rolling manual, accessed2026-10-23. Quote: “The definition of region is 1-based”. Sections subseq/faidx/translate/sliding/bam and BED/GTF conversion supply the scoped commands and format directions; no latest version inferred from rolling documentation.
[^12]: [shenwei356/bio alphabet.go](https://github.com/shenwei356/bio/blob/b7200292282083c3bc1db0446238595f2527d5eb/seq/alphabet.go), commitb7200292282083c3bc1db0446238595f2527d5eb, opened through official GitHub contents API2026-10-23. Quote: “IUPAC nucleotide code: ACGTURYSWKMBDHVN”. Alphabet definitions document extended nucleotide/protein symbols. SeqKit's manual identifies the library; a specific installed SeqKit dependency pairing was not tested.
[^13]: [samtools faidx manual](https://www.htslib.org/doc/samtools-faidx.html),1.24,2026-07-09. Quote: “Output the sequence as the reverse complement.” Region-list and `-i` options; FASTA input/output only is the scope here, not the entire samtools suite.
[^14]: [AGAT extract_sequences](https://agat.readthedocs.io/en/latest/tools/agat_sp_extract_sequences.html), rolling manual, accessed2026-10-23. Quote: “extracted chunk by chunk and merged”. `--split`, `--merge`, `--full`, strand, phase, codon-table and alternative-initiation options supply the detailed extraction behavior.
[^15]: [AGAT task catalog](https://agat.readthedocs.io/en/latest/agat_for_you.html), rolling manual, accessed2026-10-23. Quote: “convert EMBL format into GFF3 format”. Conversion entries establish format directions including minimap2 BAM; not universal BAM semantics.
[^16]: [NCBI table2asn](https://www.ncbi.nlm.nih.gov/genbank/table2asn/), rolling official manual, accessed2026-10-23. Quote: “Generates GenBank flatfiles”. Inputs/output and genetic-code selection; actual latest release date is unresolved separately.
[^17]: [table2asn readme](https://ftp.ncbi.nlm.nih.gov/asn1-converters/by_program/table2asn/DOCUMENTATION/table2asn_readme.txt), rolling official document, accessed2026-10-23. Quote: “Translation exception qualifiers in coding regions are parsed”. Describes multi-interval circular genes, reversed endpoints for complement, five-column annotations and qualifier mapping.
[^18]: [NCBI GFF3/GTF annotation guide](https://www.ncbi.nlm.nih.gov/genbank/genomes_gff/), rolling official guide, accessed2026-10-23. Quote: “Many SO feature types are recognized”. Describes partialness rewriting, ignored range hints, stop extension, SO mappings and translation exceptions; these transformations limit preservation claims.
[^19]: [NCBI prokaryotic annotation guide](https://www.ncbi.nlm.nih.gov/genbank/genomesubmit_annotation/), rolling official guide, accessed2026-10-23. Quote: “software assumes a codon_start of 1”. Joined CDS translation does not prove a nucleotide extraction export interface.
[^20]: [BioPerl FAQ](https://bioperl.org/FAQ.html), rolling official FAQ, accessed2026-10-23. Quote: “You can use the spliced_seq method.” Location iteration in the example prints coordinates, not separate extracted sequence products.
[^21]: [Bio::PrimarySeqI](https://metacpan.org/pod/Bio::PrimarySeqI), BioPerl1.7.8,2021-02-03. Quotes: “first base is 1”; “number is inclusive”; “reversed complement”; “-offset”; “1, 2, or 3”; “-codontable_id”. Explicit API parameters do not establish automatic qualifier interpretation.
[^22]: [Bio::Tools::CodonTable](https://metacpan.org/pod/Bio::Tools::CodonTable), BioPerl1.7.8,2021-02-03, NCBI-code update referenced2016-11-18. Quote: “recognized all common IUPAC ambiguity codes for DNA, RNA and animo acids.” The documentation's J description says Ile/Val; treat as documented discrepancy only.
[^23]: [Bio::SeqIO](https://metacpan.org/pod/Bio::SeqIO), BioPerl1.7.8,2021-02-03. Quotes: “can either read or write sequence objects”; “Supported formats include fasta, genbank, embl”.
[^24]: [Bio::Factory::FTLocationFactory](https://metacpan.org/pod/Bio::Factory::FTLocationFactory), BioPerl1.7.8,2021-02-03. Quote: “Implementation of string-encoded location parsing for the Genbank feature table encoding of locations.” Grammar support is narrower than standalone file support.
[^25]: [BioJava Location API](https://biojava.org/docs/api/org/biojava/nbio/core/sequence/location/template/Location.html), API7.1.4, accessed2026-10-23. Quotes: “The full assembled sequence”; “represents the outer bounds”; “such as 78^79”. Methods distinguish assembled sublocations from the bounding sequence; model flags alone are not lifecycle proof.
[^26]: [BioJava DNASequence](https://biojava.org/docs/api/org/biojava/nbio/core/sequence/DNASequence.html), API7.1.4. Quote: “Delegates to AbstractSequence.getInverse() for the reverse complement”. This is a primitive, not proof of feature-extraction orientation.
[^27]: [BioJava InsdcParser](https://biojava.org/docs/api/org/biojava/nbio/core/sequence/location/InsdcParser.html), API7.1.4. Quote: “Parser for working with INSDC style locations.” Describes different join/order meanings and circular settings, but not a preservation/extraction guarantee.
[^28]: [BioJava Sequence API](https://biojava.org/docs/api/org/biojava/nbio/core/sequence/template/Sequence.html), API7.1.4. Quote: “This is indexed from 1”.
[^29]: [BioJava GenbankReaderHelper](https://biojava.org/docs/api/org/biojava/nbio/core/sequence/io/GenbankReaderHelper.html), API7.1.4. Quote: “readGenbankDNASequence”.
[^30]: [BioJava GenbankWriterHelper](https://biojava.org/docs/api/org/biojava/nbio/core/sequence/io/GenbankWriterHelper.html), API7.1.4. Quote: “write out genbank file of a sequence collection”.
[^31]: [BioJava FastaReaderHelper](https://biojava.org/docs/api/org/biojava/nbio/core/sequence/io/FastaReaderHelper.html), API7.1.4. Quote: “readFastaDNASequence”.
[^32]: [BioJava FastaWriter](https://biojava.org/docs/api/org/biojava/nbio/core/sequence/io/FastaWriter.html), API7.1.4. Quote: “The FastaWriter writes a collection of sequences to an outputStream.”
[^33]: [BioJava GFF3Reader](https://biojava.org/docs/api/org/biojava/nbio/genome/parsers/gff/GFF3Reader.html), API7.1.4. Quotes: “Read and write FeatureLists as GFF/GTF formatted files.”; “The proper interpretation of any particular attribute, however, is left to you.” Actual read methods justify R; broad class prose does not establish a writer.
[^34]: [GenomicFeatures manual](https://bioconductor.org/packages/release/bioc/manuals/GenomicFeatures/man/GenomicFeatures.pdf),1.64.0, commit66b0a50, manual2026-10-21, pp3,13–16. Quotes: “Extract transcript (or CDS) sequences from chromosome sequences”; “exons must be ordered by ascending rank”; “BED and GFF models”. Export section expressly follows GFF3; rank is transcript rank, not arbitrary INSDC written order.
[^35]: [Biostrings manual](https://bioconductor.org/packages/release/bioc/manuals/Biostrings/man/Biostrings.pdf),2.80.2, commit655464c, manual2026-10-21. Quotes: “reverseComplement”; “only FASTA and FASTQ files are supported”; “alternative initiation codons”; “IUPAC nucleotide ambiguity codes”; “Single-Letter Amino Acid Code”. Relevant sections: alphabets, getGeneticCode, translation/initiation, reverseComplement, sequence I/O. The FASTA/FASTQ-only statement is scoped to those I/O functions, not all Bioconductor.
[^36]: [BSgenome manual](https://bioconductor.org/packages/release/bioc/manuals/BSgenome/man/BSgenome.pdf),1.80.0, commit22c86ec, manual2026-10-21, pp20–24. Quotes: “extracting a set of sequences (or subsequences)”; “of the same shape as names”; “within-element results are concatenated”. The last phrase describes contrasting XStringSet bracket behavior, not getSeq's GRangesList result. Strand-aware range examples are explicit.
[^37]: [IGB User's Guide](https://documents.thermofisher.com/TFS-Assets/LSG/manuals/IGB_User_Guide.pdf),February2007, pp28–36,78. Quotes: “include only the exon regions”; “including the intron regions”; “FASTA format”; “GFF version 3”; “BED and DAS/2 XML”; “sequence ontology category”. This is historical documentation, not current10.2.0 testing.
[^38]: [BioViz overview](https://bioviz.org/overview.html), undated official overview, accessed2026-10-23. Quote: “BAM, BED, GFF3”. Used only to confirm named format availability, not detailed semantics.
[^39]: [Apollo User's Guide](https://genomearchitect.readthedocs.io/en/latest/UsersGuide.html), header2.7.0, accessed2026-10-23. Quotes: “protein, cDNA, CDS or genomic sequences”; “GFF3 and FASTA”; “Set readthrough stop codon”; “non-canonical (non-ATG)”. Sections Get Sequences, Exporting Data and Start/Stop Sites; a strand-flip menu alone does not establish extraction orientation.
[^40]: [Apollo Configuration](https://genomearchitect.readthedocs.io/en/latest/Configure.html),2.7.0. Quotes: “The default translation table is”; “NCBI translation tables”; “from the Sequence Ontology”. Default table1; global/per-organism configuration, supported annotation types.
[^41]: [Apollo Data loading](https://genomearchitect.readthedocs.io/en/latest/Data_loading.html),2.7.0. Quotes: “Apollo natively supports BAM files”; “upload FASTA files to create new genomes”; “used to load GFF3 files”.
[^42]: [MEGA Alignment Explorer Data Menu](https://www.megasoftware.net/web_help_12/Part_II_Assembling_Data_For_Analysis/Building_Sequence_Alignments/Menu_Items_In_Alignment_Explorer/Data_Menu.htm),MEGA12 help. Quotes: “MEGA, FASTA or PAUP/NEXUS”; “when an entire sequence of row(s) is selected”; “selected genetic code table”.
[^43]: [MEGA IUPAC codes](https://megasoftware.net/web_help_12/IUPAC_Single_Letter_Codes.htm),MEGA12 help. Quote: “The single-letter codes supported in MEGA are as follows.” Explicit nucleotide ambiguity table and basic amino-acid table; extended amino-acid semantics remain U.
[^44]: [MEGA genetic-code tables](https://megasoftware.net/web_help_12/Adding_Modifying_Genetic_Code_Tables.htm),MEGA12 help. Quote: “add new genetic code tables and/or edit existing code tables”.
[^45]: [MEGA importing data](https://megasoftware.net/web_help_12/Importing_Data.htm),MEGA12 help. Quote: “FASTA format”.
[^46]: Supplied [locations](../locations.md) LOC-1/3/7 and [conformance](../conformance/README.md), dated2026-10-22. Quotes: “joins and orients by strand”; “extractfeat -join Y”. These are inherited Tested/Documented evidence, not rerun in this session.
[^47]: [Geneious annotations](https://manual.geneious.com/en/latest/Annotations.html), rolling manual reopened2026-10-23. Quotes: “can be concatenated into a single sequence”; “each interval in the annotation will be extracted to a separate sequence”. Strand not established.
[^48]: [Ensembl sequence/id](https://rest.ensembl.org/documentation/info/sequence_id), source linked in supplied2026-10-22 LOC-7 evidence. This URL returned500 in this pass; no fresh quote claimed. Supplied documented statement: genomic default plus spliced cDNA/CDS. Retained as evidence inherited from the first survey, with this access limitation explicit.
[^49]: [UCSC Table Browser help](https://www.genome.ucsc.edu/goldenPath/help/hgTablesHelp.html), rolling guide reopened2026-10-23, “Displaying CDS FASTA alignments”. Quote: “coding exons of each gene to be concatenated into one sequence”. Per-exon option documented. This alignment context has additional projection limitations and is not a universal feature exporter.
[^50]: [SnapGene Extract a Region](https://support.snapgene.com/hc/en-us/articles/10384297596180-Extract-a-Region-in-a-Sequence-to-a-New-File),updated2026-09-11. Quote: “select both features and any intervening sequence”. Selected span is not evidence of spliced feature extraction.
[^51]: [NCBI Genome Workbench retirement](https://ncbiinsights.ncbi.nlm.nih.gov/2023/09/06/genome-workbench-retire-march-2024/),2023-09-06 updated2024-01-22. Quote: “no additional public releases or updates after March 2024”.
[^52]: [Vector NTI official discontinuation FAQ](https://www.thermofisher.com/content/dam/LifeTech/global/life-sciences/Cloning/Images/TFS_Vector-NTI-Software_FAQ.pdf), undated, accessed2026-10-23. Quote: “all three software versions”. Dated sales/support endpoints are in the linked official notice recorded in the cohort ledger.
[^53]: [SeaView manual](https://doua.prabi.fr/software/seaview_data/seaview),header5.1, accessed2026-10-23. Quotes: “specified feature key”; “correct genetic code and reading frame”; “Complement sequence”; “Reverse sequence”; “/transl_table=”; “IUPAC nucleotide ambiguity symbols”. Database import does not prove GenBank/EMBL flat-file I/O. Manual File/Props/command-line sections establish FASTA and table selection.
[^54]: [Tablet Importing Features](https://tablet.hutton.ac.uk/en/latest/importing_features.html),1.21.02.08 manual. Quote: “Tablet currently makes no attempt to link features”. GFF3 import; feature rows do not prove transcript grouping.
[^55]: [Tablet release notes](https://ics.hutton.ac.uk/tablet/download-tablet/tablet-release-notes/), through1.21.02.08. Quotes: “portion of reference sequence mapping to a feature”; “GTF format”; “BED file format”; “VCF file format”. Feature copying and input support; multipart/strand behavior U.
[^56]: [Tablet Jump to Base](https://tablet.hutton.ac.uk/en/latest/jump_to_base.html),1.21.02.08 manual, revision2804f6e5. Quote: “always count their first base as position ‘1’”. Both padded and unpadded coordinates documented.
[^57]: [Tablet Application Menu](https://tablet.hutton.ac.uk/en/latest/application_menu.html),1.21.02.08 manual, revision2804f6e5. Quote: “Save is a placeholder option for possible future functionality”. Save As is likewise a placeholder; no inference about all export mechanisms.
[^58]: [Tablet Open Assembly](https://tablet.hutton.ac.uk/en/latest/open_assembly.html),1.21.02.08 manual. Quotes: “SAM or BAM file formats”; “read from a FASTA file”.

[^59]: Supplied [previous survey](2026-10-22-first-survey.md), 2026-10-22, primary matrix and sources1–87; [translation](../translation.md), [locations](../locations.md), [coordinates/alphabets](../alphabets-and-coordinates.md), [formats](../formats.md), [alignment](../alignment.md). Inherited Documented/Contract/Tested evidence; not rerun. Quote: “A tool's format support is not evidence that it implements the format's semantics correctly” (tools.md (2026-10-22 version)). Full source identities and corrected cells are retained in tools.json.
[^60]: [NCBI Sequence Viewer: Accessing RNA and protein sequence data](https://www.ncbi.nlm.nih.gov/tools/sviewer/mrnaproteindata/), updated2020-05-12, reopened2026-10-23. Quote: “The exons option provides the individual exons of an RNA feature as separate FASTA”.
