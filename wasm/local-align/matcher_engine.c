/* @source matcher application
**
** MATCHER finds the best local alignments between two sequences
** version 2.0u4 Feb. 1996
** Please cite:
** X. Huang and W. Miller (1991) Adv. Appl. Math. 12:373-381
**
** @author Copyright (C) Ian Longden (il@sanger.ac.uk)
** @@
**
** This program is free software; you can redistribute it and/or
** modify it under the terms of the GNU General Public License
** as published by the Free Software Foundation; either version 2
** of the License, or (at your option) any later version.
**
** This program is distributed in the hope that it will be useful,
** but WITHOUT ANY WARRANTY; without even the implied warranty of
** MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
** GNU General Public License for more details.
**
** You should have received a copy of the GNU General Public License
** along with this program; if not, write to the Free Software
** Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA  02111-1307, USA.
******************************************************************************/

/* Derived from EMBOSS 6.6.0 matcher, LALIGN 2.0u4 (W. R. Pearson),
 * Huang & Miller (1991), doi:10.1016/0196-8858(91)90017-D.
 * Query is A; record is B. All scores and penalties are doubled.
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>

typedef int32_t ajint;
typedef struct NODE {
    ajint SCORE, STARI, STARJ, ENDI, ENDJ, TOP, BOT, LEFT, RIGHT;
} vertex, *vertexptr;

typedef struct Engine {
    ajint *sapp, last, I, J, al_len, **sub;
    vertexptr *LIST, low, most;
    ajint *CC, *DD, *RR, *SS, *EE, *FF, *HH, *WW, *II, *JJ, *XX, *YY;
    ajint m1, mm, n1, nn, rl, cl, lmin, flag, q, r, qr;
    uint64_t *used_pairs;
    size_t used_count, used_capacity;
    char *A, *B;
    ajint M, N, progress, step_end, numnode, capacity, pending, failed;
    ajint *script;
    vertexptr *index;
    size_t index_size;
    struct Engine *next;
    vertexptr last_node;
    uint32_t *filter;
    ajint *checkpoints;
    ajint checkpoint_step, checkpoint_count, checkpoints_enabled, checkpoints_started;
    ajint min_starj, last_checkpoint_column;
    uint64_t checkpoint_small_passes, checkpoint_resumes;
} Engine;

/* ABI calls are synchronous; selecting a context preserves independent iterators. */
static Engine *active, *engines;
#define CHECKPOINT_BUDGET (4u * 1024u * 1024u)
#define CHECKPOINT_FIELDS 6u

int la_checkpoint_step(int qlen, int rlen) {
    if (qlen < 1 || rlen < 256) return 0;
    uint64_t row_bytes = ((uint64_t)qlen + 1) * CHECKPOINT_FIELDS * sizeof(ajint);
    if (row_bytes > CHECKPOINT_BUDGET) return 0;
    for (int step = 256; step <= rlen;) {
        if ((uint64_t)(rlen / step) <= CHECKPOINT_BUDGET / row_bytes) return step;
        if (step > rlen / 2) break;
        step *= 2;
    }
    return 0;
}

static void *checked_calloc(size_t count, size_t bytes) {
    void *p = calloc(count, bytes);
    if (!p) active->failed = 1;
    return p;
}
#define AJNEW0(p) ((p) = checked_calloc(1, sizeof(*(p))))
#define matchergap(k) ((k) <= 0 ? 0 : q+r*(k))
#define sapp (active->sapp)
#define last (active->last)
#define I (active->I)
#define J (active->J)
#define al_len (active->al_len)
#define sub (active->sub)
#define LIST (active->LIST)
#define low (active->low)
#define most (active->most)
#define CC (active->CC)
#define DD (active->DD)
#define RR (active->RR)
#define SS (active->SS)
#define EE (active->EE)
#define FF (active->FF)
#define HH (active->HH)
#define WW (active->WW)
#define II (active->II)
#define JJ (active->JJ)
#define XX (active->XX)
#define YY (active->YY)
#define m1 (active->m1)
#define mm (active->mm)
#define n1 (active->n1)
#define nn (active->nn)
#define rl (active->rl)
#define cl (active->cl)
#define lmin (active->lmin)
#define flag (active->flag)
#define q (active->q)
#define r (active->r)
#define qr (active->qr)

/* Traceback records 1-based residue pairs, leaving zero available as the empty key. */
static uint64_t used_pair_key(ajint i, ajint j) {
    return ((uint64_t)(uint32_t)i << 32) | (uint32_t)j;
}

static size_t used_pair_slot(uint64_t key, const uint64_t *entries, size_t capacity) {
    uint64_t hash = key;
    hash = (hash ^ (hash >> 30)) * UINT64_C(0xbf58476d1ce4e5b9);
    hash = (hash ^ (hash >> 27)) * UINT64_C(0x94d049bb133111eb);
    hash ^= hash >> 31;
    size_t slot = (size_t)hash & (capacity - 1);
    while (entries[slot] && entries[slot] != key)
        slot = (slot + 1) & (capacity - 1);
    return slot;
}

#define FILTER_BITS (1u << 20)
static uint32_t filter_bit(ajint i, ajint j) {
    return ((uint32_t)i * 0x9E3779B1u + (uint32_t)j) & (FILTER_BITS - 1);
}
static int used_pair_contains(ajint i, ajint j) {
    if (!active->used_count) return 0;
    uint32_t b = filter_bit(i, j);
    if (!(active->filter[b >> 5] & (1u << (b & 31)))) return 0;
    uint64_t key = used_pair_key(i, j);
    size_t slot = used_pair_slot(key, active->used_pairs, active->used_capacity);
    return active->used_pairs[slot] != 0;
}

static int used_pair_add(ajint i, ajint j) {
    uint64_t key = used_pair_key(i, j);
    size_t slot = 0;
    if (active->used_capacity) {
        slot = used_pair_slot(key, active->used_pairs, active->used_capacity);
        if (active->used_pairs[slot] == key) return 1;
    }
    /* Half occupancy guarantees an empty probe terminator without a sequence-sized table. */
    if (active->used_count >= active->used_capacity / 2) {
        if (active->used_capacity > SIZE_MAX / (2 * sizeof(*active->used_pairs))) {
            active->failed = 1;
            return 0;
        }
        size_t capacity = active->used_capacity ? active->used_capacity * 2 : 64;
        uint64_t *entries = checked_calloc(capacity, sizeof(*entries));
        if (!entries) return 0;
        for (size_t k = 0; k < active->used_capacity; k++) {
            uint64_t entry = active->used_pairs[k];
            if (entry) entries[used_pair_slot(entry, entries, capacity)] = entry;
        }
        free(active->used_pairs);
        active->used_pairs = entries;
        active->used_capacity = capacity;
        slot = used_pair_slot(key, entries, capacity);
    }
    if (!active->filter) {
        active->filter = checked_calloc(FILTER_BITS / 32, sizeof(*active->filter));
        if (!active->filter) return 0;
    }
    active->used_pairs[slot] = key;
    active->used_count++;
    uint32_t b = filter_bit(i, j);
    active->filter[b >> 5] |= 1u << (b & 31);
    return 1;
}

#define MATCHERDEL(k)			\
{ I += k;				\
  al_len += k;				\
  if (last < 0)				\
    last = sapp[-1] -= (k);		\
  else					\
    last = *sapp++ = -(k);		\
}
#define MATCHERINS(k)			\
{ J += k;				\
  al_len += k;				\
  if (last < 0)				\
    { sapp[-1] = (k); *sapp++ = last; }	\
  else					\
    last = *sapp++ = (k);		\
}
#define MATCHERREP 			\
{ last = *sapp++ = 0; 			\
  al_len += 1;				\
}
#define MATCHERDIAG(ii, jj, x, value)				\
{                                                		\
  if (!used_pair_contains((ii), (jj)))			\
    x = (value);						\
}
/* Equal scores must retain matcher's lexicographic origin tie order. */
#define MATCHERORDER(ss1, xx1, yy1, ss2, xx2, yy2)			\
{ ajint t_ = ((ss1) < (ss2)) | (((ss1) == (ss2)) &			\
     (((xx1) < (xx2)) | (((xx1) == (xx2)) & ((yy1) < (yy2)))));	\
  ss1 = t_ ? (ss2) : (ss1); xx1 = t_ ? (xx2) : (xx1); yy1 = t_ ? (yy2) : (yy1); }

static ajint matcher_Addnode(ajint, ajint, ajint, ajint, ajint, ajint, ajint, ajint *);
static ajint matcher_Diff(const char *, const char *, ajint, ajint, ajint, ajint);
/* Retaining all positive start points equals matcher when its K-list never
 * truncates. Hash lookup changes no list order; Findmax still swaps with last.
 * Phase 5 compares with matcher's largest non-fatal alternatives count.
 */
static size_t node_hash(int i, int j) {
    return (uint32_t)i * 2654435761u ^ (uint32_t)j * 2246822519u;
}
static size_t node_slot(int i, int j) {
    size_t slot = node_hash(i, j) & (active->index_size - 1);
    while (active->index[slot] &&
           (active->index[slot]->STARI != i || active->index[slot]->STARJ != j))
        slot = (slot + 1) & (active->index_size - 1);
    return slot;
}
static int grow_nodes(int count) {
    if (count == active->capacity) {
        int capacity = active->capacity ? active->capacity * 2 : 16;
        if (capacity < active->capacity || capacity > INT_MAX / (int)sizeof(vertexptr))
            { active->failed = 1; return 0; }
        vertexptr *list = realloc(LIST, (size_t)capacity * sizeof(*list));
        if (!list) { active->failed = 1; return 0; }
        LIST = list;
        memset(LIST + active->capacity, 0, (capacity - active->capacity) * sizeof(*LIST));
        active->capacity = capacity;
    }
    if (!LIST[count]) AJNEW0(LIST[count]);
    if (active->failed) return 0;
    if ((size_t)(count + 1) * 2 >= active->index_size) {
        size_t size = active->index_size ? active->index_size * 2 : 32;
        vertexptr *index = checked_calloc(size, sizeof(*index));
        if (!index) return 0;
        free(active->index); active->index = index; active->index_size = size;
        for (int k = 0; k < count; k++)
            active->index[node_slot(LIST[k]->STARI, LIST[k]->STARJ)] = LIST[k];
    }
    return 1;
}
static void remove_node(vertexptr node) {
    if (active->last_node == node) active->last_node = NULL;
    size_t slot = node_slot(node->STARI, node->STARJ);
    active->index[slot] = NULL;
    /* Reinsert the collision cluster so lookup still terminates at an empty slot. */
    for (slot = (slot + 1) & (active->index_size - 1); active->index[slot];
         slot = (slot + 1) & (active->index_size - 1)) {
        vertexptr entry = active->index[slot]; active->index[slot] = NULL;
        active->index[node_slot(entry->STARI, entry->STARJ)] = entry;
    }
}

static ajint matcher_NoCross(ajint numnode)
{
    vertexptr  cur;
    register ajint i;

    for(i = 0; i < numnode; i++)
    {
	cur = LIST[i];
	if(cur->STARI <= mm && cur->STARJ <= nn && cur->BOT >= m1-1 &&
	    cur->RIGHT >= n1-1 && ( cur->STARI < rl || cur->STARJ < cl))
	{
	    if(cur->STARI < rl)
		rl = cur->STARI;

	    if(cur->STARJ < cl)
		cl = cur->STARJ;
	    flag = 1;
	    break;
	}
    }

    if(i == numnode)
	return 1;

    return 0;
}

static ajint matcher_BigPass(const char *A,const char *B,
			     ajint M,ajint N,ajint K,
			      ajint nseq, ajint *numnode)
{
    register ajint  i;
    register ajint  j;
    register ajint  c;
    register ajint  f;
    register ajint  d;
    register ajint  p;
    register ajint  ci;
    register ajint  cj;
    register ajint  di;
    register ajint  dj;
    register ajint  fi;
    register ajint  fj;
    register ajint  pi;
    register ajint  pj;
    ajint  *va;

    if (!active->progress) for(j = 1; j <= N; j++)
    {
	CC[j] = 0;
	RR[j] = 0;
	EE[j] = j;
	DD[j] = - (q);
	SS[j] = 0;
	FF[j] = j;
    }

    for(i = active->progress + 1; i <= active->step_end; i++)
    {
	c = 0;
	f = - (q);
	ci = fi = i;
	va = sub[(ajint)A[i]];

	if(nseq == 2)
	{
	    p = 0;
	    pi = i - 1;
	    cj = fj = pj = 0;
	}
	else
	{
	    p = CC[i];
	    pi = RR[i];
	    pj = EE[i];
	    cj = fj = i;
	}

	for(j = (nseq == 2 ? 1 : (i+1)); j <= N; j++)
	{
	    f = f - r;
	    c = c - qr;
	    MATCHERORDER(f, fi, fj, c, ci, cj)
	    c = CC[j] - qr;
	    ci = RR[j];
	    cj = EE[j];
	    d = DD[j] - r;
	    di = SS[j];
	    dj = FF[j];
	    MATCHERORDER(d, di, dj, c, ci, cj)
	    c = 0;
	    MATCHERDIAG(i, j, c, p+va[(ajint)B[j]])

	    if(c <= 0)
	    {
	        c = 0;
		ci = i;
		cj = j;
	    }
	    else
	    {
	        ci = pi; cj = pj; }
	    MATCHERORDER(c, ci, cj, d, di, dj)
	    MATCHERORDER(c, ci, cj, f, fi, fj)
	    p = CC[j];
	    CC[j] = c;
	    pi    = RR[j];
	    pj    = EE[j];
	    RR[j] = ci;
	    EE[j] = cj;
	    DD[j] = d;
	    SS[j] = di;
	    FF[j] = dj;
	    if(c > lmin)
		lmin = matcher_Addnode(c, ci, cj, i, j, K, lmin, numnode);
        if (active->failed) return -2;
        if (active->checkpoints && !(j & (active->checkpoint_step - 1))) {
            ajint *saved = active->checkpoints +
                ((size_t)(j / active->checkpoint_step - 1) * (M + 1) + i) * CHECKPOINT_FIELDS;
            saved[0] = c; saved[1] = ci; saved[2] = cj;
            saved[3] = f; saved[4] = fi; saved[5] = fj;
        }
	}
    }

    active->progress = active->step_end;
    (void)M;
    return 0;
}

static ajint matcher_Locate(const char *A,const char *B,ajint nseq,
			    ajint numnode)
{
    register ajint i;
    register ajint j;
    register ajint c;
    register ajint f;
    register ajint d;
    register ajint p;
    register ajint ci;
    register ajint cj;
    register ajint di=0;
    register ajint dj=0;
    register ajint fi;
    register ajint fj;
    register ajint pi;
    register ajint pj;
    ajint cflag;
    ajint rflag;
    ajint  *va;
    ajint  limit;

    for(j = nn; j >= n1; j--)
    {
	CC[j] = 0;
	EE[j] = j;
	DD[j] = - (q);
	FF[j] = j;
	if(nseq == 2 || j > mm)
	    RR[j] = SS[j] = mm + 1;
	else
	    RR[j] = SS[j] = j;
    }

    for(i = mm; i >= m1; i--)
    {
	c  = p = 0;
	f  = - (q);
	ci = fi = i;
	pi = i + 1;
	cj = fj = pj = nn + 1;
	va = sub[(ajint)A[i]];

	if(nseq == 2 || n1 > i)
	    limit = n1;
	else
	    limit = i + 1;

	for(j = nn; j >= limit; j--)
	{
	    f = f - r;
	    c = c - qr;
	    MATCHERORDER(f, fi, fj, c, ci, cj)
	    c = CC[j] - qr;
	    ci = RR[j];
	    cj = EE[j];
	    d = DD[j] - r;
	    di = SS[j];
	    dj = FF[j];
	    MATCHERORDER(d, di, dj, c, ci, cj)
	    c = 0;
	    MATCHERDIAG(i, j, c, p+va[(ajint)B[j]])

	    if(c <= 0)
	    {
		c  = 0;
	        ci = i;
	        cj = j;
	    }
	    else
	    {
	        ci = pi;
	        cj = pj;
	    }

	    MATCHERORDER(c, ci, cj, d, di, dj)
	    MATCHERORDER(c, ci, cj, f, fi, fj)
	    p = CC[j];
	    CC[j] = c;
	    pi = RR[j];
	    pj = EE[j];
	    RR[j] = ci;
	    EE[j] = cj;
	    DD[j] = d;
	    SS[j] = di;
	    FF[j] = dj;
	    if(c > lmin)
		flag = 1;
	}

	if(nseq == 2 || i < n1)
	{
	    HH[i] = CC[n1];
	    II[i] = RR[n1];
	    JJ[i] = EE[n1];
	    WW[i] = DD[n1];
	    XX[i] = SS[n1];
	    YY[i] = FF[n1];
	}
    }

    for(rl = m1, cl = n1; ;)
    {
	for(rflag = cflag = 1;( rflag && m1 > 1 ) || ( cflag && n1 > 1 );)
	{
	    if(rflag && m1 > 1)
	    {
		rflag = 0;
		m1--;
		c = p = 0;
		f = - (q);
		ci = fi = m1;
		pi = m1 + 1;
		cj = fj = pj = nn + 1;
		va = sub[(ajint)A[m1]];

		for(j = nn; j >= n1; j--)
		{
		    f = f - r;
		    c = c - qr;
		    MATCHERORDER(f, fi, fj, c, ci, cj)
		    c = CC[j] - qr;
		    ci = RR[j];
		    cj = EE[j];
		    d = DD[j] - r;
		    di = SS[j];
		    dj = FF[j];
		    MATCHERORDER(d, di, dj, c, ci, cj)
		    c = 0;
		    MATCHERDIAG(m1, j, c, p+va[(ajint)B[j]])

		    if(c <= 0)
		    {
		        c = 0;
		        ci = m1;
		        cj = j;
		    }
		    else
		    {
		        ci = pi;
		        cj = pj;
		    }

		    MATCHERORDER(c, ci, cj, d, di, dj)
		    MATCHERORDER(c, ci, cj, f, fi, fj)
		    p = CC[j];
		    CC[j] = c;
		    pi = RR[j];
		    pj = EE[j];
		    RR[j] = ci;
		    EE[j] = cj;
		    DD[j] = d;
		    SS[j] = di;
		    FF[j] = dj;
		    if(c > lmin)
			flag = 1;
		    if(! rflag && ( (ci > rl && cj > cl) || (di > rl && dj >
							       cl)
				     || (fi > rl && fj > cl )))
			rflag = 1;
		}

		HH[m1] = CC[n1];
		II[m1] = RR[n1];
		JJ[m1] = EE[n1];
		WW[m1] = DD[n1];
		XX[m1] = SS[n1];
		YY[m1] = FF[n1];
		if(! cflag && ( (ci > rl && cj > cl) || (di > rl && dj > cl)
				 || (fi > rl && fj > cl)))
		    cflag = 1;
	    }

	    if(nseq == 1 && n1 == (m1 + 1) && ! rflag)
		cflag = 0;

	    if(cflag && n1 > 1)
	    {
		cflag = 0;
		n1--;
		c = 0;
		f = - (q);
		cj = fj = n1;
		va = sub[(ajint)B[n1]];
		if(nseq == 2 || mm < n1)
		{
		    p = 0;
		    ci = fi = pi = mm + 1;
		    pj = n1 + 1;
		    limit = mm;
		}
		else
		{
		    p = HH[n1];
		    pi = II[n1];
		    pj = JJ[n1];
		    ci = fi = n1;
		    limit = n1 - 1;
		}

		for(i = limit; i >= m1; i--)
		{
		    f = f - r;
		    c = c - qr;
		    MATCHERORDER(f, fi, fj, c, ci, cj)
		    c = HH[i] - qr;
		    ci = II[i];
		    cj = JJ[i];
		    d = WW[i] - r;
		    di = XX[i];
		    dj = YY[i];
		    MATCHERORDER(d, di, dj, c, ci, cj)
		    c = 0;
		    MATCHERDIAG(i, n1, c, p+va[(ajint)A[i]])
		    if(c <= 0)
		    {
		        c = 0;
		        ci = i;
		        cj = n1;
		    }
		    else
		    {
		       ci = pi;
		       cj = pj;
		    }

		    MATCHERORDER(c, ci, cj, d, di, dj)
		    MATCHERORDER(c, ci, cj, f, fi, fj)
		    p = HH[i];
		    HH[i] = c;
		    pi = II[i];
		    pj = JJ[i];
		    II[i] = ci;
		    JJ[i] = cj;
		    WW[i] = d;
		    XX[i] = di;
		    YY[i] = dj;

		    if(c > lmin)
			flag = 1;

		    if(! cflag && ( (ci > rl && cj > cl) || (di > rl && dj >
							       cl)
				     || (fi > rl && fj > cl)))
			cflag = 1;
		}
		CC[n1] = HH[m1];
		RR[n1] = II[m1];
		EE[n1] = JJ[m1];
		DD[n1] = WW[m1];
		SS[n1] = XX[m1];
		FF[n1] = YY[m1];

		if(! rflag && ( (ci > rl && cj > cl) || (di > rl && dj > cl)
				 || (fi > rl && fj > cl)))
		    rflag = 1;
	    }
	}
	if((m1 == 1 && n1 == 1) || matcher_NoCross(numnode))
	    break;
    }
    m1--;
    n1--;

    return 0;
}

static ajint matcher_SmallPass(const char *A,const char *B,
			       ajint count,ajint nseq, ajint *numnode)
{
    register ajint i;
    register ajint j;
    register ajint c;
    register ajint f;
    register ajint d;
    register ajint p;
    register ajint ci;
    register ajint cj;
    register ajint di;
    register ajint dj;
    register ajint fi;
    register ajint fj;
    register ajint pi;
    register ajint pj;
    ajint  *va;
    ajint  limit;

    ajint start = 0;
    const ajint *checkpoint = NULL;
    active->checkpoint_small_passes++;
    /* At the origin, SmallPass equals BigPass under the current exclusions. Columns
     * below min_starj have no used pairs or removed-node cells; their growing node
     * aggregates need no replay. Saved H/origins/f per row therefore resume exactly
     * at c <= min(min_starj - 1, nn), with row 1's predecessor (0, 0, c).
     */
    if (m1 == 0 && n1 == 0 && active->checkpoints) {
        ajint bound = active->min_starj - 1 < nn ? active->min_starj - 1 : nn;
        ajint k = bound / active->checkpoint_step;
        if (k > active->checkpoint_count) k = active->checkpoint_count;
        if (k >= 1) {
            start = k * active->checkpoint_step;
            checkpoint = active->checkpoints + (size_t)(k - 1) * (active->M + 1) * CHECKPOINT_FIELDS;
            active->checkpoint_resumes++;
            active->last_checkpoint_column = start;
        }
    }

    for(j = n1 + 1 + start; j <= nn; j++)
    {
	CC[j] = 0;
	RR[j] = m1;
	EE[j] = j;
	DD[j] = - (q);
	SS[j] = m1;
	FF[j] = j;
    }

    for(i = m1 + 1; i <= mm; i++)
    {
	c = 0;
	f = - (q);
	ci = fi = i;
	va = sub[(ajint)A[i]];

	if(nseq == 2 || i <= n1)
	{
	    p = 0;
	    pi = i - 1;
	    cj = fj = pj = n1;
	    limit = n1 + 1;
	}
	else
	{
	    p = CC[i];
	    pi = RR[i];
	    pj = EE[i];
	    cj = fj = i;
	    limit = i + 1;
	}

        if (checkpoint) {
            const ajint *saved = checkpoint + (size_t)i * CHECKPOINT_FIELDS;
            c = saved[0]; ci = saved[1]; cj = saved[2];
            f = saved[3]; fi = saved[4]; fj = saved[5];
            if (i == 1) { p = 0; pi = 0; pj = start; }
            else { p = saved[-6]; pi = saved[-5]; pj = saved[-4]; }
            limit = start + 1;
        }

	for(j = limit; j <= nn; j++)
	{
	    f = f - r;
	    c = c - qr;
	    MATCHERORDER(f, fi, fj, c, ci, cj)
	    c = CC[j] - qr;
	    ci = RR[j];
	    cj = EE[j];
	    d = DD[j] - r;
	    di = SS[j];
	    dj = FF[j];
	    MATCHERORDER(d, di, dj, c, ci, cj)
	    c = 0;
	    MATCHERDIAG(i, j, c, p+va[(ajint)B[j]])

	    if(c <= 0)
	    {
	      c = 0;
	      ci = i;
	      cj = j;
	    }
	    else
	    {
		ci = pi;
		cj = pj;
	    }

	    MATCHERORDER(c, ci, cj, d, di, dj)
	    MATCHERORDER(c, ci, cj, f, fi, fj)
	    p = CC[j];
	    CC[j] = c;
	    pi = RR[j];
	    pj = EE[j];
	    RR[j] = ci;
	    EE[j] = cj;
	    DD[j] = d;
	    SS[j] = di;
	    FF[j] = dj;
	    if(c > lmin)
		lmin = matcher_Addnode(c, ci, cj, i, j, count, lmin, numnode);
        if (active->failed) return -2;
	}
    }

    return 0;
}

static ajint matcher_Addnode(ajint c, ajint ci, ajint cj, ajint i, ajint j,
			     ajint K, ajint cost, ajint *numnode)
{
    ajint found;
    register ajint d;

    (void)K;
    (void)d;
    found = 0;
    if (active->last_node && active->last_node->STARI == ci && active->last_node->STARJ == cj) {
        most = active->last_node;
        found = 1;
    } else if (active->index_size) {
        most = active->index[node_slot(ci, cj)];
        found = most != NULL;
    }

    if(found)
    {
	if(most->SCORE < c)
        {
	    most->SCORE = c;
	    most->ENDI = i;
	    most->ENDJ = j;
        }

	if(most->TOP > i)
	    most->TOP = i;

	if(most->BOT < i)
	    most->BOT = i;

	if(most->LEFT > j)
	    most->LEFT = j;

	if(most->RIGHT < j)
	    most->RIGHT = j;
    }
    else
    {
        if (!grow_nodes(*numnode)) return cost;
        most = LIST[(*numnode)++];
	most->SCORE = c;
	most->STARI = ci;
	most->STARJ = cj;
	most->ENDI = i;
	most->ENDJ = j;
	most->TOP = most->BOT = i;
	most->LEFT = most->RIGHT = j;
        active->index[node_slot(ci, cj)] = most;
    }
    active->last_node = most;

    return cost;
}

static vertexptr matcher_Findmax(ajint *numnode)
{
    vertexptr  cur;
    register ajint i;
    register ajint j;

    for(j = 0, i = 1; i < *numnode; i++)
	if(LIST[i]->SCORE > LIST[j]->SCORE)
	    j = i;
    cur = LIST[j];
    remove_node(cur);

    if(j != --(*numnode))
    {
	LIST[j] = LIST[*numnode];
	LIST[*numnode] =  cur;
    }
    most = LIST[0];
    if(low == cur)
	low = LIST[0];

    return (cur);
}

static ajint matcher_Diff(const char *A,const char *B,
			  ajint M,ajint N,ajint tb,ajint te)
{
    ajint midi;
    ajint midj;
    ajint type;
    ajint midc;
    ajint  zero = 0;

    register ajint i;
    register ajint j;
    register ajint c;
    register ajint e;
    register ajint d;
    register ajint s;
    ajint t;
    ajint *va;

    if(N <= 0)
    {
	if(M > 0)
	    MATCHERDEL(M)
	return - matchergap(M);
    }

    if(M <= 1)
    {
	if(M <= 0)
        {
	    MATCHERINS(N);
	    return - matchergap(N);
        }
	if(tb > te)
	    tb = te;
	midc = - (tb + r + matchergap(N));
	midj = 0;
	va = sub[(ajint)A[1]];

	for(j = 1; j <= N; j++)
        {
	    if(!used_pair_contains(I+1, j+J))
            {
		c = va[(ajint)B[j]] - ( matchergap(j-1) + matchergap(N-j));
		if(c > midc)
		{
		    midc = c;
		    midj = j;
		}
	    }
	}

	if(midj == 0)
	{
	    MATCHERINS(N)
	    MATCHERDEL(1)
	}
	else
        {
	    if(midj > 1) MATCHERINS(midj-1)
		MATCHERREP

	    I++; J++;
            if (!used_pair_add(I, J)) return 0;

	    if(midj < N)
		MATCHERINS(N-midj)
        }
	return midc;
    }

    midi = M/2;
    CC[0] = 0;

    t = -q;
    for(j = 1; j <= N; j++)
    {
	CC[j] = t = t-r;
	DD[j] = t-q;
    }
    t = -tb;

    for(i = 1; i <= midi; i++)
    {
	s = CC[0];
	CC[0] = c = t = t-r;
	e = t-q;
	va = sub[(ajint)A[i]];
	for(j = 1; j <= N; j++)
        {
	    if((c = c - qr) > (e = e - r))
		e = c;

	    if((c = CC[j] - qr) > (d = DD[j] - r))
		d = c;
	    MATCHERDIAG(i+I, j+J, c, s+va[(ajint)B[j]])

	    if(c < d)
	        c = d;

	    if(c < e)
		c = e;

	    s = CC[j];
	    CC[j] = c;
	    DD[j] = d;
        }
    }
    DD[0] = CC[0];

    RR[N] = 0;
    t = -q;

    for(j = N-1; j >= 0; j--)
    {
	RR[j] = t = t-r;
	SS[j] = t-q;
    }
    t = -te;

    for(i = M-1; i >= midi; i--)
    {
	s = RR[N];
	RR[N] = c = t = t-r;
	e = t-q;
	va = sub[(ajint)A[i+1]];

	for(j = N-1; j >= 0; j--)
        {
	    if((c = c - qr) > (e = e - r))
		e = c;

	    if((c = RR[j] - qr) > (d = SS[j] - r))
		d = c;
	    MATCHERDIAG(i+1+I, j+1+J, c, s+va[(ajint)B[j+1]])

	    if(c < d)
		c = d;

	    if(c < e)
		c = e;

	    s = RR[j];
	    RR[j] = c;
	    SS[j] = d;
        }
    }
    SS[N] = RR[N];

    midc = CC[0]+RR[0];
    midj = 0;
    type = 1;

    for(j = 0; j <= N; j++)
	if((c = CC[j] + RR[j]) >= midc)
	    if(c > midc || (CC[j] != DD[j] && RR[j] == SS[j]))
	    {
		midc = c;
		midj = j;
	    }

    for(j = N; j >= 0; j--)
	if((c = DD[j] + SS[j] + q) > midc)
	{
	    midc = c;
	    midj = j;
	    type = 2;
	}

    if(type == 1)
    {
	matcher_Diff(A,B,midi,midj,tb,q);
        if (active->failed) return 0;
	matcher_Diff(A+midi,B+midj,M-midi,N-midj,q,te);
    }
    else
    {
	matcher_Diff(A,B,midi-1,midj,tb,zero);
        if (active->failed) return 0;
	MATCHERDEL(2);
	matcher_Diff(A+midi+1,B+midj,M-midi-1,N-midj,zero,te);
    }

    return midc;
}


static Engine *select_engine(int handle) {
    for (Engine *e = engines; e; e = e->next)
        if ((int)(intptr_t)e == handle) return active = e;
    return NULL;
}

int la_set_checkpoints(int handle, int enabled) {
    if (!select_engine(handle) || active->failed || (enabled != 0 && enabled != 1)) return -1;
    if (active->checkpoints_started) return -3;
    active->checkpoints_enabled = enabled;
    return 0;
}

double la_checkpoint_stat(int handle, int field) {
    if (!select_engine(handle)) return -1;
    switch (field) {
        case 0: return active->checkpoints ? active->checkpoint_step : 0;
        case 1: return active->checkpoints ?
            (double)((size_t)active->checkpoint_count * (active->M + 1) * CHECKPOINT_FIELDS * sizeof(ajint)) : 0;
        case 2: return (double)active->checkpoint_small_passes;
        case 3: return (double)active->checkpoint_resumes;
        case 4: return active->last_checkpoint_column;
        default: return -1;
    }
}

void la_destroy(int handle) {
    if (!select_engine(handle)) return;
    Engine *e = active;
    Engine **link = &engines;
    while (*link != e) link = &(*link)->next;
    *link = e->next;
    free(e->used_pairs);
    free(e->filter);
    free(e->checkpoints);
    for (int i = 0; i < e->capacity; i++) free(LIST[i]);
    free(LIST); free(e->index);
    free(CC); free(DD); free(RR); free(SS); free(EE); free(FF);
    free(HH); free(WW); free(II); free(JJ); free(XX); free(YY);
    free(e->A); free(e->B); free(e->script);
    if (sub) { free(sub[0]); free(sub); }
    free(e);
    active = NULL;
}

static int valid_input(const uint8_t *query, int qlen, const uint8_t *record, int rlen,
              const int32_t *matrix, int size, int gap_open, int gap_extend) {
    if (!query || !record || !matrix || qlen < 0 || rlen < 0 ||
        size < 1 || size > 128 || gap_extend <= 0 || gap_open < gap_extend ||
        (int64_t)qlen + rlen + 2 > INT_MAX / 4) return 0;
    for (int i = 0; i < qlen; i++) if (query[i] >= size) return 0;
    for (int i = 0; i < rlen; i++) if (record[i] >= size) return 0;
    int64_t max_score = 0, min_score = 0;
    for (int i = 0; i < size * size; i++) {
        if (matrix[i] > max_score) max_score = matrix[i];
        if (matrix[i] < min_score) min_score = matrix[i];
    }
    /* Diff adds forward/reverse rows and subtracts terminal gap penalties. */
    if (max_score * (qlen < rlen ? qlen : rlen) + gap_open > INT_MAX ||
        (int64_t)gap_open * 2 + (int64_t)gap_extend * (qlen + rlen) - min_score > INT_MAX) return 0;
    return 1;
}

/* Gotoh's local maximum uses matcher's BigPass arithmetic without origin ties.
 * No exclusions exist before the first alignment, so this is its exact score.
 */
int la_max_score(const uint8_t *query, int qlen, const uint8_t *record, int rlen,
                 const int32_t *matrix, int size, int gap_open, int gap_extend) {
    if (!valid_input(query, qlen, record, rlen, matrix, size, gap_open, gap_extend)) return -1;
    ajint *scores = calloc((size_t)rlen + 1, sizeof(*scores));
    ajint *deletions = calloc((size_t)rlen + 1, sizeof(*deletions));
    if (!scores || !deletions) { free(scores); free(deletions); return -2; }
    for (int j = 0; j <= rlen; j++) deletions[j] = -(gap_open - gap_extend);
    ajint maximum = 0;
    for (int i = 0; i < qlen; i++) {
        ajint diagonal = 0, current = 0, insertion = -(gap_open - gap_extend);
        const int32_t *row = matrix + query[i] * size;
        for (int j = 1; j <= rlen; j++) {
            ajint open = current - gap_open;
            insertion -= gap_extend;
            if (open > insertion) insertion = open;
            open = scores[j] - gap_open;
            ajint deletion = deletions[j] - gap_extend;
            if (open > deletion) deletion = open;
            current = diagonal + row[record[j - 1]];
            if (current < 0) current = 0;
            if (current < deletion) current = deletion;
            if (current < insertion) current = insertion;
            diagonal = scores[j];
            scores[j] = current;
            deletions[j] = deletion;
            if (current > maximum) maximum = current;
        }
    }
    free(scores); free(deletions);
    return maximum;
}

int la_create(const uint8_t *query, int qlen, const uint8_t *record, int rlen,
              const int32_t *matrix, int size, int gap_open, int gap_extend) {
    if (!valid_input(query, qlen, record, rlen, matrix, size, gap_open, gap_extend)) return -1;
    Engine *e = calloc(1, sizeof(*e));
    if (!e) return -2;
    e->next = engines; engines = e; active = e;
    e->M = qlen; e->N = rlen;
    e->checkpoints_enabled = 1;
    e->checkpoint_step = la_checkpoint_step(qlen, rlen);
    e->checkpoint_count = e->checkpoint_step ? rlen / e->checkpoint_step : 0;
    e->min_starj = INT_MAX;
    q = gap_open - gap_extend; r = gap_extend; qr = gap_open;
    e->A = checked_calloc((size_t)qlen + 1, 1);
    e->B = checked_calloc((size_t)rlen + 1, 1);
    if (e->failed) { la_destroy((int)(intptr_t)e); return -2; }
    memcpy(e->A + 1, query, qlen); memcpy(e->B + 1, record, rlen);
    sub = checked_calloc(size, sizeof(*sub));
    if (!sub) { la_destroy((int)(intptr_t)e); return -2; }
    sub[0] = checked_calloc(size * size, sizeof(**sub));
    if (!sub[0]) { la_destroy((int)(intptr_t)e); return -2; }
    memcpy(sub[0], matrix, size * size * sizeof(**sub));
    for (int i = 1; i < size; i++) sub[i] = sub[0] + i * size;
    CC = checked_calloc((size_t)rlen + 1, sizeof(*CC));
    DD = checked_calloc((size_t)rlen + 1, sizeof(*DD));
    RR = checked_calloc((size_t)rlen + 1, sizeof(*RR));
    SS = checked_calloc((size_t)rlen + 1, sizeof(*SS));
    EE = checked_calloc((size_t)rlen + 1, sizeof(*EE));
    FF = checked_calloc((size_t)rlen + 1, sizeof(*FF));
    HH = checked_calloc((size_t)qlen + 1, sizeof(*HH));
    WW = checked_calloc((size_t)qlen + 1, sizeof(*WW));
    II = checked_calloc((size_t)qlen + 1, sizeof(*II));
    JJ = checked_calloc((size_t)qlen + 1, sizeof(*JJ));
    XX = checked_calloc((size_t)qlen + 1, sizeof(*XX));
    YY = checked_calloc((size_t)qlen + 1, sizeof(*YY));
    e->script = checked_calloc((size_t)qlen + rlen + 2, sizeof(*e->script));
    if (e->failed) { la_destroy((int)(intptr_t)e); return -2; }
    return (int)(intptr_t)e;
}

int la_bigpass_step(int handle, int rows) {
    if (!select_engine(handle) || rows <= 0 || active->failed) return -1;
    if (!active->checkpoints_started) {
        active->checkpoints_started = 1;
        if (active->checkpoints_enabled && active->checkpoint_count) {
            active->checkpoints = checked_calloc(
                (size_t)active->checkpoint_count * (active->M + 1) * CHECKPOINT_FIELDS, sizeof(ajint));
            if (!active->checkpoints) return -2;
        }
    }
    if (active->progress == active->M) return active->progress;
    active->step_end = active->M - active->progress < rows ? active->M : active->progress + rows;
    matcher_BigPass(active->A, active->B, active->M, active->N, INT_MAX, 2, &active->numnode);
    return active->failed ? -2 : active->progress;
}

int la_next(int handle, int32_t *out5, uint8_t *ops, int ops_cap, int32_t *ops_len) {
    if (!select_engine(handle) || active->failed || !out5 || !ops || !ops_len) return -1;
    if (active->progress != active->M) return -3;
    if (ops_cap < active->M + active->N) return -4;
    if (active->pending) {
        flag = 0;
        matcher_Locate(active->A, active->B, 2, active->numnode);
        if (flag) matcher_SmallPass(active->A, active->B, INT_MAX, 2, &active->numnode);
        if (active->failed) return -2;
        active->pending = 0;
    }
    if (!active->numnode) { *ops_len = 0; return 0; }
    vertexptr cur = matcher_Findmax(&active->numnode);
    int score = cur->SCORE, stari = cur->STARI + 1, starj = cur->STARJ + 1;
    if (starj < active->min_starj) active->min_starj = starj;
    int endi = cur->ENDI, endj = cur->ENDJ;
    m1 = cur->TOP; mm = cur->BOT; n1 = cur->LEFT; nn = cur->RIGHT;
    rl = endi - stari + 1; cl = endj - starj + 1;
    I = stari - 1; J = starj - 1; sapp = active->script; last = al_len = 0;
    matcher_Diff(active->A + stari - 1, active->B + starj - 1, rl, cl, q, q);
    if (active->failed) return -2;
    int ai = stari, bi = starj, length = 0;
    for (int *s = active->script; s < sapp; s++) {
        if (*s == 0) ops[length++] = active->A[ai++] == active->B[bi++] ? '=' : 'X';
        else if (*s < 0) for (int k = 0; k < -*s; k++) { ops[length++] = 'I'; ai++; }
        else for (int k = 0; k < *s; k++) { ops[length++] = 'D'; bi++; }
    }
    out5[0] = score; out5[1] = stari - 1; out5[2] = endi;
    out5[3] = starj - 1; out5[4] = endj; *ops_len = length;
    active->pending = 1;
    return 1;
}

/* WebAssembly memory only grows; byte length is the module heap high-water mark. */
uint32_t la_peak_memory(void) {
#ifdef __wasm__
    return (uint32_t)(__builtin_wasm_memory_size(0) * 65536u);
#else
    return 0;
#endif
}
