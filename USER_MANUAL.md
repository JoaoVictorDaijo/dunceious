# Dunceious User Manual

Welcome to **Dunceious**, a high-performance bioinformatics platform for Multi-Sequence Alignment (MSA) visualization and analysis. The running version is shown in the status bar at the bottom of the screen; what changed in each version is in [`CHANGELOG.md`](./CHANGELOG.md).

## 1. Getting Started

### 1.1 Ingesting Data

In the Visual Viewport, the **Ingestion** section of the sidebar has one card per kind of input. In the Annotation Hub, imports are in the **⋯** menu and files can be dropped onto the hub canvas. Click a card to pick files, or drag files from your computer onto it. While you drag files over the window, every card that can take them lights up, and the card under the cursor says **Release to load**. A card that cannot take files right now stays dim (for example the pre-aligned FASTA and annotation cards before any record is loaded, or every card while a remote alignment runs).

- **GenBank or FASTA (Drop input batch)**: Upload `.gb`, `.gbk`, `.fasta` or `.fa` files. Multi-record files add several sequences at once, and several files can be selected together. Both nucleotide and amino-acid (protein) GenBank records are supported. If a sequence ID already exists in the workspace, a numeric suffix is appended automatically (e.g., `seq1 → seq1_1 → seq1_2`), preventing silent overwrites.
- **Upload pre-aligned FASTA (Alignment Overlay)**: Apply an externally computed alignment to already-loaded records. Every sequence in the file must match a loaded record, and all sequences must have equal lengths. A header matches when it starts with a loaded record's ID; suffixes such as `seq1_1` are retained and a trailing description (`>seq1 reference strain`) is ignored. Mismatches are rejected and reported in the **Log Terminal**. This action updates the alignment of matching records without altering their features.
- **Import annotations**: Upload `.gff`, `.gff3`, `.bed` or BedGraph files to merge additional features into loaded records. The importer first matches exact workspace IDs; a name or accession fallback must identify exactly one record. Ambiguous and unmatched IDs are reported in the **Log Terminal**.
  - A BED file with a numerical score in the 5th column is rendered as an **Interval Track**.
  - A BED file with many data points automatically packs overlapping intervals into multiple rows.
- **Load project JSON**: Restore a whole workspace saved with **Save project…**, after confirmation. Projects from earlier formats cannot be opened; an error explains this without loading a partial workspace.

If you leave the page with unsaved work, the browser asks you to confirm first.

### 1.2 Session Molecule Type

Dunceious enforces a homogeneous session: all records in a workspace must belong to the same molecule type — either **nucleotide** (DNA/RNA) or **peptide** (amino acid protein).

- The detected type of the first loaded file establishes the **session type**.
- Subsequent uploads are checked against the active session type. An incompatible file (e.g., loading a protein FASTA when nucleotide records are already present) is rejected, and a dialog explains why. Clear all records first to switch types.
- The current session type is shown in the **Status Bar** at the bottom of the screen (blue DNA helix for nucleotide, purple node icon for peptide). The app chrome takes a matching accent, and so do its active controls: the selected workspace, the Pan/Select tool, focus rings, primary buttons and the selected record. In the Annotation Hub the accent is amber.
- In a peptide session, the **Translation** toggle in the top bar is automatically disabled and translation rows are not displayed in the sequence viewer, as they are not applicable to amino-acid sequences.

RNA sequences retain their original `U` residues. Uracil uses the same colour as
thymine (`T`), RNA codons can be translated, and GenBank exports retain the RNA
molecule type. In peptide sessions, `U` remains selenocysteine.

### 1.3 Alignment Workflow

You can align in two ways. Both end in the same place: the alignment is overlaid on the loaded records.

**A. Align inside Dunceious with EMBL-EBI** (the **Alignment** section in the sidebar):

1. Load at least two sequences.
2. Click **Align sequences**. The first time, read and tick the agreement: your sequences, your email and your IP address are sent to EMBL-EBI's servers and handled under its privacy notice and terms of use (job logs and your email are deleted after 7 days). Don't use this for data you are not allowed to share. The agreement lasts until you leave or reload the page; after a refresh or when you come back, Dunceious asks again. You can review or revoke it from the dialog at any time.
3. Pick an algorithm. **MAFFT** is the default: accurate and quick on whole genomes. **Kalign** is the fastest but slightly less precise on divergent sequences. **Clustal Omega** takes the largest inputs. **MUSCLE** is accurate on small sets but slow on long sequences. An algorithm that cannot take your data (too many sequences or too large) is greyed out with the reason.
4. Enter an email address (EMBL-EBI requires one per job; it is remembered in this browser) and click **Align**.
5. Follow the job in the monitor: validated, submitted, queued, aligning, fetching, applied. **Minimize** keeps it as a small status pill while you keep browsing; drag the pill anywhere it is out of your way, or focus it and move it with the arrow keys (Shift for bigger steps). Click it to reopen the monitor. **Cancel** only stops Dunceious waiting; the job finishes at EMBL-EBI anyway.

While a job runs, anything that would change the loaded records (uploading, loading a project, removing records, Clear All) is locked. Viewing, search, annotations and exports keep working.

**B. Compute it yourself** and upload the result (nothing leaves your machine):

1. Load sequences (GenBank or FASTA batch upload).
2. Compute the alignment externally using a tool of your choice (e.g., MAFFT, MUSCLE, Clustal Omega).
3. Upload the resulting aligned FASTA using **Upload pre-aligned FASTA** (see section 1.1).

Once an alignment is loaded, the conservation heatmap (toggled via the **Conservation** button in the top bar) becomes available.

Annotations stay whole across alignment gaps: a gap inside a sequence never cuts an annotation into pieces, and the translation of a coding feature is unchanged. Only features that really have several parts (such as `join(...)`) are drawn as separate bars joined by a connector.

## 2. Navigation & Interaction

### 2.1 Viewport Controls

- **Zoom**: Use the zoom slider, Ctrl + mouse wheel (or a trackpad pinch), or the `+` / `-` keys.
- **Scroll**: Use the horizontal scrollbar, Shift + mouse wheel, or the arrow keys. The column with sequence names is sticky and stays visible.
- **Pan Mode**: Click and drag to move the viewport.
- **Select Mode**: Click and drag to highlight a specific genomic region across all records. Double-click an annotation to select exactly its span. `Esc` clears the selection.
- **Go to position**: Type a position in the sidebar's **Navigation** box and press Enter. The field shows its unit: `bp` in a nucleotide session, `aa` in a peptide session.
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

When you focus from the Annotation Hub, a **Back to Annotation Hub** pill appears in the viewer. It returns you to the same row, which stays amber and carries a *Last focused* chip.

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

Results are highlighted in the viewer and listed in the sidebar. Use the **↑ / ↓** arrows to jump between matches. **Annotate** turns one hit into an annotation; **Join selected** / **Join all** turn several hits into one.

#### Fuzzy Mode (Smith-Waterman)

- Finds approximate matches using the Smith-Waterman local alignment algorithm with affine gap penalties.
- Both the forward strand and its **reverse complement** are searched automatically for nucleotide sessions. Reverse-complement search is suppressed in peptide sessions, where strand orientation does not apply.
- A **Min match confidence** slider (0–100 %) appears below the search bar. This filters results by the percentage of the best alignment score found in the current search — raise the threshold to see only high-quality matches, lower it to include more divergent hits.
- Results are sorted by alignment score (best match first).

> **Tip**: Use IUPAC mode for known motifs or primer sequences, and Fuzzy mode to find similar but not identical sequences (e.g., for mutation detection or homology searches).

### 3.2 Annotation Hub

Switch to **Annotation Hub** in the centred top-bar switcher; it stays in the same place in both workspaces. Search, Add annotation, Export… and the **⋯** workspace menu sit on its right, beside Options. The viewport has Pan/Select and Layers in that area instead; when inline controls do not fit the available space, **Layers** opens the layer toggles and explains unavailable layers. Its index, search, folds, grouping, density, selection and scroll positions stay in place when you switch to the viewport and back.

**Find and group sequences.** The sidebar's **Find sequence** searches IDs/accessions, display names, isolate text, details and definitions. **List** shows each sequence once; **Grouped** partitions them by Organism, Host, Location (country before `:`), Collection year or Imported from. The grouping menu previews counts; unavailable fields say **No data in these files**. Missing values are in **Not specified**, last. Sort by load order, accession or fewest annotations. **Needs attention** is a toggle chip with a sequence count, limiting the index to unannotated, partial or edited sequences. Each track card shows its accession or display name, isolate, length, annotation count, status flags and mini genome track. The current card has an amber edge and window showing the span of annotations visible in the main list. The index scrolls through every sequence without pagination; only the visible cards are rendered. The eye hides a sequence in the hub only; its dimmed card stays with a **Hidden in hub** flag. Click the card or its jump control to unhide it and jump to the sequence; mini-track features still jump to their annotation rows. The title shows visible/total counts when sequences are hidden; its compact **Show all** control restores them without moving the cards. At narrow widths it shows an eye-slash icon and the hidden count. Hub visibility persists across workspace tabs for the session and resets on workspace replacement; it is not saved in projects. Viewport visibility is separate: use the eye beside each record in the viewport sidebar’s **Record Navigator**.

**By sequence tab.** The tabs carry counts and the row's right side shows the filtered annotation and sequence totals. Each sequence and its rows share a rounded white card in a grey well. Its full header shows the accession followed by the display name, details chips, length, annotation count and genome track. The current card has an amber border and ring. The header scrolls away; once it is entirely above the list, a slim bar keeps its identity, live track window and counts visible. The bar moves up at the end of the card so it cannot cover the next header. Missing Host, Location and Collected values have **+** buttons that open the details editor focused on that field. Collapse a section to its type summary, or use the **Expand all / Collapse all** icons for visible sections. Choose Compact or Comfortable in the density control; the large genome track uses 10 px lanes with 3 px gaps in both densities. Mini tracks stay the same size. The scroll rail on the right combines group blocks, search ticks and a draggable thumb. Click a block to jump to its group, drag the thumb to scroll, or click empty rail space to page toward it; the sidebar follows the active section. Arrow and Page Up/Down keys scroll the focused list.

**Genome tracks.** Overlapping annotations pack into lanes, forward above the axis and reverse below it, with a base/kilobase ruler under the header track. Circular origin crossings retain their parts. Hover either track variant for the annotation's type, name, INSDC location, biological length, strand and sequence ID; nucleotide CDS tooltips also show amino-acid length. With no current row, hover highlights that feature and dims the others. While a row is current, its feature stays outlined on the full or slim track and other features stay dimmed; hovering them still reveals their tooltip. Click a feature to jump to its row. The window is a read-only indicator; empty track space does nothing. With the large strip focused, Left/Right steps through annotations in position order and exposes the same tooltip; Enter/Space jumps to its row. The amber window on the full header, slim bar and current index card follows the visible rows, spanning their minimum start to maximum end; an origin-crossing visible annotation extends it to the sequence end.

**Rows.** A coloured stripe and type pill identify the annotation type. The strand badge uses a forward arrow, reverse arrow or unknown mark. Inspect, Edit, Open in viewport and Delete appear inline at the end of the name cell on hover, keyboard focus, selected rows, the current row and the last-focused row; touch devices show them continuously. Click a row to make it current; click it again or press Esc to clear it. The viewport return row stays amber with a crosshairs **Last focused** chip. By-feature rows keep the accession, annotation name/product, isolate and chips on one line, truncating long text with a tooltip. The buttons remain reachable by Tab. Open in viewport outlines only that annotation, including when others share its span; manual region selection still outlines matching spans. Delete offers **Undo**; the return pill restores the origin row after a trip to the viewport. A source-only sequence is unannotated and offers **Import annotations…**.

**Sort rows within groups.** Click Type, Name / Product (Sequence in By feature), Location or Length above the list. Each column cycles ascending, descending, then off; off restores file and annotation order. A different column starts ascending. Group order stays the same. Each tab keeps its own sort for the session; search stepping, J/K and track windows follow the displayed rows. Sorting is not saved in exports.

**Edited and added annotations.** Edits to imported annotations carry an amber **edited** chip; new annotations carry a green **added** chip even after later edits. Headers, slim bars, index cards and the panel summary count them. **Edited in Dunceious** shows only marked annotations and combines with the other filters. Undo-delete restores the mark. Project files preserve these marks; GenBank, GenPept, GFF3 and FASTA never write them.

**Search annotations.** The header search field searches annotation name, gene, product, type and note, excluding sequence definitions. The counter and previous/next buttons step through matches; Enter / Shift+Enter do the same in search. Navigation opens the matching section and centres its row. Type chips show their feature colours and counts; All / → / ← chooses the strand filter. Search opens groups with hits; folds made while filtering apply only to that filter context.

**By feature tab.** Features are grouped within each organism and compared by identity, using product for mature/signal/transit peptides and gene, locus tag or name otherwise. The presence strip has fixed 14 px cells, one per sequence, with tooltips and a legend for the states shown. Present cells use the feature colour; duplicates add a dark inner ring, odd lengths use amber, and missing features use a rose outline. Hidden sequences keep a grey hidden cell but leave every comparison, median, count and state tag; group headers show the number hidden, and groups with no visible rows disappear. Lengths are compared separately per type against their median. Headers report missing, odd length (more than 3% from the median), duplicate and partial/not-determined cases. Features present in fewer than half the complete annotated sequences are accessory; their absence is not flagged. Partial sequences are never called missing; unannotated sequences are labelled unannotated. Unknown organisms and organisms without a complete annotated baseline explain why comparison is unavailable. **Only missing or odd length** narrows this tab, and missing-sequence links jump to the By sequence tab. The sidebar becomes a feature index with **Limit to sequences**.

**Edit details and display names.** **Edit details** opens a compact inset card with Organism, Host, Location and Collection date (four columns at 1280 px and wider, two below); Imported from and the isolate line are read-only. Location offers INSDC country suggestions. Dates accept `YYYY`, `Mon-YYYY`, `DD-Mon-YYYY`, `YYYY-MM` or `YYYY-MM-DD`, optionally with UTC time ending in `Z`; missing-value terms are accepted. Warnings do not block saving, but invalid edited values are omitted from interchange exports until corrected. Unchanged file values pass through. Changed fields show an amber edited marker and a revert icon inside the input to restore the file’s value. Details belong to the source feature, which is excluded from annotation counts and the generic feature editor. Rename gives a project-only display name beside the accession; it never changes export IDs.

**Selection.** Index/header checkboxes select sequences; row checkboxes select annotations, with a select-all-visible checkbox above the rows. Sequence actions include Show only these / Show all, Export…, Hide in hub, Set detail and Remove… with confirmation. **Set detail** fills only empty values by default; untick **Only where empty** to overwrite existing values. Selected annotations can be exported to GFF3 or deleted with Undo. Clear removes the selection. Bulk detail changes, sequence removals and annotation deletion remain locked during remote alignment.

**Import, save and drop.** The **⋯** menu offers Save project…, Sequences…, Pre-aligned FASTA…, Annotations…, Load project… and Clear workspace… (type `CLEAR` to confirm). Drop `.gb`/`.genbank`/`.fasta`/`.fa` sequences and `.bed`/`.gff`/`.gff3`/`.bedgraph` annotations together: sequences load first, then annotations attach to the records imported in that batch, even when their IDs gain suffixes. Duplicate incoming IDs make annotation routing ambiguous and are reported. Drop a project `.json` on its own; mixed project drops are refused. Drops always add FASTA as sequences; use **Pre-aligned FASTA…** explicitly for an alignment overlay.

**Keyboard.** Press `?` or use **Keyboard shortcuts** above Log in the sidebar to open the shortcut sheet. Esc or its close button dismisses it and returns focus to the opener. Tooltips show shortcut hints for search, match navigation and folding. These shortcuts apply while the hub has focus and you are not typing:

| Key | Action |
| --- | --- |
| `/` | Focus annotation search |
| Enter / Shift+Enter in search | Next / previous match |
| `J` / `K` | Next / previous row |
| `[` / `]` | Previous / next sequence or feature section |
| `X` | Select the current annotation row |
| `O` | Collapse/expand the current section |
| Esc | Close the open menu/dialog or clear the current row and checkbox selection |
| `?` | Open Keyboard shortcuts |

### 3.3 Metadata Inspector

The **Metadata Inspector** edits one annotation (sequence source details use **Edit details**): its key, display name, target sequence, strand, location (several segments, or a circular wrap-around), colour, and every qualifier. Qualifiers can be renamed, added and removed; a name GenBank would not round-trip is flagged before you save. **Discard** leaves the feature unchanged.

### 3.4 Annotation Details

Clicking an annotation (or **View details** in the Hub) shows its metadata, location and, for coding features, its protein translation. From there you can **Focus** it, **Copy Sequence**, **Copy AA**, **Export FASTA**, or switch on **Show sequence in viewer**.

### 3.5 Quantitative Tracks

- Toggle tracks on/off using the **Tracks** button in the top bar.
- Hover over a track to see the exact value at a specific genomic position.
- Track heights automatically adjust to show all overlapping data.

## 4. Exporting Data

Open **Export…** from the hub toolbar or sequence selection bar. The sequence tree follows the By sequence index grouping even from the By feature tab, with partial group checkboxes and Find. It starts with selected sequences, otherwise matching filters, otherwise all. Quick picks choose All, Selected in hub, Matching filters, Shown in hub, Shown in viewport or None; each shows its sequence count, and empty choices are disabled except None. The sequence tree scrolls internally and marks sequences with edited or added annotations. Format cards show what each file contains and where it opens. The contents preview counts sequences, annotations and edited/added annotations included; GenBank/GenPept also lists each detail qualifier with written, empty and invalid values left out. The filename sits under the preview, and the footer names the file and export count. Selected in hub and Matching filters exclude sequences hidden in the hub. Shown in hub selects every hub-visible sequence; Shown in viewport follows the separate navigator eyes. All includes hidden sequences. If export warnings offer **Edit details**, that action unhides only the affected sequences so their bulk detail repair is available.

Choose FASTA, GenBank, GFF3 or Dunceious project, then set options and the filename below the preview:

- **FASTA** writes original residues and ID-only headers by default. **Keep alignment gaps** is optional and unavailable without an alignment. **Include details in the header (NCBI format)** writes details, isolate/strain and kept unknown modifiers; deprecated modifiers are omitted. Whole-record FASTA from the viewport also defaults to original residues. Viewport selection export retains exactly the selected aligned columns.
- **GenBank / GenPept** writes sequences and annotations with molecule-appropriate qualifiers, quoted text, unquoted numeric values and bare flags. Annotation type and **Only matching annotations** filters retain source details. Missing organism warns without blocking export. Repeated qualifiers imported from GenBank keep only their last value.
- **GFF3** writes annotations and full-sequence details regions (`gbkey=Src`), with type and matching filters. Load the sequences separately before importing it. Geometry, strand, phase and multipart identity are preserved; exact extracted residue order for unusual all-inner-complement joins is not guaranteed.
- **Dunceious project** saves the chosen subset, retaining every workspace value, including invalid details, originals, edit markers, display names, modifiers and colours. It reopens only in Dunceious. **Save project…** in the ⋯ menu saves the whole workspace.

**What this file will contain** previews written details and omissions using the selected export options, including invalid edits, non-GenBank attributes and deprecated FASTA modifiers. Display names stay in Dunceious. The missing-organism warning offers **Edit details**. The footer shows the sequence count and filename. See [the format preservation table](./ARCHITECTURE.md#export-format-contracts) for what each export retains.

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
