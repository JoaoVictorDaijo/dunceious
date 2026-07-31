# Out-of-order join connectors — design

Issue: #80 · Branch: `fix/trans-splice-connector` · Date: 2026-07-31

## Problem

`src/app/viewer/Row.tsx` decides how to connect two adjacent segments of a
multi-part feature with a single test on pair order:

```ts
if (s1.end <= s2.start) { /* one dashed connector */ }
else                    { /* two-part origin-crossing "wrap" connector */ }
```

The `else` treats *any* non-ascending pair as an origin crossing. A feature whose
segments descend without crossing the origin therefore renders a dashed line
running to the end of the genome and back from position 0 — a wrap that does not
exist. The coding sequence and translation are unaffected; this is glyph layout
only.

## What the predicate actually selects

`s1.end > s2.start` means "this pair is not in ascending, non-overlapping order".
Running the real parser over the shipped examples shows it catches three
unrelated phenomena:

| Feature | Location | Why it descends/overlaps |
| --- | --- | --- |
| rps12 CDS + gene, copy 1 | `complement(join(97999..98024,98562..98793,69611..69724))` | trans-splicing |
| SARS-CoV-2 ORF1ab, RdRp | `join(266..13468,13468..21555)` | programmed −1 ribosomal frameshift; segments overlap by 1 nt |
| minus-strand joins | `join(complement(4918..5163),complement(2691..4298))` | listed in transcription order |

It is therefore **not** a trans-splicing signal. Two further rps12 copies in the
same file — `join(complement(69611..69724),139856..140087,140625..140650)` —
carry `/trans_splicing` yet ascend, so they never reach this branch at all.

This is why the connector keeps one style. Styling the `else` branch differently
would give the same gene two encodings in the same record, and would mark
SARS-CoV-2 ORF1ab as trans-spliced when it is not. The connector's honest meaning
is "these blocks are one feature", which holds for every case above.

If trans-splicing is ever worth showing, it must key on `metadata.trans_splicing`
(already parsed) or per-segment strand, and belongs in the tooltip — the app's
existing channel for structural detail. Out of scope here.

## Design

Gate the wrap on evidence of a real origin crossing, and make the ordinary
connector order-agnostic. The branch count does not change.

```ts
// A genuine origin crossing is the only case that draws two parts.
if ((f.start > f.end || s1.end >= seq.length) && s1.end > s2.start) {
  // unchanged two-part wrap draw
} else {
  const gapStart = Math.min(s1.end, s2.end);
  const gapEnd   = Math.max(s1.start, s2.start);
  if (gapEnd > gapStart) {
    // one dashed connector across [gapStart, gapEnd]
  }
}
```

### Why the gate needs two signals

`f.start > f.end` is the envelope signal from #69, but it is **not complete**.
`locationParser.ts:21` only produces a wrapping envelope when
`firstStart > lastEnd && minStart === 0` — some segment must begin at base 1. A
feature that crosses the origin with an intron *over* the origin, such as
`join(5800..6000,50..300)`, has `minStart === 49` and therefore receives a
**linear** envelope. Gating on the envelope alone would send it to the `else`
branch and draw one straight line across ~92% of the genome — where the current
code draws the correct origin-side connector. That would be a regression, not a
preserved limitation.

The second signal closes it: a block that precedes the origin must reach the end
of the sequence, so `s1.end >= seq.length` identifies the crossing pair directly.
Neither rps12 (`98793` of `154478`) nor ORF1ab (`13468` of `29903`) comes near
its genome end, so no false wrap is reintroduced. `seq` is the record's own
sequence (`Row.tsx:72`), not `alignmentLength`, which is the maximum across
records in aligned mode.

Residual: a linear-envelope feature whose first-listed segment ends exactly at
the genome end **and** descends would still be treated as a wrap. That
coincidence is the signature of an origin crossing, so treating it as one is the
right default.

`Math.min`/`Math.max` collapse both orders into one span, so no third branch is
needed. For an ascending pair the expression reduces to today's
`s1.end → s2.start` exactly. The `gapEnd > gapStart` guard suppresses the line
for abutting or overlapping segments, where there is no gap to bridge.

The existing viewport cull (`x2 > 0 && x1 < viewportWidth`) assumes `x1 < x2`,
which the min/max form now guarantees for every pair.

### Style

Unchanged: `strokeWidth={1} opacity={0.4} strokeDasharray="2,1"`. Keeping the
dash pattern byte-identical also keeps the existing test selector
`line[stroke-dasharray="2,1"]` valid.

## Behaviour

Verified by running `parseLocation` over the shipped examples:

| Case | Before | After |
| --- | --- | --- |
| rps12 CDS copy 1 | false wrap | two lines `98024 → 98561` and `69724 → 98561` |
| rps12 gene copy 1 | false wrap | one line `69724 → 97998` |
| rps12 CDS copy 2 | two normal lines | unchanged |
| SARS-CoV-2 ORF1ab | false wrap | nothing drawn (segments overlap) |
| SARS-CoV-2 RdRp | false wrap | nothing drawn (segments overlap) |
| mito D-loop `complement(join(16024..16569,1..576))` | two-part wrap | unchanged |
| `join(5800..6000,50..300)` (origin crossed inside an intron) | two-part wrap | unchanged — via `s1.end >= seq.length` |
| `join(1..10,21..30)` | one line | unchanged |
| abutting ascending pair (`s1.end === s2.start`) | zero-length line | nothing drawn |

Four features across two shipped example files stop rendering a fabricated
origin crossing. Every genuine wrap is preserved.

rps12 CDS copy 1 has three segments, so it draws two connectors, and the longer
one contains the shorter — they overlap on `98024..98561` at `opacity 0.4` each.
That follows from connecting segments in join order and is cosmetic; it replaces
a fabricated 85 kb origin crossing.

## Testing

`src/app/viewer/__tests__/Row.test.tsx` already counts connectors via
`line[stroke-dasharray="2,1"]` and covers a normal join (1), an origin-spanning
join (2), and a feature circular-wrap (0).

Counting connectors is not sufficient. Dropping `Math.min`/`Math.max` entirely,
or dropping either half of the gate, leaves the count unchanged — so the tests
must pin **geometry** and must include a shape that exercises each conjunct:

- descending, non-origin-crossing join (rps12 shape) → **1** connector, and
  assert its `x1`/`x2` (bp 30→70 at `ZOOM 8` is `240`→`560`). The count alone
  passes even if the connector spans the whole feature.
- overlapping pair (ORF1ab shape, `s1.end > s2.start` by one base) → **0**.
- exactly abutting pair (`s1.end === s2.start`) → **0**. This is the only shape
  that distinguishes `gapEnd > gapStart` from `gapEnd >= gapStart`, and it
  records a deliberate behaviour change: today it draws a zero-length line.
- three-segment origin-crossing feature → **3** connectors (one ordinary intron
  plus two wrap halves). This is the guard on the gate: simplifying it to
  `f.start > f.end`, or hoisting it out of the loop, yields 4 and fails.
- linear-envelope feature whose first segment reaches the sequence end →
  **2** connectors (the wrap). This guards the `s1.end >= seq.length` disjunct;
  without it the feature draws one line across most of the genome.

The pre-existing origin-spanning test (`start: 80, end: 20`,
`segments [{80,95},{5,20}]`) draws 2 connectors both before and after the change,
so it is a no-regression check, not a gate guard, and must not be relied on as
one.

## Out of scope

- Any trans-splicing-specific encoding, in the glyph or the tooltip.
- `getDisplaySeq` and the detail view (issue #81).
- Within a wrapping-envelope feature, every non-ascending pair still takes the
  wrap branch, not only the pair that crosses the origin. No shipped record has
  such a feature; tightening this needs its own repro.
