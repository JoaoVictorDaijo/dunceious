# Dunceious v2.5 - Project Documentation

## 1. Project Overview
Dunceious is a high-performance, web-based bioinformatics tool designed for Multi-Sequence Alignment (MSA) visualization, annotation transposition, and sequence analysis. It bridges the gap between raw genomic data (GenBank) and interactive visual insights, focusing on responsiveness and scientific accuracy.

## 2. Technical Requirements

### 2.1 Functional Requirements
- **GenBank & BED Ingestion**: Parse multi-record GenBank files and BED files for quantitative tracks (line or interval).
- **Alignment Engine**: Support for MSA algorithms (MAFFT/MUSCLE). The current implementation simulates a gap-aware alignment for demonstration but provides the hooks for system-level binary calls.
- **Quantitative Tracks**: 
    - **Line Tracks**: For continuous data like GC content or conservation scores.
    - **Interval Tracks**: For discrete regions with associated values (e.g., BED files). Supports dynamic packing to prevent overlap and automatic vertical scaling to show all data.
- **Coordinate Transposition**: Dynamically map original genomic feature coordinates (raw indices) to the new "aligned space" (indices including gaps `-`).
- **Interactive Viewport**: 
    - **Unified Scroll**: Synchronized vertical scrolling for sequence labels and alignment data using `react-window` for virtualization.
    - **Sticky Headers**: Sequence names remain visible while scrolling horizontally.
    - **Semantic Zoom**: Variable detail levels (from global mismatch density to individual nucleotide bases and amino acid translations).
    - **Interaction Modes**: Toggle between **Pan** (navigation) and **Select** (region highlighting).
- **Data Export**: Support for exporting full alignments or specific selected regions into FASTA format.

### 2.2 Non-Functional Requirements
- **Performance**: High-density rendering using D3.js and SVG to handle thousands of base pairs across multiple records.
- **Aesthetics**: High-contrast, scientific UI using Tailwind CSS and a professional dark/light theme hybrid.
- **Accessibility**: Use of distinct color palettes for nucleotides and features to ensure visual clarity.

## 3. System Architecture

### 3.1 Frontend Stack
- **Framework**: React 19 (Hooks-based architecture).
- **Visualization**: D3.js for high-precision SVG coordinate math and rendering.
- **Styling**: Tailwind CSS for a modular, responsive UI.
- **Icons**: FontAwesome 6.

### 3.2 Component Architecture
- **`App.tsx`**: The orchestrator. Manages global state (records, logs, params) and the high-level workflow (Ingestion -> Alignment -> Transposition -> Visualization).
- **`GenomeViewer.tsx`**: The core visualization engine. Implements the D3 canvas, handling zoom, drag, and rendering of the "Feature-above-Sequence" layout.
- **`services/genbankParser.ts`**: A robust regex-based parser for the GenBank flat-file format.
- **`services/alignmentLogic.ts`**: Contains the mathematical logic for gap-aware coordinate mapping and consensus sequence calculation.
- **`services/bioUtils.ts`**: Utilities for genetic code translation (Codon -> AA), color-coding, and file I/O.

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
1.  **Input**: User uploads `.gb` files.
2.  **Parsing**: `parseGenBank` converts strings to `SeqRecord` objects.
3.  **Alignment**: Records are passed to the alignment logic, producing `alignedSequence` strings.
4.  **Transposition**: `processTransposition` updates `BioFeature` indices based on the new gap distribution.
5.  **Rendering**: `GenomeViewer` receives the updated records and draws the SVG elements.

## 6. License
This software is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** license. 

**Non-Commercial Use Only**: You are free to share and adapt the material, but you may not use the material for commercial purposes. This means no one can make a profit over this code without explicit permission from the original authors.
