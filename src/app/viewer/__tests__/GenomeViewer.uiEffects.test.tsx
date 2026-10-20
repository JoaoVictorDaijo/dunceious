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
import { DEFAULT_UI_EFFECTS, UiEffectsContext, type UiEffects } from '@/src/app/components/uiEffects';
import GenomeViewer from '../GenomeViewer';
import type { SeqRecord, SelectionArea } from '@/src/domain/bio/types';

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  installCanvasRecorder();
  stubResizeObserver();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
  writeText.mockClear();
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const records: SeqRecord[] = [
  { id: 'wuhan', name: 'wuhan', sequence: 'ACGTACGT', alignedSequence: 'ACGTACGT', features: [] },
];
// A standing selection is what enables the menu's Copy Sequence on a record row.
const selection: SelectionArea = { start: 2, end: 6, recordIds: ['wuhan'] };

function setup(effects: Partial<UiEffects>, onRemoveRecord = vi.fn()) {
  const view = render(<UiEffectsContext.Provider value={{ ...DEFAULT_UI_EFFECTS, ...effects }}>
    <GenomeViewer onClearSelection={() => {}} comparisonMenu={null} records={records} consensus="ACGTACGT"
      showAnnotations={false} showTranslation={false} showTracks={false} showConservation={false}
      dragMode="pan" activeSelection={selection} onSelectionChange={() => {}} onExportFasta={() => {}}
      onAddAnnotation={() => {}} searchResults={[]} currentSearchIdx={-1} onRemoveRecord={onRemoveRecord} />
  </UiEffectsContext.Provider>);
  // The showroom keeps this menu shut with a capture-phase guard; opening it here is the point,
  // so the guarantee is tested at the component rather than at the guard.
  fireEvent.contextMenu(view.container.querySelector<HTMLElement>('[data-viewer-record="wuhan"]')!);
  return { view, onRemoveRecord };
}

describe('the viewer record menu through UiEffectsContext', () => {
  it('a host that declines both keeps the clipboard and the native dialog out of it', async () => {
    const confirm = vi.fn(() => false);
    const copyText = vi.fn().mockResolvedValue(false);
    const nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { view, onRemoveRecord } = setup({ confirm, copyText });

    fireEvent.click(view.getByRole('button', { name: /Remove Sequence/ }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith('Remove sequence "wuhan" from project?');
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(onRemoveRecord).not.toHaveBeenCalled();

    // Remove closes the menu whatever the answer was, so Copy needs it open again.
    fireEvent.contextMenu(view.container.querySelector<HTMLElement>('[data-viewer-record="wuhan"]')!);
    await act(async () => { fireEvent.click(view.getByRole('button', { name: /Copy Sequence/ })); });
    expect(copyText).toHaveBeenCalledExactlyOnceWith('GTAC');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('the workbench default still confirms and writes the clipboard itself', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { view, onRemoveRecord } = setup({});

    await act(async () => { fireEvent.click(view.getByRole('button', { name: /Copy Sequence/ })); });
    expect(writeText).toHaveBeenCalledExactlyOnceWith('GTAC');

    fireEvent.contextMenu(view.container.querySelector<HTMLElement>('[data-viewer-record="wuhan"]')!);
    fireEvent.click(view.getByRole('button', { name: /Remove Sequence/ }));
    expect(nativeConfirm).toHaveBeenCalledExactlyOnceWith('Remove sequence "wuhan" from project?');
    expect(onRemoveRecord).toHaveBeenCalledExactlyOnceWith('wuhan');
  });
});
