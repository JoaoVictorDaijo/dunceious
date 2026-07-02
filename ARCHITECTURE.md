# Dunceious Architecture Overview

> **This is the canonical architecture reference (the north star).** The codebase is
> mid-restructure toward a single layered `src/` tree. Sections tagged **🎯 Target** describe
> the destination the restructure is converging on; notes tagged **📍 Current** describe
> what exists today and will be reconciled/removed as phases land. The full phase plan is in
> `docs/superpowers/specs/2026-07-02-architecture-restructure-design.md`. **Phase E** does the
> final accuracy pass (verifying the doc against the moved code and dropping the 🎯/📍 markers)
> and flips the ESLint enforcement — Phase 0 owns everything else in this document.

This document outlines the high-level architecture of the Dunceious client-side genome-viewer
SPA (React 19 + TypeScript, Vite, Web Workers, d3, react-window).

## 1. Core Principles

- **Data-Driven Rendering**: The UI is a direct reflection of the underlying `SeqRecord` state.
- **Worker-Based Processing**: Heavy parsing, alignment, and search tasks are offloaded to Web Workers to keep the UI thread responsive.
- **Typed Worker Contracts**: All messages crossing the main-thread ↔ worker boundary are defined as discriminated-union types in `src/workers/protocol.ts`. There is no `any` usage on worker message paths.
- **Shared Domain Logic**: Pure business logic (coordinate transposition, consensus calculation) lives in `src/domain/bio/`. Workers import from this shared module—no algorithm is duplicated.
- **Layered Visualization**: The genome viewer uses a multi-layered approach (Annotations → Tracks → Sequence) to handle high-density data.
- **Layered under `src/` (🎯 Target)**: code is grouped by technical role into four layers — `domain ← core ← workers/handlers ← app` — and imports only ever point **down** the stack. See §2.
- **Single canonical source of truth**: architecture rules live only in this document; `AGENTS.md` and the `dunceious-architecture` Claude skill are thin doorways that link here, never copies. Model types have one home (`src/domain/bio/types.ts`); wire contracts have one home (`src/workers/protocol.ts`).

---

## 2. Folder Structure

### 🎯 Target — the layered `src/` tree (destination of the restructure)

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
│   │                    #   detection, gap↔ungapped mapping, sessionMoleculeType
│   └── index.ts         # barrel
│
├── core/                # Pure format/search logic (was root services/). Imports domain only.
│   ├── genbank/         # read sub-parsers + serialize.ts (exportToGenBank)
│   ├── formats/         # fasta.ts (parse + exportToFasta), annotations.ts (BED/GFF3/BedGraph + exportToGff)
│   └── search/          # query.ts (degenerate→regex), align.ts (smithWaterman), exact.ts, fuzzy.ts — NO protocol import
│
├── workers/             # Thin shells + typed contracts + worker bodies.
│   ├── protocol.ts      # message contracts (may reference domain types)
│   ├── bio.worker.ts / search.worker.ts    # thin shells
│   └── handlers/
│       ├── bio.ts       # handleBioMessage — orchestrates core + domain
│       └── search.ts    # runSearch + collectSeededFuzzyHits
│
└── app/                 # The React application. May import everything below it.
    ├── main.tsx + index.css   # entry (moved from root; index.html updated)
    ├── App.tsx          # composition root
    ├── logic/           # pure reducers/view-model (+ recordRemoval, runInlineSearch)
    ├── hooks/
    ├── components/      # modals, panels, nav, sidebar
    ├── viewer/          # GenomeViewer decomposed: slim container + layout.ts + tracks/ + Minimap + hooks + colors.ts
    └── lib/download.ts  # downloadBlob (the one DOM-coupled fn, kept out of core)
```

Root keeps only true root things: configs, `index.html`, `docs/`, `bench/`, `perf/`,
`scripts/`, `.github/`. In the target, root `components/`, `services/`, and `types.ts` no
longer exist.

### Layer import rules (the contract)

1. `src/domain/**` imports **only** `domain`. No DOM, React, core, workers, or app.
2. `src/core/**` imports `domain` **only**. Never workers, app, React, or DOM.
3. `src/workers/**` imports `core` + `domain` + its own `protocol`.
4. `src/app/**` may import anything below it. All React + DOM + browser I/O lives here.
5. **One canonical home per type:** model types in `domain/bio/types.ts`; wire contracts in
   `workers/protocol.ts` (referencing domain types). No duplicate `SearchResult` /
   `SearchOptions` / FASTA-record shapes.

These boundaries will be **enforced by an import-boundary ESLint rule added in Phase E**
(alongside flipping the `max-lines` guard to `error`). Until then they are a convention.

### 📍 Current — layout during migration

Until the restructure completes, some source still lives at the repo root and under a root
`services/` directory (a legacy name — it holds pure functions, not I/O clients):

- `components/GenomeViewer.tsx` — the rendering engine (→ `src/app/viewer/`, decomposed, in Phase D).
- `services/` — pure format/search logic + helpers (`genbank/`, `parsers/`, `search/`,
  `bio/handleBioMessage.ts`, `searchLogic.ts`, `bioUtils.ts`, `idHelpers.ts`,
  `moleculeType.ts`); becomes `src/core/` + `src/workers/handlers/` in Phase C.
- `types.ts`, `index.tsx`, `index.css` at root — folded into `src/app/` in Phase C
  (`index.html`'s `/index.tsx` entry is repointed then).
- `src/app/`, `src/domain/bio/`, `src/workers/` already exist and anchor the target.

Per-phase migration status is in §10.

### Extension rules — where does new code go?

- **New domain algorithm** → `src/domain/bio/<file>.ts`; export from `index.ts`. Imports nothing outside `domain`.
- **New file-format parser / search primitive** → `src/core/formats/` or `src/core/search/`; imports `domain` only; wire it into a `src/workers/handlers/*` body.
- **New worker message type** → add request/response to `src/workers/protocol.ts` (reference domain types), handle the branch in `src/workers/handlers/{bio,search}.ts`, dispatch from the relevant `src/app/hooks/*` hook.
- **New UI component** → `src/app/components/` (or `src/app/viewer/` if it belongs to the genome viewer); may import anything below it.

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
3. Handle the new `type` branch in the relevant worker's `onmessage` handler.
4. Use the typed `BioWorkerRequest` / `SearchWorkerRequest` when calling `postMessage` in `App.tsx`.
5. Add a case in the typed `onmessage` handler in `App.tsx`.
6. Add integration tests in `src/workers/__tests__/protocol.test.ts`.

> **🎯 Target:** the branch logic lives in the pure handler (`src/workers/handlers/bio.ts` / `search.ts`), not in the worker's `onmessage` — the worker shell is a one-line `postMessage(handler(e.data))`. Dispatch from the relevant `src/app/hooks/*` hook. See §2 and the skill's `where-does-x-go.md`.

---

## 4. Data Processing Pipeline

### Ingestion (`src/workers/bioWorker.ts`)

- **GenBank Parser**: Delegates to `services/genbank/index.ts` (modular, fully tested). Supports both nucleotide and amino-acid (protein) records; molecule type is read from the `LOCUS` line (`aa` keyword → protein).
- **FASTA Parser**: Two distinct ingestion modes, distinguished by the `asAlignment` flag on `ParseFastaRequest`:
  - **Batch load** (`asAlignment` absent/false): Each FASTA record becomes a new workspace entry. Molecule type (`dna | rna | protein`) is detected per-record by scanning the first 200 residues for protein-exclusive IUPAC characters (D, E, F, H, I, K, L, M, P, Q, R, S, V, W, Y). Duplicate record IDs are automatically de-duplicated with a numeric suffix (`seq1 → seq1 (1) → seq1 (2)`) via `makeUniqueId()` (in `src/app/logic/bioResponse.ts`).
  - **Alignment overlay** (`asAlignment: true`): Applied via the **Upload Alignment** action. Every ID in the file must match an existing workspace record exactly, and all sequences must have equal length; any mismatch is rejected with an error log entry. Matching records have their `alignedSequence` field updated without altering sequence or feature data.
- **Molecule-type enforcement** (`useFileHandlers.ts`): Before dispatching a parse request, `sniffFastaCategory` / `sniffGenBankCategory` detect the incoming molecule type. If it conflicts with the current session type (nucleotide vs protein), the upload is blocked and logged. Sessions must be homogeneous.
- **BED / BedGraph Parser**: Extracts genomic intervals and scores; renders as interval or line tracks.
- **GFF3 Parser**: Merges GFF3 features into existing records, matching by sequence ID.
- **Annotation Import**: Merges external annotation files (GFF/BED) into existing records.
- **Transposition**: Delegates to `src/domain/bio/coordinate.ts → processTransposition`.

### Consensus (`src/domain/bio/consensus.ts`)

- Generates a master consensus sequence across all aligned records to identify conservation.
- Imported directly by `bioWorker.ts` (no duplication).

### Search (`src/workers/searchWorker.ts`)

- **Exact / IUPAC Mode**: `degenerateToRegex(query, moleculeType)` from `services/searchLogic.ts`. The `moleculeType` parameter selects between two IUPAC character maps:
  - **Nucleotide** (`IUPAC_MAP`): standard degenerate codes — `R`=[AG], `Y`=[CT], `S`=[GC], `W`=[AT], `K`=[GT], `M`=[AC], `B`=[CGT], `D`=[AGT], `H`=[ACT], `V`=[ACG], `N`=[ACGT].
  - **Protein** (`PROTEIN_IUPAC_MAP`): all 20 standard amino acids plus ambiguity codes — `B`=[DN], `Z`=[EQ], `J`=[IL], `X`=[all 20 AAs], `U` (selenocysteine), `O` (pyrrolysine).
- **Reverse-complement search**: Performed automatically for nucleotide sessions (forward + reverse strands). Suppressed entirely for protein sessions where strand orientation is not applicable.
- **Session-type propagation**: `useSearchWorker` derives `isProteinSession = records.some(r => r.moleculeType === 'protein')` and passes `moleculeType: isProteinSession ? 'protein' : 'dna'` in every `SearchWorkerRequest`.
- **Fuzzy Mode (Smith-Waterman)**: `smithWaterman` from `services/searchLogic.ts` with affine gap penalties (Gotoh). Results sorted by descending score.

---

## 5. Component Hierarchy

### `src/app/App.tsx` (Composition Root)

- Holds all application state: `records`, `transposedRecords`, `consensus`, search state, UI toggles.
- Owns `bioWorkerRef` and `searchWorkerRef`; dispatches typed `BioWorkerRequest` / `SearchWorkerRequest` messages.
- Consumes typed `BioWorkerResponse` / `SearchWorkerResponse` messages—no `any` in worker message paths.

### `src/app/hooks/` (Custom Hooks)

State and logic extracted from `App.tsx` into purpose-built hooks, each with a single responsibility:

- `useAppLogger` – append-only activity log, stable `addLog` callback
- `useBioWorker` – worker lifecycle, `records` / `transposedRecords` / `consensus` state, ID deduplication
- `useFeatureManager` – feature CRUD, search-to-annotation bridge, record visibility toggle
- `useFileHandlers` – file upload handlers (with molecule-type enforcement) and export helpers
- `useSearchWorker` – search worker bridge; derives `isProteinSession`; exposes grouped results and join helpers

### `src/app/components/` (Presentational Components)

- `ProcessingOverlay` – full-screen loading overlay
- `StatusBar` – bottom status bar: selection metrics, session molecule-type chip, license link
- `TopNav` – top navigation: tab switcher, drag/select mode toggle, viewport display toggles; translation button disabled for protein sessions; session-type gradient accent strip
- `Sidebar` – tab panel: file upload, alignment record list / feature list / search
- `SearchPanel` – sequence search UI with grouped results; strand selector hidden for protein sessions
- `RecordDetailsModal` – record metadata viewer
- `FeatureEditorModal` – annotation editor (supports circular features)
- `DatabaseHubPanel` – records and features table with export actions

### `components/GenomeViewer.tsx` (Rendering Engine)

- **Virtualization**: `react-window` row-virtualized list.
- **Feature Packing**: Non-overlapping annotation rows (greedy interval packing).
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
- **Tailwind CSS** (CDN): Utility-first styling.
- **FontAwesome 6** (CDN): Icon library.
- **Vite 6**: Build tool and dev server.
- **Vitest 4**: Unit and integration tests (252 tests as of v3.4).

---

## 10. Restructure Status

The 2024–2026 modularisation (Phases 0–6, PRs #7–#14) established `src/app/`, `src/domain/bio/`,
`src/workers/`, the modular GenBank parser, worker contracts, and `strictNullChecks`. A
**follow-on architecture restructure** is now in flight to unify the remaining root code
(`components/`, `services/`, `types.ts`) into the layered `src/` tree in §2 and to enforce the
layer boundaries. It does **not** claim the structure is finished; the tracking table below is
the source of truth for what has moved.

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | Architecture skill + `AGENTS.md` + this reconcile (the north star) | 🎯 in progress |
| A | Dead-code deletion, type-dedup, `clipInterval` name-collision fix — no new modules | planned |
| B | `src/domain/bio/sequence.ts` — consolidate sequence primitives | planned |
| C | `services/` → `src/core/`; worker bodies → `src/workers/handlers/`; split `bioUtils`; DOM/presentation → `app/`; kill `types.ts` shim | planned |
| D | `GenomeViewer` → `src/app/viewer/` decomposed (`layout.ts` + `tracks/` + `Minimap` + hooks) | planned |
| E | High-value JSDoc + comment-policy fixes; **final `ARCHITECTURE.md` accuracy pass** (verify the moved code, drop the 🎯/📍 markers); flip ESLint size guard to `error` + add the import-boundary rule | planned |

See `docs/superpowers/specs/2026-07-02-architecture-restructure-design.md` for the full per-phase
plans. **Ownership:** Phase 0 owns this document's content (the target description); Phase E owns
the final verification + ESLint enforcement, so the two never overwrite each other.

---

## 9. License

This project is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License** as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. The AGPL v3 was chosen specifically because Dunceious is a web application: it ensures that anyone who runs a modified version as a network service must also publish their source code. See the `COPYING` file for the full license text.
