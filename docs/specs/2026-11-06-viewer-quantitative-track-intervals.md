---
title: "Quantitative tracks: half-open support, aligned coordinates and gap-aware drawing"
status: proposed
date: 2026-11-06
areas: ["viewer", "quantitative-tracks", "coordinates"]
prs: [290]
issues: [260]
superseded_by: null
summary: "Quantitative track intervals keep their biological coordinates, are mapped into the aligned frame as gap-free pieces, are drawn exactly over their own half-open support without bridging missing data, and are picked with start ≤ p < end, listing every overlapping interval."
---
# Quantitative track intervals — design

## Why

[#260](https://github.com/JoaoVictorDaijo/dunceious/issues/260) (OBS-16, OBS-50) found three
defects on `develop` (`536fb17`). Each one gives a wrong scientific result without any warning:

1. **The signal is drawn where no data exists.** `QuantitativeTrack.tsx:133-157` joins the
   midpoints of every bedGraph interval into one path and fills under it. With `0 10 2` and
   `90 100 8`, it draws a line over the unsupplied `[10,90)`.
2. **Tracks stay in biological coordinates on an aligned record.** `processTransposition`
   (`coordinate.ts:153-183`) maps features into aligned columns but returns `record.tracks`
   unchanged. It also returns early, leaving tracks unmapped, when a record has no features. A
   value at biological `[0,1)` of `ACGT` aligned as `--ACGT` is drawn at column 0, not column 2.
3. **Picking treats the end as included.** Hover and double-click (`Row.tsx:512`, `:530`) test
   `bp >= start && bp <= end`, so a pointer exactly on a shared boundary picks the earlier
   interval. On an aligned record, double-click also selects the interval's biological
   coordinates, which lands on the wrong window.

## Requirement (collaborator, 2026-11-05)

Murilo, on #260: tracks "must preserve their original annotation coordinates while correctly
transforming them into the aligned viewer frame". The renderer "must break lines across missing
intervals instead of interpolating". Drawing and hit-testing use strict half-open
`start <= p < end`.

## Standards

- [UCSC bedGraph](https://genome.ucsc.edu/goldenPath/help/bedgraph.html): only the specified
  positions are graphed. Coordinates are zero-based and half-open, in numerical position order.
- [GA4GH BEDv1](https://samtools.github.io/hts-specs/BEDv1.pdf) (2022-01-05), §§1.5–1.6:
  - `chromStart` is inclusive and `chromEnd` exclusive;
  - `start == end` is allowed and marks an insertion site.
- Project rules: [FMT-7](../standards/formats.md#fmt-7-bed-fields-coordinates-and-scores),
  [FMT-8](../standards/formats.md#fmt-8-ucsc-bedgraph-intervals-and-values),
  [METRIC-7a](../standards/metrics.md#metric-7a-observed-interval-values-and-interpolation),
  [OP-4](../standards/operations.md#op-4-residues-alignment-columns-and-boundaries) and
  [COORD-1](../standards/alphabets-and-coordinates.md#coord-1-positions-shown-to-users).
- `QuantitativeTrack.data` is documented as `[start, end)` 0-based half-open (`types.ts:66`).
  This design makes every display consumer honour it.

## Decisions (owner, 2026-11-06)

- **An interval that covers alignment gap columns is split** into gap-free pieces with the same
  value. Gap columns have no base, so no value is shown over them. Features stay continuous
  across internal gaps, as today: a feature is a region, while a track value is a measurement of
  bases.
- **The biological interval is kept** on every piece, so tooltips can report it.
- **Adjacent half-open intervals pack into one row.** This fixes the `end + 1` packing test
  (`layout.ts:181`, duplicated at `QuantitativeTrack.tsx:51`).

## Goals

- Source records keep their tracks in biological coordinates. Export and project files are
  unchanged.
- Display copies carry aligned, gap-free pieces, each linked to its biological interval.
- Every shape lies inside its piece's support: no bridging, no minimum widths, no stroke overhang.
- One pure picking function serves hover and double-click, using `start <= p < end`. It returns
  every interval that covers the position, never one chosen arbitrarily.
- The tooltip reports the biological position and the biological interval of each match.

## Non-goals

- Validating imported track rows. Parser validity (numeric prefixes such as `parseInt("10.5")`,
  negative or descending coordinates, extra fields, order) is
  [#250](https://github.com/JoaoVictorDaijo/dunceious/issues/250), which FMT-7 and FMT-8 already
  cite. This design only refuses to *draw* what it cannot place, and says so (see Model).
- New track formats (wig, bigWig). There is no parser for them.
- Changing the value scale, axis or colours, or the conservation track (OBS-30 owns its metric).
- Summarising, resampling or capping values when zoomed out.

## Anti-goals

- A shape over a position no interval covers.
- A value shown over an alignment gap column.
- A biological coordinate used in the aligned frame, or the reverse.
- An interval dropped, clipped or merged without the user being told.

## Model

**Nothing is split ahead of time.** A display track keeps the stored intervals and the record's
residue runs. Gap removal is done by clipping when drawing, and by one lookup when picking, so
neither memory nor redraw time depends on how many pieces the intervals would split into.

```ts
/** One residue run: maximal aligned columns without '-', and the biological index of its first residue. */
interface ResidueRun { column: number; length: number; residue: number }

/** A piece as drawn or picked: aligned, half-open, linked to its stored interval. */
interface TrackPiece {
  start: number;
  end: number;
  value: number;
  source: { start: number; end: number; index: number };  // biological, as stored; index in track.data
}

/** Display state for one stored track, kept beside it, never in place of it. */
interface DisplayTrack {
  track: QuantitativeTrack;          // the stored track: id, name, kind, color, data, unchanged
  placed: number[];                  // indices into track.data, sorted by (start, end, index)
  runs: ResidueRun[];                // shared by every track on the record
  unplaced: { index: number; reason: 'empty' | 'out-of-range' | 'invalid' }[];
}

/** The placed interval's full aligned envelope: first residue column to last residue column + 1. */
export function alignedEnvelope(display: DisplayTrack, index: number): { start: number; end: number };
```

1. **Where it is built.** `processTransposition` keeps mapping features as before. It also
   builds a `DisplayTrack` for every track of every record, aligned or not, so both early
   returns (`coordinate.ts:155-156`) go. The display record carries
   `displayTracks: DisplayTrack[]` beside `tracks`. Source consumers keep reading `tracks`:
   App record removal, hub counts, lists and filters, project validation, annotation attachment
   and export.
2. **Residue runs.**
   - An aligned record has one run per maximal stretch of columns without `-`.
   - An unaligned record has a single run `{ column: 0, length: sequence.length, residue: 0 }`,
     so aligned and biological positions are the same.
3. **Placement.** Each stored datum `[s, e)` with value `v` is checked in stored order:
   - `s == e` is a BED insertion site, legal under BEDv1, and becomes `unplaced: 'empty'`. A
     quantitative value has no base to stand on.
   - A non-integer, negative or descending coordinate, or a `v` that is not finite, becomes
     `unplaced: 'invalid'`. `parseFloat('Infinity')` and `parseFloat('1e999')` pass today's
     `isNaN` checks (`annotations.ts:53-59`, `:97-101`), and one infinite value would collapse
     the whole axis.
   - `e > sequence length` becomes `unplaced: 'out-of-range'`. It is **not clamped**: today's
     lookup maps an out-of-range end to the alignment length (`coordinate.ts:59-69`), which
     would silently clip `[1,99)` on a 4-base record.
   - Everything else is placed.
4. **Pieces exist only for picking.** A piece is the intersection of one placed interval with
   one residue run. It is computed only for a picked column, never for drawing (see Drawing and
   Picking).
5. **Unplaced data is visible.**
   - The track header shows a count: "2 of 1,204 intervals not drawn".
   - Its tooltip lists the reasons.
   - The import log gets one line per track.

   Value ranges (`GenomeViewer.tsx:146-169`) use placed, finite values only, and the axis
   tooltip says so.

The stored type `QuantitativeTrack` (`types.ts`) is unchanged. `TrackPiece` replaces
`TrackDatum` inside `layout.ts`, `Row.tsx` and `QuantitativeTrack.tsx`.

## Drawing

**Contract.** The geometry is exact: every shape for a piece lies inside its own extent
`[x(start), x(end))`, at that piece's value, and nothing is drawn where no piece is. How
sub-pixel shapes turn into pixels is left to the canvas's normal antialiasing. The design makes
no claim about the pixel values where shapes and gaps share a device pixel. At that zoom, a
pixel cannot show the difference, and the tooltip and picking still report exact intervals.

**Gap mask.** For each redraw, build one clip path from the residue runs in view. Each run is
one rectangle, so the path is O(runs in view). Everything below is drawn inside that clip, so
nothing reaches a gap column, whatever the intervals are.

**Line tracks (`kind: 'line'`):**
- For each placed interval in view, take its aligned envelope. Fill the rectangle from the zero
  line to `y(v)` over it. Then stroke its top edge with `lineCap = 'butt'`, inside a clip equal
  to the envelope, intersected with the gap mask. Each interval is drawn on its own, so no edge
  spills into a neighbour or a gap.
- Adjacent intervals with different values show their own levels, meeting at the shared
  boundary. No vertical connector is drawn, because it would sit over values neither interval
  has.
- Overlapping intervals, which the parser accepts (#250), are drawn one after another in stored
  order. They are never merged into an invented value.
- **Cost per redraw:** O(log n + intervals in view + runs in view), with constant extra memory.
  At full-record zoom that is every interval once plus every run once. It is not intervals times
  runs.

**Interval tracks (`kind: 'interval'`):**
- Remove the 1 px minimum width.
- Remove the rounded corner when a piece is narrower than twice the radius.
- Draw each rectangle over its aligned envelope, clipped to the envelope and to the gap mask.

**Lane height (existing limit, unchanged).** Interval tracks give every packed row its own lane,
and the canvas is as tall as all lanes (`layout.ts:174-194`, `Row.tsx:548-558`). Deeply nested
BED files can already exceed browser canvas limits. Virtualising lanes is a separate issue for
this PR to file, not part of it.

The geometry is built by a pure function, so it can be tested without a canvas:

```ts
/** Shapes for the intervals in view, plus the gap-mask rectangles they are clipped to. */
export function trackGeometry(display: DisplayTrack, scale: (x: number) => number, viewport: [number, number]): { mask: Rect[]; shapes: TrackShape[] };
```

## Picking

```ts
/** Every piece whose half-open support contains `p`, in (start, end, source.index) order. */
export function pickTrackData(display: DisplayTrack, p: number): TrackPiece[];
```

- **Method:**
  1. Map column `floor(p)` to its residue through the runs. A gap column has no residue, so
     nothing is picked.
  2. Return every placed interval whose biological `[start, end)` contains that residue. The
     scan is linear over the placed intervals: O(n) worst case, measured in the bench. No
     overlap index is claimed.
- **Returned bounds:** each returned piece is the **whole** intersection of its interval with
  the residue run holding `p`. It is not clipped to the pointer's column. Unaligned `[0,100)`
  picked at 15 returns `[0,100)`.
- Nested intervals such as `[0,100)` and `[10,20)` are both found at 15, and `[0,100)` alone at
  50.
- **Hover tooltip:**
  - `Pos` is the biological position plus 1, read from the residue run that holds column
    `floor(p)`. For unaligned records that is `floor(p) + 1`.
  - For each match: `Interval source.start+1..source.end`, and its value.
  - When more than one matches, the header says "3 overlapping intervals".
- **Double-click:**
  - interval tracks: select the piece in the packed row under the pointer's y, since rows
    separate overlaps;
  - line tracks: select the first match in pick order, and the log names the others when there
    are several;
  - the selection is in aligned columns, which the export path already expects.

## Hub focus

"Open in viewport" on a track in the hub (`HubList.tsx:333`) sends the source track's bounds to
`focusOn`. `focusOn` installs them as an aligned selection (`App.tsx:116`). Feature focus already
maps its bounds into columns (`focusTarget.ts:37`). Track focus must do the same:

- Use the smallest placed start and largest placed end.
- Map them into columns, from the first residue column to the last residue column plus 1.
- A track with no placed intervals is not focusable. The hub says why, using the same unplaced
  count as the track header.

## Region export (verified, no change)

JSON selection export (`useFileHandlers.ts:348-360`) works on the **source** records. It maps the
aligned selection to biological bounds with `getOriginalPos`, then clears `alignedSequence`. It
slices with `sliceRecordsBySelection` in biological coordinates, then restores the aligned
substring. Display pieces never reach it.

The design keeps that path unchanged, and adds an end-to-end regression for it.
`sliceRecordsBySelection` keeps its precondition: the records and the bounds share one frame.

## Validation

Expected values come from a **test-local per-residue oracle**: a naive loop that lists, for each
biological index, its aligned column. It is written separately from `coordinate.ts`, and is the
textbook mapping that [OP-4](../standards/operations.md#op-4-residues-alignment-columns-and-boundaries)
documents as Biopython's inverse indices. Expected pieces are derived as maximal runs of
consecutive columns from that oracle, not from production helpers.

| Guarantee | Test | Cases |
|---|---|---|
| Mapping | `coordinate.test.ts` | `ACGT` / `--ACGT`: `[0,1)` gives piece `[2,3)` with `source [0,1)`. The stored track is the same object afterwards |
| Gap split | same | `AC--GT`: `[0,4)` gives `[0,2)` and `[4,6)`. Also leading, internal and trailing gaps; one-base `[3,4)` at the sequence end; a record with `features: []` |
| Unaligned identity | same | No `alignedSequence`: pieces equal the stored intervals, and the tooltip position is `floor(p) + 1` |
| No clamping | same | `ACGT` / `ACGT--`: `[1,99)` is unplaced `out-of-range`; `[2,2)` is `empty`; `[3,1)` is `invalid`. A finite row next to an `Infinity` row: the finite one is drawn and the value range ignores the infinite one |
| Strand and topology | same | Mapping is the same with reverse-strand features on the record and on a circular record. Descending track data is `invalid`, not a wrap |
| Empty track | same | `data: []` gives no pieces and the existing "No track data available" message |
| Geometry | `trackGeometry` unit test | On `AC--GT`, the mask has rectangles `[0,2)` and `[4,6)` only. `0 10 2` and `90 100 8`, domain `[0,100]`, width 100: no shape has any x in `(10, 90)`. Adjacent `[0,10)=2` and `[10,20)=5`: two rectangles meeting at x = 10, each top stroke clipped to its own piece, no vertical connector. At 0.1 px per column, `[0,1)` and `[2,3)` give non-overlapping shapes 0.1 px wide |
| Overlaps | `pickTrackData` unit test | Unsorted `[10,20)`, `[0,100)`: p = 15 returns both and p = 50 returns `[0,100)`. Shared boundary: with `[0,10)` and `[10,20)`, p = 10 returns `[10,20)` only. p = 20 and a gap column return nothing |
| Picking in the viewer | `Row` test | Double-click on unaligned `[0,100)` at 15 selects `[0,100)`. On `AC--GT` with `[0,4)`, a click at column 1 selects `[0,2)`, the whole piece. The tooltip shows the biological position and interval |
| Hub focus | `HubList` / `focusTarget` test, then export | `ACGT` / `--ACGT`, track `[0,1)`: focus selects aligned `[2,3)`, and JSON selection export then contains the interval. Unaligned: focus selects the stored bounds. A track with every row unplaced is not focusable |
| Packing | `layout.test.ts` | `[0,10)` and `[10,20)` share row 0 |
| Region export | hook test calling `exportSelectionJson` | Distinct source and display records. The serialized JSON is checked against an independently written expected document: biological, rebased track intervals and no display fields |
| Unplaced is visible | `QuantitativeTrack` test | A track with one out-of-range row shows "1 of 3 intervals not drawn" |

The oracle validates mapping and picking. It does not validate canvas pixels: the geometry tests
check shapes, and pixel output is the browser's normal antialiasing (see Drawing).

**Performance.** Add a case to the existing `bench/` suite:
- 200,000 bedGraph intervals on a 1 Mb record aligned with 5,000 gap runs;
- 20,000 long overlapping intervals over the same alignment.

Report peak memory, build time, redraw time at full-record zoom and two closer zoom levels, and
worst-case pick time in the PR.
Nothing is capped or sampled, so these are measurements, not limits. Lane depth for nested BED
tracks is the separate existing limit noted under Drawing.

## Rejected alternatives

- **One continuous interval across gaps, like features.** Hover over a gap column would report a
  value for a column that has no base.
- **Interpolating between midpoints with a gap threshold.** It still invents values inside the
  threshold, and no standard defines one.
- **Storing aligned coordinates in the source record.** That breaks export and project files,
  which rely on biological coordinates.
- **Clamping out-of-range intervals to the sequence.** It changes supplied data silently.
- **Picking one overlapping interval.** Which one is arbitrary; listing all of them is exact.
- **Splitting intervals into pieces, ahead of time or per window.** Long overlapping intervals
  over a gapped alignment multiply into about 100 million pieces at full zoom. Clipping to a gap
  mask gives the same exact geometry at O(intervals + runs).

## Left to the builder

- Whether `DisplayTrack` is built in the worker or in the viewer model, and how it is cached per
  record version.
- Exact header and tooltip wording, within the meanings above.
