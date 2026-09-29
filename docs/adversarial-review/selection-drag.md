# Selection drag — IAR ledger (PR #90)

## Run configuration

- Owner authorized IAR and merge into develop after convergence; no production promotion.
- Skill: moveusp-standards 2.21.0; SKILL.md SHA-256 `812f77281baf7ba1d407095f5de4cae1fdaa27791d0bf224c5e4c5a944341c7d`.
- Codex adapter. Tool allowlist and write boundaries are enforced by agent compliance. Actual spawn argument bytes cannot be compared by host API; full assembled assignments retained, dispatch capture is not asserted byte-identical.
- Model policy for every seat: Sol family, `gpt-6-sol`, effort `high`; maximum three workers concurrently. No extra lens or tier deviation.
- Base: `7cc211c49d064cdbfb0b823f954d051d5df5c642`; R1: `252d6bad134ad262f11e17bba2a6b024d12710b2`; complete overlay `[]`.
- Owned scratch: `/tmp/iar-dunceious-selection-xjVlSc`. Retain until owner authorizes cleanup. Prior repository run manifest search found no older candidates; unrelated inaccessible /tmp directories were left untouched.

## Round 1 — full

| Finder | Trigger | Result |
|---|---|---|
| code-reviewer | always | complete; no findings |
| test-analyzer | new test file | C-1 |
| comment-analyzer | changed comments | complete; no findings |
| behavior-preservation | extracted pan body | complete; no findings |
| straggler-references | moved callbacks | complete; no findings |
| type-design-analyzer | interval construction and anonymous harness shape | complete; no findings |

All six canonical response artifacts and SHA-256 receipts passed envelope validation.
Stage 1 checked every quoted location and repeated the named searches. No duplicate folds or Minors. One refuter batch contains the only cluster, C-1, on the vertical-pan call path. Refuter confirmed the Important test gap with a saved mutation, no overcorrection and no pending routes. Kill distribution: none.

| Finding | Severity | Location | What it does | Why it matters | Action | Test |
|---|---|---|---|---|---|---|
| C-1: vertical pan has no behavioral regression test | Important | `src/app/viewer/__tests__/useSelectionDrag.test.tsx:163`, F1.1 `0e8bba5` (original harness: line 47 in R1 `252d6ba`) | Removing the extracted vertical scroll call leaves the old hook suite green | A reachable regression could disable drag navigation between records | auto-fix, completed: add a real VariableSizeList integration test; production remains unchanged | Same saved no-op mutation: old suite 12/12 passes; new suite fails both vertical cases. Clean new suite 14/14 passes; restored full suite 658/658 passes. |

The proposed action was published before editing. No severity downgrade or won't-fix decision. This is a coverage gap, not a demonstrated current production defect. Baseline focused suite: 12 pass; baseline full suite: 656 pass. The no-op vertical-pan mutation leaves the old focused suite at 12 pass in both finder and refuter probes.

## Fix verification and convergence

- F1.1: `0e8bba5e8587d365539d65c892755e262faff5d2`, compared with R1 in separate private checkouts, both complete overlays `[]` before probes and after restoration.
- Fresh fix-diff reviewer returned `sound`, complete, with no new defects. Accepted canonical response SHA-256: `3097940a82e4cf4180ee0d8bb8e804c9651151acdb6956f86c77a05e7f3941a2`.
- Mutation SHA-256: `b0a51a1e0dd1db72dc456096fabf93bb91bce0ae95b31c765ffc35cb24b808ca`. Replacing vertical `scrollTo` with a no-op leaves `scrollTop` at 200; both new assertions detect the missing moves to 170 and 230. Mouseup also stops subsequent movement.
- Canonical response and captured probes: `/tmp/iar-dunceious-selection-xjVlSc/round-1/fix-pan/`. Complete original finding and refutation retained under the run root; no claim variants discarded.
- Integrated verification: typecheck, lint (0 errors, 51 existing warnings), license headers (154 files), test coverage (49 files, 658 tests), and production build passed. Coverage: statements 96.64%, branches 90.17%, functions 97.59%, lines 98.02%. Independent reviewer also ran the full 658-test suite successfully.
- Round 1 (full): 1 raw; 1 verified; 1 fixed+verified; 0 surviving; 0 pending candidates; 8 reviewer-runs. No incomplete seats, pending routes, Minor findings, duplicate folds, or kills. No scope drift or re-litigation. Round 1 establishes the baseline; no trend claimed.
- Converged within the first round. The owner's existing authorization permits merge into develop after the final PR CI passes. Scratch and worktrees remain retained pending explicit cleanup authorization.
