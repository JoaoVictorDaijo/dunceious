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
- Nothing is painted outside a piece's support: no bridging, no minimum widths, no stroke overhang.
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

- Paint over a position no interval covers.
- A value shown over an alignment gap column.
- A biological coordinate used in the aligned frame, or the reverse.
- An interval dropped, clipped or merged without the user being told.

## Model

```ts
/** A track interval as drawn: aligned columns, plus the biological interval it came from. */
interface DisplayTrackDatum {
  start: number;   // aligned, half-open
  end: number;
  value: number;
  source: { start: number; end: number; index: number };  // biological, as stored; index in track.data
}

/** Display copy of a track: pieces sorted by (start, end, source.index), plus what was not placed. */
interface DisplayTrack {
  pieces: DisplayTrackDatum[];
  maxEndPrefix: Float64Array;          // maxEndPrefix[i] = max(pieces[0..i].end), for overlap queries
  unplaced: { index: number; reason: 'empty' | 'out-of-range' | 'invalid' }[];
}
```

`processTransposition` keeps mapping features as before, and also maps every track.

1. **Remove the early return** for records without features, so their tracks are still mapped.
2. **Residue runs.** Build the record's residue runs once: the maximal aligned column ranges
   without `-`, each with the biological index of its first residue. Unaligned records have one
   run covering the sequence.
3. **Placement.** For each stored datum `[s, e)`, in stored order:
   - `s == e` (a BED insertion site, legal under BEDv1) is `unplaced: 'empty'`. A quantitative
     value has no base to stand on.
   - A non-integer, negative or descending datum, or one with `e > sequence length`, is
     `unplaced: 'invalid'` or `'out-of-range'`. It is **not clamped**: today's lookup maps an
     out-of-range end to the alignment length (`coordinate.ts:59-69`), which would silently clip
     `[1,99)` on a 4-base record.
   - Otherwise, binary-search the runs that intersect `[s, e)`. Emit one piece per intersection,
     all with the datum's `value` and `source`. The cost is O(log R + pieces), not O(span).
4. **Order.** Sort pieces by `(start, end, source.index)` once, and compute `maxEndPrefix`.
5. **Unplaced data is visible.**
   - The track header shows a count: "2 of 1,204 intervals not drawn".
   - Its tooltip lists the reasons.
   - The import log gets one line per track.

   Value ranges (`GenomeViewer.tsx:146-169`) use placed pieces only, and say so in the axis
   tooltip.

The display type replaces `TrackDatum` in `layout.ts`, `Row.tsx` and `QuantitativeTrack.tsx`.
`QuantitativeTrack`, the stored type in `types.ts`, is unchanged.

## Drawing

**Raster contract.** Every shape for a piece is clipped to the piece's own horizontal extent,
`[x(start), x(end))`. Sub-pixel pieces are drawn at their true fractional width, so antialiasing
shows them as faint, never widened. Where several pieces and gaps share one device pixel, that
pixel's coverage is the sum of the pieces' fractional coverage. Nothing extends into a
neighbouring gap.

**Line tracks (`kind: 'line'`):**
- Group the sorted pieces into runs. A run continues while `next.start === current.end`.
  Overlapping bedGraph pieces, which UCSC's position order forbids but the parser accepts (#250),
  each start a new run. They are never merged into an invented value.
- Each run is one closed step polygon:
  - top edge at `y(v)` across each piece;
  - vertical steps where pieces meet;
  - closed down to the zero line.
- Fill the polygon. Then stroke only its top edge, with `lineCap = 'butt'` and
  `lineJoin = 'miter'`, inside a clip rectangle equal to the run's extent. This way the 2.5 px
  stroke cannot spill past the first or last column.

**Interval tracks (`kind: 'interval'`):**
- Remove the 1 px minimum width.
- Remove the rounded corner when a piece is narrower than twice the radius.
- Clip each rectangle to its piece.

**Culling:** a piece is kept when `end > vStart && start < vEnd`. The prefix maximum lets the
first candidate be found by binary search.

The geometry is built by a pure function, so it can be tested without a canvas:

```ts
export function trackGeometry(track: DisplayTrack, scale: (x: number) => number, viewport: [number, number]): TrackShape[];
```

## Picking

```ts
/** Every piece whose half-open support contains `p`, in (start, end, source.index) order. */
export function pickTrackData(track: DisplayTrack, p: number): DisplayTrackDatum[];
```

- **Predicate:** `d.start <= p && p < d.end`.
- **Overlap-aware search:**
  - binary-search the last piece with `start <= p`;
  - walk left while `maxEndPrefix[i] > p`;
  - collect every match.

  Nested intervals such as `[0,100)` and `[10,20)` are found at 15 and at 50.
- **Hover tooltip:**
  - `Pos` is `getOriginalPos(alignedSeq, floor(p)) + 1`;
  - for each match: `Interval source.start+1..source.end`, and its value;
  - when more than one matches, the header says "3 overlapping intervals".
- **Double-click:**
  - interval tracks: select the piece in the packed row under the pointer's y, since rows
    separate overlaps;
  - line tracks: select the first match in pick order, and the log names the others when there
    are several;
  - the selection is in aligned columns, which the export path already expects.

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
| Mapping | `coordinate.test.ts` | `ACGT` / `--ACGT`, `[0,1)` gives `[2,3)` with `source [0,1)`; the source track is the same object |
| Gap split | same | `AC--GT`: `[0,4)` gives `[0,2)` and `[4,6)`. Leading, internal and trailing gaps. One-base `[3,4)` at the sequence end. A record with `features: []` |
| No clamping | same | `ACGT` / `ACGT--`, `[1,99)`: unplaced `out-of-range`, no piece; `[2,2)`: unplaced `empty`; `[3,1)`: unplaced `invalid` |
| Strand and topology | same | Track mapping is identical for reverse-strand features on the record and for a circular record; descending track data is `invalid`, not a wrap |
| Geometry | `trackGeometry` unit test | `0 10 2` and `90 100 8`, domain `[0,100]`, width 100: two runs; no shape covers x in `(10, 90)`. Adjacent `[0,10)=2` and `[10,20)=5`: one run with a step at x = 10. At 0.1 px per column, `[0,1)` and `[2,3)` give shapes of width 0.1 that don't overlap. The stroke is clipped to the run's extent |
| Overlaps | `pickTrackData` unit test | Unsorted input `[10,20)`, `[0,100)`: p = 15 returns both, p = 50 returns `[0,100)`. Shared boundary: p = 10 with `[0,10)` and `[10,20)` returns `[10,20)` only. p = 20 returns nothing. A gap column returns nothing |
| Picking in the viewer | `Row` test | Double-click selects the aligned piece; the tooltip shows biological position and interval |
| Packing | `layout.test.ts` | `[0,10)` and `[10,20)` share row 0 |
| Region export | `selectionExport.test.ts` | JSON export of an aligned selection keeps biological, rebased track intervals and no display fields |
| Unplaced is visible | `QuantitativeTrack` test | A track with one out-of-range row shows "1 of 3 intervals not drawn" |

**Performance.** Add a case to the existing `bench/` suite: 200,000 bedGraph intervals on a
1 Mb record aligned with 5,000 gap runs, plus a 20,000-interval nested-overlap BED track. Report
mapping time, redraw time at three zoom levels, and pick time in the PR. Nothing is capped or
sampled, so these are measurements, not limits.

## Rejected alternatives

- **One continuous interval across gaps, like features.** Hover over a gap column would report a
  value for a column that has no base.
- **Interpolating between midpoints with a gap threshold.** It still invents values inside the
  threshold, and no standard defines one.
- **Storing aligned coordinates in the source record.** That breaks export and project files,
  which rely on biological coordinates.
- **Clamping out-of-range intervals to the sequence.** It changes supplied data silently.
- **Picking one overlapping interval.** Which one is arbitrary; listing all of them is exact.

## Left to the builder

- Whether `DisplayTrack` is cached per record version in the worker or in the viewer model.
- Exact header and tooltip wording, within the meanings above.
