/*
 * Dunceious
 *
 * This file is part of Dunceious.
 *
 * Dunceious is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Dunceious is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Dunceious.  If not, see <https://www.gnu.org/licenses/>.
 */

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

function rowData(record: SeqRecord, overrides: Partial<RowData> = {}): RowData {
  const [layout] = computeRecordLayouts([record], {
    showAnnotations: true,
    showTranslation: false,
    showTracks: false,
    basesVisible: (overrides.zoomLevel ?? ZOOM) > 12,
  });
  const base: RowData = {
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
  return { ...base, ...overrides };
}

function renderRow(record: SeqRecord, overrides: Partial<RowData> = {}) {
  return render(<Row index={0} style={{}} data={rowData(record, overrides)} />);
}

const connectors = (c: HTMLElement) => c.querySelectorAll('line[stroke-dasharray="2,1"]');
const glyphs = (c: HTMLElement) => c.querySelectorAll('path[data-annotation-part]');

// xScale interpolates in floating point, so a bp can land a hair off its exact
// pixel and match neither a string nor a float comparison; round before comparing.
const spanOf = (line: Element) =>
  [line.getAttribute('x1'), line.getAttribute('x2')].map(v => Math.round(Number(v)));

const spanOfRect = (rect: Element) => {
  const x = Number(rect.getAttribute('data-x'));
  return [x, x + Number(rect.getAttribute('data-width'))].map(v => Math.round(v));
};

beforeEach(() => { installCanvasRecorder(); }); // silence inner-canvas getContext noise

describe('Row feature drawing', () => {

  it('draws one connector between the two parts of a normal join feature', () => {
    const { container } = renderRow(rec([
      { type: 'gene', name: 'j', start: 0, end: 30, strand: 1,
        segments: [{ start: 0, end: 10 }, { start: 20, end: 30 }] },
    ]));
    expect(glyphs(container)).toHaveLength(2);     // one rect per segment
    expect(connectors(container)).toHaveLength(1); // one dashed connector

    const [line] = Array.from(connectors(container));
    expect(spanOf(line)).toEqual([10 * ZOOM, 20 * ZOOM]);
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

  it('ends a non-segmented wrap at the record, not the alignment width', () => {
    const { container } = renderRow(
      rec([{ type: 'gene', name: 'aw', start: 90, end: 10, strand: 1 }]),
      { alignmentLength: LEN * 2, viewportWidth: LEN * 2 * ZOOM + 40 },
    );
    expect(glyphs(container)).toHaveLength(2);

    const [p1] = Array.from(glyphs(container));
    expect(spanOfRect(p1)).toEqual([90 * ZOOM, LEN * ZOOM]);
  });
});

describe('Row segment connectors', () => {
  // rps12 shape: segments descend, but no segment starts at the origin, so
  // parseLocation gives it a linear envelope — descent alone must not draw a wrap.
  it('draws one connector across the gap of a descending join', () => {
    const { container } = renderRow(rec([
      { type: 'gene', name: 'ts', start: 10, end: 90, strand: 1,
        segments: [{ start: 70, end: 90 }, { start: 10, end: 30 }] },
    ]));
    expect(glyphs(container)).toHaveLength(2);
    expect(connectors(container)).toHaveLength(1);

    const [line] = Array.from(connectors(container));
    expect(spanOf(line)).toEqual([30 * ZOOM, 70 * ZOOM]);
  });

  // ORF1ab's ribosomal frameshift overlaps segments by one base; like an exact
  // abutment, there is no gap to bridge.
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

  // A circular feature with an ordinary intron before the origin: the interior
  // pair is a normal gap, only the crossing pair is a wrap.
  it('wraps only the crossing pair of a multi-segment circular feature', () => {
    const { container } = renderRow(rec([
      { type: 'gene', name: 'w3', start: 80, end: 20, strand: 1,
        segments: [{ start: 80, end: 90 }, { start: 92, end: 95 }, { start: 5, end: 20 }] },
    ]));
    expect(glyphs(container)).toHaveLength(3); // one rect per segment
    // A bare count of 3 also fits wrapping the interior pair instead, so pin
    // each span: the interior gap stays ordinary, only the last pair wraps.
    const spans = Array.from(connectors(container)).map(spanOf);
    expect(spans).toHaveLength(3);
    expect(spans).toContainEqual([90 * ZOOM, 92 * ZOOM]);
    expect(spans).toContainEqual([95 * ZOOM, LEN * ZOOM]);
    expect(spans).toContainEqual([0, 5 * ZOOM]);
  });

  // Crossing the origin inside an intron. The envelope is linear, so the first
  // segment ending on the last base is the only evidence of the crossing.
  it('wraps a linear-envelope feature whose first segment reaches the sequence end', () => {
    const { container } = renderRow(rec([
      { type: 'gene', name: 'oi', start: 5, end: LEN, strand: 1,
        segments: [{ start: 58, end: LEN }, { start: 5, end: 30 }] },
    ]));
    const spans = Array.from(connectors(container)).map(spanOf);
    expect(spans).toContainEqual([0, 5 * ZOOM]);
    expect(spans).not.toContainEqual([30 * ZOOM, 58 * ZOOM]);
  });

  // A record shorter than the alignment it sits in: the origin the wrap runs to
  // is the record's own last base, so the half must stop there, not at the
  // alignment width it shares with longer records.
  it("draws the wrap to the record's own end, not the alignment width", () => {
    const { container } = renderRow(rec([
      { type: 'gene', name: 'aw', start: 80, end: 20, strand: 1,
        segments: [{ start: 80, end: 95 }, { start: 5, end: 20 }] },
    ]), { alignmentLength: LEN * 2, viewportWidth: LEN * 2 * ZOOM + 40 });
    const spans = Array.from(connectors(container)).map(spanOf);
    expect(spans).toContainEqual([95 * ZOOM, LEN * ZOOM]);
  });
});


describe('annotation bases preserve segment geometry', () => {
  it('draws bases only inside segments, using each segment strand', () => {
    const r = rec([{ name: 'Mixed synthetic', type: 'misc_feature', start: 0, end: 8, strand: 1, metadata: { _showBases: '1' },
      segments: [{ start: 0, end: 2, strand: 1 }, { start: 6, end: 8, strand: -1 }] }]);
    r.sequence = 'AACCTTGA';
    const { container } = renderRow(r, { zoomLevel: 30 });
    const letters = [...container.querySelectorAll('[data-annotation-base]')];
    expect(letters.map(t => Number(t.getAttribute('data-annotation-base')))).toEqual([0, 1, 6, 7]);
    expect(letters.map(t => t.textContent).join('')).toBe('AACT');
    expect(connectors(container)).toHaveLength(1);
  });
  it('draws both parts of a circular reverse feature on their original coordinates', () => {
    const r = rec([{ name: 'Circular synthetic', type: 'primer', start: 6, end: 2, strand: -1, metadata: { _showBases: '1' } }]);
    r.sequence = 'AACCTTGA';
    const { container } = renderRow(r, { zoomLevel: 30 });
    const letters = [...container.querySelectorAll('[data-annotation-base]')];
    expect(letters.map(t => Number(t.getAttribute('data-annotation-base')))).toEqual([6, 7, 0, 1]);
    expect(letters.map(t => t.textContent).join('')).toBe('CTTT');
  });
});

describe('thin annotation bars', () => {
  const d = (c: HTMLElement) => [...c.querySelectorAll('path[data-annotation-part]')].map(p => p.getAttribute('d') ?? '');

  it('points a forward bar right, a reverse bar left, and leaves an unstranded bar square', () => {
    const { container } = renderRow(rec([
      { type: 'gene', name: 'f', start: 0, end: 20, strand: 1 },
      { type: 'gene', name: 'r', start: 40, end: 60, strand: -1 },
      { type: 'gene', name: 'u', start: 70, end: 90, strand: 1, metadata: { _gffStrand: '.' } },
    ]));
    const [fwd, rev, flat] = d(container);
    expect(fwd).toMatch(/L160,/); // tip at the right edge (20 bp × 8 px)
    expect(rev).toMatch(/L320,/); // tip at the left edge (40 bp × 8 px)
    expect(flat).not.toMatch(/L/);
  });

  it('puts the arrow head only on the last piece of a joined feature', () => {
    const { container } = renderRow(rec([
      { type: 'CDS', name: 'j', start: 0, end: 60, strand: 1, segments: [{ start: 0, end: 20 }, { start: 40, end: 60 }] },
    ]));
    const [first, last] = d(container);
    expect(first).not.toMatch(/L/);
    expect(last).toMatch(/L480,/);
  });

  it('opens an opted-in bar only at a legible zoom, with its bases inside the bar', () => {
    const opted: BioFeature = { type: 'gene', name: 'o', start: 0, end: 4, strand: 1, metadata: { _showBases: '1' } };
    const closed = renderRow(rec([opted]), { zoomLevel: 8 });
    expect(closed.container.querySelectorAll('[data-annotation-base]')).toHaveLength(0);
    expect(d(closed.container)[0]).toMatch(/L32,7L/); // tip at mid-height of the 14 px thin bar
    closed.unmount();

    const open = renderRow(rec([opted]), { zoomLevel: 30 });
    expect(open.container.querySelectorAll('[data-annotation-base]')).toHaveLength(4);
    expect(d(open.container)[0]).toMatch(/L120,14L/); // tip mid-height of the 28 px open bar
  });
});

