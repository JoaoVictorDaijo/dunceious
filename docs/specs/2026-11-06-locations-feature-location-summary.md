---
title: "Feature location summaries: one INSDC formatter for display and export"
status: partial
date: 2026-11-06
areas: ["locations", "record-feature-presentation", "genbank"]
prs: [299]
issues: [259]
superseded_by: null
summary: "Every place that shows a feature's location without its original location text shows the same INSDC location string that GenBank export writes (joins, complements, origin crossings and between-base sites) from one shared formatter, never a continuous start..end envelope."
---
# Feature location summaries — design

Part 2 of [#259](https://github.com/JoaoVictorDaijo/dunceious/issues/259).
- **Part 1** (record residue and column lengths, units, Accession and Identifier) is
  [PR #297](https://github.com/JoaoVictorDaijo/dunceious/pull/297), on branch
  `fix/record-length-units`. This design does not touch it.
- **The protein count**, #259's fourth point, is defined and delivered by #253's design on
  [PR #291](https://github.com/JoaoVictorDaijo/dunceious/pull/291). See "Protein count" below.

## Why

When a feature has no `locationString`, five places show a continuous envelope,
`start+1..end`. That happens for features added or edited in the app, features from GFF3 or BED,
and features after a selection export. The places are:

| Place | Code (`develop` `a9e97df`) |
|---|---|
| Details window, Locus | `src/app/components/RecordDetailsModal.tsx:208` (via `locationLabel`, :55-63) |
| Hub row | `src/app/components/hub/AnnotationRow.tsx:59`, shown at :84 |
| Hub hover card | `src/app/components/hub/TrackTooltip.tsx:47` |
| Genome strip, screen-reader status | `src/app/components/hub/GenomeStrip.tsx:196` |
| Viewer feature tooltip | `src/app/viewer/Row.tsx:324`, mapping only the aligned envelope back with `getOriginalPos` |

So a joined feature with parts `[0,3)` and `[6,9)` reads `1..9`, although its bases are 1–3 and
7–9. A feature crossing the origin, stored as `start > end` (e.g. `[8,2)` on a 10-base circular
record), reads `9..2`. That is not a valid location, and it does not say the feature wraps.

GenBank export already writes these correctly. The private `featureLocation` in
`src/core/genbank/serialize.ts:32-43` builds:
- `join(...)` from the segments;
- `complement(...)` for a reverse feature, or per part when strands are mixed;
- the two parts of an origin crossing stored as `start > end`, through `splitWrapAround`. An
  explicit wrapped segment is the exception: it is written as an invalid `9..2` (see Model,
  rule 3).

Display and export therefore disagree for the same feature.

## Requirement (collaborator, 2026-11-05)

Murilo, on #259: "Multipart or circular features must display their actual discontinuous spans
rather than a misleading continuous envelope."

## Standards

The rules are in `docs/standards/locations.md`, from INSDC Feature Table 11.4 §3.4.
- **LOC-1:** `join()` joins its parts in the order written.
- **LOC-3:** `complement()` covers a whole feature or one part. `complement(join(a,b))` reads the
  same bases as `join(complement(b),complement(a))`.
- **LOC-4:** `<` and `>` mark a partial end.
- **LOC-5:** a between-base site is written `n^n+1`, or `n^1` at a circular molecule's origin.
- **LOC-6:** a feature crossing the origin is written as a join of its terminal and initial
  parts, e.g. `join(115..120,1..5)`.

## Decisions

- **Display shows the location string export writes.** Where `locationString` exists, it is
  shown exactly as today. Otherwise every place above shows the formatter's output. That covers:
  - joins in their stored order;
  - complements, so a reverse feature reads `complement(10..40)` even though a separate strand
    field exists too;
  - origin crossings as a join;
  - between-base sites.

  Using the export string means display can never claim a different location from the file the
  user saves. #227's length labels and #81's choice of which sequence the box shows stay as they
  are: this changes only the location text.
- **One formatter, in the domain layer,** shared by GenBank export and every display.
  `src/domain/bio` is the only layer both `src/core` and `src/app` may import
  (`.claude/skills/dunceious-architecture/references/import-rules.md`).
- **The formatter writes `join` for every multi-part feature.** `order()` is lost on parse
  today; [#225](https://github.com/JoaoVictorDaijo/dunceious/issues/225) owns keeping it. When
  #225 adds the operator to the model, the formatter writes it, and nothing else here changes.
- **Partial ends** come from
  [#226](https://github.com/JoaoVictorDaijo/dunceious/issues/226)'s structured state. Until #226
  lands, the formatter has nothing to read, so a feature without `locationString` shows no
  markers. That is the same as export today, and the formatter still never invents one.
- **Between-base sites** use the same rules as today's `locationLabel`:
  - an interior site is `n^n+1`;
  - a circular record's origin is `L^1`;
  - a linear record's edges are named in words ("before base 1", "after base L"), because INSDC
    has no syntax for them.

  Parsing `^` correctly is
  [#230](https://github.com/JoaoVictorDaijo/dunceious/issues/230), owned by another session.
  This design formats zero-length parts that already exist, from GFF3, the editor or #230 once
  it lands, and does not change parsing.

## Goals

- No display shows `start+1..end` for a feature with more than one part, or for one crossing
  the origin.
- Display and export produce the same string for the same feature. The one exception is a
  between-base site at a linear record's edge: INSDC has no syntax for it, so display names it in
  words and export skips that feature and reports it (see Export).
- The viewer tooltip formats the biological feature: every part mapped from aligned columns back
  to biological coordinates, not only the envelope.

## Non-goals

- Parsing changes (`order()`: #225; partial markers: #226; `^` sites: #230).
- Lengths and their labels (#227, PR #297) and the sequence-box choice (#81).
- The protein count's definition (#253).

## Anti-goals

- A display location that differs from the exported location for the same feature.
- A partial marker, complement or wrap that the feature's stored state doesn't support.
- A location truncated without the full text being available on the same element.

## Model

```ts
/** src/domain/bio/insdcLocation.ts (new). */

/** Partial ends in biological terms. Supplied by #226; absent means none known. */
export interface LocationEnds { fivePrimePartial?: boolean; threePrimePartial?: boolean }

export type InsdcLocation =
  | { kind: 'insdc'; text: string }
  | { kind: 'no-insdc-form'; display: string; reason: 'linear-edge-site' | 'invalid-geometry' };

/**
 * INSDC location for a feature, from its stored geometry. Never reads `locationString`;
 * callers decide whether that wins (display and export both prefer it).
 */
export function formatInsdcLocation(
  feature: Pick<BioFeature, 'start' | 'end' | 'strand' | 'segments'>,
  record: { length: number; isCircular?: boolean },
  ends?: LocationEnds,
): InsdcLocation;
```

**Rules, in order:**
1. **Parts.** One domain helper, `featureParts(feature, record)`, yields the parts with their
   effective strands, wrapped parts split as in rule 3. **Extraction (`extractFeatureSequence`,
   `extractCodingSequence`, `sequence.ts:150-200`) uses the same helper.** Today it reads
   explicit segments as given, and visits no bases for a wrapped `[8,2)`. So the formatted
   location and the feature's sequence always agree. Parts come from `feature.segments` when it
   has at least one element. Otherwise (absent or `[]`, which
   project import accepts at `projectFile.ts:75`) the feature's own `start`/`end`. Parts keep
   their stored order (LOC-1).
   - **Strand of each part.** If no part has a strand, every part takes the feature's strand
     (the uniform shape, `types.ts:22-35`). Otherwise every part must carry its own strand.
   - **A partly stranded feature is refused** (owner decision, 2026-11-06). In INSDC Feature
     Table 11.4 §3.4.2.2, every interval is either read as presented or complemented. No
     location gives an interval an unknown strand, while opposite-strand parts such as
     `join(complement(69611..69724),139856..140087)` are valid. The GenBank parser, GFF3 import
     and search annotations never produce the partly stranded shape. Only two places can:
     - **Project load** (`projectFile.ts:75-81, 89-105`, which checks each optional strand on
       its own) refuses the file, naming the feature: "Feature X has a strand on some of its
       pieces but not others." This matches the refusal of other damaged project files
       (#286).
     - **The editor** (`FeatureEditorModal.tsx:249-250, 267-286`, where a new piece is added
       without a strand) shows a strand choice on every piece once any piece has one. It keeps
       Save disabled (`useFeatureManager.ts:219-222`) until every piece has one, so the user
       picks each strand.
   - The formatter, extraction and selection export can then rely on the shape. If one
     still arrives, the formatter returns `invalid-geometry`, never a guessed strand.
   - Stored wrapped segments are left as they are: `featureParts` splits them for every
     consumer.
   - GFF3's `.` (unstranded) and `?` (unknown) strand rows are mapped to `+1` today, and
     per-row symbols can be lost when parts merge (`gff3.ts:295-299, 363-379`). Keeping them is
     separate work, outside this spec.
2. **Invalid geometry first.** A part (or the envelope when there are no parts) is invalid
   when:
   - a coordinate is not an integer, or is negative;
   - a coordinate is beyond the record length;
   - it is descending (`start > end`) on a linear record;
   - it is `[length, 0)` on a circular record, a "wrap" that covers no base, for which
     `splitWrapAround` returns no pieces (`intervals.ts:73`).

   Project import accepts any finite numbers (`projectFile.ts:55`), and the segment editor allows
   inverted or out-of-range parts (`FeatureEditorModal.tsx:262`). An invalid part makes the
   whole result `no-insdc-form` with reason `invalid-geometry`, whose display text is the raw
   numbers plus "invalid location", e.g. `9..2 (invalid location)`. No circular wrap or clipped
   range is ever invented.
   - Export skips the feature and reports it, like an edge site.
   - The editor shows the error on the part and disables Save until it is fixed.
   - Project import keeps the feature unchanged. Its data is not discarded, and its hub row
     carries the same "invalid location" text.
3. **Wrapped parts.** A part with `start > end`, which crosses the origin of a circular record,
   is split with `splitWrapAround` into `[start, length)` and `[0, end)`. This applies whether it
   came from the envelope or from `segments` (the segment editor and project import can produce
   one, and today's serializer writes it as an invalid `9..2`).
   - The pieces stay in that order for a part whose effective strand is forward, and for any part
     under a whole-feature `complement()`.
   - For a part whose effective strand is reverse in per-part mode, the pieces are swapped. Its
     bases read `rc([0,end)) + rc([start,length))`, so it becomes
     `complement(1..end),complement(start+1..length)`.
4. **Each part:**
   - `start < end`: `start+1..end`, as the serializer writes today (a one-base part stays `n..n`);
   - `start = end` inside the record: a between-base site, `start^start+1`;
   - `start = end = length` on a circular record, or `start = end = 0` on a circular record:
     `length^1` (LOC-5);
   - `start = end = 0` or `= length` on a linear record: there is no INSDC form, so the whole
     result is `no-insdc-form`. Its display text names the site in words ("before base 1" or
     "after base L"), inside the same join and complement as any other parts.
5. **Strand.**
   - If any part carries its own strand (the parser's per-part shape for inner or mixed
     complements), each reverse part is wrapped in `complement()`.
   - Otherwise a reverse feature wraps the whole location once: `complement(join(...))` or
     `complement(a..b)`.

   This is today's serializer logic (`serialize.ts:35-42`). For a nested outer complement, which
   the parser stores in evaluation order with flipped part strands (LOC-3), the output is the
   per-part form. For example, J4 `complement(join(complement(1..2),5..6))` is stored as
   `[(5..6, −), (1..2, +)]` and formats as `join(complement(5..6),1..2)`. That reads the same
   bases as the original but not the same text, and is used only when `locationString` is gone,
   as today.
6. **More than one part** gives `join(...)` (see the `order()` decision).
7. **Partial ends** (when `ends` is given) go on the biological ends, found in evaluation order
   (LOC-3), not by coordinate:
   - Build the oriented parts in evaluation order:
     - with per-part strands, the stored order (the parser stores evaluation order);
     - under a whole-feature reverse strand, the stored order reversed, each part reverse;
     - otherwise, the stored order, each part forward.
   - 5′ goes on the first oriented part: `<` on its start if forward, `>` on its end if reverse.
   - 3′ goes on the last oriented part: `>` on its end if forward, `<` on its start if reverse.
   - The symbols sit on the numbers, inside any `complement()` (INSDC §3.4.2.1). For example,
     `complement(join(9..10,1..2))` with a 5′ partial is `complement(join(9..10,1..>2))`.

   #226 decides the stored state. This step only places it.

**Export.** `exportToGenBank` (`serialize.ts:74`) writes `feature.locationString` when present,
otherwise the formatter's `text`.
- **#230 has landed.** Its parser reads between-base sites as zero-length intervals. Export
  writes interior sites as `n^n+1` and circular-origin sites as `L^1`, including site parts
  inside joins. Tests check the full export-then-import round trip. Linear-edge sites remain
  skipped and reported because INSDC has no form for them.
- **A `no-insdc-form` result is not written.** The feature is skipped, and the export report
  counts it in a new `ExportReport` field, `featuresWithoutInsdcLocation: { linearEdgeSite:
  number; invalidGeometry: number }` (`src/core/exportReport.ts:24`). Today such a feature would
  be written as an invalid location such as `1..0`.
- **The skip is shown as a warning line,** not an ordinary note.
  - The GenBank export dialog drops the summary's first line (`ExportDialog.tsx:170`), and
    `describeExport` puts ordinary notes there (`exportPlan.ts:88-100`). So `describeExport`
    adds one warning line per reason, the way it adds `missingOrganismWarning`:
    - "1 feature not written: a site at a linear sequence's edge has no GenBank location";
    - "2 features not written: their location is invalid (outside the sequence or reversed)".
  - The dialog's annotation count pill counts written non-`source` annotations directly
    (today it counts selected ones, `ExportDialog.tsx:133`), so it can never go negative. When
    some were skipped, its title says how many.
- **What changes in export output:**
  - Every existing fixture (`serialize.test.ts`), and every shape already exported correctly,
    stays byte-identical.
  - Three shapes change from invalid to valid: interior sites (today `11..10`, now `10^11`),
    circular origin sites (today `121..120`, now `120^1`), and wrapped explicit segments (today
    `9..2`, now a join).

**Display.** One app helper, `displayLocation(feature, record)`, returns `feature.locationString`
when present, otherwise the formatter's `text` or, for `no-insdc-form`, its `display` words. It
is used by all five places in the table.
- `RecordDetailsModal`'s `locationLabel` stays for the "region spanned" caption, which is an
  envelope by design (#227). It and the formatter share the site rules through one small helper,
  `siteLabel`.
- **Long joins:**
  - the hub row keeps `truncate` and already carries the full text in `data-tip`;
  - the hover card keeps `break-all`, and the details window's Locus gains it
    (`RecordDetailsModal.tsx:205-208` has none today, so a long join would overflow);
  - the screen-reader status reads the full text.

**Viewer tooltip.** It formats the source geometry, not a reconstruction.
- Transposition drops zero-length parts (`coordinate.ts:172`), so a site inside a join can't be
  recovered from aligned columns.
- **Aligned parts keep evaluation order and keep sites.** `processTransposition` maps the
  parts that `featureParts` yields, already split and ordered by rule 3, instead of splitting
  each stored segment itself (`coordinate.ts:169-174`).
  - Zero-length parts are kept as zero-length aligned parts, at the boundary that
    `createCoordinateLookup` already defines for empty intervals (`coordinate.ts:48-71`).
    Today they're dropped (`coordinate.ts:172`).
  - So a feature whose parts are all sites never becomes `segments: []` with a non-empty
    envelope, which extraction would then read as bases.
  - Today `Row.tsx`'s part renderer gives every visible part at least 1 px of width and
    pointer handlers (`Row.tsx:338`, fed by the segment loop at `:470`). Kept zero-length parts
    would therefore appear as stray 1 px glyphs. So the renderer skips zero-width parts, in
    aligned and unaligned rows alike. The rest of the feature still draws and stays clickable.
    Drawing a site marker is #230's. So a reverse per-part wrap stays `[0,end)` then
  `[start,length)` in the aligned copy. The translation track (`SequenceTrack.tsx:330`) and CDS
  lanes (`cds.ts:123`), which read the aligned copy, then translate the same bases as the source.
- **`biological` is derived display state, never stored.** `processTransposition` sets it on
  every feature of every record:
  - an aligned record gets a copy of the feature's own `start`, `end`, `strand` and `segments`;
  - an unaligned record's features are already biological, so any incoming `biological` field
    is removed and nothing replaces it.

  Project import drops a `biological` field on load (`projectFile.ts:75` accepts unknown
  properties today), and project export never writes one. An imported value can therefore never
  disagree with the real geometry.
- **The tooltip's text.** It shows `feature.locationString` when the feature has one. That text
  is the same on the aligned copy, so retained `order()` and partial markers show exactly.
  Otherwise it formats `feature.biological ?? feature`.
- The existing `biologicalFeature` mapping (`Row.tsx:310-317`) stays for `frameshiftSummary`,
  which needs aligned-derived parts.

## Protein count (#259, fourth point)

- #253's design (PR #291, decision 11) defines it: translation positions without the terminal
  stop, from the DNA. It reads "aa" only when there is no internal stop, and otherwise, for
  example, "3 positions, 1 internal stop".
- PR #291 already changes the only place that shows a protein count, the hub hover card
  (`TrackTooltip.tsx:46`). No other count is displayed today:
  - the details window shows the stored protein text with no count;
  - `AnnotationRow.tsx:85` shows the feature length.
- **This design adds no count and redefines nothing.** If PR #291 has not merged when this is
  implemented, the hover-card count line is left as it is for #291 to change. This PR touches
  only the location line of `TrackTooltip.tsx`, so the two don't conflict.
- #259 closes when this PR, PR #291 and part 1 (PR #297) have all merged.

## Validation

Expected strings are hand-written INSDC text from the standard's examples and the
`docs/standards/conformance/` fixtures, never formatter output.

| Guarantee | Test | Cases |
|---|---|---|
| Joins | `insdcLocation.test.ts` | Segments `[0,3)`, `[6,9)` give `join(1..3,7..9)`. Out-of-order trans-splice `[69610,70000)`, `[1000,1200)` gives `join(69611..70000,1001..1200)` (written order kept) |
| Origin crossing | same | `start 8, end 2`, no segments, length 10, circular: `join(9..10,1..2)`. Conformance fixture W1 (`join(115..120,1..5)` on 120 bases), parsed, then its text dropped and formatted: `join(115..120,1..5)` |
| Complement | same, on the parsed conformance fixtures (`docs/standards/conformance/fixture.gb`) with text dropped | J1 gives `join(1..10,21..30)`; J2 gives `complement(join(1..10,21..30))`; J3 gives `join(complement(21..30),1..10)`. J4, J5 and W2 (nested outer complements) give their per-part equivalents, and re-parsing each output then extracting gives the oracle bases in `expected-oracle.txt` (J4 `GTTG`, J5 `ACTG`, W2 `TAACAATAACG`) |
| Parts and wraps | same | `segments: []` with `start 0, end 3`: `1..3`. Explicit segment `[8,2)` on circular length 10: `join(9..10,1..2)`. The same part with its own reverse strand next to a forward part `[3,5)`: `join(complement(1..2),complement(9..10),4..5)`, which, on the circular record `ACGTACGTGA` (flanks `AC` at 1..2 and `GA` at 9..10 differ), re-parses and extracts to the hand-derived `GTTCTA`: rc(`AC`)=`GT`, then rc(`GA`)=`TC`, then 4..5 `TA`. Swapped pieces would give `TCGTTA`. |
| Partly stranded refused | `projectFile.test.ts`, `FeatureEditorModal` test, `insdcLocation.test.ts` | A project with parts `[8,2)` (no strand) and `[3,5)` (`+1`) is refused, naming the feature. In the editor, adding a piece to a per-part feature shows its strand choice and keeps Save disabled until set. The formatter given that shape returns `invalid-geometry` |
| Sites | same | `[4,5)` gives `5..5` (unchanged). `[10,10)` gives `10^11`. Circular `[120,120)` on 120 bases gives `120^1`. Linear `[0,0)` and `[L,L)`, alone and inside a join with `[3,6)`: `no-insdc-form` with words "before base 1" or "after base L" |
| Partial ends | same, with `ends` given | Forward join with 5′ partial: `join(<1..3,7..9)`. Reverse `[9,40)` with 5′ partial: `complement(10..>40)`. Reverse circular `complement(join(9..10,1..2))` with 5′: `complement(join(9..10,1..>2))`, and with 3′: `complement(join(<9..10,1..2))`. Out-of-order reverse join `[6,9)`, `[0,3)` with 5′: `complement(join(7..9,1..>3))`. J3 shape `[(21..30, −), (1..10, +)]` with 5′ and 3′: `join(complement(21..>30),1..>10)`. Without `ends`: no markers |
| Export of edge sites | `serialize.test.ts`, `exportPlan.test.ts`, `ExportDialog.test.tsx` | A linear-edge site feature is absent from the output, and the report counts 1 in `featuresWithoutInsdcLocation`. With no other warnings, the dialog still shows the skip line. A source-only record plus one edge site shows 0 annotations, not −1 |
| Site round trip | `serialize.test.ts` plus the parser from #230 | Interior `[10,10)`, circular-origin `[120,120)`, and a site inside a join export and re-import to the same geometry |
| Extraction agrees | `sequence.test.ts` | On circular `ACGTACGTGA`, a stored explicit `[8,2)` extracts `GAAC`, both from the stored feature and from its re-imported `join(9..10,1..2)`. The reverse per-part case extracts `GTTC`. |
| Aligned sites | `coordinate.test.ts`, `sequence.test.ts` | Envelope `[3,6)` with parts `[3,3)`, `[6,6)` on a gapped record: the aligned copy keeps two zero-length parts, and extraction gives an empty sequence, no indices and no translation |
| Aligned order | `coordinate.test.ts`, `sequence.test.ts` | On circular `ACGTACGTGA` aligned with a gap, a reverse per-part `[8,2)` extracts `GTTC` from the aligned copy, the same as the source (the current split would give `TCGT`) |
| Invalid geometry | `insdcLocation.test.ts`, `FeatureEditorModal` test, `projectFile.test.ts`, `serialize.test.ts`, `exportPlan.test.ts` | Linear 10-base record: `[8,2)` gives `9..2 (invalid location)`, never a join; `[0,15)` and `[-1,3)` are invalid too. Circular `[10,0)` as envelope and as an explicit segment is invalid. An export with one invalid feature and one edge site shows both warning lines with their own counts. The editor disables Save on such a part. Project import keeps the feature. Export skips it and reports it |
| Derived snapshot | `coordinate.test.ts`, `projectFile.test.ts` | A project feature with a conflicting `biological` field loads without it. An unaligned record's features have no `biological` after transposition. An aligned feature with retained `order(1..3,7..9)` or `<5..>25` text shows that text in the tooltip |
| Zero-width parts drawn as nothing | `Row` test | A join `[0,3)`, `[5,5)` draws one bar for `[0,3)` and no glyph at 5, aligned and unaligned |
| Viewer tooltip, unaligned | `Row` test | An unaligned record's join reads `join(1..3,7..9)` from the feature itself |
| Export unchanged | `serialize.test.ts` | Existing fixtures byte-identical. An edited joined feature exports the same string the details window shows |
| Display parity | `RecordDetailsModal`, `AnnotationRow`, `TrackTooltip`, `GenomeStrip` tests | A feature without `locationString`, segments `[0,3)`, `[6,9)`: each shows `join(1..3,7..9)`. A feature with `locationString` shows that text unchanged |
| Viewer tooltip | `Row` test | Record `ACGTACGTAC` aligned with internal gaps, join `[0,3)`, `[6,9)`: Locus reads `join(1..3,7..9)`. A join `[0,3)`, `[5,5)` on a gapped record reads `join(1..3,5^6)`, the same as the details window. Circular origin crossing on an aligned record: the LOC-6 join |

## Living documents

`docs/standards/locations.md`:
- **LOC-1, LOC-3 and LOC-6:** under Dunceious, note that display and export share
  `formatInsdcLocation`.
- **LOC-3:** note that a nested outer complement is rewritten to its per-part equivalent once
  its location text is gone.

## Rejected alternatives

- **A labelled envelope** ("1..9, joined"). It still hides which bases belong to the feature,
  and differs from what export writes.
- **Listing parts as plain ranges** ("1–3, 7–9"). It is easier to read, but it's a second
  notation next to the exported one, and it drops strand and wrap meaning.
- **A display-only formatter in `src/app`.** Export lives in `src/core` and couldn't share it, so
  the two would drift again.

## Left to the builder

- File and helper names, within the layer rule.
- Whether `siteLabel` returns a token or the words directly, as long as display and export keep
  the rules above.
