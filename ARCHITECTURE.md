# Dunceious Architecture Overview

> Current version: **v3.3 (Unified Workspace)**  
> Refactor phase: **Phase 2 complete** — UI components extracted; Phase 3 (hooks) and Phase 4 (parser) pending.

This document outlines the high-level architecture of the Dunceious bioinformatics platform.

## 1. Core Principles
- **Data-Driven Rendering**: The UI is a direct reflection of the underlying `SeqRecord` state.
- **Worker-Based Processing**: Heavy parsing, alignment, and search tasks are offloaded to Web Workers to keep the UI thread responsive.
- **Layered Visualization**: The genome viewer uses a multi-layered approach (Annotations -> Tracks -> Sequence) to handle high-density data.
- **Feature-First Modules**: Business logic is organized by feature (`alignment`, `search`, `ingestion`, `viewer`) under `src/features/` for maximum cohesion.

## 2. Project Layout

```text
dunceious/
  src/
    app/
      App.tsx                    # Composition root (state + orchestration)
      components/                # UI components extracted from App.tsx
        DatabaseHubPanel.tsx
        FeatureEditorModal.tsx
        ProcessingOverlay.tsx
        RecordDetailsModal.tsx
        SearchPanel.tsx
        Sidebar.tsx
        StatusBar.tsx
        TopNav.tsx
    features/                    # Feature-first modules (Phase 3+ target)
      alignment/                 #   components/, hooks/, services/
      ingestion/                 #   components/, hooks/, services/
      search/                    #   components/, hooks/, services/
      viewer/                    #   components/, hooks/
    domain/
      bio/
        types.ts                 # Core domain types (SeqRecord, BioFeature, …)
    workers/
      bioWorker.ts               # GenBank/FASTA/BED parsing + transposition
      searchWorker.ts            # Exact/IUPAC/fuzzy search (Smith-Waterman)
    shared/                      # Cross-cutting helpers (Phase 3+ target)
      constants/, errors/, hooks/, ui/, utils/
  components/
    GenomeViewer.tsx             # Rendering engine (react-window + D3)
  services/
    alignmentLogic.ts            # Gap insertion, consensus calculation
    bioUtils.ts                  # Export helpers, color mapping, sequence utils
    genbankParser.ts             # GenBank flat-file parser
    searchLogic.ts               # Smith-Waterman traceback + IUPAC regex
  App.tsx                        # Compatibility shim → src/app/App.tsx
  types.ts                       # Compatibility shim → src/domain/bio/types.ts
  index.tsx                      # React entry point
```

### Compatibility shims
`App.tsx` and `types.ts` at the project root are thin re-export shims kept for
backwards compatibility during the incremental migration. They will be removed
once all consumers have been updated to import from their canonical `src/` paths.

## 3. Component Hierarchy

### `src/app/App.tsx` (The Composition Root)
- **State Management**: Holds the master list of `records`, `alignmentParams`, and `workflowStatus`.
- **Workflow Control**: Manages the transition between Ingestion, Alignment, and Visualization.
- **Event Handling**: Coordinates communication between the sidebar, top navigation, and the main viewer.
- **Search Coordination**: Dispatches search queries to `searchWorker.ts` and manages result state, filtering, and navigation.

### `src/app/components/` (Extracted UI Regions)
Extracted from `App.tsx` in Phase 2. Each component is a pure-UI slice that receives all state via props:
- **`TopNav`** — file-load bar, workflow step controls, zoom/export buttons.
- **`Sidebar`** — record list, feature list, alignment controls.
- **`SearchPanel`** — query input, result navigation, fuzzy-search settings.
- **`DatabaseHubPanel`** — external database connectivity and annotation import.
- **`RecordDetailsModal`** / **`FeatureEditorModal`** — detail and edit dialogs.
- **`ProcessingOverlay`** / **`StatusBar`** — loading indicator and status log.

### `components/GenomeViewer.tsx` (The Rendering Engine)
- **Virtualization**: Uses `react-window` to render only the visible sequences, allowing the platform to scale to hundreds of records.
- **Layout Engine**: 
  - **Feature Packing**: Dynamically calculates non-overlapping rows for biological features (ORFs, CDS).
  - **Track Packing**: Calculates vertical space for quantitative tracks (BED files), expanding height as needed for overlapping intervals.
- **Rendering Sub-components**:
  - `SequenceTrack`: Handles the nucleotide grid, amino acid translations, and conservation highlighting.
  - `QuantitativeTrack`: Uses HTML5 Canvas for high-performance rendering of line and interval data.
  - `SVG Layer`: Handles interactive annotations, selection boxes, and tooltips.

### `src/domain/bio/types.ts` (Shared Type Definitions)
- Defines the core domain types used across the entire codebase: `SeqRecord`, `BioFeature`, `AlignmentParams`, `SearchResult`, `WorkflowStep`, and others.
- Canonical location; `types.ts` at the project root re-exports from here.

## 4. Data Processing Pipeline

### Ingestion (`src/workers/bioWorker.ts`)
- **GenBank Parser**: Uses regular expressions to extract metadata, sequences, and features from GenBank flat files.
- **FASTA Parser**: Parses pre-aligned FASTA files and applies the resulting aligned sequences back to loaded records (sequences must match by ID).
- **BED Parser**: Extracts genomic intervals and scores. Automatically identifies whether data should be rendered as a line or interval track.
- **Annotation Import**: Merges external annotation files (GFF/BED) into existing records, matching by record ID, name, or accession.
- **Transposition**: Maps original feature coordinates to aligned coordinates after gaps are introduced.

### Alignment (`services/alignmentLogic.ts`)
- **Gap Insertion**: Implements gap-aware alignment logic.
- **Consensus Calculation**: Generates a master consensus sequence to identify mismatches and conservation levels across all records.

### Search (`src/workers/searchWorker.ts`)
- **Exact / IUPAC Mode**: Builds a regular expression from the query using the full IUPAC degenerate nucleotide alphabet (e.g. `N`=[ACGT], `R`=[AG], `Y`=[CT]) and matches it against each record's sequence.
- **Fuzzy Mode (Smith-Waterman)**: Runs the Smith-Waterman local alignment algorithm with affine gap penalties (Gotoh's algorithm) using typed `Int32Array` matrices for memory efficiency. Both the forward strand and its reverse complement are searched. Results are scored and returned sorted by descending alignment score.

## 5. Performance Optimizations
- **Canvas for Tracks**: Quantitative data is rendered to Canvas to avoid DOM overhead for thousands of data points.
- **Memoization**: Heavy layout calculations (packing algorithms) are wrapped in `useMemo` to prevent redundant processing during scrolls or zooms.
- **Debounced Updates**: UI updates for zoom and scroll are debounced to ensure smooth interaction at high zoom levels.
- **Typed Arrays in Workers**: `Int32Array` matrices in the Smith-Waterman implementation reduce heap allocation and improve cache performance.

## 6. Refactor Roadmap

| Phase | Status      | Description                                       |
|-------|-------------|---------------------------------------------------|
| 0     | ✅ Complete | CI, lint gates, smoke tests, PR template          |
| 1     | ✅ Complete | `src/app/`, `src/domain/`, `src/workers/` layout  |
| 2     | ✅ Complete | Extract 8 UI components from `App.tsx`            |
| 3     | ⏳ Pending  | Extract hooks into `src/features/*/hooks/`        |
| 4     | ⏳ Pending  | Modularize GenBank parser into sub-modules        |
| 5     | ⏳ Pending  | Worker contracts (`protocol.ts`) + type safety    |
| 6     | ⏳ Pending  | Remove shims, stricter TS, architecture doc delta |

## 7. Technology Stack
- **React 19**: Modern UI framework with concurrent features.
- **TypeScript 5**: Strict type safety across the entire codebase.
- **D3.js 7**: Used for coordinate scaling and color interpolation.
- **react-window**: Virtualized list rendering for large datasets.
- **Tailwind CSS** (loaded via CDN): Utility-first styling for a responsive, scientific interface.
- **FontAwesome 6** (loaded via CDN): Icon library.
- **Vite 6**: Fast build tool and dev server.

## 8. License
This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** license. Commercial use is strictly prohibited.
