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
import * as bio from '@/src/domain/bio';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, act, installCanvasRecorder, stubResizeObserver, type CanvasRecorder } from '@/src/app/testing/renderHarness';
import { checkTranslation } from '@/src/domain/bio/translation';
import TooltipLayer from '@/src/app/components/TooltipLayer';
import { SequenceTrack, type SequenceTrackProps } from '@/src/app/viewer/tracks/SequenceTrack';
import { parseFasta } from '@/src/core/formats/fasta';
import { TouchArbiter } from '../../touchGesture';
import { Minimap } from '@/src/app/viewer/Minimap';
import { AA_ROW_HEIGHT } from '@/src/app/viewer/constants';
import { assignTranslationLanes } from '@/src/app/viewer/cds';
import type { BioFeature } from '@/src/domain/bio/types';
import type { ActiveComparison } from '@/src/app/logic/alignmentComparison';

const ZOOM = 20; // > 12 so both translation and nucleotide glyphs draw

function props(seq: string, features: BioFeature[] = [{ type: 'CDS', name: 'cds', start: 0, end: seq.length, strand: 1, segments: [{ start: 0, end: seq.length }] }]): SequenceTrackProps {
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
    render(<Minimap touchArbiter={new TouchArbiter()} {...legacyScrollProps} records={[record]} consensus={record.sequence} alignmentLength={4}
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
    expect(container.querySelector<HTMLElement>('[data-translation-band="forward"]')?.style.height).toBe(`${AA_ROW_HEIGHT * 2}px`);
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
    expect(recorder.fillRects().slice(-4)).toEqual([[40, 0, 20, 18], [80, 0, 40, 18], [140, 0, 60, 18], [220, 0, 60, 18]]);
    const codons = container.querySelectorAll('[data-codon-target]');
    expect(codons).toHaveLength(3);
    expect([...codons[0].children].map(piece => [(piece as HTMLElement).style.left, (piece as HTMLElement).style.width])).toEqual([['0px', '20px'], ['40px', '40px']]);
    expect(container.querySelector<HTMLCanvasElement>('[data-translation-band="forward"]')?.style.transform).toBe('translateY(82px)');
  });
});


describe('translation lanes', () => {
  it('stacks a different-frame overlap outward from the bases on each strand', () => {
    const recorder = installCanvasRecorder();
    const seq = 'ATGAAATAAATGAAATAA';
    const features: BioFeature[] = [
      { type: 'CDS', name: 'f0', start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 9 }] },
      { type: 'CDS', name: 'f1', start: 4, end: 13, strand: 1, segments: [{ start: 4, end: 13 }] },
      { type: 'CDS', name: 'r0', start: 0, end: 9, strand: -1, segments: [{ start: 0, end: 9 }] },
    ];
    const { container } = render(<SequenceTrack {...props(seq, features)} />);
    const forward = container.querySelector<HTMLCanvasElement>('[data-translation-band="forward"]')!;
    const reverse = container.querySelector<HTMLCanvasElement>('[data-translation-band="reverse"]')!;
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
    const band = container.querySelector<HTMLElement>('[data-translation-band="forward"]');
    expect(band?.getAttribute('aria-hidden')).toBe(zoomLevel > 5 ? 'false' : 'true');
  });

  it('does not translate protein records even when the toggle is on', () => {
    const recorder = installCanvasRecorder();
    render(<SequenceTrack {...props('ATG')} moleculeType="protein" />);
    expect(recorder.texts()).toEqual(['A', 'T', 'G']);
  });

  it('keeps low-zoom search highlights within the nucleotide band', () => {
    const recorder = installCanvasRecorder();
    const hit = { cigar: '3=', recordId: 'r', start: 0, end: 3, strand: 1 as const, sequence: 'ATG' };
    render(<SequenceTrack {...props('ATG')} zoomLevel={5} searchResults={[hit]} />);
    expect(recorder.fillRects()[0][3]).toBe(22);
  });
});


it('retains both translation canvases for the closing fade without drawing at low zoom', () => {
  const recorder = installCanvasRecorder();
  const input = props('ATG');
  const { container, rerender } = render(<SequenceTrack {...input} zoomLevel={6} y={18} />);
  const translationBands = () => ['forward', 'reverse'].map(strand =>
    container.querySelector<HTMLCanvasElement>(`[data-translation-band="${strand}"]`)!);
  const bands = translationBands();
  expect(bands).toHaveLength(2);
  // Strand placement and opacity preserve the closing fade without collapsing retained canvases.
  expect(bands.map(b => b.style.transform)).toEqual(['translateY(0px)', 'translateY(40px)']);
  expect(recorder.texts()).toEqual(['M']);
  rerender(<SequenceTrack {...input} zoomLevel={5} y={0} />);
  expect(translationBands()).toEqual(bands);
  expect(bands.map(b => b.style.opacity)).toEqual(['0', '0']);
  expect(recorder.texts()).toEqual(['M']);
  expect(container.querySelector('[data-sequence-band]')?.getAttribute('data-state')).toBe('translation-enabled');
});


describe('discontinuous codon geometry', () => {
  it.each([1, -1] as const)('splits an origin-crossing codon on strand %s', strand => {
    const recorder = installCanvasRecorder();
    const feature: BioFeature = { type: 'CDS', name: 'origin', start: 98, end: 4, strand,
      segments: [{ start: 98, end: 100 }, { start: 0, end: 4 }] };
    const context = document.createElement('canvas').getContext('2d')!;
    const labels = vi.spyOn(context, 'fillText');
    render(<SequenceTrack {...props('A'.repeat(100), [feature])} />);
    const aminoAcids = labels.mock.calls.filter(([text]) => text === (strand === 1 ? 'K' : 'F'));
    expect(aminoAcids.map(([, x]) => x).sort((a, b) => a - b)).toEqual([50, 1980]);
    const boxes = recorder.fillRects().filter(([, , , h]) => h === AA_ROW_HEIGHT);
    expect(boxes.map(([x, , w]) => [x, w]).sort((a, b) => a[0] - b[0])).toEqual(
      [[0, 20], [20, 60], [1960, 40]],
    );
  });

  it('splits a splice-crossing codon without painting the intron', () => {
    const recorder = installCanvasRecorder();
    const feature: BioFeature = { type: 'CDS', name: 'splice', start: 0, end: 12, strand: 1,
      segments: [{ start: 0, end: 2 }, { start: 8, end: 12 }] };
    render(<SequenceTrack {...props('A'.repeat(12), [feature])} />);
    expect(recorder.fillRects().filter(([, , , h]) => h === AA_ROW_HEIGHT).map(([x, , w]) => [x, w]))
      .toEqual([[0, 40], [160, 20], [180, 60]]);
  });
});


it('keeps reverse-oriented pieces continuous inside a mixed-strand codon', () => {
  const recorder = installCanvasRecorder();
  const labels = vi.spyOn(document.createElement('canvas').getContext('2d')!, 'fillText');
  const feature: BioFeature = { type: 'CDS', name: 'mixed', start: 0, end: 6, strand: 1,
    segments: [{ start: 0, end: 1, strand: 1 }, { start: 4, end: 6, strand: -1 }] };
  render(<SequenceTrack {...props('AAAAAA', [feature])} />);
  expect(recorder.fillRects().filter(([, , , h]) => h === AA_ROW_HEIGHT).map(([x, , w]) => [x, w]))
    .toEqual([[0, 20], [80, 40]]);
  expect(labels.mock.calls.filter(([text]) => text === 'I').map(([, x]) => x)).toEqual([100]);
});

describe('reference comparison', () => {
  // Reference TTTATCAGGATG…; this row carries the D614G A→G change at column 9,
  // an N at column 2 and a deletion at column 5.
  const REF = 'TTTATCAGGATG';
  const ROW = 'TTNAT-AGGGTG';
  const compare = (overrides: Partial<ActiveComparison> = {}): ActiveComparison => ({
    referenceId: 'wuhan', referenceSeq: REF, highlight: 'disagreements', matchDots: true, alphabet: 'nucleotide', ...overrides,
  });
  const draw = (comparison: ActiveComparison | null, zoomLevel = ZOOM) => {
    const recorder = installCanvasRecorder();
    render(<SequenceTrack {...props(ROW, [])} showTranslation={false} comparison={comparison} zoomLevel={zoomLevel}
      xScale={d3.scaleLinear().domain([0, ROW.length]).range([0, ROW.length * zoomLevel])} />);
    return recorder;
  };

  it('draws every residue as itself without a comparison', () => {
    expect(draw(null).texts().join('')).toBe(ROW);
  });

  it('shows identical residues as dots and keeps differences, gaps and ambiguity as letters', () => {
    expect(draw(compare()).texts().join('')).toBe('··N··-···G··');
  });

  it('darkens a deletion against the reference while highlighting differences', () => {
    expect(draw(compare()).fillColors()).toContain('#475569');
    expect(draw(compare({ highlight: 'agreements', matchDots: false })).fillColors()).not.toContain('#475569');
  });

  it('keeps identical residues as muted letters when dots are off', () => {
    const recorder = draw(compare({ matchDots: false }));
    expect(recorder.texts().join('')).toBe(ROW);
    expect(recorder.fillColors()).toContain('#e2e8f0');
  });

  it('colours only the identical residues when highlighting agreements, and never draws a dot', () => {
    const recorder = draw(compare({ highlight: 'agreements', matchDots: false }));
    expect(recorder.texts().join('')).toBe(ROW);
    // The substituted G (column 9) is muted; the identical T at column 0 keeps its colour.
    expect(recorder.fillColors()).toContain('#f43f5e');
    expect(recorder.fillColors()).toContain('#e2e8f0');
  });

  // A gapped reference: an insertion at column 2, a shared gap at 4 and a substitution at 5.
  const GAPPED_REF = 'AC-G-TA';
  const GAPPED_ROW = 'ACTG-CA';
  const drawGapped = (overrides: Partial<ActiveComparison>) => {
    const recorder = installCanvasRecorder();
    render(<SequenceTrack {...props(GAPPED_ROW, [])} showTranslation={false} comparison={compare({ referenceSeq: GAPPED_REF, ...overrides })}
      xScale={d3.scaleLinear().domain([0, GAPPED_ROW.length]).range([0, GAPPED_ROW.length * ZOOM])} />);
    const fillAt = (column: number) => {
      const index = recorder.fillRects().findIndex(([x, y]) => Math.round(x) === column * ZOOM && y === 0);
      return index < 0 ? undefined : recorder.fillColors()[index];
    };
    return { recorder, fillAt };
  };

  it('keeps insertions and substitutions against a gapped reference, and leaves a shared gap plain', () => {
    const { recorder, fillAt } = drawGapped({});
    expect(recorder.texts().join('')).toBe('··T·-C·');
    expect(fillAt(0)).toBeUndefined(); // identical: just the dot
    expect(fillAt(2)).toBe('#f43f5e'); // T inserted where the reference has a gap
    expect(fillAt(4)).toBe('#f1f5f9'); // gap facing gap: a plain gap, not a deletion
    expect(fillAt(5)).toBe('#3b82f6'); // C substituted for T
  });

  it('colours exactly the identical columns in Identity mode', () => {
    const { fillAt } = drawGapped({ highlight: 'agreements', matchDots: false });
    expect(fillAt(0)).toBe('#22c55e');
    expect(fillAt(3)).toBe('#eab308');
    expect(fillAt(2)).toBe('#e2e8f0'); // insertion muted
    expect(fillAt(5)).toBe('#e2e8f0'); // substitution muted
    expect(fillAt(4)).toBe('#f1f5f9');
  });

  it('mutes identical residues into a quiet band at overview zoom', () => {
    const recorder = draw(compare(), 0.25);
    expect(recorder.texts()).toEqual([]);
    expect(recorder.fillColors()).toContain('#e2e8f0');
  });
});

it('exposes active hit marks and the reverse query label', () => {
  const recorder = installCanvasRecorder();
  const hit = { sequence: 'ACGT', recordId: 'r', start: 0, end: 4, strand: -1 as const, cigar: '1=1X1I1D1=' };
  const { container } = render(<SequenceTrack {...props('ACGT', [])} showTranslation={false}
    record={{ id: 'r', name: 'r', sequence: 'ACGT', features: [] }}
    completedSearch={{ query: 'ATAT', mode: 'whole', alphabet: 'nucleotide', options: { minIdentity: 80, strand: 'both', maxResults: 100 } }}
    searchResults={[hit]} allSearchResults={[hit]} currentSearchIdx={0} />);
  expect(container.querySelector('[data-sequence-band]')?.getAttribute('data-hit-marks')).toBe('|-.|');
  expect(container.querySelector('[data-sequence-band]')?.getAttribute('data-hit-insertions')).toBe('1');
  expect(recorder.texts()).toContain('Query (reverse complement)');
});

it('keeps the query lane directly above the record and translation above the query', () => {
  installCanvasRecorder();
  const hit = { sequence: 'ATG', recordId: 'r', start: 0, end: 3, strand: 1 as const, cigar: '3=' };
  const { container } = render(<SequenceTrack {...props('ATG')} y={100}
    searchResults={[hit]} allSearchResults={[hit]} currentSearchIdx={0} />);
  expect(container.querySelector<HTMLElement>('[data-query-band]')?.style.transform).toBe('translateY(52px)');
  expect(container.querySelector<HTMLElement>('[data-translation-band="forward"]')?.style.transform).toBe('translateY(34px)');
});

it.each(['nucleotide', 'protein'] as const)('explains identical-letter ambiguity mismatches for %s', alphabet => {
  installCanvasRecorder();
  const seq = alphabet === 'protein' ? 'X' : 'N';
  const hit = { sequence: seq, recordId: 'r', start: 0, end: 1, strand: 1 as const, cigar: '1=' };
  const { getByRole } = render(<SequenceTrack {...props(seq, [])} showTranslation={false}
    moleculeType={alphabet === 'protein' ? 'protein' : 'dna'} record={{ id: 'r', name: 'r', sequence: seq, features: [] }}
    completedSearch={{ query: seq, mode: 'whole', alphabet, options: { minIdentity: 80, strand: 'both', maxResults: 100 } }}
    searchResults={[hit]} allSearchResults={[hit]} currentSearchIdx={0} />);
  expect(getByRole('button', { name: "Ambiguity code in the record: the search doesn't count it as a match" }).getAttribute('data-tip'))
    .toBe("Ambiguity code in the record: the search doesn't count it as a match");
});

it.each([1, -1] as const)('preserves strand %s tint at overview zoom', strand => {
  const recorder = installCanvasRecorder();
  const hit = { sequence: 'A'.repeat(100), recordId: 'r', start: 0, end: 100, strand, cigar: '100=' };
  render(<SequenceTrack {...props('A'.repeat(100), [])} showTranslation={false} zoomLevel={0.25}
    xScale={d3.scaleLinear().domain([0, 100]).range([0, 25])} searchResults={[hit]} allSearchResults={[hit]} currentSearchIdx={0} />);
  expect(recorder.fillColors()).not.toContain('#22c55e');
  expect(recorder.fillColors()).toContain(strand === 1 ? '#fbbf24' : '#f472b6');
});

it('gives an active forward hit priority over a later reverse background', () => {
  const recorder = installCanvasRecorder();
  const active = { sequence: 'A', recordId: 'r', start: 0, end: 1, strand: 1 as const, cigar: '1=' };
  const other = { ...active, strand: -1 as const };
  render(<SequenceTrack {...props('A', [])} showTranslation={false}
    searchResults={[active, other]} allSearchResults={[active, other]} currentSearchIdx={0} />);
  expect(recorder.fillColors().at(-1)).toBe('#fbbf24');
});

it('keeps even a subpixel hit visible when its base is not the pixel sample', () => {
  const recorder = installCanvasRecorder();
  const hit = { sequence: 'A', recordId: 'r', start: 0, end: 1, strand: 1 as const, cigar: '1=' };
  render(<SequenceTrack {...props('A'.repeat(100), [])} showTranslation={false} zoomLevel={0.25}
    xScale={d3.scaleLinear().domain([0, 100]).range([0, 25])} searchResults={[hit]} allSearchResults={[hit]} currentSearchIdx={0} />);
  expect(recorder.fillRects().filter(([x, , width]) => x === 0 && width === 1.2)).toEqual([]);
});


it('passes the known biological length to feature extraction on translation redraw', () => {
  installCanvasRecorder();
  const feature: BioFeature = { type: 'CDS', name: 'aligned', start: 0, end: 5, strand: 1,
    biological: { start: 0, end: 3, strand: 1 } };
  const input = props('AT--G', [feature]);
  const record = { id: 'r', name: 'r', sequence: 'ATG', alignedSequence: 'AT--G', features: [feature] };
  const extraction = vi.spyOn(bio, 'extractCodingSequence');
  try {
    const { rerender } = render(<SequenceTrack {...input} record={record} />);
    expect(extraction).toHaveBeenCalledWith(feature, 'AT--G', { isCircular: undefined, biologicalLength: 3 });
    extraction.mockClear();
    rerender(<SequenceTrack {...input} record={record} scrollX={1} />);
    expect(extraction).not.toHaveBeenCalled();
  } finally {
    extraction.mockRestore();
  }
});


it('bounds whole-sequence length recovery independently of aligned CDS count', () => {
  const seq = 'ATG--TAGGAG';
  const features: BioFeature[] = Array.from({ length: 24 }, (_, i) => ({
    type: 'CDS', name: `cds-${i}`, start: 0, end: seq.length, strand: 1,
    biological: { start: 0, end: 9, strand: 1 },
  }));
  installCanvasRecorder();
  const record = { id: 'scan', name: 'scan', sequence: 'ATGTAGGAG', alignedSequence: seq, features };
  const input = props(seq, features);
  const replacement = vi.spyOn(String.prototype, 'replace');
  try {
    render(<SequenceTrack {...input} record={record} />);
    expect(replacement.mock.calls.filter(([pattern], i) =>
      String(pattern) === '/-/g' && String(replacement.mock.contexts[i]) === seq).length).toBeLessThanOrEqual(1);
  } finally {
    replacement.mockRestore();
  }
});

it('retains a curated hidden-stop residue with a base-facing edge and ordinary codon targets', () => {
 const recorder = installCanvasRecorder();
 const f: BioFeature = { type: 'CDS', name: 'curated', start: 0, end: 12, strand: 1, segments: [{ start: 0, end: 12 }], metadata: { translation: 'MXA', transl_table: '11' } };
 const { container } = render(<SequenceTrack {...props('ATGTGAGCTTAA', [f])} />);
 expect(recorder.texts().slice(-4)).toEqual(['M', 'X', 'A', '_']);
 expect(recorder.fillRects()).toContainEqual([60, 15, 60, 3]);
 const targets = container.querySelectorAll('[data-codon-target]');
 expect(targets).toHaveLength(4);
 expect(targets[1].getAttribute('data-tip')).toContain('Early stop in the conceptual CDS');
 expect(targets[1].getAttribute('aria-label')).toContain('Annotated X (unknown)');
});

it('places a length chip after the endpoint without inventing missing codon cells', () => {
 installCanvasRecorder();
 const f: BioFeature = { type: 'CDS', name: 'short', start: 0, end: 12, strand: 1, segments: [{ start: 0, end: 12 }], metadata: { translation: 'M', transl_table: '11' } };
 const { container } = render(<SequenceTrack {...props('ATGTAAGGGTAA', [f])} viewportWidth={500} />);
 expect(container.querySelectorAll('[data-codon-target]')).toHaveLength(2);
 const chip = container.querySelector('[data-translation-chip]');
 expect(chip?.textContent).toBe('−2 positions');
 expect(chip?.getAttribute('data-tip')).toContain('2 DNA-derived positions have no annotated residue');
 expect(chip?.getAttribute('data-tip')).toContain('internal stop');
});

it.each([5, 5.01, 12, 12.01, 20])('keeps mark meaning and exact eligibility at zoom %s', zoomLevel => {
 installCanvasRecorder();
 const f: BioFeature = { type: 'CDS', name: 'visible', start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 9 }], metadata: { translation: 'MK', transl_table: '11' } };
 const { container } = render(<SequenceTrack {...props('ATGAGATAA', [f])} zoomLevel={zoomLevel}
   xScale={d3.scaleLinear().domain([0, 9]).range([0, 9 * zoomLevel])} />);
 const targets = container.querySelectorAll('[data-codon-target]');
 expect(targets.length).toBe(zoomLevel > 5 ? 3 : 0);
 if (zoomLevel > 5) expect(targets[1].getAttribute('data-tip')).toContain('Stored /translation differs here');
});
it('dismisses open and pending evidence on pan and recomputation, while keeping a surviving focus target', () => {
 vi.useFakeTimers();
 installCanvasRecorder();
 const f: BioFeature = { type: 'CDS', name: 'c', start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 9 }], metadata: { translation: 'MK', transl_table: '11' } };
 const input = props('ATGAGATAA', [f]);
 const { container, rerender } = render(<><SequenceTrack {...input} /><TooltipLayer /></>);
 const target = container.querySelectorAll<HTMLElement>('[data-codon-target]')[1];
 fireEvent.pointerOver(target.firstElementChild!);
 act(() => vi.advanceTimersByTime(400));
 expect(screen.getByRole('tooltip').textContent).toContain('Stored /translation differs here');
 target.focus();
 rerender(<><SequenceTrack {...input} scrollX={1} /><TooltipLayer /></>);
 expect(screen.queryByRole('tooltip')).toBeNull();
 expect(target.hasAttribute('aria-describedby')).toBe(false);
 expect(document.activeElement).toBe(target);
 fireEvent.pointerOver(target.firstElementChild!);
 const changed = { ...f, metadata: { translation: 'MR', transl_table: '11' } };
 rerender(<><SequenceTrack {...input} features={[changed]} translationLanes={assignTranslationLanes([changed], input.seq)} /><TooltipLayer /></>);
 act(() => vi.advanceTimersByTime(400));
 expect(screen.queryByRole('tooltip')).toBeNull();
 vi.useRealTimers();
});

it.each([undefined, 'MU'])('renders mapped invalid-code exceptions as unapplied; stored=%s', translation => {
 const recorder = installCanvasRecorder();
 const raw = '(pos:4..6,aa:Sec)';
 const record = { id: 'r', name: 'r', sequence: 'ATGTGATAA', moleculeType: 'dna' as const };
 const f = checkTranslation({ type: 'CDS', name: 'c', start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 9 }],
   metadata: { transl_table: '999', ...(translation ? { translation } : {}) }, translationExceptions: [raw] }, record);
 const { container } = render(<SequenceTrack {...props(record.sequence, [f])} record={{ ...record, features: [f] }} />);
 expect(recorder.texts().slice(-3)).toEqual(translation ? ['M', 'U', '*'] : ['M', '*', '*']);
 const targets = container.querySelectorAll('[data-codon-target]');
 expect(targets).toHaveLength(3);
 expect(targets[1].getAttribute('data-tip')).toContain(raw);
 expect(targets[1].getAttribute('data-tip')).toContain('was not applied');
 for (const i of [0, 2]) expect(targets[i].getAttribute('data-tip')).not.toContain(raw);
 for (const target of targets) expect(target.getAttribute('data-tip')).toContain('1 deferred translation exception');
 expect(container.querySelector('[data-translation-chip]')).toBeNull();
 expect(recorder.texts()).not.toContain('!');
 expect(recorder.fillRects().some(([, , , height]) => height === 3)).toBe(false);
});
it('renders all-conflicts-dropped as a DNA hidden stop with each original notice', () => {
 const recorder = installCanvasRecorder();
 const entries = ['(pos:4..6,aa:Sec)', '(pos:4..6,aa:Pyl)'];
 const record = { id: 'r', name: 'r', sequence: 'ATGTGATAA', moleculeType: 'dna' as const };
 const f = checkTranslation({ type: 'CDS', name: 'c', start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 9 }],
   metadata: { transl_table: '11', translation: 'MU' }, translationExceptions: entries }, record);
 const { container } = render(<SequenceTrack {...props(record.sequence, [f])} record={{ ...record, features: [f] }} />);
 expect(recorder.texts().slice(-3)).toEqual(['M', 'U', '_']);
 expect(recorder.fillRects()).toContainEqual([60, 15, 60, 3]);
 const target = container.querySelectorAll('[data-codon-target]')[1];
 for (const raw of entries) expect(target.getAttribute('data-tip')).toContain(raw);
 expect(target.getAttribute('data-tip')).toContain('conflicting residues');
 expect(target.getAttribute('data-tip')).not.toContain('annotated exception specifies');
});

it.each([undefined, 'V'])('chooses exactly one invalid-code ORF presentation source per codon; stored=%s', translation => {
 const recorder = installCanvasRecorder();
 const f: BioFeature = { type: 'ORF', name: 'orf', start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 9 }],
   metadata: { transl_table: '999', ...(translation ? { translation } : {}) } };
 const { container } = render(<SequenceTrack {...props('ATGTGATAA', [f])} />);
 expect(recorder.texts().slice(-3)).toEqual(translation ? ['V', '*', '*'] : ['M', '*', '*']);
 const targets = [...container.querySelectorAll('[data-codon-target]')];
 expect(targets).toHaveLength(3);
 expect(targets.map(target => target.children.length)).toEqual([1, 1, 1]);
 for (const [i, target] of targets.entries()) {
   expect(target.getAttribute('data-tip')).not.toContain('?');
   expect(target.getAttribute('data-tip')).toContain(i === 0 && translation ? 'Annotated V' : 'assuming table 1');
 }
});
it('does no whole-sequence gap scan on a million-base pan', () => {
 installCanvasRecorder();
 const sequence = 'A'.repeat(1_000_000);
 const input = { ...props(sequence, []), viewportWidth: 200, showTranslation: false };
 const includes = vi.spyOn(String.prototype, 'includes');
 try {
   const { rerender } = render(<SequenceTrack {...input} />);
   includes.mockClear();
   rerender(<SequenceTrack {...input} scrollX={100} />);
   expect(includes.mock.calls.filter(([search], i) => search === '-' && String(includes.mock.contexts[i]) === sequence)).toHaveLength(0);
 } finally { includes.mockRestore(); }
});

it('keeps normalized dropped evidence in codon and length-chip summaries', () => {
 installCanvasRecorder();
 const record = { id: 'r', name: 'r', accession: 'R', version: 'R.1', sequence: 'ATGAAATAA', moleculeType: 'dna' as const };
 const f = checkTranslation({ type: 'CDS', name: 'c', start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 9 }],
   metadata: { transl_table: '11', translation: 'MKVW' }, translationExceptions: ['(pos:X.1:4..6,aa:Sec)'] }, record);
 expect(f.translationExceptions).toEqual([]);
 const { container } = render(<SequenceTrack {...props(record.sequence, [f])} record={{ ...record, features: [f] }} viewportWidth={500} />);
 const targets = [...container.querySelectorAll('[data-codon-target]'), container.querySelector('[data-translation-chip]')!];
 expect(targets).toHaveLength(4);
 for (const target of targets) {
   expect(target.getAttribute('data-tip')).toContain('1 dropped translation exception');
   expect(target.getAttribute('data-tip')).toContain('Complete diagnostics in feature details');
 }
 expect(container.querySelector('[data-translation-chip]')?.textContent).toBe('+2 positions');
});
