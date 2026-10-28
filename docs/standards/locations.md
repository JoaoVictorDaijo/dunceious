# Feature locations

Governing standard: **INSDC Feature Table Definition 11.4** (April 2026), §3.4 "Location".
GenBank, ENA and DDBJ share it ("This feature table format is shared by GenBank, EMBL and
DDBJ"). Pinned as `insdc-ft` in [`sources.json`](sources.json).

Code references are to `develop` at f5a6ad2. Fixture cases (J1, O1, …) are in
[`conformance/`](conformance/README.md).

## LOC-1. `join()` concatenates in written order

**Rule.** §3.4.2.2: `join(location,location, ... location)` — "The indicated elements should be
joined (placed end-to-end) to form one contiguous sequence." The elements are joined in the
order written, which need not be ascending (§3.4.3 examples).

**Reference tools.** Biopython 1.88, Tested: J1 and W1 match the oracle. EMBOSS 6.6.0
`extractfeat`, Tested: matches with `-join Y`; by default it writes each interval separately.

**Applications** (Documented, scope only as stated): Geneious Prime can concatenate an
annotation's intervals into one sequence ([Annotations](https://manual.geneious.com/en/latest/Annotations.html));
Benchling translation groups skip introns
([help, 2025-09-30](https://help.benchling.com/hc/en-us/articles/39768268305805-How-to-characterize-sequences-with-annotations-and-translations)).
Neither documents literal `join` parsing or arbitrary interval order.

**Dunceious.** Conforms in `extractFeatureSequence` (`src/domain/bio/sequence.ts:150`), which
the CDS track and the details window share, including out-of-order trans-spliced joins. See
LOC-7.

## LOC-2. `order()` is not `join()`

**Rule.** §3.4.2.2: `order(location, location, ... location)` — "The elements can be found in
the specified order (5' to 3' direction), but nothing is implied about the reasonableness about
joining them." An `order()` location must be kept as `order()`, never rewritten as `join()`,
and must not be presented as one contiguous sequence.

**Reference tools.** Biopython 1.88, Tested: keeps `operator="order"` and writes `order(...)`
back; `SeqFeature.extract()` still concatenates the parts (O1 → `TGTGGC`). EMBOSS 6.6.0,
Tested: `seqret` writes `order(...)` back; `extractfeat -join Y` concatenates. Joining an
`order()` feature on explicit request is therefore a tool choice, not a standard behaviour;
if Dunceious ever offers it, it must be labelled as such.

**Applications.** Unknown for every application surveyed ([Tools](tools.md)).

**Dunceious.** Deviates — [#225](https://github.com/JoaoVictorDaijo/dunceious/issues/225). The structured model reads `order` as `join`
(`src/core/genbank/locationParser.ts:108`). The details window reads `order(` from the raw
location text instead and never joins it (LOC-7); an edited feature has lost that text. The original text survives an unchanged
GenBank export (`featureParser.ts:79`, `serialize.ts:32`); after a geometry or strand edit the
location is rebuilt as `join(...)` (`serialize.ts:40`).

## LOC-3. `complement()`, whole feature or per interval

**Rule.** §3.4.2.2: `complement(location)` — "Find the complement of the presented sequence in
the span specified by location", read 5′→3′ on the complementary strand. Nesting fixes the order
of operations: `complement(join(a,b))` is the reverse complement of `a`+`b`; `join(complement(b),a)`
is `rc(b)` followed by `a`.

**Reference tools.** Biopython 1.88 and EMBOSS 6.6.0 (`-join Y`), Tested: J2 and J3 match the oracle.
For nested outer complements J4, J5 and W2, Biopython rejects the locations and EMBOSS returns
sequences differing from the oracle; see the conformance results. The INSDC text governs.

**Applications.** Artemis documents EMBL complement syntax
([manual 18.0.0](https://sanger-pathogens.github.io/Artemis/Artemis/artemis-manual.html)); mixed
strands are unknown. Others unknown.

**Dunceious.** Conforms for whole-feature, per-interval and nested outer complements
([#239](https://github.com/JoaoVictorDaijo/dunceious/issues/239)). A nested
outer complement reverses the evaluated interval order and flips each interval's strand
(`src/core/genbank/locationParser.ts`). The whole-feature J2 shape remains in written order
with a parent strand; extraction reverse-complements the joined result once. Parser, extraction,
view-model and details-window copy tests check the nested results against the INSDC oracle.

## LOC-4. Uncertain bounds

**Rule.** §3.4.2.1: "The '<' and '>' symbols may be used with the starting and ending base
numbers to indicate that an end point is beyond the specified base number." §3.4.3: `<345..500` "Indicates
that the exact lower boundary point of a feature is unknown." The markers belong to each end
and must survive import, editing of the other end, and export. A feature cut by a selection
gains a marker on the cut end.

**Reference tools.** Biopython 1.88, Tested: kept as `BeforePosition`/`AfterPosition` and
round-tripped. EMBOSS 6.6.0, Tested: round-tripped by `seqret`.

**Applications.** MacVector documents GenBank "starts before"/"ends after" notation
([release history](https://macvector.com/getting-started/macvector-major-release-details-and-history/));
Artemis accepts fuzzy syntax. The full import-edit-export lifecycle is unknown everywhere.

**Dunceious.** Deviates — [#226](https://github.com/JoaoVictorDaijo/dunceious/issues/226). The numeric model strips the markers
(`locationParser.ts:102`); the details window flags a partial feature from the raw text
(LOC-7). The raw text survives an unchanged GenBank export and GFF3
partial attributes, but is lost after a geometry or strand edit (`FeatureEditorModal.tsx:78,167`)
or a selection export (`useFileHandlers.ts:360`).

## LOC-5. Between-base sites

**Rule.** §3.4.2.1: "A site between two adjoining nucleotides, such as endonucleolytic cleavage
site, is indicated by listing the two points separated by a carat (^). The permitted formats
for this descriptor are n^n+1 (for example 55^56), or, for circular molecules, n^1, where "n"
is the full length of the molecule". A site has zero length. Any other `n^m` is invalid.

**Reference tools.** Biopython 1.88, Tested: `10^11` parses as zero length and is written back.
EMBOSS 6.6.0, Tested: `seqret` round-trips it; `extractfeat` skips it as zero length.

**Applications.** Unknown.

**Dunceious.** Deviates — [#230](https://github.com/JoaoVictorDaijo/dunceious/issues/230). `parseCoord` reads `10^11` as bases 10–11, length 2
(`locationParser.ts:90`).

## LOC-6. Features crossing the origin

**Rule.** INSDC writes a feature crossing the origin of a circular molecule as a join of its
terminal and initial intervals, e.g. `join(115..120,1..5)`. GFF3 1.26 writes it as one row
whose end is the wrapped end plus the landmark length, with `Is_circular=true` on the landmark.

**Reference tools.** Biopython 1.88 and EMBOSS 6.6.0 (`-join Y`), Tested: W1 matches the oracle.

**Applications.** Benchling wraps annotations across the origin; CLC Genomics Workbench imports
GFF3 rows beyond the end only for circular references
([GFF3 format, 25.0.3](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=GFF3_format.html)).

**Dunceious.** Partial. Extraction is correct (W1). A wrap is inferred only when the first
interval starts after the last ends **and** one interval starts at base 1
(`src/core/genbank/locationParser.ts`). The parser and `featureEnvelope` apply that heuristic
in written order, including when a nested outer complement reverses sequence evaluation order.
`featureEnvelope` recovers that order from retained `locationString`; if editing discards the
text while retaining evaluation-order segments, it can infer a false wrap (#241). GFF3 export writes
the parts as separate in-bounds rows sharing one ID, not the beyond-end form (`src/core/formats/gff3.ts:161-188`).

## LOC-7. The sequence of a multi-interval feature

**Rule.** The standard defines what a location means (LOC-1 to LOC-4); it does not say what a
viewer's "copy sequence" must return. The sequence a location defines is its evaluation under
`join`/`complement`. What that sequence represents depends on the feature key: the coding
sequence for a CDS, the transcript for an mRNA. It is never a "spliced product" for every type,
and it does not exist for `order()` (LOC-2).

**Reference tools.** Biopython 1.88 `extract()`, Tested: joins and orients by strand. EMBOSS
6.6.0 `extractfeat`, Tested: separate intervals by default, joined with `-join Y`.

**Applications** (Documented, differing): Ensembl REST returns genomic sequence by default and
offers spliced cDNA and CDS ([sequence/id](https://rest.ensembl.org/documentation/info/sequence_id));
the UCSC Table Browser concatenates CDS exons with a per-exon option
([help](https://www.genome.ucsc.edu/goldenPath/help/hgTablesHelp.html)); SnapGene extracts a
span between two selected features including the sequence between them
([help, 2026-09-11](https://support.snapgene.com/hc/en-us/articles/10384297596180-Extract-a-Region-in-a-Sequence-to-a-New-File)).

**Consensus** (adoption-ranked survey, 2026-10-23, [Tools](tools.md#feature-extraction-what-the-tools-do)):
of 9 command-line tools and libraries that document extraction, 7 offer the joined sequence,
6 the region spanned and 7 strand-aware (reverse-complemented) output; of the 9 paper-ranked interactive
applications, 5 document the joined sequence and 3 the region, and none documents its
reverse-strand behaviour (only the unranked Clone Manager documents a feature-orientation option). The documented practice is therefore to offer the joined, oriented
sequence and the region as distinct outputs.

**Decision** (owner, 2026-10-23, #81). The details window offers both outputs and opens on the
first, the default the standard defines:

- **Feature sequence**: the location evaluated under `join`/`complement` (LOC-1, LOC-3), read
  5′→3′ on the feature's strand; mixed-strand joins orient each interval on its own. For
  protein records, the intervals' residues joined, with no strand.
- **Region spanned**: record bases over the feature's envelope, forward strand, 5′→3′, gaps
  between intervals included; an origin-crossing feature reads across the origin (LOC-6).
- Both lengths are shown and named: "N bp feature sequence · sum of K location intervals" and
  "M bp region spanned · start..end". The copy button and the badge name the view they measure.
- `order()` (LOC-2): no feature sequence; only the region, and the length reads "N bp in K
  intervals (not joined)".
- `<`/`>` (LOC-4): a "Partial" tag next to the length, and the caption says the sequence is
  incomplete.
- Wording uses INSDC terms only: location intervals, feature sequence, region spanned. A
  caption names what the feature sequence is only where the key defines it (CDS: the coding
  sequence; mRNA: the transcript sequence).

**Dunceious.** The sequences conform for supported location forms under the decision in
[#81](https://github.com/JoaoVictorDaijo/dunceious/issues/81), including LOC-3’s nested
outer complements. `featureSequenceViews` (`src/app/logic/viewModel.ts:82`) builds both views from `extractFeatureSequence` (`src/domain/bio/sequence.ts:150`), the extraction the CDS
track uses before `/codon_start`. Until #225 and #226 are fixed, `order()` and partial ends are
read from the raw location text (`src/domain/bio/locationFlags.ts`), which an edited feature no
longer has. Tested against the oracle for J1–J5, W1, W2, O1 and P1
(`src/app/logic/__tests__/featureSequenceViews.test.ts`). For nested outer complements the
caption names both steps, inner complements first and then the outer one. The interval-sum
and region lengths have distinct labels, the presentation requirement tracked by
[#227](https://github.com/JoaoVictorDaijo/dunceious/issues/227).
