---
name: bench-check
description: Run the GenBank parse-time benchmark grid (npm run bench / plot) and interpret the results — exploratory time/memory data collection across sequence-length × record-count, not a pass/fail gate. Heavy; run deliberately. Separate from /perf-check.
disable-model-invocation: true
---

# bench-check

Exploratory benchmark of `parseGenBank` time & memory across a 2-D grid
(sequence length × number of records). **Data collection, not a gate** — it produces
JSON + SVG artifacts to inspect scaling; it does not pass or fail.

**Canonical source:** [`bench/README.md`](../../../bench/README.md).

> ⚠️ **Heavy, and separate from `/perf-check`.** A full grid spawns an isolated child
> process per grid cell × replicate, so it is slow. Run it deliberately, on its own —
> do not chain it with `/perf-check` (different tool, different question, both
> expensive).

## When to use

Before/after changes to the GenBank read path (`src/core/genbank/**`), or when you
want to *see how parse time and memory scale* with input size — not to assert a
budget (that is `/perf-check`).

## Run

```bash
npm run bench              # full grid, default record counts [1, 10, 30, 50]
npm run bench -- 1 10 100  # custom record counts
npm run plot               # re-render SVGs from an existing results file
```

Output (git-ignored): `bench/results/benchmark.json` and `bench/plots/*.svg`.

## Interpret

1. Read `bench/results/benchmark.json` — time/memory per `(seqLength, recordCount)` cell.
2. Look at **scaling**: parse time should grow ~linearly with total input bytes. Flag
   any superlinear knee or a memory cliff.
3. To compare against an earlier run, first copy the old `benchmark.json` aside — the
   file is overwritten on each run, so a baseline must be saved before re-running.
4. Summarize trends for the user; there is no pass/fail to report.

For the assertion-based regression guard on core algorithms, use `/perf-check`.
