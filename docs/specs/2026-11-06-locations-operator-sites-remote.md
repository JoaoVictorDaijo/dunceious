---
title: "Feature locations: order(), between-base sites, partial ends, nested complements and remote parts"
status: proposed
date: 2026-11-06
areas: ["locations", "genbank", "gff3", "viewer", "annotations", "translation", "project"]
prs: []
issues: [225, 226, 230, 241, 245, 255]
superseded_by: null
summary: "A parsed location keeps its INSDC operator, zero-length n^n+1 sites, per-end partial markers, the written order of nested complements and remote accession parts as fields of the feature, so no edit, export or reader can turn order() into join(), a site into two bases, a partial feature into a complete one, a nested feature into a false origin crossing, or another record's coordinates into local residues."
---
# Feature locations: `order()`, between-base sites, partial ends, nested complements and remote parts — design

## Why

The location parser keeps numeric segments plus the raw INSDC text. Five location facts survive
only in that text. Every geometry or strand edit clears the text, and so does a selection export
([`FeatureEditorModal.tsx:79`](https://github.com/JoaoVictorDaijo/dunceious/blob/a9e97df27fe2a22880cc83aaa57670adf19a3766/src/app/components/FeatureEditorModal.tsx#L79),
`:168`;
[`useFileHandlers.ts:361`](https://github.com/JoaoVictorDaijo/dunceious/blob/a9e97df27fe2a22880cc83aaa57670adf19a3766/src/app/hooks/useFileHandlers.ts#L361)).
Every reader that uses the segments is then wrong. The code was read at `develop` `a9e97df`.

| Issue | Form | What goes wrong |
|---|---|---|
| [#225](https://github.com/JoaoVictorDaijo/dunceious/issues/225) | `order(...)` | Read like `join` ([`locationParser.ts:109`](https://github.com/JoaoVictorDaijo/dunceious/blob/a9e97df27fe2a22880cc83aaa57670adf19a3766/src/core/genbank/locationParser.ts#L109)): connectors, a summed length, translation of an `order()` CDS, false frameshift badges, and `join(...)` on export after an edit |
| [#226](https://github.com/JoaoVictorDaijo/dunceious/issues/226) | `<` / `>` | Stripped by `loc.replace(/[<>\s]/g, '')` ([`locationParser.ts:103`](https://github.com/JoaoVictorDaijo/dunceious/blob/a9e97df27fe2a22880cc83aaa57670adf19a3766/src/core/genbank/locationParser.ts#L103)) and re-read from the text by four readers (below). After an edit or selection export a partial feature reads, translates and exports as complete; a selection cut adds no marker |
| [#241](https://github.com/JoaoVictorDaijo/dunceious/issues/241) | `complement(join(complement(a),b))` | The parser stores a nested outer complement's intervals in evaluation order (#239), and `writtenOrderSegments` ([`featureEnvelope.ts:28`](https://github.com/JoaoVictorDaijo/dunceious/blob/a9e97df27fe2a22880cc83aaa57670adf19a3766/src/domain/bio/featureEnvelope.ts#L28)) recovers the written order from the text. After an edit, three readers get the reversed order: the envelope shows a false origin crossing, the −1 junction of `complement(join(complement(1..6),6..12))` disappears, and the connectors pair the wrong intervals (comment of 2026-11-03) |
| [#230](https://github.com/JoaoVictorDaijo/dunceious/issues/230) | `n^n+1` | `10^11` read as bases 10–11 ([`locationParser.ts:91`](https://github.com/JoaoVictorDaijo/dunceious/blob/a9e97df27fe2a22880cc83aaa57670adf19a3766/src/core/genbank/locationParser.ts#L91)): 2 bp long, drawn as a bar, exported as `10..11` after an edit |
| [#245](https://github.com/JoaoVictorDaijo/dunceious/issues/245) | `J00194.1:100..202` | The accession is dropped by the same matcher, so the other entry's coordinates become local bases; extraction returns unrelated local residues |

They share one root cause and touch the same parser, serializer, GFF3 and viewer lines, so they
are designed and shipped together (see [Delivery](#delivery)).

**The four readers of `<`/`>` from text:**
- `isPartialLocation`, behind the details window's Partial tag and `recordStatus`
  ([`recordStatus.ts:33`](https://github.com/JoaoVictorDaijo/dunceious/blob/a9e97df27fe2a22880cc83aaa57670adf19a3766/src/domain/bio/recordStatus.ts#L33));
- `isThreePrimePartialLocation`, which decides the terminal stop since #278
  ([`sequence.ts:287`](https://github.com/JoaoVictorDaijo/dunceious/blob/a9e97df27fe2a22880cc83aaa57670adf19a3766/src/domain/bio/sequence.ts#L287));
- the comparison view
  ([`featureComparison.ts:76`](https://github.com/JoaoVictorDaijo/dunceious/blob/a9e97df27fe2a22880cc83aaa57670adf19a3766/src/app/logic/featureComparison.ts#L76));
- GFF3's `partialParts`
  ([`gff3.ts:77`](https://github.com/JoaoVictorDaijo/dunceious/blob/a9e97df27fe2a22880cc83aaa57670adf19a3766/src/core/formats/gff3.ts#L77)),
  whose number regex also matches the digits of a remote accession.

The #226 comment of 2026-11-03 pins the translation symptom. `4..>12` over `AAAATGCCCTGA`, sliced
by `sliceRecordsBySelection(…, 3, 12)`, translates as `MP_` instead of `MPW` under code 27.

**Found while designing this.** Each item was probed with `tsx` on the production functions or
traced in the code.

1. **False frameshift badges on a shipped example.** `segmentFrameshifts`
   ([`frameshift.ts:66`](https://github.com/JoaoVictorDaijo/dunceious/blob/a9e97df27fe2a22880cc83aaa57670adf19a3766/src/domain/bio/frameshift.ts#L66))
   runs on every multi-interval feature. In
   `examples/peptide/sars-cov-2-orf1ab-polyprotein-YP_009724389.gb`, the 31 `Site order(...)`
   features have 96 junctions with a gap of 1–2 residues. Each one gets a "Ribosomal frameshift"
   badge on a protein record.
2. **Selection export drops every site.** `clipAndRebaseInterval`
   ([`intervals.ts:46`](https://github.com/JoaoVictorDaijo/dunceious/blob/a9e97df27fe2a22880cc83aaa57670adf19a3766/src/domain/bio/intervals.ts#L46))
   returns `null` for any zero-width result. Once #230 makes sites zero-length, they would vanish
   from every selection export.
3. **The focus label always says "bp"**
   ([`Row.tsx:494`](https://github.com/JoaoVictorDaijo/dunceious/blob/a9e97df27fe2a22880cc83aaa57670adf19a3766/src/app/viewer/Row.tsx#L494)),
   so on a protein record it calls residues base pairs. It is the one place that prints a
   feature's length without its record's unit.
4. **Saved projects hold the forms only in their text.** An old project's `order()` feature turns
   into `join()` on its first edit. An old `10^11` was saved with the two-base geometry, so it
   stays two bases wide.
5. **GFF3 cannot tell a site from a one-base feature.** GFF3 1.26 writes a zero-length feature as
   "start equals end", which is also how a one-base feature is written.
6. **Silent truncation.** `join(1..5,order(8..9,12..13))`, illegal under §3.4.2.2, keeps
   `1..5,8..9` and makes up a `+2` frameshift. `join(1..5,complement(join(10..20,30..40)))` loses
   `30..40`. The first is an invalid shape that #298 refuses. The second is valid INSDC, since
   §3.4.2.2 forbids only mixing `join` with `order`, so this package parses it in full (agreed
   with the Murilo-review session, 2026-11-06; #298 adds no guard for it).

## Requirements (collaborator, 2026-11-06)

Murilo, on #230:

> To ensure INSDC compliance, we propose updating the location parser, renderer, and serializer
> to properly handle zero-length site operators (^), rendering them as boundary markers between
> adjacent bases with 0 bp length rather than multi-base intervals.

Murilo, on #226:

> To prevent losing critical biological context, we must stop ignoring INSDC partiality markers (<
> and >) during import. Instead, we update the location parser and core data model to explicitly
> capture these symbols as structured flags (partialStart and partialEnd), ensuring that partial
> boundaries are reliably preserved across feature edits, selection clipping, and final
> serialization rather than being lost when raw location strings are cleared

Murilo, on #241:

> To prevent editing operations from corrupting complex nested-complement features, we must
> eliminate our reliance on volatile raw location strings (`locationString`) to recover written
> interval order. Instead, we propose updating the core data model to explicitly store the original
> written interval sequence or orientation flags. This ensures that geometric and strand edits
> preserve the true spanned region rather than triggering false origin-crossing wraps, unifying this
> fix with our broader structural approach to robust, non-lossy feature state management.

Owner, 2026-11-06, in the Murilo-review session (answering #299 item 8, then applied by that
session to every invalid location shape and confirmed for this package by the owner here):

> If this is not a valid INSDC shape we shouldn't allow it.

Murilo, on #245:

> To fix OBS-04, update the location parser to capture remote accession prefixes instead of
> discarding them, add a strict validation check during sequence extraction to refuse extracting
> local bases for remote coordinates, and emit a visible warning message to both the console and
> the user interface to ensure complete scientific transparency and compliance with INSDC
> standards.

## Standards

INSDC Feature Table 11.4, pinned as `insdc-ft` (`.cache/standards/insdc-ft-11.4.html`):

- **§3.4.2.2, operators:**
  - `join`: "The indicated elements should be joined (placed end-to-end) to form one contiguous
    sequence".
  - `order`: "The elements can be found in the specified order (5' to 3' direction), but nothing
    is implied about the reasonableness about joining them".
  - "combinations of "join" and "order" within the same location (nested operators) are illegal."
- **§3.4.2.1, sites:** "The permitted formats for this descriptor are n^n+1 (for example 55^56),
  or, for circular molecules, n^1, where "n" is the full length of the molecule".
- **§3.4.2.1, partial ends:** "The '<' and '>' symbols may be used with the starting and ending
  base numbers to indicate that an end point is beyond the specified base number." §3.4.3:
  `<345..500` "Indicates that the exact lower boundary point of a feature is unknown." The markers
  attach to the written base numbers, the lower and higher end of each interval, on either strand.
- **§3.4.2.1(e), remote entries:** "the accession-number and sequence version of the remote entry,
  followed by a colon ":", followed by a location descriptor which applies to that entry's
  sequence".
- **§3.4.2, bounds:** "Base locations beyond the range of the presented sequence may not be used in
  location descriptors, the only exception being location in a remote entry".
- **§3.4.2.1(c):** `102.110` is "a single base chosen from within a specified range of bases (not
  allowed for new entries)".
- **`/ribosomal_slippage`:** "a join operator ... should be used in the CDS spans to indicate the
  location of ribosomal_slippage". A frameshift junction therefore exists only inside `join`.

Other sources:

- **GFF3 1.26:**
  - "For zero-length features, such as insertion sites, start equals end and the implied site is
    to the right of the indicated base".
  - "All lines that share an ID must collectively represent a single feature."
  - GFF3 has no operator and no remote reference.
- **Rules** in `docs/standards/locations.md`:
  - LOC-2: `order()` is kept and never presented as one sequence.
  - LOC-4: the markers belong to each end, survive import, an edit of the other end and export,
    and "A feature cut by a selection gains a marker on the cut end."
  - LOC-5: a site has zero length, and any other `n^m` is invalid.
  - TRANS-1 (since #278): only the 3′ end decides the terminal stop, read from the interval
    translated last.
  - LOC-7, the owner decision on #81: an `order()` feature has no feature sequence, and its length
    reads "N bp in K intervals (not joined)".
- **Reference tools:**
  - Conformance case O1, Tested 2026-10-23: Biopython 1.88 keeps `operator="order"` and writes it
    back. EMBOSS 6.6.0 `seqret` round-trips it. Both concatenate only on explicit request.
  - Conformance case S1, Tested: Biopython 1.88 reads `10^11` as `[10:10]` and writes `10^11` back.
    EMBOSS `seqret` round-trips it, and `extractfeat` skips it as zero length.
  - Conformance case P1, Tested: Biopython 1.88 keeps `<5..>25` as `BeforePosition`/`AfterPosition`
    and round-trips it; EMBOSS 6.6.0 `seqret` round-trips it.
  - The 13 NCBI `table2asn` 1.29.324 cases pinned by #278
    (`src/domain/bio/__tests__/fixtures/ncbi-validator-terminal-stop.json`) fix which marker makes
    the 3′ end partial on each strand and inside joins.
  - Remote parts, Documented only (Biopython 1.88 docs, not run here): `SimpleLocation.ref` holds
    the accession, and `extract()` needs the referenced record passed in `references`; without it,
    it refuses. **Not verified by a run**: Biopython isn't installed in this environment.

## Decisions on the first draft

Owner, 2026-11-06, approving the recommendations of the first draft:

1. **`order()` intervals are drawn as separate bars with no connector lines.** Hovering any one of
   them highlights them all, and the tooltip says "order(): K intervals, not joined".
2. **GFF3 carries the operator** as an `insdc_operator=order` attribute on each row, in the style of
   the existing `insdc_partial_start`/`insdc_partial_end`, and import reads it back.
3. **The editor only preserves the operator.** The `join`/`order` choice belongs to the
   feature-editor package (#231, #246).
4. **An `order()` feature crossing the origin** uses the same written-order envelope rule as
   `join` (LOC-6).

## Decisions on the second draft

Owner, 2026-11-06: "ok to all", approving each recommendation below. Where a decision is Dunceious's own choice rather than a standard's, it says so.

5. **How a site is drawn.** A 1.5 px rule on the boundary between the two bases, with
   a small caret under it, as `^` writes it, and the name beside it. The rule has a 10 px
   invisible hit area, so it is as easy to click as a short bar. *Basis:* Dunceious's own
   choice; no standard or tool sets how a site is drawn.
6. **How GFF3 carries a site.** The GFF3 zero-length form (start = end = n), plus
   `insdc_site=true` so that import can tell it from a one-base feature. A row without the
   attribute stays a one-base feature. *Basis:* the zero-length form is GFF3 1.26; the attribute
   is Dunceious's own, like its `insdc_partial_*` attributes.
7. **Remote parts in the viewer and the details window** (question 4 of the #225 package comment).
   - draw only the local parts;
   - tooltip and details window: "1 of 2 intervals is in J00194.1, not in this record";
   - no feature sequence, no translation, no early-stop flag;
   - length: "N bp in this record, plus 1 interval in J00194.1".

   *Basis:* no local sequence follows INSDC §3.4.2.1(e), and Biopython 1.88 documents the same
   refusal (not run here). The wording and drawing are Dunceious's own.
8. **Remote parts in GFF3.** GFF3 has no remote reference. Write the local rows only,
   with an `insdc_remote` attribute carrying the remote parts as INSDC text
   (e.g. `J00194.1:100..202`), and read it back. The export report also counts the feature.
   *Basis:* the attribute is Dunceious's own, filling a GFF3 1.26 gap.
9. **Where Murilo's "console" warning goes.**
   - one line per import in the activity log, the app's console, naming the features with remote
     parts and their accessions;
   - the same text in the browser console through the logger.

   Remote locations are valid INSDC, so they load with this warning. Invalid shapes never load
   (see [Invalid shapes](#invalid-shapes-refused-by-298)). *Basis:* Dunceious's own choice,
   applying Murilo's request to the app's existing log.
10. **Where partial markers are stored** (question 2 of the #225 package comment). Per interval end, as INSDC writes them, named as Murilo proposes: `partialStart` for `<`
    before an interval's lower base, `partialEnd` for `>` after its higher base. The details
    window and the comparison view show them as 5′/3′ partial, from the strand and evaluation
    order, as `isThreePrimePartialLocation` already reads them. *Basis:* INSDC §3.4.2.1 attaches
    the markers to base numbers; Biopython 1.88 keeps them per position (P1, Tested); the 5′/3′
    reading follows the 13 `table2asn` cases of #278.
11. **A `<`/`>` on an interior interval end**, such as `join(1..>10,20..30)` (also question 2).
    INSDC's syntax allows it, and the `table2asn` cases of #278 treat it as leaving the 3′ end
    complete. Keep it and write it back, with no warning. *Basis:* keeping it follows INSDC and
    `table2asn`; not warning is Dunceious's own choice, as the pinned cases record only stops.
12. **What an edit does to a marker.** An edit keeps both markers, including on the
    end whose number changed. The marker says the true end lies beyond the base, and moving the
    base does not settle that. Adding or removing a marker waits for the editor's toggles
    (#231, #246). *Basis:* Dunceious's own choice; no surveyed tool documents it.
13. **A selection that drops whole intervals without cutting one** (question 3), e.g. only `21..30`
    left of `join(1..10,21..30)`. Mark the end that faced a dropped interval as
    partial, as if it had been cut. The feature now continues beyond it. *Basis:* Dunceious's own
    extension of LOC-4, which covers only a cut end.
14. **How the written order is kept** (#241; Murilo offers "the original written interval sequence
    or orientation flags"). The segments stay in evaluation order either way, so extraction keeps
    the code checked against the oracle for J4, J5 and W2 in #240.
    - **Chosen: `writtenOrder`, the permutation from evaluation order to written order**,
      stored only when the two differ. `writtenOrderSegments` applies it instead of testing the
      text. It covers every nesting depth, including a nested `join` inside `complement()` one
      level down (`join(1..5,complement(join(10..20,30..40)))`, which must now be parsed in
      full). After an edit, the serializer writes the evaluated form, each interval with its own
      `complement()`, e.g. `join(1..5,complement(30..40),complement(10..20))`. That is the same
      sequence under §3.4.2.2, but not the same text. An unedited feature still exports its
      original text.
    - Rejected: an orientation flag, `outerComplement: true`, for an outer `complement()` around
      a list with an inner `complement()`. It restores the exact written text for that one form,
      but it cannot describe a nested `complement(join(...))` inside a list, so `writtenOrder` would
      still be needed for that.
    - Rejected: store the segments in written order and derive the evaluation order. It
      changes extraction and every evaluation-order reader (the 3′ partial end, translation) to
      fix readers that only need the written order.

    *Basis:* Dunceious's own engineering choice between the two models Murilo offers; no tool
    settles it, as Biopython 1.88 rejects these nested forms. Unchanged extraction rests on the
    #240 oracle cases.

    **Refined while building it (2026-11-06):** after an edit the serializer writes the nested
    written form back, rebuilt from `writtenOrder`, not the evaluated form. The evaluated form of J4,
    `join(complement(5..6),1..2)`, has its first interval above its last and touches base 1, so the
    origin-crossing rule (LOC-6) would read it as a crossing on re-import, which is #241 itself. The
    rebuilt text is re-parsed and used only when it gives the stored segments back; otherwise the
    evaluated form is written.
15. **How GFF3 carries the written order.** GFF3 rows have no nesting, so a nested feature's rows come back
    in evaluation order, and the false crossing of #241 reappears after a GFF3 round trip. Probed
    with `tsx`: `complement(join(complement(1..3),10..12))` on a circular 20 bp record has the
    envelope `{0, 12}`; exported to GFF3 and read back, it has `{9, 3}`. An `insdc_written_order` attribute holding the permutation (e.g.
    `insdc_written_order=1,0`), on each of the feature's rows, like decisions 2, 6 and 8. *Basis:*
    the attribute is Dunceious's own, filling a GFF3 1.26 gap.

## Invalid shapes, refused by #298

Owner, 2026-11-06: a GenBank location that is not a valid INSDC shape is refused, not kept as
written. The GenBank import validation spec (PR #298) refuses the whole file and names each
problem, so the parser in this package only ever sees valid shapes. This settles the open half
of #245's clarity triage for malformed and obsolete text. These forms are left to #298 and are not
designed here:

- `102.110`, the obsolete single base from a range (§3.4.2.1(c)); #298 keeps its `n.m` guard;
- text the parser cannot read at all (`nonsense` today becomes `[0,0)`);
- local bounds beyond the record (`1..999` on a 4-base record, §3.4.2);
- mixed `join`/`order`, illegal under §3.4.2.2;
- an `n^m` whose bases do not adjoin, or a site outside the record (§3.4.2.1);
- a `>` on a start number or a `<` on an end number.

**Valid but not supported here: a `^` site inside a compound location or as a span end.**
§3.4.2.1 allows both ("The starting and ending base positions can be represented as distinct base
numbers ('34..456') or a site between two indicated adjoining bases"), and a join element may be
any location descriptor. #298 refuses them as unsupported behind `guardSiteInCompound`, not as
malformed. This package supports only a site as the whole location (or its `complement()`), so
that guard stays. A later change that supports these forms removes it in the same PR.

**#298's guards that this PR removes**, each in its issue's commit, with #298's spec note updated
so files using the style load again:

- `order()`, in the #225 commit;
- `n^n+1`, including `length^1` on a circular record, in the #230 commit;
- remote `ACC.V:n..m`, in the #245 commit.

**Valid nested shapes stay here.** `join(1..5,complement(join(10..20,30..40)))` nests a `join`
inside a `complement()` inside a `join`; §3.4.2.2 forbids only mixing `join` with `order`. It is
valid, so this package parses it in full and #298 does not guard it (agreed with the
Murilo-review session, 2026-11-06).

## The clear part

1. **The model keeps the five facts** as fields of the feature:
   - `operator: 'join' | 'order'` for a multi-interval location, set inside or outside an outer
     `complement()`;
   - `betweenBases: true` for an `n^n+1` site, held as `start === end` at the boundary after
     base n;
   - `partialStart`/`partialEnd` on each interval end that carries `<`/`>` (decision 10);
   - `writtenOrder` when the written order of the intervals differs from their evaluation order
     (decision 14);
   - `remoteParts` for intervals in another entry (see [Model](#model)).

   `segments` holds only local intervals, so no reader can take another record's coordinates for
   local ones by mistake.
2. **Sites are read against the record.** `n^1` is a site only on a circular record of length n,
   and `n^n+1` needs both bases inside the record. #298 refuses a site that fails, so the parser
   sees only valid sites; it reads the record length and topology to place `length^1`.
3. **The parser assumes a valid shape.** Invalid shapes are #298's to refuse
   ([above](#invalid-shapes-refused-by-298)), so this package adds no "kept as written" path and
   no location-issue flag.
4. **Export writes the forms back.** The GenBank serializer writes `order(...)`, `n^n+1` (or
   `length^1` at a circular origin) and `ACC.V:a..b` from the fields when the text is gone. GFF3
   follows decisions 2, 6 and 8.
5. **Partial readers use the flags.** The four readers above, including the 3′ terminal-stop rule
   of #278, read `partialStart`/`partialEnd` instead of the text. A selection that cuts an
   interval sets the flag on the cut end (LOC-4): `partialStart` on a cut lower end, `partialEnd`
   on a cut higher end, whatever the strand.
6. **Edits and selection export keep the forms.**
   - The fields live on the feature, so clearing `locationString` no longer loses them.
   - A site whose edit gives it a width becomes an ordinary span: a site needs `start === end`.
   - A selection keeps a site only when both of its neighbouring bases are selected.
   - The editor shows read-only notes for a site, an `order()` feature and remote parts.
7. **No joining for `order()`, none for a feature with remote parts.** Each reader asks one helper
   instead of counting segments:
   - no connectors and no frameshift junctions for `order()`;
   - no CDS/ORF translation and no early-stop flag when the location defines no single local
     sequence;
   - the LOC-7 length wording wherever a length is shown, not only in the details window;
   - the details window's query-layer message names multi-interval annotations, not "joined".
8. **Extraction refuses remote parts** (Murilo, #245). `extractFeatureSequence` returns no
   feature sequence and a reason. Every caller shows the reason instead of residues.
9. **The written order comes from the model** (#241). `writtenOrderSegments`, and through it the
   envelope, frameshift junctions, connectors and the origin-crossing test, reads `writtenOrder`
   instead of the text. An edit can no longer reverse their order.
10. **Nested locations are parsed in full.** `parseLocation` evaluates `complement()` and `join()`
   recursively at any depth (§3.4.2.2), instead of reading one level and taking the first
   coordinate pair of anything deeper. Each interval gets its strand and its place in evaluation
   order.
11. **Old projects are read from their text on load.** A feature with no `operator`, site flag,
   partial flags, `writtenOrder` or remote parts gets them from its `locationString`. A site is
   re-read as zero-length only when it fits its record. Text that is not a valid shape leaves the
   feature as saved; #299 shows its location as invalid.

## Model

```ts
// src/domain/bio/types.ts
export type LocationOperator = 'join' | 'order';

export interface FeatureSegment {
  start: number;
  end: number;
  strand?: 1 | -1;
  /** `<` before the lower base: the interval begins somewhere before `start` (§3.4.2.1). */
  partialStart?: true;
  /** `>` after the higher base: the interval ends somewhere after `end`. */
  partialEnd?: true;
}

/** An interval in another INSDC entry (§3.4.2.1(e)); coordinates are that entry's, 0-based half-open. */
export interface RemotePart {
  accession: string;      // accession.version, as written
  start: number;
  end: number;
  strand: 1 | -1;
  partialStart?: true;
  partialEnd?: true;
  /** Position among all the location's intervals as written, so export restores the order. */
  index: number;
}

export interface BioFeature {
  // …existing fields
  operator?: LocationOperator;
  betweenBases?: true;
  remoteParts?: RemotePart[];
  /** Written position of each segment, when it differs from the evaluation order of `segments`. */
  writtenOrder?: number[];
}

// src/domain/bio/locationFlags.ts: the one place readers ask
isOrderLocation(feature)      // operator, falling back to the text for old features
isJoinedLocation(feature)     // more than one local segment, not order, no remote parts
definesOneSequence(feature)   // one local interval, or a join, and no remote parts
isBetweenBasesSite(feature)   // betweenBases and start === end
isPartialLocation(feature)    // any interval end flagged
fivePrimePartial(feature), threePrimePartial(feature)  // from strand and evaluation order
```

**Why `remoteParts` is a separate list and not a flag on a segment:** 30 source files read
`segments` as local intervals (`git grep '\.segments\b'` at `a9e97df`, tests excluded): drawing,
lane packing, length, envelope, extraction, GFF3, selection clipping, search and the greeter. A flag on a segment needs every one of them changed, and any reader that is
missed reads the other entry's coordinates as local ones, which is #245 itself. A separate list
fails safe: a reader that is missed simply ignores the remote part.

## Validation

The oracles are the INSDC text applied by hand (`docs/standards/conformance/oracle.py`) and the
pinned Biopython 1.88 results for O1 and S1, never the code's own output.

| Guarantee | Boundary | Oracle |
|---|---|---|
| Operator parsed | `locationParser.test.ts` | `order(1..3,11..13)` and `complement(order(...))` give `order`; `join(...)` gives `join`; one interval gives none (O1) |
| Site parsed | `locationParser.test.ts` | `10^11` gives `[10,10)` (S1); `complement(123^124)` is reverse; `30^1` on a circular 30 bp record is the site at boundary 30 |
| #298 guards removed | #298's import validation tests | Files with `order(...)`, `10^11`, `30^1` (circular 30 bp) and `J00194.1:100..202` load; `10^12`, `20^1` on 30 bp, `30^1` on a linear record and `5.7` are still refused with #298's messages |
| Partial flags parsed | `locationParser.test.ts` | `<5..>25` (P1) gives `partialStart` and `partialEnd` on its one interval; `join(<1..6,complement(10..>12))` flags exactly those two ends |
| 3′ end from flags | `sequence.test.ts` | The 13 pinned `table2asn` cases give the same stops with `locationString` removed |
| Edit keeps markers | `serialize.test.ts`, editor test | SCU49845 TCP1-beta `<1..206` with its end edited to 180 exports `<1..180` (decision 12) |
| Selection marks the cut | `selectionExport.test.ts` | `4..>12` sliced to `[3,12)` keeps `>` and still reads `MPW` (the #226 repro); `1..20` sliced to `[5,15)` gives `<..>`; decision 13 for a dropped interval |
| GFF3 partial attributes | `gff3.test.ts` | Per-row `insdc_partial_start/end` come from the flags, and a remote accession's digits never match |
| Written order without text | `featureEnvelope.test.ts`, `frameshift.test.ts`, `Row.test.tsx` | With `locationString` removed: `complement(join(complement(1..3),10..12))` keeps the envelope `{0, 12}`, not `{9, 3}`; `complement(join(complement(1..6),6..12))` keeps its −1 junction; connectors pair the written neighbours (the #241 repros). The test that pins the false wrap is replaced |
| Nested join parsed | `locationParser.test.ts`, `sequence.test.ts` | `join(1..5,complement(join(10..20,30..40)))` gives three intervals, `1..5` forward then `30..40` and `10..20` reverse; the feature sequence is bases 1–5 followed by the reverse complement of bases 10–20 joined to 30–40, applied by hand from §3.4.2.2 (no reference tool checked: Biopython 1.88 rejects the related J4/J5 forms) |
| Nested form rebuilt | `serialize.test.ts`, `gff3.test.ts` | Text cleared, J4 `complement(join(complement(1..2),5..6))` writes an evaluated form that extracts the J4 oracle sequence `GTTG`; its GFF3 round trip keeps `writtenOrder` and the envelope |
| Remote part parsed | `locationParser.test.ts` | `join(1..100,J00194.1:100..202)`: one local segment, one remote part `J00194.1` `[99,202)` at index 1 (§3.4.3 example) |
| Extraction refuses remote | `sequence.test.ts` | Issue fixture `ACGT` with `J00194.1:2..3` gives no sequence, never `CG` |
| GenBank rebuild | `serialize.test.ts` | Text cleared: `order(1..3,11..13)`, `10^11`, `complement(10^11)`, `30^1` on circular 30 bp, `join(1..100,J00194.1:100..202)`; a site edited to a width writes the span |
| GFF3 round trip | `gff3.test.ts` | A site gives one row `10 10` with `insdc_site=true`; `order()` gives `insdc_operator=order` per row; a remote part gives `insdc_remote`; each reads back. A `10 10` row without the attribute stays one base |
| No frameshift on `order()` | `frameshift.test.ts` | `order(148..152,154..161,173..175)` gives none; the same intervals under `join` give `+1` |
| Viewer marks | `Row.test.tsx` | `order()`: 3 bars, no connectors, no badge, group class; the same under `join` connects; a site is a boundary mark at x = 10 × zoom with no bar |
| No translation | `cds.test.ts` | An `order()` CDS and a CDS with a remote part are neither translated nor flagged |
| Length wording | `viewModel.test.ts` | `order(32,35,37,108)` on a protein reads "4 aa in 4 intervals (not joined)"; a site reads "0 bp (between-base site)"; the remote wording follows decision 7 |
| Selection export | `selectionExport.test.ts` | `order()` keeps its operator; `10^11` stays in `[5,20)` and is dropped from `[10,20)` and `[0,10)` |
| Old projects | `projectFile.test.ts` | `order(...)` text loads as `order`; a two-base `10^11` loads as `[10,10)`; `30^1` on a linear record stays as saved; invalid field values are refused |
| Remote warning | `bioResponse.test.ts` | One line per file naming the features with remote parts and their accessions; none when there are no remote parts |

## Delivery

**One PR into `integration/murilo-review`** (owner, 2026-11-06), where it ships together with
#298, #299 and #291. **One commit per issue, in this order:** #225, #230, #226, #241, then #245.
- #226 adds flags to the segments that #225 and #230 settle.
- #241's `writtenOrder` decides the written order that #245's `RemotePart.index` refers to.
- #245's remote parts carry the partial flags too.
- #291 (PR 1 of #253) waits for #226's partial state, and #299's merge waits for #230.

**Merge order in `integration/murilo-review`:** after #298, which follows #296. This PR removes
#298's `order()`, site and remote guards, so it must land on top of them; merged first, #298 would
add them back. Once #298 is in the integration branch, this branch is brought up to date with it
before the guards are removed and #298's spec note is updated.

**The PR is named for the whole package and closes every issue:**

- Title: `fix(locations): keep order(), sites, partial ends, nested complements and remote parts through edits [CF-Pages-Skip]`
- Body: `Closes #225`, `Closes #226`, `Closes #230`, `Closes #241`, `Closes #245`, one per line, so
  GitHub closes all five on merge. #255 is referenced, not closed.

- All five change the same `LocationData`/`BioFeature` fields, `parseLocation`,
  `featureLocation`, GFF3 export and import, and the same Row and length readers. Separate PRs
  would conflict on almost every hunk.
- The per-issue commits keep each review readable, and any one of them can be reverted alone.
- With #241 the PR covers the whole location package named in the #225 comment: #225, #226,
  #230, #241 and #245.

## Living documents

- **LOC-2, LOC-4, LOC-5:** "Deviates" becomes "Conforms", citing the helpers and the GFF3 attributes.
- **LOC-7:** remove "until #225 … is fixed" for `order()`, and add the remote-part wording.
- **A new LOC rule for remote parts**, quoting §3.4.2.1(e), with Biopython's documented behaviour.
- **`locationFlags.ts`:** drop the `FIXME(#225, #226)`, as the flags replace the text reads.
- **TRANS-1:** the 3′ end is read from the flags, so it survives edits and selection export.
- **LOC-3, LOC-6:** the written order of a nested location comes from `writtenOrder`, not the
  text; LOC-3 also covers nested joins at any depth. Drop the #241 caveat from LOC-6.

## Not in this change

- **#255**: frameshift junctions inside `join`, the missed descending spelling, and whether to say
  "ribosomal" without `/ribosomal_slippage`. **Note for #255:** INSDC's own example
  `join(486..1784,1787..4810)` shows a `+2` badge; it moves the reading frame the same way as −1.
- **Resolving remote parts** against a loaded record or a fetch. The clarity triage on #245 leaves
  this to the owner, and fetching would send data out of the browser.
- **Toggles for adding or removing a marker**, which belong to the feature-editor package
  (#231, #246).
- **A "join anyway" action for `order()`.** LOC-2 allows it only as a labelled tool choice, and
  nobody has asked for one.

## Rejected alternatives

- **Keep reading the forms from `locationString`.** Edits and selection export clear that text,
  which is the bug.
- **Remote intervals as flagged entries in `segments`.** It fails open; see [Model](#model).
- **Store partiality only as 5′/3′ on the feature**, as NCBI's submission tools ask. It loses an
  interior marker, and on a mixed-strand join it cannot say which written end the marker was on,
  so export could not write the location back.
- **Treat a site as a one-base feature with a flag.** Its length, extraction and GFF3 row would all
  claim a base it does not cover.
- **Read every `start = end` GFF3 row as a site.** One-base features are written the same way and
  are far more common.

## Left to the builder

- Exact tooltip and warning wording, within the meanings above.
- Whether `operator` is kept on a location read from a one-element `join(...)`/`order(...)`.
  Recommended: keep it, so export writes back what was read.
