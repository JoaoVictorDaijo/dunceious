
interface SearchResult {
  start: number;
  end: number;
  sequence: string;
  recordId: string;
  strand: 1 | -1;
  score?: number;
  segments?: { start: number, end: number }[];
}

const IUPAC_MAP: Record<string, string> = {
  'A': 'A', 'C': 'C', 'G': 'G', 'T': 'T', 'U': 'U',
  'R': '[AG]', 'Y': '[CT]', 'S': '[GC]', 'W': '[AT]',
  'K': '[GT]', 'M': '[AC]', 'B': '[CGT]', 'D': '[AGT]',
  'H': '[ACT]', 'V': '[ACG]', 'N': '[ACGT]',
};

function degenerateToRegex(query: string): RegExp {
  if (!query) return /$.^/;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.toUpperCase().split('').map(char => IUPAC_MAP[char] || char).join('-*');
  return new RegExp(pattern, 'gi');
}

function reverseComplement(seq: string): string {
  const complement: Record<string, string> = {
    'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C', 'N': 'N',
    'R': 'Y', 'Y': 'R', 'S': 'S', 'W': 'W', 'K': 'M',
    'M': 'K', 'B': 'V', 'D': 'H', 'H': 'D', 'V': 'B',
    'a': 't', 't': 'a', 'c': 'g', 'g': 'c', 'n': 'n',
    '-': '-'
  };
  return seq.split('').reverse().map(base => complement[base] || base).join('');
}

/**
 * Optimized Smith-Waterman Local Alignment with Affine Gap (Gotoh's Algorithm)
 * Uses TypedArrays for memory efficiency and performance.
 */
function smithWaterman(
  query: string,
  target: string,
  matchScore = 2,
  mismatchPenalty = -1,
  gapOpen = -3,
  gapExtend = -1,
  minScore = 5
): { score: number, start: number, end: number, sequence: string }[] {
  const n = query.length;
  const m = target.length;
  if (n === 0 || m === 0) return [];

  const rowWidth = m + 1;
  const size = (n + 1) * rowWidth;
  
  // M: Match/Mismatch matrix
  // Iq: Gap in Query matrix
  // It: Gap in Target matrix
  const M = new Int32Array(size);
  const Iq = new Int32Array(size);
  const It = new Int32Array(size);

  // Initialize gap matrices with a very small number to represent -infinity
  // but safe for Int32 additions.
  const NEG_INF = -1000000;
  Iq.fill(NEG_INF);
  It.fill(NEG_INF);

  let maxScore = 0;
  const maxPositions: number[] = [];

  for (let i = 1; i <= n; i++) {
    const rowOffset = i * rowWidth;
    const prevRowOffset = (i - 1) * rowWidth;
    const qChar = query[i - 1].toUpperCase();

    for (let j = 1; j <= m; j++) {
      const tChar = target[j - 1].toUpperCase();
      const match = qChar === tChar ? matchScore : mismatchPenalty;

      // Update Iq (Gap in Query / Insertion in Query)
      Iq[rowOffset + j] = Math.max(
        M[prevRowOffset + j] + gapOpen,
        Iq[prevRowOffset + j] + gapExtend
      );

      // Update It (Gap in Target / Deletion from Target)
      It[rowOffset + j] = Math.max(
        M[rowOffset + j - 1] + gapOpen,
        It[rowOffset + j - 1] + gapExtend
      );

      // Update M
      const score = Math.max(
        0,
        M[prevRowOffset + j - 1] + match,
        Iq[rowOffset + j],
        It[rowOffset + j]
      );

      M[rowOffset + j] = score;

      if (score > maxScore) {
        maxScore = score;
        maxPositions.length = 0;
        maxPositions.push(rowOffset + j);
      } else if (score === maxScore && score > 0) {
        // Limit number of starting positions to avoid performance explosion
        if (maxPositions.length < 100) {
          maxPositions.push(rowOffset + j);
        }
      }
    }
  }

  if (maxScore < minScore) return [];

  return traceback(M, Iq, It, query, target, maxPositions, rowWidth, maxScore);
}

function traceback(
  M: Int32Array,
  Iq: Int32Array,
  It: Int32Array,
  query: string,
  target: string,
  positions: number[],
  rowWidth: number,
  maxScore: number
): { score: number, start: number, end: number, sequence: string }[] {
  const results: { score: number, start: number, end: number, sequence: string }[] = [];
  const seen = new Set<number>();

  for (const pos of positions) {
    let currPos = pos;
    let i = Math.floor(currPos / rowWidth);
    let j = currPos % rowWidth;
    const jEnd = j;

    // We need to track which matrix we are in during traceback
    let state: 'M' | 'Iq' | 'It' = 'M';

    while (i > 0 && j > 0 && M[i * rowWidth + j] > 0) {
      const idx = i * rowWidth + j;
      const prevIdxDiag = (i - 1) * rowWidth + (j - 1);
      const prevIdxUp = (i - 1) * rowWidth + j;
      const prevIdxLeft = i * rowWidth + (j - 1);

      if (state === 'M') {
        const qChar = query[i - 1].toUpperCase();
        const tChar = target[j - 1].toUpperCase();
        const match = qChar === tChar ? 2 : -1; 

        if (M[idx] === M[prevIdxDiag] + match) {
          i--; j--;
        } else if (M[idx] === Iq[idx]) {
          state = 'Iq';
        } else if (M[idx] === It[idx]) {
          state = 'It';
        } else {
          break; 
        }
      } else if (state === 'Iq') {
        if (Iq[idx] === M[prevIdxUp] - 3) { 
          state = 'M';
          i--;
        } else {
          i--;
        }
      } else if (state === 'It') {
        if (It[idx] === M[prevIdxLeft] - 3) { 
          state = 'M';
          j--;
        } else {
          j--;
        }
      }
    }

    const jStart = j;
    let overlap = false;
    for (let k = jStart; k < jEnd; k++) {
      if (seen.has(k)) { overlap = true; break; }
    }

    if (!overlap) {
      results.push({
        score: maxScore,
        start: jStart,
        end: jEnd,
        sequence: target.substring(jStart, jEnd)
      });
      for (let k = jStart; k < jEnd; k++) seen.add(k);
    }

    if (results.length >= 20) break;
  }

  return results;
}

function getNonGapSegments(seq: string, start: number, end: number): { start: number, end: number }[] {
  const sub = seq.substring(start, end);
  const segments: { start: number, end: number }[] = [];
  let currentStart = -1;
  for (let i = 0; i < sub.length; i++) {
    if (sub[i] !== '-') {
      if (currentStart === -1) currentStart = i;
    } else {
      if (currentStart !== -1) {
        segments.push({ start: start + currentStart, end: start + i });
        currentStart = -1;
      }
    }
  }
  if (currentStart !== -1) {
    segments.push({ start: start + currentStart, end: start + sub.length });
  }
  return segments;
}

self.onmessage = (e: MessageEvent) => {
  const { searchQuery, records, mode = 'exact', options = {} } = e.data;
  const { minScore = 5, strand = 'both', maxResults = 100 } = options;

  if (!searchQuery || searchQuery.length < 2) {
    self.postMessage({ results: [] });
    return;
  }

  try {
    let results: SearchResult[] = [];
    const queryUpper = searchQuery.toUpperCase();

    records.forEach((record: any) => {
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
            segments: getNonGapSegments(seq, m.start, m.end)
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
              segments: getNonGapSegments(seq, start, end)
            });
          });
        }
      } else {
        // Exact/IUPAC Mode
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
              segments: getNonGapSegments(seq, start, end)
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
              segments: getNonGapSegments(seq, start, end)
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

    self.postMessage({ results });
  } catch (error) {
    console.error("Worker search error:", error);
    self.postMessage({ error: String(error) });
  }
};
