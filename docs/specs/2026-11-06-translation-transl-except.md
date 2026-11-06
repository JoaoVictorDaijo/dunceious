---
title: CDS translation exceptions under NCBI code-break rules
status: proposed
date: 2026-11-06
areas: [translation, genbank, gff3, domain]
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
on `fix/cds-translation-invalidation`, read at branch head
[`a3d33cd4f1629d316cefb04c996faba1bf985fee`](https://github.com/JoaoVictorDaijo/dunceious/blob/a3d33cd4f1629d316cefb04c996faba1bf985fee/docs/specs/2026-11-06-translation-stored-protein-provenance.md).
The current-head revision includes the protein-record eligibility guard and unconditional
final definite-stop removal preserved below. The relative sibling link becomes local after integration; the pinned branch-head link identifies
the version read here. References to that model are by name because its review is ongoing.
This checkout does not yet contain its
proposed `translation.ts`; implement PR 2 after PR 1, reconciling names against the merged model.
This document does not change source code or close #253. PR 3 owns codon marks and hover design.
Its revised branch head was read at
[`3ac93475209a6b30339e5061ccb1e02c233075ac`](https://github.com/JoaoVictorDaijo/dunceious/blob/3ac93475209a6b30339e5061ccb1e02c233075ac/docs/specs/2026-11-06-translation-codon-marks.md).
PR 2 owns the exception contract; PR 3 consumes it. Revised PR 3 already includes stop-over-X,
length-aware counts/explanations and removed-terminal evidence; these are compatible requirements,
not remaining competing policies. Its final implementation must satisfy the integration contract below.

Binding owner decisions override drafts: one stored protein, imported `/translation` read-only,
recompute on biological edits, preserve and lightly fill curated differences, omit computed
proteins with internal stops on export, no undo work, **no project-format bump or migration**.
PR 1's revised decision 9 agrees: keep format 2, without legacy compatibility handling.
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
- **Format contract:** [NCBI GFF guide](https://www.ncbi.nlm.nih.gov/genbank/genomes_gff/),
  Attributes/Annotation features, documents percent-encoded inner commas and comma-separated
  multiple qualifier values. Split raw list separators before decoding each item.
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
  repairs interval strand on same-sequence minus CDSs, stable-sorts breaks by CDS offset and
  removes only adjacent equal location/amino-acid duplicates. The follow-up read-only fetch of
  [cleanup.cpp, ParseCodeBreak/ParseCodeBreaks](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/cleanup/cleanup.cpp#L4520)
  establishes that cleanup processes each qualifier, delegates locations to `ReadLocFromText`,
  rejects simple intervals longer than three bases and simple points/intervals outside the CDS,
  and assigns strand from the feature. It starts the residue as X and delegates recognized
  alphabetic amino-acid text to `x_ValidAminoAcid`. The helper is now traced below; the location reader delegates to
  `GetSeqLocFromString`. Arbitrary nested syntax remains an execution gap. Multi-interval text is wrapped in
  join before location parsing; acceptance of nested joins remains unexecuted.
- **Documented, not executed:** same snapshot,
  [ValidErrItem.cpp](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objects/valerr/ValidErrItem.cpp#L1367)
  defines `TranslExcept` (unparsed), `TranslExceptPhase` (off-codon),
  `DuplicateTranslExcept` (different amino acids at one location), `CDSrange` (outside CDS),
  and `UnnecessaryTranslExcept` (same amino acid). Message definitions alone establish neither severity nor trigger conditions; the
  implementations now traced below establish the specified conditions.
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
| `ConceptualTranslation` | Keep `ok` fields `residues`, `possible`, `internalStops`, `threePrimeIndeterminate`; add diagnostics and occurrence evidence to **both** variants, including removed-stop and failed/deferred-entry evidence below. Extend `unavailable` with invalid/unresolved exception reasons (failed-value policy open); conflicts carry diagnostics and use the source-settled last residue. Retain all PR 1 eligibility reasons: `protein-record`, `invalid-code`, `unknown-strand`, `nonlocal-location`, `unknown-completeness`, `empty`. |
| `conceptualTranslation(feature, record)` | Replace the blanket `unsupported-exception` return with parsing, coordinate resolution and NCBI substitution after ordinary translation/initiator handling, before final stop removal and stop/count analysis. |
| `initiatorResidue(codon, translTable)` | Signature and context-free Starts-row meaning unchanged. An applied first-codon exception overrides its result inside `conceptualTranslation`. |
| `compareTranslation(stored, conceptual)` | Signature unchanged; read exception-adjusted `possible`/residues. Do not report an explained recoding as a mismatch. Preserve revised PR 1's stop precedence: effective internal `*` differs from every stored non-stop, including X; ordinary stored X remains a wildcard. |
| `storedTranslation(feature)` / `isCds(feature)` | No behavior change: one `metadata.translation`, CDS including SO:0000316. |
| `saveEditedFeature` | Compare ordered exception values as biological inputs; recompute on their add/change/remove and every PR 1 biological edit. Clear derived diagnostics/mappings before reevaluation. |
| `metadata._translationSource` | Keep imported/computed/removed meanings; success stores adjusted residues as computed, failure removes the old protein after an edit. |
| PR 1 `_translationCheck` and import check | Invalidate with all biological inputs; compare against adjusted conceptual translation on GenBank import and FASTA+GFF3 attachment. Carry exception diagnostics separately from mismatch count. |

New pure domain helpers should parse one value and resolve all values against the same CDS
base map used for extraction; names are implementation choices. Domain types stay in
`types.ts`, no React/browser imports. Core GenBank and GFF3 readers/writers own qualifier I/O;
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

### GFF3 canonical ingress and egress

FASTA+GFF3 attachment must see the same canonical field as GenBank import. Split literal
attribute list commas **before** percent decoding each item exactly once; `%2C` inside
`(pos:...,aa:...)` is not a separator. Move all decoded items, including empty/malformed
ones, into `translationExceptions`; remove `metadata.transl_except` and only its member
of `_gffLists`. Never split the decoded scalar to reconstruct items. Repeated attributes
append rather than overwrite. This follows the NCBI GFF guide and the lossless occurrence
contract above.

For multipart CDSs use the existing `(seqid, ID)` grouping in `src/core/formats/gff3.ts`,
not new Parent-based regrouping. Append each row's items in file row/list order before
biological segment reordering. Preserve identical occurrences and different values; application
normalization follows NCBI equality below; only adjacent equal assertions collapse after
stable sorting by CDS offset, never equal assertions separated by a conflicting residue.
Do not discard later rows or sort qualifier values.
GFF3 export reads the canonical array directly, percent-encodes each item including internal
commas, then joins items with literal commas. Emit the full list once, on the first emitted
CDS row, omitting it on subsequent rows. This serialization follows the lossless multiplicity
contract: reimport must not manufacture duplicates. Metadata-only enumeration is insufficient.
Whole-record GFF3 export retains invalid values by percent encoding with computation warnings.
GenBank preservation is bounded by the safe-representation contract below; no arbitrary-text
round-trip promise overrides qualifier syntax safety.
Selection GFF3 export follows the same transform and unresolved-export decision as GenBank;
neither format may claim stale entry coordinates are successfully rebased.

### Exception evidence on every result

Both `ok` and `unavailable` carry ordered occurrence evidence and diagnostics. Each entry
has feature identity, zero-based array index, raw value, parse/residue status, determinable
diagnostics, mapped bases/codon index where available, and `applied`, `failed` or `deferred`
application status with reason. Applied entries include replacement and whether their position
was removed as the terminal stop. Preserve that slot's real bases and pre-removal codon index
even though it is absent from `residues`/`possible`; PR 3 needs this for terminal/partial TERM.
Associate all occurrences in each adjacent equal run with its single application. Equal
assertions separated by a conflicting assertion have separate ordered applications: keep
their `applied` status and replacement evidence, identify which application superseded each
earlier one, and identify the final effective application. An earlier matching residue is
not retroactively the winning application; repeated winners remain separate from it.
A failed entry remains addressable; deferred mapping is not an off-frame/outside-CDS finding.

An independent syntax/vocabulary/note pass visits **every** entry before eligibility exits.
Preserve PR 1's primary reason precedence: protein record, invalid code, unknown strand, nonlocal location,
unknown completeness, empty extraction. These unavailable results still carry all determinable
diagnostics; checks requiring missing geometry or translation are deferred explicitly, never
guessed. An invalid exception must not replace an existing primary `protein-record` or `invalid-code` reason.
If eligible translation becomes unavailable under annotation policy, preserve determinable
successful local applications, including removed terminal slots, alongside failures. This is
partial evidence, never a verified whole-CDS protein, count, comparison or early-stop claim.
Whether a valid subset may instead produce a usable result remains an owner decision.

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
requires the reference acceptance work below. When the same entry bases are visited more
than once and the break cannot identify a unique occurrence, computation is unavailable;
an occurrence selector is outside PR 2 and needs a separate representation/design. NCBI rounds an off-frame interval down and the validator warns. The proposed stricter
verification rule in question 4 would leave it unusable instead, because it does not identify
a single complete codon; do not silently treat that proposal as an adopted reference default.

Support a local base point/range and explicit `complement(...)`. Parse accession syntax without
fetching; unresolved references yield a diagnostic, not local coordinates. Use [PR #306](https://github.com/JoaoVictorDaijo/dunceious/pull/306),
`fix/order-operator`, and its `src/domain/bio/locationFlags.ts` accessors
`definesOneSequence`, `isFivePrimePartialLocation`, `isThreePrimePartialLocation`. Preserve
PR 1's known-strand and normalized-completeness gates; false on absent segments is not proof
of completeness. `definesOneSequence` excludes multipart `order()` and remote parts but does
not check strand or emptiness. Do not replace it with a text search for `order`, or use
interior partial markers to determine biological end completeness. A between-base site is not a codon base.
Unknown amino-acid names are outside the standard vocabulary. NCBI maps them to X;
the single proposed stricter verification rule below is an explicit deviation, not an unknown default.

Import and authoring accept **both** one-letter and three-letter forms in INSDC 11.4
§7.4.3: Sec/U→U, Pyl/O→O, Asx/B→B, Glx/Z→Z, Xle/J→J, Xaa/X→X and every ordinary
residue pair. TERM→`*` and OTHER→X follow their qualifier-specific rules. One-letter forms
are standard-conforming, not tolerance cases. Full names such as Selenocysteine are not
legal abbreviations; do not label them standard values. Preserve `/note` for OTHER and terminal polyadenylation; missing explanatory
notes produce conformance warnings rather than invented text (import policy below).
Case-insensitive multi-letter lookup and X fallback are source-settled below.
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
it PR 1's N-padding rule remains unchanged. Internal short exceptions, non-TERM short suffixes
and non-T/TA TERM suffixes are not standard TAA completion. Their permissive NCBI behavior
and the one proposed stricter application rule are distinguished below. A CDS 3′-partial marker
does not prevent explicit TERM substitution or final definite-stop removal; do not confuse
a partial CDS end with a partial marker on the exception location itself.

### Translation order and stops

0. Preserve PR 1's record gate: declared `moleculeType: 'protein'` returns primary
   `protein-record` before code lookup, coding extraction, codon expansion or substitution.
   Do not infer nucleotide type from A/C/G/T-looking protein letters. No #288 assumption
   bypasses this gate. DNA/RNA and absent-type nucleotide defaults remain unchanged.
1. Run the independent all-occurrence syntax/vocabulary/note pass above. It may retain text
   diagnostics on protein records but cannot initiate nucleotide mapping or computation there.
2. Check PR 1 eligibility in its existing precedence, then extract/map if eligible. Return
   its primary unavailable reason with evidence on failure; otherwise resolve all exceptions,
   including entries after a stop. Defer only checks lacking required inputs.
3. Produce ordinary codon states using PR 1's IUPAC/U, initiation, leftover and context-dependent
   terminal-table rules, retaining the terminal position until substitutions finish.
4. Stable-sort resolved code breaks by CDS offset, collapse only adjacent equal normalized
   location/residue assertions, and apply the surviving breaks in order. Never globally
   deduplicate: a repeated residue after a conflict must overwrite that conflict. Terminal TERM
   may supply the suffix stop absent from the ordinary protein. NCBI substitution occurs after initiation, so `aa:Val`
   on the first GTG of a complete table-11 CDS yields V, not M. Never run initiation again.
5. An explicit residue replaces `possible` for comparison: Sec→`U`, Pyl→`O`, TERM→`*`,
   Asx→`DN`, Glx→`EQ`, Xle→`IL`. OTHER/Xaa renders X for an unspecified amino acid. Its comparison set remains an owner decision below; the recommended all-sense-residue set is not normative. Effective internal TERM differs from stored X under revised PR 1's stop precedence.
6. Determine terminal removal and internal stops from the adjusted positions. A full terminal
   stop changed to Sec stays U. An internal TGA changed to Sec ceases being an internal stop.
   Internal TERM remains `*` and does not truncate later residues. Remove one final definite
   stop independently of CDS completeness, including an explicit terminal TERM. This preserves
   current PR 1 and NCBI `TranslateToProtein`; completeness only gates ordinary terminal-table interpretation.

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
partial ends, exception values, CDS type transitions. Record molecule-type and sequence changes also invalidate
maps and computed checks. After a biological edit, successful adjusted translation without
internal stops replaces `metadata.translation` and sets source computed; internal stops or an
unavailable result remove it, source removed, with a named warning. Removing the last exception
returns to ordinary translation. Unrelated label/colour/note edits preserve imported/computed
provenance; editing a note alone does not move a break. Refresh note-dependent diagnostics on note edits
(preview and save), replacing cached warnings without changing `metadata.translation` or
`_translationSource`. On project load discard `_translationCheck` and recheck after location
normalization and DNA attachment as revised PR 1 requires; restored diagnostics are not trusted.

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
File acceptance is settled by the owner policy: [#286](../../../../../keep/murilo-review/decisions.md#L5)
warns for qualifier conformance, while [#298 item 16](../../../../../keep/murilo-review/decisions.md#L44)
refuses missing structurally mandatory feature-key qualifiers. The owner decision file is local
coordination evidence, not a distributable repository dependency. Here an unusable exception value,
including a bad position inside that value, is qualifier conformance, not malformed CDS geometry:
warn and retain the imported protein. Missing explanatory notes for OTHER/polyadenylation also
warn; `/note` is not a structurally mandatory qualifier of the CDS key. Never invent a note.
Broken CDS feature geometry/sequence still follows upstream refusal guards. This classification
separates file acceptance from computation availability; failed-value computation policy remains
open. It preserves #298's guards without reopening a file-refusal question. A valid remote qualifier must
not be called invalid syntax just because the local translator cannot resolve it.

## GenBank, GFF3 and selection export

Whole-record GenBank export emits representable logical `/transl_except` values as separate
unquoted structured qualifiers, preserving order and multiplicity. Before publishing any bytes,
preflight the **actual formatted lines**, including inserted wraps: each occurrence must reparse
as exactly one `transl_except` with the same logical value and no extra qualifier or feature.
This is a serialization safety check, not biological validation; today's scalar parser cannot
prove occurrence preservation. The implementation's occurrence-aware reader and writer must
agree with the independent literal expectations below. Standard structured values remain
unquoted; quoting arbitrary malformed text does not make it standard structured syntax.

Literal quotes, control/line-break characters, leading qualifier syntax and wrap-created qualifier
lines cannot be silently normalized or emitted if logical-value or structure preservation fails.
No unsafe file may be offered as a successful export. Keep the canonical values and protein in
memory/project data; safe GFF3 remains available. The owner must choose block-whole-file versus
explicit warned omission below for GenBank-unrepresentable values. Until resolved that recovery
path is not implementation-ready; neither silent dropping nor a private escaping scheme is
approved. This limit replaces the unconditional malformed-value preservation promise.
Do not synthesize qualifiers from protein differences. Do not drop qualifiers because a
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
round-trip retains noncomputable values when safely representable; GenBank-unrepresentable
values follow the separate recovery question, never an unsafe-success claim.

## Settled rules, reference work and sibling integration

INSDC's listed one-/three-letter forms, single-codon geometry and terminal T/TA→TAA TERM are
settled above. NCBI cleanup's stable offset sort and adjacent-only equal normalized
location/residue collapse are the normalization contract: apply once per adjacent equal run
and associate that run's raw occurrences with its application; never erase them or collapse
equal assertions across an intervening conflict. The final surviving application wins.
No additional refusal of identical assertions is proposed.
Exact current-record accession identity may resolve only to the same record/base map; a different
loaded record is not made eligible by being in memory. PR 1's nonlocal-CDS gate remains intact.
Cross-record computation would expand that contract and needs a separate design, outside PR 2.
Alias recognition within this record is a separate question below; no network fetch is permitted.

The following is **technical acceptance work, not an owner option to waive evidence**: obtain
reproducible NCBI parser/cleanup/validator fixtures for split-codon syntax and the source-traced cases
below, identifying version/options and distinguishing normalization, translation and diagnostics.
Standard-derived base mapping is established; NCBI text acceptance is not execution-verified.
For `join(1..4,10..14)` with bases 1..4=`ATGT`, 10..14=`GATAA` and
`(pos:join(4,10..11),aa:Sec)`, the mapped codon is TGA and expected protein is `MU`.
A hand derivation alone does not satisfy the parser gate. If probes expose a remaining product
choice, formulate that question with their evidence; do not replace the gate by a shipping vote.
Only read-only source downloads are part of this spec revision; no reference executable is downloaded or run.

**PR 3 consumption requirements:** use adjusted `possible`, `residues` and `internalStops` from
PR 2; never reinterpret raw DNA or reparse qualifiers to undo an exception. With `ATGAAACCCTAA`,
TERM at 4..6 and stored `MXP`, show lighter X plus the base-facing stop edge, accessible text
“Annotated X (unknown); AAA ordinarily reads K; translation exception (pos:4..6,aa:TERM)
specifies stop”, `differing=[1]`, one codon disagreement and one discrepant CDS in the file
warning (absent `/exception`). Hub/feature/codon explanations share that count; no zero-codon
clause. Internal-stop status is independently true. Stored `M*P` has differing=[] and the
verified-stop mark; both have three positions and one internal stop. PR 3's revised head already
states this; retain it and add the exact shared fixture above alongside its existing MXA case.
Preserve applied, failed and deferred occurrences on unavailable results and real-base/pre-removal
indices for partial TERM. PR 3 must replace its numbered “Open decision 3” dependency with the
final named PR 2 failed-value policy once settled; no PR 3 default may resolve that question.
Its whole-result-unavailable branch cannot certify even an individually applied stop/mismatch.
PR 3 must extend its pre-projection eligibility gate to exclude `protein-record`, even with
known local geometry and stored protein: no cells, lane, chips, codon targets or assumed-table
fallback. Its current “other unavailable reasons” permission must exclude this reason. Add the
protein-record fixture below at projection/details boundaries, including forged cache reload.
Optional terminal fill remains a PR 3 presentation decision, not a PR 2 computation choice.

## Source-settled dispositions of the round-3 decision rows

Row numbers here retain the review's original table order; they are not owner-question numbers.
Sources were fetched read-only at Toolkit `912b751` and Biopython tag `biopython-188` (1.88).
These are source traces, not executed parser/validator fixtures. Raw occurrences always survive.
Validator diagnostics describe annotation validity; they do not prove the translator refused it.

- **Row 3 — identical assertions:** stable-sort by CDS offset, then use adjacent-only `unique`
  with normalized location/residue equality. Apply once per surviving run and associate every
  raw occurrence in that run with it. Do not globally collapse identical assertions:
  Sec/Pyl/Sec retains all three applications. No app refusal. **Backed by: `src/objtools/cleanup/newcleanupp.cpp:CNewCleanup_imp::CdregionFeatBC`, `CCodeBreakCompare`, `CCodeBreakEqual` at commit `912b751`**
  ([comparator/equality](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/cleanup/newcleanupp.cpp#L6506),
  [sort/unique](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/cleanup/newcleanupp.cpp#L6604)).
- **Row 4 — conflicting assertions:** retain raw occurrences; for the same normalized location
  the last raw assertion wins, including a repeated residue after a conflict, and report a
  conflict diagnostic. Cleanup's stable offset sort preserves same-offset input order; its
  adjacent-only equality includes residue. The translator overwrites in surviving order.
  Keep superseded application evidence and mark the final effective application separately.
  Validator reports Error
  `DuplicateTranslExcept` for adjacent equal locations, without selecting a different winner.
  Thus diagnostic severity is not computation refusal. **Backed by: `src/objtools/cleanup/newcleanupp.cpp:CCodeBreakCompare`, `CCodeBreakEqual`, `CNewCleanup_imp::CdregionFeatBC`; `src/objmgr/util/sequence.cpp:CSeqTranslator::Translate`; `src/objtools/validator/cdregion_validator.cpp:CCdregionValidator::x_ValidateCodebreak` at commit `912b751`**
  ([overwrite loop](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objmgr/util/sequence.cpp#L4225),
  [validator](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/validator/cdregion_validator.cpp#L687)).
- **Rows 6–8 — short locations:** cleanup accepts contained simple points/intervals of length
  at most three without testing terminality, residue identity or T/TA sequence. Translation
  uses `(LocationOffset - frame) / 3`: an internal short break can overwrite that position;
  a short non-TERM suffix substitutes only if an ordinary translated position exists there,
  and cannot append a non-stop; a short TERM suffix can overwrite or append `*` regardless
  of its letters. None is evidence of polyadenylation outside INSDC's T/TA case.
  The validator phase test covers length three or a length-one/two break ending at the CDS end;
  it does not reject all internal short breaks. SourceToProduct/frame validation is conditional
  on a product and skips terminal exceptions. Non-TERM terminal breaks can receive Warning
  `UnnecessaryTranslExcept` with “Unexpected … just past end of protein”; no such branch
  rejects terminal TERM for non-T/TA sequence. These defaults are settled; the stricter
  scientific-verification proposal is the single deviation question below, not three unknown
  reference behaviors. **Backed by: `src/objtools/cleanup/cleanup.cpp:CCleanup::ParseCodeBreak`; `src/objmgr/util/sequence.cpp:CSeqTranslator::Translate`; `src/objtools/validator/translation_problems.cpp:CCDSTranslationProblems::x_GetTranslExceptProblems`; `src/objtools/validator/cdregion_validator.cpp:CCdregionValidator::x_ValidateCodebreak`, `x_ReportTranslExceptProblems` at commit `912b751`**
  ([phase/terminal checks](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/validator/translation_problems.cpp#L643)).
- **Row 9 — CDS marked 3′ partial:** honor an otherwise resolvable terminal TERM, including
  standard short T/TA; remove the final definite stop independently of completeness. Keep the
  CDS partial marker, raw qualifier and its explanation; do not silently mark the CDS complete.
  `TranslExceptIsPartial` is Error for partial flags on the **break's location**, not for the
  parent CDS being partial; a break's own partial flags receive a diagnostic and follow the failed-value policy,
  rather than being mistaken for parent-CDS partialness.
  **Backed by: `src/objmgr/util/sequence.cpp:CSeqTranslator::Translate`, `TranslateToProtein`; `src/objtools/validator/cdregion_validator.cpp:CCdregionValidator::x_ValidateCodebreak`; `src/objtools/validator/translation_problems.cpp:CCDSTranslationProblems::x_GetTranslExceptProblems` at commit `912b751`**
  ([substitution](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objmgr/util/sequence.cpp#L4231)).
- **Rows 10–11 — simple-interval strand:** for a same-record simple interval with known CDS
  strand, assign that strand whether complement was omitted or explicitly contrary. Preserve
  the raw spelling and record normalization separately from validator warnings/errors. This
  settles these covered cases, not arbitrary mixed/nested shapes. **Backed by: `src/objtools/cleanup/cleanup.cpp:CCleanup::ParseCodeBreak`; `src/objtools/cleanup/newcleanupp.cpp:CNewCleanup_imp::CdregionFeatBC` at commit `912b751`**
  ([assignment](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/cleanup/cleanup.cpp#L4626)).
- **Row 13 — repeated base visits:** unavailable if occurrence is ambiguous under the current
  representation; do not pick the first/last visit. A selector is outside PR 2. **Backed by:**
  Dunceious's representational constraint: the raw qualifier identifies entry bases, with no
  occurrence field; no inspected reference supplies a selector. This is not a reference default.
- **Rows 14–15 — residue names/case:** the helper compares listed multi-letter names without
  case sensitivity (`sec`, `sEc`, `term`, `other`, `xxx` included). Single-letter matching is
  case-sensitive: `U` maps to U, `u` falls back to X. Full names such as `Selenocysteine` and
  `Banana` also fall back to X, not U and not parse failure; the parser creates an Ncbieaa X
  break. INSDC's Xaa is accepted by the standard even though NCBI reaches X by fallback;
  Xxx is an NCBI alias, not an INSDC spelling. Normalize recognized multi-letter case and Xxx
  while preserving raw text; report nonstandard spelling when applicable. Whether unknown
  fallback may certify an app protein belongs only to the single deviation question below.
  **Backed by: `src/objtools/cleanup/cleanup_utils.cpp:x_ValidAminoAcid`, `abbreviation_list`; `src/objtools/cleanup/cleanup.cpp:CCleanup::ParseCodeBreak` at commit `912b751`**
  ([helper](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/cleanup/cleanup_utils.cpp#L599)).
- **Row 16 — post-label whitespace:** skip whitespace immediately after `pos:` and `aa:` and
  trim the position substring, preserving raw text. This accepts `(pos: 4..6,aa: Sec)` without
  a failed-value condition. It does not authorize arbitrary whitespace inside location tokens
  or around label characters. `( pos:4..6,aa:Sec)` and `(pos :4..6,aa:Sec)` fail the literal
  `(pos:` search and remain unusable; no broader whitespace normalization is proposed. **Backed by: `src/objtools/cleanup/cleanup.cpp:CCleanup::ParseCodeBreak` at commit `912b751`**
  ([parser](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/cleanup/cleanup.cpp#L4551)).

## Open decisions

Only the following numbered questions go to the owner. Source defaults above are binding unless
question 4's single stricter application rule is approved. None of these options refuses an
otherwise structurally valid input file; conformance warnings and raw preservation are settled.
Questions 1, 2, 3, 5, 6 and 7 correspond to review rows 1, 2, 5, 12, 17 and 18. Question 4 covers the single explicitly justified verification deviation in rows 6–8 and 14–15,
also encompassing the existing off-frame and missing-residue refusals so they cannot remain unapproved restrictions.

1. After you move, reverse or change the frame of a CDS, its exception still names bases in the original record. Options: retain those absolute positions and revalidate them, shift them with the CDS, or remove affected values. INSDC defines entry coordinates but no editor policy; Biopython 1.88 `SeqFeature._shift`/`_flip` copies qualifier text unchanged, which is not evidence of safe editor maintenance. **Suggestion:** retain the original positions, revalidate before Save and require explicit repair when they no longer name a codon.

2. If an exception says OTHER or Xaa, the protein contains X rather than a named amino acid. Options: compare it as any sense residue (`ACDEFGHIKLMNPQRSTVWYUO`, excluding stop), or as literal X that differs from every concrete or ambiguous stored non-X. With the first option, expand stored B to DN, Z to EQ and J to IL and compare by set overlap; stored X stays the ordinary wildcard in both options and definite-stop precedence always wins. INSDC says unspecified and NCBI emits X; neither defines Dunceious's mismatch metric, and Biopython does not apply these exceptions. **Suggestion:** use the all-sense set including U and O with the stated ambiguity overlap.

3. If one exception cannot be used but another can, your file still loads with its imported protein and warnings. Options: make whole-CDS computation unavailable while retaining successful local evidence, or expose an explicitly incomplete subset result. The subset option would allow an adjusted preview and per-occurrence evidence only, with no verified comparison, count, early-stop claim or computed /translation export. NCBI parses individual values and translates parsed breaks while retaining failures as qualifiers; Biopython ignores breaks, and neither establishes this app's whole-CDS verification contract. **Suggestion:** make whole-CDS computation unavailable and retain determinable partial evidence.

4. Some files name an off-frame interval, only part of an internal codon, give a short non-TERM suffix, claim a non-T/TA short stop, or use a missing or unknown residue name such as Selenocysteine or lowercase single-letter u. Options: follow NCBI's permissive substitution/X fallback with explicit nonstandard diagnostics, or require a standard-supported single codon (or terminal T/TA TERM) and a recognized residue spelling before claiming a verified protein. NCBI cleanup and translation accept those shapes or emit X as detailed above; its validator does not reject all of them, Biopython ignores exceptions, and INSDC defines a single codon with only the T/TA short-stop completion case. The stricter rule is a deliberate deviation: an off-frame or partial codon does not identify all three coding bases, non-T/TA cannot establish TAA by polyadenylation, and an absent or misspelled intended residue must not silently certify X. This rule would make computation unavailable for these entries, preserve them and imported proteins, and keep import as warning; known case-insensitive multi-letter aliases remain accepted. **Suggestion:** approve this one stricter verification rule so a tolerated malformed assertion cannot certify a biological result.

5. An exception can name an accession that might be another name for the current record. Options: resolve only its exact accession identity, or additionally recognize an explicitly defined local alias set. INSDC permits accession-qualified syntax and NCBI resolves identities through its scope; neither it nor Biopython defines this app's record aliases, and no option allows fetching or computing across records. **Suggestion:** accept exact current-record identity initially and leave other aliases unresolved until a verified alias contract exists.

6. A selected region may cut through an exception or leave its coordinates impossible to rebase. Options: block the entire selected-record file, omit the exception with a warning, or omit the affected CDS with a warning. INSDC does not define selection-export recovery; Biopython copies stale qualifier coordinates, which cannot safely guide this export, and no inspected NCBI source settles the app workflow. If omitting the exception, also omit that CDS's /translation, mark verification unavailable and report both losses; if omitting the CDS, emit neither it nor its protein; no option may copy an old full protein into a clipped CDS. **Suggestion:** block the selected-record file with an actionable report and offer whole-record export subject to safe GenBank representation.

7. A malformed GFF3 exception may have no safe GenBank representation, for example quotes or text that wrapping would turn into a new qualifier. Options: block the entire requested GenBank file, or omit the affected occurrences with an explicit data-loss report and omit the affected CDS's /translation. INSDC defines structured qualifier syntax, NCBI offers no inspected lossless encoding for arbitrary text, and Biopython's writer does not establish safe recovery for this app's formatter/parser; GFF3 percent encoding and project storage preserve the original values. **Suggestion:** block the requested GenBank file and offer GFF3 or project preservation without implicit omission.

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
| `ATG TGA TAA`, Sec at `5..7` or `3..5` | off-codon diagnostic; NCBI rounds and substitutes U (respectively `MU` / `U*`); validator phase warning; question 4 proposes unusable, with availability under question 3 | H offsets + D TranslExceptPhase |
| Same, `pos:0..2`, `10..12`, `4..5 Sec`, or `pos:4^5` | invalid bound/outside record/CDS/site are unusable; short non-TERM follows the source trace and question 4 | H location/single-codon constraints; D CDSrange where applicable |
| Empty record/CDS; no qualifier / empty qualifier value | unavailable empty / invalid-value diagnostic; no invented codon zero or verified empty protein | PR 1 empty contract + H: no bases to locate |
| Two identical `4..6 Sec`; then Sec/Pyl at same codon | identical case `MU`, one application/two raw occurrences; Sec then Pyl gives `MO` plus conflict diagnostic, reverse order gives `MU` plus conflict diagnostic | N; stable cleanup ordering/equality; validator DuplicateTranslExcept Error |
| `1..9`, `ATGTGATAA`, ordered `4..6` breaks Sec/Pyl/Sec; Pyl/Sec/Pyl | `MU`; `MO`, respectively; three raw occurrences and three ordered applications in each case, conflict evidence retained, occurrence 2 effective | N stable offset sort, adjacent-only unique and ordered overwrite; H literal substitutions and final TAA removal |
| `pos:X22222:4..6,aa:Sec`, accession unavailable | retain raw qualifier; unresolved, no local substitution; import warns; availability follows failed-value policy | H remote syntax; local-only owner constraint |
| Malformed `(pos:4..6,aa:)`, unknown `aa:Banana` | NCBI creates X for both; app diagnostic distinguishes absent residue and unknown name; stricter verification follows question 4 and failed-value handling follows question 3 | H controlled vocabulary; ParseCodeBreak + x_ValidAminoAcid source trace |
| `1..>9`, `ATG TGA TGG`, `4..6 Sec` | `MUW`; 3′ partial does not block a full internal exception | H + N |
| Terminal `ATGTA` marked 3′ partial with TERM; non-T suffix `ATGCC` with TERM | partial T/TA TERM gives `M` with partial marker retained; non-T suffix NCBI gives `M`, subject to question 4's stricter rule | H + N; validator does not confuse CDS partial end with break partial flags; no execution |
| Stored `MUP` / `MKP`, coding `ATG TGA CCC TAA` with Sec | first has no mismatch; second differs at codon 2 and retains stored K with lighter fill | H adjusted literal `MUP`; PR 1 comparison contract |
| Select bases `101..112` from entry with CDS there and break `104..106 Sec` | exported CDS `1..12`, qualifier `4..6 Sec`, reimport computes `MUP` | H subtraction `p-100`; full round-trip must use independent literal protein |
| Reverse that 12-base selection | exported CDS `complement(1..12)`, qualifier `complement(7..9) Sec`; computes `MUP` | H `13-(p-100)` and complement derivation |
| Edit `<1..10` frame from 2 to 1, retaining `5..7 Sec`; remove Sec from `ATG TGA TAA` | first becomes off-codon; second becomes internal-stop `M*` after terminal removal, edited protein omitted | H coding offsets; N substitution/owner export rule |

### Boundary acceptance literals

These additional cases protect the format and diagnostic contracts above. They are hand-derived
acceptance requirements, not reports of executed tools. GFF3 rows below use nine tab-separated
columns; `\t` denotes one literal tab and `\n` one newline. No stored protein unless specified.

- **Reference normalization and diagnostic separation:** DNA `ATGTGATAA`, CDS `1..9`,
  values `['(pos:4..6,aa:Sec)', '(pos: 4..6,aa: Sec)']` → `MU`, one application
  associated with raw occurrences 0 and 1; both strings survive GenBank/GFF3/project round-trip.
  Two literal identical Sec strings have the same outcome. Reversing two different assertions
  Sec/Pyl changes `MO` to `MU`, with a conflict diagnostic in both orders and both raw values
  retained. Check cleanup equality/order separately from validator Error DuplicateTranslExcept;
  an identical pair normalized away must not be called a remaining validator conflict.
- **Interleaved duplicate/conflict precedence:** DNA `ATGTGATAA`, CDS `1..9`, table 1,
  values `['(pos:4..6,aa:Sec)', '(pos:4..6,aa:Pyl)', '(pos:4..6,aa:Sec)']`
  → `MU`; swapping Sec and Pyl in all three strings gives Pyl/Sec/Pyl → `MO`.
  All breaks map to real bases [4,5,6], coding offsets [3,4,5], pre-removal codon index 1.
  The ordinary ATG/TGA/TAA protein M/stop/stop becomes M/U/stop or M/O/stop, then the final
  TAA stop is removed. In each case retain all three raw strings in order through
  GenBank/GFF3/project round-trip, three separate `applied` occurrences with replacement
  U/O/U or O/U/O, and conflict evidence referencing occurrences 0, 1 and 2. Occurrence 0's
  application is superseded by 1, and 1 by 2; only 2 is effective, even though 0 names the
  same residue. No assertion is an adjacent duplicate here. Global first-occurrence collapse
  would incorrectly produce `MO` / `MU` and must fail acceptance. **Backed by:** Toolkit
  `912b751` [stable offset sort and adjacent-only unique](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/cleanup/newcleanupp.cpp#L6506)
  and [ordered translator overwrite](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objmgr/util/sequence.cpp#L4225).
  These are source-backed hand derivations, not executed NCBI fixtures; record validator
  diagnostics separately from application evidence.
- **Simple minus strand, omitted and contrary orientation:** forward DNA `TTATCACAT`, CDS
  `complement(1..9)` gives coding `ATGTGATAA`. `(pos:4..6,aa:Sec)` (omitted complement)
  and `(pos:complement(complement(4..6)),aa:Sec)` (explicit plus orientation resolving to a
  simple interval) normalize to minus bases [6,5,4], offsets [3,4,5], protein `MU`.
  Include an explicitly plus-strand simple location object at the cleanup boundary so nested
  text-parser support cannot masquerade as proof of strand assignment. Keep the exact raw
  value, expose strand normalization, and record validator severity independently; no claim
  that cleanup must issue a validator warning. Ordinary `(pos:complement(4..6),aa:Sec)`
  is the unchanged minus control. Complex/mixed text still requires parser evidence.
- **Vocabulary/case:** on the same plus CDS, `aa:sec`, `aa:sEc`, `aa:U` → `MU`;
  `aa:Xxx`, `aa:xxx`, `aa:u`, `aa:Selenocysteine`, `aa:Banana` → NCBI `MX`.
  Recognized Xxx/case variants normalize with raw text retained; lowercase single-letter/full
  names are X fallback, never U. Under approved question 4 they instead make app verification
  unavailable, retaining imported protein and warning. Standard Xaa remains accepted X.
- **Short-break source probes:** on `ATGTGATAA`, internal `(pos:4..5,aa:Sec)` is accepted
  by cleanup and overwrites index 1 to give `MU` in the permissive translator; it does not
  trigger the length-three/terminal-short phase branch. On `ATGGC`, suffix `4..5 Sec` replaces
  the ordinary N-padded Ala position with U (`MU`); on `ATGTA`, suffix `4..5 Sec` cannot
  append U when there is no ordinary retained position (`M`). `ATGCC`, suffix `4..5 TERM`
  gives `M` after overriding the padded Pro position and final-stop removal; this is not a
  TAA-completion derivation. Question 4's strict option makes each of these entries unusable
  instead; these are separate oracle expectations, not execution claims. Pin validator product
  presence and partial flags when capturing actual phase/range/unnecessary diagnostics.
- **Partial parent versus partial break:** CDS `1..>5`, DNA `ATGTA`, break `(pos:4..5,aa:TERM)`
  → `M` after final definite-stop removal, CDS still partial. A break whose own location is
  `4..>5` triggers validator Error TranslExceptIsPartial instead. These must not share a
  “parent is partial” rejection. Repeated-base CDS `join(1..6,1..6)` with `4..6 Sec` is
  unavailable due to ambiguous occurrence; no first-visit/last-visit substitution is allowed.
- **Whitespace boundary:** `(pos: 4..6,aa: Sec)` accepts, whereas `( pos:4..6,aa:Sec)` and
  `(pos :4..6,aa:Sec)` fail the literal position label. Preserve all raw values; only the
  latter failures participate in question 3's failed-value policy.

- **Current PR 1 molecule-type preservation:** declared protein record
  `{id:'p', sequence:'GCTAAAGCT', moleculeType:'protein'}`, exact CDS `1..9`, +, frame 1,
  table 1, stored `QQQ` imported and `(pos:4..6,aa:Sec)` → primary `protein-record`,
  occurrence retained with deferred mapping/application, no nucleotide protein/count/stop/
  mismatch claim. Table 99 or an additional malformed `(pos:4..6,aa:)` cannot replace
  that primary reason; the latter still has a missing-residue text diagnostic. Rename preserves
  QQQ/imported; end edit 9→6 removes it per PR 1. Reload with a forged successful cache
  claiming AKA discards it and returns protein-record before publication; details/copy retain
  QQQ/imported. PR 3 draws no codon lane, cells, chip or targets, including assumed ones.
  Positive controls on DNA `GCTAAAGCT` or RNA `GCUAAAGCU` with that Sec exception give
  `AUA` (GCT/GCU=A, AAA ordinarily K overridden to U, GCT/GCU=A); absent molecule type
  retains PR 1's nucleotide default. Protein letters must never be reinterpreted as AUA/AKA.

- **Unsafe GenBank representation, quotes:** FASTA `>r\nATGTGATAA\n`, GFF3
  `r\t.\tCDS\t1\t9\t.\t+\t0\tID=c;transl_except=%22garbage%22`.
  Canonical array is exactly `['"garbage"']` (both quote characters are data), no stored
  protein. GFF3 re-export/reimport preserves that literal value. GenBank's naive
  `/transl_except="garbage"` would instead reimport `garbage`, so it must fail preflight.
  Under block-file policy produce no GenBank file and report feature c/occurrence 0/raw value;
  under explicit omission policy report the omitted occurrence, and reimport the resulting
  file with no transl_except occurrence and no stored protein. Neither approved option may
  claim a lossless GenBank round-trip. The retained canonical array must remain unchanged.
- **Unsafe GenBank representation, formatter-created qualifier:** same FASTA/feature, GFF3
  attribute `transl_except=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA%20%2Ftranslation%3D%22FAKE%22`.
  Decoded value is exactly 64 A characters followed by ` /translation="FAKE"`. The current
  58-character formatter puts the slash fragment on a new 21-space-indented line; a naive
  reimport creates `metadata.translation='FAKE'`. Required outcome is preflight rejection
  of that representation, even with no input newline. GFF3 round-trip retains the one raw
  value; GenBank is either blocked (no file) or explicitly omits occurrence 0 with a report.
  If an omitted-value file is emitted, reimport yields no exception and no stored protein;
  it must never yield `FAKE`, a second qualifier, or a new feature. In both policies in-memory
  values/provenance remain unchanged. A future lossless encoding would require a separately
  reviewed reader/writer contract, not an implicit quoted-form workaround.
- **Conformance warning versus computation:** DNA `ATGTGATAA`, CDS `1..9`, stored `MW`,
  `(pos:4..6,aa:)` or `(pos:10..12,aa:Sec)` → file accepted, corresponding missing-residue
  or outside-CDS qualifier warning, raw occurrence and stored `MW` retained. No verified
  `MU` follows from either invalid entry; whole-CDS availability follows the failed-value
  question. In contrast a CDS feature location `1..12` on that 9-base record is broken
  feature geometry and refused upstream. DNA `ATGTA`, CDS `1..5`, `(pos:4..5,aa:TERM)`,
  absent explanatory note → accepted with missing-note warning, conceptual `M` from
  ATG/TAA completion; adding note `stop codon completed by polyadenylation` removes only
  that warning, not a protein position. No refusal of either note state is an option here.
- **Shared stop/X contract:** DNA `ATGAAACCCTAA`, CDS `1..12`, TERM at 4..6, stored `MXP` →
  M/K/P/stop ordinarily, M/stop/P after override and terminal removal. `residues='M*P'`,
  `possible=['M','*','P']`, `internalStops=[1]`, `differing=[1]`, unmatched tails empty/zero,
  one discrepant CDS, three positions/one internal stop. PR 3 keeps X with stop edge and
  accessible TERM explanation above. Stored `M*P` instead has no differing indices but
  the same internal stop; stored `MKP` differs at [1]. Removing TERM gives `MKP`, stored X
  ordinary wildcard → differing=[] and internalStops=[]; agreeing Sec at 4..6 with stored
  `MUP` gives `MUP`, no differences or early stop. These reject counting lighter cells as
  differences and raw-DNA stop analysis that ignores exceptions.
- **Split syntax evidence gate:** record `ATGTNNNNNGATAA`, CDS `join(1..4,10..14)`,
  `(pos:join(4,10..11),aa:Sec)` maps [4,10,11] to coding offsets [3,4,5], T/G/A → U;
  `ATG TGA TAA` → `MU`. `(pos:4..11,aa:Sec)` includes bases 5..9 outside the CDS and must
  not substitute U. Hand mapping establishes these outcomes but neither counts as an executed
  NCBI text-parser fixture. With no versioned parser/validator evidence the acceptance gate
  remains unmet; passing unit fixtures cannot turn it into a “ship on hand derivation” option.

- **GFF3 ingress, egress and multiplicity:** FASTA `>r\nATGTGATAGCCCTAA\n`, GFF3
  `r\t.\tCDS\t1\t15\t.\t+\t0\tID=c;transl_except=(pos:4..6%2Caa:Sec),(pos:7..9%2Caa:Pyl)`.
  Canonical array is exactly `['(pos:4..6,aa:Sec)', '(pos:7..9,aa:Pyl)']`, no scalar or
  `_gffLists.transl_except`. Literal codons ATG/TGA/TAG/CCC/TAA → M/U/O/P/terminal stop →
  `MUOP`. A GenBank CDS `1..15` with those two separate qualifiers exported to GFF3 emits
  the above attribute list (additional ordinary attributes allowed); reimport restores both
  strings in order and `MUOP`. Decoding before splitting would create four broken fragments;
  metadata-only writing would lose both entries. Both outcomes fail acceptance.
- **Multipart GFF3 aggregation:** FASTA `>r\nATGTGATAGNNNCCCTAA\n`; rows
  `r\t.\tCDS\t1\t9\t.\t+\t0\tID=c;transl_except=(pos:4..6%2Caa:Sec)` and
  `r\t.\tCDS\t13\t18\t.\t+\t0\tID=c;transl_except=(pos:7..9%2Caa:Pyl)`.
  Joined coding bases 1..9,13..18 give ATG/TGA/TAG/CCC/TAA → `MUOP`; the same two-item
  array is required, including the second row's entry even though its position is on the first
  interval. Export list once on first row; round-trip has exactly two entries, not four.
  Repeating the Sec item twice in the first row's list retains two Sec occurrences followed
  by Pyl (three total); identical Sec assertions apply once, without erasing either occurrence.
- **GFF3 selection:** select bases 101..115 containing `ATGTGATAGCCCTAA`, CDS `101..115`,
  exceptions `104..106 Sec`, `107..109 Pyl`. Export rows at `1..15` with the first list above;
  reimport computes `MUOP`. Reverse selection gives sequence `TTAGGGCTATCACAT`, minus CDS
  `complement(1..15)`, breaks `complement(10..12) Sec`, `complement(7..9) Pyl` (p→116−p);
  GFF list is `(pos:complement(10..12)%2Caa:Sec),(pos:complement(7..9)%2Caa:Pyl)`.
  Reimport coding sequence is still ATG/TGA/TAG/CCC/TAA → `MUOP`. Selection 101..105 loses
  Sec base 106 and all Pyl bases: no successful rebase or verified `MUOP`; block/omit behavior
  waits for the owner question, identically for GenBank and GFF3.
- **Legal abbreviations:** CDS `1..9`, DNA `ATGTGATAA`, `(pos:4..6,aa:U)` / `aa:O`
  gives `MU` / `MO`, exactly as Sec/Pyl, with no nonstandard-name warning on import or authoring.
  At the same position B/Asx gives `MB` with set `DN`, Z/Glx `MZ` with `EQ`, J/Xle `MJ`
  with `IL`, X/Xaa `MX` (comparison policy pending). DNA TGA is overridden, final TAA removed.
  `aa:Selenocysteine` is outside §7.4.3 abbreviations and may not pass as standard U;
  NCBI maps it to X (not U); question 4 governs stricter app verification.
- **Eligibility plus independent diagnostics:** DNA `ATGTGATAA`, CDS `1..9`, table `99`,
  exceptions `['']`, stored `MU` → primary unavailable `invalid-code`, occurrence 0/raw `''`
  invalid-value diagnostic and deferred application, stored `MU` unchanged, no verified mismatch,
  count or internal-stop claim. No assumption-table substitution may certify the exception.
  Empty record and empty extraction `[0,0)`, known strand/ends, table 1, exceptions
  `['(pos:4..6,aa:)']` → primary `empty`, occurrence 0 missing-residue diagnostic, mapping
  deferred (not outside-CDS or codon zero), stored `MU` retained if imported. This is a pure
  translator boundary input, not permission to accept malformed flat-file feature geometry.
- **Removed-stop and failed-entry evidence:** `ATGT`, CDS `1..4`,
  `['(pos:4,aa:TERM)']`, note `stop codon completed by polyadenylation` → protein `M`,
  applied occurrence 0 at real base 4, pre-removal index 1, replacement `*`, terminal removed.
  Add occurrence 1 `'(pos:1..3,aa:)'`: missing-residue diagnostic remains with raw text/index 1;
  occurrence 0's determinable terminal evidence survives even if the approved invalid-value
  policy makes the whole result unavailable. Never fabricate a retained second residue or
  a verified length for an unavailable whole result.
- **Note refresh without protein mutation:** `ATGTGATAA`, CDS `1..9`,
  `(pos:4..6,aa:OTHER)`, imported protein `MW`, source imported, absent note. Initial
  missing-note diagnostic changes to absent when note becomes `unusual amino acid`, and
  returns on removing that note; preview/save show the same refresh. Protein stays literal
  `MW`, source stays imported, and positions stay 4..6 in all three states. Import accepts with
  a conformance warning when the note is absent; no note-only edit may replace protein by
  conceptual `MX`.
- **Revised PR 1 preservation:** `ATGAAACCCTAA`, CDS `1..12`, break `(pos:4..6,aa:TERM)`,
  stored `MXP` → conceptual `M*P`, differing index `[1]` and internalStops `[1]`.
  This rejects the obsolete stored-X-hides-stop interpretation. Format 2 serialization of
  canonical exceptions and `metadata.translation='MXP'` creates neither `feature.translation`
  nor any legacy scalar conversion; no old-project compatibility fixture is required.

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
| All repeated values survive parser, editor, project and writer | `qualifierParser.test.ts` checks ordinary multiline translation; `featureParser.test.ts` still asserts duplicate protein stores. No exception multiplicity or unsafe cross-format representation protection found. Current GFF3 reader merges geometry but loses later-row attributes; writer enumerates metadata. | Add lossless parser→editor/project→GenBank/GFF3 round-trip at cheapest capable boundaries; distinguish two different breaks from last-value-only overwrite. Do not retain obsolete duplicate-protein expectation after PR 1. |
| Exceptions override initiation/stops/ambiguity; invalid mappings do not assert proteins | No PR 1 `translation.test.ts` present here; no exception application test found. | Add pure-domain oracle fixtures above, including allowed and invalid positions, partial ends, U/IUPAC and empty cases. Interleaved Sec/Pyl/Sec and Pyl/Sec/Pyl must reject global deduplication, retain three occurrences/conflict evidence and identify the effective final application; adjacent identical pairs still share one application. Conditional cases wait for decisions. |
| Recompute/remove on biological edits; preserve unrelated edits and imported protein | `featureManager.test.ts` asserts phase-cache invalidation on start/end/strand/segments and unrelated rename preserves phase; no exception/protein protection found. | Strengthen save-boundary checks for adjusted success and removal on invalidation/internal stops; preserve raw entries and unrelated-edit provenance. Preview must agree with save. |
| Stored comparison, early stops and count use adjusted result, not raw DNA | No exception-specific protection found. PR 1 comparison/count assertions are planned only. | Reuse merged PR 1 checks; add Sec removing a stop, TERM adding one and genuine curated mismatch, through shared domain result and consuming app boundary. Reject false lighter-fill/mismatch and raw-TGA early stop. |
| Both import routes diagnose without overwriting curated proteins | `bioResponse.test.ts` inspected by search; no transl_except assertions found. | Add entry-point checks for GenBank, FASTA+GFF3 attachment and project recheck, plus unavailable-result evidence and note-only preview/save refresh. Keep parser/diagnostic wiring real; invalid exceptions must not be counted as verified mismatches. |
| Whole-record and selection export preserve qualifiers and cannot claim stale computed protein | `genbankContract.test.ts` asserts phase and translation wrapping; no exception coordinate-rebase protection found. | Add GenBank and GFF3 export→reimport checks with literal transformed locations, ordered arrays, multipart list emission and adjusted proteins, plus denied partial/unresolved extraction after policy approval and the literal quote/wrap-created qualifier preflight cases above. Ensure report exposes loss/refusal and forbidden FAKE protein creation. No unsafe-export protection found in existing tests. |

No new automated tests are written for this documentation-only task. Required spec checks: front matter,
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
4. GFF3 previously kept exception attributes only in metadata and could lose later CDS rows.
   **Decision:** route both formats through the canonical ordered array, split GFF3 lists before
   decoding, aggregate multipart rows, and emit each occurrence once. **You'll notice:** Sec/Pyl
   survive GenBank↔GFF3 and selection round-trips. **Backed by:** NCBI GFF guide above and the
   existing lossless qualifier contract; no new biological precedence is inferred.
5. Legal one-letter values were treated as tolerance choices. **Decision:** accept INSDC's
   listed one- and three-letter forms equally. **You'll notice:** U/O/B/Z/J/X authoring and
   import are not marked nonstandard. **Backed by:** INSDC 11.4 §7.4.3 above.
6. Eligibility failures could hide invalid qualifier text. **Decision:** gather independent
   diagnostics before returning and retain failed/deferred/removed-stop evidence in both result
   variants. **You'll notice:** invalid code and malformed exception can both be explained;
   note repairs refresh warnings without replacing imported protein. **Backed by:** PR 1's
   eligibility and provenance contract, PR 3's evidence contract and this spec's all-entry diagnostics.
7. Arbitrary malformed GFF3 values were promised unconditional GenBank preservation.
   **Decision:** preflight actual serialized structure and logical values; never offer unsafe
   output as success. **You'll notice:** an unrepresentable value requires an actionable
   export report, while the original stays in the project/GFF3. **Open point:** block-file
   versus explicit omission. **Backed by:** INSDC structured syntax and the inspected
   `qualifierRules.ts`/`qualifierParser.ts` representation loss, not a new escape convention.
8. Qualifier conformance could be mistaken for broken feature geometry. **Decision:** warn on
   unusable exception values and missing explanatory notes; preserve structurally mandatory
   feature-key refusal guards. **You'll notice:** an otherwise valid CDS record still loads
   with its imported protein and specific warnings. **Backed by:** owner #286/#298 policy
   classification above and INSDC's CDS-key versus explanatory-note distinction.
9. Split syntax had an owner option to waive parser evidence. **Decision:** treat probing as
   mandatory technical acceptance work. **You'll notice:** standard-derived mapping examples
   are not presented as executed NCBI parser conformance. **Backed by:** scientific-rigor
   independent-oracle requirement and the documented-versus-executed evidence limits above.
10. Edit maintenance, unsafe-export recovery and ambiguous/invalid computation policies remain unconfirmed. **Open point:**
   resolve the numbered Open decisions before implementing those paths; recommendations are not
   owner decisions. **Backed by:** evidence limits above.

11. Reference defaults were left as unrestricted owner choices. **Decision:** stable-sort by
    CDS offset, collapse only adjacent equal assertions and overwrite in surviving order,
    so the last raw assertion wins even when repeating an earlier residue; retain conflict
    and superseded application evidence, assign known CDS
    strand to covered simple intervals, accept post-label whitespace and recognized
    case-insensitive multi-letter aliases, and honor terminal TERM on a partial parent CDS.
    **You'll notice:** these covered files compute consistently with the pinned reference
    behavior while raw values remain available. **Backed by:** the function-level source
    citations in Source-settled dispositions above. **Open point:** question 4's single
    stricter verification proposal remains unapproved; unsupported short shapes, off-frame
    mapping and unknown/missing-residue X fallback are not silently made reference refusals.
