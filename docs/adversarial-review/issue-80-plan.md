# IAR loop ledger — issue #80 plan review (pre-implementation)

Reviewed the spec + plan **before** any code was written. Mechanism: self-authored
Workflow, 3 fresh-context reviewers (Opus, xhigh). Lenses: executability,
correctness-edges, test-quality.
Transcripts: `~/.claude/projects/-home-mainframe-dunceious/.../subagents/workflows/wf_396bd884-c57/`

Reviewers mutation-tested the plan against scratch copies of `Row.tsx` — several
findings are backed by "I applied this mutation and all 639 tests stayed green".

## Round 1

13 raw findings → 10 distinct (the count-only-assertion defect was found independently by two lenses).

| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | `f.start > f.end` is not a complete origin-crossing signal — `parseLocation` sets it only when `minStart === 0`, so a feature crossing the origin inside an intron gets a linear envelope and would render one line across ~92% of the genome, where today's code is correct | Important | fixed — gate widened to `(f.start > f.end \|\| s1.end >= seq.length)` |
| 2 | Tests assert connector **counts** only; dropping `Math.min`/`Math.max` entirely leaves all tests green | Important | fixed — assert `x1`/`x2` (bp 30→70 = `240`/`560`) |
| 3 | The `&& s1.end > s2.start` conjunct is untested; mutating the gate to `f.start > f.end` passes everything | Important | fixed — Task 3 adds a 3-segment circular feature (3 connectors; mutation gives 4) |
| 4 | Task 1 Step 4 wrongly claimed the pre-existing origin-spanning test guards the gate — it draws 2 connectors before *and* after, so it guards nothing | Important | fixed — relabelled as a no-regression check; Task 3 is the guard |
| 5 | Task 2's fixture overlaps by one base, never exactly abuts, so it cannot distinguish `gapEnd > gapStart` from `>=`; the behaviour change for abutting ascending pairs was unrecorded | Important | fixed — `it.each` covers both; change recorded in spec |
| 6 | Task 3's verification script re-implements the branch rule instead of reading `Row.tsx`, so its "stop, the implementation is wrong" condition is unreachable — proven by mutating the gate and getting identical output | Important | fixed — relabelled a parser/arithmetic check; unit tests are the implementation check |
| 7 | Plan claimed `firstSeg`/`lastSeg` are load-bearing; both are dead bindings that eslint already flags | Minor | fixed — Task 5 deletes them |
| 8 | Spec said rps12 CDS copy 1 draws one line; it has 3 segments and draws two overlapping ones | Minor | fixed — Behaviour table corrected |
| 9 | Inside a wrapping-envelope feature every non-ascending pair takes the wrap branch, not only the crossing one | Minor | documented in Out of scope — no shipped record exhibits it |
| 10 | Comment restated the mechanics of `Math.min`/`Math.max`; trailing comment on a logic line | Minor | fixed — comment carries only the why |

**Delta line — Round 1: 10 distinct (0 Critical, 6 Important, 4 Minor); 9 fixed, 1 documented as a known limit; 0 Critical/Important surviving; baseline round; 3 reviewer-runs.**

Finding 1 changed the design, not just the plan: the original gate would have
traded the bug for a different one. Verified across every shipped example plus the
synthetic `join(5800..6000,50..300)` before revising.

**Status: CONVERGED** — proceeding to implementation.
