# Sources

The standards and documented reference practices behind the rules in this folder.
[`sources.json`](sources.json) holds the fetchable standard pins with download URLs and SHA-256
checksums; the cite-only references below record versions or dated observations separately. Run `npm run standards:fetch` to download the pinned copies into `.cache/standards/`
and check them. Retrieved 2026-10-22.

| ID | Document | Pinned version | Copy |
|---|---|---|---|
| `insdc-ft` | [INSDC Feature Table Definition](https://www.insdc.org/submitting-standards/feature-table/) | 11.4, April 2026 | Fetched |
| `genbank-release-notes` | [GenBank release notes](https://ftp.ncbi.nlm.nih.gov/genbank/gbrel.txt) (format: §3) | Release 274.0, 2026-10-15 (URL always serves the latest) | Fetched |
| `embl-manual` | [ENA/EMBL user manual](https://ftp.ebi.ac.uk/pub/databases/embl/doc/usrman.txt) | Release 143, March 2020 | **Stored** in `sources/` |
| `ncbi-genetic-codes` | [NCBI Genetic Codes](https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi), [gc.prt](https://ftp.ncbi.nih.gov/entrez/misc/data/gc.prt) | gc.prt 4.6; page updated 2024-09-23 | Fetched |
| `nc-iub-nucleotides` | [NC-IUB, incompletely specified bases](https://iubmb.qmul.ac.uk/misc/naseq.html); Nucleic Acids Res. 13:3021 (1985), doi:10.1093/nar/13.9.3021 | Recommendations 1984 | Fetched |
| — | [IUPAC-IUB JCBN, amino acids and peptides](https://iupac.qmul.ac.uk/AminoAcid/) | Recommendations 1983; current symbol list in INSDC 11.4 §7.4.3 | Cite only |
| `sequence-ontology` | [Sequence Ontology](https://github.com/The-Sequence-Ontology/SO-Ontologies), [so.obo](https://purl.obolibrary.org/obo/so.obo) | data-version 2026-08-07 | **Stored** in `sources/` |
| `gff3` | [GFF3 specification](https://github.com/The-Sequence-Ontology/Specifications/blob/master/gff3.md) | 1.26, 2020-08-18 | Fetched |
| — | [GTF2.2](https://mblab.wustl.edu/GTF22.html) | 2.2; original unreachable on 2026-10-22, see UCSC's description | Cite only |
| `bed` | [GA4GH BED](https://samtools.github.io/hts-specs/BEDv1.pdf) | v1, 2022-01-05 (rev 9ddbc52) | Fetched |
| `sam` | [SAM/BAM format](https://samtools.github.io/hts-specs/SAMv1.pdf) | 1.6, 2025-08-12 (rev b5341fb) | Fetched |
| `vcf` | [VCF](https://samtools.github.io/hts-specs/VCFv4.5.pdf) | 4.5, 2026-02-25 (rev e821e4f) | Fetched |
| `ncbi-fasta` | [NCBI nucleotide FASTA guidance](https://www.ncbi.nlm.nih.gov/genbank/fastaformat/) | Page updated 2025-06-18; no universal FASTA standard exists | Fetched, not checksummed (dynamic page) |
| — | [SBOL](https://sbolstandard.org/datamodel-specification/) | 3.1.0, 2022-10-26 | Cite only (Dunceious does not use SBOL) |

## Reference practice and scoped contracts

Observed 2026-10-23 unless an update date or release is given. **Cite only** means that this
update stores no copy and adds no fetch/checksum entry. Live manuals and service responses are
observations, not frozen engine releases; a cohort release in [Tools](tools.md) does not date a
live manual. Existing standard pins remain unchanged. Unknown redistribution terms are not
permission to store a document.

| Document | Version or observation; scope | Copy |
|---|---|---|
| [Biopython FastaIO](https://biopython.org/docs/latest/api/Bio.SeqIO.FastaIO.html) | Opened page identifies 1.88; SimpleFastaParser, FastaIterator, FastaWriter | Cite only |
| [Biopython AlignIO](https://biopython.org/docs/1.88/api/Bio.AlignIO.html) | 1.88; equal-width aligned rows | Cite only |
| [Biopython SeqIO tutorial](https://biopython.org/docs/latest/Tutorial/chapter_seqio.html) | Opened page identifies 1.88; explicit format selection | Cite only |
| [Biopython Bio.Align](https://biopython.org/docs/1.88/api/Bio.Align.html) | 1.88; indices, inverse_indices, MultipleSeqAlignment and column count | Cite only |
| [Biopython Bio.SeqFeature](https://biopython.org/docs/1.88/api/Bio.SeqFeature.html) | 1.88; SeqFeature length, SimpleLocation bounds and CompoundLocation | Cite only |
| [Biopython sequence objects](https://biopython.org/docs/1.88/Tutorial/chapter_seq_objects.html) | 1.88; transcription and antiparallel coding/template strands | Cite only |
| [NCBI FASTA modifiers](https://www.ncbi.nlm.nih.gov/genbank/mods_fastadefline/) | Unversioned; General Format, Source Modifier List and new-submission deprecations effective 2025-01-01 | Cite only |
| [NCBI Sample GenBank Record](https://www.ncbi.nlm.nih.gov/genbank/samplerecord/) | Unversioned; Sequence Length, ACCESSION, FEATURES/source | Cite only |
| [NCBI GFF3 guidance](https://www.ncbi.nlm.nih.gov/datasets/docs/v2/reference-docs/file-formats/annotation-files/about-ncbi-gff3/) | Unversioned; SOFA/gbkey and type-specific Name attribute practice | Cite only |
| [NCBI Sequence Viewer custom tracks](https://www.ncbi.nlm.nih.gov/tools/sviewer/extdata/) | Updated 2024-04-04; URL autodetection and aligned FASTA | Cite only |
| [EMBOSS Sequence Formats](https://emboss.sourceforge.net/docs/themes/SequenceFormats.html) | Unversioned theme manual; input-format autodetection | Cite only |
| [EMBOSS Alignment Formats](https://emboss.sourceforge.net/docs/themes/AlignFormats.html) | Unversioned theme manual; Length, Identity, Similarity, Score, Gaps and format-dependent markup; not a 6.6 pin | Cite only |
| [EMBOSS needle](https://emboss.sourceforge.net/apps/release/6.6/emboss/apps/needle.html) | 6.6.0.0; affine gap cost and SRS pair output example | Cite only |
| [EMBOSS cons](https://emboss.sourceforge.net/apps/release/6.6/emboss/apps/cons.html) | 6.6.0.0; matrix/weight consensus, weighted positive-match plurality and defaults | Cite only |
| [EMBOSS matcher](https://emboss.sourceforge.net/apps/release/6.6/emboss/apps/matcher.html) | 6.6.0.0; pairwise top-scoring local alignments, Usage example 2 | Cite only |
| [EMBOSS showalign](https://emboss.sourceforge.net/apps/release/6.6/emboss/apps/showalign.html) | 6.6.0.0; selectable reference comparison and display options | Cite only |
| [AJAX ajalign.c source mirror](https://raw.githubusercontent.com/kimrutherford/EMBOSS/master/ajax/core/ajalign.c) | Header revision 1.132, 2012-07-02; private alignWriteSrsAny → alignConsStats/alignSim path. Exact release 6.6 provenance and default width 60 unknown | Cite only |
| [UCSC bedGraph](https://genome.ucsc.edu/goldenPath/help/bedgraph.html) | Unversioned; General Structure, Data Values and graph options | Cite only |
| [UCSC Track Database Definition](https://genome.ucsc.edu/goldenPath/help/trackDb/trackDbHub.v2.html) | v2; visibility dense, pack and full | Cite only |
| [IGV Data Tracks](https://igv.org/doc/desktop/FileFormats/DataTracks/) | Unversioned; extension routing, GFF2/GFF3 distinction | Cite only |
| [EMBL-EBI Job Dispatcher programmatic access](https://www.ebi.ac.uk/jdispatcher/docs/webservices/) | Unversioned; API workflow and valid-email fair-use policy | Cite only |
| [EMBL-EBI Bioinformatics FAQ](https://ebi-biows.gitdocs.ebi.ac.uk/documentation/faqs/bioinformatics/) | Unversioned; maximum MSA input table and synteny limitation; no comparative benchmark | Cite only |
| [Geneious Sequences](https://manual.geneious.com/en/latest/Sequences.html) | Live version unspecified; Creating new sequences / Using Meta-Data | Cite only |
| [Geneious Working with Annotations](https://manual.geneious.com/en/latest/Annotations.html) | Live version unspecified; Manual creation, configurable Extraction Context, Compare Annotations names/properties/intervals, table filters/export | Cite only |
| [Geneious SequenceListDocument API](https://assets.geneious.com/developer/geneious/javadoc/latest/com/biomatters/geneious/publicapi/documents/sequence/SequenceListDocument.html) | Live version unspecified; mixed nucleotide/protein list containers; getSequence states since 2025.0.0, which does not version the entire page | Cite only |
| [Roary manual](https://sanger-pathogens.github.io/Roary/) | Based on 3.11.2, 2018-01-22; gene_presence_absence.csv/.Rtab, length/presence summaries and query_pan_genome; same names can occur in separate clusters | Cite only |
| [bedtools intersect](https://bedtools.readthedocs.io/en/latest/content/tools/intersect.html) | Opened page identifies 2.31.0; default geometric intersection | Cite only |
| [Jalview consensus](https://www.jalview.org/help/html/calculations/consensus.html) | Live version unspecified; modal percentage, gaps and ties | Cite only |
| [Jalview conservation](https://www.jalview.org/help/html/calculations/conservation.html) | Live version unspecified; physicochemical protein-property index, citing Livingstone/Barton 1993 | Cite only |
| [INSDC geography vocabulary](https://www.insdc.org/submitting-standards/geo_loc_name-qualifier-vocabulary/) | Live undated; complete 280-name comparison differed only by straight/curly apostrophe in Cote d’Ivoire; observed snapshot, no new pin | Cite only |
| [INSDC Missing Value Reporting](https://www.insdc.org/technical-specifications/missing-value-reporting/) | Live undated; Usage restricts terms to missing mandatory fields, optional/recommended fields omitted, reporting-level missing: prefix | Cite only |
| [Edlib manual](https://martinsos.github.io/edlib/), [edlib.h API](https://martinsos.github.io/edlib/edlib_8h.html) | Generated documentation labelled 1.1.2; unit edit distance, NW/HW boundaries and paths | Cite only |
| [BLAST report, Boratyn et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC3692093/) | 2013-04-22, doi:10.1093/nar/gkt282; identity and query coverage around Figure 1 | Cite only |
| [NLM Support KA-03485](https://support.nlm.nih.gov/knowledgebase/article/KA-03485/en-us) | Unversioned; default 100/configurable Web BLAST cap and count dependencies | Cite only |
| [NCBI BLAST manual Appendices](https://www.ncbi.nlm.nih.gov/sites/books/NBK279684/) | Created 2008-06-23, updated 2021-03-14; Table C1 reporting caps, HSPs, culling, qcovs/qcovhsp | Cite only |

### EBI parameter observations

The official responses below were independently observed on 2026-10-23. They establish the
listed tool-specific submission values, not engine versions, full error/status contracts or
scientific output equivalence. No service job was submitted for this documentation update.
All are cite only; no XML response is stored in the repository.

| Service | Parameter documents |
|---|---|
| Clustal Omega | [outfmt](https://www.ebi.ac.uk/Tools/services/rest/clustalo/parameterdetails/outfmt), [stype](https://www.ebi.ac.uk/Tools/services/rest/clustalo/parameterdetails/stype), [order](https://www.ebi.ac.uk/Tools/services/rest/clustalo/parameterdetails/order) |
| MAFFT | [format](https://www.ebi.ac.uk/Tools/services/rest/mafft/parameterdetails/format), [stype](https://www.ebi.ac.uk/Tools/services/rest/mafft/parameterdetails/stype), [order](https://www.ebi.ac.uk/Tools/services/rest/mafft/parameterdetails/order) |
| Kalign | [format](https://www.ebi.ac.uk/Tools/services/rest/kalign/parameterdetails/format), [stype](https://www.ebi.ac.uk/Tools/services/rest/kalign/parameterdetails/stype) |
| MUSCLE | [format](https://www.ebi.ac.uk/Tools/services/rest/muscle/parameterdetails/format), [parameters](https://www.ebi.ac.uk/Tools/services/rest/muscle/parameters) |

EMBOSS's Alignment Formats manual defines alignment identity over gap-inclusive length. Its
Similarity section uses a ≥51% similar-residue criterion for multiple alignments and also says
all identities are included in similarity. Score derivation is delegated to the producing
algorithm, and markup meanings depend on the selected format. The
inspected private source instead counts identity and positive-score similarity independently
(alignConsStats positive match at source line 4448, counters at 4556–4559 and 4580–4584;
renderer calls at 1784/1795). Nonpositive diagonal comparisons expose the discrepancy; see
[METRIC-6b](metrics.md#metric-6b-positive-score-and-exclusive-substitution-counts). Neither
source establishes exhaustive release-6.6 runtime equivalence.

## Why only two documents are stored

A copy goes into the repository only when the document's own terms allow redistribution:

- **EMBL user manual:** may be "copied and redistributed freely, without advance permission,
  provided that this statement is" kept with it. The statement is at the top of the stored file.
- **Sequence Ontology:** CC BY 4.0, stated by the OBO Foundry registry and the ontology
  repository's LICENSE. Attribution is in [`sources/NOTICE.md`](sources/NOTICE.md).

The others are fetched instead:

- The INSDC Feature Table, GFF3, BED, SAM and VCF documents state no license.
- The NC-IUB and JCBN recommendations are IUBMB/IUPAC copyright.
- NCBI's public-domain policy covers material the US government created. gc.prt credits PIR
  for its initial data, so that policy does not clearly cover the whole file.
- The SBOL 3.1.0 PDF is CC BY 4.0 but is not needed.

None of this says that copying is forbidden. It says no permission was found, so the
repository pins and fetches instead.

## Updating a pin

When a newer version of a standard appears, read what changed, update the affected rules, then
update `sources.json` (version, URL, checksum) and this table in the same PR.
