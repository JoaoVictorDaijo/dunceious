# Dunceious Architecture Overview

> Current version: **v3.4 (Modular Workspace)**

This document outlines the high-level architecture of the Dunceious bioinformatics platform.

## 1. Core Principles
- **Data-Driven Rendering**: The UI is a direct reflection of the underlying `SeqRecord` state.
- **Worker-Based Processing**: Heavy parsing, alignment, and search tasks are offloaded to Web Workers to keep the UI thread responsive.
- **Typed Worker Contracts**: All messages crossing the main-thread ↔ worker boundary are defined as discriminated-union types in `src/workers/protocol.ts`. There is no `any` usage on worker message paths.
- **Shared Domain Logic**: Pure business logic (coordinate transposition, consensus calculation) lives in `src/domain/bio/`. Workers import from this shared module—no algorithm is duplicated.
- **Layered Visualization**: The genome viewer uses a multi-layered approach (Annotations → Tracks → Sequence) to handle high-density data.

---

## 2. Folder Structure

```
/
├── components/           # Root-level legacy UI components (GenomeViewer)
├── services/             # Shared services consumed by workers & app
│   ├── genbank/          # Modular GenBank parser (Phase 4)
│   │   ├── recordSplitter.ts
│   │   ├── headerParser.ts
│   │   ├── locationParser.ts
│   │   ├── qualifierParser.ts
│   │   ├── featureParser.ts
│   │   ├── toSeqRecord.ts
│   │   └── index.ts      ← canonical entry point
│   ├── alignmentLogic.ts # mockAlign (demo only; prod logic is in src/domain/bio/)
│   ├── bioUtils.ts       # Export/import/slice utilities
│   └── searchLogic.ts    # Pure search functions (exact, IUPAC, Smith-Waterman)
├── src/
│   ├── app/
│   │   ├── App.tsx       # Composition root – state, workers, event wiring
│   │   └── components/   # Extracted presentational components
│   ├── domain/
│   │   └── bio/          # Pure domain logic (no DOM/worker globals)
│   │       ├── coordinate.ts   # transposeCoordinates, processTransposition
│   │       ├── consensus.ts    # calculateConsensus
│   │       ├── intervals.ts    # interval utilities
│   │       ├── types.ts        # SeqRecord, BioFeature, … (canonical types)
│   │       └── index.ts        # barrel export
│   └── workers/
│       ├── protocol.ts         # ← Worker message contracts (Phase 5)
│       ├── bioWorker.ts        # Parsing & transposition worker
│       ├── searchWorker.ts     # Sequence search worker
│       └── __tests__/
│           └── protocol.test.ts
└── types.ts              # Root-level type re-exports (legacy path)
```

### Extension Rules
- **New domain algorithms**: add to `src/domain/bio/` and export from `index.ts`. No DOM imports.
- **New worker**: create `src/workers/<name>Worker.ts`, add request/response types to `src/workers/protocol.ts`, wire in `App.tsx`.
- **New component**: create under `src/app/components/` if app-scoped, or `components/` if it needs to be shared with legacy paths.
- **New service**: add to `services/` when it is shared between workers and the app; keep free of React imports.

---

## 3. Worker Contract Usage

### Protocol file (`src/workers/protocol.ts`)
All messages are typed as discriminated unions:
- **Bio Worker requests** (`BioWorkerRequest`): `PROCESS_RECORDS | PARSE_GENBANK | PARSE_FASTA | PARSE_ANNOTATIONS`
- **Bio Worker responses** (`BioWorkerResponse`): `SUCCESS | PARSE_SUCCESS | FASTA_SUCCESS | ANNOTATIONS_SUCCESS | ERROR`
- **Search Worker requests** (`SearchWorkerRequest`): `{ searchQuery, records, mode, options }`
- **Search Worker responses** (`SearchWorkerResponse`): `{ results } | { error }`

### How to add a new worker message type
1. Add request and response interfaces to `src/workers/protocol.ts`.
2. Add the new interface to the appropriate union type.
3. Handle the new `type` branch in the relevant worker's `onmessage` handler.
4. Use the typed `BioWorkerRequest` / `SearchWorkerRequest` when calling `postMessage` in `App.tsx`.
5. Add a case in the typed `onmessage` handler in `App.tsx`.
6. Add integration tests in `src/workers/__tests__/protocol.test.ts`.

---

## 4. Data Processing Pipeline

### Ingestion (`src/workers/bioWorker.ts`)
- **GenBank Parser**: Delegates to `services/genbank/index.ts` (modular, fully tested).
- **FASTA Parser**: Parses pre-aligned FASTA files and applies aligned sequences back to loaded records.
- **BED / BedGraph Parser**: Extracts genomic intervals and scores; renders as interval or line tracks.
- **GFF3 Parser**: Merges GFF3 features into existing records, matching by sequence ID.
- **Annotation Import**: Merges external annotation files (GFF/BED) into existing records.
- **Transposition**: Delegates to `src/domain/bio/coordinate.ts → processTransposition`.

### Consensus (`src/domain/bio/consensus.ts`)
- Generates a master consensus sequence across all aligned records to identify conservation.
- Imported directly by `bioWorker.ts` (no duplication).

### Search (`src/workers/searchWorker.ts`)
- **Exact / IUPAC Mode**: `degenerateToRegex` from `services/searchLogic.ts`.
- **Fuzzy Mode (Smith-Waterman)**: `smithWaterman` from `services/searchLogic.ts` with affine gap penalties (Gotoh). Results sorted by descending score.

---

## 5. Component Hierarchy

### `src/app/App.tsx` (Composition Root)
- Holds all application state: `records`, `transposedRecords`, `consensus`, search state, UI toggles.
- Owns `bioWorkerRef` and `searchWorkerRef`; dispatches typed `BioWorkerRequest` / `SearchWorkerRequest` messages.
- Consumes typed `BioWorkerResponse` / `SearchWorkerResponse` messages—no `any` in worker message paths.

### `src/app/components/` (Extracted Components)
- `ProcessingOverlay` – full-screen loading overlay
- `StatusBar` – bottom status bar with selection metrics
- `TopNav` – toolbar with file import actions
- `Sidebar` – tab panel: alignment list / features list
- `RecordDetailsModal` – record metadata viewer
- `FeatureEditorModal` – annotation editor (supports circular features)
- `SearchPanel` – sequence search UI with grouped results
- `DatabaseHubPanel` – NCBI/EBI database browser

### `components/GenomeViewer.tsx` (Rendering Engine)
- **Virtualization**: `react-window` row-virtualized list.
- **Feature Packing**: Non-overlapping annotation rows (greedy interval packing).
- **Track Packing**: Quantitative BED/BedGraph tracks with canvas rendering.
- **Circular Support**: Features where `start > end` span the genome origin and are rendered as two-part segments.

---

## 6. TypeScript Configuration

| Option | Status | Notes |
|---|---|---|
| `strictNullChecks` | ✅ enabled | All null/undefined paths are checked |
| `noUncheckedIndexedAccess` | 🔜 future | Enabling would require ~280 targeted fixes across GenomeViewer and domain code |
| `exactOptionalPropertyTypes` | 🔜 future | Enabling would require updating ~10 object literals in test helpers |
| `strict` (full mode) | 🔜 future | Incrementally approachable after the above two are resolved |

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

## 9. License
This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** license. Commercial use is strictly prohibited.
