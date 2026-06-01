import { describe, expect, it } from 'vitest';
import type { SelectionArea, SeqRecord } from '@/src/domain/bio/types';
import { removeRecordFromProject, updateSelectionAfterRecordRemoval } from '../recordRemoval';

function makeRecord(id: string): SeqRecord {
  return {
    id,
    name: id,
    sequence: 'ATGC',
    features: [],
  };
}

describe('removeRecordFromProject', () => {
  it('filters the removed record out of project records', () => {
    const records = [makeRecord('r1'), makeRecord('r2'), makeRecord('r3')];
    const result = removeRecordFromProject(records, 'r2');

    expect(result.map(r => r.id)).toEqual(['r1', 'r3']);
  });
});

describe('updateSelectionAfterRecordRemoval', () => {
  it('clears active selection when it only referenced the removed record', () => {
    const selection: SelectionArea = { start: 2, end: 8, recordIds: ['r2'] };

    expect(updateSelectionAfterRecordRemoval(selection, 'r2')).toBeNull();
  });

  it('removes only deleted record from multi-record active selection', () => {
    const selection: SelectionArea = { start: 2, end: 8, recordIds: ['r1', 'r2', 'r3'] };

    expect(updateSelectionAfterRecordRemoval(selection, 'r2')).toEqual({
      start: 2,
      end: 8,
      recordIds: ['r1', 'r3'],
    });
  });
});
