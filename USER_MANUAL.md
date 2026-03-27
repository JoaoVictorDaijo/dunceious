# Dunceious v3.3 User Manual

Welcome to **Dunceious v3.3**, a high-performance bioinformatics platform for Multi-Sequence Alignment (MSA) visualization and analysis.

## 1. Getting Started

### 1.1 Ingesting Data
- **GenBank Files**: Upload `.gb` or `.gbk` files using the **Upload** button. Dunceious supports multi-record files (one upload can add multiple sequences at once).
- **FASTA Files**: Upload a pre-aligned `.fasta` or `.fa` file to apply an externally computed alignment to already-loaded records. Every sequence ID in the FASTA file must match an existing record ID, and all sequences must have equal lengths.
- **BED Files**: Upload `.bed` files for quantitative tracks.
  - If a BED file has a numerical score in the 5th column, it will be rendered as an **Interval Track**.
  - If a BED file has many data points, it will automatically pack overlapping intervals into multiple rows.
- **Annotation Files**: Upload `.gff` or `.bed` annotation files to merge additional features into loaded records. The importer matches by record ID, name, or accession; unmatched IDs are reported in the **Logs** panel.

### 1.2 Alignment Workflow
- Once records are loaded, click the **Align** button.
- Select your preferred algorithm (MAFFT or MUSCLE).
- Adjust gap penalties and iteration counts as needed.
- Click **Run Alignment** to generate the consensus and gap-aware view.

## 2. Navigation & Interaction

### 2.1 Viewport Controls
- **Zoom**: Use the zoom slider or your mouse wheel (with Ctrl/Cmd) to adjust the detail level.
- **Scroll**: Use the horizontal scrollbar to navigate the sequence. The sidebar with sequence names is sticky and will stay visible.
- **Pan Mode**: Click and drag to move the viewport.
- **Select Mode**: Click and drag to highlight a specific genomic region across all records.

### 2.2 Semantic Zoom
- **Low Zoom**: View mismatch density and conservation levels.
- **Medium Zoom**: Individual nucleotide bases (A, T, C, G) become visible.
- **High Zoom**: Amino acid translations (F1, F2, F3) are automatically displayed over CDS features.

## 3. Analysis Features

### 3.1 Search

Dunceious provides two complementary search modes, selectable via the toggle buttons next to the search bar.

#### IUPAC Mode (Exact)
- Enter a nucleotide motif using standard IUPAC degenerate codes (e.g. `ATRN`).
- Supported codes: `R`=[AG], `Y`=[CT], `S`=[GC], `W`=[AT], `K`=[GT], `M`=[AC], `B`=[CGT], `D`=[AGT], `H`=[ACT], `V`=[ACG], `N`=[ACGT].
- Results are highlighted in the viewer and listed in the sidebar. Use the **↑ / ↓** arrows to jump between matches.

#### Fuzzy Mode (Smith-Waterman)
- Finds approximate matches using the Smith-Waterman local alignment algorithm with affine gap penalties.
- Both the forward strand and its **reverse complement** are searched automatically.
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
- **Alignment Errors**: Check the **Logs** panel for detailed error messages during the alignment process.

## 6. License
This software is provided for **non-commercial use only** under the CC BY-NC 4.0 license. You may not use this software for commercial purposes or to generate profit.
