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
import { beforeEach, expect, it } from 'vitest';
import { render, installCanvasRecorder, type CanvasRecorder } from '@/src/app/testing/renderHarness';
import { SequenceTrack, type SequenceTrackProps } from '../SequenceTrack';
import { assignTranslationLanes } from '../../cds';
import type { BioFeature } from '@/src/domain/bio/types';

let recorder: CanvasRecorder;
beforeEach(() => { recorder = installCanvasRecorder(); });

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

it('draws unknown residues and explains the unavailable code without claiming an early stop', () => {
  const seq = 'ATGTAGGAG';
  const feature: BioFeature = { type: 'CDS', name: 'unknown', start: 0, end: 9,
    strand: 1, metadata: { transl_table: '7' } };
  const view = render(<SequenceTrack {...props(seq, feature)} />);
  expect(recorder.texts().slice(-3)).toEqual(['?', '?', '?']);
  expect(recorder.texts()).not.toContain('!');
  expect(view.getByRole('button', { name: '⚠ /transl_table=7 is not an NCBI genetic code; codons are not translated' })).toBeTruthy();
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
