# SARS-CoV-2 variant workspace

Three published SARS-CoV-2 variant genomes and a pre-computed alignment of them
against the bundled reference, `../sars-cov-2-NC_045512.gb`.

| File | What it is |
|------|------------|
| `variants.gb` | The three variant records in one GenBank file, exactly as NCBI returned them. |
| `aligned.fasta` | MAFFT's output, unedited: four rows of 29,903 columns. |
| `PROVENANCE.json` | Accessions and reasons, retrieval date, the MAFFT version, image digest and command, and SHA-256 checksums of every input and the output. |

Rebuild everything with [`../../scripts/build-sars-cov-2-variants.sh`](../../scripts/build-sars-cov-2-variants.sh).
Do not hand-edit `aligned.fasta`: it is the oracle the data tests check against
(`src/app/showroom/__tests__/variantData.test.ts`).

## The records and why each was chosen

Every record below is a complete genome with 11 `gene` and 12 `CDS` features
(55 features in all), carries **no ambiguity codes anywhere** — spike included —
and is a natural human isolate whose submitters claim no rights.

| Lineage | Accession | Isolate | Collected | Length | Lineage evidence |
|---------|-----------|---------|-----------|--------|------------------|
| Alpha (B.1.1.7) | [OL461693.1](https://www.ncbi.nlm.nih.gov/nuccore/OL461693.1) | `SARS-CoV-2/human/MEX/ZAC_1244/2021` | 2021-05-15, Mexico | 29,738 bp | The record's reference title: "The Alpha variant (B.1.1.7) of SARS-CoV-2 failed to become…". |
| Delta (B.1.617.2) | [OR279985.1](https://www.ncbi.nlm.nih.gov/nuccore/OR279985.1) | `SARS-CoV-2/human/FRA/IHUCOVID-016831/2021` | 2021-07, France | 29,689 bp | Explicit in the record: `/note="genotype: B.1.617.2"`. |
| Omicron (BA.1.1, a BA.1 sublineage) | [OR323867.1](https://www.ncbi.nlm.nih.gov/nuccore/OR323867.1) | `SARS-CoV-2/human/FRA/IHUCOVID-071401/2022` | 2022-03, France | 29,738 bp | Explicit in the record: `/note="genotype: BA.1.1"`. |

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
v7.520 using its default strategy (`--auto`, which selected FFT-NS-2 here) on
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
