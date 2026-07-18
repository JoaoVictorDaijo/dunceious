# PR #61 — develop → main promotion · ping-pong review ledger

**PR:** https://github.com/JoaoVictorDaijo/dunceious/pull/61 (`develop` → `main`, production / Cloudflare Pages)
**Surface:** 110 files, +9107 / −3656 (architecture restructure Phases 0–E + accumulated infra/test/docs, PRs #47–#60)
**Mechanism:** tailored multi-agent Workflow (behavior-preserving refactor + docs/config promotion), risk-tuned lenses, per-finding adversarial verification.
**Baseline:** full CI mirror green on the develop tip (typecheck, lint incl. boundary + max-lines@600, headers, 518 tests, build).

| Round | Lenses | Raised | Confirmed | Blockers (crit/imp) | Decision |
|------|--------|--------|-----------|---------------------|----------|
| 1 | behavior-falsify · build/deploy · integration · coverage · layering · config | 3 | 3 (all minor) | **0 / 0** | **Loop clean** — no blockers; 3 minors below; hand merge decision to human |

**Lenses with zero findings:** build/deploy (CF-Pages build green, workers resolve, assets OK), coverage (518 tests, config expands scope), layering (no residual `core→workers` inversion).

## Round 1 confirmed findings (all minor, non-blocking)

1. **[behavior] `src/domain/bio/sequence.ts` — `detectMoleculeType` alphabet change (Phase B).** Real runtime delta vs `main`: FASTA molecule-type auto-detection. `main` flagged D,H,K,M,R,S,V,W,Y (IUPAC nucleotide ambiguity codes) as protein; `develop` treats them as nucleotide (adds J,O,X,Z,*). **Net effect is a bugfix**, test-covered (`sequence.test.ts:122,125`); only theoretical regression is a peptide of solely nucleotide-overlapping residues (vanishingly rare). GenBank imports unaffected (`classifyLocusMoleculeType` byte-identical).
   → **Disposition: won't-fix (intentional improvement; revert would reinstate the bug). Disclosed in the PR body for the production-behavior record.**

2. **[integration] Stale `services/` references in 5 comments** (`useFileHandlers.ts:111`, `core/genbank/index.ts:24`, `sequence.ts:185`, `domain/bio/index.ts:40`, `translationHelpers.test.ts:21`). Comment-only; no import resolves to `services/`; typecheck/build green.
   → **Disposition: won't-fix-now (zero runtime impact). Optional follow-up docstring cleanup.**

3. **[config] `tailwind.config.js` dead content globs** (`./index.tsx`, `./components/**`). Pre-existing (not in the promotion diff); `./src/**` covers all UI source; CSS builds correctly.
   → **Disposition: won't-fix-now (no shipping risk). Optional follow-up.**

**Exit:** no Critical/Important across 6 lenses + adversarial verification → promotion is production-safe. Human retains the merge trigger (production deploy).

## Follow-up cleanup (post-round-1, on request)

- **#2 (stale `services/` comments) + #3 (dead tailwind globs) → FIXED** via **PR #62** (`chore/promotion-doc-cleanup` → `develop`, merged `c11f5a8`). 6 files, comment/config-only; typecheck/lint/headers/build green; JS+CSS bundle hashes byte-identical. Grep confirms zero `services/` references remain in `src/`.
- **#1 (`detectMoleculeType` FASTA change) → won't-fix, disclosed** (intentional Phase B bugfix; revert would reinstate the bug). Documented in the PR #61 body.
- **PR #61 re-verified after the cleanup landed:** Cloudflare Pages preview + `ci` green; `MERGEABLE / CLEAN`. Ready for the human's production merge.

