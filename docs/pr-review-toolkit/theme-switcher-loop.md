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
| 1 | localStorage access unguarded against throws (getItem/setItem can throw SecurityError/QuotaExceeded → white-screen on mount / failed theme-set) | Important (finders: Critical) | `theme.ts:87-97`; pre-existing twin `clearConfirmationPref.ts` | pending | auto-fix | throwing-storage unit tests |
| 2 | Theme radiogroup: no roving tabindex / arrow-key nav — advertises `role=radiogroup` but is 7 tab stops and arrows are inert | Minor (a11y) | `OptionsPanel.tsx:164-179` | pending | auto-fix (roving tabindex + Arrow/Home/End) | manual Playwright; unit test gated on #3 |
| 3 | Theme→root DOM wiring has zero automated guard (no jsdom/RTL tier; node test env) — same blind-spot class that let the popover-clip bug ship | Important (test-coverage) | `App.tsx` root attrs/vars; no test file | pending | **needs human decision** (stand up jsdom+RTL infra?) | — |

**Refuted (6, for the record):** a duplicate localStorage-crash framing (pre-existing preempts it), a vacuous-coverage restatement, the "no-bleed invariant untested", "reduced-motion untested", "palette-contrast untested", and a "newly on the render path" claim — all refuted as speculative-future or pre-existing-not-a-regression by ≥2/3 skeptics.

**Round 1 delta:** 3 distinct confirmed (2 Important, 1 Minor), 6 refuted, 0 surviving Critical.
