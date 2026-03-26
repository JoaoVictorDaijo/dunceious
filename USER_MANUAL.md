# Dunceious User Manual

Welcome to Dunceious, a high-performance bioinformatics platform for Multi-Sequence Alignment (MSA) visualization and analysis.

## 1. Getting Started

### 1.1 Ingesting Data
- **GenBank Files**: Upload `.gb` or `.gbk` files. Dunceious supports multi-record files.
- **BED Files**: Upload `.bed` files for quantitative tracks. 
  - If a BED file has a numerical score in the 5th column, it will be rendered as an **Interval Track**.
  - If a BED file has many data points, it will automatically pack overlapping intervals into multiple rows.

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
- Use the search bar to find specific nucleotide motifs or feature names.
- Search results are highlighted across all records.
- Use the arrow keys in the search bar to jump between matches.

### 3.2 Feature Details
- Click on any annotation (ORF, CDS, etc.) to view its metadata, including product name, note, and genomic coordinates.
- Right-click on a feature for additional options, such as copying the sequence or zooming to the feature.

### 3.3 Quantitative Tracks
- Toggle tracks on/off using the **Tracks** button in the top bar.
- Hover over a track to see the exact value at a specific genomic position.
- Track heights automatically adjust to show all overlapping data.

## 4. Exporting Data
- **Export FASTA**: Click the **Export** button to download the full alignment or a specific selected region in FASTA format.
- **Export Record**: Individual records can be exported from their respective right-click menus.

## 5. Troubleshooting
- **Missing Data**: Ensure your BED files follow the standard tab-delimited format.
- **Performance**: If the browser becomes sluggish with very large alignments, try reducing the number of visible tracks or annotations.
- **Alignment Errors**: Check the **Logs** panel for detailed error messages during the alignment process.

## 6. License
This software is provided for **non-commercial use only** under the CC BY-NC 4.0 license. You may not use this software for commercial purposes or to generate profit.
