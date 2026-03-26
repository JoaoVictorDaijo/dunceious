# Dunceious Architecture Overview

This document outlines the high-level architecture of the Dunceious bioinformatics platform.

## 1. Core Principles
- **Data-Driven Rendering**: The UI is a direct reflection of the underlying `SeqRecord` state.
- **Worker-Based Processing**: Heavy parsing and alignment tasks are offloaded to Web Workers to keep the UI thread responsive.
- **Layered Visualization**: The genome viewer uses a multi-layered approach (Annotations -> Tracks -> Sequence) to handle high-density data.

## 2. Component Hierarchy

### `App.tsx` (The Orchestrator)
- **State Management**: Holds the master list of `records`, `alignmentParams`, and `workflowStatus`.
- **Workflow Control**: Manages the transition between Ingestion, Alignment, and Visualization.
- **Event Handling**: Coordinates communication between the sidebar, top navigation, and the main viewer.

### `GenomeViewer.tsx` (The Rendering Engine)
- **Virtualization**: Uses `react-window` to render only the visible sequences, allowing the platform to scale to hundreds of records.
- **Layout Engine**: 
  - **Feature Packing**: Dynamically calculates non-overlapping rows for biological features (ORFs, CDS).
  - **Track Packing**: Calculates vertical space for quantitative tracks (BED files), expanding height as needed for overlapping intervals.
- **Rendering Sub-components**:
  - `SequenceTrack`: Handles the nucleotide grid, amino acid translations, and conservation highlighting.
  - `QuantitativeTrack`: Uses HTML5 Canvas for high-performance rendering of line and interval data.
  - `SVG Layer`: Handles interactive annotations, selection boxes, and tooltips.

## 3. Data Processing Pipeline

### Ingestion (`bioWorker.ts`)
- **GenBank Parser**: Uses regular expressions to extract metadata, sequences, and features from GenBank flat files.
- **BED Parser**: Extracts genomic intervals and scores. Automatically identifies whether data should be rendered as a line or interval track.
- **Transposition**: Maps original feature coordinates to aligned coordinates after gaps are introduced.

### Alignment (`alignmentLogic.ts`)
- **Gap Insertion**: Implements gap-aware alignment logic.
- **Consensus Calculation**: Generates a master consensus sequence to identify mismatches and conservation levels across all records.

## 4. Performance Optimizations
- **Canvas for Tracks**: Quantitative data is rendered to Canvas to avoid DOM overhead for thousands of data points.
- **Memoization**: Heavy layout calculations (packing algorithms) are wrapped in `useMemo` to prevent redundant processing during scrolls or zooms.
- **Debounced Updates**: UI updates for zoom and scroll are debounced to ensure smooth interaction at high zoom levels.

## 5. Technology Stack
- **React 19**: Modern UI framework with concurrent features.
- **D3.js**: Used for coordinate scaling and color interpolation.
- **Tailwind CSS**: Utility-first styling for a responsive, scientific interface.
- **Vite**: Fast build tool and dev server.

## 6. License
This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** license. Commercial use is strictly prohibited.
