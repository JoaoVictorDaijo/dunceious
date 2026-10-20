# Checkpoint differential harness

This harness compares the same wasm build with checkpoints enabled and disabled.
It uses the application's FASTA/GenBank parsers, reverse-complement alphabet rule,
and gap removal. It is outside CI. Run it from the repository root:

```sh
LOCAL_CHECKPOINT_CASES=/path/to/cases.json \
LOCAL_CHECKPOINT_SUMMARY=/path/to/summary.json \
rtk proxy node --expose-gc node_modules/.bin/vitest run \
  --config perf/vitest.config.ts perf/checkpointDifferential.perf.ts --maxWorkers=25%
```

The output directory must exist. The summary cannot overwrite the manifest or
an input file, including through a symlink or hard link. Existing summary files
can be replaced. Without `LOCAL_CHECKPOINT_CASES`, the configured-record test skips;
the synthetic self-tests still run. To exercise only the self-tests:

```sh
rtk proxy node --expose-gc node_modules/.bin/vitest run \
  --config perf/vitest.config.ts perf/checkpointDifferential.perf.ts --maxWorkers=25% -t synthetic
```

## Manifest

```json
{
  "cases": [
    {
      "id": "case-1",
      "moleculeType": "dna",
      "query": {
        "file": "/path/to/query.fa",
        "recordIndex": 0,
        "start": 0,
        "length": 96,
        "strand": 1
      },
      "target": {
        "file": "/path/to/targets.gb",
        "records": [0, 1]
      },
      "strands": "both",
      "maxAlignments": 128
    }
  ]
}
```

- `cases` is a nonempty array. IDs are unique identifiers containing letters,
  digits, dots, underscores or hyphens; they are printed verbatim.
- Files are absolute paths or paths relative to the manifest's directory. Format
  detection uses FASTA's `>` or GenBank/GenPept's `LOCUS` marker.
- `recordIndex` and `target.records` are zero-based parser record indices. The
  target list must be nonempty and contain no duplicates.
- Query `start` is zero-based in the source record's **forward, ungapped** sequence;
  `length` is positive. The selected range is then reverse-complemented for
  `strand: -1`, using the alphabet of the whole source record. Protein queries
  require `strand: 1`.
- `moleculeType` is `dna`, `rna` or `protein`. Scoring is chosen through the app's
  scoring selector: EDNAFULL for nucleotides, EBLOSUM62 for protein, doubled
  integer scores and gap open/extend 20/1.
- Target `strands` is `fwd`, `rev` or `both`. Protein always uses the forward
  stream, as the app does. Each target is oriented in its record's alphabet
  before gaps are removed.
- `maxAlignments` is a positive integer K. Each stream compares the ordered prefix
  of at most K positive alignments, stopping earlier only at exhaustion. This is
  a stated prefix comparison, not a claim about unenumerated alignments.

## Output and privacy

Each stdout JSON line contains only the case ID, record index/strand, `IDENTICAL`
or `DIFFER`, and each path's alignment count, SHA-256, wall time and diagnostics.
The summary JSON contains the same rows under `streams`.

Digests hash newline-delimited JSON arrays in this exact order:
`[score2, queryStart, queryEnd, recordStart, recordEnd, cigar]`. Coordinates are
zero-based, half-open in the oriented ungapped stream. Hashing includes alignment
order and ties. Sequence strings, record names/text and CIGARs are never printed
or written to the summary. Failures are redacted; the manifest's schema and
indices must be checked separately when an input fails validation.

Wall time includes enumeration, iterator cleanup and hashing; it excludes parsing,
module compilation and instantiation. Two module instances are reused across
streams to bound retained wasm high-water memory. Diagnostics are the per-engine
values documented in `wasm/local-align/README.md`: allocated step/bytes,
SmallPass calls, checkpoint resumes and last resumed column. A mismatch makes
the configured-record test fail after the summary is written.

The committed self-tests generate temporary synthetic FASTA and GenBank inputs,
verify forward/reverse digests independently, check redaction, invalid input and
input preservation through filesystem aliases,
and inject a digest-visible alignment difference to verify `DIFFER` reporting.

## Longer synthetic differential runs

The engine's CI differential property uses 32 deterministic seeds and compares
up to 128 alignments per stream. A longer run can select another seed count:

```sh
LOCAL_CHECKPOINT_SEEDS=512 rtk proxy npx vitest run \
  src/core/search/local/__tests__/checkpoints.test.ts --maxWorkers=25%
```
