# Dunceious v3.4 User Manual

Welcome to **Dunceious v3.4**, a high-performance bioinformatics platform for Multi-Sequence Alignment (MSA) visualization and analysis.

## 1. Getting Started

### 1.1 Ingesting Data

- **GenBank Files**: Upload `.gb` or `.gbk` files using the **Upload** button. Dunceious supports multi-record files (one upload can add multiple sequences at once). Both nucleotide and amino-acid (protein) GenBank records are supported.
- **FASTA Files (Batch Load)**: Upload one or more `.fasta` or `.fa` files to add sequences to the workspace. Multiple files can be selected in the same upload dialog. If a sequence ID already exists in the workspace, a numeric suffix is appended automatically (e.g., `seq1 → seq1 (1) → seq1 (2)`), preventing silent overwrites.
- **Pre-Aligned FASTA (Alignment Overlay)**: Use the **Upload Alignment** action to apply an externally computed alignment to already-loaded records. Every sequence ID in the file must match an existing workspace record exactly, and all sequences must have equal lengths. Mismatches are rejected and reported in the **Logs** panel. This action updates the `alignedSequence` of matching records without altering their features.
- **BED Files**: Upload `.bed` files for quantitative tracks.
  - If a BED file has a numerical score in the 5th column, it will be rendered as an **Interval Track**.
  - If a BED file has many data points, it will automatically pack overlapping intervals into multiple rows.
- **Annotation Files**: Upload `.gff` or `.bed` annotation files to merge additional features into loaded records. The importer matches by record ID, name, or accession; unmatched IDs are reported in the **Logs** panel.

### 1.2 Session Molecule Type

Dunceious enforces a homogeneous session: all records in a workspace must belong to the same molecule type — either **nucleotide** (DNA/RNA) or **peptide** (amino acid protein).

- The detected type of the first loaded file establishes the **session type**.
- Subsequent uploads are checked against the active session type. An incompatible file (e.g., loading a protein FASTA when nucleotide records are already present) is rejected with an explanatory log message. Clear all records first to switch types.
- The current session type is shown in the **Status Bar** at the bottom of the screen (blue DNA helix for nucleotide, purple node icon for peptide).
- In a peptide session, the **Translation** toggle in the top bar is automatically disabled and reading-frame tracks are not displayed in the sequence viewer, as they are not applicable to amino-acid sequences.

### 1.3 Alignment Workflow

Dunceious does not include a built-in aligner. The recommended workflow is:

1. Load sequences (GenBank or FASTA batch upload).
2. Compute the alignment externally using a tool of your choice (e.g., MAFFT, MUSCLE, Clustal Omega).
3. Upload the resulting aligned FASTA using the **Upload Alignment** action (see section 1.1).

Once an alignment is loaded, the conservation heatmap (toggled via the **Conservation** button in the top bar) becomes available.

## 2. Navigation & Interaction

### 2.1 Viewport Controls

- **Zoom**: Use the zoom slider or your mouse wheel (with Ctrl/Cmd) to adjust the detail level.
- **Scroll**: Use the horizontal scrollbar to navigate the sequence. The sidebar with sequence names is sticky and will stay visible.
- **Pan Mode**: Click and drag to move the viewport.
- **Select Mode**: Click and drag to highlight a specific genomic region across all records.

### 2.2 Semantic Zoom

- **Low Zoom**: View mismatch density and conservation levels.
- **Medium Zoom**: Individual nucleotide bases (A, T, C, G) become visible.
- **High Zoom**: Amino acid translations (F1, F2, F3) are automatically displayed over CDS features in nucleotide sessions. This layer is not shown in peptide sessions.

## 3. Analysis Features

### 3.1 Search

Dunceious provides two complementary search modes, selectable via the toggle buttons next to the search bar.

#### IUPAC / Exact Mode

The supported degenerate codes depend on the active **session molecule type**:

**Nucleotide sessions**

| Code | Matches | Code | Matches    |
| ---- | ------- | ---- | ---------- |
| `R`  | A, G    | `B`  | C, G, T    |
| `Y`  | C, T    | `D`  | A, G, T    |
| `S`  | G, C    | `H`  | A, C, T    |
| `W`  | A, T    | `V`  | A, C, G    |
| `K`  | G, T    | `N`  | A, C, G, T |
| `M`  | A, C    |      |            |

**Peptide sessions**

All 20 standard one-letter amino acid codes are accepted literally. Additional ambiguity codes:

| Code | Matches        |
| ---- | -------------- |
| `B`  | D, N           |
| `Z`  | E, Q           |
| `J`  | I, L           |
| `X`  | all 20 AAs     |
| `U`  | selenocysteine |
| `O`  | pyrrolysine    |

Results are highlighted in the viewer and listed in the sidebar. Use the **↑ / ↓** arrows to jump between matches.

#### Fuzzy Mode (Smith-Waterman)

- Finds approximate matches using the Smith-Waterman local alignment algorithm with affine gap penalties.
- Both the forward strand and its **reverse complement** are searched automatically for nucleotide sessions. Reverse-complement search is suppressed in peptide sessions, where strand orientation does not apply.
- A **Min Match Confidence** slider (0–100 %) appears below the search bar. This filters results by the percentage of the best alignment score found in the current search — raise the threshold to see only high-quality matches, lower it to include more divergent hits.
- Results are sorted by alignment score (best match first).

> **Tip**: Use IUPAC mode for known motifs or primer sequences, and Fuzzy mode to find similar but not identical sequences (e.g., for mutation detection or homology searches).

### 3.2 Feature Details

- Click on any annotation (ORF, CDS, etc.) to view its metadata, including product name, note, and genomic coordinates.
- Right-click on a feature for additional options, such as copying the sequence or zooming to the feature.

### 3.3 Quantitative Tracks

- Toggle tracks on/off using the **Tracks** button in the top bar.
- Hover over a track to see the exact value at a specific genomic position.
- Track heights automatically adjust to show all overlapping data.

## 4. Exporting Data

- **Export FASTA**: Click the **Export** button and choose FASTA to download the full alignment or a specific selected region.
- **Export GFF**: Download the current feature annotations in GFF3 format, suitable for use in other bioinformatics tools.
- **Export GenBank**: Export one or more records in GenBank flat-file format, preserving sequence and annotation data.
- **Export Selection JSON**: When a selection is active, choose **Export Selection JSON** to download the
  selected region as a JSON project snapshot.
  All coordinates in the exported file use **0-based half-open intervals `[start, end)`**: `start` is the
  first included position and `end` is the first excluded position (matching JavaScript `substring` semantics).
  Features and quantitative track intervals are clipped to the selection window and rebased relative to the
  selection start; zero-length intervals produced by clipping are omitted.
- **Export Record**: Individual records can also be exported from their respective right-click context menus.

## 5. Troubleshooting

- **Missing Data**: Ensure your BED files follow the standard tab-delimited format.
- **Performance**: If the browser becomes sluggish with very large alignments, try reducing the number of visible tracks or annotations.
- **Upload Errors**: Check the **Logs** panel for detailed error messages. Common causes include sequence ID mismatches (alignment overlay), sequence length mismatches (alignment overlay), and molecule-type conflicts (loading protein sequences into a nucleotide session or vice versa).
- **Duplicate IDs**: Repeated sequence IDs are handled automatically with numeric suffixes; no action is needed.

## 6. License

This software is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License** as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See the `COPYING` file for the full license text, or visit <https://www.gnu.org/licenses/agpl-3.0.html>.
