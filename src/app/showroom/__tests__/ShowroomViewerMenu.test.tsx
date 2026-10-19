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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, installCanvasRecorder, render, stubResizeObserver } from '@/src/app/testing/renderHarness';
import { UiEffectsContext } from '@/src/app/components/uiEffects';
import GenomeViewer from '@/src/app/viewer/GenomeViewer';
import type { SelectionArea, SeqRecord } from '@/src/domain/bio/types';
import type { ExplainId } from '../explanations';
import { useShowroomUiEffects } from '../useShowroomUiEffects';

const writeText = vi.fn().mockResolvedValue(undefined);
const records: SeqRecord[] = [{ id: 'wuhan', name: 'wuhan', sequence: 'ACGTACGT', alignedSequence: 'ACGTACGT', features: [] }];
const selection: SelectionArea = { start: 2, end: 6, recordIds: ['wuhan'] };

beforeEach(() => {
  installCanvasRecorder();
  stubResizeObserver();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
  writeText.mockClear();
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/**
 * `useShowroomGuards` keeps this menu from opening at all, which is the first line of
 * defence; this mounts the viewer under the showroom's own effects and opens the menu
 * anyway, so the promise does not rest on the event guard alone.
 */
function ForcedMenu({ explain, onRemoveRecord }: { explain: (id: ExplainId) => void; onRemoveRecord: (id: string) => void }) {
  const effects = useShowroomUiEffects(explain, false, null);
  return <UiEffectsContext.Provider value={effects}>
    <GenomeViewer onClearSelection={() => {}} comparisonMenu={null} records={records} consensus="ACGTACGT"
      showAnnotations={false} showTranslation={false} showTracks={false} showConservation={false}
      dragMode="pan" activeSelection={selection} onSelectionChange={() => {}} onExportFasta={() => {}}
      onAddAnnotation={() => {}} searchResults={[]} currentSearchIdx={-1} onRemoveRecord={onRemoveRecord} />
  </UiEffectsContext.Provider>;
}

describe("the viewer's record menu under the showroom's effects", () => {
  it('explains instead of writing the clipboard or confirming a removal', async () => {
    const explain = vi.fn();
    const onRemoveRecord = vi.fn();
    const nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const view = render(<ForcedMenu explain={explain} onRemoveRecord={onRemoveRecord} />);
    const open = () => fireEvent.contextMenu(view.container.querySelector<HTMLElement>('[data-viewer-record="wuhan"]')!);

    open();
    await act(async () => { fireEvent.click(view.getByRole('button', { name: /Copy Sequence/ })); });
    expect(explain).toHaveBeenCalledExactlyOnceWith('copy');
    expect(writeText).not.toHaveBeenCalled();

    open();
    fireEvent.click(view.getByRole('button', { name: /Remove Sequence/ }));
    expect(explain.mock.calls).toEqual([['copy'], ['remove-record']]);
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(onRemoveRecord).not.toHaveBeenCalled();
  });
});
