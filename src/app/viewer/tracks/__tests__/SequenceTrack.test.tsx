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
import * as d3 from 'd3';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, installCanvasRecorder, stubResizeObserver, type CanvasRecorder } from '@/src/app/testing/renderHarness';
import { SequenceTrack, type SequenceTrackProps } from '@/src/app/viewer/tracks/SequenceTrack';
import { parseFasta } from '@/src/core/formats/fasta';
import { Minimap } from '@/src/app/viewer/Minimap';

const ZOOM = 20; // > 12 so both translation and nucleotide glyphs draw

function props(seq: string): SequenceTrackProps {
  return {
    seq,
    moleculeType: 'dna',
    xScale: d3.scaleLinear().domain([0, seq.length]).range([0, seq.length * ZOOM]),
    viewportWidth: seq.length * ZOOM + 40, // whole sequence on screen
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

describe('Sequence rendering with RNA and protein', () => {
  let recorder: CanvasRecorder;
  beforeEach(() => { recorder = installCanvasRecorder(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('draws the early-stop "!" glyph for a broken CDS (internal TAG stop)', () => {
    // ATG TAG GAG — the TAG stop is not the last codon → broken protein.
    render(<SequenceTrack {...props('ATGTAGGAG')} />);
    expect(recorder.texts()).toContain('!');
    expect(recorder.texts()).toContain('M'); // start codon still drawn
  });

  it('does not draw "!" for a valid CDS', () => {
    render(<SequenceTrack {...props('ATGCCCGAG')} />);
    expect(recorder.texts()).not.toContain('!');
    // Per-codon AA letters, not just the start residue: M(ATG) P(CCC) E(GAG). Pins
    // the draw loop's codon→residue mapping so an internal sense-codon mislabel fails.
    expect(recorder.texts()).toEqual(expect.arrayContaining(['M', 'P', 'E']));
  });

  it('renders RNA translation and flags an internal UAG stop', () => {
    const [record] = parseFasta('>rna\nAUGUAGGAG');
    render(<SequenceTrack {...props(record.sequence)} moleculeType={record.moleculeType} />);
    expect(recorder.texts()).toEqual(expect.arrayContaining(['M', '!', 'E']));
    expect(recorder.texts()).not.toContain('?');
  });

  it.each([20, 2, 0.25])('renders U like T at zoom %s without changing the glyph', (zoomLevel) => {
    const [record] = parseFasta('>rna\nTu');
    const trackProps = props(record.sequence);
    render(<SequenceTrack {...trackProps} moleculeType={record.moleculeType} showTranslation={false}
      zoomLevel={zoomLevel} xScale={d3.scaleLinear().domain([0, 2]).range([0, 2 * zoomLevel])} />);
    expect(recorder.fillColors().length).toBeGreaterThan(0);
    expect(recorder.fillColors().every(color => color === '#f43f5e')).toBe(true);
    if (zoomLevel > 12) expect(recorder.texts()).toEqual(['T', 'u']);
  });

  it('uses protein colours and preserves selenocysteine U in a protein track', () => {
    render(<SequenceTrack {...props('TU')} moleculeType="protein" showTranslation={false} />);
    expect(recorder.texts()).toEqual(['T', 'U']);
    expect(recorder.fillColors()).toEqual(['#22c55e', '#94a3b8']);
  });

  it('uses the same U/T colour in the minimap preview', () => {
    stubResizeObserver();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
    const [record] = parseFasta('>rna\nTuUt');
    const legacyScrollProps = { horizontalScrollRef: { current: null } };
    render(<Minimap {...legacyScrollProps} records={[record]} consensus={record.sequence} alignmentLength={4}
      containerWidth={300} viewportWidth={100} scrollX={0} zoomLevel={20} fitZoom={20}
      searchResults={[]} currentSearchIdx={-1} onZoomChange={() => {}} />);
    // The preview samples positions 0 (T) and 2 (U).
    expect(recorder.fillColors().filter(color => color === '#f43f5e')).toHaveLength(2);
  });
});


describe('unknown CDS direction', () => {
  it('shows reference bases without synthesizing a forward translation', () => {
    const recorder = installCanvasRecorder();
    const input = props('ATGCCCGAG');
    input.features[0].metadata = { _gffStrand: '?' };
    render(<SequenceTrack {...input} />);
    expect(recorder.texts().join('')).toBe('ATGCCCGAG');
  });
});


describe('aligned CDS translation', () => {
  it('renders codons across gaps in the same biological frame', () => {
    const recorder = installCanvasRecorder();
    const seq = '--A-TG-AAA-TAA--';
    const { container } = render(<SequenceTrack {...props(seq)} features={[{ type: 'CDS', name: 'gapped', start: 2, end: 14, strand: 1,
      segments: [{ start: 2, end: 14 }] }]} />);
    expect(recorder.texts().slice(-3)).toEqual(['M', 'K', '_']);
    expect(recorder.fillRects().slice(-3)).toEqual([[40, 0, 80, 18], [140, 0, 60, 18], [220, 0, 60, 18]]);
    expect(container.querySelector<HTMLCanvasElement>('.translation-band')?.style.transform).toBe('translateY(46px)');
  });
});


describe('translation zoom boundary', () => {
  it.each([4.99, 5, 5.01])('draws translation only above the boundary at zoom %s', (zoomLevel) => {
    const recorder = installCanvasRecorder();
    const { container } = render(<SequenceTrack {...props('ATG')} zoomLevel={zoomLevel} />);
    expect(recorder.texts().includes('M')).toBe(zoomLevel > 5);
    const band = container.querySelector<HTMLElement>('.translation-band');
    expect(band?.style.opacity).toBe(zoomLevel > 5 ? '1' : '0');
  });

  it('does not translate protein records even when the toggle is on', () => {
    const recorder = installCanvasRecorder();
    render(<SequenceTrack {...props('ATG')} moleculeType="protein" />);
    expect(recorder.texts()).toEqual(['A', 'T', 'G']);
  });

  it('keeps low-zoom search highlights within the nucleotide band', () => {
    const recorder = installCanvasRecorder();
    const hit = { recordId: 'r', start: 0, end: 3, strand: 1 as const, sequence: 'ATG' };
    render(<SequenceTrack {...props('ATG')} zoomLevel={5} searchResults={[hit]} />);
    expect(recorder.fillRects()[0][3]).toBe(22);
  });
});


it('retains both translation canvases for the closing fade without drawing at low zoom', () => {
  const recorder = installCanvasRecorder();
  const input = props('ATG');
  const { container, rerender } = render(<SequenceTrack {...input} zoomLevel={6} y={54} />);
  const bands = [...container.querySelectorAll<HTMLCanvasElement>('.translation-band')];
  expect(bands).toHaveLength(2);
  expect(bands.map(b => b.style.transform)).toEqual(['translateY(0px)', 'translateY(76px)']);
  expect(recorder.texts()).toEqual(['M']);
  rerender(<SequenceTrack {...input} zoomLevel={5} y={0} />);
  expect([...container.querySelectorAll('.translation-band')]).toEqual(bands);
  expect(bands.map(b => b.style.opacity)).toEqual(['0', '0']);
  expect(recorder.texts()).toEqual(['M']);
  expect(container.querySelector('[data-sequence-band]')?.classList.contains('translation-motion')).toBe(true);
});
