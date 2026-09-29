# Phase C (PRs #52–#57) — end-of-phase independent review loop

**Stack:** #52 C1 (merged) · #53 C2 · #54 C3 · #55 C4 · #56 C5 · #57 C6 — stacked, each PR → previous branch.
**Mechanism:** single end-of-phase tailored adversarial Workflow over the cumulative C2–C6 diff (`develop...arch/phaseC-pr6-normalize-entry`), per the stacked-PR flow (build all, review once at the end).
**Lenses:** behavior-preservation · layer-invariant · stragglers · test-integrity · coverage-honesty · build/worker-wiring · completeness-critic
**Verify:** 3 diverse skeptics per finding (reproduce / compare-to-develop / impact); CONFIRMED only if ≥2 of 3 fail to refute.

| Round | Raw | Confirmed | Fixed | Won't-fix | Survived |
|-------|-----|-----------|-------|-----------|----------|
| 1 | 3 | 1 (Minor) | 1 | 0 | 0 |

## Round 1 — details (workflow `wf_ebc95d4f-eac`; behavior + critic lenses re-run standalone after a transient API error)

**All 7 lenses CLEAN except one Minor test-coverage finding:**

- **behavior-preservation** — ✅ CLEAN. Every relocated production body byte-identical to develop modulo import lines (exportToGenBank/Fasta/Gff, query/align, fuzzy, exact, colors, download, handleBioMessage→bio, runSearch→search, slicing→intervals). The one authorized type-level change (local `Interval`→structurally-identical `FeatureSegment`; inline `import('../types')`→module import) is runtime-neutral. `detectMoleculeType` re-point is neutral (develop's moleculeType.ts was itself a re-export of the same fn).
- **layer-invariant** — ✅ CLEAN. `grep workers/protocol src/core/` = 0; no core→workers/app; domain is a leaf.
- **stragglers** — ✅ CLEAN. services/ · types.ts · index.tsx · index.css · bioUtils.ts · moleculeType shim all gone; new URL() sites point at *.worker.ts; index.html → /src/app/main.tsx.
- **test-integrity** — ⚠️ **1 CONFIRMED (Minor)**, rest clean. All moved test blocks byte-identical; AGPL headers on all 6 new files (111/111). The 31-test drop reconciled: moleculeType(10) + searchLogic-primitives(18) + getOriginalPos(3), each redundant EXCEPT **`mapUngappedRangeToAligned`**: the deleted searchLogic.test.ts block had 6 cases; the domain sequence.test.ts block had only 3 (empty/mid-range/high-clamp) — the **negative-start clamp, single-element map, and degenerate/inverted-range floor** (both defensive branches in `sequence.ts`) were untested anywhere. Mutation-verified: breaking the floor branch passed HEAD's full suite but failed develop's. **No runtime change** (impl untouched) — pure regression-safety loss.
- **coverage-honesty** — ✅ CLEAN. include evolved +src/core (C1) +workers/handlers (C4) −services (C6); thresholds 94/86/93/92 → 95/87/94/93 (raised or equal, never lowered); the branch dip from colors/download leaving the measured set is absorbed by buffer.
- **build/worker-wiring** — ✅ CLEAN. build=0; dist emits bio.worker-*.js + search.worker-*.js; entry + css resolve.
- **completeness-critic** — ✅ CLEAN. No leftover shim; barrels export everything consumed; SearchableRecord domain-relocation + protocol re-export resolve; translationHelpers relocation additive (reverse-strand/circular); perf/bench resolve.

### Fix (at source — C3 / #54, commit `1a98877`)
Ported the 3 missing `mapUngappedRangeToAligned` edge-case scenarios into `src/domain/bio/__tests__/sequence.test.ts` (expected values recomputed for the domain block's map `[0,2,4,5,6,7]`), making C3's "redundantly covered" claim honest. The stack (C4→C6) was rebased onto the updated C3 and force-pushed; bases unchanged, all PRs still stacked. Tip green: tc/lint/hdr/build/gate = 0, **509 tests** (506+3).

**Outcome:** No Critical/Important ever found; the single Minor finding is fixed at its source. Phase C ready for maintainer bottom-up merge (#53 → #54 → #55 → #56 → #57).

### C1 (#52) — reviewed clean separately (52-loop.md), already merged.
