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
import { act, renderHook } from '@/src/app/testing/renderHarness';
import type { BioWorkerRequest, BioWorkerResponse } from '@/src/workers/protocol';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import type { SeqRecord } from '@/src/domain/bio/types';
import { useWorkspace, type WorkspaceOptions } from '../useWorkspace';

const lock = vi.hoisted(() => ({ locked: false }));
vi.mock('@/src/app/shared/hooks/useRemoteAlignment', async () => {
  const actual = await vi.importActual<typeof import('@/src/app/shared/hooks/useRemoteAlignment')>('@/src/app/shared/hooks/useRemoteAlignment');
  return {
    ...actual,
    useRemoteAlignment: (...args: Parameters<typeof actual.useRemoteAlignment>) => {
      const real = actual.useRemoteAlignment(...args);
      return { ...real, isLocked: () => lock.locked };
    },
  };
});

class LocalWorker {
  static bio: LocalWorker | null = null;
  onmessage: ((event: { data: BioWorkerResponse }) => void) | null = null;
  constructor() { if (!LocalWorker.bio) LocalWorker.bio = this; }
  postMessage(request: BioWorkerRequest) { queueMicrotask(() => this.onmessage?.({ data: handleBioMessage(request) })); }
  terminate() { this.onmessage = null; }
}

const records: SeqRecord[] = [
  { id: 'a', name: 'a', sequence: 'ACGTACGTAC', features: [] },
  { id: 'b', name: 'b', sequence: 'ACGTACGTAC', features: [] },
] as SeqRecord[];

async function setup(options: WorkspaceOptions = {}, loaded = true) {
  const hook = renderHook(() => useWorkspace(options));
  if (loaded) {
    await act(async () => LocalWorker.bio!.onmessage?.({ data: { type: 'PARSE_SUCCESS', records } as BioWorkerResponse }));
  }
  return hook;
}

beforeEach(() => { LocalWorker.bio = null; lock.locked = false; vi.stubGlobal('Worker', LocalWorker); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('useWorkspace', () => {
  it('focusOn calls onNavigateToViewer and selects the target', async () => {
    const onNavigateToViewer = vi.fn();
    const { result } = await setup({ onNavigateToViewer });
    const target = { recordId: 'a', start: 2, end: 6, label: 'x', length: 4 };
    act(() => result.current.focusOn(target));
    expect(onNavigateToViewer).toHaveBeenCalledOnce();
    expect(result.current.activeSelection).toEqual({ start: 2, end: 6, recordIds: ['a'] });
    expect(result.current.pendingFocus).toEqual(target);
  });

  it('selectSearchResult calls onNavigateToViewer', async () => {
    const onNavigateToViewer = vi.fn();
    const { result } = await setup({ onNavigateToViewer });
    const selection = { start: 1, end: 3, recordIds: ['b'] };
    act(() => result.current.selectSearchResult(selection));
    expect(onNavigateToViewer).toHaveBeenCalledOnce();
    expect(result.current.activeSelection).toEqual(selection);
  });

  it('handleClearSearch clears only the search-originated selection', async () => {
    const { result } = await setup();
    act(() => result.current.selectSearchResult({ start: 1, end: 3, recordIds: ['a'] }));
    act(() => result.current.handleClearSearch());
    expect(result.current.activeSelection).toBeNull();
    const manual = { start: 4, end: 5, recordIds: ['a'] };
    act(() => result.current.setActiveSelection(manual));
    act(() => result.current.handleClearSearch());
    expect(result.current.activeSelection).toEqual(manual);
  });

  it('removeRecord removes the record and reports it', async () => {
    const onRecordRemoved = vi.fn();
    const { result } = await setup({ onRecordRemoved });
    act(() => result.current.removeRecord('a'));
    expect(result.current.records.map(r => r.id)).toEqual(['b']);
    expect(onRecordRemoved).toHaveBeenCalledOnce();
    expect(onRecordRemoved).toHaveBeenCalledWith('a');
  });

  it('removeRecord is refused while a remote alignment is locked', async () => {
    const onRecordRemoved = vi.fn();
    const { result } = await setup({ onRecordRemoved });
    lock.locked = true;
    act(() => result.current.removeRecord('a'));
    expect(result.current.records.map(r => r.id)).toEqual(['a', 'b']);
    expect(onRecordRemoved).not.toHaveBeenCalled();
  });

  it('beforeunload is guarded only while records are loaded', async () => {
    const empty = await setup({}, false);
    const first = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(false);
    empty.unmount();
    LocalWorker.bio = null;
    await setup();
    const second = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(true);
  });
});
