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

const records: SeqRecord[] = [
  { id: 'wuhan', name: 'wuhan', sequence: 'ACGT', alignedSequence: 'ACGT', features: [] },
  { id: 'alpha', name: 'alpha', sequence: 'ACGA', alignedSequence: 'ACGA', features: [] },
  { id: 'raw', name: 'raw', sequence: 'ACGT', features: [] },
];

function setup(onSetComparisonReference?: (id: string) => void) {
  return render(<GenomeViewer records={records} consensus="ACGT"
    showAnnotations={false} showTranslation={false} showTracks={false} showConservation={false}
    dragMode="pan" activeSelection={null} onSelectionChange={() => {}} onExportFasta={() => {}}
    onAddAnnotation={() => {}} searchResults={[]} currentSearchIdx={-1}
    onSetComparisonReference={onSetComparisonReference} />);
}

const openMenu = (container: HTMLElement, id: string) =>
  fireEvent.contextMenu(container.querySelector<HTMLElement>(`[data-viewer-record="${id}"]`)!);

it('offers Use as Reference on an aligned record and reports that record', () => {
  const onSet = vi.fn();
  const view = setup(onSet);
  openMenu(view.container, 'alpha');
  fireEvent.click(view.getByRole('button', { name: /Use as Reference/ }));
  expect(onSet).toHaveBeenCalledWith('alpha');
  expect(view.queryByRole('button', { name: /Use as Reference/ })).toBeNull();
});

it('does not offer Use as Reference on an unaligned record', () => {
  const view = setup(vi.fn());
  openMenu(view.container, 'raw');
  expect(view.getByRole('button', { name: /View Details/ })).toBeTruthy();
  expect(view.queryByRole('button', { name: /Use as Reference/ })).toBeNull();
});

it('does not offer Use as Reference while no comparison is possible', () => {
  const view = setup(undefined);
  openMenu(view.container, 'alpha');
  expect(view.queryByRole('button', { name: /Use as Reference/ })).toBeNull();
});
