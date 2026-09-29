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
| C-1: vertical pan has no behavioral regression test | Important | `src/app/viewer/__tests__/useSelectionDrag.test.tsx:47`, R1 `252d6ba` | Removing the extracted vertical scroll call leaves the hook suite green | A reachable regression could disable drag navigation between records | auto-fix: add a real VariableSizeList integration test; production remains unchanged | pending fix verification |

The proposed action was published before editing. No severity downgrade or won't-fix decision. This is a coverage gap, not a demonstrated current production defect. Baseline focused suite: 12 pass; baseline full suite: 656 pass. The no-op vertical-pan mutation leaves the old focused suite at 12 pass in both finder and refuter probes.
