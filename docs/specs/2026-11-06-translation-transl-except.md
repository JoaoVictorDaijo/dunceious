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

PR 2 extends merged [PR #291](https://github.com/JoaoVictorDaijo/dunceious/pull/291),
now present in `fix/cds-transl-except` through `integration/murilo-review`. The sibling
[stored-protein spec](2026-11-06-translation-stored-protein-provenance.md) is historical;
its two Open decisions record the owner's resolutions. This spec also carries PR 1's small
GFF3 phase-editor follow-up. PR 3 owns codon drawing and consumes the evidence defined here.
No source implementation, project-format bump, migration, undo system or remote fetch is added.

## Owner decisions — 2026-11-06

Each numbered item records the supplied answer and agreed reading. The four clarifications
explicitly held by the owner are under Open decisions, marked awaiting owner.

1. “Export genbank with trasnlation.” Keep writing an untouched supplied `/translation` on
   a CDS of a protein record. This is supplied data, never nucleotide verification.
   **Backed by: owner decision 2026-11-06**, choosing preservation over PR 1's suggested filter.
2. GFF3 phase is read-only; edit frame through `/codon_start`. PR 2 carries the editor follow-up;
   multipart downstream phases are regenerated, not edited independently.
   **Backed by: owner decision 2026-11-06**; phase/frame equivalence follows TRANS-2 and FMT-11.
3. “when moving a cds with codebreak, when saving the modification user must be informed
   the code breakes makes no longer sense and will be removed”. After move, reverse or reframe,
   remove breaks that no longer name a CDS codon and tell the user exactly which ones **before
   Save completes**. Plain-move shifting versus absolute positions remains awaiting owner.
   **Backed by: owner decision 2026-11-06**, replacing the proposed retain-for-repair behavior.
4. OTHER/Xaa X matches any sense amino acid, including U and O; a definite DNA stop wins.
   Expand stored B/Z/J to DN/EQ/IL and compare set overlap; stored X is the ordinary wildcard.
   **Backed by: owner decision 2026-11-06**; references do not define this app's mismatch metric.
5. “compute protein and informe invalid codebreak will be removed”. Drop an otherwise valid
   but unusable occurrence with a visible notice and compute using the usable entries. The
   adjusted result is usable for comparison, counts and export, not an unverified subset.
   **Backed by: owner decision 2026-11-06**, overriding whole-CDS-unavailable suggestion.
6. “Reject import; prohibit silent guesses and automatic corrections, requiring strict
   compliance.” Malformed syntax/shape refuses GenBank file import, including off-frame,
   partial-codon, non-T/TA short TERM, missing or unknown residue. The refusal names CDS,
   occurrence, literal value and rule. Correct names in any capitalisation pass. This overrides
   #286's qualifier-warning rule **only for `/transl_except`**. GFF3/project scope awaits owner.
   **Backed by: owner decision 2026-11-06**, stricter than NCBI permissive rounding/X fallback.
7. Resolve qualified positions by exact equality with the current record's separate
   `SeqRecord.accession` or `SeqRecord.version` field, when populated. With ACCESSION `R` and
   VERSION `R.1`, both `R` and `R.1` match their respective fields; `R.2` does not match.
   A bare accession matches only by exact equality with the accession field, never by stripping
   a version. No record id, display name, aliases or fetching. Another identity's drop-versus-refuse
   classification awaits owner.
   **Backed by: owner decision 2026-11-06**; INSDC remote syntax alone does not define aliases.
8. “export anyways, but warn informing a annotation is being broke. in the exported the
   annotation start will have those identifiers to explain annotation continues/annotation
   is not finished”. Export clipped CDSs with visible warning and INSDC `<`/`>` at cut ends.
   Never copy their old full protein. Drop code breaks whose codon the cut destroys and report
   each loss; a full retained codon can be rebased. Clipped `/translation` and mid-codon frame
   handling remain awaiting owner as instructed.
   **Backed by: owner decision 2026-11-06** for proceeding/warning; INSDC 11.4 single-codon
   requirement and §3.4 partial locations for keeping only valid codons and marking cut ends.
9. “The text inconsistency must be resolved using data from the original file to ensure
   validity without breaking line formatting or losing details”. Encode representable text
   losslessly with doubled quotes and safe wrapping; do not block merely because it has quotes
   or a slash fragment. PR 2 covers syntax-validated `/transl_except` and ordinary text whose
   tokens fit the physical line; other free-text over-long tokens are outside this PR under
   [issue #308: GenBank writer over-long tokens](https://github.com/JoaoVictorDaijo/dunceious/issues/308).
   This is not permission to repair malformed biological assertions.
   **Backed by: owner decision 2026-11-06**; INSDC 11.4 §3.3.3.1 specifies doubled quotes.
10. Unverified stored cells use normal drawing with hover explanation, not mismatch fill.
    **Backed by: owner decision 2026-11-06**; PR 3 owns rendering.
11. Keep `_` as the displayed stop glyph with an explanation that it denotes a stop; do not silently change PR 3's existing glyph.
    **Backed by: owner decision 2026-11-06**; presentation policy, not a residue code.
12. Overlapping CDSs have separate lanes and evidence/targets.
    **Backed by: owner decision 2026-11-06**; PR 3 owns rendering.

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

## Contract and merged-code extension points

The subject is the pure conceptual CDS translator plus import, save and interchange boundaries.
It receives local sequence, biological geometry, frame, genetic code and ordered exception
values; it produces an adjusted protein and per-occurrence diagnostics, or an eligibility
reason. It preserves an untouched supplied protein. PR 3 drawing and general location grammar
belong to their respective components, not this translator.

The following names were checked against merged PR 1 code in this checkout; they are not
proposed function names. New exception parsing/mapping helpers can be named during implementation.

| Actual home and function/type | Extension required |
|---|---|
| `src/domain/bio/types.ts`: `BioFeature`, `ConceptualTranslation` | One canonical ordered `translationExceptions?: string[]`; evidence on both result variants. No metadata duplicate. |
| `src/domain/bio/translation.ts`: `conceptualTranslation` | Replace scalar `metadata.transl_except` blanket `unsupported-exception` gate with validated array application. Its current `TranslationRecord` lacks identity fields: carry both `accession` and `version` into the input for exact qualified-position matching. Preserve other eligibility reasons. |
| Same: `resolvedTranslationFeature`, `checkTranslation`, `checkedTranslation` | Reuse biological orientation resolution; cache adjusted result/evidence; never trust project caches. |
| Same: `compareTranslation`, `translationWarning`, `translationReason`, `translationDescription` | Compare adjusted possible sets including OTHER sense wildcard; expose drops separately from mismatch; preserve stop-over-stored-X and length discrepancy semantics. |
| `src/domain/bio/sequence.ts`: `extractCodingSequence`, `featureTranslTable`, `initiatorResidue` | Reuse extraction/phase, table validation and Starts rule; keep removed-terminal real base map before trimming. No endpoint subtraction. |
| `src/core/genbank/qualifierParser.ts`: `parseQualifiers`; `featureParser.ts`: `parseFeatures` | Current parser is scalar last-value-wins. Capture all exception occurrences in order, including empty values for refusal; pass canonical array into features and retain finding context. |
| `src/core/genbank/headerParser.ts`: `parseHeader`; `toSeqRecord.ts`: `toSeqRecord` | Preserve separate parsed ACCESSION and VERSION fields through worker publication and translation input; do not collapse them to one accession string. |
| `src/core/genbank/validation.ts`: `validateRecord`; `toSeqRecord.ts`: `toSeqRecord` | Run syntax/shape checks after sequence/location available, produce refusal findings naming CDS/value/rule before publishing any records from that file. |
| `src/workers/handlers/bio.ts`: `handleBioMessage`, `routeBioMessage` | Carry array/findings through real GenBank worker import and prevent partial file publication on refusal. Existing checkTranslation call must use adjusted results. |
| `src/core/formats/gff3.ts`: `parseAttributes`, `readRows`, `parseGFF3`, `addQualifiers`, `exportToGff3` | Split raw list commas before decoding; aggregate occurrences from every same-ID row; serialize array once on first emitted row, with inner commas encoded. |
| `src/app/logic/bioResponse.ts`: `applyParseSuccess`, `applyAnnotations`, `logAttachedTranslationWarning` | Normalize/check attached features against receiving record, show drop notices and preserve imported protein. GFF3 refusal scope is pending. |
| `src/app/logic/featureManager.ts`: `saveEditedFeature` | Compare array as biological input; sanitize unusable entries, recompute with retained ones and report losses before committing save. Keep unrelated edits/provenance. |
| `src/app/components/FeatureEditorModal.tsx`: `commitRows`, `updateRow`, preview calling `saveEditedFeature` | Ordered repeated exception rows, shared preview/save diagnostics, phase read-only alongside translation; frame edited by codon_start. Do not expose a rename/delete path that bypasses read-only phase. |
| `src/app/logic/projectFile.ts`: `validRecord`, `serializeProject`, `parseProject` | Validate/preserve optional string array in format 2, discard derived checks and recompute; malformed import disposition pending. No legacy scalar migration. |
| `src/core/genbank/serialize.ts`: `serializeRecord`, `exportToGenBank`; `qualifierRules.ts`: `formatQualifier` | Emit repeated exceptions, scoped lossless text quotes/wrap (ordinary tokens must fit), adjusted protein policy and report. Keep supplied protein-record CDS translation (answer 1). |
| `src/core/exportReport.ts`: `ExportReport`; `src/app/logic/exportPlan.ts`: `serializeExport`, `describeExport` | Carry code-break loss and clipping diagnostics to actual export preview/result, not console alone. |
| `src/domain/bio/intervals.ts`: `clipFeature`, `sliceRecordsBySelection` | Return sliced records plus structured domain losses; transform exception base coordinates with geometry, mark cut ends and drop cut-destroyed codons. Existing clipFeature removes clipped translation and adjusts codon_start; owner-held question must be resolved before changing that policy. |
| `src/app/hooks/useFileHandlers.ts`: `exportSelectionJson` | Consume sliced records and losses, aggregate per-record losses and present named warnings before JSON download; project serialization must not bypass notice delivery. |

### Canonical values and import

Absent/empty array means no assertion; `['']` means malformed empty assertion. Preserve order,
multiplicity, spelling and logical text after flat-file unfolding; byte-identical wrapping is
not promised. No scalar `metadata.transl_except` or `_gffLists.transl_except` remains after
normalization. Qualifier editor rows, clones, projects and selection copies preserve the array.
No metadata-wide array conversion. GenBank repeated lines must not collapse to their last value.

GFF3: split literal list commas before percent decoding each item exactly once. Repeated
attributes append. In `parseGFF3`'s existing `(seqid, ID)` aggregation, append each row's items
in file/list order before segment ordering. Do not discard later-row qualifiers. Export encoded
items joined by literal commas, list once on first CDS row. **Backed by:**
[NCBI GFF guide](https://www.ncbi.nlm.nih.gov/genbank/genomes_gff/), Attributes.

### Answer 5/6 boundary

Classify syntax/vocabulary first, then shape when geometry is available, then usability.
No off-frame rounding, residue-name fallback, guessed coordinates or silent correction.
A whole three-base range entirely outside the CDS is not declared off-frame against an
invented CDS offset. If geometry is unavailable, defer mapping explicitly; never guess.

| Situation | Classification | Import/save outcome |
|---|---|---|
| Broken `(pos:...,aa:...)`, empty value/residue, unknown name, illegal position token | Malformed (6) | Refuse GenBank file, naming CDS/value/rule; editor Save cannot commit malformed authoring. |
| Within CDS but offsets are not exactly `3k,3k+1,3k+2`; internal one/two-base break; short non-TERM; short TERM on non-T/TA | Malformed shape (6) | Same refusal; no protein or partial file publication. |
| Complete well-formed codon range outside CDS | Otherwise valid but unusable (5) | Drop that occurrence, visible notice; use remaining breaks to compute. |
| Same codon with different recognized residues | Otherwise valid but conflicting (5) | Drop with notice; which assertion(s) survive is awaiting owner. No automatic last-wins policy. |
| Another exact accession; malformed GFF3/project input | Held boundary | Await owner decisions below; no inferred refusal/drop choice. |
| Missing explanatory note for OTHER or terminal polyadenylation | Conformance warning | Keep valid break, compute; never invent note. |
| Repeated base visits cannot identify one codon occurrence | Otherwise valid but unusable (5) | Drop with notice rather than choosing a visit. |

**Backed by: owner decision 2026-11-06**, answers 5/6, overriding the earlier #286 warning-only
policy for malformed GenBank `/transl_except`. NCBI's permissive behavior is evidence, not
permission to weaken this boundary. `/exception` suppresses only PR 1 mismatch warnings,
never refusal or code-break loss notices. Broken feature geometry retains existing guards.

### Mapping, residue application and evidence

Qualifier positions are 1-based inclusive entry bases; convert once to internal zero-based
bases. Use extraction's biological map through joins, circular origin and per-interval
complements; aligned columns are not entry bases. Skip codon_start−1 at the biological 5′ end.
A complete break identifies exactly three consecutive coding offsets `3k..3k+2` in biological
orientation. A split codon may use `join`; a genomic range including introns cannot name it.
Match a qualified identifier against the current record's separate accession and version fields
by exact string equality as in owner answer 7; pass both through every translation caller.
`R.1` matches VERSION `R.1`; `R` matches ACCESSION `R` only. A different version is not this
record, even if its prefix matches. Never derive another identity by stripping a version or
using an alias; no cross-record lookup.

Accept INSDC §7.4.3 one/three-letter names case-insensitively: Sec/U→U, Pyl/O→O,
Asx/B→DN, Glx/Z→EQ, Xle/J→IL, Xaa/X and OTHER→sense wildcard, TERM→stop, ordinary
residue pairs. `u`, `sEc`, `term` pass without changing raw text. `Banana`, `Selenocysteine`
and NCBI's nonstandard Xxx alias are not INSDC names and fail; no X fallback.
**Backed by:** INSDC 11.4 §3.3.3.2 case-insensitive vocabulary and §7.4.3;
**Backed by: owner decision 2026-11-06** for strict spelling. NCBI `x_ValidAminoAcid`
accepts multi-letter case but has case-sensitive single letters and permissive X fallback;
this app deliberately does not inherit those fallbacks.

A terminal point/two-base TERM must name the entire remaining suffix T/TA (U/UA in RNA)
in coding orientation, including on reverse strand. It establishes TAA completion without
inserting sequence or extending the feature. It applies even on a partial parent CDS;
a partial flag on the break itself does not identify exact bases and is malformed shape.
**Backed by:** INSDC 11.4 `/transl_except`; NCBI `CSeqTranslator::Translate` and
`TranslateToProtein` at `912b751` apply explicit TERM and remove the final definite stop
independently of parent completeness.

Preserve protein-record gating before nucleotide computation. Other primary reasons remain
invalid-code, unknown-strand, nonlocal-location, unknown-completeness and empty. Gather independent
syntax/name diagnostics on every occurrence; defer geometry-dependent checks on missing inputs.
A malformed annotation cannot replace a primary protein-record reason inside the pure translator;
the import boundary separately owns file refusal. No assumed table can certify an exception.

Produce PR 1 ordinary IUPAC/U codon sets, initiation, terminal-table context and N-padding rules,
then apply usable exceptions **after** initiation but **before** definite final-stop removal.
Sec/Pyl replace DNA stop readings; TERM introduces a stop. OTHER/Xaa possible sense set includes
`ACDEFGHIKLMNPQRSTVWYUO`, never `*`; B/Z/J compare through overlap. Retain internal `*`, do
not truncate. Final definite `*` is removed, even at partial ends. Recompute `internalStops`
and `threePrimeIndeterminate` from adjusted states. Counts include X/U/O/internal stops once
per retained position; call them positions when stops are present.
**Backed by:** NCBI `CSeqTranslator::Translate` substitution after initiation; PR 1 owner rule
for keeping internal stops; **Backed by: owner decision 2026-11-06** for OTHER comparison.

Identical normalized location/residue assertions apply once, preserving each raw occurrence;
NCBI stable sorting plus adjacent equality supplies this evidence, not a license to erase raw
entries. Conflicting assertions await owner survivor choice. All identity/strand decisions preserve raw text. An omitted strand on a simple same-record
range inherits known CDS strand as location context; an explicitly contrary orientation is
not silently corrected and fails the exact-codon-orientation rule. NCBI cleanup repairs contrary
strand, but **Backed by: owner decision 2026-11-06** (6) prohibits automatic correction.

Both result variants carry ordered
evidence: feature, occurrence index, literal raw value, parse/residue status, mapped real bases,
zero-based codon index, applied/dropped/deferred status and reason. Retain removed-terminal
slot evidence even after residues/possible are trimmed; PR 3 must not fabricate a residue for it.

## Save, provenance and PR 1 phase follow-up

All existing biological triggers remain: geometry, evaluated strands, frame, table, partial ends,
CDS type, sequence/molecule type. Compare ordered exception values as well. Re-evaluate membership,
frame and orientation after moves/reversals/reframes. Remove newly unusable breaks and show CDS,
raw value, occurrence and reason **before Save completes**; preview and final Save use the same
validation. Plain move coordinate maintenance awaits owner. Malformed authoring cannot Save;
an old valid break invalidated by geometry follows answer 3 removal, not import refusal.
**Backed by: owner decision 2026-11-06**. No undo or approval dialog is prescribed.

After cleanup, success without internal stops writes adjusted residues to the sole
`metadata.translation`, source computed. Failure/internal stops removes it, source removed,
with reason. Untouched imported protein stays literal/imported even if a break is dropped at
import; comparisons use the cleaned conceptual result. Unrelated label/colour/note edits keep
protein/provenance; note edits refresh note-dependent diagnostics on preview/save. Project load
discards `_translationCheck`, normalizes location, rechecks with DNA and preserves PR 1's
protein-record guard (forged computed protein is removed; imported remains supplied data).

For the small PR 1 follow-up, make GFF3 phase key and value read-only and prevent deletion or
renaming into an editable substitute. Display derived phase; direct frame editing to
`/codon_start`. `saveEditedFeature` already clears phase caches on geometry/frame change;
`partPhases` regenerates them. Keep that wiring. **Backed by: owner decision 2026-11-06**.

PR 3 draws unverified supplied cells normally, explains inability to verify in hover, retains
`_` with its explanation, and separates overlapping CDS lanes. An unavailable result establishes
neither a zero mismatch count nor a DNA stop. **Backed by: owner decision 2026-11-06** (10–12).

## GenBank/GFF3 and selection export

Emit valid exception values as separate unquoted structured qualifiers, in order. Do not invent
exceptions from protein differences. Untouched proteins retain provenance; after a biological
edit export only successful adjusted protein without internal stops, otherwise omit with notice.
Keep supplied `/translation` on protein-record CDSs; no DNA verification is implied.

PR 2's lossless promise covers syntax-validated `/transl_except` values and quote doubling /
slash-safe wrapping for ordinary printable text whose tokens fit within the line's available
columns (INSDC columns 22–80, including qualifier/quote overhead where applicable). Validated
exception syntax cannot contain the arbitrary free-text payload described below.
Representable text uses INSDC quote doubling, not backslash escaping. Extend `formatQualifier`
so its physical continuations never begin with `/` after indentation; reader and writer must
preserve logical value, spaces and structure. `parseQualifiers` already decodes doubled quotes
but its continuation heuristics and last-value store need review. Preflight actual formatted
lines against literal logical expectations; never silently normalize, drop details, create another
qualifier or invent a translation within this scoped guarantee. An over-long unbroken token
in any other free-text qualifier is a pre-existing general GenBank writer limit, outside PR 2;
it is tracked separately as [issue #308: GenBank writer over-long tokens](https://github.com/JoaoVictorDaijo/dunceious/issues/308).
This spec defines no new export disposition or owner question for that case.
**Backed by: owner decision 2026-11-06** and INSDC 11.4 §3.3.3.1, §4.

Transport round-trip is separate from biological acceptance. Malformed exception values such
as `"garbage"` or 64 unbroken A characters followed by ` /translation="FAKE"` are refused
at entry under answer 6, never repaired by quote escaping. Ensure syntax guards at GenBank
import, GFF3 import (pending held import scope), project open (same pending scope) and editor
Save. The writer defensively refuses any malformed exception that reaches it, naming the CDS,
value and syntax rule; it never guesses, emits a forged qualifier or silently omits the value.
These malformed values are unreachable in the writer when all entry points enforce syntax.
If GFF3/project are allowed to retain them, their explicit export consequences belong to held
import-scope decision 2, not a separate long-token decision. Ordinary free-text quotes and
slash fragments remain lossless and must not be blocked when their tokens fit the line.

For a fully retained codon, transform each real base through selection/reversal with the CDS;
serialize complement as needed and recompute against exported sequence. A selection-destroyed
codon cannot retain its old exception; drop it and report which annotation was broken. Mark
cut ends with `<`/`>` on the actual interval endpoints; reverse strand biological 5′ partial
appears at the high coordinate. Never copy the full source protein. Export proceeds with warning,
not whole-file block or CDS omission. Clipped translation/frame policy is held below. Apply the
same biological losses/rebasing in GFF3; general partial-location encoding follows its existing
location contract. In-memory source record and its protein must remain unchanged.
**Backed by:** INSDC 11.4 single-codon/location rules; **Backed by: owner decision 2026-11-06**.

Selection loss delivery is part of slicing, including project JSON. Change
`sliceRecordsBySelection` from returning only records to returning `{ records, losses }`;
`clipFeature` contributes to that loss collection. Define the canonical loss type in
`src/domain/bio/types.ts`, with source record/CDS identity, clipping reason and, for each
removed exception, its original zero-based occurrence index, literal value and removal reason.
Clipping itself has a feature-level loss even when no exception is removed. Preserve source
identities and occurrence indices before filtering/rebasing. The domain must not import
`ExportReport`; core/app consumers carry these domain losses into `ExportReport` and the
existing export preview/result presentation without discarding their details. Update all slicer
callers to consume the returned records and carry losses to their appropriate presentation.

In `useFileHandlers.ts`, `exportSelectionJson` must keep its aligned-to-biological coordinate
conversion, collect both fields from each slice, and serialize only the returned records into
the selected project. After all slices are collected and before `downloadBlob`, present every
clipped-CDS and exception-loss detail via visible `addLog` warnings naming the source record,
CDS, occurrence/value where applicable, and reason. Then download and log completion as usual;
a completion-only message is insufficient. Reuse the same loss descriptions as export-plan
presentation; JSON need not pass through a GenBank/GFF3 writer to deliver them. Losses are
operation diagnostics, not a new persisted project field or format version. Full-retention
slices produce no clipping/removal warning. Source records, exception arrays and stored proteins
remain unchanged; all cleanup happens on copies.

## Independent-oracle acceptance cases

Inputs below use entry coordinates and table 1, codon_start 1, exact ends unless stated.
They are **literal hand derivations**, not executed outputs. Codon strings follow gc.prt 4.6;
positions follow INSDC 11.4, application order follows the cited NCBI source. Implementations
must not generate expected values using the translator under test. Group cases by boundary;
rows do not prescribe one test each. Tests/build were not run for this documentation task.

### Translator and validation boundary

| Literal input | Hand-derived required output |
|---|---|
| CDS `1..12`, DNA `ATGTGACCCTAA`, `(pos:4..6,aa:Sec)` | ATG/TGA/CCC/TAA → M/U/P/stop → `MUP`; possible `[M,U,P]`, no internal stop. Stored MUP agrees; MKP differs at index 1. |
| Same RNA `AUGUGACCCUAA` | `MUP`; unchanged RNA sequence. |
| DNA `ATGTGATAGCCCTAA`, CDS `1..15`, breaks `(pos:4..6,aa:Sec)`, `(pos:7..9,aa:Pyl)` | M/U/O/P/stop → `MUOP`, both occurrences applied. |
| `ATGAAATGA`, `1..9`, `(pos:7..9,aa:Sec)` | M/K/U → `MKU`; overridden final stop stays U. |
| `ATGAAACCCTAA`, `1..12`, `(pos:4..6,aa:TERM)` | `M*P`, possible `[M,*,P]`, internalStops `[1]`; stored MXP differs `[1]`. Edited export omits translation with warning. |
| Table 11, `GTGAAATAA`, `1..9`, `(pos:1..3,aa:Val)` | Ordinary initiator M overridden to V → `VK`; no re-initiation. |
| Forward `TTAGGGTCACAT`, CDS `complement(1..12)`, `(pos:complement(7..9),aa:Sec)` | Biological bases 12..1 give ATG/TGA/CCC/TAA → `MUP`. |
| `<1..10`, `AATGTGATAA`, codon_start 2, `(pos:5..7,aa:Sec)` | Skip A, ATG/TGA/TAA → `MU`. |
| `join(1..4,10..14)`, record `ATGTNNNNNGATAA`, `(pos:join(4,10..11),aa:Sec)` | Map `[1,2,3,4,10,11,12,13,14]`; ATG/TGA/TAA → `MU`. Literal parser conformance still requires pinned NCBI execution, not just this mapping. |
| Circular written `join(7..9,1..6)`, `TGATAAATG`, `(pos:1..3,aa:Sec)` | ATG/TGA/TAA → `MU`; no numeric segment sorting. |
| `ATGTA`, `1..5` or `1..>5`, `(pos:4..5,aa:TERM)`; reverse `TACAT`, `complement(1..5)`, `(pos:complement(1..2),aa:TERM)` | Suffix TA completed to TAA, final stop removed → `M`; keep real bases/pre-removal index 1 and parent partial marker. Missing explanatory note warns only. |
| `ATGT`, `1..4`, `(pos:4,aa:TERM)` | T completed to TAA → `M`; no invented record bases. |
| `ATGNNNTAA`, `1..9`, `(pos:4..6,aa:Sec)` | `MU`, second possible set U, not NNN's ordinary set. No break gives MX. |
| `ATGTGATAA`, `1..9`, `(pos:4..6,aa:OTHER)` | `MX`; stored MU/MO/MB/MZ/MJ agree by sense overlap, stored M* differs at index 1. Remove break: ordinary TGA stop wins over stored MX (`M*`, differing `[1]`). |
| Same, names `sEc`, `u`, `o`, `xAa`, `term` | Respectively `MU`, `MU`, `MO`, `MX`, `M*` (only the final TAA stop is removed; internal TERM stays); correct names in all case variants pass. |
| Same, two identical `(pos:4..6,aa:Sec)` | `MU`, two raw occurrences, one effective substitution, no conflict loss. |
| `ATGTGATAAGGG`, CDS `1..9`, entries `(pos:10..12,aa:Pyl)`, `(pos:4..6,aa:Sec)` | First is complete range outside CDS → drop occurrence 0 with notice; retain second → `MU`, verified comparison/count available. Imported MW stays MW/imported, differing `[1]`. |
| Same CDS, `(pos:5..7,aa:Sec)` or `(pos:3..5,aa:Sec)` | Off-frame → refuse GenBank, not rounded U. Name c, raw value and single-codon rule. |
| `ATGTGATAA`, `(pos:4..5,aa:Sec)`, `(pos:4^5,aa:Sec)`, `(pos:4..6,aa:)`, `(pos:4..6,aa:Banana)` | Partial codon/site/missing name/unknown name → refuse GenBank; no X fallback. |
| `ATGCC`, `1..5`, `(pos:4..5,aa:TERM)` | CC cannot complete TAA → refuse GenBank, never M by permissive TERM append. |
| Separate accession `R`, version `R.1`, DNA `ATGTGATAA`; break `(pos:R.1:4..6,aa:Sec)` or `(pos:R:4..6,aa:Sec)` | Both exactly match a populated field → `MU`. `R.2` and `X.1` do not resolve; drop/refuse disposition awaits owner. With only version `R.1` and no accession field in a translator input, bare `R` does not match. |
| Protein record `GCTAAAGCT`, CDS `1..9`, stored QQQ/imported, Sec at 4..6 | Primary protein-record; QQQ remains supplied. No nucleotide codons/count/stops; no assumed-table bypass. DNA control gives AUA from GCT/AAA/GCT with Sec override. |

### Import, edit, project and export boundaries

- GenBank repeat import: DNA `ATGTGATAGCCCTAA`, CDS `1..15`, two lines
  `/transl_except=(pos:4..6,aa:Sec)` and `/transl_except=(pos:7..9,aa:Pyl)`,
  `/translation="MUOP"` → canonical two strings in that order, MUOP/imported, no mismatch.
  Export/reimport keeps both entries and MUOP. Refusal fixture: replace second value by
  `(pos:7..8,aa:Pyl)` → entire GenBank file refused, zero records published, diagnostic names
  CDS c, that literal and incomplete-codon rule. `/exception="RNA editing"` cannot suppress it.
- GenBank header → worker → translation: a complete GenBank input has `LOCUS r` (9 bp DNA),
  `ACCESSION   R`, `VERSION     R.1`, CDS c `1..9`, `/translation="MU"`,
  `/transl_except=(pos:R.1:4..6,aa:Sec)` and ORIGIN `atgtgataa`. Exercise real
  `handleBioMessage(PARSE_GENBANK)` with real header/feature parsers and translation checks:
  published record has accession `R` and version `R.1`, one retained exception and conceptual
  `MU`, agreeing with untouched MU/imported. Changing only the qualifier identifier to `R`
  still gives MU with no identity-loss notice. Changing only it to `R.2` or `X.1` must never
  apply Sec or certify a local match; after held decision 3 is resolved, assert its chosen
  refusal or named drop outcome (a drop computes ordinary `M*`, differing from MU at index 1).
  Changing only VERSION to `R.2` while keeping qualifier `R.1` is the same nonmatch control.
  Do not synthesize a combined accession/version in the fixture or mock the translator: this
  boundary catches dropped VERSION plumbing that a pure translator fixture cannot catch.
- GFF3 ingress/egress: FASTA `>r\nATGTGATAGCCCTAA\n`; row
  `r\t.\tCDS\t1\t15\t.\t+\t0\tID=c;transl_except=(pos:4..6%2Caa:Sec),(pos:7..9%2Caa:Pyl)`
  → same canonical array and MUOP. Multipart record `ATGTGATAGNNNCCCTAA`, rows 1..9 phase 0
  carrying Sec and 13..18 phase 0 carrying Pyl at 7..9 → same MUOP and two occurrences;
  export list once, not twice. Malformed GFF3 disposition is pending, not implicitly refused.
- Frame follow-up: DNA `AATGCNNNCCTAA`; GFF3 rows
  `r\tx\tCDS\t1\t5\t.\t+\t1\tID=c;translation=MP` and
  `r\tx\tCDS\t9\t13\t.\t+\t2\tID=c;translation=MP`. Initial frame 2 skips A →
  ATG/CCC/TAA → MP. Phase row cannot be changed, renamed or deleted. Edit codon_start 2→3:
  skip AA → TGC/CCT/AA, ambiguous AAN tail dropped → CP/computed; export phases `[2,0]`
  since `(2−5) mod 3=0`, reimport codon_start 3/CP. Rename alone keeps MP/imported and `[1,2]`.
- Reframe with exception: `<1..10`, DNA `AATGTGATAA`, codon_start 2, break 5..7 Sec → MU.
  Change codon_start to 1: original break offsets 4,5,6 no longer form a codon; before Save
  completes show its literal value and off-frame removal reason. Drop break; AAT/GTG/ATA/A
  gives NVI (AAN tail dropped), store NVI/computed. This is edit invalidation, not import refusal.
- Reverse with inherited strand: DNA `ATGAAATAA`, CDS `1..9`, break `(pos:1..3,aa:Sec)`
  → UK. Reverse CDS to `complement(1..9)` retaining that literal: the simple range inherits
  minus orientation, names final codon CAT (bases 3,2,1), and TTA/TTT/CAT becomes LFU/computed.
  Keep the break with no orientation-loss notice; no historical strand is stored in the string.
- Reverse invalidation with explicit orientation: same DNA, initially CDS `complement(1..9)`
  and break `(pos:complement(1..3),aa:Sec)` → LFU. Reverse CDS to plus `1..9` while retaining
  the explicit complement literal. Before Save completes, show CDS c, occurrence 0, that
  literal and contrary-orientation removal reason; drop it and store ordinary ATG/AAA/TAA →
  MK/computed. Do not silently remove complement to produce UK. Plain move awaits owner.
- Whole-record protein GenBank: moleculeType protein, sequence `GCTAAAGCT`, CDS `1..9`,
  translation QQQ/imported → emit `/translation="QQQ"`, no dropped-attribute count for it;
  reimport retains QQQ as supplied data. A later invalidating edit removes it under PR 1's guard.
- Project format 2: DNA `ATGTGATAA`, CDS `1..9`, array `['(pos:4..6,aa:Sec)']`, translation
  MU/imported, forged successful cache claiming MK → serialize one stored protein and array,
  no scalar exception, format stays 2; load discards cache and recomputes MU, preserving MU/imported.
- Full selection/reversal: source CDS 101..115 on literal coding `ATGTGATAGCCCTAA`, exceptions
  104..106 Sec, 107..109 Pyl. Forward selected output `1..15`, breaks 4..6 and 7..9 → MUOP.
  Reverse output `TTAGGGCTATCACAT`, CDS `complement(1..15)`, breaks `complement(10..12)` Sec
  and `complement(7..9)` Pyl → same MUOP (position map p→116−p). GFF3 encodes inner commas.
- Clipped selection: retain source bases 101..105 only → sequence ATGTG, CDS `1..>5`;
  original Sec codon loses base 106, Pyl entirely absent: no exceptions emitted, warning names
  both losses and clipped CDS. Never export MUOP. Clipped protein/frame assertions await owner.
  Reverse output CACAT with `complement(<1..5)` carries corresponding low-end partial marker.
- Actual selection JSON action: use the full-selection source above (record r has 100 `N`
  bases followed by `ATGTGATAGCCCTAA`, CDS c spans entry bases 101..115,
  exceptions occurrence 0 `(pos:104..106,aa:Sec)` and occurrence 1 `(pos:107..109,aa:Pyl)`,
  stored MUOP/imported). Invoke real `useFileHandlers.exportSelectionJson` with zero-based
  half-open selection `[100,105)` in an unaligned record; keep slicer and `serializeProject`
  real, intercept only download/browser I/O and capture user-visible logs. Downloaded JSON
  must parse to sequence ATGTG, CDS at rebased bases 1..5 with the 3′ partial flag, no retained
  exception and no stale full MUOP protein/locationString. Before download, visible warnings
  name record r, clipped CDS c, occurrence 0/literal with its lost base 106 and occurrence
  1/literal with its wholly excluded codon, plus their removal reasons; completion follows.
  Assert source sequence, feature geometry, both exception strings/order and MUOP/imported
  unchanged. A full `[100,115)` control exports rebased 4..6 Sec / 7..9 Pyl and MUOP without
  clipping/removal warnings. Clipped protein/frame assertions remain held under decision 4;
  this fixture does not choose between omission and a fresh clipped product.
- Note-only refresh: `ATGTGATAA`, CDS `1..9`, OTHER at 4..6, supplied MW/imported. Add/remove
  note `unusual amino acid`: missing-note warning disappears/returns, MW and source unchanged,
  conceptual MX compares W as compatible. Preview and Save agree.

### Lossless text codec acceptance (not biological validation)

Literal logical note value `say "Sec" /translation="FAKE"` must serialize as
`/note="say ""Sec"" /translation=""FAKE"""`. Reparse yields exactly the original note,
no translation and no extra qualifier. For safe-wrap acceptance, logical note value `alpha beta gamma delta epsilon zeta eta theta iota kappa lambda say "Sec" /translation="FAKE"`
may wrap after `theta` and after `lambda`; the final continuation begins `say`, never `/`.
Reparse yields exactly the original single-spaced text, quotes and fragment, no translation
and no extra qualifier. Verify indentation, physical line lengths and logical text separately.
A GenBank→GFF3→GenBank note round-trip keeps the same value; accompanying valid Sec at 4..6
still computes MU from ATGTGATAA.

Scope counterexample, not a PR 2 lossless acceptance fixture: an ordinary `/note` containing
100 consecutive `A` characters followed by ` /translation="FAKE"` has an over-long token.
The pre-existing writer cannot promise both bounded lines and unchanged logical text here.
This general free-text limit is outside `/transl_except` and PR 2, tracked as
[issue #308: GenBank writer over-long tokens](https://github.com/JoaoVictorDaijo/dunceious/issues/308);
it does not extend the non-printable-text question or require a seventh owner question.

The prior 64-unbroken-A plus ` /translation="FAKE"` **exception** fixture is malformed,
not an exception-text round-trip case. GenBank import/editor refuse it; GFF3/project disposition
is held under decision 2. Directly reaching the writer must produce a defensive syntax error,
no file and no invented FAKE protein. Do not split an unbroken token and add a space, invent
a private codec, or claim quoting makes a malformed code break biologically valid.
**Backed by: owner decision 2026-11-06**, answer 6 and W2 clarification.

Biopython 1.88 source corroborates the wrapping risk, not a solution: `InsdcIO._write_feature_qualifier`
breaks at a space or hard column 80, while `Scanner.parse_feature` retains newlines and
`_feed_feature_table` replaces them with spaces. A forced break inside a token can alter its
logical value. Sources: [writer](https://github.com/biopython/biopython/blob/biopython-188/Bio/SeqIO/InsdcIO.py#L396),
[reader](https://github.com/biopython/biopython/blob/biopython-188/Bio/GenBank/Scanner.py#L310).
These are inspected source traces, not executed round-trips.

## Verification and coverage decision

Existing protection below was inspected in merged code, **not executed**. No tests or build
run in this documentation task. During implementation use pnpm and reconcile reused/new checks
at these boundaries; do not derive the oracle from production code. Required implementation
gates remain in CLAUDE.md; this task only runs documentation-safe checks.

| Guarantee/source | Existing protection inspected | Decision |
|---|---|---|
| PR 1 eligibility, ambiguity, stops and strand preserved | `translation.test.ts`: protein gate precedes code/exception; table-28 terminal sets; stop beats stored X `[1]`; mixed join indices `[2,1,0,5,4,3]`; local join allowed, order/remote denied. | Reuse; strengthen at pure translator for exception adjustment and malformed/drop distinction, including U/IUPAC, reverse, circular, split and empty inputs. |
| Repeated values through GenBank/GFF3/editor/project | `qualifierParser.test.ts` has scalar repeated-qualifier behavior; no canonical exception-array protection found. | Add round-trips with two different breaks and repeated identical values; preserve order, distinguish last-only and duplicated-row export failures. |
| Exact accession/version through header, worker and translation | No exception identity wiring protection found. | Add real GenBank worker/header fixture with ACCESSION R / VERSION R.1: R.1 and R match, R.2/X.1 do not; retain both fields. Nonmatch disposition remains held. |
| Malformed refusal and valid-but-unusable drop | No exception-specific entry-point protection found. Existing GenBank findings pipeline available. | Add actual worker import refusal with zero publication and allowed/drop control; GFF3/project refusal rows depend on owner. |
| Biological edit recomputation and phase follow-up | `featureManager.test.ts` stores MK on first save, removes internal-stop product; multipart frame edit asserts CP/computed and phases `[2,0]`. | Reuse save/export phase protection; add actual editor read-only enforcement, inherited-minus LFU control and explicit-complement-to-plus removal with before-completion notice/MK. Note-only and unchanged imported protein controls catch over-invalidation. |
| Comparison/count/warning siblings at import and attachment | `translation.test.ts` stop-over-X and length units; `bioResponse` calls shared checks. No exception wiring protection found. | Add GenBank, GFF3 attachment and project recheck with adjusted results; distinguish curated discrepancy from explained recoding, and loss notices from suppressible mismatch warning. |
| Whole/selection export and safe text | `selectionExport.test.ts` has clipped CDS translation/partial ends; `genbankContract.test.ts` covers ordinary formatting. No exception rebase or slash-wrap losslessness protection found. | Reuse partial/end rules; add both writers→readers with literal rebased breaks, quote/slash fixtures whose tokens fit, no stale full product. General over-long free-text tokens belong to issue #308. Held clipped translation/frame choice remains a gap. |
| Selection JSON loss delivery and source preservation | `useFileHandlers.alignedExport.test.tsx` asserts selected CGT with aligned overlay C--GT, rebased feature geometry, cleared locationString and unchanged source start. No exception-loss delivery protection found; current action logs completion only. | Reuse aligned-coordinate/source protection; add real action → slicer → project serializer fixture, intercepting browser I/O only: clipped/rebased JSON, named warnings before download, source unchanged and full-retention no-loss control. Pure slicer checks cannot prove notice delivery. Held clipped protein/frame policy stays explicit. |
| Unverified rendering, underscore and overlap | PR 3 owns visual assertions. | Supply evidence here; PR 3 asserts normal cells/hover, explained `_`, separate lanes without changing biology. |

NCBI parser/validator execution is still an implementation acceptance requirement: pin full
Toolkit commit or exact table2asn/asn2gb version/options, distinguish diagnostics from actual
product output, and probe split/complement/partial TERM, duplicates and off-frame text. Source
traces and hand mapping are independent evidence but not executed conformance. Biopython 1.88
ignores exceptions and cannot alone validate application. No check may silently waive this gate.

## Open decisions

All items below are **awaiting owner**; no suggested option is adopted. The first four are
explicitly held by W1. Other gaps are exposed rather than guessed.

1. **Plain move — awaiting owner.** Situation: moving a CDS leaves a previously valid break
   pointing to its old bases. Options: shift it by the same move and validate, or keep its
   absolute bases and remove it if unusable with notice. What references do: INSDC uses entry
   coordinates and defines no editor move; Biopython 1.88 `_shift` copies qualifier text.
   **Suggestion:** keep absolute positions and remove newly unusable breaks with notice.
2. **Import scope — awaiting owner.** Situation: malformed breaks arrive through GFF3 or a
   saved project, not GenBank. Options: refuse those imports too, or keep these routes with
   explicit diagnostics and no verified malformed-break result. What references do: INSDC
   defines GenBank assertions; NCBI's parsers/validators do not define this app's project policy.
   If either route keeps malformed values, syntax-invalid text can reach export: the writer
   must refuse defensively, naming CDS/value/rule, rather than invent lossless biological
   meaning for quotes or the 64-A/slash fixture. GenBank/editor syntax checks stay mandatory.
   **Suggestion:** apply strict refusal consistently to both routes, so malformed writer input
   is unreachable; retain the defensive writer error regardless.
3. **Another accession — awaiting owner.** Situation: a well-formed break names an accession
   matching neither this record's exact accession nor its exact version field (including a
   different version of the same accession). Options: drop with notice under answer 5, or
   refuse under answer 6. What references do: INSDC permits remote locations; NCBI resolves
   identities through scope, which supplies no local alias policy here. **Suggestion:** drop
   with notice, never fetch or guess an alias.
4. **Clipped protein and frame — awaiting owner.** Situation: selection cuts a CDS, possibly
   inside a codon. Options: emit a newly computed clipped `/translation` when verifiable, or
   omit it with warning; for frame, approve keeping the original frame by deriving codon_start
   from removed biological bases, or omit clipped translation until frame is explicitly set
   while still preserving that frame in the annotation. What references do: INSDC codon_start
   locates the first complete codon, so frame must be kept; Biopython slicing copies qualifier
   text and is not a safe frame oracle. Merged `clipFeature` removes protein and uses
   `((oldOffset−removed) mod 3 + 3) mod 3 + 1`. **Suggestion:** retain that frame formula and
   omit clipped translation with warning. Example: ATGAAATAA cut to bases 2..9 gives TGAAATAA,
   `<1..8`, codon_start 3 to skip TG and retain AAA/TAA (K), never frame-1 `*N`.
5. **Conflicting survivors — awaiting owner.** Situation: two well-formed assertions assign
   Sec and Pyl to the same codon. Options: drop all conflicting occurrences, retain first and
   drop later conflicts, or retain last and drop earlier conflicts. What references do: NCBI
   stable-sorts and overwrites so last wins, while its validator reports DuplicateTranslExcept;
   INSDC defines one codon's assertion without choosing a winner. **Suggestion:** drop all
   conflicting occurrences with notice and compute ordinary DNA at that codon; do not guess intent.
6. **Non-printable text — awaiting owner.** Situation: an original logical value contains a
   non-printable character such as U+0000, or a literal newline that must be retained as data.
   Options: refuse only the affected GenBank export with explanation, or explicitly omit the
   value with warning and retain the original in project/GFF3 where representable. What
   references do: INSDC free text permits printable ASCII 32–126 and continuation unfolding
   does not encode a literal newline; doubled quotes solve neither case. **Suggestion:** refuse
   that export with an exact value/rule report; no private escape or silent replacement.
