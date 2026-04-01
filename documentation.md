# Dunceious v3.4 - Project Documentation

## 1. Project Overview
Dunceious is a high-performance, web-based bioinformatics tool designed for Multi-Sequence Alignment (MSA) visualization, annotation transposition, and sequence analysis. It bridges the gap between raw genomic data (GenBank) and interactive visual insights, focusing on responsiveness and scientific accuracy.

## 2. Technical Requirements

### 2.1 Functional Requirements
- **GenBank & BED Ingestion**: Parse multi-record GenBank files and BED files for quantitative tracks (line or interval).
- **FASTA Import**: Upload a pre-aligned FASTA file to apply externally computed alignments directly to loaded records. Sequences are matched by record ID and must all have equal lengths.
- **Annotation Import**: Upload GFF or BED annotation files to merge features and tracks into existing records, matched by ID, name, or accession.
- **Alignment Engine**: Support for MSA algorithms (MAFFT/MUSCLE). The current implementation simulates a gap-aware alignment for demonstration but provides the hooks for system-level binary calls.
- **Sequence Search**:
    - **Exact / IUPAC Mode**: Regex-based search supporting the full IUPAC degenerate nucleotide alphabet (`N`, `R`, `Y`, `S`, `W`, `K`, `M`, `B`, `D`, `H`, `V`). Gaps in aligned sequences are automatically skipped.
    - **Fuzzy Mode**: Smith-Waterman local alignment with affine gap penalties (Gotoh's algorithm). Searches both the forward strand and the reverse complement. Results are ranked by alignment score; a "Min Match Confidence" slider filters results by percentage of the best score found.
- **Quantitative Tracks**: 
    - **Line Tracks**: For continuous data like GC content or conservation scores.
    - **Interval Tracks**: For discrete regions with associated values (e.g., BED files). Supports dynamic packing to prevent overlap and automatic vertical scaling to show all data.
- **Coordinate Transposition**: Dynamically map original genomic feature coordinates (raw indices) to the new "aligned space" (indices including gaps `-`).
- **Interactive Viewport**: 
    - **Unified Scroll**: Synchronized vertical scrolling for sequence labels and alignment data using `react-window` for virtualization.
    - **Sticky Headers**: Sequence names remain visible while scrolling horizontally.
    - **Semantic Zoom**: Variable detail levels (from global mismatch density to individual nucleotide bases and amino acid translations).
    - **Interaction Modes**: Toggle between **Pan** (navigation) and **Select** (region highlighting).
- **Data Export**: Export full alignments or specific selected regions into **FASTA**, **GFF**, or **GenBank** format.

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
- **`src/app/App.tsx`**: The orchestrator. Manages global state (records, logs, params) and the high-level workflow (Ingestion -> Alignment -> Transposition -> Visualization -> Search).
- **`components/GenomeViewer.tsx`**: The core visualization engine. Implements the D3 canvas, handling zoom, drag, and rendering of the "Feature-above-Sequence" layout.
- **`src/domain/bio/types.ts`**: Shared TypeScript type definitions (`SeqRecord`, `BioFeature`, `AlignmentParams`, `SearchResult`, etc.). The root-level `types.ts` is a backward-compatibility re-export shim.
- **`services/genbank/`**: Modular GenBank flat-file parser (entry point: `services/genbank/index.ts`). Submodules: `recordSplitter.ts`, `headerParser.ts`, `locationParser.ts`, `qualifierParser.ts`, `featureParser.ts`, `toSeqRecord.ts`.
- **`src/domain/bio/`**: Pure domain logic — `coordinate.ts` (coordinate transposition), `consensus.ts` (consensus sequence calculation), `intervals.ts` (interval utilities). No DOM or worker globals.
- **`services/bioUtils.ts`**: Utilities for genetic code translation (Codon -> AA), color-coding, FASTA/GFF/GenBank export, and file I/O.
- **`src/workers/bioWorker.ts`**: Web Worker that handles all file parsing (GenBank, FASTA, BED, GFF) and sequence processing off the main thread.
- **`src/workers/searchWorker.ts`**: Web Worker that runs exact (IUPAC regex) and fuzzy (Smith-Waterman) sequence searches off the main thread.

## 4. Technical Implementation Details

### 4.1 Feature-above-Sequence Layout
To maximize readability, the viewport uses a layered approach for each record:
1.  **Annotation Layer (Top)**: Features are packed into non-overlapping rows. 
2.  **Sequence Layer (Bottom)**: Nucleotide bases are rendered as a grid. 
3.  **Translation Overlay**: When zoomed in sufficiently (>45x), CDS features automatically display their corresponding amino acid translation directly over the nucleotide grid.

### 4.2 Coordinate Transposition Logic
When an alignment is performed, gaps (`-`) are inserted. To keep annotations accurate:
- Let `S` be the raw sequence and `A` be the aligned sequence.
- For a feature at `[start, end]` in `S`, the new position in `A` is calculated by iterating through `A` and counting non-gap characters until the original indices are reached.

### 4.3 Unified Scrolling Context
The layout uses CSS `sticky` positioning and a shared overflow container. This ensures that while the user scrolls vertically through a large list of sequences, the labels stay aligned with the sequences, and both scroll together, maintaining the visual relationship.

## 5. Workflow Data Flow
1.  **Input**: User uploads `.gb`/`.gbk` files (GenBank), `.fasta`/`.fa` files (pre-aligned FASTA), or annotation files (`.gff`, `.bed`).
2.  **Parsing**: `bioWorker.ts` converts files to `SeqRecord` objects. Annotation files are merged into existing records by matching ID, name, or accession.
3.  **Alignment**: Records are passed to the alignment logic, producing `alignedSequence` strings.
4.  **Transposition**: `processTransposition` updates `BioFeature` indices based on the new gap distribution.
5.  **Rendering**: `GenomeViewer` receives the updated records and draws the SVG elements.
6.  **Search**: When a query is entered, `searchWorker.ts` runs IUPAC regex matching or Smith-Waterman alignment and returns ranked `SearchResult` objects. Results are highlighted in the viewer and listed in the sidebar.

## 6. License
This software is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** license. 

**Non-Commercial Use Only**: You are free to share and adapt the material, but you may not use the material for commercial purposes. This means no one can make a profit over this code without explicit permission from the original authors.
