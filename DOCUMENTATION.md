# Dunceious — Project Documentation

The version that is live is the one in `package.json` on `main`; changes per release are in [`CHANGELOG.md`](./CHANGELOG.md).

## 1. Project Overview

Dunceious is a high-performance, web-based bioinformatics tool designed for Multi-Sequence Alignment (MSA) visualization, annotation transposition, and sequence analysis. It bridges the gap between raw genomic data (GenBank) and interactive visual insights, focusing on responsiveness and scientific accuracy.

## 2. Technical Requirements

### 2.1 Functional Requirements

- **GenBank & BED Ingestion**: Parse multi-record GenBank files and BED files for quantitative tracks (line or interval).
- **FASTA Import** (Batch): Upload one or more FASTA files to add sequences to the workspace. Duplicate IDs are automatically de-duplicated with numeric suffixes (e.g., `seq1_1`, `seq1_2`). Molecule type (nucleotide vs protein) is detected per-record and enforced — sessions must be homogeneous.
- **Drag and drop**: The Annotation Hub canvas routes sequence/annotation batches in that order, with a batch ID map to attach annotations to newly added sequences. Ambiguous IDs are reported; project JSON must be dropped alone and confirmed. FASTA drops never infer an alignment overlay. In the viewport, every Ingestion card (batch GB/FASTA, pre-aligned FASTA, annotations, project JSON) accepts dropped files. While files are dragged over the window, each card that can take them lights up in its own accent, and the card under the cursor reads "Release to load". Cards that cannot accept files stay inert (during a remote alignment, or the pre-aligned FASTA and annotation cards before any record is loaded).
- **Alignment Overlay**: Upload a pre-aligned FASTA file using the **Upload pre-aligned FASTA** action to apply an externally computed alignment to already-loaded records. All sequences must have equal lengths, and every record in the file must match a loaded record. A header matches the longest leading part of it that is a loaded record ID, so suffixed workspace IDs (such as `seq1_1`) round-trip and a trailing description (`>seq1 reference strain`) is ignored. Mismatches are rejected with an error log.
- **Two ways to align**: Compute the alignment yourself (e.g., MAFFT, MUSCLE, Clustal Omega) and import it through the Alignment Overlay, which keeps everything local, or run it remotely on EMBL-EBI (below). Both end in the same overlay.
- **Remote Alignment (EMBL-EBI)**: The **Alignment** sidebar section aligns the loaded records on EMBL-EBI's Job Dispatcher (MAFFT by default, Kalign, Clustal Omega or MUSCLE) and applies the result through the same overlay. It is opt-in: the first use requires an explicit agreement that the sequences and a contact email are sent to EMBL-EBI (linked privacy notice and terms of use). The agreement is kept only in memory for the current page load, so a refresh, a reopened page or a new tab asks again; it can be revoked at any time. Inputs are checked locally first (valid email, at least 2 sequences, the engine's sequence-count and size limits, residue alphabet). A job monitor shows each step (validated, submitted, queued, aligning, fetching, applied) and can be minimized to a floating pill, which can be dragged or moved with the arrow keys; while a job runs, edits that change the record set are locked, and cancelling only stops waiting because EMBL-EBI cannot cancel a running job.
- **Sequence Search**:
  - **Exact / IUPAC Mode**: Regex-based degenerate search. Supported codes depend on the active session type:
    - **Nucleotide**: Standard IUPAC codes — `R`, `Y`, `S`, `W`, `K`, `M`, `B`, `D`, `H`, `V`, `N`.
    - **Protein**: All 20 standard amino acids plus ambiguity codes — `B` (D/N), `Z` (E/Q), `J` (I/L), `X` (all 20), `U` (selenocysteine), `O` (pyrrolysine).
      Gaps in aligned sequences are automatically skipped.
  - **Fuzzy mode**: **Whole query** uses Myers' bit-parallel edit distance (as in edlib), with query identity = 100 × (query length − edits) / query length. **Local** uses Huang–Miller Waterman–Eggert following EMBOSS matcher 6.6.0, with water's EDNAFULL/EBLOSUM62 matrices and gap open 10, extend 0.5; a length-n gap costs 10 + (n − 1) × 0.5. It returns several non-overlapping hits per record strand. Scoring, metrics, filters and count scope are defined in [the search manual](./USER_MANUAL.md#31-search).
  - Hits carry a per-base alignment view, barcode and copyable EMBOSS-layout text. **Annotate** stores search provenance and offers a query layer over the record; **Join selected** / **Join all** keep record bases only. Search notes in exports are opt-in.
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
  - **Annotation Hub**: a sidebar index with List/Grouped modes, grouping previews, Needs attention and sorting; a virtualized Sequences tab with pinned headers, genome strips and overview rail; and an organism-scoped Features tab with per-type length comparison, presence, duplicates, partial/not-determined and accessory states. Search steps through annotation matches and excludes record definitions. Filters, folds, density, selections and scroll offsets persist across tab switches. Keyboard controls are listed in [the user manual](./USER_MANUAL.md#32-annotation-hub).
  - **Sequence details and names**: Organism, Host, Location and Collection date are edited separately from annotations, with imported-value snapshots, Revert, edited markers and non-blocking validation. Bulk Set detail fills empty values by default. Display names are project-only. The source feature holds details and is excluded from annotation counts and the generic editor.
  - **Hub actions**: selection-driven export and bulk visibility/detail/removal actions, annotation deletion with Undo, Focus/return to the same row, and a ⋯ menu for imports, Save project and Clear workspace (type `CLEAR` to confirm).
  - **Metadata Inspector**: edits a feature's key, display name, location, strand, segments (including circular wrap-around), colour and every qualifier — rename, add, remove — warning about qualifier names GenBank would not round-trip.
  - **Annotation details**: metadata, Focus, copy sequence or amino acids, FASTA export, and *Show sequence in viewer*, which opens that annotation's bar to show its bases when zoomed in.
- **Data Export**: Export data in multiple formats:
  - **FASTA**: Original residues by default; optional alignment gaps and NCBI detail modifiers. Viewport selection export keeps the selected aligned columns.
  - **GFF3**: Nine-column annotations with encoded attributes, multipart IDs, per-part CDS phase, Sequence Ontology types and `gbkey=Src` detail regions; sequences must already be loaded on import.
  - **GenBank / GenPept**: Molecule-specific qualifier allowlists and syntax, source details and separate ACCESSION/VERSION; omissions are counted in the export preview.
  - **Selection JSON**: Selected region as a JSON project snapshot (0-based half-open intervals).
  - **Project JSON**: Format-2 workspace persistence (records, features, colours, toggles, details/originals/edit state, names and modifiers); earlier formats are rejected without migration. The export dialog writes a chosen subset; Save project writes the full workspace.
  - **Export dialog**: Context-based sequence selection, quick picks, format options, filename and a serializer-backed contents/omissions preview. See [export contracts and preservation](./ARCHITECTURE.md#export-format-contracts).
- **Options**: per-type feature colours, saved with the project.

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
- **`src/workers/`** — the typed message contracts (`protocol.ts`), the thin `bio.worker.ts` / `search.worker.ts` / `localSearch.worker.ts` shells and their `handlers/` bodies.
- **`src/app/`** — the React application: `App.tsx` (composition root), `hooks/` (worker bridges, file handling, features, remote alignment), `components/` (sidebar, nav, Annotation Hub, modals), `viewer/` (the genome viewer) and `lib/` (downloads and the EMBL-EBI client).

## 4. Technical Implementation Details

### 4.1 Feature-above-Sequence Layout

To maximize readability, the viewport uses a layered approach for each record:

1.  **Annotation Layer (Top)**: Features are packed into non-overlapping lanes and drawn as thin arrow bars, pointed at the 3′ end, with the name inside. An annotation with *Show sequence in viewer* switched on opens to show its bases when zoomed past 12 px per base.
2.  **Sequence Layer (Bottom)**: Nucleotide bases are rendered as a grid, with letters past 12 px per base.
3.  **Translation Rows**: In nucleotide sessions with **Translation** on, CDS features show their amino-acid translation once the zoom passes 5 px per base; the rows open with a short animation and reserve no space below that zoom. Codons are packed into the fewest rows each record and strand needs (same-frame overlaps share a row; a different frame that overlaps opens a new one), and a record without a CDS gets no rows. At a programmed ribosomal frameshift (for example the T7 capsid gene 10, `join(22967..23989,23989..24162)`), the codons after the slip move to their own frame's row, and the annotation bar shows a `−1`/`+1` badge and a tooltip line. This layer is not shown in protein sessions.

### 4.2 Coordinate Transposition Logic

When an alignment is performed, gaps (`-`) are inserted. To keep annotations accurate:

- Let `S` be the raw sequence and `A` be the aligned sequence.
- For a feature at `[start, end]` in `S`, the new position in `A` is calculated by iterating through `A` and counting non-gap characters until the original indices are reached.
- Each part of a feature becomes **one continuous bar** from its first to its last base in `A`: gaps inside the feature are spanned, never drawn as breaks, while gaps before its first or after its last base are excluded. Only genuinely multi-part features (`join(...)`, or a circular feature crossing the origin) keep one bar per part, with connectors between them.
- Lengths, coordinates, exports and translations always use the original, ungapped coordinates; the gap columns only affect where the bar is drawn.

### 4.3 Unified Scrolling Context

The layout uses CSS `sticky` positioning and a shared overflow container. This ensures that while the user scrolls vertically through a large list of sequences, the labels stay aligned with the sequences, and both scroll together, maintaining the visual relationship.

### 4.4 Local search engine

The C engine lives in `wasm/local-align/`; its [README](./wasm/local-align/README.md) defines
the ABI and allocation ownership. `src/core/search/local/` binds it, validates paths and scores,
and selects hits. Model types (`SearchResult`, `LocalHitMetrics`, `SearchHitProvenance`) live in
`src/domain/bio/types.ts`; worker messages and `SearchOptions` live in `src/workers/protocol.ts`.

`useLocalSearchPool` runs Vite inline workers with one engine per worker. The page's
`localEngineModule.ts` fetches, compiles and keeps module bytes, then supplies them to every
worker, including replacements after Cancel. Local has no page-thread fallback. Selection ranks
by score, record order, strand, record start/end and query start. A live global bound (the N-th
best passing score for result limit N) stops streams only below that score, preserving ties;
counts cover the final cut-off or all positive alignments when no cut-off applies. See
[the architecture search section](./ARCHITECTURE.md#search-srcworkershandlerssearchts) for scheduling.

Rebuild the committed `public/wasm/local-align.wasm` with `bash scripts/build-local-engine.sh`
using Docker. The script pins `emscripten/emsdk:3.1.74` by digest; builds use no SIMD or alternate
engine. [`PROVENANCE.json`](./wasm/local-align/PROVENANCE.json) records the image digest, source
and matrix hashes, flags, environment and artifact hash. CI rebuilds separately and requires
byte-identical output. Normal app builds use the committed artifact and need no Emscripten.

## 5. Workflow Data Flow

1.  **Input**: User uploads or drops files on the viewport Ingestion cards or uses the hub canvas/menu:
    - GenBank files (batch load; hub drops accept `.gb`/`.genbank`)
    - `.fasta`/`.fa` files (FASTA batch load or alignment overlay)
    - `.gff`/`.gff3`/`.bed`/`.bedgraph` annotation files (exact workspace ID first, otherwise one unambiguous name/accession match)
    - a project `.json` (restores the whole workspace)
2.  **Parsing**: The bio worker (`src/workers/bio.worker.ts`) converts files to `SeqRecord` objects. Molecule type (nucleotide vs protein) is detected per-record (GenBank: `LOCUS` line; FASTA: presence of protein-exclusive IUPAC codes). Workspace IDs are sanitized and de-duplicated against all existing IDs with underscore suffixes.
3.  **Alignment Overlay** (optional): User uploads a pre-aligned FASTA via **Upload pre-aligned FASTA**, or runs a remote alignment from the **Alignment** section (EMBL-EBI), whose result is applied through the same overlay reducer. Matching records get their `alignedSequence` updated without altering their features or sequence data.
4.  **Transposition**: When an alignment is active, `processTransposition` updates `BioFeature` indices to map original genomic coordinates to the new "aligned space" (indices including gaps).
5.  **Rendering**: `GenomeViewer` lays out each record and renders annotations (SVG) and sequence and tracks (canvas). Translation rows are shown only in nucleotide sessions.
6.  **Search**: The search worker (`src/workers/search.worker.ts`) runs exact (IUPAC regex) or Whole query (Myers) search; Local runs in the `localSearch.worker.ts` pool. The session's `moleculeType` suppresses reverse-complement for proteins. Results carry alignment paths for per-base viewer marks, result cards and annotations made from hits.

## 6. License

This software is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License** as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See the `COPYING` file for details.
