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
    id, name: id, sequence: 'A'.repeat(1000), features: [], moleculeType,
  }));
  return render(<GenomeViewer records={records} consensus={records[0].sequence}
    showAnnotations={false} showTranslation={showTranslation} showTracks={false} showConservation={false}
    dragMode="pan" activeSelection={null} onSelectionChange={() => {}} onExportFasta={() => {}}
    onAddAnnotation={() => {}} searchResults={[]} currentSearchIdx={-1} />);
}

const row = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-tip="${id}"]`)!.parentElement!.parentElement!;

it('opens and closes virtualized rows when zoom crosses the drawing threshold', () => {
  const view = setup();
  const first = row(view.container, 'first');
  const second = row(view.container, 'second');
  const sequence = first.querySelector<HTMLCanvasElement>('[data-sequence-band]')!;
  const forward = first.querySelector<HTMLElement>('.translation-band')!;
  expect(first.style.height).toBe('42px');
  expect(second.style.transform).toBe('translateY(42px)');
  expect(forward.getAttribute('aria-hidden')).toBe('true');

  for (let i = 0; i < 8; i++) fireEvent.click(view.getByRole('button', { name: 'Zoom in' }));
  expect(first.style.height).toBe('42px');
  fireEvent.click(view.getByRole('button', { name: 'Zoom in' }));
  expect(first.style.height).toBe('150px');
  expect(second.style.transform).toBe('translateY(150px)');
  expect(sequence.style.transform).toBe('translateY(54px)');
  expect(forward.getAttribute('aria-hidden')).toBe('false');

  fireEvent.click(view.getByRole('button', { name: 'Zoom out' }));
  expect(first.style.height).toBe('42px');
  expect(second.style.transform).toBe('translateY(42px)');
  expect(sequence.style.transform).toBe('translateY(0px)');
  expect(sequence.classList.contains('translation-motion')).toBe(true);
  expect(first.querySelector('.translation-band')).toBe(forward);
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
  expect(view.container.querySelector('.translation-band[aria-hidden="false"]')).toBeNull();
});
