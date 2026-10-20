# Local alignment engine

This engine ports EMBOSS 6.6.0 `matcher.c` (Debian `6.6.0+dfsg-12`),
including Huang–Miller traceback, start-point tie ordering, affected-region
rescoring and `MATCHERDIAG` residue-pair exclusion. Query is `asequence`;
record is `bsequence`. Scores use int32 and are doubled to represent the
EMBOSS water gap defaults exactly: open 20, extend 1; a length-n gap costs
20 + (n − 1). EDNAFULL and EBLOSUM62 are committed verbatim.

Candidates are retained dynamically with no result cap. This equals matcher
whenever its K-list never truncates. Nodes contain int32 fields; a hash index
finds start points without changing append order or first-maximum selection
and swap-with-last removal. Phase 5 reference fixtures must compare against
matcher's largest non-fatal `-alternatives` count. Exhaustion returns zero
instead of matcher's fatal exit. AA/AAA yields scores 20, 20, 10, 10: the
last two hits use residue pairs not used by the first two alignments.

Used residue pairs are stored in an open-addressing set of exact (query,
record) coordinates. It grows with pairs recorded by traceback; membership
checks preserve residue-pair exclusion without scanning per-row lists.

## Build

Run `bash scripts/build-local-engine.sh` from a checkout with Docker access.
An optional first argument selects the output path, relative to the repository.
The script pins a released Emscripten image by digest, disables container
networking, fixes locale/time/source epoch, uses `-O2` without SIMD, and
produces a standalone module without WASI imports. The sole host import is
`env.emscripten_notify_memory_growth`, a no-op notification; callers recreate
memory views after any allocation. The committed artifact is
`public/wasm/local-align.wasm`. CI rebuilds to a separate path and requires
byte identity and a size below 25 MiB. `PROVENANCE.json` records source and
matrix hashes, image digest, compiler flags, environment and artifact hash.
Any C change requires a rebuild and updated artifact hash and size.

## ABI and ownership

Call the standalone reactor’s `_initialize()` once before allocating or calling
the engine.

`la_create(query, qlen, record, rlen, matrix, size, gap_open, gap_extend)`
copies the input codes and row-major int32 matrix into an independent context.
Codes index matrix rows; different symbols such as T/U have different codes.
The returned positive handle owns those copies and all algorithm storage.
`la_destroy(handle)` releases it, including after an allocation error.

`la_max_score(query, qlen, record, rlen, matrix, size, gap_open, gap_extend)`
returns the exact first-alignment score2, zero for no positive alignment, or a
negative error. Inputs follow `la_create`'s validation. It uses two record-length
score rows, no origins or candidate nodes, and retains no context or input copies.
It neither advances nor changes any enumeration handle.

## SSW score module

`ssw_score.c` builds `public/wasm/local-align-ssw.wasm`, a separate module, because SIMD
instructions make a whole module invalid on browsers without wasm SIMD. It `#include`s SSW
(Zhao et al. 2013, doi:10.1371/journal.pone.0082138) unmodified from `vendor/ssw/`. The pinned
commit is a66636b79ef36ac178122437053be0d8ef345271. The module calls only SSW's 16-bit striped
pass (`qP_word`, `sw_sse2_word`): Farrar's (2007) kernel, doi:10.1093/bioinformatics/btl582,
with SWPS3's lazy-F loop. It skips `ssw_align`, which writes to stderr, runs an 8-bit attempt
and a start-position pass, and would import WASI.

`la_max_score_ssw(query, qlen, record, rlen, matrix, size, gap_open, gap_extend)` takes
`la_max_score`'s arguments and returns the same score2. It returns −1 for invalid codes, sizes
or gaps, −2 on allocation failure, and −3 when the caller must use `la_max_score` instead: an
empty input, a matrix entry outside int8, or `max entry × min(qlen, rlen) ≥ 32767`, where the
saturating 16-bit adds could clip. SSW's lazy-F loop can't reach a deletion directly followed
by an insertion. Swapping those gaps keeps the end cells and the cost, so the maximum is the
same. The TypeScript binding takes the module as
`instantiateLocalEngine(module, { scoreModule })` and reports `scoreKernel`. The page passes it
only when its SIMD probe validates.

The module needs `-msimd128 -msse2` and `-std=gnu11`, imports only
`env.emscripten_notify_memory_growth`, and keeps per-call allocations: 6 bytes per record
residue plus the query profile.

`la_set_checkpoints(handle, enabled)` selects the checkpoint policy (0 or 1,
initially 1) before the first `la_bigpass_step` call. It returns 0, −1 for an
invalid handle/value or failed context, or −3 after BigPass starts. Disabling
checkpoints uses the unchanged SmallPass path; this is a differential-test
control, not a user setting. The TypeScript binding exposes it through
`instantiateLocalEngine(module, { checkpoints: false })`.

BigPass saves H, its origin (ci/cj), and the horizontal gap state f and its
origin (fi/fj) per query row at power-of-two column intervals, at least 256.
The smallest fitting interval keeps checkpoint storage within 4 MiB per engine:
`floor(rlen / step) × (qlen + 1) × 6 × 4` bytes. If even one useful checkpoint
cannot fit, or the record is too short, no checkpoints are allocated. Storage
is allocated lazily when BigPass starts and released by `la_destroy`.

`la_bigpass_step(handle, rows)` computes at most that many query rows and
returns the number completed. Call until it returns qlen before `la_next`.
`la_next(handle, out5, ops, ops_cap, ops_len)` returns 1 for a hit, 0 for
exhaustion, or a negative error. `out5` contains score2, query start/end,
record start/end, with 0-based half-open coordinates. `ops` contains one
ASCII `=`, `X`, `I` or `D` per alignment column, without soft clips;
`ops_len` receives the byte count. Reserve qlen + rlen bytes for `ops`.
Query-only columns are `I`; record-only columns are `D` (SAM convention).

Errors: −1 invalid input/handle or failed context; −2 allocation failure;
−3 incomplete first pass; −4 insufficient output capacity. Allocation failure
never truncates candidates. Invalid input includes out-of-range codes and
arithmetic that cannot be represented in int32. No heuristic or query cap
changes an accepted computation. ABI calls are synchronous; multiple handles
can be interleaved. The binding must release iterators on early termination.

`la_peak_memory()` returns the module's linear-memory high-water mark in bytes
(including allocator overhead and stack), for performance reporting. Wasm
memory grows but never shrinks. `malloc`/`free` are also exported.

## Checkpoint diagnostics

`la_checkpoint_step(qlen, rlen)` returns the planned interval or zero without
allocating an engine. It permits budget-boundary tests without large inputs.
`la_checkpoint_stat(handle, field)` returns −1 for an invalid handle/field;
otherwise it returns the following per-engine diagnostic value as a double:

| Field | Value |
| --- | --- |
| 0 | Allocated checkpoint step, or 0 when none is allocated |
| 1 | Allocated checkpoint bytes |
| 2 | Number of SmallPass calls |
| 3 | Number of SmallPass calls resumed from a checkpoint |
| 4 | Last resumed DP column, or 0 if never resumed |

Counters are stored as uint64 and returned as binary64, exact through 2^53.
They describe executed work, not alignment counts or biological metrics. The
binding's optional `onCheckpointDiagnostics` observer receives these values
before each iterator's context is destroyed, including on early return.

The [record-file differential harness](../../perf/checkpointDifferential.md)
compares enabled/disabled paths without printing sequence or alignment content.

## Provenance and licence

The C file preserves matcher’s GPL-2.0-or-later notice, Ian Longden’s
copyright, and attribution to W. R. Pearson’s LALIGN 2.0u4 and Huang & Miller
(1991), doi:10.1016/0196-8858(91)90017-D. The inherited header cites
*Adv. Appl. Math.* 12:373–381; the paper is 12:337–357. Debian distributes it in the
DFSG-reviewed EMBOSS source in main; the first `Files: *` copyright stanza
states that EMBOSS applications are released under the GPL, without a matcher
exception. The port is used under GPL-3.0-or-later in combination with the
application’s AGPL-3.0-or-later. The matrices preserve their own headers,
including Todd Lowe’s EDNAFULL attribution. Exact evidence is recorded in
`PROVENANCE.json`; the third-party notice integration belongs to Task 18.

`vendor/ssw/` keeps SSW's MIT `LICENSE.txt` and the MIT (Boston College) and BSD-2-Clause (Michael
Farrar, 2006) notices inside `ssw.c`. `public/wasm/local-align-ssw.NOTICE.txt` reproduces them
next to the shipped module. `PROVENANCE.json` (`scoreModule`) records their hashes, the wrapper
hash, flags and the artifact hash.
