# Example sequences

Sample GenBank files for exploring Dunceious. Load any of them through the
file picker in the sidebar (**Upload**), which accepts `.gb`, `.genbank`,
`.fasta`, and `.fa`.

Each file is an [NCBI RefSeq](https://www.ncbi.nlm.nih.gov/refseq/) record.
RefSeq entries are produced by the U.S. National Center for Biotechnology
Information and are **not subject to copyright** ([NCBI usage
policy](https://www.ncbi.nlm.nih.gov/home/about/policies/)), so they can be
redistributed freely.

| File | Accession | Size | Highlights |
|------|-----------|------|------------|
| `arabidopsis-chloroplast-NC_000932.gb` | [NC_000932](https://www.ncbi.nlm.nih.gov/nuccore/NC_000932.1) | 154,478 bp, circular | 259 annotations (gene, CDS, tRNA, rRNA); both strands; spliced/multi-exon `join()` glyphs including a trans-spliced gene. The richest single-record showcase. |
| `sars-cov-2-NC_045512.gb` | [NC_045512](https://www.ncbi.nlm.nih.gov/nuccore/NC_045512.2) | 29,903 bp, ss-RNA | CDS, 26 mat_peptides, 5 stem_loops; the ORF1ab `-1` ribosomal-frameshift `join`. Exercises the RNA molecule-type path. |
| `influenza-a-pr8-8segments.gb` | [NC_002016–NC_002023](https://www.ncbi.nlm.nih.gov/nuccore/NC_002023.1) | 8 records, ~14 kb | Eight segments in one file — demonstrates the Database Hub's multi-sequence list. Includes spliced (`join`) CDS for M2/NS2. |
| `human-mitochondrion-NC_012920.gb` | [NC_012920](https://www.ncbi.nlm.nih.gov/nuccore/NC_012920.1) | 16,569 bp, circular | The Cambridge Reference Sequence — 37 densely packed genes (13 CDS, 22 tRNA, 2 rRNA) plus the D-loop. |

> **Genetic codes:** Dunceious honours each CDS's `/transl_table`, so the
> vertebrate-mitochondrial file
> ([table 2](https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi#SG2) —
> TGA = Trp, ATA = Met) translates cleanly with no spurious early-stop markers,
> as do the standard-code files. Alternative start codons are shown as their
> literal residue rather than forced to Met.
