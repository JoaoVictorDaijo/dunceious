# Dunceious v3.4 - Project Documentation

## 1. Project Overview

Dunceious is a high-performance, web-based bioinformatics tool designed for Multi-Sequence Alignment (MSA) visualization, annotation transposition, and sequence analysis. It bridges the gap between raw genomic data (GenBank) and interactive visual insights, focusing on responsiveness and scientific accuracy.

## 2. Technical Requirements

### 2.1 Functional Requirements

- **GenBank & BED Ingestion**: Parse multi-record GenBank files and BED files for quantitative tracks (line or interval).
- **FASTA Import** (Batch): Upload one or more FASTA files to add sequences to the workspace. Duplicate IDs are automatically de-duplicated with numeric suffixes (e.g., `seq1 (1)`, `seq1 (2)`). Molecule type (nucleotide vs protein) is detected per-record and enforced — sessions must be homogeneous.
- **Alignment Overlay**: Upload a pre-aligned FASTA file using the **Upload Alignment** action to apply externally computed alignments to already-loaded records. Sequences are matched by record ID and must all have equal lengths; mismatches are rejected with an error log.
- **External Alignment**: Dunceious does not include a built-in MSA aligner. Users compute alignments externally (e.g., MAFFT, MUSCLE, Clustal Omega) and import the result via the Alignment Overlay action (see above).
- **Sequence Search**:
  - **Exact / IUPAC Mode**: Regex-based degenerate search. Supported codes depend on the active session type:
    - **Nucleotide**: Standard IUPAC codes — `R`, `Y`, `S`, `W`, `K`, `M`, `B`, `D`, `H`, `V`, `N`.
    - **Protein**: All 20 standard amino acids plus ambiguity codes — `B` (D/N), `Z` (E/Q), `J` (I/L), `X` (all 20), `U` (selenocysteine), `O` (pyrrolysine).
      Gaps in aligned sequences are automatically skipped.
  - **Fuzzy Mode**: Smith-Waterman local alignment with affine gap penalties (Gotoh's algorithm). For nucleotide sessions, both the forward strand and reverse complement are searched automatically. For protein sessions, reverse-complement search is suppressed (not applicable). Results are ranked by alignment score; a "Min Match Confidence" slider filters results by percentage of the best score found.
- **Quantitative Tracks**:
  - **Line Tracks**: For continuous data like GC content or conservation scores.
  - **Interval Tracks**: For discrete regions with associated values (e.g., BED files). Supports dynamic packing to prevent overlap and automatic vertical scaling to show all data.
- **Coordinate Transposition**: Dynamically map original genomic feature coordinates (raw indices) to the new "aligned space" (indices including gaps `-`).
- **Interactive Viewport**:
  - **Unified Scroll**: Synchronized vertical scrolling for sequence labels and alignment data using `react-window` for virtualization.
  - **Sticky Headers**: Sequence names remain visible while scrolling horizontally.
  - **Semantic Zoom**: Variable detail levels (from global mismatch density to individual nucleotide bases and amino acid translations).
  - **Interaction Modes**: Toggle between **Pan** (navigation) and **Select** (region highlighting).
- **Data Export**: Export data in multiple formats:
  - **FASTA**: Full alignment or selected region.
  - **GFF**: Feature annotations in GFF3 format.
  - **GenBank**: One or more records in GenBank flat-file format.
  - **Selection JSON**: Selected region as a JSON project snapshot (0-based half-open intervals).
  - **Project JSON**: Full workspace state (records, features, colors, UI toggles) for project persistence.

### 2.2 Non-Functional Requirements

- **Performance**: High-density rendering using D3.js and SVG to handle thousands of base pairs across multiple records.
- **Aesthetics**: High-contrast, scientific UI using Tailwind CSS and a professional dark/light theme hybrid.
- **Accessibility**: Use of distinct color palettes for nucleotides and features to ensure visual clarity.

## 3. System Architecture

### 3.1 Frontend Stack

- **Framework**: React 19 (Hooks-based architecture).
- **Language**: TypeScript 5 (strict type checking via `tsc --noEmit`).
- **Visualization**: D3.js 7 for high-precision SVG coordinate math and rendering.
- **Styling**: Tailwind CSS (loaded via CDN) for a modular, responsive UI.
- **Icons**: FontAwesome 6 (loaded via CDN).
- **Build Tool**: Vite 6 (dev server on port 3000, HMR enabled).

### 3.2 Component Architecture

**Application Hooks** (`src/app/hooks/`) — Custom React hooks that encapsulate state and logic:

- **`useAppLogger`**: Manages the append-only activity log with a stable `addLog` callback.
- **`useBioWorker`**: Manages the bioWorker lifecycle, `records` / `transposedRecords` / `consensus` state, and automatic ID deduplication via `uniquifyId()`.
- **`useFeatureManager`**: Feature CRUD operations (create, edit, delete), search-to-annotation bridge via `addAnnotationFromSearch`, and record visibility toggling.
- **`useFileHandlers`**: Handles all file uploads (with molecule-type enforcement to prevent mixing) and data exports (FASTA, GFF, GenBank, JSON).
- **`useSearchWorker`**: Bridges the search worker, derives `isProteinSession`, and exposes grouped results with join helpers.

**Components** (`src/app/components/` and `components/`):

- **`App.tsx`**: Composition root. Wires together all hooks and manages the top-level layout and event dispatching.
- **`GenomeViewer.tsx`**: The core rendering engine. Implements D3 coordinate scaling and SVG-based visualization of the "Feature-above-Sequence" layout with virtualization via `react-window`.
- **`TopNav.tsx`**: Top navigation bar with tab switcher, drag/select mode toggle, viewport display toggles (annotations, tracks, translation, conservation), and session-type gradient accent.
- **`Sidebar.tsx`**: Tab panel for file upload, record list, feature list, activity logs, and search UI.
- **`SearchPanel.tsx`**: Sequence search interface with IUPAC and fuzzy modes, grouped results, and strand selector (hidden for protein sessions).
- **`StatusBar.tsx`**: Bottom status bar showing selection metrics, session molecule-type indicator, and license link.
- **`RecordDetailsModal.tsx`**: Modal viewer for record metadata and feature information.
- **`FeatureEditorModal.tsx`**: Modal editor for creating and modifying annotations, with support for circular features.
- **`DatabaseHubPanel.tsx`**: Records and features table with bulk export actions.
- **`ProcessingOverlay.tsx`**: Full-screen loading overlay during file processing.

**Shared Services** (`services/` and `src/domain/bio/`):

- **`services/genbank/`**: Modular GenBank flat-file parser (entry point: `services/genbank/index.ts`). Submodules: `recordSplitter.ts`, `headerParser.ts`, `locationParser.ts`, `qualifierParser.ts`, `featureParser.ts`, `toSeqRecord.ts`.
- **`src/domain/bio/`**: Pure domain logic with no DOM or worker globals:
  - `coordinate.ts` — coordinate transposition from raw to aligned space
  - `consensus.ts` — consensus sequence calculation
  - `intervals.ts` — interval utilities
  - `types.ts` — shared TypeScript types (`SeqRecord`, `BioFeature`, `QuantitativeTrack`, etc.)
- **`services/bioUtils.ts`**: Utilities for genetic code translation (codon → amino acid), color-coding, and FASTA/GFF/GenBank export.
- **`services/searchLogic.ts`**: Pure search functions — `degenerateToRegex(query, moleculeType)` for IUPAC mode and `smithWaterman()` for fuzzy mode.

**Web Workers** (`src/workers/`):

- **`bioWorker.ts`**: Handles all file parsing (GenBank, FASTA, BED, GFF) and sequence processing off the main thread. Detects molecule type per-record and reports it in the response.
- **`searchWorker.ts`**: Runs exact (IUPAC regex) and fuzzy (Smith-Waterman) sequence searches off the main thread. Accepts `moleculeType` in requests to suppress reverse-complement search for protein sessions.
- **`protocol.ts`**: Typed message contracts (discriminated unions) for all worker communication.

## 4. Technical Implementation Details

### 4.1 Feature-above-Sequence Layout

To maximize readability, the viewport uses a layered approach for each record:

1.  **Annotation Layer (Top)**: Features are packed into non-overlapping rows.
2.  **Sequence Layer (Bottom)**: Nucleotide bases are rendered as a grid.
3.  **Translation Overlay**: In nucleotide sessions, when zoomed in sufficiently (>45x), CDS features automatically display their corresponding amino acid translation directly over the nucleotide grid. This layer is not shown in protein sessions.

### 4.2 Coordinate Transposition Logic

When an alignment is performed, gaps (`-`) are inserted. To keep annotations accurate:

- Let `S` be the raw sequence and `A` be the aligned sequence.
- For a feature at `[start, end]` in `S`, the new position in `A` is calculated by iterating through `A` and counting non-gap characters until the original indices are reached.

### 4.3 Unified Scrolling Context

The layout uses CSS `sticky` positioning and a shared overflow container. This ensures that while the user scrolls vertically through a large list of sequences, the labels stay aligned with the sequences, and both scroll together, maintaining the visual relationship.

## 5. Workflow Data Flow

1.  **Input**: User uploads files via the UI:
    - `.gb`/`.gbk` files (GenBank, batch load)
    - `.fasta`/`.fa` files (FASTA batch load or alignment overlay)
    - `.gff`/`.bed` annotation files (merge into existing records by ID/name/accession)
2.  **Parsing**: `bioWorker.ts` converts files to `SeqRecord` objects. Molecule type (nucleotide vs protein) is detected per-record from the sequence content (GenBank: `LOCUS` line; FASTA: presence of protein-exclusive IUPAC codes). Duplicate record IDs are de-duplicated with numeric suffixes.
3.  **Alignment Overlay** (optional): User uploads a pre-aligned FASTA via the **Upload Alignment** action. `bioWorker.ts` matches IDs and updates the `alignedSequence` field of matching records without altering their features or sequence data.
4.  **Transposition**: When an alignment is active, `processTransposition` updates `BioFeature` indices to map original genomic coordinates to the new "aligned space" (indices including gaps).
5.  **Rendering**: `GenomeViewer` receives the records and renders the SVG elements. Translation overlays are shown only in nucleotide sessions.
6.  **Search**: When a user enters a query, `searchWorker.ts` runs exact (IUPAC regex) or fuzzy (Smith-Waterman) search, passing the session's `moleculeType` to suppress reverse-complement for protein sessions. Results are ranked and highlighted in the viewer.

## 6. License

This software is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License** as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See the `COPYING` file for details.
