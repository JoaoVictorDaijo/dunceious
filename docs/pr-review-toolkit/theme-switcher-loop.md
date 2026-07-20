# IAR loop ledger — theme switcher (`feat/theme-switcher`)

Independent adversarial review of the theme-framework feature. Mechanism: hand-authored
Opus-xhigh Workflow (6 finder lenses → 3-skeptic adversarial verification), because this
session runs on Fable. Findings reference **round # + headline** (not shas).

## Round 1

- **Reviewers:** 6 finder lenses (correctness, css-rendering, a11y-contrast, persistence, regression, test-coverage) + 3 independent skeptics per finding. 36 agents, 0 errors.
- **Raw:** 10 findings → **4 confirmed** (≥2/3 skeptics), 6 refuted. Two confirmed are the same radiogroup issue (found by two lenses) → **3 distinct**.
- **No Critical survived:** the localStorage "Critical" was downgraded to Important — the skeptics proved the crash is pre-existing (identical unguarded `readSkipClearAllConfirmation` runs first at `App.tsx:79`), so this branch introduces no new crash.

| # | Finding | Severity | Location | Fixed? | Decision | Test |
|---|---------|----------|----------|--------|----------|------|
| 1 | localStorage access unguarded against throws (getItem/setItem can throw SecurityError/QuotaExceeded → white-screen on mount / failed theme-set) | Important (finders: Critical) | `theme.ts:87-97`; pre-existing twin `clearConfirmationPref.ts` | ✅ `788ce16` | auto-fix | try/catch + throwing-storage unit tests in both files (2 in theme.test, 1 in clearConfirmation.test) |
| 2 | Theme radiogroup: no roving tabindex / arrow-key nav — advertises `role=radiogroup` but is 7 tab stops and arrows are inert | Minor (a11y) | `OptionsPanel.tsx:164-179` | ✅ `788ce16` | auto-fix (roving tabindex + Arrow/Home/End, with wrap) | Playwright: tabindex roving `[0,-1×6]`, ArrowDown/End/wrap/Home all move+select ✓ (unit test gated on #3) |
| 3 | Theme→root DOM wiring has zero automated guard (no jsdom/RTL tier; node test env) — same blind-spot class that let the popover-clip bug ship | Important (test-coverage) | `App.tsx` root attrs/vars; no test file | **accepted** (won't-fix) | Human decision: keep node-only test posture; wiring is Playwright-verified manually (Task 6) | manual Playwright pass (not CI) |

**Finding 3 rationale (human-accepted):** the project deliberately runs vitest in `node` env with no
jsdom/RTL/component tier (see the `dunceious-playwright-cli` convention — Playwright is the local,
manual visual/DOM verifier). The theme→DOM wiring and the radiogroup keyboard model are both verified
by the Task 6 / fix-verification Playwright passes; standing up a component-test tier for one feature is
disproportionate. Coverage for this class lives in the manual Playwright pass, by design.

**Refuted (6, for the record):** a duplicate localStorage-crash framing (pre-existing preempts it), a vacuous-coverage restatement, the "no-bleed invariant untested", "reduced-motion untested", "palette-contrast untested", and a "newly on the render path" claim — all refuted as speculative-future or pre-existing-not-a-regression by ≥2/3 skeptics.

**Round 1 delta:** 3 distinct confirmed (2 Important, 1 Minor), 6 refuted, 0 surviving Critical.

## Round 2 (verify the fix delta)

- **Reviewers:** 3 finder lenses (localstorage-fix correctness, keyboard-nav correctness, regression sweep) + 3 skeptics/finding. 9 agents, 0 errors.
- **Confirmed 2, refuted 0.** Round 2 caught a **regression the round-1 keyboard fix introduced.**

| # | Finding | Severity | Location | Fixed? | Decision | Test |
|---|---------|----------|----------|--------|----------|------|
| R2-1 | Radiogroup Arrow/Home/End keys leaked to the viewer's global `window` keydown handler (missing `stopPropagation`) → arrowing themes also panned/jumped the genome behind the popover | Important | `OptionsPanel.tsx` `handleThemeKeyNav` ↔ `useViewport.ts:202-248` | ✅ `bcbbc05` | auto-fix (`e.stopPropagation()` for handled keys) | Playwright: theme nav leaves viewer `scrollLeft=0` (ArrowRight/End), and viewer's own arrows still scroll (100px) ✓ |
| R2-2 | New keyboard-nav logic has no automated test (propagation blind spot needs integration tier) | Minor | `OptionsPanel.tsx`; no component test | accepted (won't-fix) | Same class as accepted #3 (node-only test posture); one skeptic ruled it not-a-defect (parasitic on R2-1). Fix is Playwright-verified. | manual Playwright (not CI) |

**Round 2 delta:** 1 new Important (fixed & verified), 1 Minor (accepted, derivative), 0 refuted. localStorage guard (R1-1) and roving-tabindex model (R1-2) independently re-confirmed correct by the round-2 lenses. **No Critical/Important survive.**

## Convergence

IAR converged after **round 2** (human stop-decision: no Critical/Important survive; the sole
round-2 fix is a Playwright-verified one-line `stopPropagation`). Opened as
**[PR #72](https://github.com/JoaoVictorDaijo/dunceious/pull/72)** → `feat/env-accent-design`.

- **Fixed & verified (4):** R1-1 localStorage crash-safety, R1-2 radiogroup keyboard model,
  R2-1 arrow-key↔viewer-scroll collision (all with tests/Playwright); plus the earlier
  popover-clip fix caught in-loop before IAR.
- **Accepted / won't-fix (2, documented):** R1-3 / R2-2 — no DOM/component test tier
  (node-only posture; Playwright-verified manually).
- **Refuted by skeptics (6):** speculative-future or pre-existing-not-a-regression.
