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
  if (last?.size === 1 && last.has('_')) positions.pop();
  const stops = positions.filter(p => p.size === 1 && p.has('_')).length;
  return stops ? `${positions.length} positions, ${stops} stop${stops === 1 ? '' : 's'}` : `${positions.length} aa`;
}

it.each([
  ['ATGTGGTAA', '2 aa'],
  ['ATGTGATGG', '3 positions, 1 stop'],
  ['ATGTGNTGG', '3 aa'],
  ['ATGTGGTGN', '3 aa'],
  ['ATGGCNTAA', '2 aa'],
  ['ATGTGATAATGG', '4 positions, 2 stops'],
  ['ATGTGGTAR', '2 aa'],
])('labels the provisional count for %s', (sequence, expected) => {
  expect(oracle(sequence)).toBe(expected);
  const view = render(<TrackTooltipProvider><Subject sequence={sequence} /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  const tip = view.getByRole('tooltip');
  const count = tip.querySelector<HTMLElement>('[data-unverified-count]')!;
  expect(count?.textContent).toBe(expected);
  for (const token of ['italic', 'underline', 'decoration-dotted']) expect(count.classList.contains(token)).toBe(true);
  const reason = document.getElementById(count.getAttribute('aria-describedby')!)!;
  expect(tip.contains(reason)).toBe(true);
  expect(reason.textContent).toContain('/transl_table=99 is not an NCBI genetic code');
  expect(reason.textContent).toContain('table 1 assumed');
  expect(tip.querySelectorAll('[data-unverified-count]')).toHaveLength(1);
  expect(tip.textContent).not.toContain("can't verify");
  expect(tip.textContent).not.toContain('Assumed table 1');
  expect(tip.textContent).not.toContain('ambiguous');
  expect(tip.textContent).not.toContain('end uncertain');
});

it.each([
  ['MVA', '3 aa'], ['M', '1 aa'], ['MK*G', '4 positions, 1 stop'],
  ['MVA*', '3 aa'], ['MK*G*', '4 positions, 1 stop'],
])('shows only the stored protein length for %s', (translation, expected) => {
  const view = render(<TrackTooltipProvider><Subject sequence={translation === 'MVA' || translation === 'M' ? 'ATGTGGGCT' : 'ATGAAATGAGGATAATGG'} translation={translation} /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  const tip = view.getByRole('tooltip');
  const count = tip.querySelector<HTMLElement>('[data-unverified-count]')!;
  expect(count?.textContent).toBe(expected);
  for (const token of ['italic', 'underline', 'decoration-dotted']) expect(count.classList.contains(token)).toBe(true);
  const reason = document.getElementById(count.getAttribute('aria-describedby')!)!;
  expect(tip.contains(reason)).toBe(true);
  expect(reason.textContent).toContain("annotation's /translation");
  expect(reason.textContent).toContain("can't be checked against the DNA");
  expect(reason.textContent).toContain('/transl_table=99 is not an NCBI genetic code');
  expect(tip.querySelectorAll('[data-unverified-count]')).toHaveLength(1);
  expect(tip.textContent).not.toContain('table 1');
  expect(tip.textContent).not.toContain("can't verify");
});

it('preserves the valid-code count', () => {
  const view = render(<TrackTooltipProvider><Subject sequence="ATGTGGGCT" table="11" /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  expect(view.getByRole('tooltip').textContent).toContain('3 aa');
  expect(view.getByRole('tooltip').textContent).not.toContain("can't verify");
  expect(view.getByRole('tooltip').querySelector('[data-unverified-count]')).toBeNull();
  expect(view.getByRole('tooltip').querySelector('[data-count-reason]')).toBeNull();
});

it.each(['CDS', 'cds', 'ORF', 'orf', 'gene'])('gates the provisional count by coding type %s', type => {
  const view = render(<TrackTooltipProvider><Subject sequence="ATGTGGTAA" type={type} /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  const text = view.getByRole('tooltip').textContent!;
  expect(!!view.getByRole('tooltip').querySelector('[data-unverified-count]')).toBe(type !== 'gene');
  if (type !== 'gene') expect(text).toContain('table 1 assumed');
  expect(text).not.toContain("can't verify");
});

it('does not show a provisional nucleotide count on a protein record', () => {
  const view = render(<TrackTooltipProvider><Subject sequence="ATGTGGTAA" moleculeType="protein" /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  const text = view.getByRole('tooltip').textContent!;
  expect(text).not.toContain('if table 1');
  expect(text).not.toContain("can't verify");
  expect(view.getByRole('tooltip').querySelector('[data-unverified-count]')).toBeNull();
  expect(view.getByRole('tooltip').querySelector('[data-count-reason]')).toBeNull();
  expect(text).toContain('9 aa');
});

it.each([
  { orientation: '?' as const, translation: undefined }, { orientation: '.' as const, translation: undefined },
  { orientation: '?' as const, translation: 'MVA' }, { orientation: '.' as const, translation: 'MVA' },
])('shows no count or orientation assumption for $orientation with stored $translation', ({ orientation, translation }) => {
  const view = render(<TrackTooltipProvider><Subject sequence="ATGTGGTAA" orientation={orientation} translation={translation} /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  const tip = view.getByRole('tooltip');
  expect(tip.querySelector('[data-unverified-count]')).toBeNull();
  expect(tip.textContent).toContain('/transl_table=99 is not an NCBI genetic code.');
  expect(tip.textContent).not.toMatch(/\d+ (?:aa|positions)/);
  expect(tip.textContent).not.toContain('table 1');
  expect(tip.textContent).not.toContain("can't verify");
});

it('uses an explicit reverse strand for its provisional count', () => {
  expect(oracle('TTACCACAT')).toBe('3 aa');
  const view = render(<TrackTooltipProvider><Subject sequence="ATGTGGTAA" orientation={-1} /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  const text = view.getByRole('tooltip').textContent!;
  expect(view.getByRole('tooltip').querySelector('[data-unverified-count]')?.textContent).toBe('3 aa');
  expect(text).toContain('table 1 assumed');
  expect(text).not.toContain("can't verify");
});
