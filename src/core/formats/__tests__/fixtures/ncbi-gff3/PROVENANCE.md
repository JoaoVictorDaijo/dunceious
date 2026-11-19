# NCBI GFF3 fixtures

Files written by NCBI annotwriter, retrieved on 2026-11-19 and stored unmodified. They are the
independent reference for GFF3 row order and origin-crossing rows.

| File | Accession | Source |
| --- | --- | --- |
| `NC_000866.4.gff3` | Escherichia phage T4, linear | `https://www.ncbi.nlm.nih.gov/sviewer/viewer.cgi?db=nuccore&report=gff3&id=NC_000866.4` |
| `NC_011045.1.gff3` | Escherichia phage 13a, linear | `https://www.ncbi.nlm.nih.gov/sviewer/viewer.cgi?db=nuccore&report=gff3&id=NC_011045.1` |
| `NC_001422.1.gff3` | Escherichia phage phiX174, circular | `https://www.ncbi.nlm.nih.gov/sviewer/viewer.cgi?db=nuccore&report=gff3&id=NC_001422.1` |
| `NC_000932.1.gff3` | Arabidopsis thaliana chloroplast, circular; holds the trans-spliced rps12 CDSs written with `part=N` | `https://www.ncbi.nlm.nih.gov/sviewer/viewer.cgi?db=nuccore&report=gff3&id=NC_000932.1` |
| `NC_001422.1.gb` | phiX174 GenBank record with sequence | `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=NC_001422.1&rettype=gbwithparts&retmode=text` |

The GenBank records for T4, 13a and the Arabidopsis chloroplast are the bundled examples in `examples/nucleotide/`.

SHA-256:

```
b821dc8e2dc998ef33f7e71cd2d64ec3e842596a399367a9075a9cee314913ac  NC_000932.1.gff3
41d9a06f16cca11cddf0ec68459c612fc4472616572c0beeef4e6e74411d7f3a  NC_000866.4.gff3
0a8099e207633f8c3ba998bfe2a198518e1de356c7956691101b2512324b807c  NC_001422.1.gb
587c143593fd8df4a5d3ebf1b3a499c2457cfb203f69e394d64f11ff7dbbdb4b  NC_001422.1.gff3
5bedf5b134361ce560fdfa49912708c078b0021f2132b1107401de2f3825cfce  NC_011045.1.gff3
```
