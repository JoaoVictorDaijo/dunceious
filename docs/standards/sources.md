# Sources

The standards behind every rule in this folder, pinned to the version the rules were written
against. [`sources.json`](sources.json) holds the same list with download URLs and SHA-256
checksums. Run `npm run standards:fetch` to download the pinned copies into `.cache/standards/`
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
