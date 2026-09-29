---
name: perf-check
description: Run the assertion-based performance regression guard (npm run perf) on core algorithms and interpret pass/fail against pinned p95 + scaling budgets. GC-aware, console-only, not a CI gate. Heavy; run deliberately. Separate from /bench-check.
disable-model-invocation: true
---

# perf-check

Assertion-based micro-benchmarks that guard core algorithms against performance
regressions. Each file pins one module and asserts **time/memory budgets** — both
absolute p95 ceilings and relative scaling thresholds. **Pass/fail**, console-only,
GC-aware. Not wired into CI — run it locally.

**Canonical source:** [`perf/README.md`](../../../perf/README.md).

> ⚠️ **Heavy, and separate from `/bench-check`.** This runs the full perf suite under
> `--expose-gc`. Run it deliberately, on its own — do not chain it with `/bench-check`
> (that is exploratory data collection; this is a pass/fail guard).

## When to use

After changes to core search/bio/genbank algorithms or the domain grid math —
`reverseComplement`, `smithWaterman`, `degenerateToRegex`, `translateSequence`,
`parseGenBank`, or the `src/domain/bio` grid transforms — to confirm no regression.

## Run

```bash
npm run perf
```

## Interpret

1. **All pass** → within budget, nothing to report.
2. **A budget trips** → note whether it is an **absolute p95 ceiling** or a **relative
   scaling** assertion, and which module tripped it.
3. **Rule out noise first.** V8 time/memory numbers are noisy; `perf/perfUtils.ts`
   documents the methodology. Re-run before treating a single failure as a real
   regression.
4. **If a budget legitimately must change** (an intentional trade-off), that is a
   deliberate edit to the assertion with a stated reason — treat it like the coverage
   ratchet: loosen only with justification.

For exploratory parse-time scaling (not pass/fail), use `/bench-check`.
