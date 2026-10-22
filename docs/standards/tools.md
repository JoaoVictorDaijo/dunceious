# Tools and the standards they follow

What widely used sequence tools document about the standards in this folder. Use it to see
industry practice where a standard is silent (step 3 of the [order of authority](README.md#order-of-authority)).
A tool's format support is not evidence that it implements the format's semantics correctly,
and adoption counts never select a scientific rule.

Survey date: 2026-10-22. Evidence is documentation only, except Biopython 1.88 and EMBOSS 6.6.0,
which were also tested on the [conformance fixture](conformance/README.md). `?` means the
examined documentation does not say; it is not evidence that the tool lacks support.

## Reference tools and databases

| Source | Role | Main documents |
|---|---|---|
| GenBank / RefSeq, ENA, DDBJ | Define and publish INSDC records | [INSDC Feature Table 11.4](https://www.insdc.org/submitting-standards/feature-table/) |
| NCBI genetic codes | Translation tables | [The Genetic Codes](https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi), gc.prt 4.6 |
| EMBOSS 6.6.0 | Reference command-line implementations (alignment, extraction, translation) | [EMBOSS 6.6 applications](https://emboss.sourceforge.net/apps/release/6.6/emboss/apps/) |
| Biopython 1.88 | Reference library for parsing and sequence operations | [Bio.SeqFeature](https://biopython.org/docs/latest/api/Bio.SeqFeature.html), [Bio.Seq](https://biopython.org/docs/latest/api/Bio.Seq.html) |
| NCBI BLAST, ORFfinder | Search and ORF services; task-specific defaults | [ORFfinder](https://www.ncbi.nlm.nih.gov/orffinder/) |

## Format and vocabulary support (15 applications)

R = reads, W = writes, RW = both, no = explicitly unsupported in the named interface, ? = not documented.

| Tool | INSDC FT | GenBank | EMBL | FASTA | GFF3 | GTF | BED | SAM/BAM | VCF | SBOL | NCBI codes | IUPAC nt | IUPAC aa | SO |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SnapGene | ? | RW | R | R | ? | ? | ? | R | ? | ? | ? | R | ? | ? |
| Geneious Prime | ? | RW | R | RW | R | R | RW | RW | RW | ? | ? | ? | ? | ? |
| Benchling | ? | RW | ? | RW | ? | ? | ? | ? | ? | RW | R | ? | ? | ? |
| CLC Genomics Workbench | ? | RW | RW | RW | RW | RW | RW | RW | RW | ? | R | R | R | R |
| DNASTAR SeqBuilder Pro | ? | RW | RW | RW | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| MacVector | ? | RW | RW | RW | R | ? | R | R | ? | ? | ? | ? | ? | ? |
| Unipro UGENE | ? | RW | R | RW | ? | ? | ? | RW | RW | ? | ? | ? | ? | ? |
| ApE | ? | RW | ? | ? | ? | ? | ? | ? | ? | ? | ? | R | ? | ? |
| Jalview | ? | R | R | RW | R | ? | ? | ? | R | ? | ? | ? | ? | ? |
| Artemis / ACT | RW | RW | RW | RW | RW | ? | ? | R | RW | ? | ? | R | ? | ? |
| IGV | ? | R | ? | R | R | R | R | R | R | ? | ? | R | ? | ? |
| JBrowse 2 | ? | ? | ? | R | R | R | R | R | R | ? | ? | ? | ? | ? |
| NCBI Sequence Viewer | ? | W | ? | RW | RW | R | RW | R | RW | ? | ? | ? | ? | ? |
| Ensembl | ? | ? | ? | W | R | RW | ? | ? | ? | ? | ? | ? | ? | R |
| UCSC | ? | ? | ? | W | no | RW | RW | R | R | ? | ? | ? | W | ? |

"INSDC FT" needs evidence beyond listing GenBank, so most cells are `?`. For alphabets, codes
and ontologies, R means documented interpretation and W means documented output.

| Standard | Apps documenting any support | Both read and write |
|---|---:|---:|
| FASTA | 14 | 9 |
| GenBank flat file | 12 | 9 |
| SAM/BAM | 10 | 3 |
| GFF3 | 9 | 3 |
| VCF | 9 | 5 |
| EMBL flat file | 8 | 4 |
| GTF | 7 | 3 |
| BED | 7 | 4 |
| IUPAC nucleotide codes | 5 | 0 |
| NCBI genetic codes, IUPAC amino-acid codes, Sequence Ontology | 2 each | 0 |
| INSDC Feature Table, SBOL | 1 each | 1 each |

Counts are lower bounds out of 15.

## Where tools depart from the standard's semantics

- **GenBank dialects.** SnapGene adds its own qualifiers; ApE adds `ApEinfo`; Geneious
  drag-export is not strict GenBank; Artemis drops incompatible headers when converting.
- **GFF3.** CLC merges CDS rows by parent and does not translate SO accessions; the UCSC Browser
  does not support GFF3 tracks; NCBI keeps the INSDC key in `gbkey`.
- **GTF.** Ensembl describes a GFF2-based GTF; UCSC names GTF2.2. Same extension, different dialects.
- **Coordinates.** UCSC and IGV document 0-based half-open BED files but show 1-based positions.
- **Genetic codes.** Benchling supports the NCBI tables except 27, 28 and 31.
- **Amino-acid codes.** UCSC CDS alignment output writes stops as `Z`.
- **Location semantics.** No application documents how it handles `order()`, partial ends
  through editing, `^` sites or `/transl_except`. For those, the standard and the reference
  tools decide.

## Application sources

| Application | Documentation examined |
|---|---|
| SnapGene | [File extensions](https://support.snapgene.com/hc/en-us/articles/10242726896020-What-File-Extensions-does-SnapGene-support) (2026-09-12), [GenBank–SnapGene format](https://support.snapgene.com/hc/en-us/articles/10242682237588-What-is-Genbank-SnapGene-Format) (2026-09-12), [IUPAC codes](https://support.snapgene.com/hc/en-us/articles/10384302587540-View-or-Use-IUPAC-Ambiguity-Codes) |
| Geneious Prime | [Importing and exporting](https://manual.geneious.com/en/latest/ImportExport.html), [Annotations](https://manual.geneious.com/en/latest/Annotations.html), [Sequences](https://manual.geneious.com/en/latest/Sequences.html) |
| Benchling | [DNA and RNA sequences](https://help.benchling.com/hc/en-us/articles/39110680274189-DNA-and-RNA-sequence-overview), [Annotations and translations](https://help.benchling.com/hc/en-us/articles/39768268305805-How-to-characterize-sequences-with-annotations-and-translations), [Alignments](https://help.benchling.com/hc/en-us/articles/39922093033869-How-to-create-alignments) |
| CLC Genomics Workbench 25.0.3 | [Sequence formats](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=Sequence_data_formats.html), [Annotation formats](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=Annotation_variant_formats.html), [GFF3](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=GFF3_format.html), [Read mapping formats](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=Read_mapping_formats.html), [Translation](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=Translation_DNA_or_RNA_protein.html) |
| DNASTAR SeqBuilder Pro | [File formats](https://www.dnastar.com/resources/file-formats/) |
| MacVector | [Importing sequences](https://macvector.com/getting-started/useful-workflows/importing-sequences-into-macvector/), [Release history](https://macvector.com/getting-started/macvector-major-release-details-and-history/) |
| Unipro UGENE | [Supported formats](https://ugene.net/docs/appendixes/appendix-a-supported-file-formats/specific-file-formats/), [ORF Marker](https://ugene.net/docs/extensions/orf-marker/) |
| ApE | Davis and Jorgensen 2022, [doi:10.3389/fbinf.2022.818619](https://www.frontiersin.org/journals/bioinformatics/articles/10.3389/fbinf.2022.818619/full) |
| Jalview | [File formats](https://www.jalview.org/help/html/io/fileformats.html), [Features format](https://www.jalview.org/help/html/features/featuresFormat.html), [File menu](https://www.jalview.org/help/html/menus/alwfile.html) |
| Artemis / ACT 18.0.0 | [Artemis manual](https://sanger-pathogens.github.io/Artemis/Artemis/artemis-manual.html), [GFF3 writer](https://sanger-pathogens.github.io/Artemis/Chado/writedb_entry.html) |
| IGV | [Data track formats](https://igv.org/doc/desktop/FileFormats/DataTracks/), [Reference genomes](https://igv.org/doc/desktop/UserGuide/reference_genome/) |
| JBrowse 2 | [Basic usage](https://jbrowse.org/jb2/docs/user_guides/basic_usage/) |
| NCBI Sequence Viewer | [Track data](https://www.ncbi.nlm.nih.gov/tools/sviewer/seqtrackdata/), [External data](https://www.ncbi.nlm.nih.gov/tools/sviewer/extdata/) |
| Ensembl (release 116) | [GFF3 upload](https://jun2026.archive.ensembl.org/info/website/upload/gff3.html), [GFF/GTF](https://jun2026.archive.ensembl.org/info/website/upload/gff.html), [REST sequence](https://rest.ensembl.org/documentation/info/sequence_id) |
| UCSC Genome Browser | [File formats FAQ](https://genome.ucsc.edu/FAQ/FAQformat.html), [Table Browser help](https://www.genome.ucsc.edu/goldenPath/help/hgTablesHelp.html) |
