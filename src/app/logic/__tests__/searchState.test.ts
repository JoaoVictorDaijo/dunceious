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
  filteredResults,
  groupedSearchResults,
  joinSegments,
  getSequenceContext,
} from '../searchState';
import type { SearchResult, SeqRecord } from '@/src/domain/bio/types';

const mk = (o: Partial<SearchResult>): SearchResult => ({
  start: 0, end: 1, sequence: 'A', recordId: 'r1', strand: 1, ...o,
});

describe('filteredResults', () => {
  const rs = [mk({ score: 100 }), mk({ score: 50 }), mk({ score: 19 })];
  it('passes exact mode through unfiltered', () => {
    expect(filteredResults(rs, 'exact', 100, 20)).toHaveLength(3);
  });
  it('passes fuzzy through unfiltered when maxScoreFound is 0', () => {
    expect(filteredResults(rs, 'fuzzy', 0, 20)).toHaveLength(3);
  });
  it('keeps only fuzzy results at or above the minScore percentage', () => {
    // 100/100=100% keep, 50/100=50% keep, 19/100=19% < 20% drop
    expect(filteredResults(rs, 'fuzzy', 100, 20).map(r => r.score)).toEqual([100, 50]);
  });
  it('keeps a result exactly at the boundary (>=)', () => {
    expect(filteredResults([mk({ score: 20 })], 'fuzzy', 100, 20)).toHaveLength(1);
  });
  it('treats a missing score as 0', () => {
    expect(filteredResults([mk({})], 'fuzzy', 100, 20)).toHaveLength(0);
  });
});

describe('groupedSearchResults', () => {
  it('groups by recordId preserving original filtered indices', () => {
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
