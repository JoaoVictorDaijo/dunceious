# Changelog

All notable changes to Dunceious. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versioning is
[SemVer](https://semver.org/).

> **Reconstructed history.** Versions up to and including `2.4.2` were
> reconstructed from git history on 2026-07-21 — the repo had shipped with no
> tags and an arbitrary `package.json` version (`3.4.0`) that no release ever
> earned. Dates and groupings are approximate; two anchors are deliberate:
> **`1.0.0`** marks the import of the already-working app from its original
> environment, and **`2.0.0`** marks the layered-architecture rewrite. See
> `CLAUDE.md` → *Versioning & releases* for the going-forward process.

## [2.4.2] — 2026-07-21
### Added
- Component/canvas render-test harness (jsdom + Testing Library + a canvas-2D
  recorder), with SequenceTrack early-stop glyph, Row join/wrap-connector, and
  DatabaseHubPanel coverage (#68, #82).

## [2.4.1] — 2026-07-21
### Fixed
- `codon_start`-aware amino-acid lane; prefer the stored `/translation` over
  recomputation (alt-start initiator, `transl_except` recoding) (#70, #71, #78).
- Stop mis-flagging scattered trans-spliced joins as circular wraps; handle
  mixed-strand envelopes (#79).

## [2.4.0] — 2026-07-21
### Changed
- Viewer redesign: dark toolbar/ruler band, segmented-inset controls, seamless
  band↔canvas transition, glare fix (#75).

## [2.3.0] — 2026-07-20
### Added
- Theme framework + switcher: 7-style shortlist, TypeScript palette registry as
  single source, radiogroup keyboard nav, localStorage-safe, no edge bleed
  (#72, #77).
### Fixed
- File-input robustness — reset the input and settle processing on read/worker
  failure (#76).

## [2.2.0] — 2026-07-20
### Added
- Per-session environment accent for the app chrome; richer demo genomes +
  parser e2e tests (#67).
### Fixed
- Translation correctness — honor the genetic code, `codon_start`, and
  mixed-strand joins; preserve per-segment strand through transposition/clip
  (#67).

## [2.1.0] — 2026-07-04
### Added
- Differentiate Database Hub mode; global Options popover.

## [2.0.1] — 2026-07-03
### Fixed
- Centralize the app version to a single source of truth via `package.json` and
  the Vite `__APP_VERSION__` define (#63).

## [2.0.0] — 2026-07-03  —  Layered-architecture rewrite (BREAKING)
### Changed
- Enforce a layered architecture `domain ← core ← workers ← app` with ESLint
  import-boundary and `max-lines` gates (#49, #60).
- Relocate GenBank/formats/search into `src/core`, worker bodies into
  `src/workers/handlers`; decompose the viewer into tracks/hooks/overlay
  (#52, #53, #55–#59).
### Removed
- The `bioUtils` grab-bag and the root `types.ts` shim; molecule-type detection
  unified on the canonical IUPAC alphabet (`refactor(bio)!`) (#51).

## [1.8.0] — 2026-07-02
### Added
- Self-host Tailwind v3 + Font Awesome, dropping runtime CDNs (#43).
- Favicon and social-preview card; absolute social URLs + README usage
  (#44, #45, #47).
- AGPL license headers on all sources with CI enforcement + auto-insert hook
  (#46, #48).

## [1.7.0] — 2026-07-01
### Changed
- Extract trapped pure logic — molecule-type, FASTA/annotation parsers, worker
  routing, search/bio/feature reducers, view-model helpers — behind a scoped v8
  coverage-ratchet gate (#39–#42).

## [1.6.2] — 2026-07-01
### Changed
- Benchmark/perf pipeline cleanup — remove dead `summarize.mjs` and stale
  artifacts; split `bench/` vs `perf/` with their own configs and READMEs (#38).

## [1.6.1] — 2026-06-30
### Added
- CI merge-gate pipeline — split typecheck/lint, `@types/*`, precision-safe LCG
  constants, `pull_request` gate running test/typecheck/lint/build (#37).

## [1.6.0] — 2026-06-01
### Added
- Record-exclusion action + record-details modal; unsaved-workspace
  `beforeunload` warning (#33).
- Accession parsing + safer save/delete/clear-all flows (#35).
### Fixed
- IUPAC-aware FASTA molecule-type detection (RNA/alignment ambiguity codes)
  (#33); accession-fallback consistency (#36).

## [1.5.0] — 2026-05-08
### Added
- FASTA file input, adjustable sidebar, scrollable/selectable search & log
  panels, copy-selection in the viewer, session-type UI + colored session bar,
  peptide IUPAC search, frame lock in AA mode, duplicate-ID guard.
### Changed
- **Relicensed the project to AGPL-3.0** (removed the prior custom /
  commercial-restricted license).
- Prevent mixed-sequence analysis.

## [1.4.0] — 2026-04-24
### Added
- Complete peptide sequence support with word-boundary protein detection (#32).
### Fixed
- Byte-for-byte GenBank round-trip export (source handling, qualifier escaping,
  `DEFINITION` marker) + regression/user-mod tests (#30, #31).

## [1.3.0] — 2026-04-17
### Added
- Performance/benchmark suite — GC-aware GenBank-parser benchmarks, 2D benchmark
  grid + RSS metric, searchLogic/bioUtils benches, benchmark plotting
  (median/peak over 5 runs) (#22–#27, #29).
### Fixed
- Reuse the search-worker instance, guard callbacks after unmount, harden worker
  teardown (#28); a Vite high-severity vulnerability; a fuzzy-search invocation
  bug (#29).

## [1.2.0] — 2026-04-01
### Added
- Annotation-based translation rendering with broken-protein detection (#19).
### Fixed
- Documentation inconsistencies (version/license/code paths) (#18).
### Removed
- Unused code and empty scaffold directories (#17).

## [1.1.0] — 2026-03-30
### Changed
- Modular-architecture refactor (Phases 0–6): ESLint + smoke tests + PR
  template, normalized `src/` layout, split the `App.tsx` God-component
  (1820→655 lines), shared domain/bio modules, modular GenBank parser, worker
  contracts, `strictNullChecks`, App state → hooks (#7–#16).
### Added
- e2e tests; repaired old test logic (#11).

## [1.0.0] — 2026-03-26  —  Imported app
### Added
- Initial import of the React + TypeScript + Vite GenBank/genome viewer SPA from
  its original environment.
### Fixed
- Selection-export coordinates (rebase feature segments, drop zero-length
  intervals) + Vitest tests (#3, #5); double-click region selection (#6).
### Removed
- Dead `alignmentAlgorithms.ts` (#1).
