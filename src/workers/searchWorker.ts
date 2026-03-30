import {
  SearchResult,
  degenerateToRegex,
  reverseComplement,
  getNonGapSegments,
  smithWaterman,
} from '../../services/searchLogic';
import type { SearchWorkerRequest, SearchWorkerResponse } from './protocol';

self.onmessage = (e: MessageEvent<SearchWorkerRequest>) => {
  const { searchQuery, records, mode, options } = e.data;
  const { minScore = 5, strand = 'both', maxResults = 100 } = options;

  if (!searchQuery || searchQuery.length < 2) {
    const response: SearchWorkerResponse = { results: [] };
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
        // Forward Fuzzy
        if (strand === 'both' || strand === 'fwd') {
          const fwdFuzzy = smithWaterman(queryUpper, seq, 2, -1, -3, -1, minScore);
          fwdFuzzy.forEach(m => results.push({
            ...m,
            recordId: record.id,
            strand: 1,
            segments: getNonGapSegments(seq, m.start, m.end),
          }));
        }

        // Reverse Fuzzy
        if (strand === 'both' || strand === 'rev') {
          const rcSeq = reverseComplement(seq);
          const revFuzzy = smithWaterman(queryUpper, rcSeq, 2, -1, -3, -1, minScore);
          revFuzzy.forEach(m => {
            const start = L - m.end;
            const end = L - m.start;
            results.push({
              score: m.score,
              start,
              end,
              sequence: m.sequence,
              recordId: record.id,
              strand: -1,
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

    const response: SearchWorkerResponse = { results };
    self.postMessage(response);
  } catch (error) {
    console.error('Worker search error:', error);
    const response: SearchWorkerResponse = { error: String(error) };
    self.postMessage(response);
  }
};
