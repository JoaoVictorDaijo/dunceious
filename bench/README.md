# bench/ — GenBank parse-time data-collection grid

An exploratory benchmark that measures `parseGenBank` time/memory across a 2-D
grid of inputs (sequence length × number of records), then renders SVG plots.
Unlike `perf/`, this is a data-collection/analysis tool, not a pass/fail gate —
it is slow (spawns an isolated child process per grid cell × replicate
(≈ seqLengths × recordCounts × replicates total)) and produces artifacts.

| File | Role |
| --- | --- |
| `genbank.grid.bench.ts` | Grid orchestrator (spawns replicates, writes JSON, triggers plots) |
| `measureGenBank.ts` | Child-process measurement helper |
| `syntheticGenbank.ts` | Deterministic synthetic GenBank generator |
| `visualize.mjs` | Renders SVG charts/tables from the JSON |
| `runBench.mjs` | CLI wrapper (`npm run bench`) |
| `vitest.config.ts` | Vitest config (`include: bench/**/*.grid.bench.ts`) |

## Run

```bash
npm run bench            # full grid, default record counts [1, 10, 30, 50]
npm run bench -- 1 10 100   # custom record counts
npm run plot             # regenerate SVGs from an existing results file
```

Output (git-ignored) goes to `bench/results/benchmark.json` and
`bench/plots/*.svg`.
