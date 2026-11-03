# Alignment

No standard defines alignment scoring. Each aligner documents its own defaults, and a
Dunceious result must name the tool and version whose defaults it reproduces.

## ALN-1. Local alignment scoring defaults

**Rule.** Dunceious local search reproduces EMBOSS 6.6.0 `water` (Smith-Waterman with Gotoh
affine gaps): EDNAFULL for nucleotides, EBLOSUM62 for proteins, gap open 10, gap extend 0.5,
where a gap of length n costs "gap opening penalty + (n - 1) * gap extension penalty"
([needle 6.6.0](https://emboss.sourceforge.net/apps/release/6.6/emboss/apps/needle.html), same
scoring as `water`).

**Other tools' defaults** (Documented, for comparison only; none is a standard):

| Tool | Command | Defaults |
|---|---|---|
| Biopython 1.88 | `PairwiseAligner` | match +1, mismatch 0, every gap −1, no matrix, global mode unless `mode="local"` |
| CLC Genomics Workbench 25.0.3 | Create Alignment (multiple alignment, not local search) | gap open 10, gap extend 1, cheap end gaps |
| Benchling | Alignments | MAFFT v7 "Auto"; numeric costs not documented |
| NCBI BLAST | per task | task-specific; command-line and web defaults differ |

**Dunceious.** Conforms: EMBOSS 6.6.0 defaults in `src/core/search/local/scoring.ts`, with gaps
stored in half-units (open 20, extend 1). Global multiple alignment is sent to the named EBI
services (Clustal Omega, MAFFT, MUSCLE) with their own defaults (`src/core/alignment/ebi.ts`).

The remote protocol is governed by [FMT-12](formats.md#fmt-12-dated-ebi-submission-and-result-contracts),
not these local scoring defaults. Service input caps, comparative claims and remote provenance
are separate requirements in [METRIC-8a](metrics.md#metric-8a-service-limits),
[METRIC-8b](metrics.md#metric-8b-comparative-alignment-claims) and
[METRIC-8c](metrics.md#metric-8c-remote-alignment-provenance). A service name does not pin an
engine release. For local result counts and score cutoffs, see
[OP-13](operations.md#op-13-ranking-and-merging-local-alignments) and
[METRIC-10d](metrics.md#metric-10d-local-search-count-ledger). These sources establish neither
runtime equivalence nor worker-schedule invariance for the current implementation.
