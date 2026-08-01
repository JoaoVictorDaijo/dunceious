# Out-of-order join connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop drawing a fabricated origin-crossing connector for multi-part features whose segments are not in ascending order.

**Architecture:** `Row.tsx` picks the connector shape from pair order alone, so any non-ascending pair renders a two-part "wrap". Gate the wrap on evidence of a real origin crossing — a wrapping envelope, or a segment reaching the sequence end — and compute the ordinary connector with `Math.min`/`Math.max` so it is order-agnostic. Branch count stays at two.

**Tech Stack:** React + TypeScript, SVG rendering, Vitest + jsdom via `src/app/testing/renderHarness`.

Spec: `docs/superpowers/specs/2026-07-31-transsplice-connector-design.md`
Worktree: `/tmp/dunceious-connector` · Branch: `fix/trans-splice-connector`

All commands run from `/tmp/dunceious-connector`. Baseline before Task 1: **637 tests**.

Coordinates in the test harness: `LEN = 100`, `ZOOM = 8`, `scrollX = 0`, so
`xScale(bp) === bp * 8`. A connector across bp 30→70 renders `x1="240" x2="560"`.

---

### Task 1: Descending, non-origin-crossing join draws one connector across the real gap

**Files:**
- Modify: `src/app/viewer/Row.tsx:313-356`
- Test: `src/app/viewer/__tests__/Row.test.tsx`

- [ ] **Step 1: Write the failing test**

Add inside `describe('Row feature drawing', ...)`, after the `'draws a feature circular-wrap …'` test:

```tsx
  // rps12 shape: segments descend, but the envelope is linear and no segment
  // reaches the sequence end, so the feature never crosses the origin.
  it('draws one connector across the gap of a descending join', () => {
    const { container } = renderRow(rec([
      { type: 'gene', name: 'ts', start: 10, end: 90, strand: 1,
        segments: [{ start: 70, end: 90 }, { start: 10, end: 30 }] },
    ]));
    expect(glyphs(container)).toHaveLength(2);
    expect(connectors(container)).toHaveLength(1);

    const [line] = Array.from(connectors(container));
    expect([line.getAttribute('x1'), line.getAttribute('x2')]).toEqual(['240', '560']);
  });
```

The coordinate assertion is the point of the test. A count of 1 also passes when
the connector wrongly spans the whole feature, which is what dropping
`Math.min`/`Math.max` produces.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/app/viewer/__tests__/Row.test.tsx
```

Expected: FAIL — `expected 2 to have length 1`. The other three tests pass.

- [ ] **Step 3: Replace the connector loop body**

In `src/app/viewer/Row.tsx`, replace lines 313-356 (the entire `for (let idx = 0; ...)` loop) with:

```tsx
                for (let idx = 0; idx < f.segments.length - 1; idx++) {
                  const s1 = f.segments[idx];
                  const s2 = f.segments[idx + 1];

                  // Join elements carry no positional guarantee, so pair order alone
                  // cannot mean an origin crossing: trans-spliced, frameshift and
                  // minus-strand joins all descend without one.
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

For an ascending pair `gapStart`/`gapEnd` reduce to `s1.end`/`s2.start`, so that path is unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/app/viewer/__tests__/Row.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/viewer/Row.tsx src/app/viewer/__tests__/Row.test.tsx
git commit -m "fix(viewer): connect out-of-order segments across their real gap (#80)"
```

---

### Task 2: Overlapping and abutting segments draw no connector

SARS-CoV-2 `ORF1ab` is `join(266..13468,13468..21555)` — a programmed −1 ribosomal frameshift whose segments overlap by one base. There is no gap, so there is nothing to connect.

**Files:**
- Modify: `src/app/viewer/Row.tsx` (the `else` branch from Task 1)
- Test: `src/app/viewer/__tests__/Row.test.tsx`

- [ ] **Step 1: Write the failing test**

Add after the Task 1 test. Both fixtures are needed: the overlap is the real
ORF1ab shape, and the exact abutment is the only shape that distinguishes
`gapEnd > gapStart` from `gapEnd >= gapStart`.

```tsx
  it.each([
    ['overlapping by one base', [{ start: 0, end: 50 }, { start: 49, end: 80 }]],
    ['exactly abutting', [{ start: 0, end: 50 }, { start: 50, end: 80 }]],
  ])('draws no connector between segments %s', (_label, segments) => {
    const { container } = renderRow(rec([
      { type: 'CDS', name: 'fs', start: 0, end: 80, strand: 1, segments },
    ]));
    expect(glyphs(container)).toHaveLength(2);
    expect(connectors(container)).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/app/viewer/__tests__/Row.test.tsx
```

Expected: FAIL on both cases — `expected 1 to have length 0`. The overlap case still emits a reversed hairline (`gapEnd` 49 < `gapStart` 50); the abutting case emits a zero-length line, which is what the current code draws too.

- [ ] **Step 3: Add the gap guard**

In `src/app/viewer/Row.tsx`, in the `else` branch, change:

```tsx
                    if (x2 > 0 && x1 < viewportWidth) {
```

to:

```tsx
                    if (gapEnd > gapStart && x2 > 0 && x1 < viewportWidth) {
```

This also removes the zero-length connector previously drawn for an ascending abutting pair — a deliberate change, pinned by the second fixture.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/app/viewer/__tests__/Row.test.tsx
```

Expected: PASS, 6 tests (the `it.each` counts as two).

- [ ] **Step 5: Commit**

```bash
git add src/app/viewer/Row.tsx src/app/viewer/__tests__/Row.test.tsx
git commit -m "fix(viewer): draw no connector between abutting segments (#80)"
```

---

### Task 3: Guard the gate with a three-segment origin-crossing feature

This test passes on the Task 1 implementation. Its job is to **fail** if the gate is later simplified — the review proved that dropping `&& s1.end > s2.start`, or hoisting the gate out of the loop, leaves every other test green.

**Files:**
- Test: `src/app/viewer/__tests__/Row.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
  // A circular feature with an ordinary intron before the origin: the interior
  // pair is a normal gap, only the crossing pair is a wrap.
  it('wraps only the crossing pair of a multi-segment circular feature', () => {
    const { container } = renderRow(rec([
      { type: 'gene', name: 'w3', start: 80, end: 20, strand: 1,
        segments: [{ start: 80, end: 90 }, { start: 92, end: 95 }, { start: 5, end: 20 }] },
    ]));
    expect(connectors(container)).toHaveLength(3); // 1 ordinary + 2 wrap halves
  });
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
npx vitest run src/app/viewer/__tests__/Row.test.tsx
```

Expected: PASS, 7 tests.

- [ ] **Step 3: Prove the test is not vacuous**

Temporarily change the gate in `src/app/viewer/Row.tsx` from
`if (f.start > f.end && s1.end > s2.start) {` to `if (f.start > f.end) {`, then:

```bash
npx vitest run src/app/viewer/__tests__/Row.test.tsx
```

Expected: FAIL — `expected 4 to have length 3`. **Revert the gate immediately** and re-run to confirm 7 pass again. If the mutation does not fail the test, stop: the test is not guarding what it claims.

- [ ] **Step 4: Commit**

```bash
git add src/app/viewer/__tests__/Row.test.tsx
git commit -m "test(viewer): guard the wrap gate with a multi-segment circular feature (#80)"
```

---

### Task 4: Recognise an origin crossing that the envelope misses

`parseLocation` marks the envelope as wrapping only when a segment starts at base 1 (`locationParser.ts:21`, `minStart === 0`). A feature crossing the origin *inside an intron*, e.g. `join(5800..6000,50..300)`, gets a linear envelope — so the Task 1 gate would send it to the `else` branch and draw one line across most of the genome.

**Files:**
- Modify: `src/app/viewer/Row.tsx` (the gate from Task 1)
- Test: `src/app/viewer/__tests__/Row.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
  // Crossing the origin inside an intron: parseLocation cannot mark the envelope
  // as wrapping (no segment starts at base 1), so the first segment reaching the
  // sequence end is the only remaining evidence of the crossing.
  it('wraps a linear-envelope feature whose first segment reaches the sequence end', () => {
    const { container } = renderRow(rec([
      { type: 'gene', name: 'oi', start: 5, end: 100, strand: 1,
        segments: [{ start: 58, end: 100 }, { start: 5, end: 30 }] },
    ]));
    expect(connectors(container)).toHaveLength(2); // wrap halves, not one long line
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/app/viewer/__tests__/Row.test.tsx
```

Expected: FAIL — `expected 1 to have length 2`. The single connector is the bp 30→58 line straight through the middle of the genome.

- [ ] **Step 3: Widen the gate**

In `src/app/viewer/Row.tsx`, change:

```tsx
                  if (f.start > f.end && s1.end > s2.start) {
```

to:

```tsx
                  if ((f.start > f.end || s1.end >= seq.length) && s1.end > s2.start) {
```

`seq` is the record's own sequence, already in scope at `Row.tsx:72`. Do **not** use `alignmentLength`, which is the maximum across records in aligned mode.

Update the comment above the gate to:

```tsx
                  // parseLocation sets a descending envelope only for a vetted origin
                  // wrap, so trust it over pair order: a scattered join descends too.
                  // It cannot mark a crossing when no segment starts at base 1, so a
                  // block reaching the sequence end is evidence of one as well.
```

Do not describe frameshift or minus-strand joins as descending — a frameshift join
ascends with an overlap, and `complement(join(10..20,30..40))` ascends (see
`locationParser.test.ts:233-238`). Only the scattered/trans-spliced shape descends.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/app/viewer/__tests__/Row.test.tsx
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/viewer/Row.tsx src/app/viewer/__tests__/Row.test.tsx
git commit -m "fix(viewer): treat a segment reaching the sequence end as an origin crossing (#80)"
```

---

### Task 5: Remove the dead bindings, run the gates, open the PR

`firstSeg` and `lastSeg` at `Row.tsx:307-308` are assigned and never read — eslint reports both. They sit inside the block being rewritten, so this is the moment to drop them.

**Files:**
- Modify: `src/app/viewer/Row.tsx:307-308`

- [ ] **Step 1: Confirm they are unused**

```bash
grep -n "firstSeg\|lastSeg" src/app/viewer/Row.tsx
```

Expected: exactly two lines, both the declarations at 307-308. If either appears anywhere else, skip this task.

- [ ] **Step 2: Delete the two lines**

Remove:

```tsx
                const firstSeg = f.segments[0];
                const lastSeg = f.segments[f.segments.length - 1];
```

- [ ] **Step 3: Confirm the parser-level behaviour matches the spec**

This checks the arithmetic against real records. It exercises `parseLocation`
plus a local copy of the branch rule — it does **not** read `Row.tsx`, so it
cannot confirm the implementation. The unit tests above are the implementation
check.

```bash
cat > /tmp/verify80.mjs <<'EOF'
import { parseLocation } from '/tmp/dunceious-connector/src/core/genbank/locationParser.ts';
const decide = (f, s1, s2, len) => {
  if ((f.start > f.end || s1.end >= len) && s1.end > s2.start) return '2-part wrap';
  const gs = Math.min(s1.end, s2.end), ge = Math.max(s1.start, s2.start);
  return ge > gs ? `1 line ${gs}->${ge}` : 'nothing';
};
const cases = [
  ['rps12 CDS copy1',   'complement(join(97999..98024,98562..98793,69611..69724))', 154478],
  ['ORF1ab frameshift', 'join(266..13468,13468..21555)', 29903],
  ['D-loop wrap',       'complement(join(16024..16569,1..576))', 16569],
  ['origin+intron',     'join(5800..6000,50..300)', 6000],
  ['normal join',       'join(1..10,21..30)', 6000],
];
for (const [name, loc, len] of cases) {
  const r = parseLocation(loc);
  console.log(`${name}: ${r.segments.slice(0,-1).map((s1,i)=>decide(r,s1,r.segments[i+1],len)).join(' | ')}`);
}
EOF
npx tsx /tmp/verify80.mjs
rm -f /tmp/verify80.mjs
```

Expected output:

```
rps12 CDS copy1: 1 line 98024->98561 | 1 line 69724->98561
ORF1ab frameshift: nothing
D-loop wrap: 2-part wrap
origin+intron: 2-part wrap
normal join: 1 line 10->20
```

- [ ] **Step 4: Run the full gates**

```bash
npm run typecheck && npm run lint && npm run lint:headers && npm run test && npm run build
```

Expected: typecheck ok; lint 0 errors and **two fewer warnings** than baseline (the deleted bindings); headers 153/153; **642 tests pass** (637 baseline + 5 new); build succeeds.

- [ ] **Step 5: Commit and open the pull request**

```bash
git add src/app/viewer/Row.tsx
git commit -m "refactor(viewer): drop unused segment bindings (#80)"
git push -u origin fix/trans-splice-connector
gh pr create --base develop --head fix/trans-splice-connector \
  --title "fix(viewer): stop drawing a false origin wrap for out-of-order joins (#80)" \
  --body "Closes #80. Design: docs/superpowers/specs/2026-07-31-transsplice-connector-design.md"
```

---

## Notes for the implementer

- Do **not** introduce a second dash pattern or opacity for out-of-order pairs. `s1.end > s2.start` selects three unrelated phenomena (trans-splicing, frameshift joins, minus-strand joins written in transcription order), so styling it would assert biology that is not there. The spec covers this.
- Keep `strokeWidth={1} opacity={0.4} strokeDasharray="2,1"` exactly as-is. The tests select connectors with `line[stroke-dasharray="2,1"]`; changing the pattern silently breaks every existing assertion.
- The pre-existing `'draws the two-part wrap connector for an origin-spanning join'` test draws 2 connectors both before and after this change. It is a no-regression check, not a guard on the new gate — Task 3 is the guard.
- rps12 CDS copy 1 draws two connectors that overlap on `98024..98561`. That is expected; see the spec's Behaviour section.
