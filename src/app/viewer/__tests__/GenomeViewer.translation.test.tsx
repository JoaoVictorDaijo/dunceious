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
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, fireEvent, installCanvasRecorder, stubResizeObserver } from '@/src/app/testing/renderHarness';
import GenomeViewer from '../GenomeViewer';
import type { SeqRecord } from '@/src/domain/bio/types';

beforeEach(() => {
  installCanvasRecorder();
  stubResizeObserver();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
});
afterEach(() => { vi.restoreAllMocks(); });

function setup(showTranslation = true, moleculeType: SeqRecord['moleculeType'] = 'dna') {
  const records: SeqRecord[] = ['first', 'second'].map(id => ({
    id, name: id, sequence: 'A'.repeat(1000), moleculeType, features: [
      { type: 'CDS', name: 'fwd', start: 0, end: 300, strand: 1 },
      { type: 'CDS', name: 'rev', start: 0, end: 300, strand: -1 },
    ],
  }));
  return render(<GenomeViewer onClearSelection={() => {}} comparisonMenu={null} records={records} consensus={records[0].sequence}
    showAnnotations={false} showTranslation={showTranslation} showTracks={false} showConservation={false}
    dragMode="pan" activeSelection={null} onSelectionChange={() => {}} onExportFasta={() => {}}
    onAddAnnotation={() => {}} searchResults={[]} currentSearchIdx={-1} />);
}

const row = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLElement>(`[data-viewer-record="${id}"]`)!;

it('opens and closes virtualized rows when zoom crosses the drawing threshold', () => {
  const view = setup();
  const first = row(view.container, 'first');
  const second = row(view.container, 'second');
  const sequence = first.querySelector<HTMLCanvasElement>('[data-sequence-band]')!;
  const forward = first.querySelector<HTMLElement>('[data-translation-band="forward"]')!;
  // Virtualized row bounds must follow translation lanes so adjacent records cannot overlap.
  expect(first.style.height).toBe('42px');
  expect(second.style.transform).toBe('translateY(42px)');
  expect(forward.getAttribute('aria-hidden')).toBe('true');

  for (let i = 0; i < 8; i++) fireEvent.click(view.getByRole('button', { name: 'Zoom in' }));
  expect(first.style.height).toBe('42px');
  fireEvent.click(view.getByRole('button', { name: 'Zoom in' }));
  // One forward and one reverse row: only the lanes the record's CDSs use.
  expect(first.style.height).toBe('78px');
  expect(second.style.transform).toBe('translateY(78px)');
  expect(sequence.style.transform).toBe('translateY(18px)');
  expect(forward.getAttribute('aria-hidden')).toBe('false');

  fireEvent.click(view.getByRole('button', { name: 'Zoom out' }));
  expect(first.style.height).toBe('42px');
  expect(second.style.transform).toBe('translateY(42px)');
  expect(sequence.style.transform).toBe('translateY(0px)');
  expect(sequence.getAttribute('data-state')).toBe('translation-enabled');
  expect(first.querySelector('[data-translation-band="forward"]')).toBe(forward);
  expect(forward.style.opacity).toBe('0');
  expect(forward.getAttribute('aria-hidden')).toBe('true');
});

it.each([
  [false, 'dna'],
  [true, 'protein'],
] as const)('keeps rows collapsed with toggle %s and molecule %s', (showTranslation, moleculeType) => {
  const view = setup(showTranslation, moleculeType);
  for (let i = 0; i < 9; i++) fireEvent.click(view.getByRole('button', { name: 'Zoom in' }));
  expect(row(view.container, 'first').style.height).toBe('42px');
  expect(row(view.container, 'second').style.transform).toBe('translateY(42px)');
  expect(view.container.querySelector('[data-translation-band][aria-hidden="false"]')).toBeNull();
});

it('explains on the translation band when a CDS names a genetic code NCBI does not define', () => {
  const records: SeqRecord[] = [{
    id: 'odd', name: 'odd', sequence: 'ATG'.repeat(300), moleculeType: 'dna',
    features: [{ type: 'CDS', name: 'odd', start: 0, end: 300, strand: 1, metadata: { transl_table: '7' } }],
  }];
  const view = render(<GenomeViewer onClearSelection={() => {}} comparisonMenu={null} records={records} consensus={records[0].sequence}
    showAnnotations={false} showTranslation showTracks={false} showConservation={false}
    dragMode="pan" activeSelection={null} onSelectionChange={() => {}} onExportFasta={() => {}}
    onAddAnnotation={() => {}} searchResults={[]} currentSearchIdx={-1} />);
  expect(view.container.querySelector('[data-genetic-code-warning]')).toBeNull();
  for (let i = 0; i < 9; i++) fireEvent.click(view.getByRole('button', { name: 'Zoom in' }));
  const warning = view.container.querySelector<HTMLElement>('[data-genetic-code-warning]');
  expect(warning?.dataset.tip).toBe('⚠ /transl_table=7 is not an NCBI genetic code; codons are not translated');
});

it('covers both spans of an origin-crossing CDS with the genetic-code warning', () => {
  const records: SeqRecord[] = [{
    id: 'wrap', name: 'wrap', sequence: 'ATG'.repeat(40), moleculeType: 'dna',
    features: [{ type: 'CDS', name: 'wrap', start: 90, end: 9, strand: 1, metadata: { transl_table: '7' },
      segments: [{ start: 90, end: 120 }, { start: 0, end: 9 }] }],
  }];
  const view = render(<GenomeViewer onClearSelection={() => {}} comparisonMenu={null} records={records} consensus={records[0].sequence}
    showAnnotations={false} showTranslation showTracks={false} showConservation={false}
    dragMode="pan" activeSelection={null} onSelectionChange={() => {}} onExportFasta={() => {}}
    onAddAnnotation={() => {}} searchResults={[]} currentSearchIdx={-1} />);
  for (let i = 0; i < 9; i++) fireEvent.click(view.getByRole('button', { name: 'Zoom in' }));
  const spans = [...view.container.querySelectorAll<HTMLElement>('[data-genetic-code-warning]')];
  expect(spans).toHaveLength(2);
  const lefts = spans.map(span => parseFloat(span.style.left)).sort((a, b) => a - b);
  expect(lefts[0]).toBeLessThan(lefts[1]);
});
