---
title: "Local alignment search: exact Smith-Waterman beside whole-query fuzzy search"
status: proposed
date: 2026-10-16
areas: ["search", "workers", "app"]
prs: []
issues: []
superseded_by: null
summary: "Fuzzy search gains a Local mode that, like the earlier Smith-Waterman search, reports several non-overlapping hits per record and strand, now exactly: one Huang-Miller Waterman-Eggert engine in WebAssembly reproduces EMBOSS matcher's alignments under EMBOSS water's scoring defaults, with metrics defined from the alignment path and validation against an independent oracle, water and matcher."
---
# Local alignment search — design

## Why

Since v3.4.0, fuzzy search answers one question exactly: *where does the whole query occur with at
most k edits* (Myers' bit-parallel edit distance, `src/core/search/fuzzy.ts`). It cannot answer the
other common question: *where is a stretch similar to part of my query*. Examples are a conserved
domain inside a longer query, a fragment, or homology between related genomes. Whole-query mode
reports such partial matches only if the identity threshold is low enough to absorb the unmatched
part, which defeats the threshold.

The pre-3.4.0 search tried to answer the local question with seeded Smith-Waterman. It was
heuristic (seeds could miss hits), filtered after a result cap, and timed out, but it did return
several hits per record. This design brings back the local question and that behaviour, with an
exact method.

Scientists read these results as evidence (the *Scientific rigor* rule in `CLAUDE.md`). The tool
must give results they can reproduce with standard software.

**Base:** `develop` at v3.4.0, with the whole-query search (#179), the T-written RNA reverse-strand
fix (#180) and the rigor rule (#183, #184) merged.

## Decisions (owner, 2026-10-16)

- **Two modes.** Whole query (Myers, unchanged) and **Local** (Smith-Waterman). The user chooses.
- **Scientific rigor first.** Established methods and standard defaults. A widely used reference
  implementation settles a method; the original papers are cited for attribution only.
- **Exact, not heuristic.** Local mode computes optimal alignments. It does not use
  seed-and-extend.
- **Several hits per record, as before.** Local mode keeps the old search's behaviour: several
  non-overlapping hits per record and strand, best first, up to the result limit.
- **One exact engine.** Every local hit, the first included, comes from one Huang–Miller
  Waterman–Eggert engine, the method of EMBOSS `matcher`, compiled to WebAssembly.
  Waterman–Eggert is Smith-Waterman's standard multiple-hit extension, so Local mode is
  Smith-Waterman throughout. SSW and SIMD aren't used (*Rejected alternatives*). A vectorized
  engine may come later as a separate speed step, validated against this one.
- **Long searches** show progress and a Cancel button. Local mode has **no fixed time limit**.
  Whole-query mode keeps its 15 s guard.
- **Local only, static hosting.** No sequence or result leaves the browser. Everything ships as
  static files on Cloudflare Pages.
- **Third-party notices:** PR #138 merges first, and this feature adds its entries there.
- **Whole-query "identity" is renamed "query identity"**, with its formula in the help.
- **Codex agents implement;** Claude orchestrates and reviews.

## Goals

- For each record and strand, Local mode reproduces the alignments EMBOSS `matcher` 6.6.0 lists,
  in its order and under the stated scoring, then keeps the ones that don't overlap a hit already
  kept on that record and strand.
- The first alignment of each record and strand is an optimal Smith-Waterman alignment. Its score
  can be reproduced with EMBOSS `water` (*Validation 2*).
- Every number shown is defined and computed from the reported alignment path. The scoring scheme
  is named in the interface.
- Same input, same result on every browser, machine and worker-pool size.
- Usable speed for dozens of virus-sized records, measured (*Validation 9*), with progress and
  Cancel throughout.

## Non-goals

- **Statistical significance** (E-values, bit scores). Karlin–Altschul statistics depend on the
  scoring system and the search-space size. Gapped searches also need λ and K calibrated for the
  exact matrix and gap penalties, and no such calibration is established here for EDNAFULL with
  gap 10/0.5. Showing E-values would invent them, so raw scores are shown with their scoring
  scheme.
- Database search, or indexing very large genome sets (dozens of bacterial genomes).
- Changing whole-query or IUPAC (exact) mode, apart from the "query identity" rename.

## Anti-goals

- Any heuristic, truncation or fallback that silently misses or alters an alignment.
- Any request carrying sequence data, to any origin.
- Results that differ between browsers, machines or pool sizes.
- A metric whose definition isn't stated, or that shares an EMBOSS metric's name but not its
  definition.
- Silently changing the user's input: mapping unsupported characters, dropping residues, or
  normalizing case or T/U into identity.
- A total shown as exact when the search stopped before counting everything.

## What a local hit is

For a query *q* and a record *r*, after alignment gaps are removed from *r* as in the other modes,
each **stream** (a record and one strand) is searched on its own.

- **Strands:** the forward stream aligns *q* to *r*. The reverse stream (nucleotide sessions only)
  aligns *q* to the reverse complement of *r*, in the record's alphabet (`complementAlphabet`), and
  coordinates are mapped back to forward aligned space as in the other modes.
- **Enumeration:** each stream yields alignments in `matcher`'s order:
  - the first is an optimal Smith-Waterman local alignment with affine gaps (Gotoh);
  - each later alignment is the best one that shares **no aligned residue pair** with any earlier
    enumerated alignment, including alignments later hidden by the overlap filter. This is
    `matcher`'s exclusion (`MATCHERDIAG`, `matcher_Diff`);
  - ties between equal scores follow `matcher`'s own order (`matcher_Addnode`, `matcher_Findmax`),
    read from its source and pinned by fixtures;
  - only positive-scoring alignments are enumerated.
- **Overlap filter:** walking the enumeration in order, an alignment is **hidden** if its record
  span overlaps the span of a hit already kept in the same stream. The span runs from its first to
  its last record residue: `=`, `X` and `D` columns, in ungapped record coordinates. Hidden
  alignments are counted as "overlaps a better hit". Equal-score overlaps resolve by enumeration
  order, so the outcome is deterministic.
  - **Scope:** overlap is checked per stream. Forward and reverse hits may overlap each other, as in
    the other modes.
  - **What this is:** a score-ranked, greedily overlap-filtered `matcher` enumeration. It is not an
    optimal non-overlapping set; it doesn't maximize the total score.
- **Display filters** (min identity, min query coverage, both off by default) apply after the
  overlap filter. They hide hits and never change them.
- **Result limit and global order:** the result-limit control (default 100) keeps the first N hits
  overall under one total order, T:
  1. score, descending;
  2. record order;
  3. forward strand before reverse;
  4. record start;
  5. record end;
  6. query start.
- **Stopping each stream exactly:** each stream's enumeration never increases in score (rescoring
  only lowers candidates; the engine checks it). The search keeps the global top N passing hits
  under T and their N-th score b, which only rises as hits arrive. A stream stops when it is
  **exhausted** (no positive-scoring alignment remains) or when its last alignment scores strictly
  below the current b. Since b never exceeds the final cut-off s* (the N-th best passing score),
  every alignment scoring at least s* is enumerated in every stream; equal scores at s* are always
  included, so T can choose among them.
- **Schedule** (speed only; results are the same for any schedule that obeys the rule above):
  1. every stream computes its first alignment, which seeds the global top N, then releases its
     engine;
  2. streams that aren't exhausted are rerun from the start in descending order of their first
     score (ties by stream order), enumerating under the live b. A stream whose first score is
     already below b is skipped: its first alignment is then its only one scoring at least s*.

  One engine is alive per worker at a time. The first N hits under T among the enumerated
  passing hits are shown, so results don't depend on timing, worker count or completion order.
  Example: query `A`, record `TT`, reverse strand, limit 1. Both reverse hits score the same, so
  both are enumerated, and T keeps the hit at forward position 1.
- **Totals and counts:** when fewer than N passing hits exist, every stream was exhausted and
  totals are exact ("top 100 of 340"). Otherwise counts cover the alignments scoring at least the
  cut-off s*, which every stream enumerated, so they are exact and the same on every run: the
  screen says "Top 100 shown; lower-scoring alignments aren't counted" and Search details
  names the cut-off score. No total is shown as covering more than it does.
- **No positive score:** a stream with no positive-scoring alignment has no hits, and is counted
  separately from hidden hits.
- **Ties in the first alignment:** when several alignments share the optimal score, the engine
  reports the one `matcher` reports. The score matches `water`'s; the path, and so its metrics,
  may differ from the co-optimal path `water` picks. The help says so.

## Input alphabets

The accepted symbols are exactly the rows of the matrix in use (EMBOSS 6.6.0 files),
case-insensitive.

- **Nucleotide (EDNAFULL):** `A T G C S W R Y K M B V H D N U`.
- **Protein (EBLOSUM62):** `A R N D C Q E G H I L K M F P S T W Y V B Z X *`. J, O and U are not
  in EBLOSUM62.
- **Query:** whitespace is removed, as in the other modes. Any other character outside the
  alphabet, `-` included, makes Local mode refuse the query with a message naming the characters.
- **Records:** alignment gaps are removed as today. A record with residues outside the alphabet
  isn't searched in Local mode; it is listed in the log with those characters.
- **Original symbols are kept** for identity and display. Scoring uses matrix indices.

## Scoring (EMBOSS `water` defaults)

| | Matrix | Gap open | Gap extend |
|---|---|---|---|
| Nucleotide (DNA and RNA) | EDNAFULL (EMBOSS 6.6.0 data file) | 10 | 0.5 |
| Protein | EBLOSUM62 (EMBOSS 6.6.0 data file) | 10 | 0.5 |

- **Gap convention:** a gap of *n* positions costs open + (*n* − 1)·extend. EMBOSS documents it,
  `water` implements it, and `matcher` passes `Q = gapopen − gapextend` with gap(k) = Q + k·R
  (`matcher.c`), which is the same convention.
- **Integers:** `matcher` takes integer matrices and gaps (`matcher.acd`). Every matrix entry and
  penalty is therefore doubled (gap 20/1), which preserves score order and ties, and displayed
  scores are halved back into exact EMBOSS units. The engine uses 32-bit integers. The largest
  possible score, 2 × matrix maximum × query length, stays far below 2³¹, so there is no
  query-length cap from arithmetic. Long queries cost time, shown by progress.
- **Ambiguity codes (nucleotide):** the matrix scores them in **both** query and record, as `water`
  does. Identical ambiguity codes score −1 (N/N = −1). IUPAC mode differs (only the query expands),
  and the interface explains this.
- **T and U** score as equals (EDNAFULL's U row matches T's) but remain different symbols for
  identity.
- **Protein** scoring follows EBLOSUM62. There, N is asparagine (N/N = +6), and B, Z and X have
  their own rows.
- **Matrix files** are committed verbatim from EMBOSS 6.6.0, with their source recorded, never
  retyped. EDNAFULL's header credits Todd Lowe (1992). No claim is made that it is byte-identical to
  NCBI's NUC.4.4.

## Metrics shown per hit

Each metric is computed from the reported path and the original sequences. Names and denominators
follow `water`'s report (`ajalign.c`): Length is the denominator for Identity, Similarity and Gaps.

- **Score:** in EMBOSS units.
- **Length:** alignment columns, gaps included.
- **Identity:** columns whose two original symbols are the same letter, case-insensitively, over
  Length. T against U is not identical; N against N is. This is confirmed against `water`
  (*Validation 2*).
- **Similarity:** columns with a positive matrix score, over Length. Nucleotide N/N scores −1, so
  it is identical but not similar. Protein N/N scores +6, so it is both.
- **Gaps:** gap columns, over Length.
- **Query coverage:** aligned query residues, over the query length, with the query range
  ("query 41–180 of 300").
- **Record range and strand:** 1-based in the display.
- **Alignment text** for each hit, as in the companion spec.

## Computation

- **Engine:** Waterman–Eggert in Huang & Miller's linear-space form, the structure of EMBOSS
  `matcher` 6.6.0:
  - one full scoring pass over the stream keeps the best candidates (`matcher_BigPass`);
  - each alignment is located and traced back (`matcher_Locate`);
  - its residue pairs are excluded, and only the affected region is re-scored
    (`matcher_SmallPass`).
  - the candidate list is unbounded: `matcher` with an unlimited `-alternatives` list. Each
    stream's enumeration is then one well-defined sequence, independent of how many alignments
    are requested, and equals `matcher`'s whenever `matcher`'s own list never truncates. Memory
    grows with the number of candidate start points (about 36 000 for a 300-nt query against a
    30 kb record) and is measured (*Validation 9*);
  - used residue pairs are looked up in a hash set rather than `matcher`'s per-row lists. This
    changes the speed only: the profiled cost of the list walk was 7.6 billion steps in 40
    alignments.

  It is written in C and compiled once to WebAssembly with a pinned Emscripten. There is a single
  build, with no SIMD and no fallback variant.
- **Source and licence:** porting `matcher.c` is allowed. It is GPL-2.0-or-later, usable under
  GPL-3.0, which AGPL-3.0 permits combining with. The ported file keeps its GPL notice and its
  attribution to Ian Longden, Bill Pearson's LALIGN 2.0u4, and Huang & Miller. Before porting, the
  builder confirms that EMBOSS's GPL grant covers that LALIGN-derived code. If it doesn't, the
  engine is written from `matcher`'s documented behaviour and validated against it.
- **Path checks:** every alignment's path is checked before it can be shown:
  - its CIGAR consumes exactly the reported query and record residues (SAM length rules);
  - it rescores to the reported score.

  A failure ends the search with an error; it is never shown.
- **Not ported:** `matcher`'s fatal "number of alignments computed is too large" exit. The engine
  stops a stream normally when no positive alignment remains.
- **Where it runs:** in search workers, never on the page. Local mode has no inline fallback. If any
  stage fails (module load, worker start, dispatch, a worker error, a pool member failing), the
  search ends with a visible error and shows no partial results. Cancelled and failed searches are
  labelled differently from "no hits".
- **Progress and Cancel:** workers report streams finished out of the total, and the current
  stream's progress through the record. Cancel terminates and replaces the workers at once.
- **Parallelism** (builder's call): streams may be spread over a pool of workers sized from
  `navigator.hardwareConcurrency`. Results and their order are identical for any pool size and any
  completion order.
- **Loading and offline readiness:**
  - when the app starts, the page fetches the `.wasm` bytes once, compiles them and **keeps the
    bytes**;
  - Local mode becomes available ("Local search ready") only after that succeeds;
  - every worker, replacements after Cancel included, receives the bytes from the page, so no
    later network request is needed;
  - the module is instantiated from bytes, so loading doesn't depend on the server's MIME type for
    `.wasm`.

## Build, provenance and licensing

- The single `.wasm` artifact is **committed**, so the Cloudflare Pages build needs no Emscripten.
  It must stay under Pages' 25 MiB per-asset limit, which the build checks.
- A build script (with the AGPL header) and a provenance file record:
  - the source revision;
  - the Emscripten version;
  - the flags;
  - the artifact's SHA-256.
- **CI rebuilds** the artifact in a pinned Emscripten container and requires byte-identical output
  (builder's call). If the build proves non-deterministic, the PR documents why, and CI runs the
  full validation suite on both the rebuilt and the committed artifacts.
- **Third-party notices** (via #138): the `matcher`-derived engine's GPL notice and attribution,
  and the EMBOSS matrix attribution. Vendored C sources, matrices and `.wasm` files are outside the
  AGPL header rule.
- No Content-Security-Policy is sent today. If one is added, it must allow `'wasm-unsafe-eval'`.

## Browser requirements

WebAssembly 1.0, which every current browser supports. There's no SIMD requirement, nothing to
install, and no flags.

## Interface

Placement follows the companion spec's *Interface placement* section: every new control appears
only in the search context and minimizes, with Local's extra options collapsed by default.

- **Fuzzy mode switch:** **Whole query** | **Local**.
- **Local controls:**
  - **Min identity** and **Min query coverage**, off by default. They are display filters, not
    scientific defaults;
  - **Result limit**, as in the other modes;
  - the scoring scheme ("EDNAFULL, gap 10/0.5 (EMBOSS water defaults)");
  - notes on ambiguity codes (nucleotide), T/U, ties and the overlap filter;
  - during a long search, the alignment-style job monitor and minimizable pill, with progress and
    **Cancel** (companion spec, *Interface placement*).
- **Each hit shows** score, identity, similarity, gaps, coverage, query range, record range and
  strand, and can expand to show the alignment.
- **Counts under the results:**
  - streams with no positive alignment;
  - records skipped for unsupported characters;
  - hits hidden by the overlap filter;
  - hits hidden by display filters;
  - hits beyond the result limit.

  When a cut-off applies, counts cover alignments scoring at least it, and the screen names it
  (*What a local hit is*).
- **Naming:** Local **identity** (EMBOSS: identical columns over alignment length) and whole-query
  **query identity** (query length minus edits, over query length) have different names, and each
  label's help gives its formula.

## Validation (acceptance)

1. **First-hit optimality:** an independent textbook Gotoh Smith-Waterman in the test code, in
   EMBOSS units, with its own matrix parser. On seeded randomized cases and every fixture, each
   stream's first alignment must score the unconstrained optimum and be co-optimal.
2. **`water` 6.6.0 reference (first hits):**
   - `water` runs offline with explicit `-datafile`, `-gapopen 10 -gapextend 0.5` and
     `-aformat3 srspair`, and the outputs are committed with the exact processed inputs;
   - every committed alignment must rescore to its reported score under check 1;
   - where it doesn't, the fixture is quarantined and documented. Static reading of `embaln.c`
     predicts this for `AA`/`AC`, `A`/`A` and `AA`/`CC`, still to be confirmed by running `water`.
     The mathematically optimal result takes precedence.
3. **`matcher` 6.6.0 reference (the whole enumeration, before the overlap filter):**
   - `matcher` runs with the doubled matrix as `-datafile`, `-gapopen 20 -gapextend 1` and
     `-aformat3 srspair`;
   - for each fixture, a committed script raises `-alternatives` from 1 until `matcher` fails with
     its exhaustion error. It records the largest successful count and that output, and records the
     exhaustion separately;
   - our enumeration's first *k* alignments must equal `matcher`'s, in order: score (halved),
     record range, query range and aligned strings;
   - any difference is a defect unless check 1 shows `matcher` itself is wrong, in which case the
     fixture is quarantined.
4. **Every returned path, all hits:**
   - residues consumed;
   - sequence slices;
   - forward and reverse coordinate mapping;
   - Length and each metric's numerator and denominator, recomputed by test code;
   - the score rescored;
   - filter outcomes.

   Secondary hits are not compared with the unconstrained optimum; check 3 covers them.
5. **Selection and counts:** on small inputs the test enumerates every stream to exhaustion,
   computes the expected global top N under T and the counts over alignments scoring at least the
   cut-off, and compares with the bounded search at pool sizes 1 and 4 with shuffled timing. Cases
   include query `A` against record `TT` on the reverse strand with limit 1 (the forward-position-1
   hit wins), and ties at the cut-off.
6. **Overlap filter:**
   - query `AA` against record `AAA` enumerates scores 10, 10, 5, 5: record 1–2, record 2–3, then
     the two single-pair alignments left by pair exclusion;
     record 1–2 and record 3 are kept, and record 2–3 and the record-1 alignment are hidden
     (count 2);
   - further cases: tandem repeats, two separated copies of a domain, overlapping near-repeats, and
     forward and reverse hits on the same bases (both kept).
7. **Fixtures:**
   - **bundled examples:** SARS-CoV-2 GenBank; spike and ORF1ab proteins; cross-genome homology;
   - **symbols:** `ATAT`/`AUAU`; nucleotide `ACNAC`/`ACNAC`; protein N/N and B/Z/X; mixed case;
     mixed T/U RNA;
   - **substitutions and gaps:** zero-score and unequal positive protein substitutions; single and
     extended indels;
   - **edges:** unaligned query flanks; matrix-boundary maxima; no positive score; a long query
     (no cap);
   - **record gaps:** reverse hits through leading, internal and trailing record gaps;
   - **input rejection:** unsupported characters in the query and in records.
8. **Pool parity:** pool sizes 1 and the default, with shuffled completion order, return identical
   results on every fixture.
9. **Performance,** measured:
   - **workload:** 50 synthetic 30 kb records, both strands; a 300-nt and a 1 000-nt query;
   - **recording:** timings at pool sizes 1 and the default, recorded in the PR;
   - **target:** the 300-nt query in under 5 s at the default pool size on a mid-range laptop. If
     it's missed, the PR reports it and the owner decides on the vectorized follow-up;
   - **slow PC:** the owner checks that progress updates steadily and Cancel stops at once.
10. **Workers:** progress reporting, cancellation, replacement, stale responses, a pool member
    failing, completion order, and each failure stage in *Computation*.
11. **Local-only and offline:**
    - an e2e test allows only an enumerated list of the app's own static assets and fails on any
      other request, of any method and to any origin, through page load, a search, a failure, a
      cancellation and a replacement;
    - another disconnects the network after "Local search ready", then searches, cancels and
      searches again.

## Rejected alternatives

- **SSW (SIMD) as the engine.** It finds only the best alignment per stream; its second score is
  heuristic. Several hits would need either repeated masked runs, which isn't an established method
  and can't be validated against `matcher`, or changes inside its striped kernel. Its signed 16-bit
  arithmetic also caps query length (3 276 bases, 1 489 residues), and its banded traceback can
  fail.
- **SSW for the first hit plus Huang–Miller for the rest.** Huang–Miller's full pass already finds
  the first hit, so SSW duplicates work. Its tie choice can differ from `matcher`'s, which changes
  every later alignment. Kept as a possible later speed path for a "best hit only" option,
  validated against this engine.
- **Best alignment per record only** (an earlier draft). It drops the several hits per record the
  owner wants kept.
- **Seed-and-extend (BLAST-style).** Heuristic.
- **Remote BLAST or EBI services.** They send sequences off the machine.
- **The pre-3.4.0 seeded Smith-Waterman.** Heuristic, and filtered after the result cap.
- **Parasail** (Daily 2016). No WebAssembly port found, and not verified.

## Left to the builder

- Emscripten flags, within *Build*.
- How the engine is wrapped and called from workers, and the protocol shape for local hits, keeping
  one canonical type home (`src/domain/bio/types.ts`, `src/workers/protocol.ts`).
- Layout details within existing UI conventions and the companion spec.

## References

- Smith & Waterman (1981), *J Mol Biol* 147:195–197, doi:10.1016/0022-2836(81)90087-5.
- Gotoh (1982), *J Mol Biol* 162:705–708, doi:10.1016/0022-2836(82)90398-9.
- Waterman & Eggert (1987), *J Mol Biol* 197:723–728, doi:10.1016/0022-2836(87)90478-5.
- Huang & Miller (1991), *Adv Appl Math* 12:337–357, doi:10.1016/0196-8858(91)90017-D. The
  `matcher.c` header gives pages 373–381; Crossref gives 337–357.
- Karlin & Altschul (1990), *PNAS* 87:2264–2268, doi:10.1073/pnas.87.6.2264.
- EMBOSS 6.6.0:
  - `emboss/matcher.c` and `acd/matcher.acd` (GPL-2.0-or-later);
  - `emboss/water.c` and `acd/water.acd`;
  - `nucleus/embaln.c`;
  - `ajax/core/ajalign.c` and `ajax/core/ajmatrices.c`;
  - data files EDNAFULL and EBLOSUM62.
- SSW (Zhao et al. 2013, *PLoS ONE* 8:e82138), considered and rejected.
- Cloudflare Pages limits (25 MiB per asset).
