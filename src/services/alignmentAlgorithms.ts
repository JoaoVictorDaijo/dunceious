
/**
 * Smith-Waterman Local Alignment Algorithm
 * Used for "BLAST-like" fuzzy searching.
 */

export interface AlignmentResult {
  score: number;
  start: number; // Start in target sequence
  end: number;   // End in target sequence
  alignedQuery: string;
  alignedTarget: string;
}

export function smithWaterman(
  query: string,
  target: string,
  matchScore = 2,
  mismatchPenalty = -1,
  gapPenalty = -2
): AlignmentResult[] {
  const n = query.length;
  const m = target.length;

  // Scoring matrix
  // Using a 1D array for performance if needed, but 2D is clearer for now.
  // For large targets, we might need a more memory-efficient approach.
  const matrix: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  let maxScore = 0;
  const maxPositions: [number, number][] = [];

  // Fill matrix
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const match = query[i - 1] === target[j - 1] ? matchScore : mismatchPenalty;
      
      const score = Math.max(
        0,
        matrix[i - 1][j - 1] + match, // Match/Mismatch
        matrix[i - 1][j] + gapPenalty, // Deletion
        matrix[i][j - 1] + gapPenalty  // Insertion
      );

      matrix[i][j] = score;

      if (score > maxScore) {
        maxScore = score;
        maxPositions.length = 0;
        maxPositions.push([i, j]);
      } else if (score === maxScore && score > 0) {
        maxPositions.push([i, j]);
      }
    }
  }

  if (maxScore === 0) return [];

  // Traceback (simplified to find the best match)
  // In a real BLAST, we might want multiple high-scoring pairs (HSPs).
  // For now, let's just return the top matches that don't overlap significantly.
  
  const results: AlignmentResult[] = [];
  const seenTargets = new Set<number>();

  for (const [iStart, jStart] of maxPositions) {
    let i = iStart;
    let j = jStart;
    let alignedQuery = "";
    let alignedTarget = "";

    while (i > 0 && j > 0 && matrix[i][j] > 0) {
      const currentScore = matrix[i][j];
      const match = query[i - 1] === target[j - 1] ? matchScore : mismatchPenalty;

      if (currentScore === matrix[i - 1][j - 1] + match) {
        alignedQuery = query[i - 1] + alignedQuery;
        alignedTarget = target[j - 1] + alignedTarget;
        i--;
        j--;
      } else if (currentScore === matrix[i - 1][j] + gapPenalty) {
        alignedQuery = query[i - 1] + alignedQuery;
        alignedTarget = "-" + alignedTarget;
        i--;
      } else {
        alignedQuery = "-" + alignedQuery;
        alignedTarget = target[j - 1] + alignedTarget;
        j--;
      }
    }

    // Check if this target region is already covered
    let isOverlap = false;
    for (let k = j; k <= jStart; k++) {
      if (seenTargets.has(k)) {
        isOverlap = true;
        break;
      }
    }

    if (!isOverlap) {
      results.push({
        score: maxScore,
        start: j,
        end: jStart,
        alignedQuery,
        alignedTarget
      });
      for (let k = j; k <= jStart; k++) seenTargets.add(k);
    }
    
    if (results.length >= 10) break; // Limit results
  }

  return results;
}
