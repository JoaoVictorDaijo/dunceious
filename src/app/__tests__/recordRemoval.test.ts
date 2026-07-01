import { describe, expect, it } from 'vitest';
import type { SelectionArea, SeqRecord, SearchResult } from '@/src/domain/bio/types';
import {
  removeRecordFromProject,
  updateSelectionAfterRecordRemoval,
  sanitizeSearchStateAfterRecordRemoval,
} from '../recordRemoval';

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

  it('returns null when there is no active selection', () => {
    expect(updateSelectionAfterRecordRemoval(null, 'r1')).toBeNull();
  });

  it('returns the selection unchanged when the removed record is not in it', () => {
    const selection: SelectionArea = { start: 2, end: 8, recordIds: ['r1', 'r3'] };
    const result = updateSelectionAfterRecordRemoval(selection, 'r2');
    expect(result).toBe(selection); // same reference, unchanged
  });
});

function makeResult(recordId: string): SearchResult {
  return { start: 0, end: 3, sequence: 'ATG', recordId, strand: 1 };
}

describe('sanitizeSearchStateAfterRecordRemoval', () => {
  // filteredResults index → recordId: 0→r1, 1→r2, 2→r1
  const results = [makeResult('r1'), makeResult('r2'), makeResult('r1')];

  it('drops selected indices pointing at the removed record, keeps the rest', () => {
    const { selectedSearchIndices } = sanitizeSearchStateAfterRecordRemoval(
      results, 1, new Set([0, 1, 2]), 'r1',
    );
    expect([...selectedSearchIndices].sort()).toEqual([1]);
  });

  it('resets currentSearchIdx to -1 when it points at the removed record', () => {
    const { currentSearchIdx } = sanitizeSearchStateAfterRecordRemoval(
      results, 0, new Set(), 'r1',
    );
    expect(currentSearchIdx).toBe(-1);
  });

  it('keeps currentSearchIdx when it points at a surviving record', () => {
    const { currentSearchIdx } = sanitizeSearchStateAfterRecordRemoval(
      results, 1, new Set(), 'r1',
    );
    expect(currentSearchIdx).toBe(1);
  });

  it('resets a negative currentSearchIdx to -1', () => {
    const { currentSearchIdx } = sanitizeSearchStateAfterRecordRemoval(
      results, -1, new Set(), 'r1',
    );
    expect(currentSearchIdx).toBe(-1);
  });

  it('resets an out-of-range currentSearchIdx to -1', () => {
    const { currentSearchIdx } = sanitizeSearchStateAfterRecordRemoval(
      results, 5, new Set(), 'r1',
    );
    expect(currentSearchIdx).toBe(-1);
  });

  it('keeps selected indices that all point at surviving records', () => {
    // index 1 → r2, which survives when r1 is removed → nothing is dropped.
    const { selectedSearchIndices } = sanitizeSearchStateAfterRecordRemoval(
      results, 1, new Set([1]), 'r1',
    );
    expect([...selectedSearchIndices]).toEqual([1]);
  });

  it('keeps a stale out-of-range selected index (optional-chaining short-circuit)', () => {
    // index 9 is out of range → filteredResults[9]?.recordId is undefined,
    // which is !== recordId, so the stale index is retained rather than throwing.
    const { selectedSearchIndices } = sanitizeSearchStateAfterRecordRemoval(
      results, 1, new Set([1, 9]), 'r1',
    );
    expect([...selectedSearchIndices].sort((a, b) => a - b)).toEqual([1, 9]);
  });
});
