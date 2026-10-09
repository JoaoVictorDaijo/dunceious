# Dunceious — Project Documentation

The version that is live is the one in `package.json` on `main`; changes per release are in [`CHANGELOG.md`](./CHANGELOG.md).

## 1. Project Overview

Dunceious is a high-performance, web-based bioinformatics tool designed for Multi-Sequence Alignment (MSA) visualization, annotation transposition, and sequence analysis. It bridges the gap between raw genomic data (GenBank) and interactive visual insights, focusing on responsiveness and scientific accuracy.

## 2. Technical Requirements

### 2.1 Functional Requirements

- **GenBank & BED Ingestion**: Parse multi-record GenBank files and BED files for quantitative tracks (line or interval).
- **FASTA Import** (Batch): Upload one or more FASTA files to add sequences to the workspace. Duplicate IDs are automatically de-duplicated with numeric suffixes (e.g., `seq1 (1)`, `seq1 (2)`). Molecule type (nucleotide vs protein) is detected per-record and enforced — sessions must be homogeneous.
- **Drag and drop**: Every Ingestion card (batch GB/FASTA, pre-aligned FASTA, annotations, project JSON) accepts dropped files. While files are dragged over the window, each card that can take them lights up in its own accent, and the card under the cursor reads "Release to load". Cards that cannot accept files stay inert (during a remote alignment, or the pre-aligned FASTA and annotation cards before any record is loaded).
- **Alignment Overlay**: Upload a pre-aligned FASTA file using the **Upload Pre-aligned FASTA** action to apply an externally computed alignment to already-loaded records. All sequences must have equal lengths, and every record in the file must match a loaded record. A header matches the longest leading part of it that is a loaded record ID, so IDs with spaces (such as `seq1 (1)`) round-trip and a trailing description (`>seq1 reference strain`) is ignored. Mismatches are rejected with an error log.
- **Two ways to align**: Compute the alignment yourself (e.g., MAFFT, MUSCLE, Clustal Omega) and import it through the Alignment Overlay, which keeps everything local, or run it remotely on EMBL-EBI (below). Both end in the same overlay.
- **Remote Alignment (EMBL-EBI)**: The **Alignment** sidebar section aligns the loaded records on EMBL-EBI's Job Dispatcher (MAFFT by default, Kalign, Clustal Omega or MUSCLE) and applies the result through the same overlay. It is opt-in: the first use requires an explicit agreement that the sequences and a contact email are sent to EMBL-EBI (linked privacy notice and terms of use). The agreement is kept only in memory for the current page load, so a refresh, a reopened page or a new tab asks again; it can be revoked at any time. Inputs are checked locally first (valid email, at least 2 sequences, the engine's sequence-count and size limits, residue alphabet). A job monitor shows each step (validated, submitted, queued, aligning, fetching, applied) and can be minimized to a floating pill, which can be dragged or moved with the arrow keys; while a job runs, edits that change the record set are locked, and cancelling only stops waiting because EMBL-EBI cannot cancel a running job.
- **Sequence Search**:
  - **Exact / IUPAC Mode**: Regex-based degenerate search. Supported codes depend on the active session type:
    - **Nucleotide**: Standard IUPAC codes — `R`, `Y`, `S`, `W`, `K`, `M`, `B`, `D`, `H`, `V`, `N`.
    - **Protein**: All 20 standard amino acids plus ambiguity codes — `B` (D/N), `Z` (E/Q), `J` (I/L), `X` (all 20), `U` (selenocysteine), `O` (pyrrolysine).
      Gaps in aligned sequences are automatically skipped.
  - **Fuzzy Mode**: Smith-Waterman local alignment with affine gap penalties (Gotoh's algorithm). For nucleotide sessions, both the forward strand and reverse complement are searched automatically. For protein sessions, reverse-complement search is suppressed (not applicable). Results are ranked by alignment score; a "Min Match Confidence" slider filters results by percentage of the best score found.
  - Hits can be turned into annotations one by one (**Annotate**) or joined (**Join Selected** / **Join All**).
- **Quantitative Tracks**:
  - **Line Tracks**: For continuous data like GC content or conservation scores.
  - **Interval Tracks**: For discrete regions with associated values (e.g., BED files). Supports dynamic packing to prevent overlap and automatic vertical scaling to show all data.
- **Coordinate Transposition**: Dynamically map original genomic feature coordinates (raw indices) to the new "aligned space" (indices including gaps `-`).
- **Interactive Viewport**:
  - **Unified Scroll**: Synchronized vertical scrolling for sequence labels and alignment data using `react-window` for virtualization.
  - **Sticky Headers**: Sequence names remain visible while scrolling horizontally.
  - **Semantic Zoom**: Variable detail levels (from global mismatch density to individual nucleotide bases and amino acid translations).
  - **Interaction Modes**: Toggle between **Pan** (navigation) and **Select** (region highlighting).
  - **Focus**: From the Annotation Hub or an annotation's details, the view flies to the feature's whole extent (every part of a joined feature) and labels it with its name and length. Focus from the Hub offers a **Back to Annotation Hub** pill that returns to the same row, marked *Last focused*.
- **Annotation management**:
  - **Annotation Hub**: a workspace listing every record and feature, with Focus, details, edit, delete, export (FASTA, GFF3, GenBank), Save Project and Clear All. Clear All always asks you to type `CLEAR`.
  - **Metadata Inspector**: edits a feature's key, display name, location, strand, segments (including circular wrap-around), colour and every qualifier — rename, add, remove — warning about qualifier names GenBank would not round-trip.
  - **Annotation details**: metadata, Focus, copy sequence or amino acids, FASTA export, and *Show sequence in viewer*, which opens that annotation's bar to show its bases when zoomed in.
- **Data Export**: Export data in multiple formats:
  - **FASTA**: Full alignment or selected region.
  - **GFF**: Feature annotations in GFF3 format.
  - **GenBank**: One or more records in GenBank flat-file format, including INSDC flag qualifiers such as `/ribosomal_slippage` and `/pseudo`.
  - **Selection JSON**: Selected region as a JSON project snapshot (0-based half-open intervals).
  - **Project JSON**: Full workspace state (records, features, colors, UI toggles) for project persistence.
- **Options**: four chrome themes (Clean, Halo, Aurora, Mesh), remembered in this browser, and per-type feature colours, saved with the project.

### 2.2 Non-Functional Requirements

- **Performance**: High-density rendering using D3.js, SVG and canvas to handle thousands of base pairs across multiple records.
- **Aesthetics**: High-contrast, scientific UI using Tailwind CSS, with a session-type accent (nucleotide, peptide, Annotation Hub) on the chrome.
- **Accessibility**: Distinct colour palettes for nucleotides and features; controls share one tooltip style that also appears on keyboard focus (with shortcut hints and reasons for disabled controls); all motion is turned off under `prefers-reduced-motion`.
- **Privacy**: No backend and no third-party CDNs. Sequences leave the browser only through the opt-in remote alignment.

## 3. System Architecture

[`ARCHITECTURE.md`](./ARCHITECTURE.md) is the canonical, detailed reference (layers, worker contracts, component list, where new code goes). This section is a summary.

### 3.1 Frontend Stack

- **Framework**: React 19 (Hooks-based architecture).
- **Language**: TypeScript 5 (`strictNullChecks`, checked via `tsc --noEmit`).
- **Visualization**: D3.js 7 for coordinate math, SVG and canvas rendering.
- **Styling**: Tailwind CSS 3, compiled at build time (self-hosted, no CDN).
- **Icons and fonts**: Font Awesome 6, Inter and JetBrains Mono (self-hosted, no CDN).
- **Build Tool**: Vite 6 (dev server on port 3000, HMR enabled).

### 3.2 Layers

All source lives under `src/`, and imports only point down the stack `domain ← core ← workers ← app` (enforced by ESLint):

- **`src/domain/bio/`** — pure biology model and algorithms: coordinate transposition, consensus, intervals, sequence utilities (translation, reverse complement, molecule type), ribosomal frameshifts, and the canonical types.
- **`src/core/`** — format parsers and serializers (`genbank/`, `formats/` for FASTA and BED/GFF3), search primitives (`search/`), and the EMBL-EBI contract model (`alignment/`, no network).
- **`src/workers/`** — the typed message contracts (`protocol.ts`), the thin `bio.worker.ts` / `search.worker.ts` shells and their `handlers/` bodies.
- **`src/app/`** — the React application: `App.tsx` (composition root), `hooks/` (worker bridges, file handling, features, remote alignment), `components/` (sidebar, nav, Annotation Hub, modals), `viewer/` (the genome viewer) and `lib/` (downloads and the EMBL-EBI client).

## 4. Technical Implementation Details

### 4.1 Feature-above-Sequence Layout

To maximize readability, the viewport uses a layered approach for each record:

1.  **Annotation Layer (Top)**: Features are packed into non-overlapping lanes and drawn as thin arrow bars, pointed at the 3′ end, with the name inside. An annotation with *Show sequence in viewer* switched on opens to show its bases when zoomed past 12 px per base.
2.  **Sequence Layer (Bottom)**: Nucleotide bases are rendered as a grid, with letters past 12 px per base.
3.  **Translation Rows**: In nucleotide sessions with **Translation** on, CDS features show their amino-acid translation once the zoom passes 5 px per base; the rows open with a short animation and reserve no space below that zoom. Codons are packed into the fewest rows each record and strand needs (same-frame overlaps share a row; a different frame that overlaps opens a new one), and a record without a CDS gets no rows. At a programmed ribosomal frameshift (for example SARS-CoV-2 ORF1ab, `join(266..13468,13468..21555)`), the codons after the slip move to their own frame's row, and the annotation bar shows a `−1`/`+1` badge and a tooltip line. This layer is not shown in protein sessions.

### 4.2 Coordinate Transposition Logic

When an alignment is performed, gaps (`-`) are inserted. To keep annotations accurate:

- Let `S` be the raw sequence and `A` be the aligned sequence.
- For a feature at `[start, end]` in `S`, the new position in `A` is calculated by iterating through `A` and counting non-gap characters until the original indices are reached.
- Each part of a feature becomes **one continuous bar** from its first to its last base in `A`: gaps inside the feature are spanned, never drawn as breaks, while gaps before its first or after its last base are excluded. Only genuinely multi-part features (`join(...)`, or a circular feature crossing the origin) keep one bar per part, with connectors between them.
- Lengths, coordinates, exports and translations always use the original, ungapped coordinates; the gap columns only affect where the bar is drawn.

### 4.3 Unified Scrolling Context

The layout uses CSS `sticky` positioning and a shared overflow container. This ensures that while the user scrolls vertically through a large list of sequences, the labels stay aligned with the sequences, and both scroll together, maintaining the visual relationship.

## 5. Workflow Data Flow

1.  **Input**: User uploads or drops files on the Ingestion cards:
    - `.gb`/`.gbk` files (GenBank, batch load)
    - `.fasta`/`.fa` files (FASTA batch load or alignment overlay)
    - `.gff`/`.bed` annotation files (merge into existing records by ID/name/accession)
    - a project `.json` (restores the whole workspace)
2.  **Parsing**: The bio worker (`src/workers/bio.worker.ts`) converts files to `SeqRecord` objects. Molecule type (nucleotide vs protein) is detected per-record (GenBank: `LOCUS` line; FASTA: presence of protein-exclusive IUPAC codes). Duplicate record IDs are de-duplicated with numeric suffixes.
3.  **Alignment Overlay** (optional): User uploads a pre-aligned FASTA via **Upload Pre-aligned FASTA**, or runs a remote alignment from the **Alignment** section (EMBL-EBI), whose result is applied through the same overlay reducer. Matching records get their `alignedSequence` updated without altering their features or sequence data.
4.  **Transposition**: When an alignment is active, `processTransposition` updates `BioFeature` indices to map original genomic coordinates to the new "aligned space" (indices including gaps).
5.  **Rendering**: `GenomeViewer` lays out each record and renders annotations (SVG) and sequence and tracks (canvas). Translation rows are shown only in nucleotide sessions.
6.  **Search**: When a user enters a query, the search worker (`src/workers/search.worker.ts`) runs exact (IUPAC regex) or fuzzy (Smith-Waterman) search, passing the session's `moleculeType` to suppress reverse-complement for protein sessions. Results are ranked and highlighted in the viewer.

## 6. License

This software is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License** as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See the `COPYING` file for details.
