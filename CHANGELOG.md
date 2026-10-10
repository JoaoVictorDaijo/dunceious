# Changelog

All notable changes to Dunceious. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versioning is
[SemVer](https://semver.org/).

> **Reconstructed history.** Versions `1.0.0`–`2.4.1` were reconstructed from git
> history on 2026-07-21 — the repo had shipped with no tags and an arbitrary
> `package.json` version (`3.4.0`) that no release ever earned. Dates, groupings,
> and bump *magnitudes* are approximate and predate — so are not bound by — the
> going-forward bump table in `CLAUDE.md`. Two anchors are deliberate: **`1.0.0`**
> marks the import of the already-working app from its original environment, and
> **`2.0.0`** marks the layered-architecture rewrite. See `CLAUDE.md` →
> *Versioning & releases* for the going-forward process.

## [Unreleased]

### Fixed
- Ship the license texts with every build: `COPYING.txt` and a generated
  `THIRD_PARTY_NOTICES.txt` carrying the full license and notice texts of the
  bundled React, react-window, D3, font and Font Awesome packages, which the
  build previously dropped. `COPYING` is restored to the verbatim GNU AGPL text.
- Name the copyright holders, João Victor Daijo and Murilo Cassiano, in every
  source header and in the footer, which showed `© 2026` with no holder.

## [2.8.0] — 2026-10-09

### Added
- Align inside Dunceious through EMBL-EBI's Job Dispatcher (MAFFT by default,
  Kalign, Clustal Omega or MUSCLE) from a new **Alignment** sidebar section. It
  is opt-in behind an explicit data-sharing agreement, checks every input
  locally before sending, follows the job in a step-by-step monitor, and locks
  record-changing actions while a job runs. The result goes through the same
  overlay as an uploaded pre-aligned FASTA (#120).
- Drag the minimized alignment job pill anywhere on screen, or move it with the
  arrow keys; it always stays inside the window (#124).
- Light up the Ingestion cards while files are dragged over the window, each in
  its own accent, with "Release to load" on the card under the cursor (#127).
- Focus flies to the whole annotation (every part of a joined feature), framing
  it in the viewport with a zoom-out/pan/zoom-in path, and labels it with an
  amber `name · N bp` tag; any input takes the view back mid-flight (#130).
- Step translation rows at programmed ribosomal frameshifts (e.g. SARS-CoV-2
  ORF1ab): each codon sits in the row of its own reading frame, and the
  annotation bar shows a tick, a `−1`/`+1` badge and a tooltip line at the
  slip (#126, #131).
- Pack translation rows into only the lanes each record uses instead of always
  reserving six; records without a CDS reserve none (#128).
- The easter egg can be replayed with one tap, ignores stray unlock taps and
  credits the authors on its final frame (#115, #129, #132).

### Changed
- Translation rows open only at a zoom where amino acids are drawn, with a short
  animation (#122).
- Amino-acid boxes get the same white hairline as nucleotide cells, separating
  codons and stacked frames (#131).
- Brighten the dark chrome along its slate hue (#116).

### Fixed
- Annotations stay one continuous bar across alignment gaps instead of breaking
  at every gap (#119).
- Pre-aligned FASTA files whose IDs contain spaces, such as the `seq1 (1)` IDs
  de-duplication creates, overlay correctly again (#117).
- Annotation bars no longer trail the sequence while scrolling or zooming (#123).
- Tooltips appear in place instead of sliding in from off-screen (#118).
- INSDC flag qualifiers (`/ribosomal_slippage`, `/pseudo`, `/trans_splicing`, …)
  are written on GenBank export instead of dropped (#126).
- Remote alignment recovers cleanly from every job outcome: the lock is always
  released, retry waits are bounded, refused result types fall back to the next
  one, and proxy error pages count as transient (#125). Consent lasts only for
  the current page load (#121).

## [2.7.0] — 2026-10-09

### Added
- Draw annotations as thin Geneious-style arrow bars (pointed 3′ end, name
  inside, direction when it fits) so dense records stay readable; lanes pack at
  18 px instead of 48 px (#112).
- Hide annotation bases by default; a *Show sequence in viewer* switch in the
  annotation details opens that annotation's bar to show its bases inside, with
  a short animation, only at a legible zoom (#112).
- Make every qualifier editable in the Metadata Inspector — rename, add,
  remove — with warnings for names GenBank would not round-trip (#110).
- Round-trip Focus between the Annotation Hub and the viewport: a *Back to
  Annotation Hub* pill returns to the origin row, which flashes and stays marked
  *Last focused* (#110).
- Explain every control with one tooltip style (keyboard focus, shortcut hints,
  reasons for disabled controls) and give every control a hover state (#110).
- Restrained motion: modal entrances, a crossfade between workspaces and button
  press feedback, all off under reduced motion (#110).
- A hidden easter egg behind the footer version (#110).
- README banner and modern layout (#110, #111).

### Changed
- Rename the Database Hub to **Annotation Hub** (#110).
- Self-host Inter and JetBrains Mono and rebalance type weights and contrast
  across the chrome; the header shows the wordmark alone (#110, #112).
- Cut the chrome themes to four (Clean, Halo, Aurora, Mesh) with an accent seam
  and better footer contrast; a full theme rethink is prototyped in
  `docs/design/prototypes/theme-concepts-v2.html` (#110, #112).
- Clear All always asks to type `CLEAR`; the *Skip Clear-All confirmation*
  option is removed (#110).

### Fixed
- Coordinate and segment edits no longer export at the original GenBank
  location (#110).
- Peptide sessions no longer show red dashed "broken CDS" borders on features,
  and a broken CDS no longer marks other features sharing its span (#112).
- The Options popover no longer lets the page behind show through (#110).


## [2.6.1] — 2026-10-09

### Changed
- Update the slogan to "Because geniality is overpriced" in the app, page and
  social titles, project metadata, README, design prototypes and social image.

## [2.6.0] — 2026-10-09

### Added
- Show primer and custom-annotation names, bases and strand direction within
  their intervals, with 5′/3′ labels and bases shown at readable zoom levels.
  Preserve unknown strand, separate segments and annotation export metadata
  (#100, #104).

### Fixed
- Preserve RNA uracil through translation, nucleotide search, reverse-complement
  search and GenBank export while retaining protein and DNA behavior (#95, #105).
- Align selection coordinates with displayed bases and keep zoom centered;
  measure the minimap after layout changes (#97, #101).
- Explicitly clear search results and stale highlights while preserving manual
  selection and annotations; retain minimap repaint dependencies (#98, #102).
- Keep search-result Annotate actions visible and keyboard/touch accessible;
  propagate strand and segments when creating annotations (#99, #103, #104).

## [2.5.0] — 2026-09-29

Promotes the accumulated `develop` changes from production `2.0.1`, including
the UI, theme and biology changes documented in `2.1.0`–`2.4.1` below.

### Added
- Groove scrollbar: a surface-aware 12px recessed rail and 8px raised pill,
  including the Database Hub; isolate standard `scrollbar-width` rules so they
  do not override Chromium's custom scrollbar styling (#85).
- Component/canvas render-test harness (jsdom + Testing Library + a canvas-2D
  recorder), with SequenceTrack early-stop glyph, Row join/wrap-connector, and
  DatabaseHubPanel coverage (#68, #82).

### Fixed
- Out-of-order feature joins connect across their actual gap instead of showing
  a false origin crossing; preserve genuine circular wraps and omit connectors
  between abutting or overlapping segments (#80, #87).
- Circular features end at their own record length rather than the alignment
  width when displayed beside a longer record (#86, #88).
- Drag selection remains linear in either direction and tracks autoscroll;
  horizontal and vertical panning do not create unintended selections (#90).

### Changed
- Index alignment coordinates once per record to avoid repeated sequence scans
  during feature transposition. Add a performance guard using the complete
  chloroplast genome and preserve coordinate/gap/strand behavior (#92).
- Update dependencies within their existing major versions, including React 19
  and Font Awesome 6; resolve all 13 advisories present in the update baseline
  (#91).
- Versioning: reconstructed the SemVer history, added this changelog, a
  `CLAUDE.md` release process, `npm run version:*` scripts, and a `version-guard`
  CI check (#83).

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
