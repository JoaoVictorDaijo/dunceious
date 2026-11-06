---
title: "Stored CDS translations: one read-only protein, recomputed after edits, curated differences shown"
status: proposed
date: 2026-11-06
areas: ["translation", "viewer", "annotations", "genbank", "project-file"]
prs: [291]
issues: [253, 261, 288]
superseded_by: null
summary: "A CDS keeps one stored /translation that users cannot type over. Edits that change its coding bases, frame, code or ends replace it with the conceptual translation under NCBI rules, or remove it with a warning when the CDS no longer translates cleanly. Imported proteins that differ from the DNA are kept and marked codon by codon."
---
# Stored CDS translations — design

## Why

[#253](https://github.com/JoaoVictorDaijo/dunceious/issues/253) (OBS-26): editing an imported
CDS's location or strand keeps its old `/translation`. Three places trust it:

- the viewer (`translateFeature`, `sequence.ts:308`);
- the early-stop flag (`isFeatureBroken`, `sequence.ts:338`);
- GenBank export (`serialize.ts:76`).

With `ATGAAATAAATGTGATAA`, a CDS at `[0,9)` with `/translation="MK"` moved to `[9,18)` encodes
`ATG TGA TAA`, which has an internal stop. The viewer still shows `MK_`, raises no early-stop
flag, and export writes `/translation="MK"`.

**There are also two copies of the protein:**
- `featureParser.ts:92-95` sets both `feature.translation` and `metadata.translation`.
- The editor's qualifier rows change only `metadata.translation`.
- The viewer, the early-stop flag, the details modal and its copy button
  (`RecordDetailsModal.tsx:148-150, 341-355`) and feature comparison (`featureComparison.ts:81`)
  read `feature.translation`.
- Export and the hub tooltip read `metadata.translation`.

## Requirement (collaborator, 2026-11-06)

Murilo, on #253:

> On Editing: When a CDS geometry, strand, phase, or genetic code is edited, the stored
> translation must be invalidated and recomputed from the new sequence (replace).
> On Importing Curated Files: When loading a GenBank file where an annotated /translation
> differs from the computed sequence (e.g., curated variants), keep the original translation
> intact but flag it with a visual warning (lighter fill, as referenced in #261).

## Standards and reference tools

- **INSDC Feature Table 11.4 (April 2026):**
  - `/translation` is the amino-acid sequence derived from the CDS under `/transl_table`,
    `/codon_start` and `/transl_except`, written in one-letter amino-acid codes. It is allowed
    on CDS only.
  - `/exception` marks a CDS whose product differs from its conceptual translation.
  - A complete amino terminus requires `/codon_start=1`.
- **NCBI C++ Toolkit `912b751`:**
  - `x_Translate` (`sequence.cpp:3670`) reads the initiator as M only for a 5′-complete CDS in
    frame 0.
  - The same function (`:3724-3729`) reads the last codon of a 3′-complete CDS as a stop in
    tables where that codon can be either a stop or a residue (27, 28, 31).
  - `TranslateToProtein` (`:4024`) drops a trailing `*`.
  - The flatfile writer (`feature_item.cpp:2386-2425`) has two paths. Its recompute path
    translates with `include_stop=false`, which cuts at the first stop (`sequence.cpp:3741`).
    Its product-copy path copies an existing product, which can keep an internal `*`.
  - The validator reports a stored protein that differs from the conceptual one, and an internal
    stop, as separate diagnostics (`translation_problems.cpp`, `cdregion_validator.cpp:622`).
- **Project rules** in `docs/standards/translation.md`:
  - [TRANS-1](../standards/translation.md#trans-1-genetic-code-from-transl_table), genetic code from `/transl_table`; an invalid code yields no residue claim;
  - [TRANS-2](../standards/translation.md#trans-2-codon_start), `/codon_start`;
  - [TRANS-3](../standards/translation.md#trans-3-alternative-initiation-codons), alternative initiators;
  - [TRANS-4](../standards/translation.md#trans-4-transl_except), `/transl_except`.
- **How other tools treat a stored translation** (documentation and source survey, 2026-11-06;
  nothing was run):
  - Geneious separates a computed "Automatic Translation", which is not exported, from a stored
    Translation property.
  - CLC lets the user extract the stored translation or compute one.
  - table2asn replaces computed products only through a separate protein file.
  - Benchling recomputes a translation when its genetic code changes.
  - None documents an outright ban on hand edits. The strongest examples keep computed and
    stored proteins apart, which this design does.

## Decisions (owner, 2026-11-06)

1. **Display.** A curated `/translation` that differs from the DNA is drawn with its stored
   residues. Each differing codon is marked as in the approved mockup, and every mark explains
   itself on hover. The early-stop flag and the amino-acid count follow the DNA.
2. **`/translation` cannot be hand-edited.** The editor shows it read-only, labelled
   "Imported" or "Computed from the DNA".
3. **What triggers a recompute.** A change to any of these: `start`, `end`, `segments`, `strand`,
   `/codon_start`, `/transl_table`, a partial end (`<`, `>`), or any `/transl_except` value
   (added, removed or changed). Label, colour, note and other qualifier edits keep the stored
   protein. Strand changes mean `getFeatureStrand(previous) !== getFeatureStrand(next)`
   (`src/domain/bio/strand.ts`), including unknown-to-known transitions when numeric strand
   is unchanged. The legacy numeric fallback is not biological orientation.
4. **Export after an edit** writes the recomputed `/translation`. **When the edited CDS has an
   internal stop, export omits `/translation` and warns** that the CDS needs fixing or
   `/pseudo`. The same applies when the edited CDS has no valid genetic code, or carries a
   `/transl_except` that cannot yet be applied (see PR 2).
5. **`/transl_except`** follows NCBI and ships in its own PR (PR 2). Until then, a CDS that
   carries it is never recomputed and is marked "can't verify".
6. **Import** warns once per file with a count. The count is an application choice: NCBI's
   validator treats a mismatch as an error, but Dunceious keeps the file and shows the
   difference. A CDS with `/exception` keeps its stored protein without a warning, because INSDC
   expects it to differ. Its marks still show on hover, with the exception named.
7. **Edit undo** is not part of this work. The app can only undo deletions
   (`useFeatureManager.ts:131-170`), and saving an edit cannot be undone today.
8. **Ships as three PRs:**
   - PR 1: one stored protein, read-only, recomputed on edit;
   - PR 2: `/transl_except`;
   - PR 3: the codon marks.
9. **No project-format bump or migration.** Nobody uses project files yet (owner's later
   #253 decision, superseding the earlier format-3 proposal). Keep format 2 and store only
   `metadata.translation`; do not migrate `feature.translation` or add compatibility handling.
10. **One initiator helper,** `initiatorResidue`, is shared with the
    [#261](https://github.com/JoaoVictorDaijo/dunceious/issues/261) greeter fix.
11. **Counts follow NCBI and Ensembl (#259).** The metric is *translation positions*: the
    conceptual translation's length without the terminal stop. Internal stops count as one
    position each, and so do X, U and O. The display labels it "aa" only when there is no
    internal stop. Otherwise it reads, for example, "3 positions, 1 internal stop", because a
    stop is not an amino acid.

## Goals

- One stored protein per feature, `metadata.translation`, read through one accessor.
  `feature.translation` is removed.
- After an edit from decision 3, the display, early-stop flag, counts, details and export all
  describe the current CDS. Export says so when it cannot.
- Imported proteins are never overwritten silently, and their differences from the DNA are
  visible and explained.

## Non-goals

- Edit undo (decision 7).
- `/transl_except` application in PR 1 (decision 5).
- Restructuring the editor beyond making `/translation` read-only and resolving the phase/frame
  authority described under Open decisions.

## Anti-goals

- A stored protein drawn, counted or exported for a location it no longer describes.
- A guessed protein exported as if it were the derived one: under an invalid code, an
  unapplied exception, or with an internal stop.
- A "differs" mark caused by the conventions themselves:
  - the omitted terminal stop;
  - `M` at a valid alternative start;
  - `X` against a residue its ambiguous codon allows;
  - an applied exception.

## Model

```ts
/** src/domain/bio/translation.ts (new). */

type ConceptualTranslation =
  | {
      status: 'ok';
      residues: string;           // one per translated codon; terminal stop removed; internal stops '*'
      possible: string[];         // per retained position: final contextual readings, including '*' when possible
      internalStops: number[];
      threePrimeIndeterminate: boolean;  // last codon's expansions mix stops and residues
    }
  | { status: 'unavailable'; reason: 'invalid-code' | 'unsupported-exception' | 'unknown-strand' | 'nonlocal-location' | 'unknown-completeness' | 'empty' };

/** The CDS's conceptual translation under NCBI rules. Never reads the stored protein. */
export function conceptualTranslation(feature: BioFeature, record: SeqRecord): ConceptualTranslation;

/** gc.prt Starts row: 'M' when `codon` is a start of `translTable`, else undefined. */
export function initiatorResidue(codon: string, translTable: number): 'M' | undefined;

/** Per-codon comparison of a stored protein with an 'ok' conceptual translation. */
export function compareTranslation(stored: string, conceptual: Extract<ConceptualTranslation, { status: 'ok' }>): {
  differing: number[];          // codon indices with a definite disagreement
  storedExtra: string;          // stored residues past the last codon
  storedShortBy: number;        // conceptual residues past the end of the stored protein
};

/** The one accessor for the stored /translation qualifier, whitespace removed. */
export function storedTranslation(feature: BioFeature): string | undefined;

/** INSDC CDS, including GFF3's SO:0000316. ORF display eligibility stays a separate check. */
export function isCds(feature: BioFeature): boolean;
```

**Conceptual translation, in order.** Each step names the reference behaviour it follows.

1. **Genetic code.** If `/transl_table` is not an NCBI code (TRANS-1), the result is
   `unavailable: 'invalid-code'`. The #288 assumed-table display is a separate view, and its
   residues never feed this function.
2. **Exceptions.** In PR 1, any `/transl_except` gives `unavailable: 'unsupported-exception'`.
   PR 2 replaces this step with NCBI code-break substitution.
3. **Location eligibility, before extraction or comparison.** Read `getFeatureStrand` from
   `src/domain/bio/strand.ts`, never the numeric fallback alone. `.` or `?` gives
   `unavailable: 'unknown-strand'`, even if `strand === 1`. A valid mixed-strand join uses
   each interval's resolved orientation in evaluation order. Require `definesOneSequence`
   from the location dependency (contract below); false gives `unavailable: 'nonlocal-location'`.
   Require established completeness at both biological ends; unknown gives
   `unavailable: 'unknown-completeness'`. Before extraction, resolve orientation on a temporary
   input: when any segment has an explicit strand, retain evaluation order and fill each
   omitted strand from the known feature strand. Use that same resolved input for end
   accessors and real-base indices; do not mutate persisted intervals just to translate.
   When no segment has an explicit strand, preserve the whole-feature orientation path,
   including reversed interval order on minus. The current extractor's per-segment branch
   treats omitted strand as forward; passing that unresolved input is forbidden. This
   implements the existing [LOC-3](../standards/locations.md#loc-3-complement-whole-feature-or-per-interval)
   contract, not a new biological default. Only then call `extractCodingSequence`, which applies
   segments, strand and `/codon_start`. An empty result is `unavailable: 'empty'`.
   These eligibility checks also guard counts, early-stop claims, display and edit replacement;
   none may substitute a forward strand or concatenate an unsupported location.
4. **Codons.** Each codon is expanded over its IUPAC bases, and `possible` records every
   residue the expansions give. The residue is then chosen:
   - one possible residue: that residue, e.g. GCN gives A;
   - exactly {D, N}: B; {E, Q}: Z; {I, L}: J;
   - anything else: X.

   This follows NCBI's codon-state alphabet. X for every other mixed set is Dunceious's own
   representation, documented in TRANS-1. It is new code beside `translateSequence`, which
   keeps its context-free contract.
5. **Initiator.** Codon 1 becomes `M` when all three hold:
   - the CDS is 5′-complete;
   - `/codon_start` is 1;
   - `initiatorResidue` returns `M` for the literal codon (TRANS-3, NCBI `sequence.cpp:3670`).

   An ambiguous first codon is not rewritten. When initiation changes the residue, replace
   its `possible` entry with `{M}` too, so the comparison sees the final interpretation.
6. **Leftover bases.** One or two bases after the last whole codon are padded with N, as NCBI's
   `x_Translate` does (`sequence.cpp:3696`). The padded codon is kept only when step 4 gives a
   single residue. For example, `ATGGC` gives `MA`, because GC plus any base is A. Otherwise it
   is dropped. Either way, the result is never a stop.
7. **Terminal context, then terminal-stop removal.** For a 3′-complete CDS only, look at
   the final codon's expansions under the table's stop rows, only when there are no leftover
   bases. This includes the context-dependent stops of tables 27, 28 and 31 (NCBI
   `sequence.cpp:3724-3729`, which checks the codon state):
   First rebuild this position's `possible` set expansion by expansion: a terminal stop
   reading replaces that expansion's ordinary residue reading, including for dual-coding tables.
   - every expansion is a stop: represent it as a definite stop before removal below;
   - none is: retain the ordinary residue and set;
   - mixed: retain X with the final set containing `*` and the remaining residues, and set
     `threePrimeIndeterminate`. The display says the end is uncertain.

   For a 3′-partial CDS retain the ordinary readings. Independently of completeness,
   remove a final definite stop (set `{*}`) and its `possible` entry. Remove only the final
   position, never preceding stops. This follows `TranslateToProtein`'s unconditional
   trailing-star removal ([Toolkit `912b751`, `sequence.cpp:4024`](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objmgr/util/sequence.cpp#L4024));
   completeness gates dual-coding reinterpretation, not removal. Any retained final mixed
   stop/residue set is X with `threePrimeIndeterminate`; all-residue sets keep their ordinary
   representation. Source inspected, not executed.

   Thus table-1 `ATGAAATAA` at `1..>9` gives `MK`, no internal stop, count "2 aa".
   Table-27 `ATGAAATGA` at `1..>9` gives `MKW` (ordinary TGA=W); exact `1..9` gives `MK`.

   Complete table-28 `ATGTAN` has final sets `{M}`, `{*,Y}`, never `{M}`, `{Q,Y}`:
   TAA/TAG terminate, TAT/TAC give Y. Stored `MQ` differs at index 1; `MY` is compatible.
   `possible.length === residues.length`; comparison never consumes the pre-context set.

   This replaces `terminateLastCodon`'s ACGT-only check for this function. That helper stays for
   its current callers.
8. **Internal stops.** After terminal-stop removal, a retained codon whose only possible
   readings are stops is `*`, and its index goes in `internalStops`. These are never exported
   (decision 4).

**Partial ends and local-sequence consumption contract.** The prerequisite is the SARS-CoV
location work on `fix/order-operator`, inspected at
[`22235c17f9ac5e7f4b02a9f09ff8ff1d6d3b0042`](https://github.com/JoaoVictorDaijo/dunceious/blob/22235c17f9ac5e7f4b02a9f09ff8ff1d6d3b0042/src/domain/bio/locationFlags.ts#L96)
and its [location spec](https://github.com/JoaoVictorDaijo/dunceious/blob/22235c17f9ac5e7f4b02a9f09ff8ff1d6d3b0042/docs/specs/2026-11-06-locations-operator-sites-remote.md).
The dependency is now [PR #306](https://github.com/JoaoVictorDaijo/dunceious/pull/306),
branch `fix/order-operator`; the API was also inspected at
[`453fdf12e4c3cd142d69e4f2d6d9068e7567a938`](https://github.com/JoaoVictorDaijo/dunceious/blob/453fdf12e4c3cd142d69e4f2d6d9068e7567a938/src/domain/bio/locationFlags.ts).
This is a prerequisite, not a claim that it has merged.
It owns [#226](https://github.com/JoaoVictorDaijo/dunceious/issues/226) persistence, import
normalization, edits, clipping and serialization. It lands
before PR 1; reconcile this contract and tests with its final API before PR 1 merges.
Do not create a competing location model.

- `FeatureSegment.partialStart?: true` means `<` before the lower base;
  `partialEnd?: true` means `>` after the higher base. These are coordinate ends, not 5′/3′.
- Call **`isFivePrimePartialLocation(feature)`** and
  **`isThreePrimePartialLocation(feature)`**, each taking
  `Partial<Pick<BioFeature, 'strand' | 'segments' | 'remoteParts'>>`. They return booleans, not a three-state
  answer. `isPartialLocation(feature)` detects any marker, including interior markers; it
  cannot decide initiation or termination.
- With no per-segment strand, a minus feature reverses the stored interval order. With
  per-segment strands, intervals are already in evaluation order; use each segment's strand
  (or the known feature strand). The first interval's forward `partialStart` or reverse
  `partialEnd` is 5′ partial; the last interval's forward `partialEnd` or reverse
  `partialStart` is 3′ partial. Interior markers do not change these answers.
- PR 1 logically consumes `{fivePrime, threePrime}`, each `complete | partial | unknown`.
  This is an eligibility result, not a new persisted location representation. The two boolean
  accessors may be negated to mean complete **only for validated, normalized intervals**.
  Their false return on missing `segments` must never establish completeness. Missing,
  conflicting or unresolvable geometry/orientation yields unknown and makes translation
  unavailable. No start-M or dual-coding terminal rule is guessed in that state.
- GenBank parsing establishes exact versus marked ends. GFF3 parsing establishes normalized
  row bounds and reads `insdc_partial_start=<` / `insdc_partial_end=>`; under the dependency's
  existing import/export convention a validated row with neither attribute has exact ends.
  This is the annotation's declared completeness, not proof that the organism's gene is whole.
  An unnormalized GFF3 feature or unresolved `.`/`?` strand never supplies that evidence.
- On project load, the dependency derives flags from valid `locationString` when present;
  PR 1 consumes that result after normalization. A current structured interval with no flags
  declares exact ends. An old feature with neither recoverable text nor established structured
  end state is unknown; do not implement a protein migration or infer complete from an empty
  string. If the final loader cannot distinguish this state, reconcile the prerequisite
  before merge rather than treating the accessor's default false as evidence.
- Geometry/strand edits retain the per-coordinate-end flags, including the moved end. Selection
  clipping sets the cut ends partial and preserves surviving flags; dropping whole intervals
  also marks the newly exposed end per the dependency. Re-evaluate the accessors after either
  operation; never read stale `locationString` or stale `_translationCheck`.
- Call **`definesOneSequence(feature)`**, taking
  `Pick<BioFeature, 'operator' | 'segments' | 'locationString' | 'remoteParts'>`.
  Its actual contract accepts one local interval or a local join, excludes multipart `order()`
  and every location with `remoteParts`. It does not check strand, completeness or emptiness;
  those remain separate gates. This enforces
  [LOC-2](../standards/locations.md#loc-2-order-is-not-join) and
  [LOC-7](../standards/locations.md#loc-7-the-sequence-of-a-multi-interval-feature).

| Literal INSDC location | Evaluation order / flags | Logical (5′, 3′) |
|---|---|---|
| `<1..9` | `[0,9)+`, `partialStart` | (partial, complete) |
| `complement(1..>9)` | `[0,9)−`, `partialEnd` | (partial, complete) |
| `join(<1..6,10..>12)` | `[0,6)+`, `[9,12)+`; outer flags | (partial, partial) |
| `complement(join(<1..6,10..>12))` | `[9,12)−` first, `[0,6)−` last | (partial, partial) |
| `join(<1..6,complement(<10..12))` | `[0,6)+` first, `[9,12)−` last | (partial, partial) |
| `join(1..>6,10..12)` | interior `partialEnd` only | (complete, complete) |
| no segments and no recoverable location | boolean defaults are not evidence | (unknown, unknown) |

**Comparison contract.** This is Dunceious's application policy. Like the NCBI validator, it
checks the stored protein against the conceptual one. The ordinary-residue wildcard rules below are Dunceious's own; stop precedence
follows the cited NCBI validator.
- Stored residue equals the conceptual residue, including stop against stop: no difference.
- **DNA internal stop takes precedence over stored `X`.** A conceptual `*` against any
  non-stop, including X, is a difference. Stored `MXG` against conceptual `M*G` differs at
  index 1. The early-stop flag is independently true even when stored `M*G` matches exactly.
  This follows the NCBI validator's literal unequal-residue comparison at non-initial
  positions and its separate `CountInternalStopCodons` diagnostic
  ([Toolkit `912b751`, `translation_problems.cpp:589–621`](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/validator/translation_problems.cpp#L589),
  [internal-stop calculation](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objtools/validator/translation_problems.cpp#L180)).
  Evidence: source inspected, not validator execution.
- Otherwise stored `X`: no difference, because the stored protein declares the residue unknown.
  This ordinary-residue wildcard remains Dunceious's policy, not NCBI's literal comparison.
- Conceptual residue from an ambiguous codon (X, B, Z, J): no difference when the stored residue
  is in that codon's `possible` set for the CDS's table, and a difference otherwise. For example,
  YTN allows F or L under table 1, and F, L or T under table 3.
- Conceptual internal stop against a stored residue: use the precedence above. This is the
  "DNA stops here" case in the mockup.
- Stored residues past the last codon go to `storedExtra`. Conceptual residues past the end of
  the stored protein are counted in `storedShortBy`. Both lengths use translation positions,
  including internal `*`, never an unconditional amino-acid unit. Neither is shown as a codon.
- A verified comparison is discrepant iff `differing.length > 0`, `storedExtra.length > 0`,
  or `storedShortBy > 0`. Each discrepant CDS counts once in the per-file warning, including
  length-only differences, subject to decision 6's `/exception` suppression. This implements
  the owner's "differs from DNA" warning without calling unmatched tails codon disagreements.
  NCBI also distinguishes length and residue mismatch diagnostics
  ([Toolkit diagnostic definitions, TransLen](https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/912b751/src/objects/valerr/ValidErrItem.cpp#L1358));
  the once-per-file count remains Dunceious's policy.
- The conceptual protein has its terminal stop removed already, so an ordinary stored protein
  with no `*` lines up.

## Edit boundary (`saveEditedFeature`)

- **If the save changes a field from decision 3:**
  Use biological-strand equality, not numeric equality. Choosing Forward clears
  `_gffStrand='.'` or `'?'` and must replace the stored protein even if numeric strand stays
  +1. Refreshing only `_translationCheck` does not satisfy replacement.
  - `conceptualTranslation` gives `ok` with no internal stops: set `metadata.translation` to
    its residues and `metadata._translationSource = 'computed'`.
  - It gives `ok` with internal stops, or `unavailable`: remove `metadata.translation`, set
    `_translationSource = 'removed'`, and log one warning naming the feature and the reason:
    - "internal stop at codon 2; fix the CDS or mark it /pseudo";
    - "/transl_table=99 is not an NCBI genetic code";
    - "/transl_except can't be applied yet";
    - "biological strand is unknown";
    - "location does not define one locally available sequence";
    - "CDS end completeness cannot be established".
  Do not call an unavailable result an intact CDS: early-stop state and position count are
  unset, and display names the reason. Imported stored protein remains preserved as data
  until an invalidating edit, but unknown-strand/nonlocal locations draw no codon translation.
  GFF3/project export keeps an untouched curated value without claiming it was verified;
  after an invalidating edit all exports omit the removed value and carry the warning.
  GenBank's existing refusal of unresolved strands remains in force.
- **Otherwise**, keep `metadata.translation` and `_translationSource` as they are.
  `_translationSource` starts as `'imported'` for a parsed `/translation`.
- **Type changes away from CDS** (by `isCds`) remove `/translation` and `_translationSource`,
  with a log line. The serializer writes `/translation` only where `isCds` holds, so an
  SO:0000316 CDS keeps it and a non-CDS can never carry one. Changing back to CDS counts as a
  decision-3 change and recomputes.
- **`feature.translation`** is removed from the type, the parser and every reader listed under
  "Why". The details modal copy button reads through `storedTranslation`.

**GFF3 frame edits.** `codon_start` is the effective frame consumed by extraction and by
`partPhases` (`src/core/formats/gff3.ts:96–125`); a phase p maps to `codon_start=p+1`
([FMT-11](../standards/formats.md#fmt-11-strand-relative-gff3-cds-phase)).
No successful save may change visible phase while retaining the old effective frame or
cached part phases. Every accepted frame change triggers decision 3, invalidates `_gffPhases`
and `_gffPhaseState`, and regenerates all exported row phases in evaluation order using
`nextPhase = (phase - partLength) mod 3` (non-negative modulo). Unrelated edits preserve
imported per-part phases. Which editor control accepts the change is an open decision below;
PR 1 must resolve it before implementation, not silently keep the existing generic phase row.

## Import

- Parsing sets `metadata.translation` only, with `_translationSource = 'imported'`.
- **The check runs where a CDS first meets its DNA, for every import path:**
  - GenBank records arrive with both, so they are checked in the worker after parsing.
  - GFF3 annotations reach their sequences only when `bioResponse` attaches them
    (`bioResponse.ts:100-154`; the annotation worker request carries no DNA). So they are
    checked at attachment.
  - Project load discards restored `_translationCheck` and calls the same check after location
    normalization and DNA attachment, before display or counts can read it.
  - All paths call the same function and add to the same per-file warning.
- The result is kept as internal `_translationCheck` metadata. It is recomputed whenever the
  feature or its record's sequence changes, not on every redraw.
- Discrepant CDSs (codon disagreements or either unmatched tail) without `/exception` add
  once each to one warning per file, e.g. "3 CDS have a
  /translation that differs from their DNA".
- An `unavailable` result is recorded as "can't verify", with its reason.

## Display

- **Codon marks (PR 3)** follow the approved mockup
  (`.code/docs/translation-marks/translation-marks.html`, untracked). Each codon is drawn from
  two channels: the displayed residue (stored when present) and the conceptual residue.
  - **Differs:** white base, the strand hue at low alpha, and the letter in the strand hue.
  - **DNA stops, annotation doesn't:** the same, plus a red edge on the side facing the bases.
  - **Both stop:** today's red cell with `!`.
  - **Stored longer or shorter:** a "+n positions" or "−n positions" chip after the last codon.
  - **Under a search hit:** the hit is redrawn as an outline on top, so the mark survives.
  - **Hover targets:** every marked codon and chip gets one. The translation canvas has
    `pointerEvents: none` (`SequenceTrack.tsx:391-393`), so the targets are absolutely
    positioned buttons, like the existing genetic-code warning targets.
- **Early-stop flag** (`isFeatureBroken`) and the **count** (decision 11) read the conceptual
  translation. ATGTAA gives "1 aa" with or without a stored protein. `ATGTAAGGGTAA` gives
  "3 positions, 1 internal stop". An `unavailable` result shows "can't verify", with the reason.
  `threePrimeIndeterminate` adds "end uncertain". The tooltip defines the metric: translation
  positions without the terminal stop, internal stops and X/U/O included.
- **Both stop** (stored `*` over a DNA stop): no difference, drawn as today's red `!` cell.
- **Tooltips:**
  - for codon disagreements: "Annotation differs from DNA at N codons", N=`differing.length`;
    omit this clause when N=0;
  - for an unmatched tail: "Annotated protein is N translation positions longer/shorter
    than the DNA-derived protein", N=`storedExtra.length` / `storedShortBy`. Include this
    clause for length-only differences and append it when codon disagreements also exist.
    Never explain a length-only difference as "differs at 0 codons". `/exception` suppresses
    the file warning, not the explanation;
  - for a CDS recomputed after an edit: "Translation recomputed after edit";
  - for one removed after an edit: "Translation removed after edit", with the reason.
- **Editor:** `/translation` is read-only, with its source label. The edit's outcome
  (recomputed, or removed and why) shows before Save.

## Project file

- Keep `format: 2`. No bump, protein-field migration, compatibility fallback or version-message
  rewrite is part of this work (decision 9).
- Save only `metadata.translation` and its provenance. Never recreate `feature.translation`.
- `_translationCheck` is disposable derived state, never trusted on load, even when its shape
  looks valid. Discard it, normalize locations through the dependency, then recompute against
  the loaded DNA and qualifiers before publishing the restored records. Rechecking does not
  overwrite a stored curated protein or change its source label. This follows the same
  current-DNA invariant as import and edit invalidation.

## PR breakdown

| PR | Contents | Depends on |
|---|---|---|
| 1 (#291) | One protein field; read-only `/translation`; `conceptualTranslation` with steps 1, 3–8 and step 2 returning `unavailable`; edit boundary; export omission; import check on both paths and the warning; early-stop and count from the DNA; `isCds`; format-2 save/load without migration; project check recomputation; TRANS-1/3 doc updates | #226 (structured partial ends, merged first) |
| 2 | `/transl_except`: lossless repeated qualifiers through parse, metadata, editor, project and serializer; NCBI code-break mapping through segment order, strand and `/codon_start`; partial TERM; diagnostics for unparsed, off-codon, remote and conflicting entries; rebasing on selection export; TRANS-4 update | PR 1; its own validation table, written and reviewed before implementation |
| 3 | Codon marks, chips, hover targets, mockup tooltips; padded-codon drawing and hover contract | PR 1; its own drawing and hover assertions, written and reviewed before implementation |

**PR 3 integration contract.** PR 1 owns comparison and model semantics. PR 3 must update
its stored-X wildcard prose, hidden-stop predicate, unknown-X stop-edge description and MXA
fixture: X over a definite DNA stop contributes one `differing` index, retaining X and the
stop edge. Ordinary-residue X remains compatible. All codon-disagreement counts use
`differing.length`, independently of lighter-cell counts. Every discrepancy chip uses
"position(s)", including residue-only differences; only the CDS total count uses decision 11's
conditional "aa" label. PR 3 must adopt the length-aware tooltip clauses above and its
acceptance fixtures must include length-only differences. Its aa-chip and zero-mismatch-X-stop
assertions are superseded by this contract, not alternative policies.

## Validation

This table is **PR 1's acceptance coverage**. PR 2 and PR 3 each add their own table before
implementation. PR 2's must cover hand-enumerated record-base-to-codon mappings for:
- forward, reverse, nonzero-start, joined and offset-frame CDSs;
- repeated exceptions and partial TERM;
- selection export and reimport.

PR 3's must cover drawing and hover assertions for:
- a difference over a DNA stop;
- a search-hit overlap;
- the chips, always labelled in positions;
- **padded codons (explicitly owned by PR 3):** `ATGGC → MA` retains A with real base indices
  `[3,4]`; PR 3 must choose and document its visual span and hover target, draw it without a
  fabricated third base, and assert that hover explains GC+N padding. Existing three-index
  lane/drawing guards cannot silently drop it. PR 1 delivers the conceptual residue and real
  indices; its current rendering gap is a declared PR 3 dependency, not a solved display case.

Oracles are literal codons from gc.prt 4.6 and hand-written expected proteins, never the code's
own output.

The subject is PR 1's conceptual translation and its import, save and project-load wiring:
it receives local DNA plus normalized CDS geometry/qualifiers, and either supplies the current
conceptual result or explicitly declines to verify. The save boundary alone replaces/removes
the stored protein; the prerequisite owns location normalization and PR 3 owns drawing.

| Guarantee/source | Existing protection inspected | Decision |
|---|---|---|
| Effective frame and aligned extraction preserved | `sequence.test.ts`, “applies codon_start=$codon_start after interval orientation and gap removal” asserts literal coding sequence and indices | Reuse extraction cases; add save-to-export phase case below |
| GFF3 strand-relative phase and unrelated-edit fidelity | `gff3.test.ts`, “computes reverse CDS phases in transcription order” asserts row phases; “retains different imported phases per part through re-export” preserves distinct values | Reuse; strengthen with edited-frame invalidation through save |
| Current protein across save, import/attachment, project load, count, details-copy and GenBank/GFF3 export | None found for this new shared conceptual-result contract; existing extraction tests do not prove these entry points | Add cases at the named boundaries below, including unavailable and preserved curated paths |
| Single protein field and no format bump | `projectFile.test.ts` refuses malformed format 2; no protection found for the new single-store contract | Strengthen format-2 save/load and check-discard coverage |
| Partial terminal stop / NCBI terminal-only removal | None found for partial-end handling in the new conceptual result | Add domain + save/export case below; reject false internal stop/removal |
| Biological-strand invalidation / accessor + decision 3 | `featureManager.test.ts` invalidates phase caches on numeric strand edits; no unknown-to-known protein replacement assertion found | Strengthen editor→save→export for both unknown states and unrelated-edit preservation |
| Mixed explicit/omitted orientation / LOC-3 | `sequence.test.ts` orientation/frame case uses all-explicit strands; `gff3.test.ts` mixed-strand case asserts per-part directions but not omitted fallback | Strengthen extraction and conceptual/save/export coverage; reject MF instead of ME |
| Stop-X, chip units and length-warning membership / comparison contract | None found for these new comparison/mark contracts | Add comparison→both import paths and project load; PR 3 owns chip/tooltip assertions |
| Padded-residue visibility and marks | None found for two-index residue drawing/hover | PR 3 acceptance dependency; no claim that PR 1 verifies drawing |

The cases below are proposed acceptance evidence, not executed tests. The implementer records
actual checks against these guarantees at handoff. Each fixture uses table 1, `codon_start=1`
and normalized exact ends unless explicitly overridden; indices are zero-based. A one-feature
record makes each warning-count assertion exclude unrelated features.

| Guarantee | Test | Cases |
|---|---|---|
| Recompute on move | `featureManager.test.ts` at the save boundary | A CDS moved so it encodes `ATG AAA TAA`: `/translation="MK"`, source `computed` |
| Omit on internal stop | same, then `serialize.test.ts` | Issue fixture moved to `[9,18)`: no `/translation` in output, one warning naming codon 2; early-stop flag true |
| Omit on invalid code or exception | same | `/transl_table=99` edit: removed, reason named. Adding, changing or removing a `/transl_except`: removed with the PR 1 reason; removing the last one recomputes; a removal that exposes an internal stop omits and warns |
| Kept on unrelated edits | same | A name or colour change keeps `MK` and `imported`. Recompute, then a label edit: stays `computed` |
| Read-only | `FeatureEditorModal` test | The `/translation` row can't be edited and shows its source label |
| Type change | same, then serializer | CDS→misc_feature: no `/translation` in GenBank output; back to CDS recomputes. A GFF3 `SO:0000316` CDS keeps its `/translation` through import and export |
| One store | parser, serializer, project, details-copy tests | No `feature.translation`. Details copy reads the stored protein. Save a format-2 project with `metadata.translation="MK"`; reload retains `MK`, with no top-level protein, no version bump and no protein migration |
| Conceptual translation | `translation.test.ts` | GCN→A; NNN→X; GAN-like {D,N} codon `RAY`→B; RNA `AUG`→M. Complete table-11 GTG start→M; GTG start with `/codon_start=2`→not M. Table 27 complete `ATGAAATGA`→`MK`; 3′-partial same→`MKW`. Table 28 complete ending `TAR`→terminal stop dropped; table 1 ending `TRA` (TAA or TGA, both stops)→dropped; ending `TMA` (TAA stop or TCA Ser)→X with `threePrimeIndeterminate`. `ATGGC`→`MA`; `ATGNN`→`M`. Invalid code→`unavailable` |
| Partial ends | `featureManager.test.ts`, with #226's state | A 5′-partial CDS starting GTG, moved: codon 1 stays V. Forward and reverse strands |
| Comparison | `translation.test.ts` | Stored X vs K: no difference. `ATGYTNTAA` with stored `MT`: a difference under table 1, none under table 3. Conceptual `AAN` (K/N) vs stored K: none; vs stored W: difference. Stored K vs internal stop: difference. Stored `M*G` vs conceptual `M*G`: none, and the early-stop flag is still true. Stored `MKV` vs `MK`: `storedExtra="V"`. ATGTAA with stored `M`: none |
| Import warning | `bioResponse.test.ts` | A GenBank file with one differing CDS logs one warning naming 1 CDS. FASTA plus GFF3 with a mismatching `translation` attribute warns at attachment. A CDS with `/exception` adds none |
| Count | `TrackTooltip.test.tsx` | ATGTAA: "1 aa" with and without stored `M`. `ATGTAAGGGTAA`: "3 positions, 1 internal stop". Invalid code: "can't verify" |

| Review guarantee | Verification boundary | Literal inputs and hand-derived expected outputs |
|---|---|---|
| Finding 1: biological strand gate | GFF3 attachment → save → tooltip and GFF3/project export | FASTA `>r` / `ATGAAATAA`; GFF3 row (each `\t` denotes a literal tab) `r\tx\tCDS\t1\t9\t.\t.\t0\tID=c;translation=MK`, repeated with strand `?`. Attachment keeps `MK` imported, yields `unknown-strand`, no mismatch count, no aa count or early-stop assertion and no codon lane. Move end from 9 to 6: protein removed, source `removed`, one reason warning; GFF3/project export has no translation and retains `.`/`?`; GenBank refuses unresolved strand. A numeric +1 must not produce `MK` as verified. |
| Finding 2: no migration | project save/load | DNA `ATGAAATAA`, CDS `[0,9)+`, `metadata.translation="MK"`, source `imported`: serialized `format=2`, one protein field, reload retains `MK`; no format-3 output or top-level fallback. |
| Finding 3: final contextual set | conceptual/comparison unit | Complete table-28 `ATGTAN`: `residues="MX"`, `possible=["M","*Y"]` as sets, end uncertain, no definite internal stop. Stored `MQ` → `differing=[1]`; stored `MY` → `[]`. Ordinary Q from TAA/TAG must not survive terminal processing. |
| Finding 4: exact end consumption | dependency normalization → conceptual result and save/export | Table-11 `<1..9` over `GTGAAATAA` → `VK`; `complement(1..>9)` over `TTATTTCAC` → `VK`. Exact versions → `MK`. Joined table-27 `join(1..6,10..>12)` over `ATGAAACCCTGA` → `MKW`; exact last end → `MK`. Mixed `join(1..6,complement(<10..12))` over `ATGAAACCCTCA` → `MKW`; remove `<` → `MK`. Clear raw text on an edit: flags/outputs persist. Clip table-27 exact `ATGAAATGACCC` / `1..12` to `[0,9)`: `1..>9` and `MKW`, not `MK`. A CDS `[0,9)+` with no segments, no recoverable text and no established end state yields `unknown-completeness`; import keeps `MK`, invalidating edit removes it with one warning. |
| Finding 5: stop beats X | comparison → import warning and early-stop display | DNA `ATGTAAGGGTAA` → `M*G`; stored `MXG` → `differing=[1]`, one differing CDS in file warning, early-stop true (codon 2). Stored `M*G` → `[]`, zero mismatch warning, early-stop still true. Stored X vs conceptual K remains compatible. |
| Finding 6: discrepancy units | comparison unit; PR 3 chip assertion | DNA `ATGTAAGGGTAA`, stored `M` → `storedShortBy=2`, chip “−2 positions” (one stop, one G). DNA `ATGAAAGGGTAA`, stored `M` → same count/chip (K,G). DNA `ATGTAA`, stored `MK` → `storedExtra="K"`, “+1 position”; no chip unconditionally says aa. |
| Finding 7: local single-sequence gate | import → invalidating save → counts and GenBank/GFF3/project export | DNA `ATGCCCAAATAA`, location `order(1..3,7..12)` with stored `MK`: `definesOneSequence=false`, `nonlocal-location`, kept imported, no comparison/count/early-stop or codon lane. Same for `join(1..3,J00194.1:7..12)` with explicit remote part. Move the local `[0,3)` part to `[1,4)`: still unavailable; remove protein, one reason warning, all exports omit translation (remote location handling remains dependency-owned). Positive control `join(1..3,7..12)` → `MK`, count “2 aa”, and a successful recompute/export. No implicit remote fetch. |
| Finding 8: phase authority, editor decision pending | editor → save → conceptual result → GFF3 export/reimport | DNA `AATGCCCTAA`, imported row `r\tx\tCDS\t1\t10\t.\t+\t1\tID=c;translation=MP`: phase 1 / codon_start 2 skips A, `ATG CCC TAA` → `MP`. Change effective phase to 2 through the chosen control: codon_start 3 skips AA, `TGC CCT AA` → `CP` (AAN ambiguous tail dropped), source computed, export phase 2 and translation CP. Multipart DNA `AATGCNNNCCTAA`, same-ID rows 1..5 phase 1 and 9..13 phase 2: old MP; edit initial phase to 2 → CP and row phases `[2,0]`, because `(2−5) mod 3=0`. Retained `[1,2]` cannot be reused; reimport gives codon_start 3 / CP. Under option B a direct phase-row edit is blocked and this change uses codon_start 2→3; under A it uses phase 1→2 and conflicting simultaneous frame edits are refused. Unrelated name edit keeps original `[1,2]`. |
| Partial terminal stop (round-4 finding 1) | conceptual → invalidating save → count/export | Table 1 DNA `ATGAAATAA`, normalized exact `1..9`, stored MV imported; edit end marker to `1..>9`: ATG=M, AAA=K, TAA=*; drop final *, `residues="MK"`, `possible=["M","K"]`, `internalStops=[]`, count “2 aa”, early-stop false, stored MK computed, GenBank `/translation="MK"`, no removal warning. Table-27 same edit over `ATGAAATGA`: MK→MKW (ordinary TGA=W); exact control→MK. Partial table-1 `ATGTAATAA`→`M*`, stops `[1]`: preceding stop remains and causes removal/warning. |
| Biological-strand save (round-4 finding 2) | editor → save → source/details and GenBank/GFF3 export | DNA `ATGAAATAA`; GFF3 row `r\tx\tCDS\t1\t9\t.\t.\t0\tID=c;translation=MV`, repeated with strand `?`: import keeps MV imported, unknown-strand. Choose Forward, clearing `_gffStrand` with numeric +1 unchanged: effective strand changes to +1; save stores MK computed, label “Computed from the DNA”, both exports contain MK, no stale MV. Control: rename while unresolved retains MV imported/unavailable. Known +1→+1 rename retains curated MV imported (original verified import warns once). |
| Resolved interval extraction (round-4 finding 3) | extraction → conceptual → save → GenBank export/reimport | DNA `CATTTC`, feature −1, exact evaluation-order segments `[{start:0,end:3,strand:-1},{start:3,end:6}]`: effective strands [−1,−1]; rc(CAT)=ATG then rc(TTC)=GAA, indices `[2,1,0,5,4,3]`, coding ATGGAA, protein ME. Change second strand from +1 to omitted: old MF becomes ME computed; export a location evaluating as `join(complement(1..3),complement(4..6))` (equivalent canonical spelling allowed) and `/translation="ME"`; reimport computes ME. No implicit forward TTC or whole-join reversal. Control with both strands omitted retains whole-feature reverse order: coding GAAATG→EM; GAA is not an initiator. |
| Shared PR 3 comparison (round-4 finding 4) | comparison/import; PR 3 projection/chip/tooltip | DNA `ATGTAAGGGTAA`, stored MXG: conceptual M*G, differing `[1]`, exactly one warned CDS; tooltip “Annotation differs from DNA at 1 codon”; X drawn with stop edge. Stored M*G: differing `[]`, no mismatch warning, early-stop still true. DNA `ATGAAAGGGTAA`, stored M: short by 2, chip “−2 positions”. DNA `ATGTAA`, stored MK: extra K, chip “+1 position”, despite no internal stop. PR 3 implements visual assertions. |
| Length-only warning (round-4 finding 5) | GenBank import and FASTA+GFF3 attachment, repeated on project load; PR 3 tooltip | DNA `ATGAAATAA`→MK. Stored M: `differing=[]`, shortBy 1, extra empty; one warned CDS, tooltip “Annotated protein is 1 translation position shorter than the DNA-derived protein”. Stored MKV: differing empty, shortBy 0, extra V; one warned CDS, corresponding “1 translation position longer” tooltip. Both retain imported value/source. Stored MK: no warning or length clause. Repeat shorter/longer with `/exception="RNA editing"`: zero file mismatch warnings, explanation retained. Combined stored MVV: differing `[1]`, extra V, one warned CDS, both “1 codon” and “1 translation position longer” clauses. Literal GenBank qualifiers are `/translation="M"` or `"MKV"`; attachment rows are `r\tx\tCDS\t1\t9\t.\t+\t0\tID=c;translation=M` or `translation=MKV`. |
| Project check trust question | project load → counts/warning/details | Format 2, DNA `ATGTAAGGGTAA`, normalized CDS `[0,12)+`, stored `MKG`, source imported, forged `_translationCheck` saying no differences/no stops: discard check, recompute `M*G`, difference `[1]`, one mismatch warning, early-stop true, “3 positions, 1 internal stop”; stored `MKG` and source unchanged. Repeat with no cache: identical result. |
| Padded-codon integration question | conceptual result; PR 3 drawing/hover acceptance | Exact `1..5` over `ATGGC`: `MA`, sets `{M},{A}`, A's real indices `[3,4]`, count “2 aa”; GC plus any base gives A. PR 3 must assert A is visible and hoverable with the documented span/target and no invented index 5. `ATGNN` → `M`, no second residue/target. |

## Living documents

- **TRANS-1:** codon-state ambiguity resolution and the leftover-base rule.
- **TRANS-3:** the computed initiator rule.
- **TRANS-4 (PR 2):** exception application.
- **#71:** a note that its "edited features fall back to computed" assumption is now enforced.
- **Edit undo:** a new issue, filed with the owner's go-ahead.

## Rejected alternatives

- **Writing `*` inside an exported `/translation`.** INSDC defines `/translation` as amino-acid
  letters. NCBI's recompute path cuts at the first stop, while its product-copy path can keep an
  internal `*`. So NCBI does not settle it either way, and omitting it is Dunceious's choice
  (decision 4).
- **Cutting at the first stop.** That exports a protein the CDS does not describe as a whole.
- **Keeping hand edits of `/translation`.** It mixes computed and asserted proteins in one
  field, which Geneious and CLC both keep apart.
- **Always overwriting an imported `/translation` that differs.** It destroys curated variants.
  INSDC's `/exception` and table2asn's protein override both allow a supplied product.
- **Applying `/transl_except` partially in PR 1.**
  - Biopython 1.88 ignores it and copies its positions unchanged when a region is sliced.
  - Artemis 18.2.0 computes the offset by endpoint subtraction, ignoring introns
    (`Feature.java:1876`).
  - JBrowse 2 reads only the first range of a join (`geneticCodes.ts:255` at `c8142241`).

  Each of these asserts a wrong protein in some case. Doing it properly is PR 2.

## Open decisions

- **GFF3 phase editor (finding 8).** The standard and existing extraction/export contract
  settle `phase=p ↔ codon_start=p+1` for the first evaluated interval, not which UI field is
  editable. NCBI's INSDC/ASN.1 frame machinery (`sequence.cpp:3670`, Toolkit `912b751`)
  consumes the CDS frame and does not settle a GFF3 qualifier editor. The source surveys
  above do not document a phase-edit UI policy. Options: (A) accept phase edits, normalize
  to `codon_start`, and reject conflicting simultaneous phase/frame edits; (B) make the
  redundant phase row read-only and direct edits through `codon_start`, showing the derived
  phase there. **Recommendation: B**, since extraction and export already use `codon_start`
  and one editable authority prevents conflicts. Owner choice required before implementing
  the editor; neither option is authorized by this spec yet. Both must satisfy the literal
  save/export acceptance case above. For multipart CDSs the control changes only the first
  evaluated phase and regenerates downstream phases; arbitrary independent row-phase editing
  is not implied.

## Left to the builder

- Where `_translationCheck` is cached, provided it is recomputed when the record or feature
  changes and always discarded/recomputed on project load.
- Exact log and tooltip wording, within the meanings above.
