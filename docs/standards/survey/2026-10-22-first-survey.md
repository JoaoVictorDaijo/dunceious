# Sequence-standard adoption by databases, viewers and editors

Research date: 2026-10-22. Documentation survey, not an executable conformance test. Scope: the original brief plus W1–W5. The requested repository was read only for its scientific-rigor rule; its implementation was not inventoried.

## Summary

- GenBank, ENA and DDBJ explicitly share the INSDC Feature Table; RefSeq GBFF is based on it.[^1][^2][^3][^4]
- GenBank and FASTA are common interchange choices among sequence editors; format support does not establish semantic round-trip fidelity (see counted matrix).
- `join` and `order` are different INSDC operations; documented app support for that distinction is scarce.[^1]
- Human-facing coordinates and interchange coordinates must be distinguished: UCSC displays 1-based closed positions but BED uses 0-based half-open intervals.[^19]
- IUPAC nucleotide ambiguity is explicitly documented by SnapGene, CLC, ApE and Artemis, with different operation scopes.[^28][^39][^45][^49]
- NCBI genetic tables are a common translation reference, but Benchling excludes 27/28/31 and EMBOSS has a separate table-0 convention.[^5][^14][^21][^40]
- Table selection alone does not establish `/codon_start`, `/transl_except`, partial-CDS or initiation semantics.[^1][^32]
- Extraction is command-specific: joined, separate intervals and genomic-span outputs must be named separately.[^13][^22][^30][^18][^20]
- Alignment has no universal default: BLAST, EMBOSS and Biopython use different scoring contracts.[^7][^8][^12][^35]
- GFF3/SO does not replace INSDC losslessly: NCBI preserves `gbkey`; CLC does not interpret SO accessions as feature types.[^9][^38]
- The strongest adoption signal is interchange support; unsupported edge-case claims remain explicitly unknown below.

## Scope, naming and evidence rules

“Benchly” is treated as **Benchling**, and “Genius” as **Geneious Prime**. The coordinating researcher confirmed this interpretation for the task but explicitly said the owner has not confirmed it; these are assumptions, not a claim about the owner's intent. Official product documentation confirms the product names.[^21][^22]

All fifteen apps named in W1 are retained. None was established by this investigation to be discontinued or clearly niche enough to exclude. In particular, ApE has a documented August 2026 release; its plasmid focus is not evidence of discontinuation.[^48] Artemis/ACT is one related tool-family column, with Artemis-specific findings identified. Old manual dates are not evidence that a project is discontinued. No additional apps were added beyond W1. EMBOSS and Biopython remain reference tools, and GenBank/RefSeq, ENA, DDBJ, BLAST and ORFfinder remain reference services rather than additional votes for app adoption.

Only sources actually opened and read support positive claims. Some pages inaccessible through the web reader were read directly over HTTPS in memory (CLC manuals and Ensembl REST documentation). No software was installed or executed for behavior testing. “Unknown” means **could not verify from the examined sources**, not “no”. Search snippets alone were not used as evidence. Page dates below are the dates displayed by the source, not search-engine estimates; undated pages were accessed on the research date. Documentation labeled “latest” is not an immutable release.

## Primary matrix: testable operations

The following panels are one matrix split horizontally for readability. Rows follow W4; original brief operations are covered by these rows, the formats matrix and the notes.

**Cell vocabulary:** **C = conforms**, limited to the documented sub-behavior stated; **D = deviates**, with the difference stated; **N = not supported**, only where explicit; **U = unknown**. Each cell cites the source examined. A source on a U cell records the investigated documentation, not evidence of absence. **C-contract** means the database's declared format contract, not measured parser behavior. Literal syntax, parsing, concatenation order, editing and serialization are separate properties: generic “multi-part support” never earns full conformance.

**Comparison baseline:** rows 1–6 and 10–13 use the INSDC location/CDS contract; row 7 uses 1-based closed *display* (file conventions are separately described); rows 8–9 use IUPAC alphabets, with accepted symbols and operation scope stated; row 14 compares extraction to feature-oriented splicing and reverse complementation; row 15 asks for an explicit INSDC→SO export mapping. Row 16 has no universal standard: C identifies a documented algorithm/default, not agreement with another aligner. A row containing multiple requirements remains U if only some are documented, with the known part stated.


### Operations panel 1

| Operation | GenBank / RefSeq | ENA | DDBJ | BLAST | ORFfinder | EMBOSS 6.6 | Biopython 1.88 docs |
|---|---|---|---|---|---|---|---|
| 1. join parsed; concatenated in written order | C-contract[^1] | C-contract[^1] | C-contract[^1] | U[^7] | U[^6] | U[^13] | U compound join extraction documented; arbitrary order unverified[^32] |
| 2. order kept distinct from join | C-contract[^1] | C-contract[^1] | C-contract[^1] | U[^7] | U[^6] | U[^13] | U[^32] |
| 3. complement: whole feature / intervals | C-contract[^1] | C-contract[^1] | C-contract[^1] | U[^7] | U[^6] | U[^13] | C extraction complements, mixed strands[^32] |
| 4. Partial < > retained: import/edit/export | U lifecycle; partial syntax C-contract[^1] | U lifecycle; partial syntax C-contract[^1] | U lifecycle; partial syntax C-contract[^1] | U[^7] | U[^6] | U[^13] | U edit/export; fuzzy position model[^32] |
| 5. ^ / between sites | C-contract[^1] | C-contract[^1] | C-contract[^1] | U[^7] | U[^6] | U[^13] | C zero-length ^, including L^1[^32] |
| 6. Circular origin-spanning features | C-contract[^1] | C-contract[^1] | C-contract[^1] | U[^7] | U[^6] | U[^13] | C origin-wrapping CompoundLocation[^32] |
| 7. Coordinates shown to users | C flat-file numbering[^1] | C flat-file numbering[^1] | C flat-file numbering[^1] | U[^7] | C 1-based inclusive[^6] | U[^13] | D API 0-based half-open[^32] |
| 8. Nucleotide ambiguity + U in search/display | U search; IUPAC file alphabet[^1] | U search; IUPAC file alphabet[^1] | U search; IUPAC file alphabet[^1] | U[^7] | U ambiguity/U; hyphens rejected[^6] | U[^13] | U search; DNA RC treats U as T[^33] |
| 9. Amino acids U/O/B/Z/J/X | C-contract[^1] | C-contract[^1] | C-contract[^1] | U[^7] | U[^6] | U[^13] | U[^32] |
| 10. /transl_table selection | C-contract[^1] | C-contract[^1] | C-contract[^1] | U[^7] | U qualifier import; table selector exists[^6] | D transeq table 0 default; qualifier use U[^14] | C SeqFeature.translate[^32] |
| 11. /codon_start | C-contract[^1] | C-contract[^1] | C-contract[^1] | U[^7] | U[^6] | U[^13] | C 1/2/3→0/1/2 offset[^32] |
| 12. Alternative starts translated as M | C initiation M[^5] | U[^3] | U[^4] | U[^7] | U M output; ATG/alternative/sense modes[^6] | U[^13] | C when cds=True[^33] |
| 13. /transl_except | C-contract[^1] | C-contract[^1] | C-contract[^1] | U[^7] | U[^6] | U[^13] | U automatic exception application[^32] |
| 14. Feature extraction: multi-part / minus | C-contract; not a UI-copy claim[^1] | C-contract; not a UI-copy claim[^1] | C-contract; not a UI-copy claim[^1] | U[^7] | U[^6] | D separate parts by default; -join concatenates; minus RC[^13] | C joins and strand-aware extraction[^32] |
| 15. INSDC→SO mapping on GFF3 export | C SOFA + gbkey[^9] | U[^3] | U[^4] | U[^7] | U[^6] | U[^13] | U[^32] |
| 16. Alignment scoring defaults | U[^2] | U[^3] | U[^4] | C task-specific; CLI/API differ[^8] | U[^6] | C needle: EDNAFULL/EBLOSUM62, 10/0.5; free ends[^12] | C +1/0; gaps −1; no default matrix[^35] |

### Operations panel 2

| Operation | Benchling | Geneious Prime | SnapGene | CLC Genomics Workbench | DNASTAR SeqBuilder Pro |
|---|---|---|---|---|---|
| 1. join parsed; concatenated in written order | U literal join; grouped translations skip introns[^21] | U parsing/order; concatenate option[^22] | U join semantics; multiple segments[^26] | U INSDC; GFF3 CDS/ID groups spliced[^38] | U[^57] |
| 2. order kept distinct from join | U[^21] | U[^22] | U[^26] | U[^38] | U[^57] |
| 3. complement: whole feature / intervals | U[^21] | U[^22] | U[^26] | U[^38] | U[^57] |
| 4. Partial < > retained: import/edit/export | U[^21] | U[^22] | U[^26] | U[^38] | U[^57] |
| 5. ^ / between sites | U[^21] | U[^22] | U[^26] | U[^38] | U[^57] |
| 6. Circular origin-spanning features | C circular annotation wrap[^21] | U feature export; circular origin extraction exists[^23] | U origin-feature serialization; topology supported[^29] | C GFF3 beyond-end only for circular reference[^38] | U[^57] |
| 7. Coordinates shown to users | U[^21] | U[^22] | C starts at 1; original numbering optional[^30] | U[^38] | U[^57] |
| 8. Nucleotide ambiguity + U in search/display | U[^21] | U[^22] | U DNA/RNA IUPAC display documented; search unverified[^28] | U operation-specific; IUPAC includes U[^39] | U[^57] |
| 9. Amino acids U/O/B/Z/J/X | U[^21] | U[^22] | U[^26] | C documented U/O/B/Z/J/X alphabet[^41] | U[^57] |
| 10. /transl_table selection | D NCBI except 27/28/31; imported code used[^21] | U qualifier; selectable/custom codes[^23] | U qualifier; genetic-code selector[^27] | U qualifier; NCBI-derived selector[^40] | U[^57] |
| 11. /codon_start | U[^21] | U[^22] | U[^26] | U[^38] | U[^57] |
| 12. Alternative starts translated as M | U default; M checkbox documented[^21] | U[^22] | U[^26] | U[^38] | U[^57] |
| 13. /transl_except | U[^21] | U[^22] | U[^26] | U[^38] | U[^57] |
| 14. Feature extraction: multi-part / minus | U[^21] | U minus; concatenate or separate intervals[^22] | U multi-part/minus; region span includes intervening bases[^30] | U splicing/minus; annotated-region extraction exists[^44] | U[^57] |
| 15. INSDC→SO mapping on GFF3 export | U[^21] | U[^22] | U[^26] | U export mapping; D SO-accession import interpretation[^38] | U[^57] |
| 16. Alignment scoring defaults | U numeric costs; MAFFT v7 Auto default[^67] | U defaults; multiple aligners[^24] | U[^26] | C open 10, extend 1; cheap ends[^43] | U[^57] |

### Operations panel 3

| Operation | MacVector | Unipro UGENE | ApE | Jalview | Artemis / ACT |
|---|---|---|---|---|---|
| 1. join parsed; concatenated in written order | U[^58] | U[^47] | U[^49] | U[^51] | U written-order proof; joins accepted (Artemis)[^45] |
| 2. order kept distinct from join | U[^58] | U[^47] | U[^49] | U[^51] | U[^45] |
| 3. complement: whole feature / intervals | U[^58] | U[^47] | U[^49] | U[^51] | C complement syntax (Artemis); mixed-strand U[^45] |
| 4. Partial < > retained: import/edit/export | U full lifecycle; partial annotation notation documented[^59] | U[^47] | U[^49] | U[^51] | U lifecycle; fuzzy syntax accepted (Artemis)[^45] |
| 5. ^ / between sites | U[^58] | U[^47] | U[^49] | U[^51] | U[^45] |
| 6. Circular origin-spanning features | U feature serialization; origin selection supported[^59] | U[^47] | U spanning features; circular rotation documented[^49] | U[^51] | U[^45] |
| 7. Coordinates shown to users | U[^58] | U[^47] | U[^49] | U[^51] | U[^45] |
| 8. Nucleotide ambiguity + U in search/display | U[^58] | U[^47] | U U; IUPAC DNA search/display[^49] | U[^51] | U U/display; IUB search (Artemis)[^45] |
| 9. Amino acids U/O/B/Z/J/X | U[^58] | U[^47] | U[^49] | U[^51] | U[^45] |
| 10. /transl_table selection | U[^58] | U qualifier; translation-table selector[^60] | U table/qualifier; translation exists[^49] | U qualifier; alternative tables since 2.11[^53] | U qualifier; configurable Standard Code[^45] |
| 11. /codon_start | U[^58] | U[^47] | U[^49] | D Translate as cDNA not frame-aware[^53] | U[^45] |
| 12. Alternative starts translated as M | U[^58] | U M; alternative initiation option[^60] | U[^49] | U[^51] | U[^45] |
| 13. /transl_except | U[^58] | U[^47] | U[^49] | U[^53] | U[^45] |
| 14. Feature extraction: multi-part / minus | U[^58] | U output semantics; command exists[^61] | U[^49] | U feature extraction; Translate as cDNA not intron-aware[^53] | U splicing; separate record per selected feature[^45] |
| 15. INSDC→SO mapping on GFF3 export | U[^58] | U[^47] | U[^49] | U[^51] | U mapping; GFF3 writer exists[^66] |
| 16. Alignment scoring defaults | U[^58] | U[^47] | U numeric defaults[^49] | U numeric defaults; Smith–Waterman pairwise[^53] | U external-tool defaults[^46] |

### Operations panel 4

| Operation | NCBI Sequence Viewer | IGV | JBrowse 2 | Ensembl | UCSC |
|---|---|---|---|---|---|
| 1. join parsed; concatenated in written order | U[^10] | U[^54] | U[^56] | U INSDC; Parent creates GFF3 blocks[^16] | U[^19] |
| 2. order kept distinct from join | U[^10] | U[^54] | U[^56] | U[^16] | U[^19] |
| 3. complement: whole feature / intervals | U[^10] | U[^54] | U[^56] | U[^16] | U[^19] |
| 4. Partial < > retained: import/edit/export | U[^10] | U[^54] | U[^56] | U[^16] | U[^19] |
| 5. ^ / between sites | U[^10] | U[^54] | U[^56] | U[^16] | U[^19] |
| 6. Circular origin-spanning features | U[^10] | U[^54] | U[^56] | U[^16] | U[^19] |
| 7. Coordinates shown to users | U[^10] | U UI; BED 0-half-open, GFF 1-closed[^54] | U exact UI convention; example starts 1[^56] | C 1-based inclusive Ensembl/API[^15] | C UI 1-closed; D BED 0-half-open[^19] |
| 8. Nucleotide ambiguity + U in search/display | U[^10] | U U; BAM ambiguity since 2.0.11[^54] | U[^56] | U[^16] | U[^19] |
| 9. Amino acids U/O/B/Z/J/X | U[^10] | U[^54] | U[^56] | U[^16] | D CDS alignment output uses Z for STOP[^20] |
| 10. /transl_table selection | U[^10] | U[^54] | U[^56] | U[^16] | U[^19] |
| 11. /codon_start | U[^10] | U[^54] | U[^56] | U[^16] | U[^19] |
| 12. Alternative starts translated as M | U[^10] | U[^54] | U[^56] | U[^16] | U[^19] |
| 13. /transl_except | U[^10] | U[^54] | U[^56] | U[^16] | U[^19] |
| 14. Feature extraction: multi-part / minus | U feature strand; range copy 5′→3′; exons separate FASTA[^63] | U[^54] | U[^56] | U minus; cDNA/CDS spliced, genomic default[^18] | C CDS alignment concatenates; per-exon option[^20] |
| 15. INSDC→SO mapping on GFF3 export | U mapping; GFF3 download[^10] | U[^54] | U[^56] | U mapping; SOFA types in GFF3[^16] | N direct Browser GFF3 support[^19] |
| 16. Alignment scoring defaults | U[^10] | U[^54] | U[^56] | U[^16] | U[^19] |

### Interpretation limits for the primary matrix

No app receives a blanket claim that `<`/`>` survive arbitrary import, editing and export. No investigated vendor source established that `order()` is preserved distinctly throughout that lifecycle. No claim that a specific app silently changes `order` to `join` is made here. Biopython documents a compound-location model but explicitly limits the documented extraction contract to joins; that is not proof of what an `order` instance will do at runtime.[^32]

INSDC “between” denotes a site (`^`), not a `between(...)` operator. Legacy within-position syntax and present-day valid submission syntax must not be conflated.[^1] The archive cells describe their published record contract, whereas browser cells concern specific documented commands. Thus unknown literal-INSDC support in a GFF-oriented browser is not evidence that it cannot display spliced genes.

## Secondary matrix: tool × standard

**reads** = documented import, parsing or consumption; **writes** = documented export/production; **reads+writes** = both established; **no** = explicit lack of support in the named interface; **unknown** = not verified. A one-direction cell establishes that direction only, not the absence of the other direction. For alphabets/genetic codes/ontologies, “reads” means documented interpretation/use, and “writes” means documented emitted representation. These are adoption indicators, not validator certification. INSDC FT requires explicit evidence beyond merely listing GenBank; most app cells therefore remain unknown.

`SAM/BAM` means at least one member of the pair; UGENE reads BAM but writes SAM. Exact specification revisions remain unknown unless stated in the notes. Optional plugins are not silently counted as native support. The app cohort for adoption counts is the fifteen W1 rows; the seven reference rows are reported separately.

| Tool | INSDC Feature Table | GenBank flat file | EMBL flat file | FASTA | GFF3 | GTF | BED | SAM/BAM | VCF | SBOL | NCBI genetic codes | IUPAC nucleotide codes | IUPAC amino-acid codes | Sequence Ontology |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SnapGene | unknown[^31] | reads+writes[^26] | reads[^31] | reads[^31] | unknown[^31] | unknown[^31] | unknown[^31] | reads[^31] | unknown[^31] | unknown[^31] | unknown[^31] | reads[^28] | unknown[^31] | unknown[^31] |
| Geneious Prime | unknown[^25] | reads+writes[^25] | reads[^25] | reads+writes[^25] | reads[^25] | reads[^25] | reads+writes[^25] | reads+writes[^25] | reads[^25] | unknown[^25] | unknown[^25] | unknown[^25] | unknown[^25] | unknown[^25] |
| Benchling | unknown[^68] | reads+writes[^68] | unknown[^68] | reads+writes[^68] | unknown[^68] | unknown[^68] | unknown[^68] | unknown[^68] | unknown[^68] | reads+writes[^68] | reads[^21] | unknown[^68] | unknown[^68] | unknown[^68] |
| CLC Genomics Workbench | unknown[^36] | reads+writes[^37] | reads+writes[^37] | reads+writes[^37] | reads+writes[^36] | reads+writes[^36] | reads+writes[^36] | reads+writes[^42] | reads+writes[^36] | unknown[^36] | reads[^40] | reads[^39] | reads[^41] | reads[^38] |
| DNASTAR SeqBuilder Pro | unknown[^57] | reads+writes[^57] | reads+writes[^57] | reads+writes[^57] | unknown[^57] | unknown[^57] | unknown[^57] | unknown[^57] | unknown[^57] | unknown[^57] | unknown[^57] | unknown[^57] | unknown[^57] | unknown[^57] |
| MacVector | unknown[^58] | reads+writes[^58] | reads+writes[^58] | reads+writes[^58] | reads[^59] | unknown[^58] | reads[^59] | reads[^59] | unknown[^58] | unknown[^58] | unknown[^58] | unknown[^58] | unknown[^58] | unknown[^58] |
| Unipro UGENE | unknown[^47] | reads+writes[^47] | reads[^47] | reads+writes[^47] | unknown[^47] | unknown[^47] | unknown[^47] | reads+writes[^47] | reads+writes[^47] | unknown[^47] | unknown[^47] | unknown[^47] | unknown[^47] | unknown[^47] |
| ApE | unknown[^49] | reads+writes[^49] | unknown[^49] | unknown[^49] | unknown[^49] | unknown[^49] | unknown[^49] | unknown[^49] | unknown[^49] | unknown[^49] | unknown[^49] | reads[^49] | unknown[^49] | unknown[^49] |
| Jalview | unknown[^50] | reads[^50] | reads[^50] | reads+writes[^52] | reads[^51] | unknown[^50] | unknown[^50] | unknown[^50] | reads[^52] | unknown[^50] | unknown[^50] | unknown[^50] | unknown[^50] | unknown[^50] |
| Artemis / ACT | reads+writes[^45] | reads+writes[^45] | reads+writes[^45] | reads+writes[^45] | reads+writes[^66] | unknown[^45] | unknown[^45] | reads[^45] | reads+writes[^45] | unknown[^45] | unknown[^45] | reads[^45] | unknown[^45] | unknown[^45] |
| IGV | unknown[^54] | reads[^55] | unknown[^54] | reads[^55] | reads[^54] | reads[^54] | reads[^54] | reads[^54] | reads[^54] | unknown[^54] | unknown[^54] | reads[^54] | unknown[^54] | unknown[^54] |
| JBrowse 2 | unknown[^56] | unknown[^56] | unknown[^56] | reads[^56] | reads[^56] | reads[^56] | reads[^56] | reads[^56] | reads[^56] | unknown[^56] | unknown[^56] | unknown[^56] | unknown[^56] | unknown[^56] |
| NCBI Sequence Viewer | unknown[^11] | writes[^10] | unknown[^11] | reads+writes[^10] | reads+writes[^10] | reads[^11] | reads+writes[^10] | reads[^11] | reads+writes[^10] | unknown[^11] | unknown[^11] | unknown[^11] | unknown[^11] | unknown[^11] |
| Ensembl | unknown[^16] | unknown[^16] | unknown[^16] | writes[^18] | reads[^16] | reads+writes[^17] | unknown[^16] | unknown[^16] | unknown[^16] | unknown[^16] | unknown[^16] | unknown[^16] | unknown[^16] | reads[^16] |
| UCSC | unknown[^19] | unknown[^19] | unknown[^19] | writes[^20] | no[^19] | reads+writes[^19] | reads+writes[^19] | reads[^19] | reads[^19] | unknown[^19] | unknown[^19] | unknown[^19] | writes[^20] | unknown[^19] |

The Artemis/ACT row counts verified capabilities of the family through Artemis; it does not assert every ACT command is identical. UCSC's “no” is for direct Browser GFF3 tracks, not for every conversion utility. SnapGene's importer extension list does not establish exporter availability. ApE's GenBank entry includes its documented dialect, not strict INSDC certification. For NCBI Sequence Viewer read directions, see the custom-track list as well as the export page.[^11]

### Reference services/libraries (not app-cohort votes)

| Tool | Established adoption | Not established here |
|---|---|---|
| GenBank/RefSeq | INSDC-based GBFF; NCBI tables; IUPAC; NCBI GFF3/SO export[^1][^2][^5][^9] | General-purpose import/export product matrix |
| ENA | EMBL submission and shared INSDC vocabulary/location contract[^1][^3] | Other API format directions and complete revision inventory |
| DDBJ | Shared INSDC feature table and DDBJ flat-file contract[^1][^4] | Other API format directions |
| BLAST | FASTA/accession input; documented task-specific scoring[^7][^8] | Feature-table round-trip or sequence-editor semantics |
| ORFfinder | FASTA/accession input; NCBI genetic-code selection[^6] | General annotation round-trip |
| EMBOSS | Documented EMBL-backed extraction and FASTA output; selected translation tables[^13][^14] | Complete suite-wide format directions |
| Biopython | GenBank/EMBL/FASTA read+write; NCBI translation tables; location objects[^32][^33][^34] | Complete cross-module GFF/BED/SAM/VCF/SBOL inventory |

The same standard columns for the reference cohort follow. Archive “writes” denotes published records, not a desktop Save command.

| Tool | INSDC Feature Table | GenBank flat file | EMBL flat file | FASTA | GFF3 | GTF | BED | SAM/BAM | VCF | SBOL | NCBI genetic codes | IUPAC nucleotide codes | IUPAC amino-acid codes | Sequence Ontology |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GenBank / RefSeq | reads+writes[^1] | writes[^2] | unknown[^2] | unknown[^2] | writes[^9] | unknown[^2] | unknown[^2] | unknown[^2] | unknown[^2] | unknown[^2] | reads+writes[^1] | reads+writes[^1] | reads+writes[^1] | writes[^9] |
| ENA | reads+writes[^1] | unknown[^3] | reads[^3] | unknown[^3] | unknown[^3] | unknown[^3] | unknown[^3] | unknown[^3] | unknown[^3] | unknown[^3] | reads+writes[^1] | reads+writes[^1] | reads+writes[^1] | unknown[^3] |
| DDBJ | reads+writes[^1] | writes[^1] | unknown[^4] | unknown[^4] | unknown[^4] | unknown[^4] | unknown[^4] | unknown[^4] | unknown[^4] | unknown[^4] | reads+writes[^1] | reads+writes[^1] | reads+writes[^1] | unknown[^4] |
| BLAST | unknown[^7] | unknown[^7] | unknown[^7] | reads[^8] | unknown[^7] | unknown[^7] | unknown[^7] | unknown[^7] | unknown[^7] | unknown[^7] | unknown[^7] | unknown[^7] | unknown[^7] | unknown[^7] |
| ORFfinder | unknown[^6] | unknown[^6] | unknown[^6] | reads[^6] | unknown[^6] | unknown[^6] | unknown[^6] | unknown[^6] | unknown[^6] | unknown[^6] | reads[^6] | unknown[^6] | unknown[^6] | unknown[^6] |
| EMBOSS | unknown[^13] | unknown[^13] | reads[^13] | writes[^13] | unknown[^13] | unknown[^13] | unknown[^13] | unknown[^13] | unknown[^13] | unknown[^13] | unknown[^13] | unknown[^13] | unknown[^13] | unknown[^13] |
| Biopython | reads+writes[^34] | reads+writes[^34] | reads+writes[^34] | reads+writes[^34] | unknown[^34] | unknown[^34] | unknown[^34] | unknown[^34] | unknown[^34] | unknown[^34] | reads[^32] | reads[^33] | unknown[^34] | unknown[^34] |

## Adoption signal

Counts below are **verified lower bounds out of 15 apps**, derived from the secondary matrix. “Any” counts reads, writes or both once per app; “both” counts only reads+writes. Unknowns are not negative votes. The cohort was chosen by the owner, not sampled from usage statistics; these counts measure documented compatibility, not market share. Non-file standards use the interpretation above, so their lower counts should not be compared directly with FASTA import counts.

| Standard | Any / 15 | Both / 15 | Unknown / 15 | Explicit no / 15 |
|---|---:|---:|---:|---:|
| INSDC Feature Table | 1 | 1 | 14 | 0 |
| GenBank flat file | 12 | 9 | 3 | 0 |
| EMBL flat file | 8 | 4 | 7 | 0 |
| FASTA | 14 | 9 | 1 | 0 |
| GFF3 | 9 | 3 | 5 | 1 |
| GTF | 7 | 3 | 8 | 0 |
| BED | 7 | 4 | 8 | 0 |
| SAM/BAM | 10 | 3 | 5 | 0 |
| VCF | 9 | 4 | 6 | 0 |
| SBOL | 1 | 1 | 14 | 0 |
| NCBI genetic codes | 2 | 0 | 13 | 0 |
| IUPAC nucleotide codes | 5 | 0 | 10 | 0 |
| IUPAC amino-acid codes | 2 | 0 | 13 | 0 |
| Sequence Ontology | 2 | 0 | 13 | 0 |

Counts inherit the cell-level evidence and limitations above; no additional support was inferred to increase them.

### Semantic differences behind the counts

| Standard | Verified difference or unresolved fidelity question |
|---|---|
| INSDC Feature Table | Distinct `order` preservation and partial-end lifecycle are unverified for apps; GenBank support cannot substitute for those tests.[^1][^32] |
| GenBank flat file | SnapGene adds qualifiers/notes for display metadata; ApE adds `ApEinfo`; Geneious drag-export does not force strict GenBank; Artemis discards incompatible source-format headers when converting.[^26][^49][^25][^45] |
| EMBL flat file | UGENE documents read-only support. Artemis conversion can discard the GenBank header.[^47][^45] |
| FASTA | Artemis concatenates ordinary multi-FASTA on opening; indexed FASTA offers reference selection. FASTA support therefore does not imply independent-record handling.[^45] |
| GFF3 | CLC merges CDS by parent, does not translate SO accessions, ignores embedded FASTA and does not render Gap/Target alignments. UCSC Browser explicitly requires GFF2 instead.[^38][^19] |
| GTF | Ensembl's page describes GFF2-based GTF; UCSC explicitly names GTF2.2. Do not infer an identical dialect from the extension.[^17][^19] |
| BED | UCSC/IGV document 0-based half-open files; UCSC position display is 1-based closed.[^19][^54] |
| SAM/BAM | UGENE reads BAM and writes SAM, so the grouped support cell is asymmetric. IGV's help discusses user-facing 1-based positions under SAM/BAM; it must not be used as a specification of binary BAM storage.[^47][^54] |
| VCF | Read/write availability does not establish a specific revision or equivalent allele normalization; neither was verified across this cohort.[^36][^47][^54] |
| SBOL | Benchling documents RDF import/export, but no verified SBOL major/minor revision or preservation of all design relationships.[^68] |
| NCBI genetic codes | Benchling excludes tables 27, 28 and 31. CLC distinguishes extracting an existing annotation translation from recomputing the nucleotide translation.[^21][^40] |
| IUPAC nucleotide codes | SnapGene distinguishes DNA T and RNA U. ApE's documented scope is DNA; its U handling remains unknown. “Accepts ambiguity” does not establish a search match policy.[^28][^49] |
| IUPAC amino-acid codes | CLC lists U/O/B/Z/J/X. UCSC CDS FASTA alignment uses Z for stop and X for codons containing N, so that specific output conflicts with interpreting every Z as Glu/Gln ambiguity.[^41][^20] |
| Sequence Ontology | Ensembl GFF3 requires SOFA terms/accessions; CLC recognizes terms but does not translate accessions such as SO:0000316 into CDS semantics. NCBI emits a closest SOFA type plus original `gbkey`.[^16][^38][^9] |

## Per-tool evidence and interpretation

Each numbered footnote below contains the full URL, source version/date and a short quotation. These notes state what the evidence establishes and what remains open.

### NCBI GenBank/RefSeq, ENA and DDBJ

The INSDC page explicitly identifies the shared feature-table contract. It distinguishes joined sequence from mere ordered locations, represents partial boundaries and between-base sites, and defines the translation qualifiers and extended amino-acid alphabet.[^1] NCBI's GBFF documentation explicitly links that contract; this supports applying it to the GenBank/RefSeq file family, rather than assuming every NCBI UI follows identical rules.[^2] ENA requires EMBL flat files for annotation submissions and shows a linear/circular topology field.[^3] DDBJ's page links version 11.4 (April 2026), but its embedded title still says 11.3 (October 2024): this is a documentation-version discrepancy, not proof of differing production parsers.[^4]

NCBI's Genetic Codes page was last updated September 23, 2024. It explicitly assigns codes through `/transl_table`, uses T even for GenBank mRNA, and translates initiators as M. Its table list is not evidence that every downstream tool implements every code.[^5]

NCBI GFF3 maps to the closest SOFA type while retaining `gbkey`. Repeated IDs represent multi-part features; `start_range`/`end_range` and partial attributes carry uncertainty. `Is_circular` identifies circular records; origin-crossing features can use extended coordinates. The file's `#!gff-spec-version` is the appropriate revision indicator, rather than assuming all NCBI releases use one revision. NCBI explicitly documents differences from standard GFF3.[^9]

### NCBI Sequence Viewer

Download commands distinguish selected/visible ranges from annotation-track exports. Documented outputs include FASTA, GenBank, GFF3, BED and VCF (track-dependent). Inputs include aligned FASTA, GFF2/3, GTF, BED and VCF; remote BAM is supported.[^10][^11] Clipboard selection copies 5′→3′ without a header.[^62] RNA/CDS tooltips offer sequence links, and the exon option emits separate FASTA records.[^63] Those statements do not establish the result of copying an arbitrary multi-interval minus-strand feature, nor round-tripping `order` or fuzzy boundaries.

### NCBI BLAST and ORFfinder

The opened BLAST+ appendix documents **task `blastn`**: match +2, mismatch −3, gap opening 5, extension 2, word size 11, both strands, DUST `20 64 1`, soft masking true. MegaBLAST instead uses +1/−2, word 28, and default gap costs 0/2.5. For **task `blastp`**, it gives BLOSUM62, word 3, opening 11, extension 1, composition adjustment 2, SEG off. The blastp table explicitly labels itself as reflecting **BLAST+ 2.2.27**; it is authoritative documentation, not verification against a current installed binary.[^7]

The separately opened URL API documents blastp gap costs **11/2**, despite the CLI table's **11/1**. This is an unresolved documentation/interface discrepancy; neither should silently overwrite the other. API nucleotide defaults agree on blastn +2/−3 and 5/2, and MegaBLAST +1/−2. Pin interface, task and explicit parameters in an oracle.[^8] NCBI's reference list cites Altschul's BLAST work, gapped BLAST and the BLAST+ architecture paper.[^65]

ORFfinder uses 1-based inclusive query subranges, accepts FASTA/accessions, rejects hyphens, and offers ATG-only, selected-code alternative initiators, or any-sense-codon starts. Its form is evidence for these choices, not for importing CDS exceptions or a particular minimum-length default.[^6]

### EMBOSS

EMBOSS **6.6.0.0 needle** names Needleman–Wunsch, defaults to EDNAFULL for nucleotides and EBLOSUM62 for proteins, gap 10/0.5, and unpenalized terminal gaps (`endweight=N`). Its affine cost is opening + (length−1)×extension. This is not interchangeable with a BLAST gap-cost setting merely because both name BLOSUM62. The documentation establishes EDNAFULL, not an unverified equivalence to a particular NUC.4.4 implementation.[^12]

`extractfeat` emits intervals separately unless `-join` is set and reverse-complements reverse-sense nucleic-acid features. This is a useful independent extraction oracle with explicit settings.[^13] `transeq` defaults to frame 1 and table **0** (“Standard”), distinguishing table **1** (“Standard with alternative initiation codons”); its listed tables stop at 23. `trim` and `clean` default false. It is not documented here as an INSDC CDS interpreter honoring every qualifier.[^14] EBI-hosted legacy EMBOSS pages were unavailable; these are the upstream release manuals, not a claim about the current EBI service wrapper.

### Ensembl

The API documentation defines 1-based inclusive coordinates and represents a zero-length insertion by start=end+1.[^15] Release **116, June 2026** GFF3 documentation requires SOFA terms/accessions and uses Parent relationships to display joined blocks.[^16] Its GFF/GTF page explicitly describes version-2 conventions, including inclusive endpoints and frame 0/1/2; that frame must not be confused with the literal 1/2/3 `/codon_start` value.[^17]

The REST sequence endpoint explicitly distinguishes genomic (default where applicable), spliced cDNA with UTRs, and spliced CDS without UTRs. This establishes command-dependent extraction, not all minus-strand export behaviors.[^18] Genetic-table choice, exception handling, origin-spanning transcript handling and INSDC→SO exporter mapping were not verified.

### UCSC Genome Browser

BED supports blocks with strand and 0-based half-open intervals; position notation displays the corresponding 1-based closed range. Direct GFF tracks are GFF2, and the documentation explicitly says GFF3 is unsupported; GTF is identified as GTF2.2.[^19] This does not characterize external converters.

Table Browser sequence output offers genomic DNA and, for appropriate gene tracks, mRNA/protein from the source. Its **CDS FASTA alignment** output concatenates coding exons by default, optionally separates them, and translates using strand and exon frames. In that output, a codon with a gap becomes `-`, one containing N becomes X, and a stop becomes **Z**. This is an important output-specific alphabet deviation, not a general statement that every UCSC protein file uses Z for stops.[^20]

### Benchling

The annotations guide (updated September 30, 2025) explicitly states NCBI-derived alternative codes, use of codes from imported GenBank, Standard as default, and exclusions **27, 28, 31**. Its text calls the GenBank property `trans_table`; the INSDC spelling is `/transl_table`, so the documentation typo is not evidence of a different file qualifier.[^21][^1] Grouped translations skip introns, circular annotations may wrap, and translation analysis offers an M-initiation checkbox. Full qualifier preservation and literal location parsing remain unknown.[^21]

The file guide establishes GenBank/FASTA/SBOL RDF import/export but not SBOL version.[^68] The alignment guide names **MAFFT v7**, cites Katoh and Standley (2013), and selects Auto by default; the opened text does not specify numerical default gap penalties.[^67]

### Geneious Prime

The annotation manual explicitly offers concatenation or separate output sequences for multiple intervals. Bulk extraction can add context or choose entire sequences, so “Extract” cannot be reduced to one universal output rule.[^22] Genetic codes can be selected and customized. Circular topology affects operations; origin-crossing extraction is mentioned, but complete feature serialization semantics are unverified.[^23]

The alignment manual describes several aligners and adjustable matrices/gap costs, without establishing a single numerical default applicable to all workflows.[^24] The format manual lists GenBank/EMBL/FASTA and GFF/GFF3/GTF imports; SAM/BAM, BED and VCF are also supported. Documented exports include GenBank/FASTA, annotation GFF/BED and alignment SAM/BAM. It does **not** establish that every GFF export is GFF3. Dragging small sequences to the desktop exports annotations as written rather than converting them to strict GenBank.[^25]

### SnapGene

“GenBank–SnapGene” explicitly follows GenBank/GenPept conventions with extra qualifiers and notes, including multi-segment display metadata. This is positive evidence of a dialect, not proof that arbitrary INSDC constructs round-trip.[^26] A genetic-code selector applies to new ORFs/features and optionally existing features; complete NCBI table identity and qualifier behavior remain unverified.[^27]

The alphabet guide explicitly supports IUPAC degeneracy and distinguishes DNA T from RNA U.[^28] SnapGene 8.0+ distinguishes changing topology from performing circularization; origin-spanning feature export remains unknown.[^29] New File from Selection may preserve numbering or reset to 1; selecting bounding features includes intervening sequence. Multi-segment/minus feature-copy semantics are not specified there.[^30] The format-extension list (updated September 12, 2026, scope 6.0+) establishes imports, not all exports.[^31] Export Feature Data is CSV/TSV metadata; that command must not be mistaken for sequence extraction.[^64]

### Biopython

The opened API pages identify **1.88**. `SeqFeature.translate` reads `/codon_start` and `/transl_table`; CDS features default to CDS validation. Partial CDS callers may need an explicit `cds=False`, rather than assuming fuzzy ends disable complete-CDS checks. Automatic `/transl_except` handling is not promised in the opened contract.[^32]

`Seq.translate(cds=True)` recognizes valid alternative initiators as M and validates complete CDS structure. DNA and RNA are accepted. Ambiguous codons such as TAN/NNN become X; invalid mixed gap codons raise an error. DNA reverse complement treats U as T, while the RNA function emits U. These are operation-specific rules, not a universal alphabet validator.[^33] SeqIO documents GenBank/EMBL/FASTA read/write; the documentation itself cautions its format table may lag implementation.[^34]

`PairwiseAligner` defaults in 1.88 docs are match +1, mismatch 0, gaps −1, with no substitution matrix; versions ≤1.85 used zero default gap scores. BLAST-named scoring presets exist, but choosing a preset does not make the algorithm BLAST's heuristic search.[^35]

### CLC Genomics Workbench (QIAGEN)

The **25.0.3** manual explicitly lists bidirectional GFF3/GTF/BED/VCF, GenBank/EMBL/FASTA and SAM/BAM support.[^36][^37][^42] Its GFF3 importer merges exons into transcript parents and CDS by parent/ID. It recognizes SO terms but leaves SO accessions uninterpreted, ignores embedded FASTA/directives, and treats Gap/Target as attributes rather than alignment instructions. Circular references permit beyond-end features; linear ones reject them.[^38]

Separate appendices document nucleotide U/ambiguity and amino-acid U/O/B/Z/J/X.[^39][^41] Translation tables are explicitly sourced from NCBI; extracting an existing CDS translation is distinguished from recomputing translation.[^40] Alignment gap defaults are opening 10, extension 1, with “cheap” terminal gaps (extensions, free beyond 10).[^43] Annotated-region extraction and flanks are documented, but exact spliced/minus output semantics were not established.[^44]

### DNASTAR Lasergene — SeqBuilder Pro

The vendor's application-specific file-format table explicitly marks **SeqBuilder Pro**, not the whole suite, as importing/exporting GenBank, EMBL and FASTA. Native sequence formats include Lasergene DNA `.seq` and protein `.pro`.[^57] Support in SeqMan or MegAlign was not transferred to SeqBuilder Pro. Literal locations, alphabet edge cases, CDS exceptions, GFF3 vocabulary mapping and numerical alignment defaults remain unverified; format capability is the principal established adoption signal here.

### MacVector

The official importing guide explicitly states both import and export for GenBank, EMBL and FASTA.[^58] The release-history page documents GFF/GFF3/BED import and SAM/BAM display, partial-feature annotation using “starts before”/“ends after”, and selection across circular origins.[^59] These statements do not establish all-roundtrip partial preservation, `order`, between sites, genetic-table provenance, or feature extraction orientation. Native MacVector saves are distinct from exchange-format export.[^69]

### Unipro UGENE

The current format table gives GenBank/FASTA/VCF read/write, EMBL read-only, BAM read-only and SAM read/write. It says **GFF**, without establishing its version, so GFF3 remains unknown in the secondary matrix.[^47] ORF Marker has a translation-table selector and explicit alternative-initiation options; those do not prove `/transl_table` qualifier use or M-initiation output.[^60] An export-selected-annotations command exists, but the opened text does not define concatenation or minus-strand behavior.[^61]

### ApE

The official site reports **3.1.10.1, August 10, 2026**.[^48] The authors' 2022 paper establishes GenBank-like files with `ApEinfo` extensions and an option to omit feature-formatting qualifiers. It also documents IUPAC DNA search/display and circular sequence rotation.[^49] The current PDF manual exceeded the web reader's limit and was not used as evidence. NCBI table fidelity, partial-end round-tripping, `order` semantics and exact alignment defaults remain unknown; the paper's comparisons of other products were not used to establish those products' support.

### Jalview

Current help lists GenBank/EMBL alignment input recognition.[^50] Feature input accepts GFF2/3; GFF3 attributes can be retained on GFF export, but the text does not certify all output as a specific GFF3 revision. Jalview's native feature format is separate from INSDC.[^51] FASTA output and VCF annotation loading are explicitly documented.[^52]

“Translate as cDNA” offers alternative codes (since 2.11) but is explicitly neither frame-aware nor intron-aware and discards an incomplete final codon. It must not be treated as a full CDS qualifier interpreter. Pairwise alignment is identified as Smith–Waterman; numerical defaults were not verified.[^53]

### Artemis / ACT (Sanger)

Artemis **18.0.0** documentation explicitly supports much EMBL location syntax, including joins, complements and fuzzy endpoints, plus GenBank/EMBL/FASTA and BAM/VCF workflows. Format conversion can discard incompatible headers. Its ordinary multi-FASTA input concatenates records, a different operation from joining one feature's intervals. Search accepts IUB nucleotide codes. The validation command may fill missing GFF3 CDS phase with 0; callers must distinguish that repair from preserving source uncertainty.[^45]

ACT's **release-18** manual describes the comparison viewer and shared EMBL/GenBank concepts.[^46] Artemis's documented Chado export wrapper explicitly writes GFF3.[^66] Whether all ACT import/export paths share every Artemis behavior, and `order`/exception/full partial lifecycle semantics, remain unknown.

### IGV and JBrowse 2

IGV documents GFF2/GFF3/GTF, BED, SAM/BAM and VCF track input; it explicitly distinguishes BED half-open and GFF inclusive coordinates and supports BAM IUPAC ambiguity from 2.0.11.[^54] Reference genomes can be loaded from FASTA or GenBank.[^55] These are track/reference contracts, not evidence of an INSDC editor or general annotation exporter.

JBrowse 2's current user guide identifies indexed FASTA reference input and GFF3/GTF/BED, BAM/CRAM and VCF adapters. Its examples use user-facing ranges starting at 1, but that example alone is insufficient to certify every API and display coordinate path. Extra formats may come from plugins, which were not counted without evidence.[^56] No full INSDC semantic or translation-exception claim is made for either browser.

## Claims not verified / remaining evidence gaps

- **All app products:** an exhaustive, version-pinned import→edit→export fixture suite for `order`, nested complement, remote intervals, fuzzy endpoints and between sites. No vendor behavior was inferred from merely accepting a `.gb` extension.
- **Translation:** `/transl_except` execution outside the declared archive contract; exact handling of partial start/end CDSs, mixed-strand compound CDSs, table-specific dual stop/sense codons, and the literal qualifier import/export behavior marked U.
- **Alphabets:** complete U/O/B/Z/J/X acceptance in every tool, gap handling in every format, U↔T search equivalence, ambiguity-vs-ambiguity search matching, and whether invalid symbols are rejected, normalized or preserved.
- **Coordinates:** all app UI conventions where only format documentation or examples were available; distinctions between displayed coordinates and APIs remain material.
- **Feature extraction:** exact multi-interval and minus-strand clipboard/export behavior for Benchling, SnapGene, CLC, DNASTAR, MacVector, UGENE, ApE, Jalview, Artemis/ACT, IGV and JBrowse; Ensembl minus-strand export was not independently verified. Known partial evidence is retained in row 14.
- **Vocabulary mapping:** complete INSDC-key/qualifier→SO exporter mapping outside NCBI; a GFF3 importer or ontology mention is not evidence of an exporter mapping.
- **Formats:** precise GenBank/EMBL specification revisions used by vendor builds; GFF3 patch versions, GTF dialects, SAM/BAM/VCF versions and SBOL version except the limited explicit versions noted above. Own-format binary schemas were not audited.
- **Algorithms:** current executable BLAST+ defaults versus its historical-labeled manual table; the CLI/API blastp gap discrepancy; numeric defaults for most vendor aligners; equivalence of EDNAFULL and NUC.4.4 was not established.
- **Sources:** EBI legacy EMBOSS URLs were inaccessible; upstream EMBOSS manuals supplied the evidence. NCBI Bookshelf's main path returned a challenge, while its official `/sites/books/` documentation opened successfully. ApE's current manual was too large for the web reader. The CLC and Ensembl pages cited as directly fetched were read without installing software or writing downloads.
- **Adoption:** no market-share or installation-count survey; “widely adopted” here denotes the owner-selected comparison cohort. Non-support is asserted only where explicit; no product was dropped solely because its manual was old.

## Standard documents

This is a source-document register, separate from evidence that a product implements a particular revision. “Current” below means the document served by the authoritative endpoint on 2026-10-22, unless explicitly qualified. A release number for a database is not a format specification version. Download links were opened, except where an access failure is explicitly recorded. No source documents were stored by this task: its authorized output remains this single Markdown report.

| Standard | Canonical source; verified version/date | Machine-downloadable document | License / redistribution evidence |
|---|---|---|---|
| INSDC Feature Table | [INSDC definition](https://www.insdc.org/submitting-standards/feature-table/), **11.4, April 2026**[^1] | [NCBI HTML snapshot, FTv11_4.html](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html); no separate TXT/PDF verified[^70] | **License not stated** in the examined joint-authored document. NCBI hosting alone does not establish government authorship of the whole INSDC work.[^70][^71] |
| GenBank release notes | [gbrel.txt](https://ftp.ncbi.nlm.nih.gov/genbank/gbrel.txt), **release 274.0, October 15, 2026**[^72] | Same URL, plain TXT; rolling latest endpoint | NCBI's policy places information created by/for the US government in the public domain and requests acknowledgment. Apply that policy to NCBI-authored documentation; it is not a blanket license for third-party sequence records.[^71] |
| EMBL user manual | [ENA/EMBL usrman.txt](https://ftp.ebi.ac.uk/pub/databases/embl/doc/usrman.txt), **release 143, March 2020**; latest served at this legacy endpoint, not established as the newest ENA documentation[^73] | Same URL, TXT. The attempted `/ena/sequence/doc/usrman.txt` endpoint returned 404. | Manual explicitly permits copying and redistribution without advance permission **provided its permission statement accompanies each copy**.[^73] |
| NCBI genetic codes / gc.prt | [Genetic Codes](https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi), page updated **September 23, 2024**; machine table **version 4.6**, no version-4.6 date in header[^5][^74] | [gc.prt](https://ftp.ncbi.nih.gov/entrez/misc/data/gc.prt), ASN.1 text containing code IDs, residues and starts | No separate license in gc.prt; NCBI government-work policy applies to NCBI-created material. Header credits initial PIR data and subsequent contributors; do not erase that provenance.[^71][^74] |
| NC-IUB nucleotide codes | [Nomenclature for Incompletely Specified Bases](https://iubmb.qmul.ac.uk/misc/naseq.html), **Recommendations 1984**, published **1985**, with later reprints[^75] | Downloadable HTML at the canonical URL; standalone PDF/TXT not verified | **Copyright IUBMB; reproduced with permission** on this mirror. An onward redistribution license is **not stated**; mirror permission is not permission for this repo.[^75] |
| IUPAC-IUB JCBN amino-acid codes | [Amino Acids and Peptides](https://iupac.qmul.ac.uk/AminoAcid/index.html), **Recommendations 1983**, published **1984**, corrections/addenda linked[^76] | HTML sections linked from canonical index; [publisher PDF](https://publications.iupac.org/pac/1984/pdf/5605x0595.pdf) returned **403**, so its bytes could not be verified | Index states **Copyright IUBMB and IUPAC**. General onward redistribution license **not stated** in the examined source.[^76] |
| Sequence Ontology | [SO registry record](https://obofoundry.org/ontology/so.html); resolved OBO has **data-version 2026-08-07**, OBO format-version **1.2** (different version fields)[^77][^78] | [so.obo PURL](https://purl.obolibrary.org/obo/so.obo), resolves to repository `Ontology_Files/so.obo`; registry also links OWL and SOFA subset | **CC BY 4.0**, stated by registry and [ontology repository LICENSE](https://raw.githubusercontent.com/The-Sequence-Ontology/SO-Ontologies/master/LICENSE).[^77][^79] |
| GFF3 | [SO-maintained specification](https://raw.githubusercontent.com/The-Sequence-Ontology/Specifications/master/gff3.md), document **1.26, August 18, 2020**, for format **GFF3**[^80] | Same URL, Markdown | **License not stated** in examined specification; an attempted `Specifications/master/LICENSE` returned 404. Do not apply the separate SO ontology repository's CC license automatically.[^80] |
| GTF2.2 | Historical specification at [Brent Lab GTF22](https://mblab.wustl.edu/GTF22.html); **2.2** identified by UCSC, specification date **could not verify**[^19] | Canonical HTML inaccessible (connection refused / timeout); separate PDF/TXT **could not verify**. `mblab.org/GTF22.html` returned a landing-page redirect, not a specification. | **License not stated / could not verify** because original document could not be retrieved. UCSC's GTF explanation is a readable secondary implementation reference, not a recovered original specification.[^19] |
| GA4GH BED v1 | [HTS specification index](https://samtools.github.io/hts-specs/), [BED PDF](https://samtools.github.io/hts-specs/BEDv1.pdf), **January 5, 2022**, revision **9ddbc52**[^81][^82] | [BEDv1.pdf](https://samtools.github.io/hts-specs/BEDv1.pdf); [BEDv1.tex](https://raw.githubusercontent.com/samtools/hts-specs/master/BEDv1.tex) | **License not stated** in examined PDF/TEX/index. A repository LICENSE probe returned 404; this is not a finding that no license exists anywhere.[^81][^82] |
| SAMv1 / BAM | [HTS index](https://samtools.github.io/hts-specs/), **SAM/BAM 1.6**, PDF **August 12, 2025**, revision **b5341fb**[^81][^83] | [SAMv1.pdf](https://samtools.github.io/hts-specs/SAMv1.pdf); [SAMv1.tex](https://raw.githubusercontent.com/samtools/hts-specs/master/SAMv1.tex) | **License not stated** in examined PDF/TEX/index. Do not substitute the samtools executable's license for specification terms.[^81][^83] |
| VCF | [HTS index](https://samtools.github.io/hts-specs/), **VCF4.5 / BCF2.2**, PDF **February 25, 2026**, revision **e821e4f**; older VCF versions remain linked[^81][^84] | [VCFv4.5.pdf](https://samtools.github.io/hts-specs/VCFv4.5.pdf); [VCFv4.5.tex](https://raw.githubusercontent.com/samtools/hts-specs/master/VCFv4.5.tex) | **License not stated** in examined PDF/TEX/index.[^81][^84] |
| SBOL | [Official data-model index](https://sbolstandard.org/datamodel-specification/), current **3.1.0, October 26, 2022**[^85] | [SBOL3.1.0.pdf](https://sbolstandard.org/docs/SBOL3.1.0.pdf)[^86] | PDF front page explicitly **CC BY 4.0**. Website footer says **CC BY-NC-ND 4.0** for site content; retain the PDF's own license when storing that document.[^85][^86] |
| FASTA reference | [NCBI nucleotide FASTA guidance](https://www.ncbi.nlm.nih.gov/genbank/fastaformat/), updated **June 18, 2025**; **unversioned submission profile**, not a universal format specification[^87] | Downloadable HTML at same URL; standalone normative PDF/TXT **not verified** | NCBI government-authored webpage policy.[^71] The HTS index attributes historical FASTA to Pearson but does not define or endorse an unaligned format; no single versioned universal FASTA standard established here.[^81] |

For a later source bundle, the EMBL manual has explicit copying conditions, SO and the SBOL PDF have explicit CC BY 4.0 statements, and NCBI provides a government-work policy with third-party exceptions. For the other documents this report supplies links and states the unresolved terms; it does not assert permission to redistribute complete source texts. The 1983 amino-acid recommendation alone should not be cited as proof of every later U/O/J software convention.

## Sources (full numbered list)

All sources accessed 2026-10-22. Quotations are deliberately brief. “Undated” means no applicable source version/date was established, not that a current executable was tested.

[^1]: **INSDC**, [DDBJ/ENA/GenBank Feature Table Definition](https://www.insdc.org/submitting-standards/feature-table/), **11.4, April 2026**, §§2, 3.4, CDS qualifiers, 7.4. Quote: “This feature table format is shared by GenBank, EMBL and DDBJ.”
[^2]: **NCBI**, [GBFF format](https://www.ncbi.nlm.nih.gov/datasets/docs/v2/reference-docs/file-formats/annotation-files/about-ncbi-gbff/), generated **October 13, 2026**. Quote: “The GBFF format is based on the DDBJ/ENA/GenBank Feature Table Definition”.
[^3]: **ENA**, [Flat File Example](https://ena-docs.readthedocs.io/en/latest/submit/fileprep/flat-file-example.html), undated, documentation label 1. Quote: “The EMBL flat file format should be used for the submission of annotation data”.
[^4]: **DDBJ**, [Feature Table Definition](https://www.ddbj.nig.ac.jp/ddbj/feature-table.html), linked original **11.4 April 2026**, embedded title **11.3 October 2024**. Quote: “Version 11.3 October 2024”.
[^5]: **NCBI**, [The Genetic Codes](https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi), last update **September 23, 2024**. Quote: “The possible intiator codons are marked as 'M' in the second ('Starts') row”. Spelling retained from source.
[^6]: **NCBI**, [ORFfinder](https://www.ncbi.nlm.nih.gov/orffinder/), live form, undated. Quote: “The range includes the residue at the To coordinate.”
[^7]: **NCBI**, [BLAST+ manual appendices](https://www.ncbi.nlm.nih.gov/sites/books/NBK279684/), tables C2/C3 and nucleotide scoring section; C3 explicitly references **2.2.27**. Quote: “This table reflects the 2.2.27 BLAST+ release.”
[^8]: **NCBI**, [Common URL API](https://blast.ncbi.nlm.nih.gov/doc/blast-help/urlapi.html), undated. Quote: “blastp,blastx,tblastn: `11 2`” (GAPCOSTS default). This is the documented value, not a silently corrected one.
[^9]: **NCBI**, [GFF3 format](https://www.ncbi.nlm.nih.gov/datasets/docs/v2/reference-docs/file-formats/annotation-files/about-ncbi-gff3/), undated, Datasets documentation v2. Quote: “The original GenBank feature type is also provided by the "gbkey" attribute”.
[^10]: **NCBI Sequence Viewer**, [Download Sequence and Track Data](https://www.ncbi.nlm.nih.gov/tools/sviewer/seqtrackdata/), undated. Quote: “You can also download annotation and sequence data from the sequence track in GenBank flat file format.”
[^11]: **NCBI Sequence Viewer**, [Adding custom tracks](https://www.ncbi.nlm.nih.gov/tools/sviewer/extdata/), undated. Quote: “Accepted file formats include ASN.1, BED, aligned FASTA, GFF2, GFF3, GTF, VCF, WIG, and XML.”
[^12]: **EMBOSS**, [needle](https://emboss.sourceforge.net/apps/release/6.6/emboss/apps/needle.html), **6.6.0.0**. Quote: “gap opening penalty + (n - 1) * gap extension penalty”.
[^13]: **EMBOSS**, [extractfeat](https://emboss.sourceforge.net/apps/release/6.6/emboss/apps/extractfeat.html), **6.6.0.0**. Quote: “as a single concatenated sequence if the `-join` qualifier is used.”
[^14]: **EMBOSS**, [transeq](https://emboss.sourceforge.net/apps/release/6.6/emboss/apps/transeq.html), **6.6.0.0**. Quote: “0 (Standard); 1 (Standard (with alternative initiation codons))”.
[^15]: **Ensembl**, [General instructions for the Perl API — Coordinates](https://grch37-mart.ensembl.org/info/docs/api/general_instructions.html), GRCh37 documentation, undated. Quote: “use inclusive coordinates which start at 1.”
[^16]: **Ensembl**, [GFF3 format](https://jun2026.archive.ensembl.org/info/website/upload/gff3.html), **release 116, June 2026**. Quote: “Must be a term or accession from the SOFA sequence ontology”.
[^17]: **Ensembl**, [GFF/GTF format](https://jun2026.archive.ensembl.org/info/website/upload/gff.html), **release 116, June 2026**. Quote: “Both, the start and end position are included.”
[^18]: **Ensembl REST**, [GET sequence/id/:id](https://rest.ensembl.org/documentation/info/sequence_id), undated; directly fetched over HTTPS. Quote: “cdna refers to the spliced transcript sequence with UTR”.
[^19]: **UCSC**, [Data File Formats FAQ](https://genome.ucsc.edu/FAQ/FAQformat.html), undated; BED, GFF and GTF sections. Quote: “there is also a GFF3 specification that is not currently supported by the Browser.”
[^20]: **UCSC**, [Table Browser Help](https://www.genome.ucsc.edu/goldenPath/help/hgTablesHelp.html), undated; sequence output and CDS FASTA alignments. Quote: “Stop codons are represented with a Z.”
[^21]: **Benchling**, [Characterize sequences with annotations and translations](https://help.benchling.com/hc/en-us/articles/39768268305805-How-to-characterize-sequences-with-annotations-and-translations), updated **September 30, 2025**. Quote: “Benchling currently supports all genetic codes defined by NCBI except:” (followed by 27, 28, 31).
[^22]: **Geneious Prime**, [Working with Annotations](https://manual.geneious.com/en/latest/Annotations.html), `latest`, undated. Quote: “the intervals can be concatenated into a single sequence.”
[^23]: **Geneious Prime**, [Creating, Viewing and Editing Sequences](https://manual.geneious.com/en/latest/Sequences.html), `latest`, undated. Quote: “You can also enter a custom genetic code here”.
[^24]: **Geneious Prime**, [Sequence Alignments](https://manual.geneious.com/en/latest/Alignments.html), `latest`, undated. Quote: “such as the Geneious aligner, MUSCLE or Clustal Omega.”
[^25]: **Geneious Prime**, [Importing and Exporting Data](https://manual.geneious.com/en/latest/ImportExport.html), `latest`; bulk import stated from **11.1** onward. Quote: “annotations on the document are exported as written, and not converted to strict Genbank format.”
[^26]: **SnapGene**, [What is GenBank–SnapGene Format?](https://support.snapgene.com/hc/en-us/articles/10242682237588-What-is-Genbank-SnapGene-Format), **October 20, 2022**. Quote: “additional qualifiers are used to encode information used by SnapGene”.
[^27]: **SnapGene**, [Choose the Translation Genetic Code](https://support.snapgene.com/hc/en-us/articles/10383962848532-Choose-the-Translation-Genetic-Code), unversioned help. Quote: “To apply the selected genetic code to existing features, click the check box.”
[^28]: **SnapGene**, [View or Use IUPAC Ambiguity Codes](https://support.snapgene.com/hc/en-us/articles/10384302587540-View-or-Use-IUPAC-Ambiguity-Codes), updated **September 11, 2026**. Quote: “For RNA, T is substituted with U”.
[^29]: **SnapGene**, [Circularize or Linearize a DNA Sequence](https://support.snapgene.com/hc/en-us/articles/10384301645460-Circularize-or-Linearize-a-DNA-Sequence), updated **September 11, 2026**, includes **8.0+** distinction. Quote: “This command will update the existing file”.
[^30]: **SnapGene**, [Extract a Region in a Sequence to a New File](https://support.snapgene.com/hc/en-us/articles/10384297596180-Extract-a-Region-in-a-Sequence-to-a-New-File), updated **September 11, 2026**. Quote: “select both features and any intervening sequence.”
[^31]: **SnapGene**, [What File Extensions does SnapGene support?](https://support.snapgene.com/hc/en-us/articles/10242726896020-What-File-Extensions-does-SnapGene-support), updated **September 12, 2026**, **6.0+**. Quote: “file extensions/ file types supported by SnapGene 6.0 and later.”
[^32]: **Biopython**, [Bio.SeqFeature](https://biopython.org/docs/latest/api/Bio.SeqFeature.html), **1.88 documentation**. Quote: “taking into account the codon_start and transl_table qualifiers, if they are present.”
[^33]: **Biopython**, [Bio.Seq](https://biopython.org/docs/latest/api/Bio.Seq.html), **1.88 documentation**. Quote: “Any U in the sequence is treated as a T”.
[^34]: **Biopython**, [SeqIO](https://biopython.org/wiki/SeqIO), site label **1.88**, historical per-format support versions. Quote: “The table here may not be fully up to date.”
[^35]: **Biopython**, [Pairwise sequence alignment](https://biopython.org/docs/latest/Tutorial/chapter_pairwise.html), **1.88 documentation**. Quote: “all gap scores equal to -1.0.”
[^36]: **QIAGEN CLC Genomics Workbench**, [Annotation and variant formats](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=Annotation_variant_formats.html), **25.0.3**, directly fetched. Quote: “all of the annotation and variant formats can be imported as tracks”.
[^37]: **QIAGEN CLC Genomics Workbench**, [Sequence data formats](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=Sequence_data_formats.html), **25.0.3**, directly fetched. Quote: “Sequence data formats that can be imported using Standard Import”.
[^38]: **QIAGEN CLC Genomics Workbench**, [GFF3 format](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=GFF3_format.html), **25.0.3**, directly fetched. Quote: “will not translate accession numbers to types.”
[^39]: **QIAGEN CLC Genomics Workbench**, [IUPAC codes for nucleotides](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=IUPAC_codes_nucleotides.html), **25.0.3**, directly fetched. Quote: “U Uracil”.
[^40]: **QIAGEN CLC Genomics Workbench**, [Translation of DNA or RNA to protein](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=Translation_DNA_or_RNA_protein.html), **25.0.3**, directly fetched. Quote: “The translation tables are sourced from the NCBI”.
[^41]: **QIAGEN CLC Genomics Workbench**, [IUPAC codes for amino acids](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=IUPAC_codes_amino_acids.html), **25.0.3**, directly fetched. Quote: “O Pyl Pyrrolysine”.
[^42]: **QIAGEN CLC Genomics Workbench**, [Read mapping formats](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=Read_mapping_formats.html), **25.0.3**, directly fetched. Quote: “Index files can be created as part of BAM and CRAM exports.”
[^43]: **QIAGEN CLC Genomics Workbench**, [Gap costs](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=_dup2Gap_costs.html), **25.0.3**, directly fetched. Quote: “The default values are 10.0 and 1.0 for the two parameters, respectively.”
[^44]: **QIAGEN CLC Genomics Workbench**, [Extract Annotated Regions](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=Extract_Annotated_Regions.html), **25.0.3**, directly fetched. Quote: “Lengths of flanking regions can be specified if desired.”
[^45]: **Sanger Artemis**, [Artemis Manual](https://sanger-pathogens.github.io/Artemis/Artemis/artemis-manual.html), **18.0.0**, copyright **1999–2019**. Quote: “Artemis understands most of the EMBL location syntax”.
[^46]: **Sanger ACT**, [ACT Manual](https://sanger-pathogens.github.io/Artemis/ACT/act-manual.html), **Artemis tool set release 18**, copyright **2000–2019**. Quote: “a DNA sequence comparison viewer”.
[^47]: **Unipro UGENE**, [Specific File Formats](https://ugene.net/docs/appendixes/appendix-a-supported-file-formats/specific-file-formats/), current unversioned manual. Quote: “File format | File extension | Read | Write | Comment” (table headings).
[^48]: **ApE / M. Wayne Davis**, [official site](https://jorgensen.biology.utah.edu/wayned/ape/), modified **August 10, 2026**. Quote: “latest ApE (v3.1.10.1, August 10, 2026)”.
[^49]: **Davis and Jorgensen**, [ApE, A Plasmid Editor](https://www.frontiersin.org/journals/bioinformatics/articles/10.3389/fbinf.2022.818619/full), **2022**, authors' primary implementation paper, DOI **10.3389/fbinf.2022.818619**. Quote: “ApE files contain additional information not specified in the GenBank specification.”
[^50]: **Jalview**, [Alignment File Formats](https://www.jalview.org/help/html/io/fileformats.html), current unversioned help. Quote: “GenBank | Line starts with LOCUS”.
[^51]: **Jalview**, [Sequence Features File](https://www.jalview.org/help/html/features/featuresFormat.html), current help; mixed input from **2.6**, nested attributes from **2.11.1.0**. Quote: “sequence feature definitions can also be provided in GFF2”. The same sentence continues with GFF3.
[^52]: **Jalview**, [Alignment Window File Menu](https://www.jalview.org/help/html/menus/alwfile.html), current unversioned help. Quote: “Load VCF annotations from a plain text, or indexed file”.
[^53]: **Jalview**, [Alignment Window Calculate Menu](https://www.jalview.org/help/html/menus/alwcalculate.html), current help; alternative tables from **2.11**. Quote: “the translation is not frame- or intron-aware”.
[^54]: **IGV**, [Data Tracks file formats](https://igv.org/doc/desktop/FileFormats/DataTracks/), current unversioned help; BAM ambiguity from **2.0.11**. Quote: “IGV supports the GFF2, GFF3 and GTF file formats.”
[^55]: **IGV**, [Reference genome](https://igv.org/doc/desktop/UserGuide/reference_genome/), current unversioned help. Quote: “Fasta and .2bit sequence files”. Its custom-genome list also includes GenBank `.gbk`.
[^56]: **JBrowse 2**, [Basic usage](https://jbrowse.org/jb2/docs/user_guides/basic_usage/), current unversioned guide, File format support section. Quote: “Core JBrowse 2 reads BAM/CRAM, tabix-indexed VCF/GFF3/GTF/BED”.
[^57]: **DNASTAR**, [File Formats](https://www.dnastar.com/resources/file-formats/), undated application-specific import/export tables. Quote: “File Format | MegAlign Pro | Protean 3D | SeqBuilder Pro | SeqMan Ultra | SeqNinja” (column headings).
[^58]: **MacVector**, [Importing sequences](https://macvector.com/getting-started/useful-workflows/importing-sequences-into-macvector/), undated. Quote: “MacVector will import (and export!) all the following universal sequence formats.”
[^59]: **MacVector**, [Major release details and history](https://macvector.com/getting-started/macvector-major-release-details-and-history/), multiple releases, undated aggregate. Quote: “using the standard GenBank format for ‘starts before’ and ‘ends after’ notation.” Quotation marks normalized.
[^60]: **Unipro UGENE**, [ORF Marker](https://ugene.net/docs/extensions/orf-marker/), current unversioned manual. Quote: “DNA-to-Amino translation table defines how start, alternative start, and stop codons are encoded.”
[^61]: **Unipro UGENE**, [Exporting Sequence of Selected Annotations](https://ugene.net/docs/sequence-view/manipulating-sequence/exporting-sequence-of-selected-annotations/), current unversioned manual. Quote: “select the Export ‣ Export sequence of selected annotations item”.
[^62]: **NCBI Sequence Viewer**, [Navigating the Sequence Viewer](https://www.ncbi.nlm.nih.gov/tools/sviewer/navigation/), undated. Quote: “The sequence string will be copied in the 5’ to 3’ orientation without a header.”
[^63]: **NCBI Sequence Viewer**, [Accessing RNA and protein sequence data](https://www.ncbi.nlm.nih.gov/tools/sviewer/mrnaproteindata/), undated. Quote: “The exons option provides the individual exons of an RNA feature as separate FASTA”.
[^64]: **SnapGene**, [Export Feature Data](https://support.snapgene.com/hc/en-us/articles/10383937644308-Export-Feature-Data), unversioned help. Quote: “Save as either tab-separated (tsv) or comma-separated (csv) text.”
[^65]: **NCBI BLAST**, [References](https://blast.ncbi.nlm.nih.gov/doc/blast-help/references.html), undated curated bibliography. Quote: “BLAST programs”. Includes Altschul et al. 1990/1997 and Camacho et al. 2009.
[^66]: **Sanger Artemis**, [writedb_entry](https://sanger-pathogens.github.io/Artemis/Chado/writedb_entry.html), undated. Quote: “allows export to EMBL and GFF3 formats.”
[^67]: **Benchling**, [How to create alignments](https://help.benchling.com/hc/en-us/articles/39922093033869-How-to-create-alignments), current unversioned guide. Quote: “MAFFT alignments are performed via MAFFT v7 (Katoh, Standley 2013)”.
[^68]: **Benchling**, [DNA and RNA sequence overview](https://help.benchling.com/hc/en-us/articles/39110680274189-DNA-and-RNA-sequence-overview), current unversioned guide. Quote: “We recommend GenBank for processed sequences”. Includes import table and individual/bulk export sections.
[^69]: **MacVector**, [Use File→Export to save sequences in a different file format](https://macvector.com/2017/03/24/use-file-export-to-save-sequences-in-a-different-file-format/), **March 24, 2017**. Quote: “always in MacVector format.”


[^70]: **INSDC / NCBI**, [Feature Table HTML snapshot](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html), **11.4, April 2026**, directly fetched. Quote: “Version 11.4 April 2026”. No license statement found in the fetched document.
[^71]: **NCBI**, [Website and Data Usage Policies](https://www.ncbi.nlm.nih.gov/home/about/policies/), undated. Quote: “Information that is created by or for the US government on this site is within the public domain.” The following paragraphs reserve third-party rights.
[^72]: **NCBI**, [GenBank release notes](https://ftp.ncbi.nlm.nih.gov/genbank/gbrel.txt), **274.0, October 15, 2026**, directly fetched TXT. Quote: “This document describes the format and content of the flat files”.
[^73]: **EMBL-EBI**, [ENA/EMBL User Manual](https://ftp.ebi.ac.uk/pub/databases/embl/doc/usrman.txt), **143, March 2020**, directly fetched TXT. Quote: “copied and redistributed freely, without advance permission”; condition: reproduce the permission statement with each copy.
[^74]: **NCBI**, [gc.prt](https://ftp.ncbi.nih.gov/entrez/misc/data/gc.prt), **4.6**, undated version header, directly fetched ASN.1 text. Quote: “This is the NCBI genetic code table”.
[^75]: **NC-IUB**, [Nomenclature for Incompletely Specified Bases in Nucleic Acid Sequences](https://iubmb.qmul.ac.uk/misc/naseq.html), **Recommendations 1984**, published 1985. Quote: “Copyright IUBMB; reproduced with the permission of IUBMB”.
[^76]: **IUPAC-IUB JCBN**, [Nomenclature and Symbolism for Amino Acids and Peptides](https://iupac.qmul.ac.uk/AminoAcid/index.html), **Recommendations 1983**, published 1984; web version by G. P. Moss. Quote: “Copyright IUBMB and IUPAC”. Publisher PDF attempt returned HTTP 403.
[^77]: **OBO Foundry**, [Sequence types and features ontology registry](https://obofoundry.org/ontology/so.html), current record. Quote: “CC BY 4.0” (License field). Links authoritative OBO/OWL products and SOFA subsets.
[^78]: **Sequence Ontology**, [so.obo](https://purl.obolibrary.org/obo/so.obo), directly fetched; resolves to [repository OBO](https://raw.githubusercontent.com/The-Sequence-Ontology/SO-Ontologies/master/Ontology_Files/so.obo). Quote: “data-version: 2026-08-07”. Separate header reads `format-version: 1.2`; its `date: 08:07:2026 18:22` differs in presentation and is not substituted for data-version.
[^79]: **Sequence Ontology**, [repository LICENSE](https://raw.githubusercontent.com/The-Sequence-Ontology/SO-Ontologies/master/LICENSE), directly fetched. Quote: “Attribution 4.0 International”. This is the ontology repository, not the separate Specifications repository.
[^80]: **Lincoln Stein / Sequence Ontology**, [GFF3 specification Markdown](https://raw.githubusercontent.com/The-Sequence-Ontology/Specifications/master/gff3.md), **1.26, August 18, 2020**. Quote: “Version: 1.26”. No license statement found in examined specification.
[^81]: **GA4GH Large Scale Genomics / HTS maintainers**, [SAM/BAM and related specifications](https://samtools.github.io/hts-specs/), current index. Quote: “We do not define or endorse any dedicated unaligned sequence data format.” Also read [README source](https://raw.githubusercontent.com/samtools/hts-specs/master/README.md).
[^82]: **Niu, Denisko and Hoffman**, [BEDv1 specification](https://samtools.github.io/hts-specs/BEDv1.pdf), **January 5, 2022**, revision **9ddbc52**. Quote: “This specification formalizes reasonable interpretations of the UCSC Genome Browser BED description.” Also opened [TEX source](https://raw.githubusercontent.com/samtools/hts-specs/master/BEDv1.tex).
[^83]: **SAM/BAM Format Specification Working Group**, [SAMv1 specification](https://samtools.github.io/hts-specs/SAMv1.pdf), **1.6**, **August 12, 2025**, revision **b5341fb**. Quote: “This specification is for version 1.6 of the SAM and BAM formats.” Also opened [TEX source](https://raw.githubusercontent.com/samtools/hts-specs/master/SAMv1.tex).
[^84]: **HTS specification maintainers**, [VCF specification](https://samtools.github.io/hts-specs/VCFv4.5.pdf), **VCF4.5 / BCF2.2**, **February 25, 2026**, revision **e821e4f**. Quote: “VCFv4.5 and BCFv2.2”. Also opened [TEX source](https://raw.githubusercontent.com/samtools/hts-specs/master/VCFv4.5.tex).
[^85]: **SBOL**, [Data Model Specification index](https://sbolstandard.org/datamodel-specification/), current version **3.1.0**, published **October 26, 2022**. Quote: “Content is licensed CC BY-NC-ND 4.0” (website footer, not PDF license).
[^86]: **SBOL editors/authors**, [SBOL 3.1.0 PDF](https://sbolstandard.org/docs/SBOL3.1.0.pdf), **October 26, 2022**, page 1. Quote: “This work is made available under the Creative Commons Attribution 4.0 International Public License.”
[^87]: **NCBI**, [FASTA Format for Nucleotide Sequences](https://www.ncbi.nlm.nih.gov/genbank/fastaformat/), updated **June 18, 2025**. Quote: “Please only use IUPAC symbols within the nucleotide sequence.” Applies to the NCBI submission profile described on the page.
