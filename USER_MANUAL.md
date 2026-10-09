# Dunceious User Manual

Welcome to **Dunceious**, a high-performance bioinformatics platform for Multi-Sequence Alignment (MSA) visualization and analysis. The running version is shown in the status bar at the bottom of the screen; what changed in each version is in [`CHANGELOG.md`](./CHANGELOG.md).

## 1. Getting Started

### 1.1 Ingesting Data

The **Ingestion** section of the sidebar has one card per kind of input. Click a card to pick files, or drag files from your computer onto it. While you drag files over the window, every card that can take them lights up, and the card under the cursor says **Release to load**. A card that cannot take files right now stays dim (for example the pre-aligned FASTA and annotation cards before any record is loaded, or every card while a remote alignment runs).

- **GenBank or FASTA (Drop Input Batch)**: Upload `.gb`, `.gbk`, `.fasta` or `.fa` files. Multi-record files add several sequences at once, and several files can be selected together. Both nucleotide and amino-acid (protein) GenBank records are supported. If a sequence ID already exists in the workspace, a numeric suffix is appended automatically (e.g., `seq1 → seq1 (1) → seq1 (2)`), preventing silent overwrites.
- **Upload Pre-aligned FASTA (Alignment Overlay)**: Apply an externally computed alignment to already-loaded records. Every sequence in the file must match a loaded record, and all sequences must have equal lengths. A header matches when it starts with a loaded record's ID, so IDs with spaces such as `seq1 (1)` re-import correctly and a trailing description (`>seq1 reference strain`) is ignored. Mismatches are rejected and reported in the **Log Terminal**. This action updates the alignment of matching records without altering their features.
- **Import Annotations**: Upload `.gff`, `.bed` or BedGraph files to merge additional features into loaded records. The importer matches by record ID, name, or accession; unmatched IDs are reported in the **Log Terminal**.
  - A BED file with a numerical score in the 5th column is rendered as an **Interval Track**.
  - A BED file with many data points automatically packs overlapping intervals into multiple rows.
- **Load Project JSON**: Restore a whole workspace saved with **Save Project**.

If you leave the page with unsaved work, the browser asks you to confirm first.

### 1.2 Session Molecule Type

Dunceious enforces a homogeneous session: all records in a workspace must belong to the same molecule type — either **nucleotide** (DNA/RNA) or **peptide** (amino acid protein).

- The detected type of the first loaded file establishes the **session type**.
- Subsequent uploads are checked against the active session type. An incompatible file (e.g., loading a protein FASTA when nucleotide records are already present) is rejected, and a dialog explains why. Clear all records first to switch types.
- The current session type is shown in the **Status Bar** at the bottom of the screen (blue DNA helix for nucleotide, purple node icon for peptide), and the app chrome takes a matching accent.
- In a peptide session, the **Translation** toggle in the top bar is automatically disabled and translation rows are not displayed in the sequence viewer, as they are not applicable to amino-acid sequences.

RNA sequences retain their original `U` residues. Uracil uses the same colour as
thymine (`T`), RNA codons can be translated, and GenBank exports retain the RNA
molecule type. In peptide sessions, `U` remains selenocysteine.

### 1.3 Alignment Workflow

You can align in two ways. Both end in the same place: the alignment is overlaid on the loaded records.

**A. Align inside Dunceious with EMBL-EBI** (the **Alignment** section in the sidebar):

1. Load at least two sequences.
2. Click **Align Sequences**. The first time, read and tick the agreement: your sequences, your email and your IP address are sent to EMBL-EBI's servers and handled under its privacy notice and terms of use (job logs and your email are deleted after 7 days). Don't use this for data you are not allowed to share. The agreement lasts until you leave or reload the page; after a refresh or when you come back, Dunceious asks again. You can review or revoke it from the dialog at any time.
3. Pick an algorithm. **MAFFT** is the default: accurate and quick on whole genomes. **Kalign** is the fastest but slightly less precise on divergent sequences. **Clustal Omega** takes the largest inputs. **MUSCLE** is accurate on small sets but slow on long sequences. An algorithm that cannot take your data (too many sequences or too large) is greyed out with the reason.
4. Enter an email address (EMBL-EBI requires one per job; it is remembered in this browser) and click **Align**.
5. Follow the job in the monitor: validated, submitted, queued, aligning, fetching, applied. **Minimize** keeps it as a small status pill while you keep browsing; drag the pill anywhere it is out of your way, or focus it and move it with the arrow keys (Shift for bigger steps). Click it to reopen the monitor. **Cancel** only stops Dunceious waiting; the job finishes at EMBL-EBI anyway.

While a job runs, anything that would change the loaded records (uploading, loading a project, removing records, Clear All) is locked. Viewing, search, annotations and exports keep working.

**B. Compute it yourself** and upload the result (nothing leaves your machine):

1. Load sequences (GenBank or FASTA batch upload).
2. Compute the alignment externally using a tool of your choice (e.g., MAFFT, MUSCLE, Clustal Omega).
3. Upload the resulting aligned FASTA using **Upload Pre-aligned FASTA** (see section 1.1).

Once an alignment is loaded, the conservation heatmap (toggled via the **Conservation** button in the top bar) becomes available.

Annotations stay whole across alignment gaps: a gap inside a sequence never cuts an annotation into pieces, and the translation of a coding feature is unchanged. Only features that really have several parts (such as `join(...)`) are drawn as separate bars joined by a connector.

## 2. Navigation & Interaction

### 2.1 Viewport Controls

- **Zoom**: Use the zoom slider, Ctrl + mouse wheel (or a trackpad pinch), or the `+` / `-` keys.
- **Scroll**: Use the horizontal scrollbar, Shift + mouse wheel, or the arrow keys. The column with sequence names is sticky and stays visible.
- **Pan Mode**: Click and drag to move the viewport.
- **Select Mode**: Click and drag to highlight a specific genomic region across all records. Double-click an annotation to select exactly its span. `Esc` clears the selection.
- **Go to Position**: Type a base position in the sidebar's **Navigation** box and press Enter.
- **Keyboard shortcuts** (when not typing in a field): `+` / `-` zoom, arrow keys pan and scroll, `Page Up` / `Page Down` scroll a screen of rows, `Home` / `End` jump to the start or end, `F` fits the whole alignment, `C` centres on the selection.

### 2.2 Semantic Zoom

- **Low Zoom**: View mismatch density and conservation levels.
- **Medium Zoom**: Individual nucleotide bases (A, T, C, G) become visible.
- **High Zoom**: With **Translation** on, the amino-acid translation of each CDS opens in rows above (forward strand) and below (reverse strand) the bases. Only the rows a record needs are shown: overlapping CDSs in the same reading frame share a row, and a record without a CDS gets none. Not shown in peptide sessions.

At a **programmed ribosomal frameshift** (for example SARS-CoV-2 ORF1ab), the codons after the slip move to the row of their new reading frame. The annotation bar marks the slip with a tick and a `−1` (or `+1`) badge, and its tooltip names the position.

### 2.3 Annotations in the Viewer

- Annotations are drawn as thin arrow bars pointing in their direction, with the name inside when it fits.
- Hover an annotation for a summary; click it to open its **details**.
- Right-click an annotation or a selection for **Zoom to**, **Copy Sequence** and **Export Sequence**.
- In the details, **Show sequence in viewer** opens that annotation's bar to show its bases when you are zoomed in far enough.

### 2.4 Focus

**Focus** (in the Annotation Hub or an annotation's details) flies the view to the whole annotation, including every part of a joined feature, and frames it. An amber label with the annotation's name and length marks it until you change the selection. Any scroll, click or key press during the flight hands the view back to you.

When you focus from the Annotation Hub, a **Back to Annotation Hub** pill appears in the viewer. It returns you to the same row, which flashes and stays marked *Last focused*.

## 3. Analysis Features

### 3.1 Search

Dunceious provides two complementary search modes, selectable via the toggle buttons next to the search bar.

#### IUPAC / Exact Mode

The supported degenerate codes depend on the active **session molecule type**:

**Nucleotide sessions**

| Code | Matches | Code | Matches       |
| ---- | ------- | ---- | ------------- |
| `R`  | A, G    | `B`  | C, G, T, U    |
| `Y`  | C, T, U | `D`  | A, G, T, U    |
| `S`  | G, C    | `H`  | A, C, T, U    |
| `W`  | A, T, U | `V`  | A, C, G       |
| `K`  | G, T, U | `N`  | A, C, G, T, U |
| `M`  | A, C    |      |               |

Literal `T` and `U` queries match their own residues. Reverse-strand searches
use RNA complements (`A` pairs with `U`) for RNA records and DNA complements
(`A` pairs with `T`) for DNA records.

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

Results are highlighted in the viewer and listed in the sidebar. Use the **↑ / ↓** arrows to jump between matches. **Annotate** turns one hit into an annotation; **Join Selected** / **Join All** turn several hits into one.

#### Fuzzy Mode (Smith-Waterman)

- Finds approximate matches using the Smith-Waterman local alignment algorithm with affine gap penalties.
- Both the forward strand and its **reverse complement** are searched automatically for nucleotide sessions. Reverse-complement search is suppressed in peptide sessions, where strand orientation does not apply.
- A **Min Match Confidence** slider (0–100 %) appears below the search bar. This filters results by the percentage of the best alignment score found in the current search — raise the threshold to see only high-quality matches, lower it to include more divergent hits.
- Results are sorted by alignment score (best match first).

> **Tip**: Use IUPAC mode for known motifs or primer sequences, and Fuzzy mode to find similar but not identical sequences (e.g., for mutation detection or homology searches).

### 3.2 Annotation Hub

Switch to the **Annotation Hub** in the top bar to see every record and feature in one table. From there you can:

- **Focus** a feature in the viewer (see 2.4) or open its details.
- **Edit** a feature in the **Metadata Inspector**, or **Add Feature** to create one.
- Delete features, or remove a whole sequence from the project.
- Export FASTA, GFF3 or GenBank, and **Save Project** as JSON.
- **Clear All**, which removes every record and annotation after you type `CLEAR` to confirm.

### 3.3 Metadata Inspector

The **Metadata Inspector** edits one feature: its key, display name, target sequence, strand, location (several segments, or a circular wrap-around), colour, and every qualifier. Qualifiers can be renamed, added and removed; a name GenBank would not round-trip is flagged before you save. **Discard** leaves the feature unchanged.

### 3.4 Annotation Details

Clicking an annotation (or **View details** in the Hub) shows its metadata, location and, for coding features, its protein translation. From there you can **Focus** it, **Copy Sequence**, **Copy AA**, **Export FASTA**, or switch on **Show sequence in viewer**.

### 3.5 Quantitative Tracks

- Toggle tracks on/off using the **Tracks** button in the top bar.
- Hover over a track to see the exact value at a specific genomic position.
- Track heights automatically adjust to show all overlapping data.

## 4. Exporting Data

- **Export FASTA**: Download the full alignment or a selected region.
- **Export GFF**: Download the current feature annotations in GFF3 format, suitable for use in other bioinformatics tools.
- **Export GenBank**: Export one or more records in GenBank flat-file format, preserving sequence and annotation data, including flag qualifiers such as `/ribosomal_slippage` and `/pseudo`.
- **Export Selection JSON**: When a selection is active, choose **Export Selection JSON** to download the
  selected region as a JSON project snapshot.
  All coordinates in the exported file use **0-based half-open intervals `[start, end)`**: `start` is the
  first included position and `end` is the first excluded position (matching JavaScript `substring` semantics).
  Features and quantitative track intervals are clipped to the selection window and rebased relative to the
  selection start; zero-length intervals produced by clipping are omitted.
- **Export Sequence**: An annotation's or a selection's sequence can also be exported from its right-click menu.

## 5. Options

The gear in the top bar opens **Options**:

- **Chrome theme**: Clean, Halo, Aurora or Mesh. Remembered in this browser.
- **Feature Colors**: a colour per feature type; **Reset to Defaults** restores them. Colours are saved with the project.

Hovering (or keyboard-focusing) any control shows a tooltip explaining it, with its shortcut where it has one and the reason when it is disabled. Animations are switched off when your system asks for reduced motion.

## 6. Troubleshooting

- **Missing Data**: Ensure your BED files follow the standard tab-delimited format.
- **Performance**: If the browser becomes sluggish with very large alignments, try reducing the number of visible tracks or annotations.
- **Upload Errors**: Check the **Log Terminal** for detailed error messages. Common causes include sequence ID mismatches (alignment overlay), sequence length mismatches (alignment overlay), and molecule-type conflicts (loading protein sequences into a nucleotide session or vice versa).
- **Remote alignment errors**: EMBL-EBI's own message is shown in the dialog. Common causes: an email whose domain EMBL-EBI cannot verify (use a real address), more sequences or more data than the chosen algorithm accepts (pick another, or reduce the set), or EMBL-EBI being unreachable (try again). A long queue is normal; the monitor keeps waiting.
- **Duplicate IDs**: Repeated sequence IDs are handled automatically with numeric suffixes; no action is needed. A pre-aligned FASTA exported from the same workspace re-imports correctly even when its IDs contain those suffixes.

## 7. License

This software is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License** as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See the `COPYING` file for the full license text, or visit <https://www.gnu.org/licenses/agpl-3.0.html>.
