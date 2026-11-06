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
  `docs/specs/2026-11-06-translation-stored-protein-provenance.md` on
  `fix/cds-translation-invalidation` at `250f1cc` (PR #291): one protein in `metadata.translation`,
  read-only import provenance, recomputation after coding edits, conceptual comparison,
  counts and early-stop diagnostics. Cite that named model, not its changing line numbers.
- **PR 2, “CDS translation exceptions under NCBI code-break rules”**, in
  `docs/specs/2026-11-06-translation-transl-except.md` on `fix/cds-transl-except`:
  consume its **Exception evidence on every result** interface (ordered occurrence
  evidence and diagnostics on both `ConceptualTranslation` variants). PR 3 never parses
  exceptions independently. Until PR 2 supplies it, PR 1's `unavailable` reason is exactly
  `unsupported-exception`. PR 2's unresolved failure policies remain conditional.
- **PR #295**, `fix/assumed-genetic-code`: the #288 presentation-only assumption and its
  shared marker, inspected from `origin/fix/assumed-genetic-code`. It has not landed in
  this checkout. Reuse its drawing branch and hover machinery rather than creating a
  second assumed-code implementation. #261 supplies `initiatorResidue`, not a separate
  lighter-fill component.
- Structured strand-relative partial ends from #226, already a PR 1 prerequisite.

Imported curated residues stay visible. Coding edits replace/remove them under PR 1's
rules. DNA-aware diagnostics follow the conceptual protein, including PR 2 substitutions,
not the stored letters or an assumed-table view. All marks explain themselves on hover
and keyboard focus. No project-format bump or migration is introduced: the later owner
decision supersedes the contrary historical paragraph in PR 1's draft.

No source code, translation algorithm, import/export rule, count formula, qualifier editor,
or sequence persistence changes are authorized by this spec-writing task. Implementation
will add presentation provenance, drawing, chips and accessible explanations. Merge all
three PRs into `integration/murilo-review`, then review correctness together before develop.

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
applied/failed/deferred status and reason, diagnostics and terminal-removal flag. Keep
failed/deferred evidence on unavailable results too. Concrete helper names remain PR 2's
implementation choice; do not invent another mapper here.

**`conceptualTranslation`** remains the sole effective translator. **`initiatorResidue`**
remains the sole Starts-row lookup (currently in `src/domain/bio/sequence.ts`, exported
through `index.ts`); it must not be copied into rendering. Only codon 1 of a known
5′-complete CDS with `/codon_start=1` is eligible. A literal exact triplet is required by
PR 1; internal GTG stays V under table 11. Prefer the stored first residue when present.

**`compareTranslation(stored, conceptual)`** retains PR 1's definite-disagreement policy
and its `differing`, `storedExtra`, `storedShortBy` outputs; its comparison is against
effective, not ordinary, readings. Attach the codon provenance to a presentation result
without changing comparison policy. A definite effective internal stop overrides stored X:
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
tooltip data and existing `codonSpans` geometry; React/DOM/canvas stays in app. No reverse
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
#295's stored-length reads must switch to PR 1's accessor during integration.

## Per-residue states and explanations

Before projection, require PR 1's known biological strand, a location satisfying
`definesOneSequence(feature)` and a validated extraction/base map establishing codon geometry.
Unknown strand (including GFF3 `.`/`?`), `order()` and remote/nonlocal locations have **no
codon lane, cells, chips or codon hover/focus targets**, even with stored protein. Feature
details retain the stored value, primary unavailable reason and exception diagnostics.
Other unavailable reasons permit unverified cells only if this geometry gate independently
passes; missing completeness is never inferred from a false partial-end accessor.

For each eligible codon let S be the stored residue if present, O its ordinary code reading,
I its contextual reading after initiation but before exceptions, and C its effective
conceptual reading after exceptions and terminal context. D is the displayed residue: S when present, otherwise C,
except PR 1's valid-code short-protein contract below. Definite mismatch is membership in
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
| Ordinary agreement | Available C; no definite mismatch and no initiation change O→I and no exception change I→C | Normal cell; no warning | “{D} ({name}). {triplet} reads {C} under table {table}.” Normal cells need no extra tab stop. |
| Curated difference | S exists and index is in `differing`; C is not a definite internal stop | Lighter cell, retain S | “Annotated {S} ({name}). {triplet} ordinarily reads {O} under table {table}; the effective conceptual reading is {C} ({name}). Stored /translation differs here.” Include initiation/exception provenance when it changes the reading. For ambiguous O/C name the possible readings, not a single definite residue. |
| DNA stop hidden by annotation | Definite effective internal stop at index and S is any non-stop residue, including X | Lighter S cell plus 3 px red base-facing edge | “Annotated {S} ({name}). {effective-stop explanation} Early stop in the conceptual CDS; the annotation has a residue here.” |
| Verified early stop | Definite effective internal stop; no S or S is `*` | Existing solid red cell with white `!` | “Early stop before the end of the CDS. {effective-stop explanation}” |
| Initiator substitution | Known complete codon 1, `/codon_start=1`, exact Starts-row M and ordinary reading differs from M; D is M and no mismatch | Shared lighter cell, M retained | “Initiator M (Met). {triplet} ordinarily reads {O} under table {table}; a complete CDS starts with M at this codon.” This is valid initiation, not a curated mismatch. |
| Applied exception substitution | PR 2 reports an applied exception changing I (the contextual pre-exception reading); D agrees with effective result, no mismatch | Shared lighter cell, effective/stored letter retained | “Translation exception: {qualifier}. {triplet} ordinarily reads {O} under table {table}; before the exception the contextual reading is {I}; the annotated exception specifies {C} ({name}).” If initiation changed O→I, say it was overridden. Do not claim experimentally verified recoding. |
| Assumed invariant | Invalid code, no S at this index; #295 supplies a resolved invariant residue | Reuse #295 normal solid cell | “{D}, assuming table 1. {triplet} reads {D} in every NCBI code. /transl_table={value} is not an NCBI genetic code.” Resolved IUPAC: “Every reading of {triplet} is {D} in every NCBI code.” |
| Assumed code-sensitive | Invalid code, no S; #295 `codeSensitive` or unresolved `?` | Reuse dashed marker, no new lighter warning fill; strand letter, red `*` for definite assumed stop, never `!` | Use `assumedCodonDescription`: “{triplet}: {D}, assuming table 1”, followed by other readings with table ids; unresolved triplets name their table-1 possibilities and whether codes differ. Include invalid qualifier value. |
| Unverified stored residue | S exists, geometry gate passes, but conceptual result unavailable | Retain S, feature warning target; no definite curated-difference or early-stop mark | “Annotated {S} ({name}). Cannot check against DNA: {reason}.” Reasons explicitly name invalid code or unapplied exception. S never inherits an assumed-table dashed mark. Additional visual differentiation is an open decision below. |

The **effective-stop explanation** is shared by hidden-stop, stored-X and verified-stop
states. Without a stop-producing exception: “{triplet} reads a stop under table {table}”.
With one: “{triplet} ordinarily reads {O} under table {table}; the contextual reading before
the exception is {I}. Translation exception {qualifier} specifies stop.” Include overridden
initiation when relevant. Never say a sense triplet such as AAA ordinarily reads stop.
Stored X uses the lighter X cell plus base-facing stop edge and “Annotated X (unknown)”
followed by this same explanation. It **is** a definite mismatch and contributes one to
`differing.length`. A stored `*` at an effective sense codon is a curated difference with
literal `*`, not a verified `!`.

An exception is a no-op only when it leaves I unchanged; O=C alone is insufficient.
A GTG start with aa:Val has O=V, I=M, C=V: lighter V, explaining initiation then its override.
An actual no-op exception has no lighter substitution mark; its ordinary tooltip still
names the qualifier. An ordinary ATG→M has no initiator substitution mark. A terminal stop
is the existing terminal glyph `_`, never `!` or a curated mismatch just because stored
proteins omit it. Applied terminal TERM similarly gets an exception explanation at the
terminal slot, not an internal-stop edge.

**Precedence and composition, highest first:**

1. The geometry gate precedes all states. For eligible geometry, unavailable comparison suppresses all definite mismatch/early-stop claims; invalid-code
   slots without S use #295's assumed state. Do not compare to assumed table 1.
2. Effective internal stop selects hidden-stop (including X) or verified-stop state, with the cause-specific explanation above.
   Raw ordinary stops replaced by a valid PR 2 exception are not early stops.
3. Definite curated mismatch selects lighter S, even if initiation or an exception also
   applies. Tooltip adds “Expected {C} after initiation/exception” and its provenance.
4. Applied exception changing I, then initiator substitution selects the lighter explained state.
   If both apply, show both explanations; PR 2's effective output settles the residue.
5. Otherwise ordinary agreement. Search and focus decorations overlay every state; they
   never replace biological explanations or count as mismatch states.

If `/exception` exists, append “Annotated exception: {value}” to affected explanations;
PR 1's suppression of the file-level mismatch warning does not suppress these marks.
The generic warning target must not cover the more specific codon target.

## Length chips, partial ends and mapping

Use PR 1's `storedExtra` and `storedShortBy`, only with an available comparison. Extra
stored residues have no genomic positions and never become invented codon cells. Short
stored proteins get no invented stored tail: valid-code missing slots have no protein
letter and the chip explains them. Without any stored protein, draw the conceptual
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
List long extras in scrollable tooltip content with the exact total; indicate any truncation.

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

Mapping uses extraction provenance and `codonSpans`, with no genomic endpoint subtraction.
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
edge. Optional lighter terminal styling remains open below; the target and explanation
are required regardless. A 5′ partial end disables initiator substitution; a 3′ partial end
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
Only visible codons/chips are focusable, in feature then biological codon order on both
strands. Split pieces share one keyboard stop with pointer targets on all pieces.
When a chip's biological endpoint is offscreen, do not pin it to an unrelated viewport
edge; its information remains in the feature tooltip. Reserve chip geometry so it does not cover neighboring CDS cells or intercept their targets.

**Feature-specific overlap is a layout contract**, not just a chip concern. Existing
`assignTranslationLanes` (`src/app/viewer/cds.ts`) permits overlapping same-frame units
in one lane; that cannot expose distinct proteins or exception explanations. Never paint
competing residues at the same pixels with a last-drawn-wins target. Each feature's residue,
mark and full provenance must remain independently discoverable by pointer and keyboard,
including agreement versus mismatch and equal letters with different exception provenance.
The choice (separate lanes or explicit aggregation) is Open decision 4; implementation of
colliding cases waits for it. Packing includes retained partial pieces, terminal targets
and chips, uses whole-record stable ordering independent of pan, and preserves visible-only
rendering with no lane cap that hides evidence.

[#300](https://github.com/JoaoVictorDaijo/dunceious/issues/300) measured full interval scans
on dense quantitative tracks; its lane-canvas limit also matters here. This PR must not add
one full-record DOM node per residue or repeat translation/IUPAC expansion during pan.
Build translation evidence and an exact codon-piece overlap index when biological inputs
change; reuse/generalize #295's max-end index for drawing as well as hover. Redraw queries
visible pieces, draws each exact result, and creates only visible targets. Complexity is
one evidence pass per changed CDS plus index construction, then indexed viewport lookup
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
| `GTGAAATAA`, S=`VK` | 1: expected M, stored V | Curated difference V; initiation explanation included | G/F previous derivation; S disagrees with effective M |
| `GTGAAATAA`, `<1..9`, S=`VK` | 1: GTG→V | Ordinary agreement, no initiator mark | G V, F partial 5′ excludes initiation; NCBI `912b751` gate |
| `AGTGAAATAA`, `<1..10`, `/codon_start=2`, S=`VK` | 1 after skipped A: GTG→V | No mark on skipped A, ordinary V | F offset 2 skips one base; G internal GTG=V |
| `ATGGTGTAA`, S=`MV` | 2: internal GTG→V | Ordinary agreement | G table 11 ncbieaa=V; Starts not applied internally |
| `augagauaa`, RNA, S=`MK` | 2: AGA→R | Curated difference K, RNA triplet text | G table 11 plus NCBI U/T alphabet convention |
| `TTA TCACAT` (spaces removed), `complement(1..9)`, S=`MW` | Biological sequence ATG TGA TAA; 2 at bases 6,5,4: stop | Hidden-stop W; red edge on top of reverse band | F reverse complement; G TGA=`*` |
| `TTATTTCAC`, `complement(1..9)`, S=`MK` | Biological GTG AAA TAA, 1: M | Initiator substitution at bases 9,8,7 | F reverse complement, G table 11 Starts GTG=M |
| same record, `complement(1..>9)`, S=`VK` | Biological 5′ partial; GTG→V | Ordinary V, no initiator mark | F `>9` is biological 5′ end on complement; G V |
| `ATGGCNTAA`, S=`MA` | 2: GCA/GCC/GCG/GCT all A | Ordinary agreement | G four explicit table-11 alanine codons |
| `ATGAANTAA`, S=`MK`; separately S=`MW` | 2: AAA/AAG K; AAC/AAT N; conceptual X | No mismatch for K; curated W difference | G enumeration gives {K,N}; PR 1 membership comparison |
| `ATGNNNTAA`, S=`MX` | 2: unknown | No definite mismatch | G 64 codons mix readings; PR 1 X policy |
| `ATGTGAGCTTAA`, S=`MUA`, `/transl_except=(pos:4..6,aa:Sec)` | 2: O=stop, C=U | Applied exception substitution U; no early stop | G TGA=`*`; F Sec=U exception substitution |
| same, S=`MWA` with the Sec exception | 2: O=stop, C=U, S=W | Curated difference W; expected U exception explanation; no stop edge | G + F as above, compare to C not O |
| `ATGTAGGCTTAA`, S=`MOA`, `/transl_except=(pos:4..6,aa:Pyl)` | 2: O=stop, C=O | Applied exception substitution O | G TAG=`*`; F §7.4.3 Pyl=O and exception |
| `TTATCACAT`, `complement(1..9)`, S=`MU`, `/transl_except=(pos:complement(4..6),aa:Sec)` | 2: coding TGA at bases 6,5,4→U | Applied exception U on reverse band | F mapped complement + Sec substitution; G ordinary stop |
| `ATGTAA`, S=`M` | 1 M; final TAA stop omitted from protein | Normal M, terminal `_`, no difference/chip | G table 11 stop; PR 1 terminal omission convention |
| `ATGAAATGA`, table 27, S=`MK`; separately `1..>9`, S=`MKW` | Complete last TGA terminal stop; partial last TGA W | Terminal `_` / ordinary W respectively, no false mismatch | G table 27 residue W and stop row; NCBI `912b751` complete-3′ gate |
| `ATGGC`, `1..>5`, S=`MV` | Final GC padded GCN→A, at actual bases 4..5 | Curated V difference with partial-codon explanation | G all four GC codons A; PR 1 padded-tail rule, NCBI source inspected |
| `ATGNN`, `1..>5`, S=`M` | Final NN padded NNN unresolved, dropped | No final cell or chip | G expansion mixed; PR 1/NCBI dropped ambiguous tail rule |
| `ATGT`, `/transl_except=(pos:4,aa:TERM)`, S=`M` after PR 2 | Final T completed to TAA by qualified TERM | Terminal `_` and exception tooltip/target over base 4 only, one keyboard stop; no `!` or length mismatch | F explicit single-base partial TERM example; G TAA stop |
| `ATGTA`, `(pos:4..5,aa:TERM)`, S=`M` after PR 2 | TA padded TAN ordinarily mixes stop/Y; qualified TERM removes terminal slot | Terminal `_` over bases 4..5 only; one keyboard stop, qualifier/completion explanation, no mismatch/chip | G TAA/TAG stop, TAC/TAT Y; F two-base partial TERM; PR 2 removed-stop evidence |
| `ATGAAATAA`, S=`MKKV`; separately S=`M` | Conceptual MK; extra KV / missing K | `+2 positions` chip / `−1 position` chip; no fabricated letters | G ATG=M, AAA=K, TAA stop; hand lengths 4−2 and 2−1 |
| `ATGTGGTGA`, table 99, S absent | 1 ATG M; 2 TGG W; 3 TGA table-1 stop | Assumed invariant solid M/W; assumed code-sensitive dashed red `*`, never `!` | G all 27 ATG Starts=M and TGG=W; table 1 TGA stop, table 4 TGA=W |
| `GTGTGG`, table 99, S absent, complete | 1 GTG table-1 V, starts in table 11 | Assumed code-sensitive dashed V | G table 1 GTG not start; table 11 Starts=M; #295 initiation sensitivity |
| `ATGGCNRAY`, table 99, S absent | 2 GCN=A invariant; 3 RAY={D,N} unresolved | Solid assumed A; dashed assumed `?` even though readings invariant | G four GC codons A; GAC/GAT D, AAC/AAT N across tables; #295 unresolved marker |
| `ATGTGGTAA`, table 99, S=`M` | Stored first M; assumed tail W,stop | Unverified stored M; solid assumed W, dashed red `*`; no short chip | G table 1 tail; PR 1 invalid-code unavailable and #295 tail contract |
| `ATGTGGTAA`, table 99, S=`MW` | Stored M/W cannot be compared under unknown code | Unverified stored cells, no curated/verified stop claims | G has no id 99; no reference translation of an invalid id claimed |
| `ATGTGATAA`, S=`MU`, exceptions `(pos:4..6,aa:Sec)` and `(pos:5..7,aa:Val)` | First maps TGA→U; second crosses codons | Conditional: whole-result-unavailable → unverified cells; valid-subset → explained lighter U, no stop/mismatch, plus failed-entry diagnostic | F single-codon rule; PR 2 owns failure policy (Open decision 3); no invalid application guessed |
| `ATGAAAGCTTAA`, `(pos:4..6,aa:TERM)`, S=`M*A`; separately `MKA` and `MXA` | 2: O=I=K, C=stop; conceptual M*A | Verified `!` for `*` (count 0); lighter K/X + stop edge (differing=[1], count 1). All say AAA ordinarily K, exception specifies stop | G AAA=K, GCT=A; F TERM=* overrides codon; terminal TAA removed |
| `GTGAAATAA`, `(pos:1..3,aa:Val)`, S=`VK` | 1: O=V, I=M, C=V | Lighter V exception mark, no mismatch; tooltip explains initiated M overridden by Val | G GTG ordinary V/Starts M; F Val=V; PR 2 applies exceptions after initiation |
| `ATGAAAGGGTAA`, S=`M` | Conceptual MKG, differing=[], storedShortBy=2 | `−2 positions`; length-only tooltip, no zero-codon clause; one file warning | G M,K,G then terminal stop; hand lengths 3−1=2 |
| `ATGAAATAA`, S=`MKV`; separately `MVV` | Conceptual MK; extra V; differing=[] / [1] | `+1 position`; length clause for both; MVV also says 1 codon; one warned CDS each | G AAA=K; lengths 3−2=1, V differs from K only in MVV |
| `ATGAAATAA`, S=`M`, `/exception="RNA editing"` | Conceptual MK; shortBy=1 | `−1 position`, length-only explanation retained; no file mismatch warning | G M,K; PR 1 suppression affects warning only |
| `ATGAAATAA`, GFF3 strand `.`, separately `?`, phase 0, S=`MK` | Biological orientation unknown despite numeric fallback | No codon lane/cells/chips/targets; details retain MK and unknown-strand reason | PR 1 eligibility; no inferred orientation |
| `ATGCCCAAATAA`, `order(1..3,7..12)`, S=`MK`; separately `join(1..3,J00194.1:7..12)` | Neither defines one locally available sequence | No codon lane/cells/chips/targets; details retain MK and nonlocal-location reason | F order is not join; remote bases unavailable; PR 1 geometry gate |
| `ATGAGATAA`, two complete CDSs A/B `1..9`, S(A)=`MR`, S(B)=`MK` | Codon 2 A: agreement R; B: K vs R | Both residues/explanations reachable, no occlusion. Separate-lane option: distinct rows; aggregate option: explicit chooser exposes both | G AGA=R; hand comparison; overlap presentation awaits Open decision 4 |
| `ATGAGATAA`, A/B `1..9`, both S=`MR`, only B has `(pos:4..6,aa:Arg)` | Same letters; B has a no-op applied exception | Independent A/B explanations; only B names qualifier; same collision choices as above | G AGA=R; F Arg=R no-op, distinct occurrence provenance |
| `ATGG`, `1..>4`, S=`M`; separately `ATGGC`, `1..>5`, S=`MA` | GNN unresolved dropped / GCN→A retained | No final target for G; normal A over bases 4..5 only for GC, one keyboard stop; no chip | G GNN spans V,A,D,E,G; all GC codons A; PR 1 padded-tail contract |
| empty sequence / empty coding extraction; no S or S=`M` | No codon | No cells/chips; unavailable feature explanation | F no complete coding position; PR 1 unavailable-empty contract |
| `ATGAGATAA`, S=`MK`, hit only on base 5 | 2 remains K vs R | Curated lighter cell plus outline over hit overlap | G AGA=R; mockup search compositing, no changed biological reading |
| `ATNNGAGATAA`, `join(1..2,5..11)`, S=`MK` | Coding ATG AGA TAA; 2 at bases 6..8: R vs K | Curated K difference; codon 1 split over 1,2,5; no intron paint | F concatenation AT + GAGATAA = ATGAGATAA; G AGA=R |

## Open decisions and unresolved acceptance gaps

1. **Unverified stored cells' additional visual.** The mockup does not show a stored protein
   over an unavailable comparison. Options: retain normal stored cells plus explanatory
   feature/codon targets (recommendation, preserves #295's approved stored-wins behavior),
   or give them the shared lighter fill with “cannot check” text. INSDC specifies no glyph;
   NCBI validator reports invalid code, Biopython 1.88 rejects unknown table ids (documented
   in #295), neither chooses this presentation. Do not silently label these as differences.
2. **Exception-terminal fill detail.** Retain existing `_` plus exception/partial
   tooltip (recommendation), or extend the lighter style to an exception-produced terminal
   slot. INSDC permits partial TERM; NCBI produces translation/stop semantics, not glyphs;
   EMBOSS/Biopython viewer behavior for this case was not verified. No custom partial
   residue should be invented. Retained padded-residue paint/targets are settled above;
   only optional terminal fill is open. This choice does not alter terminal omission.
3. **PR 2 failure policy (dependency, not a PR 3 default).** For invalid/off-codon entries,
   PR 2 decides between whole-computation unavailable and applying a verified valid subset
   with diagnostics. Recommendation: whole-computation unavailable until the annotation's
   intended protein can be established; preserve all occurrence evidence. PR 3 consumes the
   resolved `ConceptualTranslation` status and never promotes a failed entry into a
   substitution. The mixed valid/off-codon fixture above specifies both outcomes conditionally.
   No unavailable result certifies even an individually applied stop/mismatch. Resolve in
   PR 2 before implementing this branch.
4. **Overlapping feature presentation.** The mockup and standards do not choose separate
   lanes versus an accessible aggregate. Recommendation: extend the existing lane packer
   to put colliding feature-specific states/targets in separate lanes (including equal
   letters with different provenance), preserving whole-record stable packing. Alternative:
   an explicitly labelled aggregate cell with pointer/focus chooser listing each feature,
   literal residue, marks and full explanation; silent overpainting is forbidden.
   No confirmed default: settle before implementing collisions. The overlap fixtures above
   require both features to remain reachable under either approved choice.

The joined boundary fixture is specified exactly in verification below. No benchmark
or live accessibility/browser validation has yet been run; performance is an acceptance
requirement, not an achieved measurement. PR 2's named occurrence-evidence interface must be reconciled
with its final reviewed model before implementation. Questions here leave choices open;
they do not reopen the binding owner decisions.

## Verification boundary and coverage decision

The subject is the codon-mark projection and its real `SequenceTrack`/tooltip rendering:
given PR 1/2 evidence and stored protein, it emits exact visible marks and explanations.
Biological translation, exception mapping, imports, recompute and export are owned by
PRs 1/2; their results are inputs, not duplicated algorithms or new acceptance suites here.
Assumed-table policy belongs to #295; this PR protects its integration in the shared path.

| Guarantee/source | Existing protection inspected | Decision |
|---|---|---|
| Initiation lookup, RNA normalization / #261 | `initiatorResidue.test.ts` matches literal Starts rows for tables 1/11; lowercase `gug`→M while context-free GTG→V | Reuse lookup coverage; add projection-level complete/partial/phase and stored override distinction. Do not retest every codon lookup. |
| Mark classification and precedence / owner + PR 1 model | None found for new mark states | Add pure projection checks using the independent table, grouped by competing causes; reject false differences for compatible ambiguity, ordinary-residue wildcard X, valid initiators and applied exceptions. Include stop-over-X count 1, I→C exception overrides, cause-specific TERM explanations, unavailable allowed/denied claims and length-only/combined differences. |
| Lane, reverse, joined/origin geometry / OP-8 | `SequenceTrack.test.tsx` “splits a splice-crossing codon without painting the intron” asserts exact rectangles; origin case tests both strands | Reuse and strengthen same recorder boundary with differing/stop-edge states and hit targets on all pieces. Assert one logical keyboard stop; no gaps/intron painting. Include retained padded fragments, dropped fragments and partial TERM targets on actual bases only; no geometry for unknown-strand/order/remote inputs. |
| Search + stop edge + chip compositing / mockup | Existing active-search priority test draws overlapping active/other search backgrounds; none found for lighter cells/chips | Add canvas-recorder checks for white base, lighter S, base-facing edge on both strands, exact partial hit outline, longer/shorter chips. Add overlap/packing and real target checks after Open decision 4 is settled, including equal letters with distinct provenance. Browser visual check owns legibility and collisions; spy alone cannot prove appearance. |
| Zoom and transition preservation | `translationStyles.test.ts` pins shared threshold 5 and reduced-motion CSS; `SequenceTrack.test.tsx` low-zoom test keeps search within nucleotide band | Reuse threshold/transition checks; strengthen observable rendered targets at 5/just above 5, 12/just above 12 and 20, plus translation-off/protein modes. Reject hidden focus targets and stale explanations on zoom/pan. |
| Assumed vs stored, no false biological claims / #295 | Current `SequenceTrack.geneticCodes.test.tsx` asserts invalid-code `?` and a warning; this is predecessor behavior superseded by #295 | Reconcile with #295 tests at integration; add shared-path solid invariant/dashed sensitive, stored-wins and short assumed-tail checks. Never preserve obsolete `?`-everywhere assertions as scientific truth. |
| Tooltip and accessibility wiring | Existing genetic-code test gets a real warning button by accessible name; none found for new codon explanations/chips | Add real renderer/tooltip focus/hover checks, Escape/blur, escaped qualifier content, biological tab order and shared text. One browser journey checks actual focus rings, readable hover and search overlap on both strands. |
| Atomic refresh after edits; feature tooltip and hub count agree | PR 1's spec proposes invalidation tests; they were not executed/credited here | Add smallest integration check through real edited feature→track/tooltip update, rejecting stale mismatch marks after recomputation; reuse PR 1 tests for persisted protein/export. Hub and feature tooltip are sibling count consumers: assert the same definite-difference count, excluding agreeing initiation/exception and length-only marks, including effective stops against X. Feature/hub and codon/chip tooltips include length clauses and omit zero-codon clauses; `/exception` retains explanations. |
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
