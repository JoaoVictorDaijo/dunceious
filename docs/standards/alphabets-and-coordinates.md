# Alphabets and coordinates

Code references are to `develop` at f5a6ad2.

## COORD-1. Positions shown to users

**Rule.** INSDC Feature Table 11.4, §3.4.1: "Base numbers refer to the numbering in the entry.
This numbering designates the first base (5' end) of the presented sequence as base 1." A
span `n..m` includes both ends. File formats differ: GFF3 and SAM are 1-based; BED is 0-based
half-open (GA4GH BED v1). These are file conventions; the standards do not prescribe a user
interface. Every interface that documents its convention (below) shows 1-based, inclusive
positions, though most surveyed applications do not document it (see [Tools](tools.md)).
Dunceious follows the INSDC numbering in its interface and converts only at file and API
boundaries.

**Reference tools.** Biopython 1.88 (Documented) uses 0-based half-open locations and
separates residue indices from alignment columns ([Bio.Align](https://biopython.org/docs/1.88/api/Bio.Align.html)).
Use [OP-4](operations.md#op-4-residues-alignment-columns-and-boundaries) for alignment correspondence;
a file convention alone does not establish that correspondence.

**Applications.** Documented: SnapGene numbering starts at 1; NCBI ORFfinder "The
range includes the residue at the To coordinate"
([ORFfinder](https://www.ncbi.nlm.nih.gov/orffinder/)); Ensembl APIs "use inclusive coordinates
which start at 1" ([Perl API](https://grch37-mart.ensembl.org/info/docs/api/general_instructions.html));
the UCSC Browser shows 1-based positions while documenting BED as 0-based
([formats FAQ](https://genome.ucsc.edu/FAQ/FAQformat.html)). Biopython's API is 0-based
half-open by design; it is a library, not an interface.

**Dunceious.** Deviates — [#231](https://github.com/JoaoVictorDaijo/dunceious/issues/231).
The details window shows the 1-based location
(`src/app/components/RecordDetailsModal.tsx:207`). The feature editor shows the internal
0-based start and exclusive end under "Start (bp)" / "End (bp)"
(`src/app/components/FeatureEditorModal.tsx:219, 232, 263, 274`): a feature at `1..10` shows Start 0.
Other viewer selection-space discrepancies are tracked in
[#248](https://github.com/JoaoVictorDaijo/dunceious/issues/248); [OP-4](operations.md#op-4-residues-alignment-columns-and-boundaries)
separates alignment-column conversion from the numbering convention.

## ALPHA-1. Nucleotide ambiguity codes, T and U

**Rule.** NC-IUB, *Nomenclature for incompletely specified bases in nucleic acid sequences*,
Recommendations 1984 (Cornish-Bowden, Nucleic Acids Res. 13:3021-3030, 1985): the symbols
A C G T R Y M K S W B D H V N. "T and U may, in general, be considered as being synonyms, though
care should be taken to avoid ambiguity in circumstances where it is likely." INSDC 11.4 §7.4.1
uses this list and writes `t` for "thymine in DNA; uracil in RNA" in flat files.

**Reference tools.** Biopython 1.88 (Documented): reverse complement of DNA treats U as T.

**Applications** (Documented): SnapGene, CLC Genomics Workbench, ApE and Artemis document
IUPAC ambiguity handling, each for different operations (see [Tools](tools.md)). Accepting a
symbol, matching it in search and complementing it are separate behaviours.

**Dunceious.** Conforms for query degeneracy (`src/core/search/query.ts`) and the U-aware
complement (`src/domain/bio/sequence.ts:43`). The code does not yet cite NC-IUB; cite `ALPHA-1`.

## ALPHA-2. Amino-acid codes

**Rule.** INSDC 11.4 §7.4.3 (authority IUPAC-IUB JCBN, Eur. J. Biochem. 138:9-37, 1984, and the
1999 JCBN newsletter) lists the 20 standard residues plus Pyl/O, Sec/U, Asx/B (Asp or Asn),
Glx/Z (Glu or Gln), Xaa/X (any) and Xle/J (Leu or Ile).

**Applications** (Documented): CLC Genomics Workbench lists all six extra symbols
([IUPAC amino acids, 25.0.3](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=IUPAC_codes_amino_acids.html)).
The UCSC Table Browser writes stops as `Z` in CDS alignment output
([help](https://www.genome.ucsc.edu/goldenPath/help/hgTablesHelp.html)), which conflicts with
reading `Z` as Glx; treat such output as tool-specific.

**Dunceious.** Accepts all six in protein preflight (`src/core/alignment/preflight.ts:60`).
Search expands B, Z, J and X (`src/core/search/query.ts:27`). Local scoring uses EMBOSS
EBLOSUM62, which has no U, O or J, and rejects them (`src/core/search/local/scoring.ts:65`);
that rejection must stay visible to the user.

Symbol meanings do not select a search equality model or a substitution matrix. See
[OP-12](operations.md#op-12-whole-query-approximate-occurrences),
[ALN-1](alignment.md#aln-1-local-alignment-scoring-defaults) and the unresolved reference-comparison
policy in [METRIC-6c](metrics.md#metric-6c-reference-comparison-policy).
