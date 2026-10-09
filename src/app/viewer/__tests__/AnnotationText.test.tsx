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
import { render } from '@/src/app/testing/renderHarness';
import { AnnotationText } from '../AnnotationText';
import type { BioFeature } from '@/src/domain/bio/types';

const feature: BioFeature = { name: 'Synthetic primer', type: 'primer', start: 0, end: 6, strand: 1 };
function show(overrides: Partial<Parameters<typeof AnnotationText>[0]> = {}) {
  return render(<svg><AnnotationText feature={feature} sequence="AACGTA" start={0} end={6} y={0} zoom={30} scrollX={0} viewportWidth={1000} {...overrides} /></svg>);
}
const bases = (container: HTMLElement) => [...container.querySelectorAll('[data-annotation-base]')].map(t => t.textContent).join('');

describe('annotation bases at genomic screen coordinates', () => {
  it('renders the name, forward direction and the complete annotated region', () => {
    const { container } = show();
    expect(container.querySelector('[data-annotation-name]')?.textContent).toBe('Synthetic primer');
    expect(container.querySelector('[data-annotation-direction]')?.textContent).toBe('Forward (+) 5′ → 3′');
    expect(bases(container)).toBe('AACGTA');
  });
  it('complements reverse bases in place, rather than reversing or reverse-complementing screen coordinates', () => {
    const { container } = show({ feature: { ...feature, strand: -1 } });
    expect(bases(container)).toBe('TTGCAT');
    expect(container.querySelector('[data-annotation-direction]')?.textContent).toBe('Reverse (−) 3′ ← 5′');
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
    const { container } = show({ feature: { ...feature, metadata: { _gffStrand: raw } }, zoom: 60 });
    expect(bases(container)).toBe('AACGTA');
    expect(container.textContent).not.toMatch(/[35]′|Forward|Reverse/);
    expect(container.textContent).toContain(raw === '.' ? 'Unstranded' : 'Unknown');
  });
  it('does not apply nucleotide direction or complement to a protein', () => {
    const { container } = show({ feature: { ...feature, strand: -1 }, moleculeType: 'protein', sequence: 'MKWVTA' });
    expect(bases(container)).toBe('MKWVTA');
    expect(container.textContent).not.toMatch(/[35]′|Forward|Reverse/);
  });
  it('keeps name/direction but hides unreadable bases at low zoom', () => {
    const { container } = show({ end: 50, zoom: 6 });
    expect(bases(container)).toBe('');
    expect(container.textContent).toContain('Synthetic primer');
  });
  it('clips long names without extending outside a short feature', () => {
    const { container } = show({ zoom: 8 });
    expect(container.querySelector('[data-annotation-name]')?.textContent).toBe('Synt…');
    expect(container.querySelector('svg[aria-label]')?.getAttribute('width')).toBe('48');
  });
  it('draws only visible bases when panning, keeping the label inside the viewport', () => {
    const { container } = show({ sequence: 'A'.repeat(100000), end: 100000, scrollX: 30000, viewportWidth: 60 });
    expect(bases(container)).toBe('AA');
    const indices = [...container.querySelectorAll('[data-annotation-base]')].map(t => t.getAttribute('data-annotation-base'));
    expect(indices).toEqual(['1000', '1001']);
    expect(container.querySelector('svg[aria-label]')?.getAttribute('x')).toBe('0');
  });
  it('does not mutate sequence, qualifiers or coordinates', () => {
    const original = structuredClone(feature);
    Object.freeze(original);
    show({ feature: original });
    expect(original).toEqual(feature);
  });
});
