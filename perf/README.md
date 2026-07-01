# perf/ — Performance regression guardrails

Fast, assertion-based micro-benchmarks that guard against performance
regressions in core algorithms. Each file pins one source module and asserts
time/memory budgets — both absolute p95 ceilings and relative scaling
thresholds — via `perfUtils.bench()` (median/p95, GC-aware).
Console output only — no artifacts, not a CI gate.

| File | Covers |
| --- | --- |
| `searchLogic.perf.ts` | `services/searchLogic` — reverseComplement, smithWaterman, degenerateToRegex |
| `bioUtils.perf.ts` | `services/bioUtils` — translateSequence, sliceRecordsBySelection, exportToGenBank |
| `parseGenBank.perf.ts` | `services/genbank` — parseGenBank |
| `grid2d.perf.ts` | `src/domain/bio` — transposeCoordinates, buildAlignedSegments, processTransposition, clipSegments, calculateConsensus |

## Run

```bash
npm run perf
```

Runs with `--expose-gc` so memory assertions are meaningful. See
`perfUtils.ts` for the measurement methodology (why V8 memory numbers are
noisy and how the noise is reduced).
