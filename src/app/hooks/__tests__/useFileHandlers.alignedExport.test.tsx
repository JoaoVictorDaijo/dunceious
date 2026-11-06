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

function setup(rows: SeqRecord[] = [record, { ...record, id: 'other' }], log = vi.fn()) {
  return renderHook(() => useFileHandlers({ current: null }, rows, { start: 3, end: 8, recordIds: ['r'] }, {},
    { showAnnotations: true, showTranslation: true, showConservation: false, alignmentComparison: DEFAULT_ALIGNMENT_COMPARISON },
    { setRecords: vi.fn(), setFeatureColors: vi.fn(), setActiveSelection: vi.fn(), setShowAnnotations: vi.fn(),
      setShowTranslation: vi.fn(), setShowConservation: vi.fn(), setAlignmentComparison: vi.fn(), setIsProcessing: vi.fn() }, log));
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

it('downloads both mixed files from viewer/Sidebar selection and Hub export paths', () => {
  const aligned: SeqRecord = { id: 'a', name: 'a', sequence: 'ACGT', alignedSequence: 'AC--GT', features: [] };
  const raw: SeqRecord = { id: 'u', name: 'u', sequence: 'TTTTTTTT', features: [] };
  const { result } = renderHook(() => useFileHandlers({ current: null }, [aligned, raw], { start: 1, end: 5, recordIds: [] }, {},
    { showAnnotations: true, showTranslation: false, showConservation: false, alignmentComparison: DEFAULT_ALIGNMENT_COMPARISON },
    { setRecords: vi.fn(), setFeatureColors: vi.fn(), setActiveSelection: vi.fn(), setShowAnnotations: vi.fn(), setShowTranslation: vi.fn(),
      setShowConservation: vi.fn(), setAlignmentComparison: vi.fn(), setIsProcessing: vi.fn() }, vi.fn()));
  result.current.exportSelection('aligned');
  expect(vi.mocked(downloadBlob).mock.calls).toEqual([
    ['>a [Slice: 1-5]\nC--G', 'selection_export.fasta', 'text/plain'],
    ['>u [Slice: 1-5]\nTTTT', 'selection_export_unaligned.fasta', 'text/plain'],
  ]);
  vi.mocked(downloadBlob).mockClear();
  result.current.exportRecords(['a', 'u'], 'fasta', { residues: 'aligned', fileName: 'mixed.fasta' });
  expect(vi.mocked(downloadBlob).mock.calls).toEqual([
    ['>a\nAC--GT', 'mixed.fasta', 'text/plain'], ['>u\nTTTTTTTT', 'mixed_unaligned.fasta', 'text/plain'],
  ]);
  vi.mocked(downloadBlob).mockClear();
  result.current.exportSelection('original');
  expect(vi.mocked(downloadBlob).mock.calls).toEqual([
    ['>a [Slice: 1-5]\nCG\n\n>u [Slice: 1-5]\nTTTT', 'selection_export.fasta', 'text/plain'],
  ]);
  result.current.handleExportRecord('a', 'aligned');
  expect(vi.mocked(downloadBlob).mock.calls[1]).toEqual(['>a\nAC--GT', 'a.fasta', 'text/plain']);
});

it('counts only unaligned rows actually saved inside the selection window', () => {
  const rows: SeqRecord[] = [
    { id: 'a', name: 'a', sequence: 'ACGT', alignedSequence: 'AC--GT', features: [] },
    { id: 'long', name: 'long', sequence: 'TTTTTTTT', features: [] },
    { id: 'short', name: 'short', sequence: 'AA', features: [] },
  ];
  const log = vi.fn();
  const { result } = renderHook(() => useFileHandlers({ current: null }, rows, { start: 3, end: 5, recordIds: [] }, {},
    { showAnnotations: true, showTranslation: false, showConservation: false, alignmentComparison: DEFAULT_ALIGNMENT_COMPARISON },
    { setRecords: vi.fn(), setFeatureColors: vi.fn(), setActiveSelection: vi.fn(), setShowAnnotations: vi.fn(), setShowTranslation: vi.fn(),
      setShowConservation: vi.fn(), setAlignmentComparison: vi.fn(), setIsProcessing: vi.fn() }, log));
  result.current.exportSelection('aligned');
  expect(vi.mocked(downloadBlob).mock.calls).toEqual([
    ['>a [Slice: 3-5]\n-G', 'selection_export.fasta', 'text/plain'],
    ['>long [Slice: 3-5]\nTT', 'selection_export_unaligned.fasta', 'text/plain'],
  ]);
  expect(log).toHaveBeenCalledWith("1 sequences aren't in the alignment, so they have no alignment columns and were saved separately in selection_export_unaligned.fasta");
  expect(log).toHaveBeenCalledWith('No residues in the exported window; left out: short');
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

it.each([false, true])('logs every GenBank omission once and counts actual downloads, allInvalid=%s', allInvalid => {
  const log = vi.fn();
  const bad = (id: string, sequence: string, metadata: Record<string, string> = {}): SeqRecord => ({ id, name: id, sequence, features: [{ type: 'CDS', name: 'broken', start: 0, end: sequence.length, strand: 1, metadata }] });
  const rows = [bad('gap', 'AC-GT'), bad('symbol', 'AC*GT'), bad('frame', 'ACRGT', { codon_start: '' }), bad('code', 'ACRGT', { transl_table: '99' })];
  if (!allInvalid) rows.push({ id: 'good', name: 'good', sequence: 'ACRGT', features: [] });
  const h = setup(rows, log);
  h.result.current.exportRecords(rows.map(r => r.id), 'genbank', { fileName: 'chosen.gb' });
  expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(allInvalid ? 0 : 1);
  if (!allInvalid) {
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe('chosen.gb');
    expect(String(vi.mocked(downloadBlob).mock.calls[0][0]).match(/^LOCUS.*$/gm)).toEqual([expect.stringMatching(/^LOCUS\s+good\s+5 bp/)]);
  }
  expect(log.mock.calls.map(([message]) => message)).toEqual([
    'gap not exported: its sequence contains gap characters',
    'symbol not exported: its sequence contains non-residue characters',
    'frame not exported: CDS broken has an invalid /codon_start',
    'code not exported: CDS broken has an invalid /transl_table',
    `Exported ${allInvalid ? 0 : 1} sequences as genbank.`,
  ]);
});
