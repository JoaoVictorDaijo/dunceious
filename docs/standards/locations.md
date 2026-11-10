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
the CDS track and the details window share, including out-of-order trans-spliced joins. Display and GenBank export share `formatInsdcLocation`; extraction and transposition share
`featureParts`, preserving stored order and splitting explicit circular wraps. See LOC-7.

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

**Dunceious.** Conforms ([#225](https://github.com/JoaoVictorDaijo/dunceious/issues/225)). The
parsed feature keeps its operator (`BioFeature.operator`, set by `parseLocation`), so edits and
selection export keep it, and a rebuilt location is written as `order(...)`. Readers ask
`isJoinedLocation` and `definesOneSequence` (`src/domain/bio/locationFlags.ts`), never the segment
count, so an `order()` feature gets no connectors, frameshift junctions, translation or feature
sequence, and its length reads "N bp in K intervals (not joined)" wherever a length is shown. Its
intervals are drawn as separate bars that highlight together on hover. GFF3 has no operator, so
export writes `insdc_operator=order` on each row and import reads it back. Projects saved before
the field existed get it from their location text on load. Tested against O1 (Biopython 1.88
write-back).

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
(`src/core/genbank/locationParser.ts`). `parseLocation` evaluates `complement()` and `join()` at
any depth, so a nested `join` such as `join(1..5,complement(join(10..20,30..40)))` is read in
full ([#241](https://github.com/JoaoVictorDaijo/dunceious/issues/241); checked against the INSDC
text applied by hand, no reference tool). The whole-feature J2 shape remains in written order
with a parent strand; extraction reverse-complements the joined result once. Other per-strand
shapes are stored in evaluation order with `writtenOrder`, the written position of each interval,
and GenBank export rebuilds the nested written form from it. GFF3 rows cannot tell
`join(complement(a),complement(b))` from `complement(join(a,b))`, so export marks per-interval
strands with `insdc_interval_strands=true` and import reads each row on its own strand. Parser, extraction,
view-model and details-window copy tests check the nested results against the INSDC oracle.
Display and export share `formatInsdcLocation`. Without retained text, display uses equivalent
per-part complements in evaluation order; GenBank export rebuilds the nested written form when
re-parsing it recovers the stored intervals and strands.

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

**Dunceious.** Conforms ([#226](https://github.com/JoaoVictorDaijo/dunceious/issues/226)). Each
interval end keeps its marker (`FeatureSegment.partialStart` for `<`, `partialEnd` for `>`), so
edits and selection export keep it and GenBank export writes it back. An edit keeps both markers,
including on the end whose number changed; adding or removing one waits for the feature editor's
toggles (#231, #246). A selection marks the kept interval facing anything it drops, a cut part or a
whole interval. 5′/3′ partiality is read from the flags in evaluation order
(`isFivePrimePartialLocation`, `isThreePrimePartialLocation`), and the details window names it.
GFF3 carries the markers per row as `insdc_partial_start`/`insdc_partial_end`. Projects saved
before the flags existed get them from their location text on load. Tested against P1 and the 13
`table2asn` 1.29.324 cases pinned by #278.

## LOC-5. Between-base sites

**Rule.** §3.4.2.1: "A site between two adjoining nucleotides, such as endonucleolytic cleavage
site, is indicated by listing the two points separated by a carat (^). The permitted formats
for this descriptor are n^n+1 (for example 55^56), or, for circular molecules, n^1, where "n"
is the full length of the molecule". A site has zero length. Any other `n^m` is invalid.

**Reference tools.** Biopython 1.88, Tested: `10^11` parses as zero length and is written back.
EMBOSS 6.6.0, Tested: `seqret` round-trips it; `extractfeat` skips it as zero length.

**Applications.** Unknown.

**Dunceious.** Conforms ([#230](https://github.com/JoaoVictorDaijo/dunceious/issues/230)) for a
site that is the whole location, its `complement()`, or a local part inside a compound location.
`parseLocation` reads `n^n+1`, and `n^1` at the end of a circular record, as the empty interval at
boundary n (`start === end`). Whole-site features carry `BioFeature.betweenBases` and readers ask
`isBetweenBasesSite`; a site inside a compound remains a zero-length segment. The site has length 0, no feature
sequence, and is drawn as a rule on the boundary with a caret under it. GenBank export writes it
back as `n^n+1` or `n^1`; GFF3 writes the zero-length form (start = end = n) with
`insdc_site=true`, so import can tell it from a one-base feature. A selection keeps a site only when
both bases it lies between are selected. Import validation (#298) refuses a site whose bases do not
adjoin or lie outside the record. Local site parts inside `join`/`order` export and re-import as zero-length intervals.
Linear-edge sites are skipped and counted in `featuresWithoutInsdcLocation.linearEdgeSite`.
A site used as a span end remains unsupported and is refused on import. Tested against S1 (Biopython 1.88: `[10:10]`,
written back as `10^11`).

## LOC-6. Features crossing the origin

**Rule.** INSDC writes a feature crossing the origin of a circular molecule as a join of its
terminal and initial intervals, e.g. `join(115..120,1..5)`. GFF3 1.26 writes it as one row
whose end is the wrapped end plus the landmark length, with `Is_circular=true` on the landmark.

**Reference tools.** Biopython 1.88 and EMBOSS 6.6.0 (`-join Y`), Tested: W1 matches the oracle.

**Applications.** Benchling wraps annotations across the origin; CLC Genomics Workbench imports
GFF3 rows beyond the end only for circular references
([GFF3 format, 25.0.3](https://resources.qiagenbioinformatics.com/manuals/clcgenomicsworkbench/2503/index.php?manual=GFF3_format.html)).

**Dunceious.** Partial. Extraction is correct (W1). Display and export share
`formatInsdcLocation`, including explicit wrapped segments. Invalid geometry has no INSDC
form: the editor blocks Save, project import keeps it, and GenBank export skips it with a
warning. Invalid geometry yields no derived feature or region sequence and no translation
lanes; stored translation remains visible with an explicit unchecked-data label. A partly stranded project feature is refused; the editor requires a strand on every
piece once any piece has one. A wrap is inferred only when the first
interval starts after the last ends **and** one interval starts at base 1
(`src/core/genbank/locationParser.ts`). The parser and `featureEnvelope` apply that heuristic
in written order, including when a nested outer complement reverses sequence evaluation order.
`featureEnvelope` reads that order from `writtenOrder` (LOC-3), so an edit that clears the text no
longer infers a false wrap; GFF3 carries it as `insdc_written_order`. GFF3 export writes
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
track uses before `/codon_start`. `order()` is read from the feature's operator (LOC-2) and
partial ends from its per-end flags (LOC-4). A location with intervals in other entries has no
feature sequence; only its region in this record is shown (LOC-8). Tested against the oracle for J1–J5, W1, W2, O1 and P1
(`src/app/logic/__tests__/featureSequenceViews.test.ts`). For nested outer complements the
caption names both steps, inner complements first and then the outer one. The interval-sum
and region lengths have distinct labels, the presentation requirement tracked by
[#227](https://github.com/JoaoVictorDaijo/dunceious/issues/227).

## LOC-8. Intervals in other entries

**Rule.** §3.4.2.1(e): "A location in a remote entry (not the entry to which the feature table
belongs) can be specified by giving the accession-number and sequence version of the remote entry,
followed by a colon ":", followed by a location descriptor which applies to that entry's
sequence". §3.4.3: `join(1..100,J00194.1:100..202)` "Joins region 1..100 of the existing entry with
the region 100..202 of remote entry J00194". §3.4.2 allows bounds beyond the presented sequence only
for a remote entry.

**Reference tools.** Biopython 1.88, Documented (not run here): `SimpleLocation.ref` holds the
accession, and `extract()` needs the referenced record passed in `references`.

**Applications.** Unknown.

**Dunceious.** Conforms ([#245](https://github.com/JoaoVictorDaijo/dunceious/issues/245)).
`parseLocation` keeps each remote interval as a `RemotePart` (accession, that entry's coordinates,
strand, partial ends and its place among the stored intervals); `segments` holds only this
record's intervals. Dunceious doesn't load other records, so a feature with remote parts has no
feature sequence, translation or early-stop flag (`extractFeatureSequence`, `definesOneSequence`).
The viewer draws its local parts, and the tooltip, details window and length name the rest ("100 bp
in this record, plus 1 interval in J00194.1"). Import logs one warning per file naming those
features, also in the browser console. GenBank export writes the parts back; GFF3, which has no
remote reference, carries them as `insdc_remote` and its export report counts them, leaving out a
feature with no interval in this record. Import validation refuses a remote interval that starts
before base 1 or runs backwards (§3.4.2 lifts only the local length limit), and refuses a
between-base site in another record (`AB123.1:2^3`) as unsupported (`guardRemoteSite`).

## GenBank import enforcement

`src/core/genbank/locationValidation.ts` refuses unreadable or partially parsed locations,
out-of-range local coordinates, mixed join/order syntax, non-adjoining between-base sites,
and reversed fuzzy markers. Nested joins and nested complements are evaluated recursively.
Legal but unsupported one-of positions and span-end sites are refused separately.
`order()` (LOC-2), between-base sites (LOC-5), including compound site parts, and remote
locations (LOC-8) are read. Selection export keeps each compound site only when both
neighbouring bases are selected; otherwise the selection-loss notice names its omission.
Remote intervals are not
local segments, so they are never tested against local sequence bounds. Existing saved project handling is unchanged.
