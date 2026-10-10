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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, installCanvasRecorder, stubResizeObserver } from '@/src/app/testing/renderHarness';
import GenomeViewer from '../GenomeViewer';
import type { SelectionArea, SeqRecord } from '@/src/domain/bio/types';
import type { FocusTarget } from '@/src/app/shared/logic/focusTarget';

beforeEach(() => {
  installCanvasRecorder();
  stubResizeObserver();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
});
afterEach(() => { vi.restoreAllMocks(); });

const records: SeqRecord[] = [{ id: 'r', name: 'r', sequence: 'A'.repeat(1000), features: [] }];
const focused: FocusTarget = { recordId: 'r', start: 100, end: 300, label: 'spike', length: 200 };
const asSelection = (t: FocusTarget): SelectionArea => ({ start: t.start, end: t.end, recordIds: [t.recordId] });

function viewer(activeSelection: SelectionArea | null, focusRequest: FocusTarget | null = null) {
  return <GenomeViewer records={records} consensus={records[0].sequence}
    showAnnotations showTranslation={false} showTracks={false} showConservation={false}
    dragMode="select" activeSelection={activeSelection} onSelectionChange={() => {}} onExportFasta={() => {}}
    onAddAnnotation={() => {}} searchResults={[]} currentSearchIdx={-1}
    focusRequest={focusRequest} focusedRegion={focused} />;
}

it('names the focused region once its flight is handled, and lets go when the selection is edited', () => {
  const view = render(viewer(asSelection(focused), focused));
  expect(view.queryByText('spike · 200 bp')).toBeNull();
  view.rerender(viewer(asSelection(focused)));
  expect(view.getByText('spike · 200 bp')).toBeTruthy();
  view.rerender(viewer({ ...asSelection(focused), end: 320 }));
  expect(view.queryByText('spike · 200 bp')).toBeNull();
});
