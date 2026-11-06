---
title: CDS translation exceptions under NCBI code-break rules
status: proposed
date: 2026-11-06
areas: [translation, genbank, domain]
prs: []
issues: [253]
superseded_by: null
summary: Apply record-coordinate code breaks to conceptual CDS translation while preserving imported proteins and diagnosing exceptions that cannot be verified.
---

# CDS translation exceptions — PR 2

## Scope and dependency

This is the second PR for [#253](https://github.com/JoaoVictorDaijo/dunceious/issues/253).
It extends PR 1's **stored-protein provenance model**, specified in
[Translation stored protein provenance](2026-11-06-translation-stored-protein-provenance.md)
on `fix/cds-translation-invalidation` (review draft read 2026-11-06). References to that
model are by name because its review is ongoing. This checkout does not yet contain its
proposed `translation.ts`; implement PR 2 after PR 1, reconciling names against the merged model.
This document does not change source code or close #253. PR 3 owns codon marks and hover design.

Binding owner decisions override drafts: one stored protein, imported `/translation` read-only,
recompute on biological edits, preserve and lightly fill curated differences, omit computed
proteins with internal stops on export, no undo work, **no project-format bump or migration**.
PR 1's draft currently describes a format migration; PR 2 must not adopt that conflicting text.
The shared `initiatorResidue` follows each genetic code's Starts row; stored residue zero still
wins for display. The #288 assumed-table display remains separate from verified computation:
invalid table → unverified table-1 view, invariant codons solid and code-dependent codons dashed,
tooltip/label names the assumption, count unset or labelled assumed. Never export that view as
computed `/translation`. Merge through `integration/murilo-review`, not directly to develop.

## Evidence and authority

Follow [standards authority order](../standards/README.md#order-of-authority): standard text,
recorded rule, documented reference practice, then owner decision when unresolved.
Relevant rules are [TRANS-4](../standards/translation.md#trans-4-transl_except),
[TRANS-2](../standards/translation.md#trans-2-codon_start),
[TRANS-3](../standards/translation.md#trans-3-alternative-initiation-codons),
[ALPHA-1](../standards/alphabets-and-coordinates.md#alpha-1-nucleotide-ambiguity-codes-t-and-u),
[ALPHA-2](../standards/alphabets-and-coordinates.md#alpha-2-amino-acid-codes), and
[LOC-1](../standards/locations.md#loc-1-join-concatenates-in-written-order) /
[LOC-3](../standards/locations.md#loc-3-complement-whole-feature-or-per-interval).

Sources inspected, with evidence levels:

- **Contract:** [INSDC Feature Table 11.4, April 2026](https://www.insdc.org/submitting-standards/feature-table/),
  §7.3.1 `/transl_except`, §3.4 locations and §7.4.3 amino-acid vocabulary. Exception positions
  refer to entry bases. The qualifier describes a single codon; the vocabulary includes
  Sec/U, Pyl/O and TERM. OTHER represents an unusual amino acid, with an explanatory note.
  The text explicitly permits terminal T or TA completed to TAA by mRNA polyadenylation.
  An accession-qualified example establishes that remote syntax is valid INSDC.
- **Documented, not executed:** NCBI C++ Toolkit `912b751`,
  [sequence.cpp, CSeqTranslator::Translate code-break loop](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objmgr/util/sequence.cpp#L4209).
  With breaks present it retains stops during ordinary translation, obtains `LocationOffset`
  from CDS start, subtracts frame, divides by three, substitutes Ncbieaa, and can append TERM
  at protein length. Substitution follows initiator conversion. `include_stop=false` truncates
  at the first stop; Dunceious instead retains internal stops under the binding owner rule.
- **Documented, not executed:** same snapshot,
  [readfeat.cpp](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/readers/readfeat.cpp#L1267)
  retains `transl_except` as GBQual for cleanup. Its amino-acid lookup contains OTHER→X,
  Sec→U, Pyl→O and TERM→`*`; this is not proof that every alias is accepted by code-break parsing.
- **Documented, not executed:** same snapshot,
  [newcleanup.cpp](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/cleanup/newcleanupp.cpp#L6582)
  repairs interval strand on same-sequence minus CDSs, sorts breaks and removes equal
  location/amino-acid duplicates. The follow-up read-only fetch of
  [cleanup.cpp, ParseCodeBreak/ParseCodeBreaks](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/cleanup/cleanup.cpp#L4520)
  establishes that cleanup processes each qualifier, delegates locations to `ReadLocFromText`,
  rejects simple intervals longer than three bases and simple points/intervals outside the CDS,
  and assigns strand from the feature. It starts the residue as X and delegates recognized
  alphabetic amino-acid text to `x_ValidAminoAcid`. The latter helper and location reader were
  not traced here; permissive fallback is not an app policy. Multi-interval text is wrapped in
  join before location parsing; acceptance of nested joins remains unexecuted.
- **Documented, not executed:** same snapshot,
  [ValidErrItem.cpp](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objects/valerr/ValidErrItem.cpp#L1367)
  defines `TranslExcept` (unparsed), `TranslExceptPhase` (off-codon),
  `DuplicateTranslExcept` (different amino acids at one location), `CDSrange` (outside CDS),
  and `UnnecessaryTranslExcept` (same amino acid). Message definitions establish neither
  severity nor the validator's complete trigger conditions.
- Main prior research: `tools-transl-except/scratch/report.md` in the local duplex job archive,
  inspected with its adjacent four NCBI files. It records Biopython **1.88** ignoring exceptions
  and copying their text when slicing, EMBOSS qualifier validation without established
  application semantics, and JBrowse/Artemis location shortcuts that cannot be used as oracles
  for joined CDSs. No reference-tool executable was run for this spec.

## Contract and model extension

The subject is the pure conceptual CDS translator and the format/edit boundaries feeding it.
It receives local sequence, biological CDS geometry, phase, table and ordered exception values;
it produces an exception-adjusted protein or a reason it cannot verify one. It never mutates
an imported protein, guesses a remote sequence, or owns PR 3's drawing layout.

Extend PR 1 precisely as follows:

| PR 1 type/function/state | PR 2 extension |
|---|---|
| `BioFeature` in `domain/bio/types.ts` | Add one canonical ordered `translationExceptions?: string[]` containing logical qualifier values, including malformed/unsupported ones. No duplicate `metadata.transl_except` store. |
| `ConceptualTranslation` | Keep `ok` fields `residues`, `possible`, `internalStops`, `threePrimeIndeterminate`; add per-result exception diagnostics and applied-entry/codon associations. Extend `unavailable` reasons with invalid/unresolved/conflicting exception distinctions (policy below remains open). Retain `invalid-code` and `empty`. |
| `conceptualTranslation(feature, record)` | Replace the blanket `unsupported-exception` return with parsing, coordinate resolution and NCBI substitution after ordinary translation/initiator handling, before final stop removal and stop/count analysis. |
| `initiatorResidue(codon, translTable)` | Signature and context-free Starts-row meaning unchanged. An applied first-codon exception overrides its result inside `conceptualTranslation`. |
| `compareTranslation(stored, conceptual)` | Signature unchanged; read exception-adjusted `possible`/residues. Do not report an explained recoding as a mismatch. Preserve PR 1's stored X/ambiguity comparison convention. |
| `storedTranslation(feature)` / `isCds(feature)` | No behavior change: one `metadata.translation`, CDS including SO:0000316. |
| `saveEditedFeature` | Compare ordered exception values as biological inputs; recompute on their add/change/remove and every PR 1 biological edit. Clear derived diagnostics/mappings before reevaluation. |
| `metadata._translationSource` | Keep imported/computed/removed meanings; success stores adjusted residues as computed, failure removes the old protein after an edit. |
| PR 1 `_translationCheck` and import check | Invalidate with all biological inputs; compare against adjusted conceptual translation on GenBank import and FASTA+GFF3 attachment. Carry exception diagnostics separately from mismatch count. |

New pure domain helpers should parse one value and resolve all values against the same CDS
base map used for extraction; names are implementation choices. Domain types stay in
`types.ts`, no React/browser imports. Core GenBank parser/serializer own qualifier I/O;
workers pass canonical fields through the existing protocol; app owns previews and warnings.
Do not widen all metadata to arrays to solve this one repeated qualifier.

`translationExceptions` is absent/empty when there are no entries; `['']` is an invalid empty
qualifier, not absence. Preserve input order, multiplicity, spelling and logical value text
(after flat-file continuation unfolding); byte-identical whitespace wrapping is not promised.
Parser, feature cloning, qualifier editor rows, project serialization and selection copies
must all preserve the array. Remove the old scalar key at the parse boundary so a repeated
entry cannot be silently overwritten or applied twice. Reconcile this field with #298's
qualifier representation before implementation if that branch already supplies a lossless
canonical repeated-value store; do not create two owners. No migration is added for old projects.

## Resolution and application

### Positions and accepted biological mappings

Use record coordinates, **1-based inclusive in the qualifier**, converted once to internal
0-based bases. A CDS base map enumerates record identity, base position and orientation in
biological extraction order, through joins, circular-origin crossings, nested complements and
mixed-strand segments; alignment columns are never exception coordinates. Do not subtract
feature endpoints, sort intervals numerically, or flatten a remote accession to the local record.
Skip exactly `codon_start - 1` bases at the biological 5′ end. Invalid phase/geometry follows
the upstream validation contract, never clamping into a valid codon.

For an ordinary full-codon exception, the resolved bases must be precisely the three consecutive
coding offsets `3k, 3k+1, 3k+2`, in the CDS's biological orientation. `k` is a zero-based codon
index; user warnings show `k+1`. A mapping that crosses an intron can still denote one codon;
a contiguous genomic interval containing intronic bases cannot. Discontinuous exception syntax
and repeated CDS base occurrences require the decisions below. An off-frame interval must not
be rounded down merely because NCBI's low-level substitution loop divides its first offset.

Support a local base point/range and explicit `complement(...)`. Parse accession syntax without
fetching; unresolved references yield a diagnostic, not local coordinates. Use the location
model delivered by the location PRs. An `order()` CDS does not assert a contiguous coding
sequence and remains unavailable under that model. A between-base site is not a codon base.
Unknown amino-acid names are outside the standard vocabulary; tolerance and refusal policy remain open below, and any fallback must be reported.

Use the INSDC restricted abbreviations (including B/Z/J/X ambiguity names), Sec→U, Pyl→O,
TERM→`*`, OTHER→X. Preserve `/note` for OTHER and terminal polyadenylation; missing explanatory
notes produce conformance diagnostics rather than invented text. Alias/case tolerance is open.
An exception is an annotation assertion, not a test that the DNA already encodes that residue;
ordinary amino-acid substitutions and stop readthrough are allowed. Redundancy may be reported
but must not change the derived protein.

### Partial terminal codons

A terminal point or two-base range naming the entire remaining coding suffix T or TA (RNA U
or UA) with TERM establishes a TAA stop completed by added A residues. This is a terminal
code break, **not** an extra amino acid or a missing-codon approximation. No A is inserted
into record sequence, and the CDS endpoint is not extended. It also works on the complementary
strand: validate T/TA in coding orientation, not against the forward record letters.

For example, CDS `1231..1235`, coding `ATGTA`, `(pos:1234..1235,aa:TERM)` gives `M` after terminal
stop removal. `complement(1231..1235)` over forward `TACAT` uses
`(pos:complement(1231..1232),aa:TERM)` for the same result.
Apply the explicit TERM before the ordinary leftover-base rule can discard the suffix. Without
it PR 1's N-padding rule remains unchanged. Non-TERM short exceptions, arbitrary short suffixes
and contradictory 3′-partial markers are open decisions; do not infer completion from length alone.

### Translation order and stops

1. Validate table and extract/map CDS. Retain PR 1's unavailable invalid-code/empty behavior.
2. Parse and resolve every exception; retain all diagnostics, including entries after a stop.
3. Produce ordinary codon states using PR 1's IUPAC/U, initiation, leftover and context-dependent
   terminal-table rules, retaining the terminal position until substitutions finish.
4. Apply resolved code breaks to those positions; terminal TERM may supply the suffix stop
   absent from the ordinary protein. NCBI substitution occurs after initiation, so `aa:Val`
   on the first GTG of a complete table-11 CDS yields V, not M. Never run initiation again.
5. An explicit residue replaces `possible` for comparison: Sec→`U`, Pyl→`O`, TERM→`*`,
   Asx→`DN`, Glx→`EQ`, Xle→`IL`. OTHER/Xaa means an unspecified amino acid. Its comparison set is the supported amino-acid alphabet (excluding stop), so it does not assert a definite mismatch with a known amino acid; stored X retains PR 1's unknown comparison convention. This comparison-set extension is a proposed application policy; see the Open decisions row below.
6. Determine terminal removal and internal stops from the adjusted positions. A full terminal
   stop changed to Sec stays U. An internal TGA changed to Sec ceases being an internal stop.
   Internal TERM remains `*` and does not truncate later residues. Remove one final explicit
   TERM on a complete CDS. Partial-end contradictions remain open below.

For accepted full-codon and supported terminal-TERM cases, `threePrimeIndeterminate` reflects
the adjusted final state, not an overwritten ambiguous DNA state. Translation positions exclude
the removed terminal stop; each X, U, O or internal `*` contributes one. Internal-stop count is
the number of retained `*` positions, not the number of stop-like DNA triplets. Never describe
an unavailable result as a zero-length verified protein.

## Stored protein, display, edits and diagnostics

An unedited imported protein remains stored and displayed. Compare it with the exception-adjusted
conceptual result: a valid Sec that agrees with stored U gets no mismatch or lighter-fill flag
merely because its DNA triplet is TGA. A curated disagreement still receives the lighter fill.
Unavailable computation means “cannot verify”, not “matches” or “differs at zero positions”.
Do not conflate unknown-code styling with a curated mismatch. Counts and early-stop status use
the adjusted computed result; an unapplied exception must not leave a definite ordinary-DNA
stop/count claim. PR 3 implements marks; PR 2 supplies their scientific state and reasons.

All PR 1 recompute triggers remain: start/end, segments/order, strand, phase/codon_start, table,
partial ends, exception values, CDS type transitions. Record sequence changes also invalidate
maps and computed checks. After a biological edit, successful adjusted translation without
internal stops replaces `metadata.translation` and sets source computed; internal stops or an
unavailable result remove it, source removed, with a named warning. Removing the last exception
returns to ordinary translation. Unrelated label/colour/note edits preserve imported/computed
provenance; editing a note alone does not move a break.

**Edit coordinate maintenance is not settled by the standard.** Absolute qualifier positions
cannot be assumed to move with a dragged CDS. Options and recommendation are below; until
chosen, implementation of geometry edits with exceptions is not ready. Whichever policy is
approved must reevaluate phase, orientation and membership even when a location remains in bounds,
show the protein removal/recompute outcome before Save, and preserve raw evidence for repair.
No new edit undo is included.

Import uses #286/#298's diagnostics infrastructure, with feature identity, qualifier occurrence,
raw value, reason and position/codon where known. Unparsed, off-frame, outside-CDS, remote/unresolved,
conflicting and unsupported entries are distinct. Imported `/translation` stays intact on warning.
Exception diagnostics cannot be suppressed by `/exception`; PR 1's broad `/exception` suppression
applies only to its stored-protein mismatch warning. Successful exceptions participate in the
ordinary once-per-file differing-CDS count, at both GenBank and attached GFF3 entry points.
Severity and file-refusal scope for malformed exception *values* remain open; owner rules already
refuse broken feature geometry and missing required qualifiers. A valid remote qualifier must
not be called invalid syntax just because the local translator cannot resolve it.

## GenBank and selection export

Whole-record export emits each original logical `/transl_except` value as its own qualifier,
unquoted in standard structured form, preserving order and multiplicity; normal line wrapping
may change. Do not synthesize them from protein differences. Do not drop qualifiers because a
protein was removed. `/translation` follows PR 1: stored curated protein if untouched, recomputed
adjusted protein after a successful biological edit, omitted with warning after failure/internal
stop. Diagnostics must reach the export report/preview, not only a hidden console.

Selection export changes the coordinate system. For a fully retained valid local exception,
map each base through the same selection transform as the CDS, serialize the transformed location
including complement, then recompute against the exported sequence before claiming a computed
protein. An input interval `s..e` selected without reversal maps base `p` to `p-s+1`;
reversal of a selection of length `L` maps that result to `L-(p-s+1)+1` and flips orientation.
Splitting/wrapping follows the selection's actual ordered base map, not this linear shortcut.
Never copy absolute text unchanged into a smaller record (Biopython 1.88's known limitation).
If the selection loses any exception base or changes its codon membership, it is no longer a
verified applicable break. Treatment of partially retained, malformed or unresolved values is
an owner choice below; never silently export them as if successfully rebased. Whole-record
round-trip must retain those values even when they cannot be computed.

## Open decisions

These are proposals, not defaults. Resolve before implementing the affected path; additional
reference execution can settle technical questions but cannot approve a product policy.

| Question/options | Reference behavior and limit | Recommendation (unconfirmed) |
|---|---|---|
| CDS move/resize/strand/phase: leave absolute locations and revalidate; shift breaks with feature; or remove affected breaks with warning? | INSDC defines entry coordinates, not editor behavior. NCBI inspected files do not define interactive edits. Biopython 1.88 copies text on slicing; Artemis 18.2.0 endpoint arithmetic ignores introns. | Keep absolute evidence and revalidate every break; never infer a biological move from endpoint delta. Let the user explicitly edit break positions. |
| OTHER/Xaa comparison: unknown compatible with all amino acids, or compare literal X? | INSDC defines an unspecified amino acid and NCBI emits X; inspected translator does not implement stored-vs-computed comparison. Biopython does not apply the break. | Use all supported amino acids excluding stop as the comparison set, preserving PR 1's uncertainty semantics. |
| Conflict at one codon: first wins, last wins, or unavailable? Identical duplicates? | NCBI `912b751` translator is last-wins in input object order; cleanup sorts/deduplicates identical objects; validator names conflicting residues. JBrowse snapshot `c8142241` is last-wins. No standard conflict precedence. | Identical assertions apply once while retaining both raw entries; conflicting assertions make computation unavailable. |
| Some invalid breaks: apply valid subset, ignore all breaks, or unavailable? | NCBI substitution is permissive; off-codon/range messages exist separately. Biopython 1.88 ignores all entries. Runtime validator severity not verified. | No verified whole-CDS protein when any entry cannot be applied; keep stored evidence and explicit diagnostic. |
| Point/short range inside a complete codon, non-TERM short tail, or non-T/TA short TERM? | INSDC explicitly documents short terminal T/TA→TAA. NCBI translator divides offsets and appends only TERM at protein length; it is not an input validator. EMBOSS application unknown. | Accept only full triplets plus documented terminal T/TA TERM; other cases unavailable pending validator probes. |
| TERM at a marked 3′-partial end; or ordinary final TERM with partial flag? | INSDC describes completion but does not settle contradictory partial annotation. NCBI substitution and include_stop behavior do not by themselves establish validity. | Diagnose contradictory end and withhold verified computation until corrected; do not silently remove a partial marker. |
| Explicit wrong strand vs omitted complement on minus CDS? | NCBI ParseCodeBreak assigns feature strand to the parsed location (or clears strand if absent); later cleanup also repairs same-ID minus intervals. EMBOSS accepts complements. | Support explicit matching complement; probe omission and contradictory strand separately before adopting NCBI cleanup tolerance. |
| Split-codon `join` exception, same-record accession aliases, remote loaded records, or a CDS visiting a base twice? | INSDC permits remote locations. NCBI translator consumes normalized locations through scope; cleanup delegates to `ReadLocFromText` and wraps multi-interval text in join; final parser acceptance unexecuted. EMBOSS inspected validator rejects joins/remotes, JBrowse keeps only first join range. | Resolve unique local mappings, including split codons if parser conformance is confirmed; unresolved/ambiguous maps unavailable. Never fetch. |
| One-letter names, full names, aliases, case/whitespace or comma-packed entries? | INSDC legal abbreviations are narrower than NCBI readfeat's general amino-acid lookup. NCBI GFF guide documents comma-separated entries, but cleanup parser delegates the residue to `x_ValidAminoAcid`, whose alias mapping was not traced. | Canonical INSDC abbreviations for authoring; preserve and probe tolerant import spellings before acceptance. Repeated qualifiers must always survive. |
| Invalid value warns vs refuses file; missing explanatory note? | #286/#298 distinguish broken meaning from conformance, and require refusal for missing required qualifiers. NCBI message definitions do not supply executed severity. | Warn for unusable exception values, keep imported protein, mark verification unavailable; warn for absent explanatory note without inventing it. Confirm classification with owner/#298. |
| Selection loses a break or cannot rebase its text: omit qualifier and warn; omit CDS; or block affected GenBank export? | Biopython 1.88 copies stale text; NCBI edit/extraction behavior unknown. INSDC does not set application extraction policy. | Block affected CDS export with an actionable report rather than write stale coordinates; offer whole-record export. Owner must choose. |

## Independent-oracle validation

All coordinates below are INSDC entry coordinates; spaces separate codons, not sequence bases.
Unless stated otherwise: table 1, codon_start 1, complete ends, no stored protein. `→` gives
conceptual residues after removing the terminal stop, internal `*` retained. Expected strings
are literal independent hand derivations, **not executions or Dunceious outputs**.

Oracle keys: **H** = hand application of INSDC 11.4 location/qualifier text and gc.prt 4.6
literal codons; **N** = hand trace of NCBI C++ Toolkit `912b751` substitution loop with
`include_stop=true`, then PR 1's owner-approved terminal-only removal. **D** = named NCBI
validator message definitions at that snapshot (diagnostic category only, not severity).
Conditional rows are acceptance gaps awaiting the decision above, not approved output policy.

| Input case | Expected output / independent mapping | Oracle |
|---|---|---|
| `1..12`, `ATG TGA CCC TAA`, `pos:4..6,aa:Sec` | `MUP`; coding offsets 3,4,5 → codon index 1; no internal stop | H + N; Sec/U in INSDC |
| Same, `aa:Pyl` / `aa:OTHER` | `MOP` / `MXP`; preserve note describing unusual residue | H + N; OTHER/X lookup source-backed, not parser-executed |
| `1..15`, `ATG TGA TAG CCC TAA`, breaks `4..6 Sec`, `7..9 Pyl` | `MUOP`; both entries applied, not just last qualifier | H + N |
| `1..9`, `ATG AAA TGA`, final `7..9 Sec` | `MKU`; terminal DNA stop is no longer removed | N |
| `1..12`, `ATG AAA CCC TAA`, `4..6 TERM` | `M*P`; internalStops names codon 2; edited export omits translation and warns | H + N for substitution; owner rule for export |
| Table 11, `1..9`, `GTG AAA TAA`, `1..3 Val` | `VK`; without break `MK`; display still prefers a stored first residue | N after initiation; gc.prt 4.6 Starts row |
| `complement(1..12)`, forward `TTA GGG TCA CAT`, `complement(7..9) Sec` | biological bases 12,11,10 / 9,8,7 / 6,5,4 / 3,2,1; coding `ATG TGA CCC TAA` → `MUP` | H complement derivation + N |
| `<1..9`, table 11, `GTG TGA TAA`, `4..6 Sec` | `VU`; partial start prevents Met, not Sec | H + N initiation prerequisite |
| `complement(1..>9)`, table 11, forward `TTA TCA CAC`, `complement(4..6) Sec` | `VU`; biological 5′ end is partial | H + N |
| `<1..10`, `A ATG TGA TAA`, codon_start 2, `5..7 Sec` | after skipping base 1: `ATG TGA TAA` → `MU`; base 5 is coding offset 3 | H + N frame subtraction |
| `101..112`, coding `ATG TGA CCC TAA`, `104..106 Sec` | `MUP`; nonzero entry start does not change codon index 1 | H + N |
| `join(1..4,10..14)`, positions 1..4=`ATGT`, 10..14=`GATAA`; `pos:join(4,10..11),aa:Sec` | coding bases [1,2,3,4,10,11,12,13,14] → `ATG TGA TAA`; `MU` **if split-location syntax accepted**; contiguous `4..11` includes intron and is invalid | H; raw parser acceptance unverified |
| `join(7..9,1..6)`, record `TGA TAA ATG`, `1..3 Sec` | bases [7,8,9,1,2,3,4,5,6] → `MU`; origin/written order retained | H + N |
| `1231..1235`, `ATGTA`, `1234..1235 TERM` | `M`; suffix offsets 3,4 completes TAA; zero additional aa | H explicit INSDC example pattern + N terminal append |
| `1..4`, `ATGT`, `4 TERM` | `M`; boundary last record base allowed | H + N |
| `complement(1..5)`, forward `TACAT`, `complement(1..2) TERM` | coding `ATGTA`, suffix bases 2,1 → `M` | H + N |
| `1..12`, RNA `AUG UGA CCC UAA`, `4..6 Sec` | `MUP`; no conversion of the stored record to DNA | H ALPHA-1 + N substitution |
| `1..9`, `ATG NNN TAA`, `4..6 Sec` | `MU`; adjusted possible set `U`, not every residue from NNN | N, annotation overrides codon |
| Same without break / `ATG GCN TAA` without break | `MX` / `MA`; ordinary ambiguity handling preserved | gc.prt 4.6 hand expansion; PR 1 baseline |
| `ATG TGA TAA`, Sec at `5..7` or `3..5` | off-codon diagnostic; no verified `MU` by rounding; final refusal policy open | H offsets + D TranslExceptPhase |
| Same, `pos:0..2`, `10..12`, `4..5 Sec`, or `pos:4^5` | respectively invalid bound, outside record/CDS, short non-TERM, between-base site; no verified substitution | H location/single-codon constraints; D CDSrange where applicable |
| Empty record/CDS; no qualifier / empty qualifier value | unavailable empty / invalid-value diagnostic; no invented codon zero or verified empty protein | PR 1 empty contract + H: no bases to locate |
| Two identical `4..6 Sec`; then Sec/Pyl at same codon | identical case `MU` if deduplication approved; conflicting case last-wins `MO` in raw NCBI object iteration, recommended unavailable in app | N; cleanup equality; D DuplicateTranslExcept; decision pending |
| `pos:X22222:4..6,aa:Sec`, accession unavailable | retain raw qualifier; unresolved, no local substitution; severity policy open | H remote syntax; local-only owner constraint |
| Malformed `(pos:4..6,aa:)`, unknown `aa:Banana` | recommended unparsed/invalid-amino-acid diagnostic; app fallback decision pending, never silently assert a known residue | H controlled vocabulary; NCBI cleanup initializes X and may retain it for absent aa; unknown-name helper untraced |
| `1..>9`, `ATG TGA TGG`, `4..6 Sec` | `MUW`; 3′ partial does not block a full internal exception | H + N |
| Terminal `ATGTA` marked 3′ partial with TERM; non-T suffix `ATGCC` with TERM | retained evidence and explicit unresolved decision; do not claim verified M | Standard's TAA completion precondition; no executed validator oracle |
| Stored `MUP` / `MKP`, coding `ATG TGA CCC TAA` with Sec | first has no mismatch; second differs at codon 2 and retains stored K with lighter fill | H adjusted literal `MUP`; PR 1 comparison contract |
| Select bases `101..112` from entry with CDS there and break `104..106 Sec` | exported CDS `1..12`, qualifier `4..6 Sec`, reimport computes `MUP` | H subtraction `p-100`; full round-trip must use independent literal protein |
| Reverse that 12-base selection | exported CDS `complement(1..12)`, qualifier `complement(7..9) Sec`; computes `MUP` | H `13-(p-100)` and complement derivation |
| Edit `<1..10` frame from 2 to 1, retaining `5..7 Sec`; remove Sec from `ATG TGA TAA` | first becomes off-codon; second becomes internal-stop `M*` after terminal removal, edited protein omitted | H coding offsets; N substitution/owner export rule |

Before implementation acceptance, obtain reproducible NCBI parser/validator fixtures (record
exact table2asn/asn2gb release or full Toolkit commit and options). Probe partial TERM, complement,
split codons, aliases, duplicate conflicts and out-of-frame positions. Record actual diagnostics
and product output separately: validator error is not proof that the permissive translator
refused it. Use `include_stop=true` or equivalent to expose internal stops; explain the intentional
owner-approved difference from NCBI's truncating mode. Biopython 1.88 and EMBOSS transeq alone
cannot validate exception application. Runtime behavior, parser tolerance and diagnostic severity
remain unverified here; hand derivations above are the independent evidence currently available.

## Verification and coverage decision

The translator boundary owns biological mapping and substitution; parser/editor/project/export
boundaries own lossless values and invalidation. PR 3 owns drawing/hover shape, the location
PRs own general location grammar, and #288 owns assumed-table visual styling; no new rows are
assigned here for their unrelated guarantees. Preserved sibling enforcement points in this task
are GenBank import, GFF3 attachment, edit preview/save, whole-record export and selection export.

Inspected protection below is from this checkout, not an executed run and not proof that PR 1's
planned tests exist. Reinspect the merged PR 1 suite before implementation and update this table
with actual reused/added checks and executed results at handoff.

| Guarantee/source | Existing protection | Decision |
|---|---|---|
| Correct base order, phase, strand and mapping | `translationHelpers.test.ts`: joined extraction asserts `[0,1,2,6,7,8]`; reverse extraction asserts reversed indices. `featureManager.test.ts`: phase deletion asserts coding `AATGAAACCC` through GenBank round-trip. | Reuse extraction regressions; add conceptual translation checks for literal adjusted proteins and split/nonzero-start maps. Detect endpoint subtraction and phase rounding. |
| All repeated values survive parser, editor, project and writer | `qualifierParser.test.ts` checks ordinary multiline translation; `featureParser.test.ts` still asserts duplicate protein stores. No exception multiplicity protection found. | Add lossless parser→editor/project→GenBank round-trip at cheapest capable boundaries; distinguish two different breaks from last-value-only overwrite. Do not retain obsolete duplicate-protein expectation after PR 1. |
| Exceptions override initiation/stops/ambiguity; invalid mappings do not assert proteins | No PR 1 `translation.test.ts` present here; no exception application test found. | Add pure-domain oracle fixtures above, including allowed and invalid positions, partial ends, U/IUPAC and empty cases. Conditional cases wait for decisions. |
| Recompute/remove on biological edits; preserve unrelated edits and imported protein | `featureManager.test.ts` asserts phase-cache invalidation on start/end/strand/segments and unrelated rename preserves phase; no exception/protein protection found. | Strengthen save-boundary checks for adjusted success and removal on invalidation/internal stops; preserve raw entries and unrelated-edit provenance. Preview must agree with save. |
| Stored comparison, early stops and count use adjusted result, not raw DNA | No exception-specific protection found. PR 1 comparison/count assertions are planned only. | Reuse merged PR 1 checks; add Sec removing a stop, TERM adding one and genuine curated mismatch, through shared domain result and consuming app boundary. Reject false lighter-fill/mismatch and raw-TGA early stop. |
| Both import routes diagnose without overwriting curated proteins | `bioResponse.test.ts` inspected by search; no transl_except assertions found. | Add entry-point checks for GenBank and FASTA+GFF3 attachment. Keep parser/diagnostic wiring real; invalid exceptions must not be counted as verified mismatches. |
| Whole-record and selection export preserve qualifiers and cannot claim stale computed protein | `genbankContract.test.ts` asserts phase and translation wrapping; no exception coordinate-rebase protection found. | Add export→reimport checks with literal transformed locations and adjusted proteins, plus denied partial/unresolved extraction after policy approval; ensure report exposes loss/refusal. |

No new automated tests are written for this documentation-only task. Spec checks: front matter,
links, evidence/decision consistency, `pnpm typecheck`, `pnpm lint`, and `pnpm lint:headers`.
Implementation runs focused Vitest files through pnpm plus those gates; full suite/build run on
the integration branch according to the owner's batching decision. Do not claim reference
conformance from passing TypeScript or unit tests alone. No source/fixture-generating implementation
may derive expected residues by calling the translator under test.

## Decisions and deviations to carry into the implementation PR

1. Previously every exception made PR 1 computation unavailable. **Decision:** apply verified
   NCBI code breaks before comparison and stop analysis. **You'll notice:** Sec/Pyl recoding no
   longer creates a false early stop or curated-difference flag. **Backed by:** NCBI Toolkit
   `912b751` and INSDC 11.4 above.
2. NCBI can cut its output at the first stop. **Decision:** retain internal stops for diagnosis
   and omit edited `/translation` on export. **You'll notice:** a named warning rather than a
   truncated asserted protein. **Backed by:** binding #253 owner decision, Dunceious's choice.
3. Repeated exceptions currently collapse in scalar qualifier parsing. **Decision:** preserve
   each value in one canonical ordered store. **You'll notice:** multiple recodings survive
   saving and export. **Backed by:** distinct INSDC single-codon assertions and NCBI break list.
4. Edit maintenance and ambiguous/invalid exception policies remain unconfirmed. **Open point:**
   resolve the Open decisions table before implementing those paths; recommendations are not
   owner decisions. **Backed by:** evidence limits above.
