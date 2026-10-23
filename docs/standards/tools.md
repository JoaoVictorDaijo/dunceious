# Tools and the standards they follow

What widely used sequence tools document about the standards in this folder. Use it to see
industry practice where a standard is silent (step 3 of the [order of authority](README.md#order-of-authority)).
A tool's format support is not evidence that it implements the format's semantics correctly,
and adoption counts never select a scientific rule.

**The data lives in [`tools.json`](tools.json):** one record per tool with release, lifecycle,
adoption evidence, formats, every rule ID in this folder (plus feature extraction), known
deviations and numbered sources. [`tool-counts.json`](tool-counts.json) holds the per-operation
counts. This page summarises them. Evidence ledgers: [first survey](survey/2026-10-22-first-survey.md)
(2026-10-22), [tool survey](survey/2026-10-23-tools-survey.md) and [cohort](survey/2026-10-23-cohort.md)
(2026-10-23). Both surveys were independently re-verified before commit.

## How tools were chosen

These are the owner's rulings for this survey; keep them when updating it.

- **Discovery is neutral:** the ELIXIR bio.tools registry (sequence visualisation, editing and
  annotation operations) and peer-reviewed reviews of genome browsers and plasmid editors, plus
  the earlier cohort. Queries and dates are in the cohort ledger.
- **Adoption means current use:** citations of the tool's primary paper from papers published
  2024–2026 (Europe PMC), next to the all-time count. Where a tool has several papers, the one
  with the most recent citations represents it. Commercial tools without a paper use the
  vendor's published user count, labelled vendor-stated. Citations and vendor counts are never
  ranked together.
- **Release age does not exclude a tool.** Only an official discontinuation or end-of-support
  statement does.
- **Three groups, never merged:** interactive applications; command-line tools and libraries;
  reference services (INSDC databases, NCBI). Each group's consensus is reported on its own.
- **Relevance filter:** a tool counts on an operation only if it documents that operation;
  otherwise the cell is not applicable. Within each group, the "top half" is ceil(n/2) of the
  applicable ranked tools, ties kept. Unknown cells never count.
- Tools with no measurable adoption (Clone Manager, Sequencher, Addgene's analyzer) are recorded
  as evidence only, not counted.

## Cohort

### Interactive applications (ranked by recent citations)

| Tool | Recent citations (2024–2026) | All-time | Primary paper | Latest release |
|---|---:|---:|---|---|
| MEGA | 4,741 | 27,508 | [10.1093/molbev/msw054](https://doi.org/10.1093/molbev/msw054) | [12.1.3](https://megasoftware.net/history) |
| IGV | 4,086 | 14,000 | [10.1038/nbt.1754](https://doi.org/10.1038/nbt.1754) | [2.19.8 (2026-06-05)](https://igv.org/doc/desktop/DownloadPage/) |
| Geneious Prime | 2,670 | 13,173 | [10.1093/bioinformatics/bts199](https://doi.org/10.1093/bioinformatics/bts199) | [2026.1.4 (2026-10-09)](https://assets.geneious.com/documentation/geneious/release_notes.html) |
| Jalview | 2,258 | 8,841 | [10.1093/bioinformatics/btp033](https://doi.org/10.1093/bioinformatics/btp033) | [2.11.5.2 (2026-07-14)](https://www.jalview.org/download/) |
| JBrowse 2 | 1,133 | 1,193 | [10.1186/s13059-023-02914-z](https://doi.org/10.1186/s13059-023-02914-z) | [4.3.0 (2026-05-21)](https://jbrowse.org/jb2/blog/) |
| AliView | 1,043 | 2,491 | [10.1093/bioinformatics/btu531](https://doi.org/10.1093/bioinformatics/btu531) | [1.33 (2026-09-28)](https://www.ormbunkar.se/aliview/) |
| UCSC | 1,000 | 7,863 | [10.1101/gr.229102](https://doi.org/10.1101/gr.229102) | [504 (2026-10-06)](https://hgdownload.gi.ucsc.edu/admin/) |
| Unipro UGENE | 723 | 2,105 | [10.1093/bioinformatics/bts091](https://doi.org/10.1093/bioinformatics/bts091) | [53.1 (2026-03)](https://ugene.net/ru/download-all.html) |
| SeaView | 451 | 4,005 | [10.1093/molbev/msp259](https://doi.org/10.1093/molbev/msp259) | [5.1](https://doua.prabi.fr/software/seaview_data/CHANGES) |
| Artemis / ACT | 217 | 1,040 | [10.1093/bioinformatics/btr703](https://doi.org/10.1093/bioinformatics/btr703) | [18.2.0 (2022-03-14)](https://github.com/sanger-pathogens/Artemis/releases/tag/v18.2.0) |
| DNASTAR SeqBuilder Pro | 173 | 811 | [10.1385/1-59259-192-2:71](https://doi.org/10.1385/1-59259-192-2:71) | [Lasergene 19.0.1 (2026-07-24)](https://www.dnastar.com/blog/updates/lasergene-19-0-1-release-notes/) |
| Tablet | 158 | 816 | [10.1093/bib/bbs012](https://doi.org/10.1093/bib/bbs012) | [1.21.02.08 (2021-02-08)](https://ics.hutton.ac.uk/tablet/) |
| ApE | 152 | 239 | [10.3389/fbinf.2022.818619](https://doi.org/10.3389/fbinf.2022.818619) | [3.1.10.1 (2026-08-10)](https://jorgensen.biology.utah.edu/wayned/ape/) |
| Ensembl | 97 | 1,135 | [10.1093/nar/30.1.38](https://doi.org/10.1093/nar/30.1.38) | [116 (2026-06-09)](https://www.ensembl.info/2026/06/09/ensembl-116-and-ensembl-genomes-63-have-been-released/) |
| Apollo | 89 | 243 | [10.1371/journal.pcbi.1006790](https://doi.org/10.1371/journal.pcbi.1006790) | [2.9.0 (2026-07-15)](https://github.com/GMOD/Apollo/releases/tag/2.9.0) |
| IGB | 84 | 345 | [10.1093/bioinformatics/btw069](https://doi.org/10.1093/bioinformatics/btw069) | [10.2.0](https://sourceforge.net/projects/genoviz/files/IGB%2010.2.0/) |
| MacVector | 1 | 29 | [10.1385/0-89603-276-0:195](https://doi.org/10.1385/0-89603-276-0:195) | [26.1.0 (2026-10)](https://macvector.com/getting-started/macvector-major-release-details-and-history/) |

### Command-line tools and libraries (ranked by recent citations)

| Tool | Recent citations (2024–2026) | All-time | Primary paper | Latest release |
|---|---:|---:|---|---|
| samtools faidx | 11,081 | 13,538 | [10.1093/gigascience/giab008](https://doi.org/10.1093/gigascience/giab008) | [1.24 (2026-07-09)](https://www.htslib.org/doc/samtools-faidx.html) |
| bedtools | 8,747 | 25,582 | [10.1093/bioinformatics/btq033](https://doi.org/10.1093/bioinformatics/btq033) | [2.31.1 (2023-11-07)](https://github.com/arq5x/bedtools2/releases/tag/v2.31.1) |
| Biopython | 1,965 | 5,163 | [10.1093/bioinformatics/btp163](https://doi.org/10.1093/bioinformatics/btp163) | 1.88 (2026-08-06) |
| SeqKit | 1,816 | 2,814 | [10.1371/journal.pone.0163962](https://doi.org/10.1371/journal.pone.0163962) | [2.14.0 (2026-09-24)](https://github.com/shenwei356/seqkit/releases) |
| EMBOSS | 1,187 | 7,473 | [10.1016/s0168-9525(00)02024-2](https://doi.org/10.1016/s0168-9525%2800%2902024-2) | 6.6.0 (2013-07-15) |
| gffread | 888 | 1,263 | [10.12688/f1000research.23297.2](https://doi.org/10.12688/f1000research.23297.2) | [0.12.9 (2026-04-10)](https://github.com/gpertea/gffread/releases/tag/v0.12.9) |
| Bioconductor | 745 | 3,169 | [10.1038/nmeth.3252](https://doi.org/10.1038/nmeth.3252) | [3.23 (2026-04-29)](https://bioconductor.org/about/release-announcements/) |
| BioPerl | 48 | 1,205 | [10.1101/gr.361602](https://doi.org/10.1101/gr.361602) | [1.7.8 (2021-02-03)](https://metacpan.org/pod/BioPerl) |
| BioJava | 11 | 39 | [10.1371/journal.pcbi.1006791](https://doi.org/10.1371/journal.pcbi.1006791) | [7.3.0 (2026-09-19)](https://api.github.com/repos/biojava/biojava/releases/latest) |

### Commercial applications with vendor-stated users

| Tool | Vendor-stated count | Source |
|---|---|---|
| SnapGene | Over 50,000 scientists (vendor-stated; observed 2026-10-23) | https://www.snapgene.com/customers |
| Benchling | 200,000+ scientists; 1,300+ biotech organizations (vendor-stated; observed 2026-10-23; page also says 1,200+ biotechs) | https://www.benchling.com/customer-stories |
| CLC Genomics Workbench | 90,000 QDI users (vendor-stated 2024 annual report; parent-platform supplement, not CLC-specific) | https://www.qiagen.com/-/media/Project/Qiagen/Qiagen-Home/About-QIAGEN-website/Annual-Results-2024/Growth-Pillar-overview.pdf |

SeqBuilder Pro and CLC figures are company- or platform-wide, not product-specific.

### Evidence only (no measurable adoption)

Clone Manager, Sequencher, Addgene analyzer.

### Reference services

NCBI Sequence Viewer, table2asn, GenBank / RefSeq, ENA, DDBJ, NCBI BLAST, NCBI ORFfinder, NCBI genetic codes.

### Excluded (official end of life)

| Tool | Statement |
|---|---|
| NCBI Genome Workbench | Retired March 2024; no downloads, customer support, software updates or tutorial documentation thereafter. ([source](https://ncbiinsights.ncbi.nlm.nih.gov/2023/09/06/genome-workbench-retire-march-2024/)) |
| Vector NTI | Sales ended 2019-12-31; support ended 2020-12-31. ([source](https://www.thermofisher.com/sg/en/home/life-science/cloning/vector-nti-software.html)) |
| GBrowse | Official README explicitly says unsupported. ([source](https://github.com/GMOD/GBrowse)) |

### Reserve (found by neutral discovery, not yet researched in detail)

WashU Epigenome Browser, GenomeView, PlasMapper3, RF-Cloning.org, SeqMonk, TeselaGen, Dalliance, Savant, SerialCloner, GENtle. Being in reserve is not a judgement of quality or status.

## Feature extraction: what the tools do

How a tool returns the sequence of a feature with several intervals, or on the reverse strand
(rule [LOC-7](locations.md#loc-7-the-sequence-of-a-multi-interval-feature)). Counts are tools
documenting each behaviour; a tool can offer several. Unknown never counts.

| Group | Applicable tools | Joined | Separate intervals | Region spanned | Reverse-complemented |
|---|---:|---:|---:|---:|---:|
| Interactive / papers, all | 9 | 5 | 2 | 3 | 0 |
| Interactive / papers, top half | 5 | 2 | 2 | 0 | 0 |
| Interactive / vendor, all | 1 | 0 | 0 | 1 | 0 |
| Interactive / vendor, top half | 1 | 0 | 0 | 1 | 0 |
| CLI/library / papers, all | 9 | 7 | 2 | 6 | 7 |
| CLI/library / papers, top half | 5 | 3 | 1 | 3 | 5 |
| CLI/library / unranked (AGAT), evidence only | 1 | 1 | 1 | 1 | 1 |
| Interactive / unranked (CLC), evidence only | 1 | 0 | 0 | 0 | 0 |
| Reference (NCBI Sequence Viewer) | 1 | 0 | 1 | 0 | 0 |

- Among command-line tools and libraries, joining, the region and strand-aware extraction are
  each widely documented: bedtools `getfasta -split -s`, gffread, Biopython, EMBOSS
  `extractfeat -join`, Bioconductor `getSeq`.
- Among interactive applications, joining is documented by Geneious Prime, UCSC, Ensembl,
  Apollo and IGB, and the region by Ensembl, Apollo, IGB and SnapGene (a span between two
  features). **No interactive application documents what it does on the reverse strand.**

## Format support

R = reads, W = writes, RW = both, no = explicitly unsupported, ? = not documented, n/a = not applicable.

| Tool | GenBank | EMBL | FASTA | GFF3 | GTF | BED | SAM/BAM | VCF | SBOL |
|---|---|---|---|---|---|---|---|---|---|
| SnapGene | RW | R | R | ? | ? | ? | R | ? | ? |
| Geneious Prime | RW | R | RW | R | R | RW | RW | RW | ? |
| Benchling | RW | ? | RW | ? | ? | ? | ? | ? | RW |
| CLC Genomics Workbench | RW | RW | RW | RW | RW | RW | RW | RW | ? |
| DNASTAR SeqBuilder Pro | RW | RW | RW | ? | ? | ? | ? | ? | ? |
| MacVector | RW | RW | RW | R | ? | R | R | ? | ? |
| Unipro UGENE | RW | R | RW | ? | ? | ? | RW | RW | ? |
| ApE | RW | ? | ? | ? | ? | ? | ? | ? | ? |
| Jalview | R | R | RW | R | ? | ? | ? | R | ? |
| Artemis / ACT | RW | RW | RW | RW | ? | ? | R | RW | ? |
| IGV | R | ? | R | R | R | R | R | R | ? |
| JBrowse 2 | ? | ? | R | R | R | R | R | R | ? |
| Ensembl | ? | ? | W | R | RW | ? | ? | ? | ? |
| UCSC | ? | ? | W | no | RW | RW | R | R | ? |
| IGB | ? | ? | R | R | R | RW | R | ? | ? |
| Apollo | ? | ? | RW | RW | ? | W | R | ? | ? |
| MEGA | ? | ? | RW | ? | ? | ? | ? | ? | ? |
| AliView | ? | ? | RW | ? | ? | ? | ? | ? | ? |
| Clone Manager | RW | R | RW | ? | ? | ? | ? | ? | ? |
| Sequencher | RW | RW | RW | ? | ? | ? | ? | ? | ? |
| Addgene analyzer | W | ? | W | ? | ? | ? | ? | ? | ? |
| SeaView | ? | ? | RW | ? | ? | ? | ? | ? | ? |
| Tablet | ? | ? | R | R | R | R | R | R | ? |
| BioPerl | RW | RW | RW | ? | ? | ? | ? | ? | ? |
| BioJava | RW | ? | RW | R | R | ? | ? | ? | ? |
| Bioconductor | ? | ? | RW | W | ? | W | ? | ? | ? |
| bedtools | ? | ? | RW | R | R | RW | ? | R | ? |
| gffread | ? | ? | RW | RW | RW | RW | ? | ? | ? |
| SeqKit | ? | ? | RW | ? | RW | RW | RW | ? | ? |
| samtools faidx | ? | ? | RW | ? | ? | ? | ? | ? | ? |
| AGAT | ? | R | RW | RW | RW | RW | R | ? | ? |
| EMBOSS | RW | R | W | ? | ? | ? | ? | ? | ? |
| Biopython | RW | RW | RW | ? | ? | ? | ? | ? | ? |
| NCBI Sequence Viewer | W | ? | RW | RW | R | RW | R | RW | ? |
| table2asn | W | ? | R | R | R | ? | ? | ? | ? |
| GenBank / RefSeq | W | ? | ? | W | ? | ? | ? | ? | ? |
| ENA | ? | R | ? | ? | ? | ? | ? | ? | ? |
| DDBJ | W | ? | ? | ? | ? | ? | ? | ? | ? |
| NCBI BLAST | ? | ? | R | ? | ? | ? | ? | ? | ? |
| NCBI ORFfinder | ? | ? | R | ? | ? | ? | ? | ? | ? |
| NCBI genetic codes | ? | ? | ? | ? | ? | ? | ? | ? | ? |

## Updating

Re-run the citation queries stored in each record (`adoption.query_url`), keep the rulings
above, and re-verify independently before committing. Change `tools.json` and
`tool-counts.json` first; then update this page from them.
