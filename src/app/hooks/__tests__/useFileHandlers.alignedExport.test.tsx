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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@/src/app/testing/renderHarness';
import { useFileHandlers } from '../useFileHandlers';
import { downloadBlob } from '@/src/app/lib/download';
import type { SeqRecord } from '@/src/domain/bio/types';

vi.mock('@/src/app/lib/download', () => ({ downloadBlob: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'prompt').mockReturnValue('Aligned project');
});
afterEach(() => { vi.restoreAllMocks(); });

const record: SeqRecord = { id: 'r', name: 'r', sequence: 'ACGTACGT', alignedSequence: '--AC--GTACGT--',
  features: [{ type: 'gene', name: 'gapped', start: 2, end: 7, strand: 1, locationString: '3..7',
    segments: [{ start: 2, end: 7 }] }] };

function setup() {
  return renderHook(() => useFileHandlers({ current: null }, [record], { start: 3, end: 8, recordIds: ['r'] }, {},
    { showAnnotations: true, showTranslation: true, showConservation: false },
    { setRecords: vi.fn(), setFeatureColors: vi.fn(), setActiveSelection: vi.fn(), setShowAnnotations: vi.fn(),
      setShowTranslation: vi.fn(), setShowConservation: vi.fn(), setIsProcessing: vi.fn() }, vi.fn()));
}

describe('exports with aligned annotations', () => {
  it('keeps selection JSON sequence and annotations in biological coordinates with an alignment overlay', () => {
    const { result } = setup();
    result.current.exportSelectionJson();
    const saved = JSON.parse(vi.mocked(downloadBlob).mock.calls[0][0] as string);
    expect(saved.records[0]).toMatchObject({ sequence: 'CGT', alignedSequence: 'C--GT',
      features: [{ start: 1, end: 3, segments: [{ start: 1, end: 3 }] }] });
    expect(saved.records[0].features[0].locationString).toBeUndefined();
    expect(record.features[0].start).toBe(2);
  });

  it('exports GenBank and GFF coordinates in biological units and FASTA in aligned columns', () => {
    const { result } = setup();
    result.current.exportGenBankFile();
    expect(vi.mocked(downloadBlob).mock.calls[0][0]).toContain('3..7');
    result.current.exportGffFile();
    expect(vi.mocked(downloadBlob).mock.calls[1][0]).toContain('\tgene\t3\t7\t');
    result.current.exportSelection();
    expect(vi.mocked(downloadBlob).mock.calls[2][0]).toContain('C--GT');
    result.current.exportProjectJson();
    const project = JSON.parse(vi.mocked(downloadBlob).mock.calls[3][0] as string);
    expect(project.records).toEqual([record]);
  });
});
