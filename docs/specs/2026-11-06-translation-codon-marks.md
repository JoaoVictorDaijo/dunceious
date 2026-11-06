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
  `fix/cds-translation-invalidation` (PR #291): one protein in `metadata.translation`,
  read-only import provenance, recomputation after coding edits, conceptual comparison,
  counts and early-stop diagnostics. Cite that named model, not its changing line numbers.
- **PR 2:** NCBI-compatible `/transl_except` application and diagnostics. PR 3 consumes
  applied code-break provenance; it never parses an exception independently. Until PR 2
  supplies it, PR 1's `unavailable` reason is exactly `unsupported-exception`.
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
- effective reading and possible set **after** CDS initiation and PR 2's applied exception;
- whether initiation changed the reading; the applied exception's original qualifier,
  mapped position and replacement if any; and terminal-stop/partial-end provenance.

This is derived evidence, not a second stored protein. Include a dropped terminal stop
in provenance with no protein index; otherwise its slot could become a false length
mismatch. PR 2 must supply the applied exception evidence from its own mapper, including
partial TERM. Names of PR 2's final types/functions are not yet verified and are not
invented here. Its integration contract is this evidence, including failed applications.

**`conceptualTranslation`** remains the sole effective translator. **`initiatorResidue`**
remains the sole Starts-row lookup (currently in `src/domain/bio/sequence.ts`, exported
through `index.ts`); it must not be copied into rendering. Only codon 1 of a known
5′-complete CDS with `/codon_start=1` is eligible. A literal exact triplet is required by
PR 1; internal GTG stays V under table 11. Prefer the stored first residue when present.

**`compareTranslation(stored, conceptual)`** retains PR 1's definite-disagreement policy
and its `differing`, `storedExtra`, `storedShortBy` outputs; its comparison is against
effective, not ordinary, readings. Attach the codon provenance to a presentation result
without changing wildcard policy. Stored X is unknown, not a definite mismatch. An
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

For each codon let S be the stored residue if present, O its ordinary code reading and C
its effective conceptual reading. D is the displayed residue: S when present, otherwise C,
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
| Ordinary agreement | Available C; no definite mismatch and no change of O through initiation/exception | Normal cell; no warning | “{D} ({name}). {triplet} reads {C} under table {table}.” Normal cells need no extra tab stop. |
| Curated difference | S exists and index is in `differing`; C is not a definite internal stop | Lighter cell, retain S | “Annotated {S} ({name}). DNA reads {triplet}, {C} ({name}) under table {table}. Stored /translation differs here.” For ambiguous O/C name the possible readings, not a single definite residue. |
| DNA stop hidden by annotation | Definite effective internal stop at index and S is a non-stop, non-X residue | Lighter S cell plus 3 px red base-facing edge | “Annotated {S} ({name}). DNA reads {triplet}, a stop under table {table}. Early stop in the DNA; the annotation has a residue here.” |
| Verified early stop | Definite effective internal stop; no S or S is `*` | Existing solid red cell with white `!` | “Early stop. {triplet} reads a stop under table {table}, before the end of the CDS.” If produced by an exception, append that exception's explanation. |
| Initiator substitution | Known complete codon 1, phase 1, exact Starts-row M and ordinary reading differs from M; D is M and no mismatch | Shared lighter cell, M retained | “Initiator M (Met). {triplet} ordinarily reads {O} under table {table}; a complete CDS starts with M at this codon.” This is valid initiation, not a curated mismatch. |
| Applied exception substitution | PR 2 reports an applied exception changing ordinary reading; D agrees with effective result, no mismatch | Shared lighter cell, effective/stored letter retained | “Translation exception: {qualifier}. {triplet} ordinarily reads {O} under table {table}; the annotated exception specifies {C} ({name}).” Do not claim experimentally verified recoding. |
| Assumed invariant | Invalid code, no S at this index; #295 supplies a resolved invariant residue | Reuse #295 normal solid cell | “{D}, assuming table 1. {triplet} reads {D} in every NCBI code. /transl_table={value} is not an NCBI genetic code.” Resolved IUPAC: “Every reading of {triplet} is {D} in every NCBI code.” |
| Assumed code-sensitive | Invalid code, no S; #295 `codeSensitive` or unresolved `?` | Reuse dashed marker, no new lighter warning fill; strand letter, red `*` for definite assumed stop, never `!` | Use `assumedCodonDescription`: “{triplet}: {D}, assuming table 1”, followed by other readings with table ids; unresolved triplets name their table-1 possibilities and whether codes differ. Include invalid qualifier value. |
| Unverified stored residue | S exists but conceptual result unavailable | Retain S, feature warning target; no definite curated-difference or early-stop mark | “Annotated {S} ({name}). Cannot check against DNA: {reason}.” Reasons explicitly name invalid code or unapplied exception. S never inherits an assumed-table dashed mark. Additional visual differentiation is an open decision below. |

An effective internal stop with stored X preserves X (PR 1 wildcard), but needs a DNA-stop
explanation; use the base-facing stop edge and say “Annotated X (unknown). DNA has an early
stop here.” It is not counted as a definite curated mismatch. A stored `*` at an effective
sense codon is a curated difference with literal `*`, not a verified `!`.

An applied no-op exception has no lighter substitution mark; its ordinary tooltip still
names the qualifier. An ordinary ATG→M has no initiator substitution mark. A terminal stop
is the existing terminal glyph `_`, never `!` or a curated mismatch just because stored
proteins omit it. Applied terminal TERM similarly gets an exception explanation at the
terminal slot, not an internal-stop edge.

**Precedence and composition, highest first:**

1. Unavailable comparison suppresses all definite mismatch/early-stop claims; invalid-code
   slots without S use #295's assumed state. Do not compare to assumed table 1.
2. Effective internal stop selects hidden-stop, verified-stop or unknown-X stop-edge state.
   Raw ordinary stops replaced by a valid PR 2 exception are not early stops.
3. Definite curated mismatch selects lighter S, even if initiation or an exception also
   applies. Tooltip adds “Expected {C} after initiation/exception” and its provenance.
4. Applied exception, then initiator substitution selects the lighter explained state.
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
not in the next codon slot. `+N aa` means exactly `storedExtra.length`; `−N aa` exactly
`storedShortBy`, excluding the terminal stop. Tooltip/accessibility text:
“Annotated protein is N translation positions longer/shorter than the DNA-derived protein
(terminal stop excluded). Stored residues past the last translated position: {extra}”
or “N DNA-derived positions have no annotated residue.” Use “positions” on the chip too
if internal stops are present, following PR 1's count distinction. The mockup's `aa` wording
is retained for proteins without internal stops. List long extras in scrollable tooltip
content, with the exact total available; never truncate without indicating it.

“Annotation differs from DNA at N codons” uses `differing.length`, not the number of lighter
cells: initiation, valid exceptions, wildcard X and length-only differences are excluded.
Label length differences separately. Reuse PR 1's DNA count and #295's unverified hub
number (italic, dotted underline, explanatory footnote); do not revert to the mockup's
older plain count for invalid codes.

Mapping uses extraction provenance and `codonSpans`, with no genomic endpoint subtraction.
Split/joined, circular and alignment-gap codons get the same state on every actual piece;
never paint introns or gaps. One residue letter appears on the existing longest-piece
label anchor, deterministic in a tie. All pieces point to the same codon explanation.
Reverse complementation happens before comparison. A reverse codon label remains upright,
and codon 1 starts at the biological 5′ end, not the lowest screen coordinate.

Skip phase-leading bases; no codon number or mark is attached to them. A final one/two-base
fragment is drawn over actual bases only if PR 1 emits a retained padded residue. Tooltip
says “Partial codon {fragment}; padded with N for conceptual translation; {C} under table
{table}.” Never label synthetic N positions as sequence positions. If PR 1 drops the
fragment, no residue mark is invented. PR 2's applied partial TERM may supply a terminal
slot over actual one/two bases, with its qualifier and completion explanation. A 5′ partial
end disables initiator substitution; a 3′ partial end disables complete-end dual-stop
reinterpretation. Empty CDS/no coding bases has no cells/chip, and its feature warning
says why comparison is unavailable; it must not manufacture a `+N` difference.

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
edge; its information remains in the feature tooltip. Reserve chip geometry in its own
lane so it does not cover neighboring CDS cells or intercept their hover targets.

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
| same DNA, S=`MXA` | 2: stored unknown, definite DNA stop | X + stop edge, no definite mismatch count | G stop plus PR 1's explicit stored-X comparison policy |
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
| `ATGT`, `/transl_except=(pos:4,aa:TERM)`, S=`M` after PR 2 | Final T completed to TAA by qualified TERM | Terminal exception tooltip over base 4; no `!` or length mismatch | F explicit single-base partial TERM example; G TAA stop |
| `ATGAAATAA`, S=`MKKV`; separately S=`M` | Conceptual MK; extra KV / missing K | `+2 aa` chip / `−1 aa` chip; no fabricated letters | G ATG=M, AAA=K, TAA stop; hand lengths 4−2 and 2−1 |
| `ATGTGGTGA`, table 99, S absent | 1 ATG M; 2 TGG W; 3 TGA table-1 stop | Assumed invariant solid M/W; assumed code-sensitive dashed red `*`, never `!` | G all 27 ATG Starts=M and TGG=W; table 1 TGA stop, table 4 TGA=W |
| `GTGTGG`, table 99, S absent, complete | 1 GTG table-1 V, starts in table 11 | Assumed code-sensitive dashed V | G table 1 GTG not start; table 11 Starts=M; #295 initiation sensitivity |
| `ATGGCNRAY`, table 99, S absent | 2 GCN=A invariant; 3 RAY={D,N} unresolved | Solid assumed A; dashed assumed `?` even though readings invariant | G four GC codons A; GAC/GAT D, AAC/AAT N across tables; #295 unresolved marker |
| `ATGTGGTAA`, table 99, S=`M` | Stored first M; assumed tail W,stop | Unverified stored M; solid assumed W, dashed red `*`; no short chip | G table 1 tail; PR 1 invalid-code unavailable and #295 tail contract |
| `ATGTGGTAA`, table 99, S=`MW` | Stored M/W cannot be compared under unknown code | Unverified stored cells, no curated/verified stop claims | G has no id 99; no reference translation of an invalid id claimed |
| `ATGTGATAA` with unapplied/off-codon exception, S=`MW` | Conceptual unavailable per PR 1/PR 2 diagnostics | Unverified stored residue, no guessed exception/mismatch | F exception must identify translated codon; no application oracle asserted for malformed entries |
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
2. **New terminal and partial glyph detail.** Retain existing `_` plus exception/partial
   tooltip (recommendation), or extend the lighter style to an exception-produced terminal
   slot. INSDC permits partial TERM; NCBI produces translation/stop semantics, not glyphs;
   EMBOSS/Biopython viewer behavior for this case was not verified. No custom partial
   residue should be invented. This choice does not alter the terminal omission rule.

The joined boundary fixture is specified exactly in verification below. No benchmark
or live accessibility/browser validation has yet been run; performance is an acceptance
requirement, not an achieved measurement. PR 2's applied-evidence interface must be checked
against its reviewed model before implementation. Questions here leave choices open;
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
| Mark classification and precedence / owner + PR 1 model | None found for new mark states | Add pure projection checks using the independent table, grouped by competing causes; reject false differences for compatible ambiguity, X, valid initiators and applied exceptions. Include unavailable allowed/denied claims and length-only differences. |
| Lane, reverse, joined/origin geometry / OP-8 | `SequenceTrack.test.tsx` “splits a splice-crossing codon without painting the intron” asserts exact rectangles; origin case tests both strands | Reuse and strengthen same recorder boundary with differing/stop-edge states and hit targets on all pieces. Assert one logical keyboard stop; no gaps/intron painting. |
| Search + stop edge + chip compositing / mockup | Existing active-search priority test draws overlapping active/other search backgrounds; none found for lighter cells/chips | Add canvas-recorder checks for white base, lighter S, base-facing edge on both strands, exact partial hit outline, longer/shorter chips. Browser visual check owns legibility and chip collisions; spy alone cannot prove appearance. |
| Zoom and transition preservation | `translationStyles.test.ts` pins shared threshold 5 and reduced-motion CSS; `SequenceTrack.test.tsx` low-zoom test keeps search within nucleotide band | Reuse threshold/transition checks; strengthen observable rendered targets at 5/just above 5, 12/just above 12 and 20, plus translation-off/protein modes. Reject hidden focus targets and stale explanations on zoom/pan. |
| Assumed vs stored, no false biological claims / #295 | Current `SequenceTrack.geneticCodes.test.tsx` asserts invalid-code `?` and a warning; this is predecessor behavior superseded by #295 | Reconcile with #295 tests at integration; add shared-path solid invariant/dashed sensitive, stored-wins and short assumed-tail checks. Never preserve obsolete `?`-everywhere assertions as scientific truth. |
| Tooltip and accessibility wiring | Existing genetic-code test gets a real warning button by accessible name; none found for new codon explanations/chips | Add real renderer/tooltip focus/hover checks, Escape/blur, escaped qualifier content, biological tab order and shared text. One browser journey checks actual focus rings, readable hover and search overlap on both strands. |
| Atomic refresh after edits; feature tooltip and hub count agree | PR 1's spec proposes invalidation tests; they were not executed/credited here | Add smallest integration check through real edited feature→track/tooltip update, rejecting stale mismatch marks after recomputation; reuse PR 1 tests for persisted protein/export. Hub and feature tooltip are sibling count consumers: assert the same definite-difference count, excluding initiation/exception/length-only marks. |
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
