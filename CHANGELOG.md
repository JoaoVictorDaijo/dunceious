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

> **Renumbered 3.x line.** `3.0.0`–`3.1.0` were first published and tagged as
> `2.8.0`, `2.8.1` and `2.9.0`. The Annotation Hub release (`3.0.0`) is a major
> change, so it and the two releases after it moved to the `3.x` line on
> 2026-10-15. Exports stamped `2.8.0`, `2.8.1` or `2.9.0` match `3.0.0`, `3.0.1`
> and `3.1.0`. The discarded pre-reconstruction `3.4.0` is unrelated to this
> line.

## [Unreleased]

## [3.7.2] — 2026-10-21

### Changed

- Update ESLint and typescript-eslint to catch unsafe global-object calls and optional iteration, with regression checks for the existing lint configuration.

## [3.7.1] — 2026-10-20

### Fixed

- Size the default sidebar as the same share of the window at every resolution (360 px at 1920, 480 px at 2560) and fit the on-screen alignment rows to its width; Copy still gives the 60-column EMBOSS alignment.

## [3.7.0] — 2026-10-20

### Changed

- Size the sidebar to the screen (320 to 520 px) and fit the search options and alignment view inside it; Copy still gives the 60-column EMBOSS alignment.

## [3.6.2] — 2026-10-20

### Changed

- Local search scores each record with SSW's SIMD score pass where the browser supports wasm SIMD, about 10–17× faster for that pass; results are unchanged.

### Fixed

- The GenBank export benchmarks read the exported text again and check its LOCUS length and features.

### Removed

- Remove the chrome theme picker (Clean, Halo, Aurora, Mesh) from the options cog. The header and footer keep the Clean look; feature colours are unchanged.

## [3.6.1] — 2026-10-19

### Changed

- Run CI checks as parallel jobs without the single-worker test cap, and stop re-running CI on pushes to develop.
- Reorganize the example files into nucleotide and peptide folders, with aligned sets of T7 phages, T4 phages, coronaviruses and POMC orthologs.
- Give every unit test a 15 s timeout so heavy UI tests stay reliable on parallel CI workers.
- Ignore the locally rendered JOSS paper outputs (PDF, Crossref and JATS).
- The Local search design now cites the published sources behind each speed-up: FASTA's lalign36 and Huang et al. (1992) for scoring first, and the checkpointing work of Grice et al., Wheeler & Hughey and FastLSA.
- Local search runs about twice as fast: a 300 nt query against 50 records of 30 kb on both strands now takes about 5.5 s instead of 12.8 s on the default worker pool. Results, their order and every count stay exactly the same.
- Run exact and whole-query searches only in the search worker, so a long scan no longer freezes the page, and restore a blank result limit to 100 before searching.
- Open the phone greeter on the phage T7 genome and the test drive on three aligned T7-like phages, replacing the SARS-CoV-2 samples.

### Fixed

- A failure of the idle search worker no longer cancels a running Local search.
- Report a failed clipboard write in the record details panel instead of losing it silently, and fix the phone test drive's Export list, Hub first screen, draft handling and export wording.

## [3.6.0] — 2026-10-19

### Added

- Test-drive the Annotation Hub, Export dialog, details panel, Conservation and Compare on a phone, over an aligned SARS-CoV-2 reference with Alpha, Delta and Omicron genomes. On the desktop workbench too, the Annotation Hub no longer crashes when two jumps land in quick succession at short window heights.

### Fixed

- Prevent touch taps from opening viewer hover tooltips while preserving mouse and pen hover.

## [3.5.1] — 2026-10-18

### Changed

- Each release on main is tagged vX.Y.Z automatically by the Release tag workflow instead of by hand.

## [3.5.0] — 2026-10-18

### Added

- Add Local alignment search and a per-base hit view with alignment text and a query layer for annotations made from hits.

### Changed

- Keep the viewport layer toggles in the top bar on office screens: Project moves into the cog, and Compare and Clear selection move to the viewport toolbar.

### Fixed

- The version-tap easter egg plays its animation even when the system asks for reduced motion, instead of skipping to the last frame; replays offer a Play animation button.

## [3.4.0] — 2026-10-16

### Changed

- Fuzzy search finds the whole query at the slider's minimum identity, applied during the search, and shows each hit's identity and edits. Long queries finish in milliseconds instead of timing out into a coarser local fallback.

### Fixed

- Reverse-strand search finds hits again in RNA genomes that GenBank writes with T, such as SARS-CoV-2, in both IUPAC and fuzzy modes.

## [3.3.0] — 2026-10-16

### Added

- Compare aligned sequences against a chosen reference: highlight differences (identical residues as dots) or identity, with ambiguity codes never counted either way.
- Phones can test-drive the workbench sideways with sample data, and the greeter says plainly where your files go. Phones no longer open the full workbench; nothing done in the test drive is saved or sent.
- Pan and pinch-zoom the genome viewer by touch, and tap or drag its minimap to navigate.

## [3.2.0] — 2026-10-15

### Added

- Phones open a landing page with a drag-to-zoom SARS-CoV-2 genome and a short tour, instead of the desktop workbench.

### Changed

- The Annotation Hub card stays neutral like the viewport canvas; the accent marks only the current section's edge and name, tabs, edit marks and the overview rail.
- Save project, Open project and Clear workspace moved to a Project menu in the top bar, next to Options, in both modes.

### Fixed

- Release sidebar drag listeners when the sidebar unmounts during resizing.

## [3.1.0] — 2026-10-14

### Changed

- The feature editor’s Display Name field is associated with its label for accessible editing.
- CI verifies the production build in the browser, and release notes are assembled from per-PR fragments.
- Offer Add sequences, Save project and Clear workspace beside the viewport’s Record Navigator title, matching the hub’s Sequence index.

### Fixed

- Keep both pieces of an origin-crossing annotation in one Hub genome-track lane, and include both pieces in the Hub’s visible-row track window.
- Ignore stale genomic processing results after workspace edits, clearing, hiding all records, or replacement.
- Clear sequence search state and discard pending search results when workspace records change.

## [3.0.1] — 2026-10-14

### Changed

- The Import button in the Annotation Hub top bar drops its chevron.

### Fixed

- Keep the Hub sequence and feature index scroll position when hiding or showing sequences.
- Joins that cross the origin of a circular sequence draw their arrow head at
  the feature's true 3′ end instead of at the sequence end, and both pieces show
  the feature's name.

## [3.0.0] — 2026-10-14  —  Annotation Hub (major)

### Added

- Per-annotation edited/added marks, counts and an edited-only Hub filter;
  project files preserve the marks and interchange exports omit them.
- Per-tab three-state column sorting within Hub groups, preserving group order
  and restoring file order when switched off.
- Strand-packed Hub genome tracks with hover and keyboard details, a base/kilobase
  ruler, and amber windows linking visible rows to the header and index.
- Keyboard shortcuts sheet opened with `?` or the sidebar button.
- Annotation Hub index with List/Grouped modes, sequence and feature tabs,
  virtualized groups, genome strips, overview navigation, annotation
  search stepping, filters, keyboard controls and persistent session state.
- Sequence details editing with imported-value provenance and Revert, bulk
  fill-empty edits, project-only display names, and annotation deletion Undo.
- Subset export dialog with per-format options and a contents/omissions preview;
  ordered sequence/annotation drops with collision-aware batch routing.
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

- Hub Import and Export sit side by side; Add annotation moves to the filter bar, Save/Clear to the Sequence index, and search gains calmer focus and query-only match controls.

- Hub groups share rounded cards; full headers scroll away into slim live-track
  bars. Group navigation, search ticks and a draggable thumb share one scroll rail.
- Row actions sit inline in the name cell; repeat clicking or Escape clears the
  current row, whose track highlight stays pinned while other tooltips appear.
  Viewport return rows carry an amber Last focused chip.
- Hidden-sequence controls sit in the index title without shifting cards. Export
  has purpose/destination format cards, counted quick picks, qualifier tables and
  a filename field under the summary.
- The workspace switcher stays centred; Hub search, Add, Export and More move into
  the header. Viewport layers collapse into a popover when toolbar space is limited.
- Hub index uses windowed track cards, attention counts and an amber current card.
  Rows, tabs, filters and selection actions use the session styling; row actions
  appear on hover or focus and stay visible on touch devices.
- Workspace IDs use sanitized underscore suffixes. GenBank/GenPept exports use
  molecule-specific qualifier syntax and allowlists, separate ACCESSION/VERSION,
  and INSDC quote escaping. GFF3 uses encoded attributes, Sequence Ontology types,
  multipart IDs, CDS phases and full-length source-detail regions.
- Whole-record FASTA exports default to original residues; alignment gaps and
  NCBI detail modifiers are explicit options. Viewport selection exports retain
  selected aligned columns.
- Project format 2 preserves detail originals, edit markers, display names and
  modifiers; earlier project formats are rejected without migration.
- The By feature index shows one compact row per feature instead of a card with
  a presence strip, fitting about three times as many features on screen.
- The slim pinned bar shows the full packed track between the sequence name and
  its counts. Once a full header reaches the top it pins with its name in view,
  shrinks with the scroll, covering the rest of the header, and cross-fades into
  the slim bar.
- The Log Terminal is one collapsible section in both workspaces, closed by
  default, with the same title, icon and chevron; its open state carries across
  workspace switches.
- The Annotation Hub's Sequence index has a **+** button that adds GenBank or
  FASTA files without switching to the viewport.
- Translation rows open only at a zoom where amino acids are drawn, with a short
  animation (#122).
- Amino-acid boxes get the same white hairline as nucleotide cells, separating
  codons and stacked frames (#131).
- Brighten the dark chrome along its slate hue (#116).

### Fixed

- Focus uses authoritative annotation segments, and saving segment edits synchronizes the envelope used for culling and packing while preserving circular joins.
- Frameshift badges and tooltip summaries use biological junctions, so alignment gaps neither invent nor hide shifts.
- Codons crossing splice junctions or the circular origin draw and pack only their biological pieces, while alignment gaps remain continuous.
- Remote protein alignments restore terminal stops with gap padding, preserving stop annotations and aligned FASTA residues.
- Removing a sequence discards its inline detail and display-name drafts before its ID can be reused.
- Hub keyboard and search cursors follow surviving annotations through deletion and Undo, clearing deleted annotations and removed records.
- Circular wrapping segments retain their biological length after coordinate edits.
- Large quantitative tracks render in the Hub without overflowing the call stack.
- GFF3 round trips preserve partial GenBank location endpoints on individual feature parts.
- GFF3 source regions preserve non-detail qualifiers, flags and lists on export and annotation import.
- GFF3 exports remap feature relationships and report references omitted by subset filters.
- GFF3 exports retain canonical INSDC qualifier spelling for subsequent GenBank export.
- GFF3 round trips preserve attribute lists separately from percent-encoded literal commas.
- Selection exports discard stale CDS translations and recalculate reading frames after clipping.
- Selection exports clip actual annotation parts, retaining circular parts and excluding intron-only features.
- GFF3 CDS exports recalculate imported phases after reading-frame or geometry edits.
- Project loading rejects unsafe workspace IDs without changing stored references.
- GFF3 imports initialize CDS reading frames from the first transcription part phase.

- Hub current-group highlights switch at the reading line while the preceding
  card is still visible; jumps retain their target until scrolling, and trailing
  slim bars use neutral styling.
- The index Sort control appears only in By sequence, where it orders the
  sequences, sits beside Needs attention, and names its options plainly
  (Load order, Accession (A–Z), Fewest annotations first).
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
