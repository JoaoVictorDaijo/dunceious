# Out-of-order join connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop drawing a fabricated origin-crossing connector for multi-part features whose segments are not in ascending order.

**Architecture:** `Row.tsx` picks the connector shape from pair order alone, so any non-ascending pair renders a two-part "wrap". Gate the wrap on the parent envelope (`f.start > f.end`, the signal `parseLocation` sets only for a genuine origin crossing) and compute the ordinary connector from `Math.min`/`Math.max` so it is order-agnostic. Branch count stays at two.

**Tech Stack:** React + TypeScript, SVG rendering, Vitest + jsdom via `src/app/testing/renderHarness`.

Spec: `docs/superpowers/specs/2026-07-31-transsplice-connector-design.md`
Worktree: `/tmp/dunceious-connector` · Branch: `fix/trans-splice-connector`

All commands below run from `/tmp/dunceious-connector`.

---

### Task 1: Descending, non-origin-crossing join draws one connector

A feature whose segments descend without crossing the origin (trans-spliced rps12) currently draws the two-part wrap. It should draw one ordinary connector across the real gap.

**Files:**
- Modify: `src/app/viewer/Row.tsx:313-356`
- Test: `src/app/viewer/__tests__/Row.test.tsx`

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe('Row feature drawing', ...)` block in `src/app/viewer/__tests__/Row.test.tsx`, after the `'draws the two-part wrap connector for an origin-spanning join'` test:

```tsx
  // rps12 shape: segments descend, but the envelope is linear so the feature
  // never crosses the origin.
  it('draws one connector for a descending join that does not cross the origin', () => {
    const { container } = renderRow(rec([
      { type: 'gene', name: 'ts', start: 10, end: 90, strand: 1,
        segments: [{ start: 70, end: 90 }, { start: 10, end: 30 }] },
    ]));
    expect(glyphs(container)).toHaveLength(2);
    expect(connectors(container)).toHaveLength(1); // not the two-part wrap
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/app/viewer/__tests__/Row.test.tsx
```

Expected: FAIL on the new test — `expected 2 to have length 1`. The other three tests pass.

- [ ] **Step 3: Replace the connector loop body**

In `src/app/viewer/Row.tsx`, replace lines 313-356 (the whole `for (let idx = 0; ...)` loop) with:

```tsx
                for (let idx = 0; idx < f.segments.length - 1; idx++) {
                  const s1 = f.segments[idx];
                  const s2 = f.segments[idx + 1];

                  // Only a feature whose envelope itself wraps (start > end, set by
                  // parseLocation) crosses the origin. Segments that merely descend —
                  // trans-splicing, a frameshift join, a minus-strand join in
                  // transcription order — span a normal gap.
                  if (f.start > f.end && s1.end > s2.start) {
                    // Wrap around connection (end of genome to start of genome)
                    const x1 = xScale(s1.end) - scrollX;
                    const xEnd = xScale(alignmentLength) - scrollX;
                    const xStart = xScale(0) - scrollX;
                    const x2 = xScale(s2.start) - scrollX;

                    if (xEnd > 0 && x1 < viewportWidth) {
                      connectingLines.push(
                        <line 
                          key={`line-wrap-1-${idx}`}
                          x1={Math.max(0, x1)} y1={lineY} x2={Math.min(viewportWidth, xEnd)} y2={lineY} 
                          stroke={f.color || getFeatureColor(f.type, customColors)} strokeWidth={1} opacity={0.4} strokeDasharray="2,1"
                        />
                      );
                    }
                    if (x2 > 0 && xStart < viewportWidth) {
                      connectingLines.push(
                        <line 
                          key={`line-wrap-2-${idx}`}
                          x1={Math.max(0, xStart)} y1={lineY} x2={Math.min(viewportWidth, x2)} y2={lineY} 
                          stroke={f.color || getFeatureColor(f.type, customColors)} strokeWidth={1} opacity={0.4} strokeDasharray="2,1"
                        />
                      );
                    }
                  } else {
                    // Order-agnostic gap: the gap runs from the inner edge of the
                    // earlier block to the inner edge of the later one, whichever
                    // way round the pair is listed.
                    const gapStart = Math.min(s1.end, s2.end);
                    const gapEnd = Math.max(s1.start, s2.start);
                    const x1 = xScale(gapStart) - scrollX;
                    const x2 = xScale(gapEnd) - scrollX;
                    if (x2 > 0 && x1 < viewportWidth) {
                      connectingLines.push(
                        <line 
                          key={`line-${idx}`}
                          x1={Math.max(0, x1)} y1={lineY} x2={Math.min(viewportWidth, x2)} y2={lineY} 
                          stroke={f.color || getFeatureColor(f.type, customColors)} strokeWidth={1} opacity={0.4} strokeDasharray="2,1"
                        />
                      );
                    }
                  }
                }
```

For an ascending pair `gapStart`/`gapEnd` reduce to `s1.end`/`s2.start`, so existing behaviour is byte-identical.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/app/viewer/__tests__/Row.test.tsx
```

Expected: PASS, 4 tests. The origin-spanning test still reports 2 connectors because its feature is `start: 80, end: 20` (envelope wraps).

- [ ] **Step 5: Commit**

```bash
git add src/app/viewer/Row.tsx src/app/viewer/__tests__/Row.test.tsx
git commit -m "fix(viewer): gate the wrap connector on the feature envelope (#80)"
```

---

### Task 2: Abutting or overlapping segments draw no connector

SARS-CoV-2 `ORF1ab` is `join(266..13468,13468..21555)` — a programmed −1 ribosomal frameshift whose segments overlap by one base. There is no gap, so there is nothing to connect.

**Files:**
- Modify: `src/app/viewer/Row.tsx` (the `else` branch from Task 1)
- Test: `src/app/viewer/__tests__/Row.test.tsx`

- [ ] **Step 1: Write the failing test**

Add after the test from Task 1:

```tsx
  // ORF1ab shape: a frameshift join whose segments overlap by one base. There is
  // no gap between them, so no connector belongs there.
  it('draws no connector between abutting segments', () => {
    const { container } = renderRow(rec([
      { type: 'CDS', name: 'fs', start: 0, end: 80, strand: 1,
        segments: [{ start: 0, end: 50 }, { start: 49, end: 80 }] },
    ]));
    expect(glyphs(container)).toHaveLength(2);
    expect(connectors(container)).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/app/viewer/__tests__/Row.test.tsx
```

Expected: FAIL on the new test — `expected 1 to have length 0`. Task 1's `else` branch still emits a reversed hairline because `gapEnd` (49) is less than `gapStart` (50).

- [ ] **Step 3: Add the gap guard**

In `src/app/viewer/Row.tsx`, in the `else` branch added in Task 1, change the condition:

```tsx
                    if (x2 > 0 && x1 < viewportWidth) {
```

to:

```tsx
                    if (gapEnd > gapStart && x2 > 0 && x1 < viewportWidth) {
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/app/viewer/__tests__/Row.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/viewer/Row.tsx src/app/viewer/__tests__/Row.test.tsx
git commit -m "fix(viewer): draw no connector between abutting segments (#80)"
```

---

### Task 3: Confirm the fix against the shipped examples, then gate and push

**Files:**
- Test: `src/core/__tests__/examples.e2e.test.ts` (read only — no change expected)

- [ ] **Step 1: Verify the real records behave as the spec predicts**

```bash
cat > /tmp/verify80.mjs <<'EOF'
import { parseLocation } from '/tmp/dunceious-connector/src/core/genbank/locationParser.ts';
const cases = [
  ['rps12 CDS copy1',   'complement(join(97999..98024,98562..98793,69611..69724))'],
  ['rps12 CDS copy2',   'join(complement(69611..69724),139856..140087,140625..140650)'],
  ['ORF1ab frameshift', 'join(266..13468,13468..21555)'],
  ['D-loop wrap',       'complement(join(16024..16569,1..576))'],
  ['normal join',       'join(1..10,21..30)'],
];
for (const [name, loc] of cases) {
  const r = parseLocation(loc);
  const wrap = r.start > r.end;
  const out = r.segments.slice(0, -1).map((s1, i) => {
    const s2 = r.segments[i + 1];
    if (wrap && s1.end > s2.start) return '2-part wrap';
    const gs = Math.min(s1.end, s2.end), ge = Math.max(s1.start, s2.start);
    return ge > gs ? `1 line ${gs}->${ge}` : 'nothing';
  });
  console.log(`${name}: ${out.join(' | ')}`);
}
EOF
npx tsx /tmp/verify80.mjs
```

Expected output:

```
rps12 CDS copy1: 1 line 98024->98561 | 1 line 69724->98561
rps12 CDS copy2: 1 line 69724->139855 | 1 line 140087->140624
ORF1ab frameshift: nothing
D-loop wrap: 2-part wrap
normal join: 1 line 10->20
```

If any line differs, stop — the implementation does not match the spec.

- [ ] **Step 2: Run the full gates**

```bash
npm run typecheck && npm run lint && npm run lint:headers && npm run test && npm run build
```

Expected: typecheck ok; lint 0 errors (warnings pre-exist); headers 153/153; **639 tests pass** (637 before, +2 new); build succeeds.

- [ ] **Step 3: Push and open the pull request**

```bash
git push -u origin fix/trans-splice-connector
gh pr create --base develop --head fix/trans-splice-connector \
  --title "fix(viewer): stop drawing a false origin wrap for out-of-order joins (#80)" \
  --body "Closes #80. See docs/superpowers/specs/2026-07-31-transsplice-connector-design.md"
```

- [ ] **Step 4: Clean up the scratch file**

```bash
rm -f /tmp/verify80.mjs
```

---

## Notes for the implementer

- Do **not** introduce a second dash pattern or opacity for out-of-order pairs. `s1.end > s2.start` selects three unrelated phenomena (trans-splicing, frameshift joins, minus-strand joins written in transcription order), so styling it would assert biology that is not there — and two of the four rps12 copies in the same example file ascend, so they would render differently from their own siblings. The spec covers this.
- Keep `strokeWidth={1} opacity={0.4} strokeDasharray="2,1"` exactly as-is. The tests select connectors with `line[stroke-dasharray="2,1"]`; changing the pattern silently breaks every existing assertion.
- `firstSeg` and `lastSeg` (Row.tsx:307-308) are used further down for the feature's own glyph draw. Leave them alone.
