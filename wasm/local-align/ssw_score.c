/* Dunceious: AGPL-3.0-or-later (see COPYING). vendor/ssw keeps its MIT and BSD-2 notices.
 *
 * Exact best local score through SSW's 16-bit striped pass
 * (Zhao et al. 2013, doi:10.1371/journal.pone.0082138; Farrar 2007,
 * doi:10.1093/bioinformatics/btl582). ssw.c is included unmodified so its
 * static profile and word-pass functions can be called without ssw_align's
 * stderr reporting, start-position pass and 8-bit attempt.
 *
 * Gap of length n costs gap_open + (n - 1) * gap_extend in both SSW and
 * la_max_score. SSW's lazy-F loop never opens an E gap from an F-corrected H, so
 * a deletion directly followed by an insertion is unreachable; swapping the two
 * gaps gives a path with the same end cells and cost, so the best score is the
 * same (SWPS3, as noted in ssw.c).
 */
#include "vendor/ssw/ssw.c"

/* Returns the best score, -1 for invalid input, -2 for allocation failure, or -3
 * when an input is empty or the 16-bit pass could saturate; the caller then uses
 * la_max_score, which also owns empty-input validation. */
int la_max_score_ssw(const uint8_t *query, int qlen, const uint8_t *record, int rlen,
                     const int32_t *matrix, int size, int gap_open, int gap_extend) {
    if (qlen == 0 || rlen == 0) return -3;
    if (!query || !record || !matrix || qlen < 0 || rlen < 0 || size <= 0 || size > 127
        || gap_open < 0 || gap_open > 255 || gap_extend < 0 || gap_extend > 255) return -1;
    for (int i = 0; i < qlen; i++) if (query[i] >= size) return -1;
    for (int j = 0; j < rlen; j++) if (record[j] >= size) return -1;
    int8_t *mat = malloc((size_t)size * size);
    if (!mat) return -2;
    int32_t best_entry = 0;
    for (int a = 0; a < size; a++) for (int b = 0; b < size; b++) {
        int32_t v = matrix[a * size + b];
        if (v < INT8_MIN || v > INT8_MAX) { free(mat); return -3; }
        if (v > best_entry) best_entry = v;
        /* qP_word indexes mat[record symbol * n + query symbol]. */
        mat[b * size + a] = (int8_t)v;
    }
    /* Every cell is at most best_entry times the aligned pairs, which cannot exceed
     * the shorter sequence; below INT16_MAX the saturating adds never clip. */
    if ((int64_t)best_entry * (qlen < rlen ? qlen : rlen) >= INT16_MAX) { free(mat); return -3; }
    __m128i *profile = qP_word((const int8_t *)query, mat, qlen, size);
    if (!profile) { free(mat); return -2; }
    alignment_end *best = sw_sse2_word((const int8_t *)record, 0, rlen, qlen,
                                       (uint8_t)gap_open, (uint8_t)gap_extend, profile, UINT16_MAX, 15);
    int score = best ? best[0].score : -2;
    free(best); free(profile); free(mat);
    return score;
}
