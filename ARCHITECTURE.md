# Dunceious Architecture Overview

> **This is the canonical architecture reference (the north star).** All source lives under a
> single layered `src/` tree — `domain ← core ← workers/handlers ← app`, imports pointing only
> **down** the stack. The rationale and phase-by-phase history of the restructure that produced
> it are in `docs/superpowers/specs/2026-07-02-architecture-restructure-design.md`. Phase 0 owns
> the architectural description here; the layer boundaries are enforced by ESLint (§2).

This document outlines the high-level architecture of the Dunceious client-side genome-viewer
SPA (React 19 + TypeScript, Vite, Web Workers, d3, react-window).

## 1. Core Principles

- **Data-Driven Rendering**: The UI is a direct reflection of the underlying `SeqRecord` state.
- **Worker-Based Processing**: Heavy parsing, alignment, and search tasks are offloaded to Web Workers to keep the UI thread responsive.
- **Typed Worker Contracts**: All messages crossing the main-thread ↔ worker boundary are defined as discriminated-union types in `src/workers/protocol.ts`. There is no `any` usage on worker message paths.
- **Shared Domain Logic**: Pure business logic (coordinate transposition, consensus calculation) lives in `src/domain/bio/`. Workers import from this shared module—no algorithm is duplicated.
- **Layered Visualization**: The genome viewer uses a multi-layered approach (Annotations → Tracks → Sequence) to handle high-density data.
- **Layered under `src/`**: code is grouped by technical role into four layers — `domain ← core ← workers/handlers ← app` — and imports only ever point **down** the stack. See §2.
- **Single canonical source of truth**: architecture rules live only in this document; `AGENTS.md` and the `dunceious-architecture` Claude skill are thin doorways that link here, never copies. Model types have one home (`src/domain/bio/types.ts`); wire contracts have one home (`src/workers/protocol.ts`).

---

## 2. Folder Structure

### The layered `src/` tree

All source lives under `src/`, grouped by technical role into four layers. Imports only ever
point **down** this stack:

```
domain  ←  core  ←  workers/handlers  ←  app
```

```
src/
├── domain/bio/          # Pure biology model + algorithms. Imports NOTHING outside domain.
│   ├── types.ts         # Canonical types (+ coordinate-convention docs)
│   ├── coordinate.ts    # transposition, aligned-segment building
│   ├── consensus.ts
│   ├── intervals.ts     # clip/split/wrap — the ONE clipInterval; splitWrapAround
│   ├── sequence.ts      # reverseComplement, translate + GENETIC_CODE, molecule-type
│   │                    #   detection, gap↔ungapped mapping, isProteinSession
│   ├── frameshift.ts    # programmed ribosomal frameshifts read from join coordinates
│   ├── strand.ts        # getFeatureStrand (keeps GFF '.'/'?' strands)
│   └── index.ts         # barrel
│
├── core/                # Pure format/search logic (was root services/). Imports domain only.
│   ├── genbank/         # read sub-parsers + serialize.ts (exportToGenBank)
│   ├── formats/         # fasta.ts (parse + exportToFasta), annotations.ts (BED/GFF3/BedGraph + exportToGff)
│   ├── search/          # query.ts (degenerate→regex), align.ts (smithWaterman), exact.ts, fuzzy.ts — NO protocol import
│   └── alignment/       # EMBL-EBI contract model: engine catalog, preflight, parsers, result remap — pure, NO fetch
│
├── workers/             # Thin shells + typed contracts + worker bodies.
│   ├── protocol.ts      # message contracts (may reference domain types)
│   ├── bio.worker.ts / search.worker.ts    # thin shells
│   └── handlers/
│       ├── bio.ts       # handleBioMessage — orchestrates core + domain
│       └── search.ts    # runSearch + collectSeededFuzzyHits
│
└── app/                 # The React application. May import everything below it.
    ├── main.tsx + index.css + themes.css   # entry and global styles
    ├── shell/           # ShellRoot: lazy-loads one UI root (desktop today; mobile next)
    ├── shared/          # everything both UIs use
    │   ├── workspace/   # useWorkspace — the workspace state and handlers (records, selection,
    │   │                #   search, features, file I/O, remote alignment)
    │   ├── types/       # contracts shared by hooks/logic and components (search, features)
    │   ├── hooks/       # useBioWorker, useSearchWorker, useFeatureManager, useFileHandlers, …
    │   ├── logic/       # pure reducers/view-model (+ runInlineSearch)
    │   ├── viewer/      # GenomeViewer decomposed: slim container + layout.ts + Row + tracks/ + Minimap
    │   │                #   + cds.ts (translation lanes) + hooks (viewport, focus flight, …) + colors.ts
    │   ├── lib/         # download.ts (downloadBlob), ebiClient.ts (the ONLY network I/O: fetch to EMBL-EBI)
    │   └── recordRemoval.ts
    ├── desktop/         # the desktop UI
    │   ├── DesktopApp.tsx   # desktop composition root: desktop-only UI state over useWorkspace
    │   ├── components/      # modals, panels, nav, sidebar
    │   └── hooks/           # desktop-only UI hooks (job-pill dragging, file-drag arming)
    └── testing/         # test harness
```

Root keeps only true root things: configs, `index.html`, `docs/`, `bench/`, `perf/`,
`scripts/`, `.github/`. Root `components/`, `services/`, and `types.ts` no longer exist.

### Layer import rules (the contract)

1. `src/domain/**` imports **only** `domain`. No DOM, React, core, workers, or app.
2. `src/core/**` imports `domain` **only**. Never workers, app, React, or DOM.
3. `src/workers/**` imports `core` + `domain` + its own `protocol`.
4. `src/app/**` may import anything below it. All React + DOM + browser I/O lives here.
   Inside `src/app`, the UI shells have their own rule: `shared/` imports none of `desktop/`,
   `mobile/` or `shell/`; `desktop/` and `mobile/` never import each other; `shell/` loads each
   UI root only through `React.lazy` in `ShellRoot.tsx`.
5. **One canonical home per type:** model types in `domain/bio/types.ts`; wire contracts in
   `workers/protocol.ts` (referencing domain types). No duplicate `SearchResult` /
   `SearchOptions` / FASTA-record shapes.

These boundaries are **enforced by an import-boundary ESLint rule** (`no-restricted-imports`,
per layer, in `eslint.config.js`), alongside the `max-lines` `error` ceiling at 600 lines.
The UI-shell rule has three enforcement layers: the same ESLint rule for static imports;
`src/app/__tests__/boundaries.test.ts`, which also checks dynamic `import()`; and a build plugin
(`scripts/shellIsolation.mjs`, wired in `vite.config.ts`) that fails the production build when
Rollup's chunk metadata shows a UI module in the startup chunk or in the other UI's chunk graph.

### Extension rules — where does new code go?

- **New domain algorithm** → `src/domain/bio/<file>.ts`; export from `index.ts`. Imports nothing outside `domain`.
- **New file-format parser / search primitive** → `src/core/formats/` or `src/core/search/`; imports `domain` only; wire it into a `src/workers/handlers/*` body.
- **New worker message type** → add request/response to `src/workers/protocol.ts` (reference domain types), handle the branch in `src/workers/handlers/{bio,search}.ts`, dispatch from the relevant `src/app/shared/hooks/*` hook.
- **New UI component** → `src/app/desktop/components/` for the desktop UI (or `src/app/shared/viewer/` if it belongs to the genome viewer); may import anything below it and `src/app/shared/`.
- **New shared state or logic** → `src/app/shared/` (state wiring in `workspace/useWorkspace.ts`, pure logic in `logic/`). Desktop-only UI state stays in `DesktopApp`.

Full worked examples: `.claude/skills/dunceious-architecture/references/where-does-x-go.md`.
`AGENTS.md` and `.claude/skills/dunceious-architecture/` are doorways into this document.

---

## 3. Worker Contract Usage

### Protocol file (`src/workers/protocol.ts`)

All messages are typed as discriminated unions:

- **Bio Worker requests** (`BioWorkerRequest`): `PROCESS_RECORDS | PARSE_GENBANK | PARSE_FASTA | PARSE_ANNOTATIONS`
- **Bio Worker responses** (`BioWorkerResponse`): `SUCCESS | PARSE_SUCCESS | FASTA_SUCCESS | ANNOTATIONS_SUCCESS | ERROR`
- **Search Worker requests** (`SearchWorkerRequest`): `{ searchQuery, records, mode, options, moleculeType? }`
- **Search Worker responses** (`SearchWorkerResponse`): `{ results } | { error }`

### How to add a new worker message type

1. Add request and response interfaces to `src/workers/protocol.ts`.
2. Add the new interface to the appropriate union type.
3. Handle the new `type` branch in the pure handler (`src/workers/handlers/bio.ts` / `search.ts`), not in the worker's `onmessage` — the worker shell is a one-line `postMessage(handler(e.data))`.
4. Send the typed `BioWorkerRequest` / `SearchWorkerRequest` from the hook that owns the worker (`useBioWorker` / `useSearchWorker`), and handle the response in that hook's typed `onmessage`.
5. Add integration tests in `src/workers/__tests__/protocol.test.ts`.

See §2 and the skill's `where-does-x-go.md`.

---

## 4. Data Processing Pipeline

### Ingestion (`src/workers/handlers/bio.ts`)

- **GenBank Parser**: Delegates to `src/core/genbank/index.ts` (modular, fully tested). Supports both nucleotide and amino-acid (protein) records; molecule type is read from the `LOCUS` line (`aa` keyword → protein).
- **FASTA Parser**: Two distinct ingestion modes, distinguished by the `asAlignment` flag on `ParseFastaRequest`:
  - **Batch load** (`asAlignment` absent/false): Each FASTA record becomes a new workspace entry. Molecule type (`dna | rna | protein`) is detected per-record by scanning the first 200 residues for protein-exclusive IUPAC characters (D, E, F, H, I, K, L, M, P, Q, R, S, V, W, Y). Duplicate record IDs are automatically de-duplicated with a numeric suffix (`seq1 → seq1 (1) → seq1 (2)`) via `makeUniqueId()` (in `src/app/shared/logic/idHelpers.ts`).
  - **Alignment overlay** (`asAlignment: true`): Applied via the **Upload Alignment** action. Every record in the file must match an existing workspace record, and all sequences must have equal length; any mismatch is rejected with an error log entry. A record matches by the longest leading run of its FASTA header that is a workspace ID, so exported IDs containing spaces (`seq1 (1)`) round-trip and a trailing description (`>seq1 reference strain`) is ignored; `parseFasta` keeps the full header for this (`FastaRecord.header`), and `applyFastaResponse` resolves it. Matching records have their `alignedSequence` field updated without altering sequence or feature data.
- **Remote alignment** produces the same input as the overlay above, but computed by EMBL-EBI; see *Remote alignment (EMBL-EBI)* below.
- **Molecule-type enforcement** (`useFileHandlers.ts`): Before dispatching a parse request, `sniffFastaCategory` / `sniffGenBankCategory` detect the incoming molecule type. If it conflicts with the current session type (nucleotide vs protein), the upload is blocked and logged. Sessions must be homogeneous.
- **BED / BedGraph Parser**: Extracts genomic intervals and scores; renders as interval or line tracks.
- **GFF3 Parser**: Merges GFF3 features into existing records, matching by sequence ID.
- **Annotation Import**: Merges external annotation files (GFF/BED) into existing records.
- **Transposition**: Delegates to `src/domain/bio/coordinate.ts → processTransposition`.
  Source records retain ungapped biological coordinates. Display copies keep one
  continuous aligned segment per original part, spanning internal gaps but excluding
  flanking gaps; circular origin crossings split into two parts. Search highlighting
  still uses non-gap pieces. CDS extraction skips gap columns while preserving their
  aligned indices, and translation frames count biological bases. Details and exports
  use source features; focus actions map their coordinates into the alignment.

### Remote alignment (EMBL-EBI)

The one feature that sends data off the machine, therefore opt-in and consent-gated. It is **not** a worker concern: it runs on the main thread (async `fetch` + timers) and converges with the pre-aligned pipe at the overlay reducer, not at `PARSE_FASTA`.

- **Contract model** (`src/core/alignment/`, pure): `ebi.ts` holds the engine catalog (MAFFT default, Kalign, Clustal Omega, MUSCLE: limits, UI copy, `buildParams`), the submission builder (alias headers `s1…sN`, ungapped, 60-column FASTA, with an alias → record-ID map), parsers for EBI's XML errors, result types and job status, and `remapAlignment` (alias set, equal lengths and gap-stripped == submitted must all hold). `preflight.ts` has `validateEmail` and `preflightAlignment`, which run per engine before anything is sent. Limits come from measuring EBI itself, not its prose docs: minimum 2 sequences, maximum 500/2000/4000/500, and the byte limit applies to the 60-column payload (we enforce 99.5 % of it). EBI verifies the email's domain via DNS, so that rule cannot be mirrored client-side and is reported from its synchronous `400`.
- **Client and runner** (`src/app/shared/lib/ebiClient.ts`, `src/app/shared/logic/remoteAlignment.ts`): the client is the only `fetch` caller (direct from the browser, EBI sends `Access-Control-Allow-Origin: *`; per-request timeout, 120 s for a submit). The runner is a pure async state machine over injected `client`/`sleep`/`now`/`signal`: submit once and never retry it, poll `status` with retry/backoff for transient failures, pick the result type (`aln-fasta`, then `fa`, then `out`), validate, then hand over. It exposes per-step timestamps for the monitor. There is no cancel endpoint at EBI, so cancelling only stops waiting.
- **Convergence**: the runner remaps aliases to exact record IDs in memory and calls the shared `applyAlignmentOverlay` from `useBioWorker`, which runs the same `applyFastaResponse(…, true)` and logs as the `FASTA_SUCCESS` path. Nothing downstream changes (transposition, consensus).
- **Lock**: `useRemoteAlignment` exposes `isAlignmentLocked`; while a job runs the handlers that change records (ingest, pre-aligned upload, project load, Clear All, record removal) disable and early-return, so jobs cannot race into the same overlay. A stale-session guard discards a result if records changed anyway.
- **Consent**: the dialog shows an explicit disclosure first (`alignConsentPref.ts`: held only in module memory, so it ends with the page load; revocable; an agreement persisted by an earlier version is deleted on load); `submit` makes no request without it.
- **UI**: `AlignmentSection` (sidebar, above search), `AlignRemoteModal` (consent, engine picker, email), `AlignmentJobMonitor` (step list, polling transparency) and `AlignmentJobPill` (minimized status, dragged or moved with the arrow keys through `useDraggableJobPill`; the clamping geometry is pure in `logic/floatingPosition.ts`, and the position is kept only for the page load).
- Design record and the measured API contract: `docs/superpowers/specs/2026-10-09-remote-alignment-design.md`.

### Consensus (`src/domain/bio/consensus.ts`)

- Generates a master consensus sequence across all aligned records to identify conservation.
- Imported directly by `src/workers/handlers/bio.ts` (no duplication).

### Search (`src/workers/handlers/search.ts`)

- **Exact / IUPAC Mode**: `degenerateToRegex(query, moleculeType)` from `src/core/search/query.ts`. The `moleculeType` parameter selects between two IUPAC character maps:
  - **Nucleotide** (`IUPAC_MAP`): DNA/RNA degenerate codes — `R`=[AG], `Y`=[CTU], `S`=[GC], `W`=[ATU], `K`=[GTU], `M`=[AC], `B`=[CGTU], `D`=[AGTU], `H`=[ACTU], `V`=[ACG], `N`=[ACGTU]. Literal T and U remain distinct.
  - **Protein** (`PROTEIN_IUPAC_MAP`): all 20 standard amino acids plus ambiguity codes — `B`=[DN], `Z`=[EQ], `J`=[IL], `X`=[all 20 AAs], `U` (selenocysteine), `O` (pyrrolysine).
- **Reverse-complement search**: Performed automatically for nucleotide sessions (forward + reverse strands). Suppressed entirely for protein sessions where strand orientation is not applicable.
- **Session-type propagation**: `useSearchWorker` derives `isProteinSession = records.some(r => r.moleculeType === 'protein')` and passes `moleculeType: isProteinSession ? 'protein' : 'dna'` in every `SearchWorkerRequest`. Each `SearchableRecord` also retains its optional molecule type so mixed DNA/RNA nucleotide sessions use the correct reverse complement per record. Legacy projections infer RNA from U, or honor an explicit RNA request when the record type is absent.
- **Fuzzy Mode (Smith-Waterman)**: `smithWaterman` from `src/core/search/align.ts` with affine gap penalties (Gotoh). Results sorted by descending score.

---

## 5. Component Hierarchy

### `src/app/shell/ShellRoot.tsx`, `src/app/desktop/DesktopApp.tsx`, `src/app/shared/workspace/useWorkspace.ts`

- `ShellRoot` lazy-loads the UI root, so each UI is its own chunk.
- `useWorkspace` wires the hooks below together and owns the shared state: records, selection, display toggles, feature colours, Focus, search and record removal. It takes `onNavigateToViewer` and `onRecordRemoved` callbacks so it never touches UI state.
- `DesktopApp` holds the desktop-only UI state (sidebar, active workspace tab, open modals, the Hub return target, drag mode, theme) and renders the desktop layout.
- Does not own the workers: `useBioWorker` and `useSearchWorker` create them, send typed `BioWorkerRequest` / `SearchWorkerRequest` messages and consume the typed responses — no `any` in worker message paths.

### `src/app/shared/hooks/` (Custom Hooks)

State and logic extracted from the composition root into purpose-built hooks, each with a single responsibility:

- `useAppLogger` – append-only activity log, stable `addLog` callback
- `useBioWorker` – worker lifecycle, `records` / `transposedRecords` / `consensus` state, ID deduplication
- `useFeatureManager` – feature CRUD, search-to-annotation bridge, record visibility toggle
- `useRemoteAlignment` – remote alignment dialog state, job lifecycle, consent and lock
- `useDraggableJobPill` (desktop) – pointer and keyboard dragging of the minimized alignment pill
- `useFileDragActive` (desktop) – whether files are being dragged over the window (depth-counted, reset on drop/dragend), which arms the Ingestion drop zones
- `useFileHandlers` – file upload handlers (with molecule-type enforcement) and export helpers
- `useSearchWorker` – search worker bridge; derives `isProteinSession`; exposes grouped results and join helpers

### `src/app/desktop/components/` (Presentational Components)

- `ProcessingOverlay` – full-screen loading overlay
- `StatusBar` – bottom status bar: selection metrics, session molecule-type chip, version (the easter-egg trigger), license link
- `TopNav` – top navigation: workspace switcher (Visual Viewport / Annotation Hub), Pan/Select mode toggle, viewport layer toggles; translation button disabled for protein sessions; session-type accent strip
- `Sidebar` – Ingestion cards, alignment, search, record navigator, selection inspector and log terminal
- `DropZone` – one Ingestion card: a transparent file input with idle / armed / over drop states (`data-drop`, styled per card in `index.css`)
- `AlignmentSection`, `AlignRemoteModal`, `AlignmentJobMonitor`, `AlignmentJobPill` – remote alignment trigger, dialog, job monitor and minimized pill
- `SearchPanel` – sequence search UI with grouped results; strand selector hidden for protein sessions
- `RecordDetailsModal` – record or annotation details: metadata, Focus, copy/export, *Show sequence in viewer*
- `FeatureEditorModal` – *Create Feature* / *Metadata Inspector*: location, strand, segments (including circular wrap) and freely editable qualifiers
- `AnnotationHubPanel` – records and features table with Focus, edit, export and Clear All
- `HubReturnPill` – *Back to Annotation Hub* after a Focus from the Hub
- `OptionsPanel` – chrome theme and feature colours
- `TooltipLayer` – the single tooltip renderer for every `data-tip`
- `MoleculeTypeMismatchModal` – explains a blocked nucleotide/peptide upload
- `CentralDogmaEgg` – the version-tap easter egg

### `src/app/shared/viewer/GenomeViewer.tsx` (Rendering Engine)

- **Virtualization**: `react-window` row-virtualized list; `computeRecordLayouts` (`layout.ts`) sizes every row.
- **Annotation lanes**: features are packed greedily into non-overlapping lanes and drawn by `Row` as thin arrow bars (`annotationBarPath`, 14 px, name inside via `AnnotationText`). A feature opted in with *Show sequence in viewer* opens to show its bases above `ANNOT_BASES_MIN_ZOOM`; `useBasesOpenness` eases that opening without animating scroll-driven geometry.
- **Alignment gaps**: each part of a transposed feature is one continuous bar; joins and origin crossings keep one bar per part with connectors.
- **Translation lanes**: shown above `TRANSLATION_MIN_ZOOM` only. `assignTranslationLanes` (`cds.ts`) groups each CDS's codons by `codonFrame` and packs them into the fewest rows per record and strand, cached per record object. A programmed ribosomal frameshift (`domain/bio/frameshift.ts`) moves later codons to their own frame's row; the annotation bar carries the `−1`/`+1` badge.
- **Focus flight**: `useFocusFlight` animates to a `FocusTarget` (`logic/focusTarget.ts`, the feature's whole envelope in aligned columns) along `d3.interpolateZoom`, framed at 80 % of the viewport; reduced motion jumps, and any user input cancels it.
- **Track Packing**: Quantitative BED/BedGraph tracks with canvas rendering.
- **Circular Support**: Features where `start > end` span the genome origin and are rendered as two-part segments.

---

## 6. TypeScript Configuration

| Option                       | Status     | Notes                                                                          |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------ |
| `strictNullChecks`           | ✅ enabled | All null/undefined paths are checked                                           |
| `noUncheckedIndexedAccess`   | 🔜 future  | Enabling would require ~280 targeted fixes across GenomeViewer and domain code |
| `exactOptionalPropertyTypes` | 🔜 future  | Enabling would require updating ~10 object literals in test helpers            |
| `strict` (full mode)         | 🔜 future  | Incrementally approachable after the above two are resolved                    |

---

## 7. Performance Optimizations

- **Canvas for Tracks**: Quantitative data is rendered to Canvas to avoid DOM overhead.
- **Memoization**: Layout calculations wrapped in `useMemo`.
- **Debounced Updates**: Scroll/zoom interactions are debounced.
- **Typed Arrays in Workers**: `Int32Array` matrices for Smith-Waterman reduce GC pressure.

---

## 8. Technology Stack

- **React 19**: Modern UI framework with concurrent features.
- **TypeScript 5** with `strictNullChecks`: Type-safe across the entire codebase.
- **D3.js 7**: Coordinate scaling and color interpolation.
- **react-window**: Virtualized list rendering for large datasets.
- **Tailwind CSS 3**: Utility-first styling, compiled at build time (self-hosted, no CDN).
- **Font Awesome 6**: Icon library (self-hosted, no CDN).
- **Inter & JetBrains Mono**: UI and monospace typefaces (self-hosted).
- **Vite 6**: Build tool and dev server.
- **Vitest 4 + Testing Library**: Unit, component and canvas render tests (jsdom with a canvas-2D recorder), behind a v8 coverage ratchet.

The only `fetch` is the opt-in remote alignment (`src/app/shared/lib/ebiClient.ts`, see §4). The one other off-origin request is the easter egg's final frame, which loads the authors' avatar images from github.com (falling back to an icon when blocked); no user data is involved. Everything else is served from the app's own origin.

---

## 9. Restructure Status

The 2024–2026 modularisation (Phases 0–6, PRs #7–#14) established `src/app/`, `src/domain/bio/`,
`src/workers/`, the modular GenBank parser, worker contracts, and `strictNullChecks`. A
**follow-on architecture restructure** (Phases 0 and A–E) then unified the remaining root code
(`components/`, `services/`, `types.ts`) into the layered `src/` tree in §2 and added the layer
enforcement. That restructure is complete; the table below records what each phase delivered.

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | Architecture skill + `AGENTS.md` + this document (the north star) | done |
| A | Dead-code deletion, type-dedup, `clipInterval` name-collision fix — no new modules | done |
| B | `src/domain/bio/sequence.ts` — consolidate sequence primitives | done |
| C | `services/` → `src/core/`; worker bodies → `src/workers/handlers/`; split `bioUtils`; DOM/presentation → `app/`; kill `types.ts` shim | done |
| D | `GenomeViewer` → `src/app/viewer/` decomposed (`layout.ts` + `tracks/` + `Minimap` + hooks) | done |
| E | High-value JSDoc + comment-policy fixes; **final `ARCHITECTURE.md` accuracy pass** (verify the moved code, drop the 🎯/📍 markers); flip ESLint size guard to `error` + add the import-boundary rule | done |

See `docs/superpowers/specs/2026-07-02-architecture-restructure-design.md` for the full per-phase
plans. **Ownership:** Phase 0 owns this document's architectural description; Phase E owns the
final verification + ESLint enforcement, so the two never overwrite each other.

---

## 10. License

This project is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License** as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. The AGPL v3 was chosen specifically because Dunceious is a web application: it ensures that anyone who runs a modified version as a network service must also publish their source code. See the `COPYING` file for the full license text.
