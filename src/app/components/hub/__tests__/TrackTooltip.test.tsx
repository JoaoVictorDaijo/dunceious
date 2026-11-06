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
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';

function Subject({ sequence, translation, type = 'CDS', table = '99', moleculeType = 'dna', orientation = 1, codonStart }: { sequence: string; codonStart?: string; translation?: string; type?: string; table?: string; moleculeType?: 'dna' | 'protein'; orientation?: 1 | -1 | '.' | '?' }) {
  const update = useTrackTooltip();
  const feature: BioFeature = { segments: [{ start: 0, end: sequence.length }], type, name: 'test', start: 0, end: sequence.length, strand: typeof orientation === 'number' ? orientation : 1, metadata: { ...(translation ? { translation } : {}), transl_table: table, ...(codonStart !== undefined ? { codon_start: codonStart } : {}), ...(typeof orientation === 'string' ? { _gffStrand: orientation } : {}) } };
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

// LOC-2/LOC-7: an order() CDS defines no single sequence, so the tooltip derives no protein count
// from it, under a valid or an invalid genetic code (Codex review of #306).
function OrderSubject({ table }: { table: string }) {
  const update = useTrackTooltip();
  const feature: BioFeature = { type: 'CDS', name: 'o', start: 0, end: 9, strand: 1, operator: 'order',
    segments: [{ start: 0, end: 3 }, { start: 6, end: 9 }], metadata: { transl_table: table } };
  return <button onClick={() => update({ record: { id: 'r', name: 'r', sequence: 'AAACCCGGGTTT', features: [feature] }, feature, color: '#fff', x: 0, y: 0 }, feature)}>hover</button>;
}

it.each(['1', '999'])('shows no protein count for an order() CDS under table %s', table => {
  const view = render(<TrackTooltipProvider><OrderSubject table={table} /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  expect(view.getByRole('tooltip').textContent).not.toMatch(/\d aa|positions|Count not verified/);
  expect(view.getByRole('tooltip').textContent).toContain('6 bp in 2 intervals (not joined)');
});


it.each([
  { table: '1', translation: undefined }, { table: '99', translation: undefined },
  { table: '1', translation: 'M*K' }, { table: '99', translation: 'M*K' },
])('suppresses all amino-acid counts for an invalid frame under $table with stored $translation', ({ table, translation }) => {
  const view = render(<TrackTooltipProvider><Subject sequence="ATGTGAAAA" table={table} translation={translation} codonStart="0" /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  const tip = view.getByRole('tooltip');
  expect(tip.textContent).toContain('/codon_start=0 is invalid; codons are not translated');
  expect(tip.textContent).not.toMatch(/\d+ (?:aa|positions)/);
  expect(tip.textContent).not.toContain('table 1 assumed');
  expect(tip.querySelector('[data-unverified-count]')).toBeNull();
});

it.each([
  ['ATGTAA', undefined, '1 aa'], ['ATGTAA', 'M', '1 aa'],
  ['ATGTAAGGGTAA', 'MXG', '3 positions, 1 internal stop'],
])('counts current conceptual positions for %s with stored %s', (sequence, translation, count) => {
  const view = render(<TrackTooltipProvider><Subject sequence={sequence!} table="1" translation={translation} /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  expect(view.getByRole('tooltip').textContent).toContain(count);
});

function ContextSubject({ record, feature }: { record: SeqRecord; feature: BioFeature }) {
  const update = useTrackTooltip();
  return <button onClick={() => update({ record, feature, color: '#fff', x: 0, y: 0 }, feature)}>hover</button>;
}

it.each([
  { sequence: 'ATGTAA', translation: undefined, expected: '1 aa' },
  { sequence: 'ATGTAA', translation: 'M', expected: '1 aa' },
  { sequence: 'ATGTAAGGGTAA', translation: undefined, expected: '3 positions, 1 internal stop' },
])('counts DNA-derived positions for $sequence with stored $translation', ({ sequence, translation, expected }) => {
  const view = render(<TrackTooltipProvider><Subject sequence={sequence} translation={translation} table="1" /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  const length = view.getByText('Length').nextElementSibling!;
  expect(length.textContent).toBe(`${sequence.length} bp · ${expected}`);
});

it.each([false, true])('uses record topology for a reversed interval (circular=%s)', isCircular => {
  const feature: BioFeature = { type: 'CDS', name: 'wrap', start: 3, end: 2, strand: 1, segments: [{ start: 3, end: 2 }] };
  const record: SeqRecord = { id: 'r', name: 'r', sequence: 'TAAATG', isCircular, features: [feature] };
  const view = render(<TrackTooltipProvider><ContextSubject record={record} feature={feature} /></TrackTooltipProvider>);
  fireEvent.click(view.getByText('hover'));
  const length = view.getByText('Length').nextElementSibling!;
  expect(length.textContent).toBe(isCircular ? '5 bp · 1 aa' : '5 bp');
});
