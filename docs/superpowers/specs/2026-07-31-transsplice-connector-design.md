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

Gate the wrap on the parent envelope, and make the ordinary connector
order-agnostic. The branch count does not change.

```ts
// A genuine origin crossing is the only case that draws two parts.
if (f.start > f.end && s1.end > s2.start) {
  // unchanged two-part wrap draw
} else {
  const gapStart = Math.min(s1.end, s2.end);
  const gapEnd   = Math.max(s1.start, s2.start);
  if (gapEnd > gapStart) {
    // one dashed connector across [gapStart, gapEnd]
  }
}
```

`f.start > f.end` is the envelope signal established by #69: `parseLocation`
returns `start > end` only for a genuine origin crossing, and returns a linear
envelope for a scattered join.

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
| rps12 CDS copy 1 | false wrap | one line `69724 → 98561` |
| rps12 gene copy 1 | false wrap | one line `69724 → 97998` |
| rps12 CDS copy 2 | two normal lines | unchanged |
| SARS-CoV-2 ORF1ab | false wrap | nothing drawn (abutting) |
| SARS-CoV-2 RdRp | false wrap | nothing drawn (abutting) |
| mito D-loop `complement(join(16024..16569,1..576))` | two-part wrap | unchanged |
| `join(2427..3323,1..1758)` | two-part wrap | unchanged |
| `join(1..10,21..30)` | one line | unchanged |

Four features across two shipped example files stop rendering a fabricated
origin crossing. Both genuine wraps are preserved.

## Testing

`src/app/viewer/__tests__/Row.test.tsx` already counts connectors via
`line[stroke-dasharray="2,1"]` and covers a normal join (1), an origin-spanning
join (2), and a feature circular-wrap (0). Add:

- a descending, non-origin-crossing join (rps12 shape) → **1** connector, where
  today it draws 2;
- an abutting/overlapping pair (ORF1ab shape) → **0** connectors;
- an assertion that the genuine-wrap case still draws 2, guarding the envelope
  gate itself.

The first test fails before the change and passes after, which is the regression
this issue needs.

## Out of scope

- Any trans-splicing-specific encoding, in the glyph or the tooltip.
- `getDisplaySeq` and the detail view (issue #81).
- The `SCROLLBAR_HEIGHT`-style dead constants nearby in the viewer.
