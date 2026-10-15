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
import { it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@/src/app/testing/renderHarness';
import { useFileHandlers } from '../useFileHandlers';
import { downloadBlob } from '@/src/app/lib/download';
import type { SeqRecord } from '@/src/domain/bio/types';

vi.mock('@/src/app/lib/download', () => ({ downloadBlob: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

function setup(text: string) {
  const log = vi.fn();
  const setters = { setRecords: vi.fn(), setFeatureColors: vi.fn(), setActiveSelection: vi.fn(),
    setShowAnnotations: vi.fn(), setShowTranslation: vi.fn(), setShowConservation: vi.fn(), setIsProcessing: vi.fn() };
  const record: SeqRecord = { id: 'a', name: 'a', sequence: 'ACGT', features: [], importedFrom: 'a.fa', fileDetails: {}, label: 'sample' };
  const hook = renderHook(() => useFileHandlers({ current: null }, [record], null, { gene: '#abc' },
    { showAnnotations: false, showTranslation: false, showConservation: true }, setters, log, () => false,
    { requestBio: vi.fn(), getRecords: () => [record], readText: async () => text }));
  return { ...hook, setters, log, record };
}

it('saves format 2 and restores the same record fields and false toggles', async () => {
  vi.spyOn(window, 'prompt').mockReturnValue('Saved project');
  const saved = setup('');
  let fileName: string | null = null;
  act(() => { fileName = saved.result.current.exportProjectJson(); });
  expect(fileName).toBe('Saved_project.json');
  expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe('Saved_project.json');
  const text = vi.mocked(downloadBlob).mock.calls[0][0] as string;
  expect(JSON.parse(text)).toMatchObject({ format: 2, records: [saved.record] });
  const restored = setup(text);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await act(async () => { await restored.result.current.handleDroppedFiles([new File([], 'workspace.json')]); });
  expect(restored.setters.setRecords).toHaveBeenCalledWith([{ ...saved.record, visible: true }]);
  expect(restored.setters.setFeatureColors).toHaveBeenCalledWith({ gene: '#abc' });
  expect(restored.setters.setActiveSelection).toHaveBeenCalledWith(null);
  expect(restored.setters.setShowAnnotations).toHaveBeenCalledWith(false);
  expect(restored.setters.setShowTranslation).toHaveBeenCalledWith(false);
  expect(restored.setters.setShowConservation).toHaveBeenCalledWith(true);
});

it('refuses an earlier project before writing any workspace state', async () => {
  const { result, setters, log } = setup(JSON.stringify({ records: [{ id: 'old' }], featureColors: { gene: '#fff' } }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await act(async () => { await result.current.handleDroppedFiles([new File([], 'old.json')]); });
  expect(log).toHaveBeenCalledWith("This project was saved by an earlier version of Dunceious and can't be opened.");
  for (const [key, setter] of Object.entries(setters)) if (key !== 'setIsProcessing') expect(setter).not.toHaveBeenCalled();
});


it('rejects malformed optional feature values without replacing any workspace state', async () => {
  const { result, setters, log } = setup(JSON.stringify({ format: 2, records: [{ id: 'a', name: 'a', sequence: 'ACGT',
    features: [{ type: 'gene', name: 'g', start: 0, end: 4, strand: 1, locationString: {} }] }],
    featureColors: {}, showAnnotations: true, showTranslation: false, showConservation: false }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await act(async () => { await result.current.handleDroppedFiles([new File([], 'broken.json')]); });
  expect(log).toHaveBeenCalledWith('This project file contains invalid workspace data.');
  for (const [key, setter] of Object.entries(setters)) if (key !== 'setIsProcessing') expect(setter).not.toHaveBeenCalled();
});

it('reports a cancelled save as null without downloading', () => {
  vi.spyOn(window, 'prompt').mockReturnValue(null);
  vi.mocked(downloadBlob).mockClear();
  const subject = setup('');
  let fileName: string | null = 'unset';
  act(() => { fileName = subject.result.current.exportProjectJson(); });
  expect(fileName).toBeNull();
  expect(downloadBlob).not.toHaveBeenCalled();
});
