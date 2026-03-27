/**
 * Pure search-logic functions shared between the search web worker and tests.
 * No DOM / worker globals are used here.
 */

export interface SearchResult {
  start: number;
  end: number;
  sequence: string;
  recordId: string;
  strand: 1 | -1;
  score?: number;
  segments?: { start: number; end: number }[];
}

const IUPAC_MAP: Record<string, string> = {
  'A': 'A', 'C': 'C', 'G': 'G', 'T': 'T', 'U': 'U',
  'R': '[AG]', 'Y': '[CT]', 'S': '[GC]', 'W': '[AT]',
  'K': '[GT]', 'M': '[AC]', 'B': '[CGT]', 'D': '[AGT]',
  'H': '[ACT]', 'V': '[ACG]', 'N': '[ACGT]',
};

export function degenerateToRegex(query: string): RegExp {
  if (!query) return /$.^/;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.toUpperCase().split('').map(char => IUPAC_MAP[char] || char).join('-*');
  return new RegExp(pattern, 'gi');
}

export function reverseComplement(seq: string): string {
  const complement: Record<string, string> = {
    'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C', 'N': 'N',
    'R': 'Y', 'Y': 'R', 'S': 'S', 'W': 'W', 'K': 'M',
    'M': 'K', 'B': 'V', 'D': 'H', 'H': 'D', 'V': 'B',
    'a': 't', 't': 'a', 'c': 'g', 'g': 'c', 'n': 'n',
    '-': '-',
  };
  return seq.split('').reverse().map(base => complement[base] || base).join('');
}

export function getNonGapSegments(
  seq: string,
  start: number,
  end: number,
): { start: number; end: number }[] {
  const sub = seq.substring(start, end);
  const segments: { start: number; end: number }[] = [];
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

/**
 * Optimized Smith-Waterman local alignment with affine gap (Gotoh's algorithm).
 * Uses TypedArrays for memory efficiency and performance.
 */
export function smithWaterman(
  query: string,
  target: string,
  matchScore = 2,
  mismatchPenalty = -1,
  gapOpen = -3,
  gapExtend = -1,
  minScore = 5,
): { score: number; start: number; end: number; sequence: string }[] {
  const n = query.length;
  const m = target.length;
  if (n === 0 || m === 0) return [];

  const rowWidth = m + 1;
  const size = (n + 1) * rowWidth;

  const M = new Int32Array(size);
  const Iq = new Int32Array(size);
  const It = new Int32Array(size);

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

      Iq[rowOffset + j] = Math.max(
        M[prevRowOffset + j] + gapOpen,
        Iq[prevRowOffset + j] + gapExtend,
      );

      It[rowOffset + j] = Math.max(
        M[rowOffset + j - 1] + gapOpen,
        It[rowOffset + j - 1] + gapExtend,
      );

      const score = Math.max(
        0,
        M[prevRowOffset + j - 1] + match,
        Iq[rowOffset + j],
        It[rowOffset + j],
      );

      M[rowOffset + j] = score;

      if (score > maxScore) {
        maxScore = score;
        maxPositions.length = 0;
        maxPositions.push(rowOffset + j);
      } else if (score === maxScore && score > 0) {
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
  maxScore: number,
): { score: number; start: number; end: number; sequence: string }[] {
  const results: { score: number; start: number; end: number; sequence: string }[] = [];
  const seen = new Set<number>();

  for (const pos of positions) {
    const currPos = pos;
    let i = Math.floor(currPos / rowWidth);
    let j = currPos % rowWidth;
    const jEnd = j;

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
        sequence: target.substring(jStart, jEnd),
      });
      for (let k = jStart; k < jEnd; k++) seen.add(k);
    }

    if (results.length >= 20) break;
  }

  return results;
}
