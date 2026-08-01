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

    const [line] = Array.from(connectors(container));
    const span = [line.getAttribute('x1'), line.getAttribute('x2')].map(v => Math.round(Number(v)));
    expect(span).toEqual([10 * ZOOM, 20 * ZOOM]);
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
    const span = [line.getAttribute('x1'), line.getAttribute('x2')].map(v => Math.round(Number(v)));
    expect(span).toEqual([30 * ZOOM, 70 * ZOOM]);
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
    // 1 ordinary + 2 wrap halves
    expect(connectors(container)).toHaveLength(3);
  });

  // Crossing the origin inside an intron. The envelope is linear, so the first
  // segment ending on the last base is the only evidence of the crossing.
  it('wraps a linear-envelope feature whose first segment reaches the sequence end', () => {
    const { container } = renderRow(rec([
      { type: 'gene', name: 'oi', start: 5, end: LEN, strand: 1,
        segments: [{ start: 58, end: LEN }, { start: 5, end: 30 }] },
    ]));
    // Rounded: xScale renders bp 58 as 463.99999999999994, which no exact
    // string or float comparison against 58 * ZOOM would ever match.
    const spans = Array.from(connectors(container))
      .map(l => [l.getAttribute('x1'), l.getAttribute('x2')].map(v => Math.round(Number(v))));
    expect(spans).toContainEqual([0, 5 * ZOOM]);
    expect(spans).not.toContainEqual([30 * ZOOM, 58 * ZOOM]);
  });
});
