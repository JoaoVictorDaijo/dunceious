/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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
import { AA_ROW_HEIGHT } from '@/src/app/viewer/constants';
import { assignTranslationLanes } from '@/src/app/viewer/cds';
import type { BioFeature } from '@/src/domain/bio/types';

const ZOOM = 20; // > 12 so both translation and nucleotide glyphs draw

function props(seq: string, features: BioFeature[] = [{ type: 'CDS', name: 'cds', start: 0, end: seq.length, strand: 1 }]): SequenceTrackProps {
  return {
    seq,
    moleculeType: 'dna',
    xScale: d3.scaleLinear().domain([0, seq.length]).range([0, seq.length * ZOOM]),
    viewportWidth: seq.length * ZOOM + 40, // whole sequence on screen
    y: 100,
    zoomLevel: ZOOM,
    scrollX: 0,
    showTranslation: true,
    features,
    translationLanes: assignTranslationLanes(features, seq, 'dna'),
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

describe('ribosomal frameshift (−1 PRF)', () => {
  // ATG AAA | A CG GGT TAA: the join re-reads base 5, so K (bases 3–5) sits in
  // frame 0 and T (bases 5–7) in frame 2. Each codon belongs in its own row.
  const SEQ = 'ATGAAACGGGTTAA';
  const slip = (): SequenceTrackProps => props(SEQ, [{ type: 'CDS', name: 'pp1ab', start: 0, end: SEQ.length, strand: 1,
    segments: [{ start: 0, end: 6 }, { start: 5, end: SEQ.length }] }]);
  let recorder: CanvasRecorder;
  beforeEach(() => { recorder = installCanvasRecorder(); });

  it('draws each codon in the row of its own frame', () => {
    const { container } = render(<SequenceTrack {...slip()} />);
    const box = (x: number) => recorder.fillRects().find(([rx, , w]) => rx === x && w === 3 * ZOOM);
    expect(recorder.texts()).toEqual(expect.arrayContaining(['M', 'K', 'T', 'G']));
    // The two frames overlap at the slip, so the band holds two rows.
    expect(container.querySelector<HTMLElement>('.translation-band')?.style.height).toBe(`${AA_ROW_HEIGHT * 2}px`);
    expect(box(3 * ZOOM)?.[1]).toBe(AA_ROW_HEIGHT); // K: pre-slip frame, row next to the bases
    expect(box(5 * ZOOM)?.[1]).toBe(0);             // T: post-slip frame, the row above
  });

  it('outlines every amino-acid box in thin white, so stacked frames stay apart', () => {
    render(<SequenceTrack {...slip()} />);
    const aaBoxes = recorder.fillRects().filter(([, , w]) => w === 3 * ZOOM);
    expect(aaBoxes.length).toBeGreaterThan(0);
    const outlines = recorder.strokeRects().filter(s => s.color === '#fff' && s.width === 0.5).map(s => s.rect.join());
    for (const box of aaBoxes) expect(outlines).toContain(box.join());
  });

  // The rows abut, so a pill or connector here would cover the codons around
  // the junction; the shift is named on the annotation bar instead.
  it('draws no frameshift marker in the translation rows', () => {
    render(<SequenceTrack {...slip()} />);
    expect(recorder.texts()).not.toContain('−1');
    expect(recorder.fillRects().every(([, , w]) => w === 3 * ZOOM || w === ZOOM)).toBe(true);
  });
});

describe('aligned CDS translation', () => {
  it('renders codons across gaps in the same biological frame', () => {
    const recorder = installCanvasRecorder();
    const seq = '--A-TG-AAA-TAA--';
    const { container } = render(<SequenceTrack {...props(seq, [{ type: 'CDS', name: 'gapped', start: 2, end: 14, strand: 1,
      segments: [{ start: 2, end: 14 }] }])} />);
    expect(recorder.texts().slice(-3)).toEqual(['M', 'K', '_']);
    expect(recorder.fillRects().slice(-3)).toEqual([[40, 0, 80, 18], [140, 0, 60, 18], [220, 0, 60, 18]]);
    expect(container.querySelector<HTMLCanvasElement>('.translation-band')?.style.transform).toBe('translateY(82px)');
  });
});


describe('translation lanes', () => {
  it('stacks a different-frame overlap outward from the bases on each strand', () => {
    const recorder = installCanvasRecorder();
    const seq = 'ATGAAATAAATGAAATAA';
    const features: BioFeature[] = [
      { type: 'CDS', name: 'f0', start: 0, end: 9, strand: 1 },
      { type: 'CDS', name: 'f1', start: 4, end: 13, strand: 1 },
      { type: 'CDS', name: 'r0', start: 0, end: 9, strand: -1 },
    ];
    const { container } = render(<SequenceTrack {...props(seq, features)} />);
    const [forward, reverse] = [...container.querySelectorAll<HTMLCanvasElement>('.translation-band')];
    expect([forward.style.height, reverse.style.height]).toEqual(['36px', '18px']);
    expect(forward.style.transform).toBe('translateY(64px)');
    const aaRows = recorder.fillRects().filter(([, , , h]) => h === AA_ROW_HEIGHT).map(([, y]) => y);
    // f0 sits next to the bases (bottom forward row), f1 above it, r0 in the single reverse row.
    expect(aaRows).toEqual([18, 18, 18, 0, 0, 0, 0, 0, 0]);
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
  const { container, rerender } = render(<SequenceTrack {...input} zoomLevel={6} y={18} />);
  const bands = [...container.querySelectorAll<HTMLCanvasElement>('.translation-band')];
  expect(bands).toHaveLength(2);
  expect(bands.map(b => b.style.transform)).toEqual(['translateY(0px)', 'translateY(40px)']);
  expect(recorder.texts()).toEqual(['M']);
  rerender(<SequenceTrack {...input} zoomLevel={5} y={0} />);
  expect([...container.querySelectorAll('.translation-band')]).toEqual(bands);
  expect(bands.map(b => b.style.opacity)).toEqual(['0', '0']);
  expect(recorder.texts()).toEqual(['M']);
  expect(container.querySelector('[data-sequence-band]')?.classList.contains('translation-motion')).toBe(true);
});
