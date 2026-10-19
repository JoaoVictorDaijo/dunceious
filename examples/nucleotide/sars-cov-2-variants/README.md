# SARS-CoV-2 variant workspace

Three published SARS-CoV-2 variant genomes and a pre-computed alignment of them
against the bundled reference, `../coronaviruses/sars-cov-2-NC_045512.gb`.

| File | What it is |
|------|------------|
| `variants.gb` | The three variant records in one GenBank file, exactly as NCBI returned them. |
| `aligned.fasta` | MAFFT's output, unedited: four rows of 29,903 columns. |
| `PROVENANCE.json` | Accessions and reasons, retrieval date, the MAFFT version, image digest and command, and SHA-256 checksums of every input and the output. |

Rebuild everything with [`../../../scripts/build-sars-cov-2-variants.sh`](../../../scripts/build-sars-cov-2-variants.sh).
Do not hand-edit `aligned.fasta`: it is the oracle the data tests check against
(`src/app/__tests__/bundledAlignments.test.ts`).

## The records and why each was chosen

Every record below is a complete genome with 11 `gene` and 12 `CDS` features
(55 features in all), carries **no ambiguity codes anywhere** — spike included —
and is a natural human isolate whose submitters claim no rights.

| Lineage | Accession | Isolate | Collected | Length | Lineage evidence |
|---------|-----------|---------|-----------|--------|------------------|
| Alpha (B.1.1.7) | [OL461693.1](https://www.ncbi.nlm.nih.gov/nuccore/OL461693.1) | `SARS-CoV-2/human/MEX/ZAC_1244/2021` | 2021-05-15, Mexico | 29,738 bp | **No lineage field in the record**; it carries the full set of B.1.1.7-defining changes (below). |
| Delta (B.1.617.2) | [OR279985.1](https://www.ncbi.nlm.nih.gov/nuccore/OR279985.1) | `SARS-CoV-2/human/FRA/IHUCOVID-016831/2021` | 2021-07, France | 29,689 bp | Explicit in the record: `/note="genotype: B.1.617.2"`. |
| Omicron (BA.1.1, a BA.1 sublineage) | [OR323867.1](https://www.ncbi.nlm.nih.gov/nuccore/OR323867.1) | `SARS-CoV-2/human/FRA/IHUCOVID-071401/2022` | 2022-03, France | 29,738 bp | Explicit in the record: `/note="genotype: BA.1.1"`. |

**On the Alpha record.** Unlike the other two, OL461693 states no Pango lineage:
it has no `genotype` note and no lineage in its strain name, and its only
mention of B.1.1.7 is the title of reference 1 ("The Alpha variant (B.1.1.7) of
SARS-CoV-2 failed to become dominant in Mexico") — a study of Mexican genomes of
many lineages, which assigns nothing to this record. The Alpha label therefore
rests on the sequence itself: every one of the 17 lineage-defining nucleotide
changes in Table 1 of [Rambaut et al. 2020](https://virological.org/t/563),
*Preliminary genomic characterisation of an emergent SARS-CoV-2 lineage in the UK
defined by a novel set of spike mutations*, is present in this record. Checked at
the table's NC_045512.2 coordinates in `aligned.fasta` (the reference row is
ungapped, so a reference position is that alignment column):

| Gene | Change | Gene | Change |
|------|--------|------|--------|
| ORF1ab | C3267T, C5388A, T6954C, 11288-11296 del | spike | 21765-21770 del, 21991-21993 del, A23063T, C23271A |
| spike | C23604A, C23709T, T24506G, G24914C | ORF8 | C27972T, G28048T, A28111G |
| N | 28280 `GAT`→`CTA`, C28977T | | |

A subset covering both kinds of change — substitutions and the spike deletions —
is asserted against `aligned.fasta` in
`src/app/__tests__/bundledAlignments.test.ts`. **What was not verified:** no
Pango assignment tool (pangolin, UShER) was run on the record, and the
amino-acid consequences the table names (N501Y, P681H, ORF8 Q27stop and the
rest) were not re-derived here from a translation — only the nucleotide states
were checked.

**On the Omicron record.** It is designated **BA.1.1**, a sublineage of BA.1,
not plain BA.1. Every candidate designated bare BA.1 carried at least one
ambiguity code, so an ambiguity-free BA.1 sublineage was preferred over an
ambiguity-carrying bare BA.1. Engineered constructs — for example reporter
clones carrying `nLuc` — were excluded; only natural isolates were considered.

## Record IDs

Dunceious's GenBank parser takes a record's ID from its `LOCUS` name, so the
records load as `NC_045512`, `OL461693`, `OR279985` and `OR323867` — without
version suffixes. The FASTA headers in `aligned.fasta` use exactly those IDs,
because the alignment overlay matches on them and does not strip suffixes.

## Alignment

Computed once, offline, with [MAFFT](https://mafft.cbrc.jp/alignment/software/)
v7.520 using its default strategy (`--auto`, which selected FFT-NS-2 for this
run — the strategy MAFFT reported is recorded as `mafft.strategy` in
`PROVENANCE.json`) on
the four genomes as they appear in their GenBank records — no trimming, masking
or manual adjustment. The residues fed to MAFFT are uppercase, and
`--preservecase` keeps them that way, so each row's ungapped residues match the
parsed GenBank sequence character for character. MAFFT ran in a container image
pinned by digest; `PROVENANCE.json` records the image, its digest, the exact
command and the checksums.

## Licence

These are INSDC GenBank records retrieved from NCBI. NCBI places no
restrictions on the use or distribution of GenBank data, but notes that some
submitters may claim patent, copyright or other rights ([NCBI usage
policy](https://www.ncbi.nlm.nih.gov/home/about/policies/)); each record above
was checked and none carries such a claim. **No GISAID data is used or
redistributed** — GISAID's terms forbid redistribution.
