import {
  SearchResult,
  degenerateToRegex,
  reverseComplement,
  getNonGapSegments,
  removeGapsWithMap,
  mapUngappedRangeToAligned,
  smithWaterman,
} from '../../services/searchLogic';
import type { SearchWorkerRequest, SearchWorkerResponse } from './protocol';

function collectSeededFuzzyHits(
  queryUpper: string,
  seq: string,
  recordId: string,
  strand: 1 | -1,
  minScore: number,
): SearchResult[] {
  const { ungapped, map } = removeGapsWithMap(seq);
  if (!ungapped) return [];

  const queryLen = queryUpper.length;
  const seedLen = Math.max(2, Math.min(6, Math.floor(queryLen / 4) || 2));
  if (queryLen < seedLen) {
    return smithWaterman(queryUpper, ungapped, 2, -1, -3, -1, minScore).map(m => {
      const aligned = mapUngappedRangeToAligned(map, m.start, m.end);
      return {
        start: aligned.start,
        end: aligned.end,
        sequence: seq.substring(aligned.start, aligned.end),
        recordId,
        strand,
        score: m.score,
        segments: getNonGapSegments(seq, aligned.start, aligned.end),
      };
    });
  }

  const flank = Math.max(12, queryLen);
  const candidateWindows: Array<{ start: number; end: number }> = [];
  const seenWindows = new Set<string>();

  for (let offset = 0; offset <= queryLen - seedLen; offset++) {
    const seed = queryUpper.substring(offset, offset + seedLen);
    let pos = ungapped.indexOf(seed);
    while (pos !== -1) {
      const windowStart = Math.max(0, pos - flank);
      const windowEnd = Math.min(ungapped.length, pos + seedLen + flank);
      const key = `${windowStart}:${windowEnd}`;
      if (!seenWindows.has(key)) {
        seenWindows.add(key);
        candidateWindows.push({ start: windowStart, end: windowEnd });
      }
      pos = ungapped.indexOf(seed, pos + 1);
      if (candidateWindows.length >= 256) break;
    }
    if (candidateWindows.length >= 256) break;
  }

  if (candidateWindows.length === 0) {
    // No exact seed hit: fall back to a full ungapped local alignment so we
    // still return something instead of appearing broken.
    candidateWindows.push({ start: 0, end: ungapped.length });
  }

  const hits: SearchResult[] = [];
  const seenHits = new Set<string>();

  for (const window of candidateWindows) {
    const windowSeq = ungapped.substring(window.start, window.end);
    const alignments = smithWaterman(queryUpper, windowSeq, 2, -1, -3, -1, minScore);
    for (const alignment of alignments) {
      const aligned = mapUngappedRangeToAligned(map, window.start + alignment.start, window.start + alignment.end);
      const key = `${recordId}:${strand}:${aligned.start}:${aligned.end}`;
      if (seenHits.has(key)) continue;
      seenHits.add(key);
      hits.push({
        start: aligned.start,
        end: aligned.end,
        sequence: seq.substring(aligned.start, aligned.end),
        recordId,
        strand,
        score: alignment.score,
        segments: getNonGapSegments(seq, aligned.start, aligned.end),
      });
    }
  }

  return hits;
}

self.onmessage = (e: MessageEvent<SearchWorkerRequest>) => {
  const { requestId, searchQuery, records, mode, options } = e.data;
  const { minScore = 5, strand = 'both', maxResults = 100 } = options;

  if (!searchQuery || searchQuery.length < 1) {
    const response: SearchWorkerResponse = { requestId, results: [] };
    self.postMessage(response);
    return;
  }

  try {
    let results: SearchResult[] = [];
    const queryUpper = searchQuery.toUpperCase();

    records.forEach((record) => {
      const seq = record.alignedSequence || record.sequence;
      const L = seq.length;

      if (mode === 'fuzzy') {
        if (strand === 'both' || strand === 'fwd') {
          results.push(...collectSeededFuzzyHits(queryUpper, seq, record.id, 1, minScore));
        }

        if (strand === 'both' || strand === 'rev') {
          const rcSeq = reverseComplement(seq);
          const revHits = collectSeededFuzzyHits(queryUpper, rcSeq, record.id, -1, minScore);
          revHits.forEach(hit => {
            const start = L - hit.end;
            const end = L - hit.start;
            results.push({
              ...hit,
              start,
              end,
              sequence: seq.substring(start, end),
              segments: getNonGapSegments(seq, start, end),
            });
          });
        }
      } else {
        // Exact / IUPAC Mode
        const regex = degenerateToRegex(searchQuery);

        // Forward search
        if (strand === 'both' || strand === 'fwd') {
          let match;
          regex.lastIndex = 0;
          while ((match = regex.exec(seq)) !== null) {
            const start = match.index;
            const end = match.index + match[0].length;
            results.push({
              start,
              end,
              sequence: match[0],
              recordId: record.id,
              strand: 1,
              segments: getNonGapSegments(seq, start, end),
            });
            regex.lastIndex = match.index + 1;
          }
        }

        // Reverse search
        if (strand === 'both' || strand === 'rev') {
          const rcSeq = reverseComplement(seq);
          let match;
          regex.lastIndex = 0;
          while ((match = regex.exec(rcSeq)) !== null) {
            const rcStart = match.index;
            const rcEnd = match.index + match[0].length;
            const start = L - rcEnd;
            const end = L - rcStart;

            results.push({
              start,
              end,
              sequence: match[0],
              recordId: record.id,
              strand: -1,
              segments: getNonGapSegments(seq, start, end),
            });
            regex.lastIndex = match.index + 1;
          }
        }
      }
    });

    // Sort results
    if (mode === 'fuzzy') {
      results.sort((a, b) => (b.score || 0) - (a.score || 0) || a.start - b.start);
    } else {
      results.sort((a, b) => a.start - b.start || a.recordId.localeCompare(b.recordId));
    }

    // Apply maxResults limit
    if (results.length > maxResults) {
      results = results.slice(0, maxResults);
    }

    const response: SearchWorkerResponse = { requestId, results };
    self.postMessage(response);
  } catch (error) {
    console.error('Worker search error:', error);
    const response: SearchWorkerResponse = { requestId, error: String(error) };
    self.postMessage(response);
  }
};
