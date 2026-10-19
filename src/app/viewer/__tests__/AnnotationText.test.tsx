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
import { describe, expect, it } from 'vitest';
import { render, within } from '@/src/app/testing/renderHarness';
import { complementAlphabet } from '@/src/domain/bio/sequence';
import { AnnotationText } from '../AnnotationText';
import type { BioFeature } from '@/src/domain/bio/types';

// Bases are opt-in per annotation; these tests exercise drawing them, so switch them on.
const feature: BioFeature = { name: 'Synthetic primer', type: 'primer', start: 0, end: 6, strand: 1, metadata: { _showBases: '1' } };
function show(overrides: Partial<Parameters<typeof AnnotationText>[0]> = {}) {
  const sequence = overrides.sequence ?? 'AACGTA';
  const alphabet = overrides.moleculeType === 'protein' ? 'protein' : complementAlphabet(sequence, overrides.moleculeType);
  return render(<svg><AnnotationText alphabet={alphabet} feature={feature} sequence="AACGTA" start={0} end={6} y={0} zoom={30} scrollX={0} viewportWidth={1000} expanded {...overrides} /></svg>);
}
const bases = (container: HTMLElement) => [...container.querySelectorAll('[data-annotation-base]')].map(t => t.textContent).join('');

describe('annotation bases at genomic screen coordinates', () => {
  it('spells the direction out when the bar is wide enough', () => {
    const { container } = show({ zoom: 60 });
    expect(within(container).getByText('Forward (+) 5′ → 3′')).toBeTruthy();
  });
  it('drops the direction text before truncating a narrow name', () => {
    const { container } = show({ zoom: 20 });
    expect(within(container).queryByText(/Forward|5′→3′/)).toBeNull();
    expect(within(container).getByText('Synthetic primer')).toBeTruthy();
  });
  it('draws no bases while the bar is closed', () => {
    const { container } = show({ expanded: false });
    expect(within(container).getByText('Synthetic primer')).toBeTruthy();
    expect(bases(container)).toBe('');
  });
  it('renders the name, forward direction and the complete annotated region', () => {
    const { container } = show();
    expect(within(container).getByText('Synthetic primer')).toBeTruthy();
    // 180px leaves room for the short direction only; the arrow head carries the rest.
    expect(within(container).getByText('5′→3′')).toBeTruthy();
    expect(bases(container)).toBe('AACGTA');
  });
  it('complements reverse bases in place, rather than reversing or reverse-complementing screen coordinates', () => {
    const { container } = show({ feature: { ...feature, strand: -1 } });
    expect(bases(container)).toBe('TTGCAT');
    expect(within(container).getByText('3′←5′')).toBeTruthy();
    // Complementation preserves each base's genomic screen position.
    expect(container.querySelector('[data-annotation-base="0"]')?.getAttribute('x')).toBe('15');
  });
  it('preserves RNA U and lowercase/IUPAC letters', () => {
    const { container } = show({ feature: { ...feature, strand: -1 }, sequence: 'aAUrYn', moleculeType: 'rna' });
    expect(bases(container)).toBe('uUAyRn');
  });
  it('uses an explicit segment strand before the parent strand', () => {
    const { container } = show({ strand: -1 });
    expect(bases(container)).toBe('TTGCAT');
  });
  it.each(['.', '?'])('does not invent direction for GFF %s', raw => {
    const { container } = show({ feature: { ...feature, metadata: { _showBases: '1', _gffStrand: raw } }, zoom: 60 });
    expect(bases(container)).toBe('AACGTA');
    expect(container.textContent).not.toMatch(/[35]′|Forward|Reverse/);
    expect(container.textContent).toContain(raw === '.' ? 'Unstranded' : 'Unknown');
  });
  it('does not apply nucleotide direction or complement to a protein', () => {
    const { container } = show({ feature: { ...feature, strand: -1 }, moleculeType: 'protein', sequence: 'MKWVTA' });
    expect(bases(container)).toBe('MKWVTA');
    expect(container.textContent).not.toMatch(/[35]′|Forward|Reverse/);
  });
  it('clips long names without extending outside a short feature', () => {
    const { container } = show({ zoom: 8 });
    expect(within(container).getByText('Synt…')).toBeTruthy();
    // Label clipping must stay within the biological feature's screen span.
    expect(within(container).getByLabelText('Synthetic primer: Forward (+) 5′ → 3′').getAttribute('width')).toBe('48');
  });
  it('draws only visible bases when panning, keeping the label inside the viewport', () => {
    const { container } = show({ sequence: 'A'.repeat(100000), end: 100000, scrollX: 30000, viewportWidth: 60 });
    expect(bases(container)).toBe('AA');
    const indices = [...container.querySelectorAll('[data-annotation-base]')].map(t => t.getAttribute('data-annotation-base'));
    expect(indices).toEqual(['1000', '1001']);
    expect(within(container).getByLabelText('Synthetic primer: Forward (+) 5′ → 3′').getAttribute('x')).toBe('0');
  });
  it('does not mutate sequence, qualifiers or coordinates', () => {
    const original = structuredClone(feature);
    Object.freeze(original);
    show({ feature: original });
    expect(original).toEqual(feature);
  });
});


it('displays minus-strand bases of T-written RNA in the record alphabet', () => {
  const { container } = show({ feature: { ...feature, strand: -1 }, sequence: 'TA', end: 2, moleculeType: 'rna' });
  expect(bases(container)).toBe('AT');
});

it('draws reverse T-written RNA query letters as AT and suppresses stale layers', () => {
  const provenance = { v: 1, query: 'TA', mode: 'whole', alphabet: 'nucleotide', params: {}, strand: -1, cigar: '2=', span: { start: 0, end: 2, strand: -1 }, appVersion: '3.4.0', createdAt: '2026-10-16', exportNote: false };
  const f = { ...feature, start: 0, end: 2, strand: -1 as const, metadata: { _showBases: 'query', _searchHit: JSON.stringify(provenance) } };
  const { container, rerender } = show({ feature: f, sequence: 'TA', moleculeType: 'rna', end: 2 });
  expect(container.querySelector('[data-annotation-query]')).toBeTruthy();
  expect(bases(container)).toBe('AT');
  rerender(<svg><AnnotationText feature={{ ...f, end: 1 }} sequence="TA" alphabet="dna" start={0} end={1} y={0} zoom={30} scrollX={0} viewportWidth={100} expanded /></svg>);
  expect(container.querySelector('[data-annotation-query]')).toBeNull();
  expect(bases(container)).toBe('');
});

it('maps a query layer across aligned gaps and keeps reverse mismatches in query column order', () => {
  const provenance = { v: 1, query: 'ATAT', mode: 'whole', alphabet: 'nucleotide', params: {}, strand: -1, cigar: '1=1X1I1D1=', span: { start: 0, end: 4, strand: -1 }, appVersion: '3.4.0', createdAt: '2026-10-16', exportNote: false };
  const f = { ...feature, start: 1, end: 7, strand: -1 as const, segments: [{ start: 1, end: 7 }], metadata: { _showBases: 'query', _searchHit: JSON.stringify(provenance) } };
  const { container } = show({ feature: f, sequence: '-AC-G-T-', start: 1, end: 7 });
  expect(bases(container)).toBe('T−TA');
  expect(container.querySelector('[data-annotation-base="3"]')).toBeNull();
  expect(container.querySelector('[data-annotation-base="5"]')).toBeNull();
  expect(container.querySelector('[data-annotation-insertion]')?.getAttribute('data-annotation-insertion')).toBe('A');
});

it('outlines a similar Local query column while leaving identical neighbours unoutlined', () => {
  const provenance = { v: 1, query: 'DDDDEDDDD', mode: 'local', alphabet: 'protein', params: { scoring: 'EBLOSUM62' }, strand: 1, cigar: '4=1X4=', span: { start: 0, end: 9, strand: 1 }, appVersion: '3.4.0', createdAt: '2026-10-16', exportNote: false };
  const f = { ...feature, end: 9, metadata: { _showBases: 'query', _searchHit: JSON.stringify(provenance) } };
  const { container } = show({ feature: f, sequence: 'DDDDDDDDD', moleculeType: 'protein', end: 9 });
  expect(bases(container)).toBe('DDDDEDDDD');
  const outlines = [...container.querySelectorAll('[data-annotation-query] rect')];
  expect(outlines).toHaveLength(1);
  expect(outlines[0].getAttribute('stroke-dasharray')).toBe('3,2');
  expect(outlines[0].getAttribute('stroke')).toBe('#0f172a');
  expect(outlines[0].getAttribute('fill')).toBe('none');
  expect(outlines[0].getAttribute('x')).toBe('121');
  expect(outlines[0].getAttribute('width')).toBe('28');
  expect(container.querySelector('[data-annotation-base="4"]')?.textContent).toBe('E');
});
