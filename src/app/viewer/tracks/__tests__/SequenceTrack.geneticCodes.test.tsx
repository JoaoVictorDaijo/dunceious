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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as cdsHelpers from '../../cds';
import { render, installCanvasRecorder, type CanvasRecorder } from '@/src/app/testing/renderHarness';
import { SequenceTrack, type SequenceTrackProps } from '../SequenceTrack';
import { assignTranslationLanes } from '../../cds';
import fixture from '@/src/domain/bio/__tests__/fixtures/ncbi-genetic-codes.biopython.json';
import type { BioFeature } from '@/src/domain/bio/types';

let recorder: CanvasRecorder;
beforeEach(() => { recorder = installCanvasRecorder(); });
afterEach(() => { vi.restoreAllMocks(); });

function props(seq: string, feature: BioFeature): SequenceTrackProps {
  return {
    seq, moleculeType: 'dna',
    xScale: d3.scaleLinear().domain([0, seq.length]).range([0, seq.length * 20]),
    viewportWidth: seq.length * 20, y: 100, zoomLevel: 20, scrollX: 0,
    showTranslation: true, features: [feature],
    translationLanes: assignTranslationLanes([feature], seq),
    searchResults: [], allSearchResults: [], currentSearchIdx: -1,
  };
}

// Residues follow the independent Biopython fixture; complete dual-coding CDS ends follow TRANS-1.
it.each([
  { seq: 'ATGTAATAGTGA', table: '6', strand: 1 as const, protein: 'MQQ_', locationString: '1..12' },
  { seq: 'augugagaguag', table: '4', strand: 1 as const, protein: 'MWE_', locationString: '1..12' },
  { seq: 'TCATTTCAT', table: '27', strand: -1 as const, protein: 'MK_', locationString: 'complement(1..9)' },
  { seq: 'ATGAAATGA', table: '27', strand: 1 as const, protein: 'MKW', locationString: '1..>9' },
])('draws $protein under table $table on strand $strand', ({ seq, table, strand, protein, locationString }) => {
  const feature: BioFeature = { type: 'CDS', name: 'coding', start: 0, end: seq.length,
    strand, metadata: { transl_table: table }, locationString };
  const view = render(<SequenceTrack {...props(seq, feature)} />);
  expect(recorder.texts().slice(-protein.length)).toEqual([...protein]);
  expect(recorder.texts()).not.toContain('!');
  expect(view.container.querySelector('[data-genetic-code-warning]')).toBeNull();
});

it('draws assumed residues and explains the unavailable code without claiming an early stop', () => {
  const seq = 'ATGTAGGAG';
  const feature: BioFeature = { type: 'CDS', name: 'unknown', start: 0, end: 9,
    strand: 1, metadata: { transl_table: '7' } };
  const view = render(<SequenceTrack {...props(seq, feature)} />);
  expect(recorder.texts().slice(-3)).toEqual(['M', '*', 'E']);
  expect(recorder.texts()).not.toContain('!');
  expect(view.getByRole('button', { name: /Residues assume table 1/ })).toBeTruthy();
});

it('preserves the stored translation while merging the selected-code terminal stop in the band', () => {
  const seq = 'GTGTGATAA';
  const feature: BioFeature = { type: 'CDS', name: 'annotated', start: 0, end: 9,
    strand: 1, metadata: { transl_table: '4' }, translation: 'MU' };
  render(<SequenceTrack {...props(seq, feature)} />);
  expect(recorder.texts().slice(-3)).toEqual(['M', 'U', '_']);
});

it.each([1, -1] as const)('positions both origin-crossing warning spans on strand %s', strand => {
  const feature: BioFeature = { type: 'CDS', name: 'wrap', start: 90, end: 9, strand,
    metadata: { transl_table: '7' }, segments: [{ start: 90, end: 120 }, { start: 0, end: 9 }] };
  const view = render(<SequenceTrack {...props('A'.repeat(120), feature)} scrollX={40} />);
  const spans = [...view.container.querySelectorAll<HTMLElement>('[data-genetic-code-warning]')]
    .sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));
  expect(spans.map(span => [parseFloat(span.style.left), parseFloat(span.style.width)])).toEqual([
    [-40, 180], [1760, 600],
  ]);
  expect(spans.map(span => [parseFloat(span.style.top), parseFloat(span.style.height)])).toEqual(
    strand === 1 ? [[82, 18], [82, 18]] : [[122, 18], [122, 18]],
  );
});

it('suppresses translation and its warning overlay in a protein record', () => {
  const seq = 'MFVTAGFLV';
  const feature: BioFeature = { type: 'CDS', name: 'peptide', start: 0, end: 9,
    strand: 1, metadata: { transl_table: '7' } };
  const view = render(<SequenceTrack {...props(seq, feature)} moleculeType="protein" />);
  expect(view.container.querySelector('[data-genetic-code-warning]')).toBeNull();
  expect(view.container.querySelector('[data-translation-band]')).toBeNull();
  expect(recorder.texts()).toEqual([...seq]);
});

const assumedCases = [
  { translation: undefined, seq: 'ATGTGAGCNTGN', glyphs: ['M', '*', 'A', '?'], assumed: 4, dashed: 2, red: 1, early: false },
  { translation: undefined, seq: 'ATGTGATGG', glyphs: ['M', '*', 'W'], assumed: 3, dashed: 1, red: 1, early: false },
  { translation: 'MVA', seq: 'ATGTGGGCT', glyphs: ['M', 'V', 'A'], assumed: 0, dashed: 0, red: 0, early: false },
  { translation: 'M', seq: 'ATGTGGGCT', glyphs: ['M', 'W', 'A'], assumed: 2, dashed: 0, red: 0, early: false },
  { translation: 'MK*G', seq: 'ATGAAATGAGGATAATGG', glyphs: ['M', 'K', '!', 'G', '*', 'W'], assumed: 2, dashed: 1, red: 1, early: true },
];
it.each(assumedCases)('distinguishes stored and assumed cells for $translation', ({ translation, seq, glyphs, assumed, dashed, red, early }) => {
  const feature: BioFeature = { type: 'CDS', name: 'mixed', start: 0, end: seq.length, strand: 1,
    translation, metadata: { transl_table: '99' } };
  const view = render(<SequenceTrack {...props(seq, feature)} />);
  expect(recorder.texts().slice(-glyphs.length)).toEqual(glyphs);
  const outlines = recorder.strokeRects().filter(r => r.dash.length > 0);
  expect(outlines).toHaveLength(dashed);
  expect(outlines.filter(r => r.color === '#ef4444')).toHaveLength(red);
  expect(outlines.every(r => r.width === 1)).toBe(true);
  expect(recorder.fillRects().filter(r => r[3] === 18)).toHaveLength(glyphs.length - dashed);
  expect(recorder.texts().includes('!')).toBe(early);
  expect(recorder.fillColors().filter(color => color === '#ef4444')).toHaveLength(early ? 1 : 0);
  if (seq === 'ATGTGAGCNTGN') {
    expect(outlines.map(r => r.rect[0])).toEqual([60.5, 180.5]);
    expect(recorder.fillRects().filter(r => r[3] === 18).map(r => r[0])).toEqual([0, 120]);
    expect(recorder.textColors().slice(-4)).toEqual(['#fff', '#ef4444', '#fff', '#475569']);
  }
  const warning = view.container.querySelector('[data-genetic-code-warning]')!.getAttribute('data-tip');
  expect(warning).toContain(translation ? "annotation's /translation" : 'Residues assume table 1');
  if (translation && assumed) expect(warning).toContain(`first ${translation.length} residues`);
  expect(view.container.querySelectorAll('[data-assumed-codon]')).toHaveLength(assumed);
  expect([...view.container.querySelectorAll('[data-assumed-codon]')].every(e => e.getAttribute('data-tip')?.includes('assuming table 1'))).toBe(true);
});

it.each(['CDS', 'cds', 'ORF', 'orf', 'gene'])('limits assumed codon hovers to translated types: %s', type => {
  const seq = 'TGATGNRAYGCNTGG';
  const feature: BioFeature = { type, name: 'hover', start: 0, end: seq.length, strand: 1, metadata: { transl_table: '99' } };
  const view = render(<SequenceTrack {...props(seq, feature)} />);
  const tips = [...view.container.querySelectorAll('[data-assumed-codon]')].map(e => e.getAttribute('data-tip')!);
  if (type === 'gene') { expect(tips).toEqual([]); return; }
  expect(tips).toHaveLength(5);
  expect(tips.every(t => t.includes('assuming table 1'))).toBe(true);
  expect(tips[0]).toContain('W in tables 2, 3, 4');
  expect(tips[0]).toContain('C in 10; G in 25');
  expect(tips[1]).toContain('In table 1 it can be C, W or a stop');
  expect(tips[2]).toContain('D or N, in every NCBI code');
  expect(tips[3]).toContain('Every reading of GCN is A in every NCBI code');
  expect(tips[4]).toContain('TGG reads W in every NCBI code');
});

it('reuses assumed codon geometry across pan and zoom, emitting only visible targets', () => {
  const seq = 'ATGTGAGCNTGN'.repeat(12);
  const feature: BioFeature = { type: 'CDS', name: 'long', start: 0, end: seq.length, strand: 1, metadata: { transl_table: '99' } };
  const trackProps = { ...props(seq, feature), viewportWidth: 60 };
  const geometry = vi.spyOn(cdsHelpers, 'codonSpans');
  const view = render(<SequenceTrack {...trackProps} />);
  const tips = () => [...view.container.querySelectorAll<HTMLElement>('[data-assumed-codon]')];
  expect(tips()).toHaveLength(1);
  expect(tips()[0].dataset.tip).toContain('ATG');
  // Isolate hover work from the separate canvas traversal on viewport redraws.
  HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement['getContext'];
  geometry.mockClear();
  view.rerender(<SequenceTrack {...trackProps} scrollX={60} />);
  expect(tips()).toHaveLength(1);
  expect(tips()[0].dataset.tip).toContain('TGA');
  expect(tips()[0].style.left).toBe('0px');
  expect(geometry).not.toHaveBeenCalled();
  view.rerender(<SequenceTrack {...trackProps} scrollX={120} zoomLevel={40}
    xScale={d3.scaleLinear().domain([0, seq.length]).range([0, seq.length * 40])} />);
  expect(tips()).toHaveLength(1);
  expect(tips()[0].dataset.tip).toContain('TGA');
  expect(geometry).not.toHaveBeenCalled();
});

it.each([
  { name: 'reverse', seq: 'ATGTGGGCT', strand: -1 as const, start: 0, end: 9, segments: undefined, left: 3, right: 6, codon: 'CCA' },
  { name: 'joined codon piece', seq: 'ATCCCCTGGG', strand: 1 as const, start: 0, end: 10,
    segments: [{ start: 0, end: 2 }, { start: 6, end: 10 }], left: 6, right: 7, codon: 'ATT' },
  { name: 'join gap', seq: 'ATCCCCTGGG', strand: 1 as const, start: 0, end: 10,
    segments: [{ start: 0, end: 2 }, { start: 6, end: 10 }], left: 2, right: 6, codon: undefined },
  { name: 'circular forward start', seq: 'TGGGCT' + 'A'.repeat(24) + 'ATG', strand: 1 as const, start: 30, end: 6,
    segments: [{ start: 30, end: 33 }, { start: 0, end: 6 }], left: 0, right: 3, codon: 'TGG' },
  { name: 'circular reverse start', seq: 'TGGGCT' + 'A'.repeat(24) + 'ATG', strand: -1 as const, start: 30, end: 6,
    segments: [{ start: 30, end: 33 }, { start: 0, end: 6 }], left: 0, right: 3, codon: 'CCA' },
  { name: 'circular end', seq: 'TGGGCT' + 'A'.repeat(24) + 'ATG', strand: 1 as const, start: 30, end: 6,
    segments: [{ start: 30, end: 33 }, { start: 0, end: 6 }], left: 30, right: 33, codon: 'ATG' },
])('queries visible assumed targets in a $name', ({ seq, strand, start, end, segments, left, right, codon }) => {
  const feature: BioFeature = { type: 'CDS', name: 'geometry', start, end, strand, segments, metadata: { transl_table: '99' } };
  const view = render(<SequenceTrack {...props(seq, feature)} scrollX={left * 20} viewportWidth={(right - left) * 20} />);
  const targets = [...view.container.querySelectorAll<HTMLElement>('[data-assumed-codon]')];
  expect(targets).toHaveLength(codon ? 1 : 0);
  if (codon) {
    expect(targets[0].dataset.tip).toContain(codon);
    expect(targets[0].dataset.tip).toContain('assuming table 1');
    expect(targets[0].style.left).toBe('0px');
    expect(targets[0].style.width).toBe(`${(right - left) * 20}px`);
  }
});

it.each([
  { seq: 'ATGTGGGCT', strand: -1 as const, start: 0, end: 9, segments: undefined, codons: ['AGC', 'CCA', 'CAT'] },
  { seq: 'TGGGCT' + 'A'.repeat(24) + 'ATG', strand: 1 as const, start: 30, end: 6,
    segments: [{ start: 30, end: 33 }, { start: 0, end: 6 }], codons: ['ATG', 'TGG', 'GCT'] },
])('keeps biological translation order for keyboard hover targets on strand $strand', ({ seq, strand, start, end, segments, codons }) => {
  const feature: BioFeature = { type: 'CDS', name: 'order', start, end, strand, segments, metadata: { transl_table: '99' } };
  const view = render(<SequenceTrack {...props(seq, feature)} />);
  const targets = [...view.container.querySelectorAll<HTMLElement>('[data-assumed-codon]')];
  expect(targets).toHaveLength(codons.length);
  for (const [i, codon] of codons.entries()) expect(targets[i].dataset.tip).toContain(codon);
});

it.each([
  { codon: 'ATG', locationString: '1..9', codon_start: '1', residue: 'M', dashed: false },
  { codon: 'TTG', locationString: '1..9', codon_start: '1', residue: 'M', dashed: true },
  { codon: 'CTG', locationString: '1..9', codon_start: '1', residue: 'M', dashed: true },
  { codon: 'GTG', locationString: '1..9', codon_start: '1', residue: 'V', dashed: true },
  { codon: 'TTG', locationString: '<1..9', codon_start: '1', residue: 'L', dashed: false },
  { codon: 'TTG', locationString: undefined, codon_start: '1', residue: 'L', dashed: false },
  { codon: 'TTG', locationString: '1..10', codon_start: '2', residue: 'L', dashed: false },
])('draws and explains first $codon at $locationString /codon_start=$codon_start', ({ codon, locationString, codon_start, residue, dashed }) => {
  const seq = (codon_start === '2' ? 'A' : '') + codon + 'TGGTAA';
  const feature: BioFeature = { type: 'CDS', name: 'start', start: 0, end: seq.length, strand: 1, locationString,
    metadata: { transl_table: '99', codon_start } };
  const view = render(<SequenceTrack {...props(seq, feature)} />);
  expect(recorder.texts().slice(-3)[0]).toBe(residue);
  expect(recorder.strokeRects().some(r => r.dash.length > 0 && r.rect[0] < 21)).toBe(dashed);
  const tip = view.container.querySelector<HTMLElement>('[data-assumed-codon]')!.dataset.tip!;
  expect(tip).toContain('assuming table 1');
  if (locationString === '1..9') {
    const starts = Object.entries(fixture.tables).filter(([, table]) => table.starts[Object.keys(table.codons).indexOf(codon)] === 'M').map(([id]) => id);
    expect(tip).toContain(`M as a start in tables ${starts.join(', ')}`);
  } else expect(tip).not.toContain('as a start');
});


it.each([1, -1] as const)('shows the suppressed-frame warning without translated cells on strand %s', strand => {
  const seq = 'ATGTGAAAA';
  const feature: BioFeature = { type: 'CDS', name: 'invalid-frame', start: 0, end: 9, strand,
    translation: 'M*K', metadata: { codon_start: '4', transl_table: '99' } };
  const trackProps = props(seq, feature);
  const view = render(<SequenceTrack {...trackProps} />);
  const warning = view.getByRole('button', { name: '⚠ /codon_start=4 is invalid; codons are not translated' });
  expect([warning.style.top, warning.style.height, warning.style.width]).toEqual([
    strand === 1 ? '82px' : '122px', '18px', '180px',
  ]);
  expect(warning.textContent).toBe('⚠');
  expect(warning.style.background).not.toBe('transparent');
  expect(trackProps.translationLanes.laneOf.has(feature)).toBe(false);
  expect(recorder.texts()).toEqual([...seq]);
  expect(recorder.fillRects().filter(rect => rect[3] === 18)).toEqual([]);
  expect(recorder.strokeRects().filter(rect => rect.rect[3] === 18)).toEqual([]);
  expect(view.container.querySelector('[data-assumed-codon]')).toBeNull();
  view.rerender(<SequenceTrack {...trackProps} showTranslation={false} />);
  expect(view.container.querySelector('[data-genetic-code-warning]')).toBeNull();
});
