---
title: "Quantitative tracks: half-open support, aligned coordinates and gap-aware drawing"
status: proposed
date: 2026-11-06
areas: ["viewer", "quantitative-tracks", "coordinates"]
prs: []
issues: [260]
superseded_by: null
summary: "Quantitative track intervals keep their biological coordinates, are mapped into the aligned frame as gap-free pieces, are drawn as steps over their own half-open support without bridging missing data, and are picked with start ≤ p < end."
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
   `bp >= start && bp <= end`, so a pointer exactly on a shared boundary picks the earlier interval.
   On an aligned record, double-click also selects the interval's biological coordinates, which
   lands on the wrong window.

## Requirement (collaborator, 2026-11-05)

Murilo, on #260: tracks "must preserve their original annotation coordinates while correctly
transforming them into the aligned viewer frame". The renderer "must break lines across missing
intervals instead of interpolating". Drawing and hit-testing use strict half-open
`start <= p < end`.

## Standards

- [UCSC bedGraph](https://genome.ucsc.edu/goldenPath/help/bedgraph.html): only the specified
  positions are graphed. Coordinates are zero-based and half-open.
- GA4GH BEDv1 (2022-01-05) §§1.5–1.6: `chromStart` is inclusive and `chromEnd` exclusive.
- Project contract: `QuantitativeTrack.data` is already documented as `[start, end)` 0-based
  half-open (`types.ts:66`). This design makes every consumer honour it.

## Decisions (owner, 2026-11-06)

- **An interval that covers alignment gap columns is split** into gap-free pieces with the same
  value. Gap columns have no base, so no value is shown over them. Features stay continuous across
  internal gaps, as today. A feature is a region, while a track value is a measurement of bases.
- **The biological interval is kept** on every piece, so tooltips and selection can report it.
- **Adjacent half-open intervals pack into one row.** This fixes the `end + 1` packing test
  (`layout.ts:181`, duplicated at `QuantitativeTrack.tsx:51`).

## Goals

- Source records keep their tracks in biological coordinates. Export and project files are unchanged.
- Display copies carry aligned, gap-free pieces, each linked to its biological interval.
- Line tracks are drawn as a flat step over each interval. The path is broken wherever the next
  interval does not start exactly at the previous end.
- One pure picking function serves hover and double-click, using `start <= p < end`.
- The tooltip reports the biological position and the biological interval.

## Non-goals

- New track formats (wig, bigWig). There is no parser for them.
- Changing the value scale, axis or colours, or the conservation track (OBS-30 owns its metric).
- Smoothing, resampling or summarising values when zoomed out.

## Anti-goals

- A pixel of stroke or fill over a position no interval covers.
- A value shown over an alignment gap column.
- A biological coordinate used in the aligned frame, or the reverse.

## Model

```ts
/** A track interval as drawn: aligned columns, plus the biological interval it came from. */
interface DisplayTrackDatum {
  start: number;   // aligned, half-open
  end: number;
  value: number;
  source: { start: number; end: number };  // biological, half-open, as parsed
}
```

`processTransposition` keeps mapping features as before and also maps every track:

1. Remove the early return for records without features, so their tracks are still mapped.
2. For each datum, map `[start, end)` with the existing `createCoordinateLookup`. Then split the
   result with `buildAlignedSegments` into non-gap runs, and emit one `DisplayTrackDatum` per run,
   all sharing the datum's `value` and `source`.
3. A record without `alignedSequence` gets `source = { start, end }` and no other change.
4. Empty or invalid intervals (`end <= start`, non-integers) are dropped from display, as features
   are. Parsing already rejects them, so this is defensive.

The display type replaces `TrackDatum` in `layout.ts`, `Row.tsx` and `QuantitativeTrack.tsx`.
`QuantitativeTrack` (the stored type in `types.ts`) is unchanged.

## Drawing (`kind: 'line'`)

- Sort the visible pieces by `start`.
- Begin a run at the first piece. Extend it while `next.start === current.end`, otherwise end the
  run and begin a new one.
- For each run, build one path:
  - start at `(x(start₀), y(v₀))`;
  - for every piece, go to `(x(end), y(v))`;
  - where pieces meet, step vertically to the next value at the shared `x`.
- Stroke the run, then close it down to the zero line and fill it. Fill never joins two runs.
- Culling keeps a piece when `end > vStart && start < vEnd`.

Interval tracks (`kind: 'interval'`) already draw one rectangle over `[start, end)`. They need only
the packing fix and the aligned pieces.

## Picking

```ts
/** The datum whose half-open support contains `p`, or undefined. */
export function pickTrackDatum(data: readonly DisplayTrackDatum[], p: number): DisplayTrackDatum | undefined;
```

- Predicate: `d.start <= p && p < d.end`. Data is sorted by `start`, so a binary search can replace
  the linear `find`.
- Hover tooltip: `Pos` is `getOriginalPos(alignedSeq, floor(p)) + 1`. It also shows
  `Interval: source.start+1..source.end` and the value.
- Double-click selects the aligned `[start, end)` of the picked piece. The selection is aligned,
  and `useFileHandlers.ts:354` maps it back for export.

## Region export

`clipAndRebaseInterval` in `intervals.ts:203` clips `record.tracks` with
`record.alignedSequence || record.sequence`. The builder must confirm which records reach it:

- If they are the source records (biological coordinates), clipping with the aligned string is a
  separate existing bug. Report it, and don't change it here.
- If they are display records, the new pieces must be collapsed back to their `source` before
  writing, so an export never contains split pieces.

## Validation

Tests at the boundary each guarantee is made, following `testing-standards`:

| Guarantee | Test | Oracle |
|---|---|---|
| Mapping into the aligned frame | `coordinate.test.ts` | `ACGT` / `--ACGT`, datum `[0,1)` gives piece `[2,3)` with `source [0,1)`. The source record's track is unchanged (same object). |
| Split at gaps | `coordinate.test.ts` | `ACGT` / `AC--GT`, datum `[0,4)` gives `[0,2)` and `[4,6)`, both with value and `source [0,4)` |
| Mapped without features | `coordinate.test.ts` | Aligned record with tracks and `features: []` still gets mapped tracks |
| No bridging | `QuantitativeTrack.test.tsx` with a canvas spy | `0 10 2` and `90 100 8`, domain `[0,100]`, width 100: two separate runs, no stroke or fill between x = 10 and x = 90 |
| Adjacent steps join | same | `[0,10)=2`, `[10,20)=5`: one run with a vertical step at x = 10 |
| Half-open picking | `pickTrackDatum` unit test | `[0,10)`, `[10,20)`: p = 10 picks `[10,20)`, p = 9.99 picks `[0,10)`, p = 20 picks nothing, a gap column picks nothing |
| Aligned selection and tooltip | `Row` test | Double-click on a piece selects the aligned interval; the tooltip shows the biological position |
| Packing | `layout.test.ts` | `[0,10)` and `[10,20)` share row 0 |

## Rejected alternatives

- **One continuous interval across gaps, like features.** Hover over a gap column would report a
  value for a column that has no base.
- **Interpolating between midpoints with a gap threshold.** It still invents values inside the
  threshold, and no standard defines one.
- **Storing aligned coordinates in the source record.** That breaks export and project files, which
  rely on biological coordinates.

## Left to the builder

- Whether the step path is built per run or with `ctx.moveTo` breaks in one path. Either works if
  fill is per run.
- The region export check above.
