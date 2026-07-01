# PR #41 — Independent PR-Review Ping-Pong Ledger

PR: https://github.com/JoaoVictorDaijo/dunceious/pull/41
Branch: test-phase2-pr2-appstate → main
Scope: Phase 2A PR2 — behavior-preserving app-state logic extraction

## Round 1 (5 fresh isolated reviewers: code, tests, silent-failure, types, comments)

Overall: the refactor itself is sound — 3 of 5 reviewers found **zero** behavior
issues; tsc/lint/build clean; tests mutation-sensitive. All findings below.

### Critical
- **C1 [comments]** `runInlineSearch.ts` seq-derivation comment is factually WRONG:
  it claims the `alignedSequence:''` divergence is "unreachable (FASTA-overlay
  validation rejects empty aligned sequences)". That validation does not exist —
  `applyFastaResponse` only checks *uniform* length (0 is uniform), and
  `parseFasta` emits empty records for bare headers → the state IS reachable via a
  degenerate all-empty-header overlay. → the exact-search divergence is a REAL
  (degenerate) reachable behavior change, not just a doc nit. **Needs decision.**

### Important
- **I1 [types]** `ExactSearchRecord` (exact.ts) duplicates the existing
  `SearchableRecord` (protocol.ts). Drop it, use `SearchableRecord` — zero-risk
  alias unification, removes a drift hazard. → FIX.
- **I2 [comments]** Stale JSDoc header on `runInlineSearch` "(1800ms fuzzy / 6000ms
  exact)" — exact is no longer time-budgeted. → FIX comment.

### Minor
- **m1 [silent-failure]** `removeFeature` now calls `addLog` unconditionally →
  spurious `Removed feature: undefined` on an (unreachable) no-match. Add
  `if (removedName !== undefined)` guard — restores original no-log-on-no-match. → FIX.
- **m2 [code]** dead `matchedIds` Set in `applyAnnotations` (pre-existing). → DROP.
- **m3 [comments]** exact.ts "byte-identical" overstated → scope to "matching loops". → FIX.
- **m4 [tests]** `applyAnnotations` name-tier lookup untested (rating 5). → ADD test.
- **m5 [tests]** intra-batch dedup (two colliding incoming records) untested (rating 4). → ADD test.
- **m6 [tests/low]** getSequenceContext non-aligned fallback; join few-vs-mixed hook glue. → optional.
- **m7 [types/defer]** isProtein-as-boolean, positional numbers, inline range shape,
  tri-state asAlignment — all pre-existing patterns; propose defer (behavior-preserving PR).

| Round | C | I | Minor | Status |
|-------|---|---|-------|--------|
| 1     | 1 | 2 | 7     | fixes queued; C1 behavior decision → human |

## Round 1 — decisions & fix plan
- **C1 (human decision): REJECT empty overlay upfront.** Add validation to
  `applyFastaResponse` so an all-empty aligned overlay is rejected (new
  `reject-empty` kind + hook error log). Makes `alignedSequence:''` unreachable
  for search → the exact-path divergence can no longer manifest (behavior-
  preserving for all reachable inputs); the runInlineSearch comment becomes true.
- FIX: I1 (drop ExactSearchRecord→SearchableRecord), I2+m3 (comment accuracy),
  m1 (removeFeature log guard), m2 (drop dead matchedIds), m4+m5 (name-tier +
  intra-batch dedup tests).
- PROPOSE DEFER (won't-fix this PR, human may override): m7 type minors
  (isProtein-boolean, positional-number ergonomics, inline range shape,
  tri-state asAlignment — all pre-existing codebase patterns); m6 low-value
  test notes. Rationale: pre-existing, out of scope for a behavior-preserving
  extraction; can be a separate cleanup.
