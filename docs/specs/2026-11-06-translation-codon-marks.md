---
title: "Translation track: explain each departure from the ordinary genetic code"
status: proposed
date: 2026-11-06
areas: [translation, viewer]
prs: []
issues: [253]
superseded_by: null
summary: "Codon marks retain the displayed protein and explain curated differences, initiation, applied exceptions and assumed genetic codes without relying on colour memory."
---

# Translation codon marks — PR 3

## Scope and binding decisions

This is PR 3 of [#253](https://github.com/JoaoVictorDaijo/dunceious/issues/253).
It implements the translation portion of the approved **Translation marks** mockup
(`.code/docs/translation-marks/translation-marks.html` in the primary checkout), with the
owner's subsequent [#288](https://github.com/JoaoVictorDaijo/dunceious/issues/288)
amendment: invariant codons remain solid; only code-sensitive or unresolved assumed
codons are dashed. The mockup's mixed-alignment section belongs to #286, not this PR.

Dependencies, in order:

- **PR 1, “Stored CDS translations — design”**, in
  [the stored-protein spec](2026-11-06-translation-stored-protein-provenance.md),
  implemented by merged [PR #291](https://github.com/JoaoVictorDaijo/dunceious/pull/291)
  and present through `integration/murilo-review` in this checkout: one protein in
  `metadata.translation`, read-only import provenance, recomputation after coding edits,
  conceptual comparison, counts and early-stop diagnostics.
- **PR 2, “CDS translation exceptions under NCBI code-break rules”**, in
  [the exception spec](2026-11-06-translation-transl-except.md) on `fix/cds-transl-except`
  (reviewed at `2b694fb`): consume its named **Exception evidence on every result**
  interface, carrying ordered occurrence evidence and diagnostics on both
  `ConceptualTranslation` variants. PR 3 never parses exceptions independently.
  Until PR 2 implements this interface, the merged PR 1 returns exactly
  `unavailable: 'unsupported-exception'`. Owner answers 4–6 below settle comparison,
  drop-and-compute and malformed GenBank-import refusal; the former incomplete-preview alternatives
  are superseded. Reconcile concrete status/type names with PR 2's final interface before
  implementation; dropped occurrences must stay explainable, never appear applied.
  Malformed GFF3/project import scope, foreign-accession disposition and clipped protein/frame
  remain conditional as listed under Open decisions; PR 3 chooses none of these held policies.
- **PR #295**, `fix/assumed-genetic-code`: its #288 presentation-only assumption,
  shared marker and hover machinery are already present in this checkout. Reuse them
  rather than creating a second assumed-code implementation. #261 supplies
  `initiatorResidue`, not a separate lighter-fill component.
- Structured strand-relative partial ends from #226, already a PR 1 prerequisite.

Imported curated residues stay visible. Coding edits replace/remove them under PR 1's
rules. DNA-aware diagnostics follow the conceptual protein, including PR 2 substitutions,
not the stored letters or an assumed-table view. All marks explain themselves on hover
and keyboard focus. No project-format bump or migration is introduced: the later owner
decision supersedes the contrary historical paragraph in PR 1's draft.

No source code, translation algorithm, import/export rule, count formula, qualifier editor,
or sequence persistence changes are authorized by this spec-writing task. Implementation
will add presentation provenance, drawing, chips and accessible explanations. PR 1 is
already merged into `integration/murilo-review`; merge PRs 2/3 there, then review
correctness together before develop.

## Owner decisions — 2026-11-06

These decisions bind PR 3's presentation and its PR 1/2 dependencies; they do not authorize
code changes in this documentation task. Item numbers match the owner's answers.

1. “Export genbank with trasnlation.” Keep current GenBank `/translation` on a CDS of a
   protein record. This does not bypass PR 3's protein-record gate.
   **Backed by: owner decision 2026-11-06.**
2. “ok”: GFF3 phase becomes read-only; edit the frame through `/codon_start`. PR 3 consumes
   the resulting evidence and never edits phase in the track.
   **Backed by: owner decision 2026-11-06.**
3. “when moving a cds with codebreak, when saving the modification user must be informed
   the code breakes makes no longer sense and will be removed”. On Save after move,
   reverse or reframe, remove breaks no longer naming a CDS codon and tell the user which
   entries before save completes. PR 3 refreshes evidence and notices atomically afterward.
   **Backed by: owner decision 2026-11-06.**
4. “ok”: OTHER/Xaa X matches any sense amino acid, including U/O; DNA stop still wins.
   The effective comparison set is `ACDEFGHIKLMNPQRSTVWYUO`, excluding stop. Expand stored
   B→DN, Z→EQ and J→IL and compare by set overlap; stored X retains its wildcard behavior.
   A definite effective internal stop still differs from stored X. This settles the former
   literal-X alternative; rendering consumes PR 2's sets/comparison, without a second rule.
   **Backed by: owner decision 2026-11-06.**
5. “compute protein and informe invalid codebreak will be removed”. An otherwise-valid
   but unusable entry (e.g. outside this CDS or conflicting) is dropped with a visible
   notice identifying the occurrence and reason; compute from the valid remaining entries.
   PR 3 shows that usable computed result plus the notice, with ordinary verified comparison,
   counts and marks when eligible. With stored S, the stored-first display still applies;
   the conceptual result drives comparison. This is not an incomplete preview. Never
   paint a dropped entry as an applied substitution. PR 2 owns conflict resolution and
   which occurrences survive; PR 3 consumes the surviving evidence without choosing a winner.
   **Backed by: owner decision 2026-11-06.**
6. “Reject import; prohibit silent guesses and automatic corrections, requiring strict
   compliance.” Malformed syntax/shape refuses the GenBank file and cannot be saved in the
   editor: off-frame range, part of a codon,
   short TERM on bases other than T/TA, or unknown residue name. Refusal names CDS, raw
   value and broken rule. Correct names in any capitalisation pass. This overrides #286's
   qualifier-warning-only policy for `/transl_except` alone on those routes. GenBank-refused
   inputs never reach PR 3. Malformed GFF3/project disposition remains held under
   [PR 2’s Import scope decision](https://github.com/JoaoVictorDaijo/dunceious/blob/2b694fb/docs/specs/2026-11-06-translation-transl-except.md#L534-L542):
   refusal makes them unreachable; retention requires unavailable evidence and explicit
   diagnostics, never a verified translation. Otherwise-valid unusable entries follow answer 5.
   Ambiguous classifications require an owner decision, not a guessed correction.
   **Backed by: owner decision 2026-11-06.**
7. “ok”: only this record's exact accession is accepted for local mapping. Whether a break
   naming another accession is dropped with a notice or refuses import remains on hold
   for the owner (Claude notice n1); no local substitution or foreign fetch is allowed.
   **Backed by: owner decision 2026-11-06** for exact-accession eligibility only.
8. “export anyways, but warn informing a annotation is being broke. in the exported the
   annotation start will have those identifiers to explain annotation continues/annotation
   is not finished”. Selection export proceeds with a warning and INSDC `<`/`>` markers
   at clipped CDS ends. Never copy the old full protein into a clipped CDS. The clipped
   `/translation` and frame (`/codon_start`) remain held PR 2 dependencies. PR 2’s settled
   [selection export rule](https://github.com/JoaoVictorDaijo/dunceious/blob/2b694fb/docs/specs/2026-11-06-translation-transl-except.md#L324-L353)
   removes an exception whose codon the selection destroys, with a warning naming the
   source record, CDS, original occurrence/raw value and removal reason. PR 3 consumes
   that exported evidence after reimport; this removal rule is not an open decision.
   **Backed by: owner decision 2026-11-06** for warning, partial markers and no stale full protein.
9. “The text inconsistency must be resolved using data from the original file to ensure
   validity without breaking line formatting or losing details”. Do not block representable
   values: losslessly encode GenBank qualifier quotes by doubling them and wrap so no
   continuation line begins with `/`. PR 2 owns round-trip acceptance proving no loss;
   PR 3 displays the preserved raw evidence as escaped text. A truly unrepresentable value
   needs an owner decision with a concrete example, not silent normalization.
   **Backed by: owner decision 2026-11-06.**
10. “ok”: draw unverified stored cells normally with hover/focus explanation, not lighter
    merely because verification is unavailable. This settles the former visual suggestion.
    **Backed by: owner decision 2026-11-06.**
11. “ok”: keep terminal `_` with exception/partial explanation and normal terminal styling;
    do not add the optional lighter terminal fill. This settles the former fill suggestion.
    **Backed by: owner decision 2026-11-06.**
12. “ok”: use separate lanes for overlapping CDSs, including equal letters with different
    provenance. Do not aggregate or silently overpaint feature-specific targets.
    **Backed by: owner decision 2026-11-06.**

## Scientific basis and evidence limits

Authority follows [the sequence standards order](../standards/README.md#order-of-authority):
the pinned standard text, recorded rules, then documented reference practice. Sources read:

- [NCBI gc.prt 4.6](https://ftp.ncbi.nih.gov/entrez/misc/data/gc.prt): the `ncbieaa`
  ordinary readings and `sncbieaa` Starts/stop rows for all 27 codes. Downloaded copy's
  SHA-256 matches `sources.json`: `2aecbdd09ecc5e0d233c105090a593737298ef93d88f6bc0c1bef26df6051a04`.
- [INSDC Feature Table 11.4](https://ftp.ncbi.nlm.nih.gov/genbank/docs/FTv11_4.html),
  location semantics, `/codon_start`, `/translation`, `/transl_except`, and amino-acid
  codes. Downloaded SHA-256: `5e6d03b2822d183148cd457e84030565578a7be60e440a8499381a913e75415e`,
  matching the pin. `/translation` includes qualified exceptions; ordinary codon translation
  alone is not the complete biological comparison.
- [NCBI C++ Toolkit `912b751`, `x_Translate`](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objmgr/util/sequence.cpp#L3670),
  source inspected: complete 5′ end and frame zero gate initiation; leftover bases are
  padded for translation; complete 3′ ends govern dual-use terminal stops. These belong
  to PR 1, not an alternate translator in the viewer.

Recorded rules used: [TRANS-1](../standards/translation.md#trans-1-genetic-code-from-transl_table),
[TRANS-2](../standards/translation.md#trans-2-codon_start),
[TRANS-3](../standards/translation.md#trans-3-alternative-initiation-codons),
[TRANS-4](../standards/translation.md#trans-4-transl_except),
[ALPHA-1](../standards/alphabets-and-coordinates.md#alpha-1-nucleotide-ambiguity-codes-t-and-u),
[OP-8](../standards/operations.md#op-8-biological-codons-and-display-frames), and
[OP-21](../standards/operations.md#op-21-ordinary-translation-and-biological-recoding).
PRs 1, 2 and #295 own their pending rule updates; PR 3 adds no biological convention
requiring a separate standards rule. The present standards record still describes some
predecessor behavior; it must not override those binding owner decisions.

The validation table below is **hand-derived**, not an executed reference-tool run.
No table2asn, asn2gb, EMBOSS or Biopython translation was executed for this spec.
The genetic-code page confirms initiation and the RNA alphabet convention
([NCBI Genetic Codes](https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi)).
Neither a standard nor a translator specifies a viewer's marker glyph, hover interaction,
or precedence: those come from the owner/mockup. Unsettled additions are explicitly open.
All future runtime computation stays local; reference validation uses synthetic fixtures.

## Model extension and ownership

Extend PR 1's **`ConceptualTranslation`** successful variant with per-codon provenance,
produced during `conceptualTranslation(feature, record)` and cached with its result.
Do not replace `residues`, `possible`, `internalStops` or `threePrimeIndeterminate`, or
reinterpret any unavailable reason. Each provenance entry contains:

- `codonIndex`: zero-based translation order, after segment evaluation, strand and phase;
- the actual coding triplet (preserve U for display), biological record-base indices in
  translation order, and actual length (one, two or three; padding is never a record base);
- ordinary table reading and possible-residue set **before initiation and exceptions**;
- contextual reading and possible set **after initiation, before exceptions**, including
  the initiation attempt even when an exception overrides it;
- effective reading and possible set **after** PR 2's applied exception and terminal context;
- whether initiation changed the ordinary reading and whether an exception changed the
  pre-exception contextual reading; the applied exception's original qualifier,
  mapped position and replacement if any; and terminal-stop/partial-end provenance.

This is derived evidence, not a second stored protein. Include a dropped terminal stop
in provenance with no protein index; otherwise its slot could become a false length
mismatch. PR 2 must supply the applied exception evidence from its own mapper, including
partial TERM. Consume PR 2's named **Exception evidence on every result** interface: feature identity,
occurrence index/raw value, mapped bases and pre-removal codon index, replacement,
application status and reason (including dropped/unusable evidence under answer 5),
diagnostics and terminal-removal flag. Keep failed/deferred evidence on unavailable results
too, and dropped-entry notices on successful results. Concrete helper names remain PR 2's
implementation choice; do not invent another mapper here.

**`conceptualTranslation`** remains the sole effective translator. **`initiatorResidue`**
remains the sole Starts-row lookup (currently in `src/domain/bio/sequence.ts`, exported
through `index.ts`); it must not be copied into rendering. Only codon 1 of a known
5′-complete CDS with `/codon_start=1` is eligible. A literal exact triplet is required by
PR 1; internal GTG stays V under table 11. Prefer the stored first residue when present.

**`compareTranslation(stored, conceptual)`** retains PR 1's definite-stop/disagreement policy
and its `differing`, `storedExtra`, `storedShortBy` outputs; its comparison is against
effective, not ordinary, readings. Attach the codon provenance to a presentation result
with PR 2's owner-settled OTHER/Xaa sense-set comparison (answer 4). A definite effective
internal stop overrides stored X:
retain X, but include its index in `differing`. Otherwise stored X is a wildcard. An
ambiguous coding triplet compatible with the stored residue is not a curated difference.
An applied exception agreeing with the annotation is not added to `differing`.

**`storedTranslation(feature)`** remains the one accessor. No `feature.translation`,
qualifier duplicate, second editable protein, or persistent marks are added.
**`isCds`** gates curated CDS comparison; existing ORF eligibility and six-frame/context-free
translation remain separate. **`saveEditedFeature`** and PR 1's `_translationCheck`
invalidation remain authoritative; geometry, strand, phase, code, ends, exception or record
sequence changes rebuild evidence before publishing it. Name/colour-only edits do not
change comparison. A stale mark must never survive beside a new protein.

Keep biological provenance in domain. A pure app/viewer projection maps it to states,
tooltip data and gap-split geometry adapted from `codonSpans`; React/DOM/canvas stays in app. No reverse
dependency from domain to viewer. `SequenceTrack.tsx`, `cds.ts`, `TrackTooltip.tsx` and
the feature tooltip consume this projection, including the same mismatch count.

**Shared marker reuse:** #295's `AssumedTranslation`, `assumedTranslation`,
`assumedInitiationContext` and `assumedCodonDescription` remain the assumption authority.
Its `SequenceTrack` `dashed` branch is the existing marker: 1 px stroke, `[3, 2]` dash,
strand-coloured text, red `*` for an assumed stop, reset line dash after drawing. Its
`AssumedHoverSpan` / max-end hover index supports exact visible-piece lookup. Generalize
that presentation path for these states; do not duplicate it. The lighter curated fill
comes from the approved mockup (white base plus strand alpha .28); no named lighter-fill
helper exists in the inspected code. Factor shared styling within app when implementing.
The merged `SequenceTrack` already uses `storedTranslation` for stored-length reads; preserve it.

### Extension points checked against the merged PR 1 code

Inspected this checkout at `db5f958` (merge of `integration/murilo-review`), rather than
assuming the earlier PR 1 draft or unmerged #295 source is still the implementation.
These are planned extensions, not claims that the new marks already exist:

| Actual function / type | Current behavior and required extension |
|---|---|
| `ConceptualTranslation` in `src/domain/bio/types.ts`; `conceptualTranslation` in `src/domain/bio/translation.ts` | The successful type already has `alignedIndices`; preserve it. The translator currently rejects any present `transl_except` before geometry, then computes contextual sets, retained padded fragments and removes a definite terminal stop. PR 2 replaces that exception gate. Add ordinary/contextual/effective provenance during this same traversal, before terminal removal, preserving real bases for removed stops and retained fragments. Never reconstruct them from the shortened `alignedIndices` alone. |
| `compareTranslation` in `translation.ts` | Currently checks literal equality, stored X and membership in `possible`; definite `*` wins over X. PR 2 must supply OTHER/Xaa sense sets and the owner-approved B/Z/J set-overlap comparison. PR 3 consumes `differing`, `storedExtra`, `storedShortBy`; it does not implement comparison in canvas. |
| `checkTranslation`, `checkedTranslation` in `translation.ts` | `checkTranslation` serializes conceptual/comparison evidence into `_translationCheck`; `checkedTranslation` reads it, falling back to computation if absent/unparseable. Extend the cached result with provenance and PR 2 occurrence diagnostics, including successful-result drop notices. Preserve import/save/load invalidation ownership; no pan-time retranslation. |
| `translationReason`, `translationDescription`, `translationWarning` in `translation.ts` | Reuse the primary unavailable reason and shared difference/length wording. Extend description/reason inputs for PR 2 diagnostics and dropped-entry explanations without calling a usable computed result unavailable; retain `/exception` file-warning suppression in `translationWarning`. |
| `SequenceTrack` in `src/app/viewer/tracks/SequenceTrack.tsx` | Its translation `useEffect` currently combines `translateFeature` fallback, `checkedTranslation` and stored letters, then loops only full triplets. Replace this cell-selection/drawing path with the provenance projection: no valid-code computed tail after short S, no unavailable fallback presented as verified, normal unverified stored cells when the independent geometry gate passes, retained partial/terminal targets and discrepancy chips. The current early return for `unknown-completeness` needs the separate geometry decision described above, rather than suppressing every stored cell automatically. Preserve the ORF path separately. |
| `indexAssumedHovers`, `visibleAssumedHovers` and `AssumedHoverSpan` in `SequenceTrack.tsx` | Generalize the existing max-end index and visible overlay buttons for marked, normal-unverified, partial and terminal explanations. Reuse `assumedViews`, its `dashed` drawing branch and `assumedHoverIndex` memoization; coordinate tooltip invalidation with evidence/mapping revisions. These are existing helpers/memo values, not a new exception parser. |
| `codonSpans`, `codonFrame`, `assignTranslationLanes` in `src/app/viewer/cds.ts` | Extend `codonSpans` to split on display gaps as well as biological discontinuity; preserve `codonFrame`'s biological-anchor rule. Extend `assignTranslationLanes` occupancy to retained fragments, terminal targets and chips. Remove its `p.frame === unit.frame` collision exemption for distinct overlapping CDSs: owner answer 12 requires separate lanes even in the same frame and with equal letters. Keep stable whole-record packing and independent strands. |
| `computeBrokenFeatureMap`, `geneticCodeWarning`, `assumedCodonDescription` in `cds.ts` | `computeBrokenFeatureMap` already delegates CDS stop status to DNA-aware `isFeatureBroken` and preserves ORF policy. Feed effective PR 2 results through that authority; never infer stops from displayed stored letters or dropped entries. Preserve `geneticCodeWarning` and `assumedCodonDescription` for the assumed view, adding the shared unavailable/drop explanations through the projection rather than duplicating genetic-code logic. |

## Per-residue states and explanations

Before projection or nucleotide geometry work, apply PR 1's **step 0 record-type gate**:
`record.moleculeType === 'protein'` / `unavailable: 'protein-record'` excludes the record.
No lane, cells, chips, codon hover/focus targets or assumed-table fallback are permitted,
even with local geometry, stored protein, invalid code or exception evidence. Details/copy
retain the imported protein/source and explain that nucleotide translation is not applicable;
no conceptual count, early-stop or DNA-mismatch claim is made. The gate is per record,
including mixed sessions, and applies after cache discard/recheck on project reload before
publication. Never redetect a declared protein's alphabet to bypass it.

For nucleotide records, require PR 1's known biological strand, a location satisfying
`definesOneSequence(feature)` and a validated extraction/base map establishing codon geometry.
Unknown strand (including GFF3 `.`/`?`), `order()` and remote/nonlocal locations have **no
codon lane, cells, chips or codon hover/focus targets**, even with stored protein. Feature
details retain the stored value, primary unavailable reason and exception diagnostics.
Other unavailable reasons (excluding `protein-record`) permit unverified **stored** cells
only if this geometry gate independently passes. With no S and unavailable C, there is no
D: draw no codon cells or codon targets; expose the reason/occurrence evidence through
the feature warning/details. The sole exception is #295's invalid-code assumed view on
eligible nucleotide records, which supplies its own explicit assumed D. No unavailable
result supplies a verified length, discrepancy chip, terminal glyph or early-stop mark.
A short stored protein in a non-invalid-code unavailable result shows only its stored
cells, no computed tail or length chip; feature details explain why the tail cannot be
checked. A dropped otherwise-valid break does not itself make C unavailable: under answer 5,
consume the computed result from remaining valid entries and show its drop notice in
feature details/warning and relevant explanations. The notice names the raw occurrence
and reason; do not imply that every requested exception was applied. Malformed GenBank
entries are refused under answer 6. For each held GFF3/project route, if PR 2 chooses
refusal, malformed entries never reach this projection. If PR 2 retains them, consume its
unavailable result and diagnostics: show normal unverified stored cells only when the
geometry gate passes, each explaining why verification is unavailable; without S show no
cells or computed/assumed tail. Feature warning/details name the route, CDS, original
occurrence/raw value and broken rule. Never treat the valid subset as a verified result,
mark a malformed occurrence applied, or emit a verified count, mismatch/length chip,
terminal glyph or early-stop claim. Preserve any primary eligibility failure and its
occurrence diagnostics; invalid-code assumptions cannot bypass this malformed-break gate.
Missing completeness is never inferred from a false partial-end accessor.

For each eligible codon let S be the stored residue if present, O its ordinary code reading,
I its contextual reading after initiation but before exceptions, and C its effective
conceptual reading after exceptions and terminal context. D is the displayed residue: S when present, otherwise C,
except PR 1's valid-code short-protein contract below: unmatched tails have no cells,
including when a tail position is an internal stop. Definite mismatch is membership in
`compareTranslation(...).differing`, never merely `S !== O`. All stated predicates use
provenance, not canvas pixels, protein substring alignment or a second translation.

Colours are existing forward `#475569`, reverse `#be185d`, early stop `#ef4444`; no new hue.
Normal cells use alpha .9 and white text. Lighter cells have an opaque white base, strand
fill alpha .28, strand text and the .5 px white cell hairline. Values are mockup CSS-pixel
dimensions/opacity, not biological metrics. The edge facing bases is bottom on the
forward band and top on the reverse band, in every lane.

Every table row specifies a tooltip template. `{i}` is codonIndex + 1, `{bases}` lists
actual one-based record positions in coding order (ranges where contiguous), `{table}` is
the selected NCBI id, and residue names use the existing amino-acid vocabulary, including
Sec/U, Pyl/O, ambiguity codes and “stop”. Prefix each accessible name with
“{feature}, {forward/reverse} strand, codon {i}, bases {bases}.” Then use the tooltip's
full plain text; do not announce colour as meaning. Tooltips also show that coordinate
prefix. Marked states never require remembering a legend.

| State | Exact trigger | Visual | Tooltip body and accessible text after the common prefix |
|---|---|---|---|
| Ordinary agreement | Available C; no definite mismatch and no initiation change O→I and no exception change I→C | Normal cell; no warning | “{D} ({name}). {triplet} reads {C} under table {table}.” One keyboard stop per visible logical codon, including ordinary cells; append no-op exception or uncertainty evidence when present. |
| Curated difference | S exists and index is in `differing`; C is not a definite internal stop | Lighter cell, retain S | “Annotated {S} ({name}). {triplet} ordinarily reads {O} under table {table}; the effective conceptual reading is {C} ({name}). Stored /translation differs here.” Include initiation/exception provenance when it changes the reading. For ambiguous O/C name the possible readings, not a single definite residue. |
| DNA stop hidden by annotation | Definite effective internal stop at index and S is any non-stop residue, including X | Lighter S cell plus 3 px red base-facing edge | “Annotated {S} ({name}). {effective-stop explanation} Early stop in the conceptual CDS; the annotation has a residue here.” |
| Verified early stop | Definite effective internal stop; S is `*`, or no stored protein exists at all (not a missing slot of a short stored protein) | Existing solid red cell with white `!` | “Early stop before the end of the CDS. {effective-stop explanation}” |
| Compatible stored unknown with contextual substitution | Available C; S=X, no definite mismatch, and initiation changed O→I or an applied exception changed I→C | Shared lighter cell, retain literal X; zero mismatch contribution | “Annotated X (unknown).” Then explain ordinary O, contextual I and effective C with the initiation and/or qualifier text below. Say “The conceptual reading is {C}; the stored residue remains unknown.” Never call X Met/Sec or claim the annotation agrees with a specific residue. |
| Initiator substitution | Known complete codon 1, `/codon_start=1`, exact Starts-row M and ordinary reading differs from M; D is M and no mismatch | Shared lighter cell, M retained | “Initiator M (Met). {triplet} ordinarily reads {O} under table {table}; a complete CDS starts with M at this codon.” This is valid initiation, not a curated mismatch. |
| Applied exception substitution | PR 2 reports an applied exception changing I (the contextual pre-exception reading); D is comparison-compatible with the effective result, no mismatch | Shared lighter cell, effective/stored letter retained | “Translation exception: {qualifier}. {triplet} ordinarily reads {O} under table {table}; before the exception the contextual reading is {I}; the annotated exception specifies {C} ({name}).” If initiation changed O→I, say it was overridden. For OTHER/Xaa, explain “unspecified sense amino acid”; retain the literal stored letter without claiming a specifically confirmed residue. Do not claim experimentally verified recoding. |
| Assumed invariant | Invalid code, no S at this index; #295 supplies a resolved invariant residue | Reuse #295 normal solid cell | “{D}, assuming table 1. {triplet} reads {D} in every NCBI code. /transl_table={value} is not an NCBI genetic code.” Resolved IUPAC: “Every reading of {triplet} is {D} in every NCBI code.” |
| Assumed code-sensitive | Invalid code, no S; #295 `codeSensitive` or unresolved `?` | Reuse dashed marker, no new lighter warning fill; strand letter, red `*` for definite assumed stop, never `!` | Use `assumedCodonDescription`: “{triplet}: {D}, assuming table 1”, followed by other readings with table ids; unresolved triplets name their table-1 possibilities and whether codes differ. Include invalid qualifier value. |
| Unverified stored residue | S exists, geometry gate passes, but conceptual result unavailable | Normal stored cell, retain S, feature warning and hover/focus targets; no definite curated-difference or early-stop mark | “Annotated {S} ({name}). Cannot check against DNA: {reason}.” Reasons explicitly name invalid code or unapplied exception. S never inherits an assumed-table dashed mark. Normal styling is settled by owner answer 10; unavailability alone never selects lighter fill. |

The **effective-stop explanation** is shared by hidden-stop, stored-X and verified-stop
states. Without a stop-producing exception: “{triplet} reads a stop under table {table}”.
With one: “{triplet} ordinarily reads {O} under table {table}; the contextual reading before
the exception is {I}. Translation exception {qualifier} specifies stop.” Include overridden
initiation when relevant. Never say a sense triplet such as AAA ordinarily reads stop.
Stored X uses the lighter X cell plus base-facing stop edge and “Annotated X (unknown)”
followed by this same explanation. It **is** a definite mismatch and contributes one to
`differing.length`. A stored `*` at an effective sense codon is a curated difference with
literal `*`, not a verified `!`.

For **every retained codon** whose effective possibilities are not a singleton, append the
possible readings to its explanation, even when S is compatible and the cell is ordinary.
When `threePrimeIndeterminate` is true, both the feature/count explanation and the relevant
last-codon explanation explicitly say “End uncertain: {triplet} may read {possibilities},
including a terminal stop; this position is retained.” Do not present X as the sole
biological possibility, assert a definite stop, draw `_`/`!`, or add a stop edge. This also
applies to compatible stored residues, e.g. table-28 TAN with S=Y and effective {stop,Y}.
Uncertainty is independent of mismatch classification and does not itself add a difference.
The retained-X styling follows the mockup's shared lighter contextual-substitution mark
and PR 1's stored-first/wildcard contract: the mark explains the conceptual change, while
the literal X and tooltip preserve the annotation's uncertainty. It is not a difference mark.

An exception is a no-op only when it leaves I unchanged; O=C alone is insufficient.
A GTG start with aa:Val has O=V, I=M, C=V: lighter V, explaining initiation then its override.
An actual no-op exception has no lighter substitution mark; its ordinary tooltip still
names the qualifier. An ordinary ATG→M has no initiator substitution mark. A terminal stop
is the existing terminal glyph `_`, never `!` or a curated mismatch just because stored
proteins omit it. Applied terminal TERM similarly gets an exception explanation at the
terminal slot, not an internal-stop edge.

**Precedence and composition, highest first:**

1. The record-type and geometry gates precede all states. Short stored unmatched tails
   are excluded before selecting stop or substitution states. For eligible geometry, unavailable comparison suppresses all definite mismatch/early-stop claims; invalid-code
   slots without S use #295's assumed state. Do not compare to assumed table 1.
2. Effective internal stop selects hidden-stop (including X) or verified-stop state, with the cause-specific explanation above.
   Raw ordinary stops replaced by a valid PR 2 exception are not early stops.
3. Definite curated mismatch selects lighter S, even if initiation or an exception also
   applies. Tooltip adds “Expected {C} after initiation/exception” and its provenance.
4. Compatible stored X with contextual substitution selects the retained-X state first.
   Otherwise applied exception changing I, then initiator substitution selects the lighter explained state.
   If both apply, show both explanations; PR 2's effective output settles the residue.
5. Otherwise ordinary agreement. Search and focus decorations overlay every state; they
   never replace biological explanations or count as mismatch states.

If `/exception` exists, append “Annotated exception: {value}” to affected explanations;
PR 1's suppression of the file-level mismatch warning does not suppress these marks.
The generic warning target must not cover the more specific codon target.

## Length chips, partial ends and mapping

Use PR 1's `storedExtra` and `storedShortBy`, only with an available comparison. Extra
stored residues have no genomic positions and never become invented codon cells. Short
stored proteins get no invented tail: valid-code missing slots have **no codon cell, glyph
or codon target**, including `!` for a conceptual internal stop. The chip explains them.
DNA-driven internal-stop status/count remains available in feature/hub explanations and
the length-chip tooltip, naming the stop codon number, real bases and cause; no unmatched
residue is painted to make that diagnostic discoverable. For `ATGTAAGGGTAA`, S=`M`,
conceptual `M*G`, show M and `−2 positions`, no cells at positions 2/3; feature/hub/chip
text reports “3 positions, 1 internal stop”, codon 2/bases 4..6/TAA under table 11, and
the length clause (no zero-codon mismatch clause). Without any stored protein, draw the conceptual
protein normally and no length-difference chip. Invalid-code short tails instead follow
#295's explicitly assumed-tail contract; no `storedShortBy` is inferred from a guess.

Draw the mockup's outlined rounded chip, white background and strand text, after the
last biological codon in translation direction (left of the last reverse codon). It is
not in the next codon slot. `+N positions` means exactly `storedExtra.length`;
`−N positions` means exactly `storedShortBy`, excluding the terminal stop. Use the singular
`position` for N=1. **Every discrepancy chip uses translation-position units**, including
stop-free proteins; this supersedes the mockup's `aa` text under PR 1's contract.
Tooltip/accessibility text:
“Annotated protein is N translation positions longer/shorter than the DNA-derived protein
(terminal stop excluded). Stored residues past the last translated position: {extra}”
or “N DNA-derived positions have no annotated residue.” Use singular grammar for N=1.
For long extras, keep the tooltip bounded to the available viewport: show the exact total,
a fitting prefix with explicit “Preview; complete list in feature details” text, and no
interactive or scrollable tooltip content. The complete ordered list remains available
in feature details with translation-position numbers and literal residues, including its
final residue; never truncate that list. The chip is an actionable button named
“{feature}: show all N extra stored translation positions in feature details”. Pointer
activation or Enter/Space opens that feature's details at the complete-list section and
moves focus to its labelled heading. Provide the same labelled action alongside the
feature's length summary, so the list is reachable when the chip is offscreen or hidden
at overview zoom. Details support pointer scrolling and a keyboard-focusable list region
with Arrow/Page/End navigation to the final entry; closing details returns focus to the
invoking control if still present, otherwise the feature's surviving details control.

This uses the existing [`TooltipLayer`](../../src/app/components/TooltipLayer.tsx) as a
noninteractive summary: it renders `pointer-events-none`, closes on pointer press and
focus loss, and captures scroll to dismiss. Preserve those rules; a link inside the tooltip
or overflow styling alone cannot provide the complete-list route. Opening details may
dismiss the tooltip normally; the list belongs to the details surface and remains usable
independently of the tooltip's lifetime.

Feature/hub explanations and every discrepancy codon/chip tooltip use a shared summary:
“Annotation differs from DNA at N codons” only when `differing.length > 0`, followed by
“Annotated protein is N translation positions longer/shorter than the DNA-derived protein”
when `storedExtra.length > 0` or `storedShortBy > 0`. Include length-only discrepancies;
never say “differs at 0 codons”. Include both clauses for combined discrepancies. The
codon count excludes valid initiation, agreeing exceptions, ordinary-residue wildcard X
and unmatched tails; it includes effective internal stops against stored X. Each discrepant
CDS counts once for PR 1's file warning, subject to `/exception` suppression; suppression
never removes these explanations. Reuse PR 1's DNA count and #295's unverified hub number
(italic, dotted underline, explanatory footnote), rather than the mockup's older plain count.

Mapping uses extraction provenance, with no genomic endpoint subtraction. **Adapt
`codonSpans` for translation paint/targets:** its current biological-adjacency test merges
across inserted alignment gaps and is insufficient. Each piece must have both consecutive
biological bases and consecutive display columns (absolute step 1 in coding order); split
at either discontinuity. All fills/hairlines/edges, search outlines and pointer targets use
these actual-base pieces, including assumed/terminal/padded states. Never bridge a gap with
a rectangular hit box; one logical keyboard stop may own multiple pointer pieces.
This changes translation geometry, not annotation bars. Replace the contrary assertion in
`SequenceTrack.test.tsx`, “renders codons across gaps in the same biological frame”:
at 20 px/base, `--A-TG-AAA-TAA--` codon 1 occupies zero-based columns [2,3) and [4,6),
rectangles x=40,width=20 and x=80,width=40, not x=40,width=80. Codons 2/3 remain [7,10)
and [11,14); M anchors on [4,6). A search hit confined to gap column 3 adds no codon
outline/target; a hit on column 4 outlines only its real-base overlap. Check both pointer
pieces, gap misses and one keyboard stop, preserving frame, label, lane and reverse rules.
Split/joined, circular and alignment-gap codons get the same state on every actual piece;
never paint introns or gaps. One residue letter appears on the existing longest-piece
label anchor, deterministic in a tie. All pieces point to the same codon explanation.
Reverse complementation happens before comparison. A reverse codon label remains upright,
and codon 1 starts at the biological 5′ end, not the lowest screen coordinate.

Skip phase-leading bases; no codon number or mark is attached to them. PR 3 owns the
**padded-codon display and target**: when PR 1 retains a final one/two-base padded residue,
render its normal/curated/exception state over exactly those actual bases at the existing
band height, with one upright letter at the longest actual-piece anchor (stable tie rule
as above). Its pointer target is the union of actual pieces, with one keyboard target;
no synthetic padding extends paint or hit area. Include the fragment in the visible-piece
index and lane occupancy even though existing complete-triplet loops omit it. The tooltip
prefix lists only real positions, followed by “Partial codon {fragment}; padded with
{one/two} N bases to {paddedTriplet} for conceptual translation; {C} under table {table}”,
plus stored comparison and exception provenance when applicable. This is a retained
translation position for length comparison. If PR 1 drops an unresolved fragment, invent
no cell, residue, codon target or length position; the feature tooltip explains the dropped
fragment and `threePrimeIndeterminate` if reported.

PR 2's removed partial TERM retains its pre-removal codon index and real one/two bases:
use the existing terminal `_` slot over only those bases, with pointer targets on its pieces
and one keyboard target. Explain the actual fragment, ordinary padded reading, qualifier
and exception-specified terminal stop; do not claim absent bases exist in the record or
that the table alone produced the stop. It adds no protein position, mismatch or internal-stop
edge. Retain normal terminal styling and `_` with the explanation, per owner answer 11;
no optional lighter terminal fill. A 5′ partial end disables initiator substitution; a 3′ partial end
disables complete-end dual-stop reinterpretation. Empty CDS/no coding bases has no cells/chip,
and its feature warning says why comparison is unavailable; never manufacture a `+N`.

## Zoom, interaction and exact rendering performance

Preserve `TRANSLATION_MIN_ZOOM=5` and the existing strict `zoomLevel >` visibility rule.
At/below 5 px/base, translation off, or protein-record mode: no translation cells, chips,
or invisible focus targets. The feature/hub tooltip continues to explain provenance and
unavailability at overview zoom. Above 5, draw all visible codon states and their glyphs
at the existing 9 px translation font; the nucleotide letter threshold of 12 px/base does
not suppress translation marks. At higher zoom, including the mockup's 20 px/base,
geometry simply scales. At 5, just above 5, 12, just above 12 and 20 the biological state
and tooltip content are identical whenever the band is visible. Reduced motion preserves
the current transition suppression. No sampling/density heuristic is added.

Opaque white beneath lighter cells prevents search backgrounds turning them amber. Draw
the search-hit outline again over the marked cell's actual overlap, including a hit on
only one base. Reuse active/inactive and forward/reverse search colours/widths. Keep the
red stop edge visible inside the outline and the focus ring outside it. #295 dashed
assumed cells retain their existing transparent-interior/search behavior. Use canvas
save/restore so dash, alpha or line width cannot leak into the next cell.

Canvas remains noninteractive/hidden from accessibility. Reuse viewport-clipped overlay
buttons and existing tooltip infrastructure. Pointer hover and keyboard focus show the
same content; Escape dismisses, focus ring is visible, and blur removes it. Associate
the tooltip through `aria-describedby`; escape all imported qualifier/name/residue text.
Every visible logical codon has exactly one focusable overlay button, including ordinary
agreement, no-op exception provenance, compatible ambiguity/end uncertainty, unverified
stored cells and terminal `_`; visible chips each have one button too. This policy does
not depend on colour, mismatch status or the presence of a distinct explanation. Targets
are ordered by the stable feature/lane order, then biological codon order on both strands;
endpoint chips follow their feature’s codon targets. Overlapping CDSs retain separate
feature/codon identities even for identical letters and ordinary styling. Only targets
with a visible painted piece in an eligible translation band exist; unmatched tails,
dropped fragments and geometry-gated features get none. Split pieces share one keyboard
stop with pointer targets on all pieces, never a separate stop per piece.
When a chip's biological endpoint is offscreen, do not pin it to an unrelated viewport
edge; its information remains in the feature tooltip. Reserve chip geometry so it does not cover neighboring CDS cells or intercept their targets.

**Tooltip lifecycle is part of the displayed-evidence contract.** The current
[`TooltipLayer`](../../src/app/components/TooltipLayer.tsx) reads `data-tip`, shortcut
and `getBoundingClientRect()` only when opening; changing attributes or removing a target
does not update its snapshot. Existing Escape/blur/scroll/resize handlers alone cannot
protect a tooltip during recomputation or a canvas pan. Extend the shared infrastructure
with an explicit invalidation notification from the renderer, covering codon, terminal,
chip and feature explanations (including the hub's feature/count targets):

- Before publishing a changed evidence revision, dismiss any active explanation for the
  affected feature, even when its DOM element, focus and displayed letter are unchanged.
  Revisions include changed stored/computed residues, availability, comparisons, counts
  and exception/provenance evidence; the next opening reads only the new revision.
- Dismiss before an active target is removed, replaced, recycled for another logical
  feature/codon, or made ineligible/invisible. Stable identity includes record, feature
  and logical codon or chip identity; reusing a DOM node does not preserve that identity.
- Dismiss before its anchor geometry changes, including pan, zoom, alignment remapping,
  lane repacking and viewport/vertical clipping, even if the target remains visible and
  no native scroll, pointer or focus event occurs. A geometry-only change does not
  invalidate biological evidence.

Each dismissal cancels any delayed opening, clears tooltip content/position and removes
the old target's `aria-describedby`, including from a detached/replaced node. A cancelled
callback must not reopen an obsolete explanation. Invalidation and the new marks/targets
must be committed before the next paint, so old text/anchors cannot accompany new evidence
or geometry. Keep keyboard focus on a surviving eligible target; if it disappears, leave
no hidden focusable surrogate. A tooltip opens again only on a subsequent qualifying
hover/focus interaction using current text and bounds; invalidation itself does not reopen
it or move focus. These are required renderer-to-tooltip notifications, not a reliance on
attribute mutation, blur or a fresh pointer event to detect staleness.

**Feature-specific overlap is a layout contract**, not just a chip concern. Existing
`assignTranslationLanes` (`src/app/viewer/cds.ts`) permits overlapping same-frame units
in one lane; that cannot expose distinct proteins or exception explanations. Never paint
competing residues at the same pixels with a last-drawn-wins target. Each feature's residue,
mark and full provenance must remain independently discoverable by pointer and keyboard,
including agreement versus mismatch and equal letters with different exception provenance.
Owner answer 12 selects separate lanes for overlapping CDSs, including equal letters
with distinct provenance; no aggregate chooser is used. Packing includes retained partial pieces, terminal targets
and chips, uses whole-record stable ordering independent of pan, and preserves visible-only
rendering with no lane cap that hides evidence.

[#300](https://github.com/JoaoVictorDaijo/dunceious/issues/300) measured full interval scans
on dense quantitative tracks; its lane-canvas limit also matters here. This PR must not add
one full-record DOM node per residue or repeat translation/IUPAC expansion during pan.
Keep biological evidence and display geometry on separate invalidation lifecycles.
Build translation evidence when biological inputs change. From that evidence and the
current raw-base-to-display-column mapping, build actual display pieces, their exact
overlap index and whole-record lane occupancy, including padded/terminal pieces and chips;
reuse/generalize #295's max-end index for drawing as well as hover. An alignment-only
change invalidates all three display structures independently of biological evidence.
[`applyFastaResponse`](../../src/app/logic/bioResponse.ts)'s accepted overlay replaces
`alignedSequence` while preserving raw `sequence` and CDS features; identical raw inputs,
CDS identity or alignment length therefore cannot serve as a display-cache key. Track the
effective mapping revision, including gap relocation, alignment addition/removal and
switching between aligned and raw display. Reuse conceptual translation, comparison and
exception evidence when their biological inputs are unchanged; do not retranslate merely
to invalidate geometry. Publish rebuilt pieces, index, occupancy, canvas and pointer/focus
targets together for the same evidence/mapping revision, dismissing affected tooltips
through the lifecycle above. Never paint a new alignment with old hit/keyboard geometry
or allow a superseded rebuild to restore it. Pan/zoom alone query the existing column
index and update pixel bounds/visible targets without rebuilding whole-record evidence
or packing. Redraw queries
visible pieces, draws each exact result, and creates only visible targets. Complexity is
one evidence pass per biologically changed CDS plus display/index/packing construction
per changed mapping or relevant evidence, then indexed viewport lookup
and work proportional to returned pieces. No result cap, skipped lane, sampling, or
silently merged warning cells. Memory grows with codon evidence, not zoom/number of pans.
Clip canvas allocation to the visible vertical area for deep lanes; retain logical lane
coordinates in hit testing. If existing layout prevents this, record an explicit #300
integration blocker rather than hiding lanes or claiming dense correctness.

## Independent-oracle validation table

Fixtures below use INSDC one-based inclusive locations and codon numbers. Unless stated,
whole record CDS, forward, complete ends, `/codon_start=1`, table 11. S denotes stored
`/translation`; “none” means no stored qualifier. `G` means a hand lookup of gc.prt 4.6
in TCAG order (the pinned file above), not a call to Dunceious. `F` means a hand application
of INSDC FT 11.4 location/qualifier text. These oracles establish biology; the approved
mockup plus owner decisions establish its mapping to the expected named marks.

| Input record / qualifiers | Residue / independently expected reading | Expected mark | Independent oracle / derivation |
|---|---|---|---|
| `ATGAGATAA`, S=`MK` | 2: AGA→R, stored K | Curated difference, K | G table 11 AGA=R; terminal TAA omitted |
| `ATGTGAGCTTAA`, S=`MWA` | 2: TGA→stop before A | DNA stop hidden by annotation, W + base-facing edge | G table 11 TGA=`*`, GCT=A; stop is internal |
| same DNA, S=`M*A`, or none | 2: effective stop | Verified early stop `!` | G same lookup; no stored disagreement for `*` |
| same DNA, S=`MXA` | 2: stored unknown, definite DNA stop | Lighter X + stop edge; differing=[1], count 1 | G stop plus PR 1's definite-stop precedence over X |
| `GTGAAATAA`, S=`MK`, or none | 1: O=V, C=M | Initiator substitution, lighter M | G table 11 GTG ncbieaa=V / Starts=M; F complete frame 1 |
| `GTGAAATAA`, S=`XK` | 1: O=V, I=C=M; stored X is wildcard | Lighter literal X; unknown + valid initiated M explanation, differing=[], no stop edge | G table 11 GTG V/Starts M; PR 1 wildcard and stored-first rule |
| `GTGAAATAA`, S=`VK` | 1: expected M, stored V | Curated difference V; initiation explanation included | G/F previous derivation; S disagrees with effective M |
| `GTGAAATAA`, `<1..9`, S=`VK` | 1: GTG→V | Ordinary agreement, no initiator mark | G V, F partial 5′ excludes initiation; NCBI `912b751` gate |
| `AGTGAAATAA`, `<1..10`, `/codon_start=2`, S=`VK` | 1 after skipped A: GTG→V | No mark on skipped A, ordinary V | F offset 2 skips one base; G internal GTG=V |
| `ATGGTGTAA`, S=`MV` | 2: internal GTG→V | Ordinary agreement | G table 11 ncbieaa=V; Starts not applied internally |
| `augagauaa`, RNA, S=`MK` | 2: AGA→R | Curated difference K, RNA triplet text | G table 11 plus NCBI U/T alphabet convention |
| `TTA TCACAT` (spaces removed), `complement(1..9)`, S=`MW` | Biological sequence ATG TGA TAA; 2 at bases 6,5,4: stop | Hidden-stop W; red edge on top of reverse band | F reverse complement; G TGA=`*` |
| `TTATTTCAC`, `complement(1..9)`, S=`MK` | Biological GTG AAA TAA, 1: M | Initiator substitution at bases 9,8,7 | F reverse complement, G table 11 Starts GTG=M |
| same record, `complement(1..>9)`, S=`VK` | Biological 5′ partial; GTG→V | Ordinary V, no initiator mark | F `>9` is biological 5′ end on complement; G V |
| `ATGGCNTAA`, S=`MA` | 2: GCA/GCC/GCG/GCT all A | Ordinary agreement | G four explicit table-11 alanine codons |
| `ATGAANTAA`, S=`MK`; separately S=`MW` | 2: AAA/AAG K; AAC/AAT N; conceptual X | No mismatch for K; normal K has one keyboard stop exposing {K,N} uncertainty; curated W difference | G enumeration gives {K,N}; PR 1 membership comparison |
| `ATGNNNTAA`, S=`MX` | 2: unknown | No definite mismatch | G 64 codons mix readings; PR 1 X policy |
| `ATGTGAGCTTAA`, S=`MUA`, `/transl_except=(pos:4..6,aa:Sec)` | 2: O=stop, C=U | Applied exception substitution U; no early stop | G TGA=`*`; F Sec=U exception substitution |
| `ATGTGAGCTTAA`, S=`MXA`, `(pos:4..6,aa:Sec)` | 2: O=I=stop, C=U; X remains unknown | Lighter literal X; qualifier says conceptual Sec/U, stored unknown; differing=[], no early stop/edge | G TGA stop; F Sec=U; PR 1 wildcard after effective exception |
| same, S=`MWA` with the Sec exception | 2: O=stop, C=U, S=W | Curated difference W; expected U exception explanation; no stop edge | G + F as above, compare to C not O |
| `ATGTAGGCTTAA`, S=`MOA`, `/transl_except=(pos:4..6,aa:Pyl)` | 2: O=stop, C=O | Applied exception substitution O | G TAG=`*`; F §7.4.3 Pyl=O and exception |
| `TTATCACAT`, `complement(1..9)`, S=`MU`, `/transl_except=(pos:complement(4..6),aa:Sec)` | 2: coding TGA at bases 6,5,4→U | Applied exception U on reverse band | F mapped complement + Sec substitution; G ordinary stop |
| `ATGTAA`, S=`M` | 1 M; final TAA stop omitted from protein | Normal M, terminal `_`, no difference/chip | G table 11 stop; PR 1 terminal omission convention |
| `ATGAAATGA`, table 27, S=`MK`; separately `1..>9`, S=`MKW` | Complete last TGA terminal stop; partial last TGA W | Terminal `_` / ordinary W respectively, no false mismatch | G table 27 residue W and stop row; NCBI `912b751` complete-3′ gate |
| `ATGTAN`, table 28, complete, S=`MY` | Retained last effective set {stop,Y}, C=X, threePrimeIndeterminate=true; Y compatible | Normal Y with one keyboard stop exposing possible stop/Y and “end uncertain” in codon and feature/count explanations; no mismatch/chip/stop edge/terminal glyph | G table 28 TAA/TAG contextual stops, TAC/TAT Y; PR 1 mixed-terminal contract |
| `ATGGC`, `1..>5`, S=`MV` | Final GC padded GCN→A, at actual bases 4..5 | Curated V difference with partial-codon explanation | G all four GC codons A; PR 1 padded-tail rule, NCBI source inspected |
| `ATGNN`, `1..>5`, S=`M` | Final NN padded NNN unresolved, dropped | No final cell or chip | G expansion mixed; PR 1/NCBI dropped ambiguous tail rule |
| `ATGT`, `/transl_except=(pos:4,aa:TERM)`, S=`M` after PR 2 | Final T completed to TAA by qualified TERM | Terminal `_` and exception tooltip/target over base 4 only, one keyboard stop; no `!` or length mismatch | F explicit single-base partial TERM example; G TAA stop |
| `ATGTA`, `(pos:4..5,aa:TERM)`, S=`M` after PR 2 | TA padded TAN ordinarily mixes stop/Y; qualified TERM removes terminal slot | Terminal `_` over bases 4..5 only; one keyboard stop, qualifier/completion explanation, no mismatch/chip | G TAA/TAG stop, TAC/TAT Y; F two-base partial TERM; PR 2 removed-stop evidence |
| `ATGAAATAA`, S=`MKKV`; separately S=`M` | Conceptual MK; extra KV / missing K | `+2 positions` chip / `−1 position` chip; no fabricated letters | G ATG=M, AAA=K, TAA stop; hand lengths 4−2 and 2−1 |
| `ATGTGGTGA`, table 99, S absent | 1 ATG M; 2 TGG W; 3 TGA table-1 stop | Assumed invariant solid M/W; assumed code-sensitive dashed red `*`, never `!` | G all 27 ATG Starts=M and TGG=W; table 1 TGA stop, table 4 TGA=W |
| `GTGTGG`, table 99, S absent, complete | 1 GTG table-1 V, starts in table 11 | Assumed code-sensitive dashed V | G table 1 GTG not start; table 11 Starts=M; #295 initiation sensitivity |
| `ATGGCNRAY`, table 99, S absent | 2 GCN=A invariant; 3 RAY={D,N} unresolved | Solid assumed A; dashed assumed `?` even though readings invariant | G four GC codons A; GAC/GAT D, AAC/AAT N across tables; #295 unresolved marker |
| `ATGTGGTAA`, table 99, S=`M` | Stored first M; assumed tail W,stop | Normal unverified stored M with cannot-check explanation; solid assumed W, dashed red `*`; no short chip | G table 1 tail; PR 1 invalid-code unavailable and #295 tail contract |
| `ATGTGGTAA`, table 99, S=`MW` | Stored M/W cannot be compared under unknown code | Normal unverified stored cells with hover/focus cannot-check explanations, no lighter fill or curated/verified stop claims | G has no id 99; no reference translation of an invalid id claimed |
| GenBank `ATGTGATAA`, S=`MU`, exceptions `(pos:4..6,aa:Sec)` and `(pos:5..7,aa:Val)` | Second entry crosses codons and is malformed | Import refuses the file, naming CDS, raw `(pos:5..7,aa:Val)` and off-frame rule; no PR 3 preview or cells from this refused import | F single-codon rule; owner answer 6 strict refusal; PR 2 import boundary owns this check |
| GFF3 attachment: record r DNA `ATGTGATAA`, row `r\t.\tCDS\t1\t9\t.\t+\t0\tID=c;translation=MU;transl_except=(pos:4..6%2Caa:Sec),(pos:5..7%2Caa:Val)`; independently, format-2 project open with the same CDS c, MU/imported and ordered exception array containing those two decoded literals, plus a forged successful MU cache | Second occurrence is off-frame; the valid Sec occurrence cannot certify the whole result | Conditional on PR 2’s route-specific owner outcome: refusal publishes no result/targets from that input; retention discards project cache, supplies unavailable evidence and exposes route/c/occurrence 1/raw value/off-frame diagnostic in feature warning/details. With valid local geometry, only normal unverified MU cells with keyboard/hover reasons; no verified marks, counts, length chip, terminal glyph or early-stop claim. Repeat each route without S: feature diagnostics only, no computed cells/tail | F single-codon rule; PR 2 Import scope remains held. PR 2 owns real ingress/refusal/cache validation; PR 3 consumes each retained route’s evidence through the real projection/renderer, rejecting a false verified MU preview |
| `ATGTGATAAGGG`, CDS `1..9`, S absent / `MU`; `(pos:4..6,aa:Sec)` plus `(pos:10..12,aa:Gly)` | Both entries have valid full-triplet shape; second is inside record but outside CDS; remaining Sec gives conceptual MU, terminal TAA removed | Computed MU with visible drop notice naming outside-CDS entry; lighter applied U explanation, normal M, terminal `_`, no early stop or mismatch. With S=MU retain stored MU and zero differences; never show a Gly substitution | G ATG=M, TGA ordinarily stop, TAA terminal; F Sec=U; owner answer 5 drop-and-compute |
| `ATGAAACCCTAA`, `(pos:4..6,aa:OTHER)` / `aa:Xaa`, S=`MWP`, `MUP`, `MOP`, `MBP`, `MZP`, `MJP` | Effective MXP; middle possible set all sense residues, including U/O; stored ambiguity expands by answer 4 | Zero differences and no stop edge; retain each literal stored letter, explain unspecified exception rather than claim a specific confirmed residue. Without S show computed X and exception explanation | G AAA=K; F OTHER/Xaa unknown residue; owner answer 4 supplies comparison set/overlap |
| Same DNA without the exception, S=`MXP`; separately `(pos:4..6,aa:TERM)`, S=`MXP` | Ordinary MKP: X compatible; TERM gives M*P: definite stop beats X | No difference in first case; lighter X with stop edge and count 1 in TERM case | G AAA=K, CCC=P; F TERM stop; owner answer 4 preserves definite-stop precedence |
| `ATGTGATAA`, valid-shape break naming a different accession | No local substitution is permitted | Conditional PR 2 dependency: no PR 3 result if import is refused; if dropped, computed result plus visible notice. Do not select a branch until the owner settles it | Owner answer 7 exact-accession eligibility; notice n1 holds disposition |
| Source r has CDS c `101..115` on coding `ATGTGATAGCCCTAA`, S=`MUOP`, breaks `(pos:104..106,aa:Sec)` and `(pos:107..109,aa:Pyl)`; select bases 101..105 | Output ATGTG, CDS `1..>5`; Sec codon loses base 106, Pyl codon wholly excluded: both exceptions removed; no stale full MUOP | PR 2 export warning names r/c, original occurrences 0/1, literals and loss reasons; after reimport PR 3 must not show either exception as applied. Only clipped `/translation` and frame remain conditional; consume their final evidence without assuming a clipped protein | Owner answer 8 and PR 2’s settled selection export rule; PR 2 owns loss delivery and source preservation, PR 3 owns reimported evidence display |
| `ATGAAAGCTTAA`, `(pos:4..6,aa:TERM)`, S=`M*A`; separately `MKA` and `MXA` | 2: O=I=K, C=stop; conceptual M*A | Verified `!` for `*` (count 0); lighter K/X + stop edge (differing=[1], count 1). All say AAA ordinarily K, exception specifies stop | G AAA=K, GCT=A; F TERM=* overrides codon; terminal TAA removed |
| `ATGAAACCCTAA`, `(pos:4..6,aa:TERM)`, S=`MXP`; controls S=`M*P` / `MKP` | Ordinary MKP; effective M*P, possible M,*,P, internalStops=[1]; differing=[1] / [] / [1], no tails | X/K lighter with stop edge, stored * verified `!`; shared codon count 1 / 0 / 1, 3 positions and 1 internal stop. X tooltip names AAA→K and TERM→stop. Remove TERM: MKP, X wildcard count 0/no stop; Sec + S=MUP: no mismatch/stop | G AAA=K, CCC=P; F TERM/Sec overrides; exact PR 2 shared MXP fixture |
| `GTGAAATAA`, `(pos:1..3,aa:Val)`, S=`VK` | 1: O=V, I=M, C=V | Lighter V exception mark, no mismatch; tooltip explains initiated M overridden by Val | G GTG ordinary V/Starts M; F Val=V; PR 2 applies exceptions after initiation |
| `ATGAAAGGGTAA`, S=`M` | Conceptual MKG, differing=[], storedShortBy=2 | `−2 positions`; length-only tooltip, no zero-codon clause; one file warning | G M,K,G then terminal stop; hand lengths 3−1=2 |
| `ATGTAAGGGTAA`, S=`M` | Conceptual M*G, internalStops=[1], differing=[], storedShortBy=2 | M plus `−2 positions`; no unmatched codon 2/3 cells/targets or `!`; feature/hub/chip expose 3 positions, 1 internal stop at codon 2/bases 4..6 | G M,stop,G,terminal stop; PR 1 excludes unmatched tails from codon display |
| `ATGAAATAA`, S=`MKV`; separately `MVV` | Conceptual MK; extra V; differing=[] / [1] | `+1 position`; length clause for both; MVV also says 1 codon; one warned CDS each | G AAA=K; lengths 3−2=1, V differs from K only in MVV |
| `ATGAAATAA`, S=`M`, `/exception="RNA editing"` | Conceptual MK; shortBy=1 | `−1 position`, length-only explanation retained; no file mismatch warning | G M,K; PR 1 suppression affects warning only |
| `ATGAAATAA`, GFF3 strand `.`, separately `?`, phase 0, S=`MK` | Biological orientation unknown despite numeric fallback | No codon lane/cells/chips/targets; details retain MK and unknown-strand reason | PR 1 eligibility; no inferred orientation |
| `ATGCCCAAATAA`, `order(1..3,7..12)`, S=`MK`; separately `join(1..3,J00194.1:7..12)` | Neither defines one locally available sequence | No codon lane/cells/chips/targets; details retain MK and nonlocal-location reason | F order is not join; remote bases unavailable; PR 1 geometry gate |
| `ATGAGATAA`, two complete CDSs A/B `1..9`, S(A)=`MR`, S(B)=`MK` | Codon 2 A: agreement R; B: K vs R | Separate lanes expose both residues/explanations by pointer and keyboard, without occlusion | G AGA=R; hand comparison; owner answer 12 selects separate lanes |
| `ATGAGATAA`, A/B `1..9`, both S=`MR`, only B has `(pos:4..6,aa:Arg)` | Same letters; B has a no-op applied exception | Separate lanes; A’s ordinary R and B’s ordinary R each have their own keyboard stop and pointer target. Focus/hover A explains ordinary AGA→R; B additionally names its no-op qualifier. Neither is lighter; no shared target or omitted ordinary stop | G AGA=R; F Arg=R no-op, distinct occurrence provenance |
| `ATGG`, `1..>4`, S=`M`; separately `ATGGC`, `1..>5`, S=`MA` | GNN unresolved dropped / GCN→A retained | No final target for G; normal A over bases 4..5 only for GC, one keyboard stop; no chip | G GNN spans V,A,D,E,G; all GC codons A; PR 1 padded-tail contract |
| `ATGAAATAA`, table 11, known local geometry/strand, unknown completeness; no S / S=`M` | PR 1 unavailable unknown-completeness, no verified C | No S: no cells/targets; S=M: only normal unverified M with hover/focus reason, no computed tail. Both: feature reason, no chip, terminal glyph, count or stop claim | PR 1 unavailable model; no inference from missing completeness |
| Protein record p: `GCTAAAGCT`, CDS `1..9`, +, frame 1, table 1, S=`QQQ` imported; repeat table 99 + `(pos:4..6,aa:Sec)` | Primary protein-record before nucleotide work; not AKA or AUA | No lane/cells/chips/codon targets/assumption/count/stop/mismatch; details/copy QQQ + Imported + not-applicable reason. Format-2 reload discards forged successful AKA/3-aa cache before publishing; same result without cache. Repeat no stored value: no computed protein | PR 1 step 0 and cache trust contract, PR 2 preservation fixture |
| DNA `GCTAAAGCT` / RNA `GCUAAAGCU`, same CDS; absent molecule type control | Without exception AKA; with Sec at 4..6 AUA. Absent type keeps nucleotide default | Eligible projection; S=QQQ gives three curated differences; no S draws conceptual AKA/AUA. Mixed protein/DNA session excludes only protein record | G GCT/GCU=A, AAA=K; F Sec=U; PR 1 positive controls |
| Aligned `--A-TG-AAA-TAA--`, S=`VK`; first codon A,T,G at display columns 2,4,5 (zero-based) | ATG→M; S=V differs; gap 3 is not a base | Lighter V only on [2,3),[4,6), label on [4,6); no gap paint/outline/pointer hit; same explanation on both pieces, one keyboard stop | Hand column enumeration; PR 1 comparison; real-base mapping contract |
| Same record, raw `ATGAAATAA`, S=`VK`; accepted alignment overlay changes `--A-TG-AAA-TAA--` to `ATGAAA---TAA----` (both 16 columns), CDS unchanged | Biological MK, stored V/K and comparison unchanged; codon 1 moves from columns 2,4,5 to 0,1,2; codon 2 from 7,8,9 to 3,4,5; terminal from 11,12,13 to 9,10,11 | Rebuild pieces/index/occupancy; V paints only [0,3), K [3,6), terminal [9,12). Columns 7,8 are now gaps: no paint/pointer hit/focus target; column 4 now hits K, never stale V. One keyboard stop per visible logical codon at new bounds, biological order unchanged; evidence reused | Hand enumeration of both strings supplies literal geometry expectations; removing gaps yields the same raw DNA; G ATG=M, AAA=K, TAA stop. Fresh second-mapping projection additionally checks cache-history independence |
| empty sequence / empty coding extraction; no S or S=`M` | No codon | No cells/chips; unavailable feature explanation | F no complete coding position; PR 1 unavailable-empty contract |
| `ATGAGATAA`, S=`MK`, hit only on base 5 | 2 remains K vs R | Curated lighter cell plus outline over hit overlap | G AGA=R; mockup search compositing, no changed biological reading |
| `ATNNGAGATAA`, `join(1..2,5..11)`, S=`MK` | Coding ATG AGA TAA; 2 at bases 6..8: R vs K | Curated K difference; codon 1 split over 1,2,5; no intron paint | F concatenation AT + GAGATAA = ATGAGATAA; G AGA=R |

### Tooltip lifecycle acceptance fixtures

Use the real track/feature targets and shared `TooltipLayer`, not a replacement tooltip.
Open each explanation through pointer hover and keyboard focus in the same arrangements;
after opening, perform the state change without another hover/focus, blur, scroll or
resize event. Observe dismissal, removal of the old `aria-describedby` and cancellation
of pending opens at the renderer commit; advance controlled tooltip timers afterward to
reject delayed resurrection. A subsequent qualifying interaction must open current text
at current bounds. These are presentation integration fixtures, not new translation tests.

| Arrangement and change | Required observable outcome / wrong outcome rejected |
|---|---|
| `ATGTGAGCTTAA`, S=`MUA`, table 11; open codon 2 explanation, then separately feature/hub count explanation. Add `(pos:4..6,aa:Sec)` through the real feature-edit→recompute→renderer path, keeping each active target focused/hovered without another event. Repeat without stored S to change the displayed codon from `!` to U. | Before: stored U disagrees with DNA stop, stop edge and definite-difference count 1. After: U agrees with exception-specified U, lighter exception mark without stop edge, count 0. Dismiss all affected active explanations even if U and the target node remain; reopening explains TGA→stop then Sec→U and the new count, with no stale stop/difference claim. The no-S control dismisses the early-stop explanation before U appears. Biology oracle: the existing G/F Sec fixture, not tooltip text generated by the projection. |
| With that codon tooltip open, pan so the codon remains visible but moves on screen; repeat with its feature tooltip open and a changed feature anchor. Then pan each active target out of view; also replace/remove its feature and cross the translation visibility threshold for a codon target. | Retained-but-moved targets dismiss despite unchanged evidence and no scroll event; next opening uses the new rectangle. Removed/replaced/ineligible targets dismiss and lose their association, cannot leave an orphan tooltip or hidden keyboard target, and cannot transfer old text to a recycled node. Surviving eligible keyboard targets retain focus. |
| Arm the delayed opening on a codon or feature, then revise evidence, replace/remove the target or change its geometry before the delay expires. | No obsolete tooltip opens when timers advance; detached old nodes retain no `aria-describedby`. A new interaction can open the current explanation. This rejects a late callback that survives invalidation even when no tooltip was visible yet. |
| Keep a codon/feature explanation open during the same-length alignment overlay fixture above. | Dismiss before remapped paint/targets appear; reopening uses unchanged biological explanation at the new bounds. Real pointer hits, gap misses and keyboard geometry follow the new mapping, with no new translation/comparison run. |

### Long stored-extra list acceptance fixture

Use DNA `ATGAAATAA`, table 11, complete CDS `1..9`, and imported stored protein
`MK` followed by 200 literal A residues and a final W. Independent hand derivation gives
conceptual MK (terminal TAA omitted), 203 stored positions and 201 extras; the final extra
is W at stored translation position 203 (extra ordinal 201). Choose a viewport where the
complete tail exceeds the available tooltip and details height.

Through the real track, shared tooltip and feature-details route, pointer hover and
keyboard focus on `+201 positions` must expose the same bounded preview, exact total and
complete-list instruction without claiming the preview is complete. Activate the chip by
pointer, then independently by keyboard Enter/Space; details open at the labelled list
heading. Pointer scrolling must reach W/position 203; keyboard focus into the list region
and End must also reveal that final entry. The full list preserves all 201 extras in
order and stays usable after the tooltip dismisses. Close details and verify focus returns
to the invoking control. Repeat via the feature-summary action with the endpoint offscreen
and at overview zoom. This rejects an inaccessible tooltip-only tail, a silently truncated
list and a details action that loses the requested feature or final residue.

## Open decisions and unresolved acceptance gaps

There are no remaining PR 3 presentation decisions: owner answers 10–12 settled them.
The following PR 2 dependencies stay conditional under Claude notice n1; the spec does
not choose a default for these held policies.

1. **Foreign-accession code break — owner question:** when a syntactically valid break
   names another accession, should import refuse the file, or drop the entry with a visible
   notice and compute from the remaining valid breaks? Exact-accession-only eligibility
   is settled; foreign mapping/fetching is not an option. PR 3 either receives no record
   (refusal) or computed evidence plus the drop notice. **Backed by:** owner answer 7
   settles eligibility only; disposition is on hold for the owner, per notice n1.
2. **Clipped protein and frame — owner question:** what clipped `/translation` and frame
   (`/codon_start`) should selection export write? Export with warning, partial markers,
   no stale full protein and removal of exceptions on selection-destroyed codons with named
   warnings is settled by PR 2’s selection export rule. Only the clipped protein/frame
   policy remains held; PR 3 consumes that final interface after reimport.
   **Backed by:** owner answer 8, notice n1 and PR 2 at `2b694fb`; no protein/frame default selected here.
3. **Malformed GFF3/project imports — owner question:** PR 2’s Import scope decision holds
   refusal versus retention independently for these routes. Refusal produces no PR 3 result;
   retention follows the unavailable/diagnostic display path above, never verified translation.
   GenBank/editor refusal is settled. The route-specific fixture protects either eventual
   outcome without selecting it here.

No additional ambiguous malformed-versus-unusable case or truly unrepresentable qualifier
value was established in this PR 3 review. If PR 2 identifies one, record its concrete
input, biological consequence, options and scientific basis as an owner question before
implementation; do not silently classify or normalize it.

The joined boundary fixture is specified exactly in verification below. No benchmark
or live accessibility/browser validation has yet been run; performance is an acceptance
requirement, not an achieved measurement. PR 2's named occurrence-evidence interface must
be reconciled with its final reviewed model before implementation, especially dropped
occurrence status and notices on successful results.

## Verification boundary and coverage decision

The subject is the codon-mark projection and its real `SequenceTrack`/tooltip rendering:
given PR 1/2 evidence and stored protein, it emits exact visible marks and explanations.
Biological translation, exception mapping, imports, recompute and export are owned by
PRs 1/2; their results are inputs, not duplicated algorithms or new acceptance suites here.
Assumed-table policy belongs to #295; this PR protects its integration in the shared path.

| Guarantee/source | Existing protection inspected | Decision |
|---|---|---|
| Initiation lookup, RNA normalization / #261 | `initiatorResidue.test.ts` matches literal Starts rows for tables 1/11; lowercase `gug`→M while context-free GTG→V | Reuse lookup coverage; add projection-level complete/partial/phase and stored override distinction. Do not retest every codon lookup. |
| Mark classification and precedence / owner + PR 1 model | None found for new mark states | Add pure projection checks using the independent table, grouped by competing causes; reject false differences for compatible ambiguity, ordinary-residue wildcard X, valid initiators and applied exceptions. Include exact MXP stop-over-X count 1, retained X over initiated M/exception U, retained mixed terminal uncertainty, I→C exception overrides, cause-specific TERM explanations, unavailable allowed/denied claims and length-only/combined differences. No-S/short-S unavailable inputs must expose reasons without invented tails/counts. Include OTHER/Xaa sense-set compatibility for U/O and stored B/Z/J without literal-X false mismatches, normal unverified hover/focus explanations, and normal terminal `_` explanations. Include usable computed evidence plus a visible dropped-entry notice; reject applied marks for dropped entries. GenBank mixed-entry refusal belongs to PR 2. For held malformed GFF3/project routes, use the route-specific fixture: refusal is unreachable here; retained inputs show unavailable diagnostics and only geometry-eligible stored cells, never a verified subset result. PR 2 owns ingress validation. |
| Lane, reverse, joined/origin geometry / OP-8 | `SequenceTrack.test.tsx` “splits a splice-crossing codon without painting the intron” asserts exact rectangles; origin case tests both strands. Its aligned-CDS assertion currently paints across a gap and contradicts this contract. | Strengthen the recorder boundary with differing/stop-edge states and hit targets on all pieces. Replace the contrary gap assertion with real-column splits; check gap-only search hits and pointer misses plus real-base hits. Assert one logical keyboard stop; no gaps/intron painting. Include retained padded fragments, dropped fragments and partial TERM targets on actual bases only; no geometry for unknown-strand/order/remote inputs. |
| Search + stop edge + chip compositing / mockup | Existing active-search priority test draws overlapping active/other search backgrounds; none found for lighter cells/chips | Add canvas-recorder checks for white base, lighter S, base-facing edge on both strands, exact partial hit outline, longer/shorter chips. Extend `assignTranslationLanes` checks for separate overlapping-CDS lanes and real targets, including equal letters with distinct provenance (owner answer 12). Browser visual check owns legibility and collisions; spy alone cannot prove appearance. |
| Separate lanes for overlapping CDSs / owner answer 12 | `cds.test.ts` “shares a lane for overlapping features in the same frame” explicitly asserts the contrary policy; non-overlap, different-frame, strand and circular-join-gap packing assertions also exist | Replace the same-frame-sharing expectation with separate feature lanes, preserving non-overlap lane reuse, strand independence and whole-record stability. Exercise differing and equal letters with distinct provenance through the real renderer/targets; a packer-only assertion cannot prove both explanations are reachable. |
| Zoom and transition preservation | `translationStyles.test.ts` pins shared threshold 5 and reduced-motion CSS; `SequenceTrack.test.tsx` low-zoom test keeps search within nucleotide band | Reuse threshold/transition checks; strengthen observable rendered targets at 5/just above 5, 12/just above 12 and 20, plus translation-off/protein modes. Reject hidden focus targets and stale explanations on zoom/pan. |
| Assumed vs stored, no false biological claims / #295 | `SequenceTrack.geneticCodes.test.tsx` “draws assumed residues…” asserts M,*,E with no ! and a real warning button; “preserves the stored translation…” asserts M,U,_ | Reuse these merged assertions; add shared-path solid invariant/dashed sensitive, stored-wins and short assumed-tail checks. Never preserve obsolete `?`-everywhere assertions as scientific truth. |
| Per-record eligibility / PR 1 step 0 | PR 1 specifies protein/cache acceptance fixtures; no PR 3 projection protection found | Add real record→projection/details and format-2 reload checks with QQQ/imported and forged AKA cache; deny all nucleotide paint/targets/counts including table 99/exception fallback, preserve QQQ/source/copy. Include allowed DNA/RNA/absent-type controls and mixed records; a session-only gate cannot pass. |
| Tooltip and accessibility wiring and lifecycle | `TooltipLayer.test.tsx` asserts delayed hover text/shortcut and `aria-describedby`, press dismissal/unlinking and warm switching; existing genetic-code test gets a real warning button by accessible name. None found for revision, removal/replacement or geometry invalidation. | Reuse existing shared-tooltip protections; add the lifecycle fixtures above through real renderer/tooltip wiring for codon and feature/count consumers, including pending timers, no fresh hover/focus and reopening with current text/bounds. Preserve Escape/blur, escaped qualifier content, biological tab order and shared text. Assert exactly one keyboard stop per visible logical codon, including ordinary no-op/uncertainty cells and both overlapping features’ ordinary R cells; reject missing ordinary targets and duplicate split-piece stops. Add the long stored-extra fixture through real chip/feature-summary→details wiring: bounded preview, complete ordered list and final W reachable by pointer and keyboard, with focus entry/return and offscreen/overview access. No complete-tail navigation protection found. One browser journey checks actual focus rings, readable hover, pan anchor changes, long-list navigation and search overlap on both strands. |
| Alignment-only display invalidation / accepted `applyFastaResponse` overlay | `bioResponse.test.ts` “accepts a case-only difference and keeps the loaded residues as the source” asserts raw sequence/features alongside new `alignedSequence`; its overlay test asserts accepted alignment strings. Neither checks renderer caches, targets or lane occupancy. | Add the same-length gap-move fixture through the accepted overlay→real track update, comparing pieces/index/occupancy with a fresh second-mapping projection. Observe exact paint, gap pointer misses, changed codon hits and keyboard bounds/order together; assert biological evidence reuse and no translation/comparison work. Include alignment removal/raw-display restoration to reject a stale mapped cache in the reverse direction. |
| Atomic refresh after edits; feature tooltip and hub count agree | `translation.test.ts` “stop beats stored X…” asserts differing=[1] for MXG, none for M*G and shortBy=2 for M; renderer refresh/count agreement protection not found | Add smallest integration check through real edited feature→track/tooltip update, rejecting stale mismatch marks after recomputation; reuse PR 1 tests for persisted protein/export. Hub and feature tooltip are sibling count consumers: assert the same definite-difference count, excluding agreeing initiation/exception and length-only marks, including effective stops against X. Feature/hub and codon/chip tooltips include length clauses and omit zero-codon clauses; `/exception` retains explanations. Short S=M versus M*G keeps early-stop diagnostics in feature/hub/chip but no unmatched codon cell; retained TAN uncertainty appears in feature/count and codon explanations. |
| Exact visibility and deep lanes / #300 | #295 source has exact max-end hover lookup; no executed evidence for PR 3 drawing index or vertical clipping | Add indexed-vs-exhaustive synthetic comparison at boundary overlaps, split pieces and deep lanes. Minimal correctness stays in CI; opt-in dense browser benchmark measures redraw/DOM/memory over repeated pans without retranslating. No fixed fps promise without measurement. |

Boundary fixtures additionally include a codon crossing the very first/last viewport pixel,
feature endpoints at record bases 1 and length, joined and circular pieces, single/two-base
partial ends and empty input. A concrete split-codon fixture is `ATNNGAGATAA` with
`join(1..2,5..11)`: AT + GAGATAA = ATG AGA TAA, S=`MK`; the K difference is at record bases
6..8, and codon 1 spans bases 1,2,5. Its reverse equivalent is generated by a hand reverse
complement and mapped explicitly before being accepted as an oracle fixture.

This is a documentation-only delivery: the table records **proposed** checks and
**inspected** existing assertions, not passes. At implementation handoff reconcile this
same coverage decision with executed evidence and remaining gaps. Run focused affected
tests plus typecheck/lint/headers per the owner's later integration rule. Full suite and
build run locally on the combined integration branch and CI once all dependent PRs are
merged; no per-PR full-suite rerun or CI change. PR description includes “Decisions and
deviations”, naming scientific/user-visible differences and any unconfirmed choices;
interface-only details go in a collapsed block.
