/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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
import { processTransposition } from '@/src/domain/bio/coordinate';
import { trackFocusTarget } from '@/src/app/logic/focusTarget';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@/src/app/testing/renderHarness';
import { DEFAULT_ALIGNMENT_COMPARISON } from '@/src/app/logic/alignmentComparison';
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
  return renderHook(() => useFileHandlers({ current: null }, [record, { ...record, id: 'other' }], { start: 3, end: 8, recordIds: ['r'] }, {},
    { showAnnotations: true, showTranslation: true, showConservation: false, alignmentComparison: DEFAULT_ALIGNMENT_COMPARISON },
    { setRecords: vi.fn(), setFeatureColors: vi.fn(), setActiveSelection: vi.fn(), setShowAnnotations: vi.fn(),
      setShowTranslation: vi.fn(), setShowConservation: vi.fn(), setAlignmentComparison: vi.fn(), setIsProcessing: vi.fn() }, vi.fn()));
}

describe('exports with aligned annotations', () => {
  it('keeps selection JSON sequence and annotations in biological coordinates with an alignment overlay', () => {
    const { result } = setup();
    result.current.exportSelectionJson();
    const saved = JSON.parse(vi.mocked(downloadBlob).mock.calls[0][0] as string);
    expect(saved.format).toBe(2);
    expect(saved.records[0]).toMatchObject({ sequence: 'CGT', alignedSequence: 'C--GT',
      features: [{ start: 1, end: 3, segments: [{ start: 1, end: 3 }] }] });
    expect(saved.records[0].features[0].locationString).toBeUndefined();
    expect(record.features[0].start).toBe(2);
  });

  it('exports only requested workspace IDs in each format with the chosen filename', () => {
    const { result } = setup();
    result.current.exportRecords(['r'], 'fasta', { fileName: 'chosen.fasta' });
    expect(vi.mocked(downloadBlob).mock.calls[0]).toEqual(['>r\nACGTACGT', 'chosen.fasta', 'text/plain']);
    result.current.exportRecords(['r'], 'genbank', {});
    expect(vi.mocked(downloadBlob).mock.calls[1][0]).toMatch(/^LOCUS\s+r\s/m);
    expect(vi.mocked(downloadBlob).mock.calls[1][0]).not.toContain('other');
    result.current.exportRecords(['r'], 'gff3', {});
    expect(vi.mocked(downloadBlob).mock.calls[2][0]).toContain('r\t.\tgene');
    expect(vi.mocked(downloadBlob).mock.calls[2][0]).not.toContain('other');
    result.current.exportRecords(['r'], 'project', { fileName: 'subset.json' });
    const saved = JSON.parse(vi.mocked(downloadBlob).mock.calls[3][0] as string);
    expect(saved.records).toEqual([record]);
    expect(saved.showTranslation).toBe(true);
    expect(vi.mocked(downloadBlob).mock.calls[3][1]).toBe('subset.json');
    expect(window.prompt).not.toHaveBeenCalled();
  });
  it('honours FASTA options and preserves per-record ungapped export', () => {
    const { result } = setup();
    result.current.exportRecords(['r'], 'fasta', { residues: 'aligned', header: 'id' });
    expect(vi.mocked(downloadBlob).mock.calls[0][0]).toBe('>r\n--AC--GTACGT--');
    result.current.handleExportRecord('r');
    expect(vi.mocked(downloadBlob).mock.calls[1][0]).toBe('>r\nACGTACGT');
  });
  it('exports annotation selections without the other annotations', () => {
    const { result } = setup();
    result.current.exportRecords(['r'], 'gff3', { matchingKeys: new Set() });
    expect(vi.mocked(downloadBlob).mock.calls[0][0]).toContain('gbkey=Src');
    expect(vi.mocked(downloadBlob).mock.calls[0][0]).not.toContain('gapped');
    result.current.exportRecords(['r'], 'gff3', { matchingKeys: new Set(['r:0']) });
    expect(vi.mocked(downloadBlob).mock.calls[1][0]).toContain('Name=gapped');
  });
  it('exports GenBank and GFF coordinates in biological units and FASTA in aligned columns', () => {
    const { result } = setup();
    result.current.exportRecords(['r'], 'genbank', {});
    expect(vi.mocked(downloadBlob).mock.calls[0][0]).toContain('3..7');
    result.current.exportRecords(['r'], 'gff3', {});
    expect(vi.mocked(downloadBlob).mock.calls[1][0]).toContain('\tgene\t3\t7\t');
    result.current.exportSelection();
    expect(vi.mocked(downloadBlob).mock.calls[2][0]).toContain('C--GT');
    result.current.exportProjectJson();
    const project = JSON.parse(vi.mocked(downloadBlob).mock.calls[3][0] as string);
    expect(project.format).toBe(2);
    expect(project.records).toEqual([record, { ...record, id: 'other' }]);
  });
});


it('exports hub-focused aligned track support from source records without display fields', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
  const source: SeqRecord = { id: 'r', name: 'r', sequence: 'ACGT', alignedSequence: '--ACGT', features: [], tracks: [{ id: 'q', name: 'q', data: [{ start: 0, end: 1, value: 7 }] }] };
  const display = processTransposition([source])[0];
  expect(display).not.toBe(source);
  expect(display.displayTracks).toHaveLength(1);
  // Independently enumerate residue columns; focus must select the first supplied residue.
  const columns: number[] = [];
  for (let column = 0; column < source.alignedSequence!.length; column++) {
    if (source.alignedSequence![column] !== '-') columns.push(column);
  }
  const target = trackFocusTarget(source, source.tracks![0])!;
  expect([target.start, target.end]).toEqual([columns[0], columns[0] + 1]);
  const state = { showAnnotations: true, showTranslation: false, showConservation: false, alignmentComparison: DEFAULT_ALIGNMENT_COMPARISON };
  const { result } = renderHook(() => useFileHandlers({current:null}, [source], {start:target.start,end:target.end,recordIds:['r']}, {}, state,
    {setRecords:vi.fn(),setFeatureColors:vi.fn(),setActiveSelection:vi.fn(),setShowAnnotations:vi.fn(),setShowTranslation:vi.fn(),setShowConservation:vi.fn(),setAlignmentComparison:vi.fn(),setIsProcessing:vi.fn()},vi.fn()));
  result.current.exportSelectionJson();
  const saved = JSON.parse(vi.mocked(downloadBlob).mock.calls[0][0] as string);
  expect(saved).toEqual({ format:2, version:__APP_VERSION__, exportedAt:'2026-11-06T12:00:00.000Z', featureColors:{}, ...state, activeSelection:null, selectionRange:{start:2,end:3}, records:[{id:'r',name:'r',sequence:'A',alignedSequence:'A',features:[],tracks:[{id:'q',name:'q',data:[{start:0,end:1,value:7}]}]}] });
  expect(source.tracks![0].data).toEqual([{start:0,end:1,value:7}]);
  vi.useRealTimers();
});
