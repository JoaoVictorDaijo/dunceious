# Component / Canvas Render Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the repo's first React component/canvas render tests, covering the `SequenceTrack` early-stop `!` glyph, the `Row` join/wrap SVG connectors, and the `DatabaseHubPanel` CIRCULAR badge + header count.

**Architecture:** Stand up a small shared test harness (`@testing-library/react` + jsdom, opted in per-file via a `// @vitest-environment jsdom` docblock, plus a hand-rolled canvas-2D recorder) and write three render-test files that assert on *semantic drawn output* — which glyphs/dashed-lines/text appear — never pixel coordinates.

**Tech Stack:** vitest 4, `@testing-library/react` 16 + `@testing-library/dom` 10, jsdom 29, React 19, d3, react-window.

**Spec:** `docs/superpowers/specs/2026-07-21-component-render-tests-design.md`

**Working directory:** the `test/68-render-tests` worktree at `/tmp/dunceious-render-tests`.

---

## File Structure

- Modify: `package.json` — add three devDependencies.
- Create: `src/app/testing/renderHarness.tsx` — shared render + canvas-recorder + ResizeObserver-stub harness. Lives outside every coverage `include` glob, so it is never measured.
- Create: `src/app/testing/__tests__/renderHarness.test.tsx` — proves the jsdom + TL + recorder stack works in isolation before real components.
- Create: `src/app/viewer/tracks/__tests__/SequenceTrack.test.tsx` — canvas early-stop `!` glyph.
- Create: `src/app/viewer/__tests__/Row.test.tsx` — SVG join/wrap connectors + feature circular-wrap.
- Create: `src/app/components/__tests__/DatabaseHubPanel.test.tsx` — CIRCULAR badge + header count.

All test files sit in `__tests__/` directories (caught by the coverage `exclude` glob). Each new file gets the AGPL header via the repo's own tool (`node scripts/check-license-headers.mjs --fix`), which inserts the header at the very top — above the `// @vitest-environment jsdom` docblock, which vitest 4 still finds because it matches the pragma against the whole file.

**Note on TDD for these tests:** the harness (Task 2) is genuine red→green TDD. The three component tests (Tasks 3–5) are *regression* tests over behavior that already exists, so they pass on first run. Each file therefore includes an explicit **non-vacuity check** — flip one assertion, confirm it FAILS, revert — so we know the test actually exercises the path. Paired opposite-case assertions (broken vs valid; join vs wrap) reinforce this.

---

## Task 1: Add test dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the three devDependencies**

Edit the `devDependencies` block of `package.json` to add these three entries (keep the block alphabetically sorted, matching the existing style):

```json
    "@testing-library/dom": "^10.4.1",
    "@testing-library/react": "^16.3.2",
    "jsdom": "^29.1.1",
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: completes without error; `package-lock.json` updates.

- [ ] **Step 3: Verify the packages resolve with no broken peers**

Run: `npm ls @testing-library/react @testing-library/dom jsdom`
Expected: all three listed at the installed versions, no `UNMET PEER DEPENDENCY` / `invalid` markers.

- [ ] **Step 4: Confirm the existing suite is still green (deps didn't disturb it)**

Run: `npm run test`
Expected: PASS — same suite as before (no new tests yet).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(test): add @testing-library/react + jsdom for render tests (#68)"
```

---

## Task 2: Render harness + smoke test (red → green)

**Files:**
- Create: `src/app/testing/renderHarness.tsx`
- Test: `src/app/testing/__tests__/renderHarness.test.tsx`

- [ ] **Step 1: Write the failing smoke test**

Create `src/app/testing/__tests__/renderHarness.test.tsx` with this content (no license header yet — added in Step 4):

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, installCanvasRecorder, stubResizeObserver } from '../renderHarness';

describe('renderHarness', () => {
  it('records canvas fillText via installCanvasRecorder', () => {
    const recorder = installCanvasRecorder();
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillText('X', 1, 2);
    expect(recorder.texts()).toEqual(['X']);
  });

  it('renders a React component into the document', () => {
    const { getByText } = render(<div>hello-harness</div>);
    expect(getByText('hello-harness')).toBeTruthy();
  });

  it('provides a no-op ResizeObserver via stubResizeObserver', () => {
    stubResizeObserver();
    const RO = (globalThis as { ResizeObserver?: new (cb: () => void) => unknown }).ResizeObserver!;
    expect(() => new RO(() => {})).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- src/app/testing/__tests__/renderHarness.test.tsx`
Expected: FAIL — cannot resolve `../renderHarness` (module does not exist yet).

- [ ] **Step 3: Write the harness**

Create `src/app/testing/renderHarness.tsx` with this content (no license header yet — added in Step 4):

```tsx
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Re-export the full testing-library surface (render, screen, within, fireEvent, …)
// so tests import everything from one place.
export * from '@testing-library/react';

// The project does not enable `globals: true`, so testing-library's own
// auto-cleanup (which only fires when a global `afterEach` exists) never runs.
// Register it explicitly; imported here, it binds to each test file that imports
// the harness.
afterEach(cleanup);

export interface CanvasRecorder {
  /** Ordered arguments passed to ctx.fillText — the glyphs/letters drawn. */
  texts(): string[];
  /** Ordered [x, y, w, h] tuples passed to ctx.fillRect. */
  fillRects(): Array<[number, number, number, number]>;
}

/**
 * Replace HTMLCanvasElement.prototype.getContext with a recording 2D context.
 * Records fillText / fillRect; every other method is a no-op and every property
 * assignment (fillStyle, font, …) is ignored, so no draw call can throw. Call
 * once per test (returns a fresh recorder). Vitest isolates test files, so the
 * prototype patch does not leak across files.
 */
export function installCanvasRecorder(): CanvasRecorder {
  const texts: string[] = [];
  const fillRects: Array<[number, number, number, number]> = [];

  const ctx = new Proxy(
    {
      fillText: (t: unknown) => { texts.push(String(t)); },
      fillRect: (x: number, y: number, w: number, h: number) => { fillRects.push([x, y, w, h]); },
    } as Record<string, unknown>,
    {
      get(target, prop) {
        return prop in target ? target[prop as string] : () => {};
      },
      set() { return true; },
    },
  );

  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];

  return { texts: () => texts, fillRects: () => fillRects };
}

/** jsdom has no ResizeObserver; install a no-op so components that construct one render. */
export function stubResizeObserver(): void {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
```

- [ ] **Step 4: Add the AGPL header to both new files**

Run: `node scripts/check-license-headers.mjs --fix`
Then run: `npm run lint:headers`
Expected: PASS. Confirm the top of each file now reads (header first, docblock second):

```tsx
/*
 * Dunceious
 * ... (AGPL header) ...
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
```

(The harness file has the header only — no docblock; it inherits the jsdom env of whichever test file imports it.)

- [ ] **Step 5: Run the smoke test to confirm it passes**

Run: `npm run test -- src/app/testing/__tests__/renderHarness.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/testing/renderHarness.tsx src/app/testing/__tests__/renderHarness.test.tsx
git commit -m "test(harness): jsdom + testing-library + canvas recorder (#68)"
```

---

## Task 3: SequenceTrack canvas render test

**Files:**
- Test: `src/app/viewer/tracks/__tests__/SequenceTrack.test.tsx`

- [ ] **Step 1: Write the test**

Create `src/app/viewer/tracks/__tests__/SequenceTrack.test.tsx` (no header yet — added in Step 3):

```tsx
// @vitest-environment jsdom
import * as d3 from 'd3';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, installCanvasRecorder, type CanvasRecorder } from '@/src/app/testing/renderHarness';
import { SequenceTrack, type SequenceTrackProps } from '@/src/app/viewer/tracks/SequenceTrack';

const ZOOM = 20; // > 12 so both translation and nucleotide glyphs draw

function props(seq: string): SequenceTrackProps {
  return {
    seq,
    moleculeType: 'dna',
    xScale: d3.scaleLinear().domain([0, seq.length]).range([0, seq.length * ZOOM]),
    viewportWidth: seq.length * ZOOM + 40, // whole sequence on screen
    height: 200,
    y: 100,
    zoomLevel: ZOOM,
    scrollX: 0,
    showTranslation: true,
    features: [{ type: 'CDS', name: 'cds', start: 0, end: seq.length, strand: 1 }],
    searchResults: [],
    allSearchResults: [],
    currentSearchIdx: -1,
  };
}

describe('SequenceTrack translation glyphs', () => {
  let recorder: CanvasRecorder;
  beforeEach(() => { recorder = installCanvasRecorder(); });

  it('draws the early-stop "!" glyph for a broken CDS (internal TAG stop)', () => {
    // ATG TAG GAG — the TAG stop is not the last codon → broken protein.
    render(<SequenceTrack {...props('ATGTAGGAG')} />);
    expect(recorder.texts()).toContain('!');
    expect(recorder.texts()).toContain('M'); // start codon still drawn
  });

  it('does not draw "!" for a valid CDS', () => {
    render(<SequenceTrack {...props('ATGCCCGAG')} />);
    expect(recorder.texts()).not.toContain('!');
  });
});
```

- [ ] **Step 2: Run to confirm it passes**

Run: `npm run test -- src/app/viewer/tracks/__tests__/SequenceTrack.test.tsx`
Expected: PASS (2 tests). (This is a regression test; the behavior already exists.)

- [ ] **Step 3: Add the AGPL header**

Run: `node scripts/check-license-headers.mjs --fix && npm run lint:headers`
Expected: PASS.

- [ ] **Step 4: Non-vacuity check**

Temporarily change `expect(recorder.texts()).toContain('!')` to `.not.toContain('!')`.
Run: `npm run test -- src/app/viewer/tracks/__tests__/SequenceTrack.test.tsx`
Expected: FAIL on that assertion (proves the test truly observes the drawn `!`).
Then **revert** the change and re-run — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/viewer/tracks/__tests__/SequenceTrack.test.tsx
git commit -m "test(viewer): SequenceTrack early-stop ! glyph render (#68)"
```

---

## Task 4: Row SVG connectors + circular-wrap test

**Files:**
- Test: `src/app/viewer/__tests__/Row.test.tsx`

Connectors are `<line stroke-dasharray="2,1">` in the feature color; the SVG's background grid lines have **no** dasharray, so the scoped selector isolates connectors. Feature glyphs are `<rect rx="4">`. Fixtures use a **non-CDS** type (`gene`) so `computeBrokenFeatureMap` never flags them (Row runs it unguarded), keeping the SVG free of the broken-CDS `stroke-dasharray="3,2"` rect. `installCanvasRecorder()` runs in `beforeEach` only to silence jsdom's "getContext not implemented" noise from Row's inner `SequenceTrack` (its output is not asserted).

- [ ] **Step 1: Write the test**

Create `src/app/viewer/__tests__/Row.test.tsx` (no header yet — added in Step 3):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, installCanvasRecorder } from '@/src/app/testing/renderHarness';
import { Row, type RowData } from '@/src/app/viewer/Row';
import { computeRecordLayouts } from '@/src/app/viewer/layout';
import type { SeqRecord, BioFeature } from '@/src/domain/bio/types';

const ZOOM = 8;
const LEN = 100;

function rec(features: BioFeature[]): SeqRecord {
  return { id: 'r', name: 'r', sequence: 'A'.repeat(LEN), features } as SeqRecord;
}

function rowData(record: SeqRecord): RowData {
  const [layout] = computeRecordLayouts([record], {
    showAnnotations: true,
    showTranslation: false,
    showTracks: false,
  });
  return {
    recordLayouts: [layout],
    alignmentLength: LEN,
    scrollX: 0,
    zoomLevel: ZOOM,
    viewportWidth: LEN * ZOOM + 40, // whole record on screen
    persistentSelection: null,
    showAnnotations: true, // gates annotation rendering, separate from the layout opt
    showTranslation: false,
    searchResultsByRecord: {},
    searchResults: [],
    currentSearchIdx: -1,
    onSelectionChange: () => {},
    onContextMenu: () => {},
    onViewDetails: () => {},
    setTooltip: () => {},
    showConservation: false,
    conservationScores: [],
    quantValueRanges: {},
    showTracks: false,
  };
}

function renderRow(record: SeqRecord) {
  return render(<Row index={0} style={{}} data={rowData(record)} />);
}

const connectors = (c: HTMLElement) => c.querySelectorAll('line[stroke-dasharray="2,1"]');
const glyphs = (c: HTMLElement) => c.querySelectorAll('rect[rx="4"]');

describe('Row feature drawing', () => {
  beforeEach(() => { installCanvasRecorder(); }); // silence inner-canvas getContext noise

  it('draws one connector between the two parts of a normal join feature', () => {
    const { container } = renderRow(rec([
      { type: 'gene', name: 'j', start: 0, end: 30, strand: 1,
        segments: [{ start: 0, end: 10 }, { start: 20, end: 30 }] },
    ]));
    expect(glyphs(container)).toHaveLength(2);     // one rect per segment
    expect(connectors(container)).toHaveLength(1); // one dashed connector
  });

  it('draws the two-part wrap connector for an origin-spanning join', () => {
    const { container } = renderRow(rec([
      { type: 'gene', name: 'w', start: 80, end: 20, strand: 1,
        segments: [{ start: 80, end: 95 }, { start: 5, end: 20 }] },
    ]));
    expect(glyphs(container)).toHaveLength(2);
    expect(connectors(container)).toHaveLength(2); // wrap draws both halves
  });

  it('draws a feature circular-wrap (start > end) as two rects, no connector', () => {
    const { container } = renderRow(rec([
      { type: 'gene', name: 'c', start: 90, end: 10, strand: 1 }, // no segments
    ]));
    expect(glyphs(container)).toHaveLength(2);     // p1 + p2 two-part draw
    expect(connectors(container)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to confirm it passes**

Run: `npm run test -- src/app/viewer/__tests__/Row.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 3: Add the AGPL header**

Run: `node scripts/check-license-headers.mjs --fix && npm run lint:headers`
Expected: PASS.

- [ ] **Step 4: Non-vacuity check**

Temporarily change the wrap test's `.toHaveLength(2)` on `connectors` to `.toHaveLength(1)`.
Run: `npm run test -- src/app/viewer/__tests__/Row.test.tsx`
Expected: FAIL (proves the wrap path really draws two connectors, distinguishing it from the normal join's one).
Then **revert** and re-run — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/viewer/__tests__/Row.test.tsx
git commit -m "test(viewer): Row join/wrap connectors + circular-wrap draw (#68)"
```

---

## Task 5: DatabaseHubPanel DOM test

**Files:**
- Test: `src/app/components/__tests__/DatabaseHubPanel.test.tsx`

The circular record is placed **first** so its header (with the CIRCULAR badge) is flattened item 0 → react-window row 0, guaranteeing it renders. The header count lives outside the virtualized list and is the independent anchor. `flattenedFeatures` comes from the real `buildFlattenedFeatures` helper.

- [ ] **Step 1: Write the test**

Create `src/app/components/__tests__/DatabaseHubPanel.test.tsx` (no header yet — added in Step 3):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, stubResizeObserver } from '@/src/app/testing/renderHarness';
import DatabaseHubPanel, { type DatabaseHubPanelProps } from '@/src/app/components/DatabaseHubPanel';
import { buildFlattenedFeatures } from '@/src/app/logic/featureManager';
import type { SeqRecord, BioFeature } from '@/src/domain/bio/types';

function rec(over: Partial<SeqRecord> & Pick<SeqRecord, 'id'>, features: BioFeature[]): SeqRecord {
  return { name: over.id, sequence: 'A'.repeat(50), features, ...over } as SeqRecord;
}

const records: SeqRecord[] = [
  rec({ id: 'circ', name: 'Circular One', isCircular: true },
    [{ type: 'gene', name: 'g1', start: 0, end: 10, strand: 1 }]),
  rec({ id: 'lin', name: 'Linear Two' },
    [{ type: 'gene', name: 'g2', start: 0, end: 10, strand: 1 },
     { type: 'gene', name: 'g3', start: 20, end: 30, strand: 1 }]),
];
const allFeaturesCount = records.reduce((a, r) => a + r.features.length, 0); // 3

const noop = () => {};
function panelProps(): DatabaseHubPanelProps {
  return {
    records,
    flattenedFeatures: buildFlattenedFeatures(records, ''),
    allFeaturesCount,
    featureSearch: '',
    onFeatureSearchChange: noop,
    featureColors: {},
    activeSelection: null,
    onStartNewFeature: noop,
    onToggleRecordVisibility: noop,
    onRemoveRecord: noop,
    onViewFeatureDetails: noop,
    onEditFeature: noop,
    onRemoveFeature: noop,
    onFocusItem: noop,
    onExportAllFasta: noop,
    onExportGenBank: noop,
    onExportGff: noop,
    onExportProjectJson: noop,
    onClearAll: noop,
    addLog: noop,
  };
}

describe('DatabaseHubPanel', () => {
  beforeEach(() => { stubResizeObserver(); });

  it('renders the header as "{n} Sequences • {m} Annotations"', () => {
    render(<DatabaseHubPanel {...panelProps()} />);
    // React splits the interpolation into sibling text nodes → match with a regex.
    expect(screen.getByText(/2\s+Sequences\s+•\s+3\s+Annotations/)).toBeTruthy();
  });

  it('renders a CIRCULAR badge for a circular record', () => {
    render(<DatabaseHubPanel {...panelProps()} />);
    expect(screen.getByText('CIRCULAR')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to confirm it passes**

Run: `npm run test -- src/app/components/__tests__/DatabaseHubPanel.test.tsx`
Expected: PASS (2 tests). If the CIRCULAR-badge test fails because react-window did not mount row 0, that is the R5 risk materializing — the header test still passes; keep it and raise the badge behavior for discussion rather than weakening the header assertion.

- [ ] **Step 3: Add the AGPL header**

Run: `node scripts/check-license-headers.mjs --fix && npm run lint:headers`
Expected: PASS.

- [ ] **Step 4: Non-vacuity check**

Temporarily change the header regex to `/2\s+Sequences\s+•\s+99\s+Annotations/`.
Run: `npm run test -- src/app/components/__tests__/DatabaseHubPanel.test.tsx`
Expected: FAIL (proves the assertion reads the real rendered count).
Then **revert** and re-run — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/__tests__/DatabaseHubPanel.test.tsx
git commit -m "test(hub): DatabaseHubPanel CIRCULAR badge + header count (#68)"
```

---

## Task 6: Full green gate + PR

**Files:** none (verification + integration).

- [ ] **Step 1: Run the whole gate**

Run each and confirm PASS:
- `npm run typecheck`
- `npm run lint`
- `npm run lint:headers`
- `npm run test`
- `npm run build`

- [ ] **Step 2: Confirm the coverage ratchet still passes (the Non-goal proof)**

Run: `npm run test:coverage`
Expected: PASS — thresholds (lines 95 / branches 87 / functions 94 / statements 93) still met. This proves the three SUTs stayed out of the coverage report (they are absent from the coverage `include` allowlist), as the spec's Non-goals require. If a threshold *rose* because the render tests exercised included files (`layout.ts`, `featureManager.ts`), that is fine — coverage only moves up.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin test/68-render-tests
```

- [ ] **Step 4: Open the PR against `develop`**

```bash
gh pr create --base develop --title "test: component/canvas render tests for sequence & Hub views (#68)" --body "$(cat <<'EOF'
Closes #68.

Adds the repo's first React component/canvas render tests.

## What
- **Harness** (`src/app/testing/renderHarness.tsx`): `@testing-library/react` + jsdom (per-file `@vitest-environment` docblock) + a hand-rolled canvas-2D recorder + a `ResizeObserver` stub. Kept out of the coverage `include` allowlist so it is never measured.
- **SequenceTrack** (canvas): asserts the early-stop `!` glyph is drawn for a broken CDS and *not* for a valid one.
- **Row** (SVG): asserts the join connector (1 dashed line), the origin-spanning wrap connector (2), and the feature circular-wrap two-part draw (2 rects, no connector). Selectors are scoped to connector/glyph attributes so the background grid lines don't skew counts.
- **DatabaseHubPanel** (DOM): asserts the `CIRCULAR` badge and the `"{n} Sequences • {m} Annotations"` header.

## Non-goals
No coverage-config change (SUTs are not added to `include`); no interaction/event tests; no snapshots. Ratchet still green via `npm run test:coverage`.

Design + plan: `docs/superpowers/specs/2026-07-21-component-render-tests-design.md`, `docs/superpowers/plans/2026-07-21-component-render-tests.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Report the PR URL back for review.**
