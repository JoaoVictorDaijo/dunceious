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

import { describe, it, expect } from 'vitest';
import {
  groupedSearchResults,
  joinSegments,
  getSequenceContext,
} from '../searchState';
import type { SearchResult, SeqRecord } from '@/src/domain/bio/types';

const mk = (o: Partial<SearchResult>): SearchResult => ({
  cigar: '1=', start: 0, end: 1, sequence: 'A', recordId: 'r1', strand: 1, ...o,
});

describe('groupedSearchResults', () => {
  it('groups by recordId preserving each result list index', () => {
    const out = groupedSearchResults([mk({ recordId: 'r1' }), mk({ recordId: 'r2' }), mk({ recordId: 'r1' })]);
    expect(out.r1.results).toHaveLength(2);
    expect(out.r1.indices).toEqual([0, 2]);
    expect(out.r2.indices).toEqual([1]);
  });
  it('returns an empty object for no results', () => {
    expect(groupedSearchResults([])).toEqual({});
  });
});

describe('joinSegments — record mode', () => {
  it('rejects fewer than two matches', () => {
    expect(joinSegments([mk({ start: 0, end: 5 })], 'record')).toEqual({ error: 'few' });
  });
  it('rejects mixed strands', () => {
    expect(joinSegments([mk({ strand: 1 }), mk({ strand: -1 })], 'record')).toEqual({ error: 'mixed' });
  });
  it('sorts segments by start and spans first-start to last-end', () => {
    expect(joinSegments([mk({ start: 10, end: 15 }), mk({ start: 0, end: 5 })], 'record')).toEqual({
      start: 0, end: 15, segments: [{ start: 0, end: 5 }, { start: 10, end: 15 }],
    });
  });
});

describe('joinSegments — selection mode', () => {
  it('rejects mixed recordId (even when strand matches)', () => {
    expect(joinSegments([mk({ recordId: 'r1' }), mk({ recordId: 'r2' })], 'selection')).toEqual({ error: 'mixed' });
  });
  it('rejects mixed strand (even when recordId matches)', () => {
    expect(joinSegments([mk({ recordId: 'r1', strand: 1 }), mk({ recordId: 'r1', strand: -1 })], 'selection')).toEqual({ error: 'mixed' });
  });
  it('rejects fewer than two results', () => {
    expect(joinSegments([mk({ recordId: 'r1' })], 'selection')).toEqual({ error: 'few' });
  });
  it('preserves input order and spans min-start to max-end', () => {
    expect(joinSegments([mk({ start: 10, end: 15 }), mk({ start: 0, end: 5 })], 'selection')).toEqual({
      start: 0, end: 15, segments: [{ start: 10, end: 15 }, { start: 0, end: 5 }],
    });
  });
});

describe('getSequenceContext', () => {
  const rec = (seq: string, aligned?: string): SeqRecord => ({
    id: 'r1', name: 'r1', sequence: seq, alignedSequence: aligned, features: [],
  });
  it('returns empty strings when the record is missing', () => {
    expect(getSequenceContext(undefined, 3, 6)).toEqual({ pre: '', match: '', post: '' });
  });
  it('clamps context to sequence bounds (contextLen 2)', () => {
    expect(getSequenceContext(rec('ACGTACGTAC'), 3, 6, 2)).toEqual({ pre: 'CG', match: 'TAC', post: 'GT' });
  });
  it('clamps at both edges when context exceeds the sequence', () => {
    expect(getSequenceContext(rec('ACGT'), 0, 4, 8)).toEqual({ pre: '', match: 'ACGT', post: '' });
  });
  it('prefers alignedSequence over sequence', () => {
    expect(getSequenceContext(rec('ACGT', 'A-CGT'), 0, 3, 2)).toEqual({ pre: '', match: 'A-C', post: 'GT' });
  });
});
