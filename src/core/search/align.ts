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

  // Avoid pathological memory/time behavior for very large targets.
  // In those cases, use a fast ungapped approximation.
  const MAX_SW_CELLS = 600_000;
  if (size > MAX_SW_CELLS) {
    return ungappedFuzzyScan(query, target, matchScore, mismatchPenalty, minScore);
  }

  const M = new Int32Array(size);
  const Iq = new Int32Array(size);
  const It = new Int32Array(size);

  const NEG_INF = -1000000;
  Iq.fill(NEG_INF);
  It.fill(NEG_INF);

  let maxScore = 0;
  const candidateEndPoints: Array<{ pos: number; score: number }> = [];
  const MAX_CANDIDATE_ENDPOINTS = 400;
  const TRIM_THRESHOLD = 4000;
  let candidateFloor = minScore;

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
      }

      if (score >= candidateFloor) {
        candidateEndPoints.push({ pos: rowOffset + j, score });
        if (candidateEndPoints.length >= TRIM_THRESHOLD) {
          candidateEndPoints.sort((a, b) => b.score - a.score || a.pos - b.pos);
          if (candidateEndPoints.length > MAX_CANDIDATE_ENDPOINTS) {
            candidateEndPoints.length = MAX_CANDIDATE_ENDPOINTS;
          }
          candidateFloor = Math.max(
            minScore,
            candidateEndPoints[candidateEndPoints.length - 1]?.score ?? minScore,
          );
        }
      }
    }
  }

  if (maxScore < minScore) return [];

  if (candidateEndPoints.length === 0) return [];

  candidateEndPoints.sort((a, b) => b.score - a.score || a.pos - b.pos);
  if (candidateEndPoints.length > MAX_CANDIDATE_ENDPOINTS) {
    candidateEndPoints.length = MAX_CANDIDATE_ENDPOINTS;
  }

  return traceback(
    M,
    Iq,
    It,
    query,
    target,
    candidateEndPoints,
    rowWidth,
    matchScore,
    mismatchPenalty,
    gapOpen,
    gapExtend,
  );
}

function ungappedFuzzyScan(
  query: string,
  target: string,
  matchScore: number,
  mismatchPenalty: number,
  minScore: number,
): { score: number; start: number; end: number; sequence: string }[] {
  const q = query.toUpperCase();
  const t = target.toUpperCase();
  const n = q.length;
  const m = t.length;
  if (n === 0 || m === 0) return [];

  const windowLen = Math.min(n, m);
  const hits: { score: number; start: number; end: number; sequence: string }[] = [];

  // Keep fallback deterministic and bounded for UI responsiveness.
  const maxScanMs = 200;
  const startedAt = Date.now();
  const totalStarts = Math.max(1, m - windowLen + 1);
  const maxWindows = 50_000;
  const step = Math.max(1, Math.floor(totalStarts / maxWindows));

  for (let start = 0; start <= m - windowLen; start += step) {
    if (Date.now() - startedAt > maxScanMs) break;

    let score = 0;
    for (let k = 0; k < windowLen; k++) {
      score += q[k] === t[start + k] ? matchScore : mismatchPenalty;
    }
    if (score >= minScore) {
      hits.push({
        score,
        start,
        end: start + windowLen,
        sequence: target.substring(start, start + windowLen),
      });
      if (hits.length > 5000) break;
    }
  }

  hits.sort((a, b) => b.score - a.score || a.start - b.start);

  const selected: { score: number; start: number; end: number; sequence: string }[] = [];
  const seen = new Set<number>();
  for (const h of hits) {
    let overlap = false;
    for (let i = h.start; i < h.end; i++) {
      if (seen.has(i)) {
        overlap = true;
        break;
      }
    }
    if (!overlap) {
      selected.push(h);
      for (let i = h.start; i < h.end; i++) seen.add(i);
      if (selected.length >= 20) break;
    }
  }

  return selected;
}

function traceback(
  M: Int32Array,
  Iq: Int32Array,
  It: Int32Array,
  query: string,
  target: string,
  candidates: Array<{ pos: number; score: number }>,
  rowWidth: number,
  matchScore: number,
  mismatchPenalty: number,
  gapOpen: number,
  gapExtend: number,
): { score: number; start: number; end: number; sequence: string }[] {
  const results: { score: number; start: number; end: number; sequence: string }[] = [];
  const seen = new Set<number>();

  for (const candidate of candidates) {
    let i = Math.floor(candidate.pos / rowWidth);
    let j = candidate.pos % rowWidth;
    const jEnd = j;

    let state: 'M' | 'Iq' | 'It' = 'M';

    while (i > 0 && j > 0) {
      const idx = i * rowWidth + j;
      const prevIdxDiag = (i - 1) * rowWidth + (j - 1);
      const prevIdxUp = (i - 1) * rowWidth + j;
      const prevIdxLeft = i * rowWidth + (j - 1);

      const stateScore = state === 'M' ? M[idx] : state === 'Iq' ? Iq[idx] : It[idx];
      if (stateScore <= 0) break;

      if (state === 'M') {
        const qChar = query[i - 1].toUpperCase();
        const tChar = target[j - 1].toUpperCase();
        const match = qChar === tChar ? matchScore : mismatchPenalty;

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
        if (Iq[idx] === M[prevIdxUp] + gapOpen) {
          state = 'M';
          i--;
        } else if (Iq[idx] === Iq[prevIdxUp] + gapExtend) {
          i--;
        } else {
          break;
        }
      } else if (state === 'It') {
        if (It[idx] === M[prevIdxLeft] + gapOpen) {
          state = 'M';
          j--;
        } else if (It[idx] === It[prevIdxLeft] + gapExtend) {
          j--;
        } else {
          break;
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
        score: candidate.score,
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
