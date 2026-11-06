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
import { expect, it } from 'vitest';
import { render, fireEvent } from '@/src/app/testing/renderHarness';
import { TrackTooltipProvider, useTrackTooltip } from '../TrackTooltip';
import fixture from '@/src/domain/bio/__tests__/fixtures/ncbi-genetic-codes.biopython.json';
import type { BioFeature } from '@/src/domain/bio/types';

function Subject({ sequence, translation, type = 'CDS', table = '99', moleculeType = 'dna', orientation = 1 }: { sequence: string; translation?: string; type?: string; table?: string; moleculeType?: 'dna' | 'protein'; orientation?: 1 | -1 | '.' | '?' }) {
  const update = useTrackTooltip();
  const feature: BioFeature = { type, name: 'test', start: 0, end: sequence.length, strand: typeof orientation === 'number' ? orientation : 1, translation, metadata: { transl_table: table, ...(typeof orientation === 'string' ? { _gffStrand: orientation } : {}) } };
  return <button onClick={() => update({ record: { id: 'r', name: 'r', sequence, moleculeType, features: [feature] }, feature, color: '#fff', x: 0, y: 0 }, feature)}>hover</button>;
}

function oracle(sequence: string) {
  const bases: Record<string, string> = { A: 'A', C: 'C', G: 'G', T: 'T', U: 'T', R: 'AG', Y: 'CT', S: 'CG', W: 'AT', K: 'GT', M: 'AC', B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT' };
  const table: Record<string, string> = fixture.tables['1'].codons;
  const positions: Set<string>[] = [];
  for (let i = 0; i + 2 < sequence.length; i += 3) {
    const readings = new Set<string>();
    for (const a of bases[sequence[i]]) for (const b of bases[sequence[i + 1]]) for (const c of bases[sequence[i + 2]]) readings.add(table[a + b + c]);
    positions.push(readings);
  }
  const last = positions.at(-1);
  const uncertain = last?.has('_') && last.size > 1;
  if (last?.size === 1 && last.has('_')) positions.pop();
  const stops = positions.filter(p => p.size === 1 && p.has('_')).length;
  const ambiguous = positions.filter(p => p.size > 1).length;
  return `${positions.length} ${stops || ambiguous ? 'positions' : 'aa'}${stops ? `, ${stops} stop` : ''}${ambiguous ? `, ${ambiguous} ambiguous` : ''} if table 1${uncertain ? ', end uncertain' : ''}`.replace(' ambiguous if', ' ambiguous, if').replace(' stop if', ' stop, if');
}

it.each([
  ['ATGTGGTAA', '2 aa if table 1'],
  ['ATGTGATGG', '3 positions, 1 stop, if table 1'],
  ['ATGTGNTGG', '3 positions, 1 ambiguous, if table 1'],
  ['ATGTGGTGN', '3 positions, 1 ambiguous, if table 1, end uncertain'],
  ['ATGGCNTAA', '2 aa if table 1'],
])('labels the provisional count for %s', (sequence, expected) => {
  expect(oracle(sequence)).toBe(expected);
  const view = render(<TrackTooltipProvider><Subject sequence={sequence} /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  expect(view.getByRole('tooltip').textContent).toContain("can't verify");
  expect(view.getByRole('tooltip').textContent).toContain(expected);
});

it.each(['MVA', 'M', 'MK*G'])('never merges stored %s with an assumed count', translation => {
  const view = render(<TrackTooltipProvider><Subject sequence={translation === 'MK*G' ? 'ATGAAATGAGGATAATGG' : 'ATGTGGGCT'} translation={translation} /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  expect(view.getByRole('tooltip').textContent).toContain("can't verify");
  expect(view.getByRole('tooltip').textContent).not.toContain('if table 1');
});

it('preserves the valid-code count', () => {
  const view = render(<TrackTooltipProvider><Subject sequence="ATGTGGGCT" table="11" /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  expect(view.getByRole('tooltip').textContent).toContain('3 aa');
  expect(view.getByRole('tooltip').textContent).not.toContain("can't verify");
});

it.each(['CDS', 'cds', 'ORF', 'orf', 'gene'])('gates the provisional count by coding type %s', type => {
  const view = render(<TrackTooltipProvider><Subject sequence="ATGTGGTAA" type={type} /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  const text = view.getByRole('tooltip').textContent!;
  expect(text.includes('if table 1')).toBe(type !== 'gene');
  expect(text.includes("can't verify")).toBe(type !== 'gene');
});

it('does not show a provisional nucleotide count on a protein record', () => {
  const view = render(<TrackTooltipProvider><Subject sequence="ATGTGGTAA" moleculeType="protein" /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  const text = view.getByRole('tooltip').textContent!;
  expect(text).not.toContain('if table 1');
  expect(text).not.toContain("can't verify");
});

it.each(['?', '.'] as const)('retains the unverifiable metric without assuming orientation %s', orientation => {
  const view = render(<TrackTooltipProvider><Subject sequence="ATGTGGTAA" orientation={orientation} /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  const text = view.getByRole('tooltip').textContent!;
  expect(text).toContain("can't verify");
  expect(text).not.toContain('if table 1');
  expect(text).not.toContain('Assumed table 1');
});

it('uses an explicit reverse strand for its provisional count', () => {
  expect(oracle('TTACCACAT')).toBe('3 aa if table 1');
  const view = render(<TrackTooltipProvider><Subject sequence="ATGTGGTAA" orientation={-1} /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  const text = view.getByRole('tooltip').textContent!;
  expect(text).toContain("can't verify");
  expect(text).toContain('3 aa if table 1');
});
