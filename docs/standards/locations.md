# Feature locations

Governing standard: **INSDC Feature Table Definition 11.4** (April 2026), §3.4 "Location".
GenBank, ENA and DDBJ share it ("This feature table format is shared by GenBank, EMBL and
DDBJ"). Pinned as `insdc-ft` in [`sources.json`](sources.json).

Code references are to `develop` at 13aff79. Fixture cases (J1, O1, …) are in
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

**Dunceious.** Conforms in `extractCodingSequence` (`src/domain/bio/sequence.ts:138`),
including out-of-order trans-spliced joins. The details window shows the whole envelope
instead; see LOC-7.

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

**Dunceious.** Deviates — #225. The structured model reads `order` as `join`
(`src/core/genbank/locationParser.ts:109-111`). The original text survives an unchanged
GenBank export (`featureParser.ts:79`, `serialize.ts:32`); after a geometry or strand edit the
location is rebuilt as `join(...)` (`serialize.ts:40`).

## LOC-3. `complement()`, whole feature or per interval

**Rule.** §3.4.2.2: `complement(location)` — "Find the complement of the presented sequence in
the span specified by location", read 5′→3′ on the complementary strand. Nesting fixes the order
of operations: `complement(join(a,b))` is the reverse complement of `a`+`b`; `join(complement(b),a)`
is `rc(b)` followed by `a`.

**Reference tools.** Biopython 1.88 and EMBOSS 6.6.0 (`-join Y`), Tested: J2 and J3 match the oracle.

**Applications.** Artemis documents EMBL complement syntax
([manual 18.0.0](https://sanger-pathogens.github.io/Artemis/Artemis/artemis-manual.html)); mixed
strands are unknown. Others unknown.

**Dunceious.** Conforms for these cases, verified by calling the parser on J2 and J3
(`locationParser.ts:105-131`). No fixture test in the suite yet.

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

**Dunceious.** Deviates — #226. The numeric model strips the markers
(`locationParser.ts:100-101`). The raw text survives an unchanged GenBank export and GFF3
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

**Dunceious.** Deviates — #230. `parseCoord` reads `10^11` as bases 10–11, length 2
(`locationParser.ts:87-96`).

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
(`locationParser.ts:160-164`). GFF3 export writes the parts as separate in-bounds rows sharing
one ID, not the beyond-end form (`src/core/formats/gff3.ts:161-188`).

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

**Dunceious.** Shows and copies the whole envelope on the forward strand
(`src/app/logic/viewModel.ts:32`). **Owner decision open — #81.**
