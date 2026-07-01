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

import type { SearchResult, SeqRecord } from '@/src/domain/bio/types';
import type { GroupedSearchResults } from '../components/SearchPanel';

/** Fuzzy results filtered by minScore percentage; passthrough for exact / no-max. */
export function filteredResults(
  searchResults: SearchResult[],
  searchMode: 'exact' | 'fuzzy',
  maxScoreFound: number,
  minScore: number,
): SearchResult[] {
  if (searchMode !== 'fuzzy' || maxScoreFound === 0) return searchResults;
  return searchResults.filter(
    r => ((r.score ?? 0) / maxScoreFound) * 100 >= minScore,
  );
}

/** Groups results by recordId, preserving each result's original filtered index. */
export function groupedSearchResults(filtered: SearchResult[]): GroupedSearchResults {
  const groups: GroupedSearchResults = {};
  filtered.forEach((r, idx) => {
    if (!groups[r.recordId]) groups[r.recordId] = { results: [], indices: [] };
    groups[r.recordId].results.push(r);
    groups[r.recordId].indices.push(idx);
  });
  return groups;
}

type JoinInput = Pick<SearchResult, 'start' | 'end' | 'strand' | 'recordId'>;

/**
 * Pure join-segment core for joinAllInRecord ('record') / joinSelectedMatches
 * ('selection'). Returns the spanned range + segments, or a discriminated error;
 * the `alert` side-effect stays in the hook.
 *
 * - 'record':    < 2 → {error:'few'}; mixed strand → {error:'mixed'};
 *                else segments sorted by start, span sorted[0].start→sorted[last].end.
 * - 'selection': < 2 → {error:'few'}; mixed recordId OR strand → {error:'mixed'};
 *                else segments in input order, span min(starts)→max(ends).
 */
export function joinSegments(
  results: JoinInput[],
  mode: 'record' | 'selection',
): { start: number; end: number; segments: { start: number; end: number }[] } | { error: 'few' } | { error: 'mixed' } {
  if (results.length < 2) return { error: 'few' };
  const strand = results[0].strand;
  if (mode === 'record') {
    if (results.some(r => r.strand !== strand)) return { error: 'mixed' };
    const segments = results
      .map(r => ({ start: r.start, end: r.end }))
      .sort((a, b) => a.start - b.start);
    return { start: segments[0].start, end: segments[segments.length - 1].end, segments };
  }
  // selection
  const recordId = results[0].recordId;
  if (results.some(m => m.recordId !== recordId || m.strand !== strand)) return { error: 'mixed' };
  const segments = results.map(m => ({ start: m.start, end: m.end }));
  return {
    start: Math.min(...segments.map(s => s.start)),
    end: Math.max(...segments.map(s => s.end)),
    segments,
  };
}

/** Extracts pre/match/post context around a match range within a record's sequence. */
export function getSequenceContext(
  record: SeqRecord | undefined,
  start: number,
  end: number,
  contextLen = 8,
): { pre: string; match: string; post: string } {
  if (!record) return { pre: '', match: '', post: '' };
  const seq = record.alignedSequence || record.sequence;
  return {
    pre: seq.substring(Math.max(0, start - contextLen), start),
    match: seq.substring(start, end),
    post: seq.substring(end, Math.min(seq.length, end + contextLen)),
  };
}
