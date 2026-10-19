# Example sequences

Sample GenBank files for exploring Dunceious. Load any of them through the
file picker in the sidebar (**Upload**), which accepts `.gb`, `.genbank`,
`.fasta`, and `.fa`.

Each file is an [NCBI RefSeq](https://www.ncbi.nlm.nih.gov/refseq/) record.
RefSeq entries are produced by the U.S. National Center for Biotechnology
Information and are **not subject to copyright** ([NCBI usage
policy](https://www.ncbi.nlm.nih.gov/home/about/policies/)), so they can be
redistributed freely.

> **Session type:** a workspace holds **one** molecule type at a time — either
> **nucleotide** (DNA/RNA) or **peptide** (protein). Dunceious infers the type
> from the file (a GenBank `LOCUS` line's units, or a FASTA's residue alphabet)
> and refuses to mix the two; clear all records to switch types. The files are
> split into `nucleotide/` and `peptide/` folders to match.

## Layout

```text
examples/
├── nucleotide/
│   ├── arabidopsis-chloroplast-NC_000932.gb
│   ├── human-mitochondrion-NC_012920.gb
│   ├── influenza-a-pr8-8segments.gb
│   ├── coronaviruses/      # aligned set
│   ├── sars-cov-2-variants/ # aligned set, with its alignment
│   ├── t4-phages/          # aligned set
│   └── t7-phages/          # aligned set, with its alignment
└── peptide/
    ├── human-insulin-NP_000198.gb
    ├── sars-cov-2-orf1ab-polyprotein-YP_009724389.gb
    └── pomc-orthologs/     # aligned set
```

A **set** is a sub-folder of three related records meant to be loaded
together and aligned (**Align sequences** in the sidebar's **Alignment** section). Each set is chosen so the
alignment makes biological sense — close relatives with conserved blocks and
divergent regions — and each carries its own rendering challenge. Every file
here is pinned by a test (`src/core/__tests__/exampleSets.e2e.test.ts`,
`examples.e2e.test.ts`, `examples.protein.e2e.test.ts`), and a manifest test
fails if a file is added, moved or removed without updating
`src/core/__tests__/fixtures/examples.ts`.

## Nucleotide sets

### `nucleotide/t7-phages/` — frameshifts in both directions

| File | Accession | Size | Highlights |
|------|-----------|------|------------|
| `phage-t7-NC_001604.gb` | [NC_001604](https://www.ncbi.nlm.nih.gov/nuccore/NC_001604.1) | 39,937 bp | A `+1` frameshift (`join(1636..1794,1796..1972)`) and two `−1` frameshifts, including the gene 10A/10B capsid `join(22967..23989,23989..24162)`; 26 `regulatory`, 10 `misc_structure`, 5 `mRNA`. |
| `phage-13a-NC_011045.gb` | [NC_011045](https://www.ncbi.nlm.nih.gov/nuccore/NC_011045.1) | 38,841 bp | T7's closest relative here. Its DNA polymerase is split by a 601-nt intron — a `join` that is *not* a frameshift. |
| `phage-t3-NC_003298.gb` | [NC_003298](https://www.ncbi.nlm.nih.gov/nuccore/NC_003298.1) | 38,208 bp | The same `−1` capsid frameshift as T7, and 10 `stem_loop` features. More divergent from T7 than 13a. |
| `aligned.fasta` | — | 3 rows | A MAFFT alignment of the three. Load the three genomes as sequences, then `aligned.fasta` as an alignment. Counting matching bases over the columns where both rows have a base, T7 and 13a are 92.8% identical and T7 and T3 77.1%. |

This set is the phone test drive's sample, and the greeter's genome is T7.
`PROVENANCE.json` records why each genome was chosen, the pinned MAFFT image and
command, and checksums; `scripts/build-t7-phages-alignment.sh` rebuilds it.

### `nucleotide/t4-phages/` — size, introns and a bypass

| File | Accession | Size | Highlights |
|------|-----------|------|------------|
| `phage-t4-NC_000866.gb` | [NC_000866](https://www.ncbi.nlm.nih.gov/nuccore/NC_000866.4) | 168,903 bp | 591 features. Three reverse-strand self-splicing introns (`td`, `nrdB`, `nrdD`) whose `intron` features fill their CDS `join` gaps, and gene 60's 50-nt translational bypass — a gap with no intron. 8 tRNA. |
| `phage-t6-NC_054907.gb` | [NC_054907](https://www.ncbi.nlm.nih.gov/nuccore/NC_054907.1) | 168,697 bp | T4's closest relative here; 265 CDS, 7 tRNA. |
| `phage-kha5h-NC_054905.gb` | [NC_054905](https://www.ncbi.nlm.nih.gov/nuccore/NC_054905.1) | 167,318 bp | The most varied feature vocabulary: `regulatory`, `repeat_region`, `misc_recomb`, `ncRNA`, `stem_loop`, 10 tRNA. |

The three genomes together are a ~0.5 MB alignment payload — inside MAFFT's
limit, and the heaviest load among the examples.

### `nucleotide/coronaviruses/` — RNA genomes

| File | Accession | Size | Highlights |
|------|-----------|------|------------|
| `sars-cov-2-NC_045512.gb` | [NC_045512](https://www.ncbi.nlm.nih.gov/nuccore/NC_045512.2) | 29,903 bp, ss-RNA | 26 `mat_peptide`s, 5 `stem_loop`s, and the ORF1ab `−1` frameshift `join`. |
| `sars-cov-NC_004718.gb` | [NC_004718](https://www.ncbi.nlm.nih.gov/nuccore/NC_004718.3) | 29,751 bp, RNA | The same ORF1ab frameshift and `mat_peptide` tiling. |
| `mers-cov-NC_019843.gb` | [NC_019843](https://www.ncbi.nlm.nih.gov/nuccore/NC_019843.3) | 30,119 bp, RNA | The most divergent of the three; same ORF1ab frameshift architecture. |

All three exercise the RNA molecule-type path. In each, the polymerase
`mat_peptide` shares its slip base with the ORF1ab polyprotein.

### `nucleotide/sars-cov-2-variants/` — variants of one species, pre-aligned

| File | Accession | Size | Highlights |
|------|-----------|------|------------|
| `variants.gb` | [OL461693](https://www.ncbi.nlm.nih.gov/nuccore/OL461693.1), [OR279985](https://www.ncbi.nlm.nih.gov/nuccore/OR279985.1), [OR323867](https://www.ncbi.nlm.nih.gov/nuccore/OR323867.1) | 3 records, ~29.7 kb each | Alpha (B.1.1.7), Delta (B.1.617.2) and Omicron (BA.1.1, a BA.1 sublineage) in one file. |
| `aligned.fasta` | — | 4 rows | A MAFFT alignment of the three against `coronaviruses/sars-cov-2-NC_045512.gb`. Load `variants.gb` and the reference as sequences, then `aligned.fasta` as an alignment. |

Where the other sets differ between species, this one differs by point
mutations and short deletions within one. See its
[README](nucleotide/sars-cov-2-variants/README.md) and `PROVENANCE.json`.

## Nucleotide single records

| File | Accession | Size | Highlights |
|------|-----------|------|------------|
| `arabidopsis-chloroplast-NC_000932.gb` | [NC_000932](https://www.ncbi.nlm.nih.gov/nuccore/NC_000932.1) | 154,478 bp, circular | 259 annotations (gene, CDS, tRNA, rRNA); both strands; spliced/multi-exon `join()` glyphs including the trans-spliced `rps12`. The only circular genome here. |
| `influenza-a-pr8-8segments.gb` | [NC_002016–NC_002023](https://www.ncbi.nlm.nih.gov/nuccore/NC_002023.1) | 8 records, ~14 kb | Eight segments in **one file** — demonstrates the Database Hub's multi-sequence list. Includes spliced (`join`) CDS for M2/NS2. |
| `human-mitochondrion-NC_012920.gb` | [NC_012920](https://www.ncbi.nlm.nih.gov/nuccore/NC_012920.1) | 16,569 bp, circular | The Cambridge Reference Sequence — 37 densely packed genes (13 CDS, 22 tRNA, 2 rRNA) plus the D-loop, on a non-standard genetic code. |

> **Genetic codes:** Dunceious honours each CDS's `/transl_table`, so the
> vertebrate-mitochondrial file
> ([table 2](https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi#SG2) —
> TGA = Trp, ATA = Met) translates cleanly with no spurious early-stop markers,
> as do the standard- and bacterial-code files. Alternative start codons are
> shown as their literal residue rather than forced to Met.

## Peptide

These are [GenPept](https://www.ncbi.nlm.nih.gov/protein/) records — the same
flat-file format keyed by amino-acid (`aa`) coordinates. They exercise the
peptide session: the protein feature vocabulary (`Protein`, `Region`, `Site`,
`sig_peptide`, `proprotein`, `mat_peptide`) and `order(...)` discontiguous-residue
locations. Translation and reverse-strand search do not apply to a peptide
session.

### `peptide/pomc-orthologs/` — nested cleavage products

| File | Accession | Size | Highlights |
|------|-----------|------|------------|
| `human-pomc-NP_000930.gb` | [NP_000930](https://www.ncbi.nlm.nih.gov/protein/NP_000930.1) | 267 aa | Pro-opiomelanocortin: a signal peptide and 11 `mat_peptide`s that nest — ACTH contains α-MSH, β-lipotropin contains β-endorphin. |
| `mouse-pomc-NP_032921.gb` | [NP_032921](https://www.ncbi.nlm.nih.gov/protein/NP_032921.1) | 235 aa | The mouse ortholog; 10 `mat_peptide`s. |
| `cow-pomc-NP_776576.gb` | [NP_776576](https://www.ncbi.nlm.nih.gov/protein/NP_776576.1) | 265 aa | The bovine ortholog; 5 `mat_peptide`s. |

### Peptide single records

| File | Accession | Size | Highlights |
|------|-----------|------|------------|
| `sars-cov-2-orf1ab-polyprotein-YP_009724389.gb` | [YP_009724389](https://www.ncbi.nlm.nih.gov/protein/YP_009724389.1) | 7,096 aa | The richest peptide record: 95 features — 15 `mat_peptide` cleavage products tiling the polyprotein, 36 `Region`, 41 `Site`. Sites use `order(...)` locations, 18 of which wrap across continuation lines. |
| `human-insulin-NP_000198.gb` | [NP_000198](https://www.ncbi.nlm.nih.gov/protein/NP_000198.1) | 110 aa | The textbook processing cascade in one compact record: `sig_peptide` → `proprotein` → three `mat_peptide` chains (B chain, C-peptide, A chain). |
