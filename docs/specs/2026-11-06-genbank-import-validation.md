---
title: "GenBank import validation: refuse broken meaning, note conformance problems"
status: proposed
date: 2026-11-06
areas: ["genbank-io", "sequence-io", "app"]
prs: [298]
issues: [286, 244]
superseded_by: null
summary: "A GenBank file is refused as a whole, with every problem named, when a record's sequence, coordinates or molecule would be wrong. Feature-table conformance problems load with import notes shown in the log and a quiet status-bar list. Layout and inert unknown qualifiers are accepted silently, and export refuses residues GenBank cannot hold."
---
# GenBank import validation — design

## Why

The GenBank reader turns malformed files into records that look valid.

| What happens | Where |
|---|---|
| ORIGIN keeps every letter plus `-` and `*`, and silently drops everything else, including digits inside residue lines and punctuation | `toSeqRecord.ts:42` (`[^A-Za-z\-*]` removed) |
| The LOCUS sequence length is never read, so a length mismatch passes unnoticed | `headerParser.ts:58-65` keeps only the name, topology and molecule |
| A missing LOCUS becomes `Unknown`; a missing ORIGIN becomes an empty sequence | `headerParser.ts:48`, `toSeqRecord.ts:30-45` |
| A final record without `//` is accepted, so a truncated file loads | `recordSplitter.ts:25`, `index.ts:43` |
| A malformed location salvages any digits it can find, and one with none becomes `[0,0)`. Nothing checks locations against the sequence length | `locationParser.ts:90-103` |
| Unknown keys and qualifiers are accepted without vocabulary checks. Repeated qualifiers keep only the last value | `featureParser.ts:58-97`, `qualifierParser.ts:61` |
| The worker reports success or one error string. It has no warning channel for a parsed file | `workers/handlers/bio.ts:43-48` |
| The session molecule gate reads only the first LOCUS line. Other records in the file are not checked | `useFileHandlers.ts:186-196` |

[#244](https://github.com/JoaoVictorDaijo/dunceious/issues/244) reports the GenBank and molecule
part of this (OBS-03, OBS-28). [#286](https://github.com/JoaoVictorDaijo/dunceious/issues/286)
point C asks that GenBank stay ungapped.

## Decisions (owner, 2026-11-06)

- **Three tiers.**
  - **Refuse:** the sequence, coordinates or molecule would be wrong.
  - **Warning:** a conformance problem, with severity closer to NCBI's.
  - **Accepted silently:** layout and inert unknown qualifiers.
- **A refused file loads nothing.** Every problem is listed at once (#244's triage left
  "reject or normalize" open; the owner chose reject).
- **Warnings stay out of the way:** a log line plus a per-file import summary.
- **Confirmed later the same day:**
  - `*` in a protein record is refused, and so is a CONTIG-only record;
  - the showroom shows no import notes, and a test pins its samples' warning list instead;
  - feature names keep coming from `/label` when it is the only name.

## Standards and reference behaviour

- **GenBank release 274.0** ([gbrel.txt](https://ftp.ncbi.nlm.nih.gov/genbank/gbrel.txt)):
  - §3.4.4: LOCUS fields, including the sequence length and its unit (`bp` or `aa`);
  - §3.4.13: the ORIGIN header line;
  - §3.4.14: sequence lines, a base count followed by residue groups;
  - §3.4.15: CONTIG, which may follow ORIGIN, or stand in place of sequence data;
  - each entry ends with `//`.

  Recorded as FMT-2.
- **INSDC Feature Table 11.4 (April 2026):**
  - §7.4.1: nucleotide codes A C G T/U R Y M K S W B D H V N;
  - §7.4.3: amino-acid codes;
  - §3.4: the location grammar, with examples in §3.4.3;
  - Appendix II and III: feature keys, their mandatory and optional qualifiers, and qualifier
    value formats.

  Recorded as ALPHA-1, ALPHA-2, LOC-1 to LOC-7 and FMT-3.
- **NCBI severities.** Legacy Sequin orders them INFO < WARNING < ERROR < REJECT. The modern C++
  validator uses Info, Warning, Error, Critical and Fatal. In its own unit tests:
  - invalid residues, wrong sequence length and out-of-range locations are Critical;
  - unknown feature keys, unknown qualifiers and qualifiers on the wrong feature are Warnings.

  Sources: `unit_test_validator.cpp` at `d0d7af1` and `wrong_qual.cpp` r93578. These are
  validator expectations, not GenBank import outcomes.
- **Other tools** (documentation and source survey, 2026-11-05; nothing was run):
  - Biopython 1.85 keeps `-`, `*` and non-IUPAC letters in a sequence. It warns, without
    refusing, on a length mismatch or a bad location.
  - Biopython's end-of-file handling depends on where the file ends. After at least one sequence
    line it warns and supplies the terminator; earlier, it raises. This is from reading the
    source.
  - BioJava 5.3.0's default DNA set rejects `*` and digits, and converts `.` to `-`.
  - No GUI tool documents its handling of invalid files.

  So refusing is the owner's policy, not a cross-tool consensus. The evidence is in
  `gb-validation-policy/scratch/evidence.md`, outside the repository.

## Goals

- No record enters the workspace with a sequence, coordinates or nucleotide/protein category
  that differ from what the file states. The DNA/RNA subtype keeps today's classifier and its
  known limit until #243 (see "Category and subtype").
- Every refusal names the file, each record and the problem, all at once.
- Every problem the Warning table lists is visible on demand, without interrupting the load.
  Checks it doesn't list are out of scope: the protein vocabulary, and qualifier values beyond
  `/codon_start` and `/transl_table`.
- GenBank export never writes a residue GenBank cannot hold, and never counts one in LOCUS.

## Non-goals

- FASTA alphabet validation (#244's FASTA part) and BED/GFF3 field loss (#250).
- LOCUS field parsing beyond the sequence length: topology, molecule subtype, division and
  date stay with [#243](https://github.com/JoaoVictorDaijo/dunceious/issues/243).
- Keeping every repeated qualifier, which is
  [#242](https://github.com/JoaoVictorDaijo/dunceious/issues/242). This spec only reports the
  loss until #242 lands.
- Supporting `order()`, `n^n+1` and remote locations. Those are
  [#225](https://github.com/JoaoVictorDaijo/dunceious/issues/225),
  [#230](https://github.com/JoaoVictorDaijo/dunceious/issues/230) and future work.
- Comparing a stored `/translation` with the DNA, which is #253's spec (PR #291).
- Repairing files. Nothing is stripped, clipped or guessed.

## Anti-goals

- Loading part of a refused file.
- Keeping a residue while removing the character next to it, or shifting coordinates.
- A warning dialog that interrupts every import.
- Treating a valid but unsupported form (CONTIG, remote location) as "corrupt".

## The checks

The reader collects findings as it parses, instead of filtering silently. Each finding names the
record (LOCUS name and position in the file) and, where it applies, the feature (key plus name)
and the line.

### Refuse

| Check | Rule | Message (example) |
|---|---|---|
| Missing LOCUS | Each entry starts with LOCUS (GenBank §3.4.4) | "Record 2 has no LOCUS line." |
| No sequence data | An entry with no sequence lines, whether or not an ORIGIN header is present, and no CONTIG | "NC_X has no sequence." |
| Sequence only as CONTIG | The entry has a CONTIG line (§3.4.15) and no sequence lines, with or without an ORIGIN header. The sequence must be assembled from other entries | "NC_X gives its sequence as CONTIG (assembled from other records), which Dunceious can't read yet." |
| Missing final `//` | Each entry ends with `//`. A file that ends inside an entry may be cut short | "The file ends inside record 4 without //; it may be cut short." |
| Residue characters | Sequence lines are a base count, then residues (§3.4.14 writes them in groups of 10 separated by spaces). Grouping is layout and is not enforced: a line of 60 residues without spaces is accepted. After removing the leading count and all whitespace, every character must be a residue: ALPHA-1 for DNA/RNA, ALPHA-2 for protein, either case. `-`, `.`, `*`, digits inside the residues and any other symbol are refused, with the first position | "The sequence contains "-" at base 1,204." |
| Length mismatch | The LOCUS length, the integer token followed by the unit token `bp` or `aa`, equals the residue count (§3.4.4) | "LOCUS says 39,937 bp, but ORIGIN has 39,935 bases." |
| LOCUS length or unit unreadable | No integer token followed by `bp` or `aa` | "NC_X's LOCUS line has no sequence length." |
| Malformed location | The location text must parse fully under LOC-1–LOC-7. Today's digit salvage is removed. Valid fuzzy (`<`, `>`) and `join`/`complement` forms pass | "CDS location 12..2x10 can't be read." |
| Missing location | A feature key line (key at column 6) with no location. Today `featureParser.ts:56` recognises a feature only when its location is on the same line, so such a feature is skipped silently, with its qualifiers. Feature key lines are now detected on their own | "A gene feature has no location." |
| Unsupported location form | `order()` until #225, `n^n+1` until #230, `n.m` (one-of) and remote `ACC:n..m` until supported. They are legal INSDC, but today's parser reads them as different bases | "gene1 uses a remote location (AB123:1..20), which Dunceious can't place." |
| Location out of range | Every position satisfies 1 ≤ position ≤ the sequence length. A between-base site `n^1` on a circular molecule, with n = length, is allowed once #230 lands | "CDS 12..2210 runs past the end of the 2,040 bp sequence." |
| Malformed qualifier | An unterminated quoted value, or a qualifier line that can't be read. Either could swallow the lines after it. Recovery: parsing resynchronises at the next unambiguous boundary, a feature key line (key at column 6), `ORIGIN`, `CONTIG` or `//`. The lines in between aren't read as qualifiers, and the finding says so. Later features and records are still checked, so the "everything at once" promise holds outside the broken feature | "/note on CDS gene1 has no closing quote; the rest of that feature wasn't checked." |
| Molecule mixture | Each record's category comes from its LOCUS unit token: `bp` is nucleotide and `aa` is protein. It is not found by searching the whole line, which today reads a locus named `AA` as protein (`sequence.ts:389-393`). Within one file all records must share one category | "This file mixes protein and nucleotide records." |

**Category and subtype are separate.**
- The unit token decides the session category, for this check and for the session gate's sniff
  (`useFileHandlers.ts:38-42`):
  - `aa` makes the record `protein`;
  - `bp` makes it nucleotide.
- For a `bp` record, the DNA/RNA subtype still comes from today's `classifyLocusMoleculeType`
  (`headerParser.ts:65`). The subtype drives the complement (`sequence.ts:46`) and the exported
  LOCUS (`serialize.ts:55`). Its known limit stays deferred to #243: a locus name containing
  `rna` can mark a DNA record as RNA.
- So a `bp` record is never protein, an `aa` record is always protein, and nothing else
  changes.

T in an RNA record is valid (ALPHA-1: INSDC writes `t` for uracil in RNA), and `n` and the other
ambiguity codes are valid residues. Neither is ever a finding.

### Warning

| Check | Rule | NCBI analogue |
|---|---|---|
| Unknown feature key | Not in INSDC 11.4 Appendix II | Warning (unknown imported feature key) |
| Qualifier not allowed on the key | A **recognised** qualifier (in Appendix III) that Appendix II does not list for that key, e.g. `/codon_start` on a `gene`. Unrecognised qualifiers never trigger this; they are accepted silently on any key (see below). An unknown key gets the unknown-key warning only, never one per qualifier | Warning (WrongQualOnImpFeat) |
| Mandatory qualifier missing | e.g. `source` without `/organism` or `/mol_type`; `regulatory` without `/regulatory_class` | REJECT in legacy Sequin for a missing organism. Dunceious keeps the record and warns, because its sequence and coordinates are intact |
| Repeated qualifier, last value kept | Until #242 lands | None; this is Dunceious's own data loss, so it must be visible |
| Duplicate LOCUS names | Records keep unique internal IDs (`makeUniqueId`, `bioResponse.ts:87-91`), and the note names the renaming | None |
| Invalid frame | `/codon_start` must be exactly `1`, `2` or `3` (INSDC 11.4 Appendix III). Values such as `0`, `4` or `2junk` today reach `parseInt` and shift the frame (`sequence.ts:232-236`). The value is kept, and the note names it. One shared check, `validCodonStart`, guards every result that depends on the frame: the translation track, the early-stop flag, the Hub's amino-acid count (`TrackTooltip.tsx:46,58` today shows `2 aa` for `4` and `NaN aa` for `2junk`), and GFF3 phase export. Each shows the reason instead of a value. Selection export (`intervals.ts:144`) keeps an invalid value unchanged when it clips a CDS, and never computes a new frame from it, so the exported file stays flagged instead of carrying a guessed valid frame. GenBank export can't carry an invalid frame. Today it drops an empty `/codon_start=""` (`serialize.ts:91,109`), so a reimport would fall back to frame 1. So a record holding a CDS with an invalid frame (empty included) is left out of a GenBank export and named in the report: "<id> not exported: CDS <name> has an invalid /codon_start". This uses the same backstop as invalid residues. Project files keep the value | Error-level in NCBI's validator |
| Unknown genetic code | `/transl_table` not an NCBI code. Today it is only flagged when drawn (`cds.ts:32-35`). It now also appears in the import summary | Error-level in NCBI's validator; Dunceious keeps its no-translation rule (TRANS-1) |
| `/translation` differs from the DNA | Computed and counted by #253's spec; this summary displays it | Error (mismatch) |

The key and qualifier checks apply to nucleotide entries only. INSDC 11.4 is a nucleotide feature table, FMT-3 records no GenPept map, and protein records such as `examples/peptide/pomc-orthologs/human-pomc-NP_000930.gb` use protein keys and omit `/mol_type`. Protein entries still get every Refuse check and the frame and code checks where they apply.

The feature-key and qualifier tables come from INSDC 11.4 Appendix II. They are generated into a
pinned module (`src/domain/bio/insdcFeatureTable.ts`) by a script that reads the pinned feature
table fetched by `pnpm standards:fetch`. The module records its source version and checksum, as
`geneticCodes.ts` does for gc.prt.

### Accepted silently

- ORIGIN base counts and spacing, letter case, and line endings.
- Unknown qualifier names on known keys, such as SnapGene's `/label`.
  - **They are made inert.** Today every qualifier goes straight into `feature.metadata`
    (`featureParser.ts:88-95`), where some keys drive computation:
    - `/phase` becomes an exported `/codon_start` (`serialize.ts:91-104`);
    - `/_gffStrand` overrides the strand (`strand.ts:27-30`);
    - any `_`-prefixed key is treated as internal state.
  - A qualifier counts as recognised when it is in INSDC 11.4 Appendix III, for nucleotide
    entries, or in the existing protein qualifier map (`PROTEIN_QUALIFIERS`,
    `qualifierRules.ts:135`), for protein entries. GenPept `/coded_by` and
    `/calculated_mol_wt`, for example, stay recognised and keep being exported.
  - Any other qualifier, and any whose name starts with `_`, is stored in a separate
    `feature.unknownQualifiers` map. No computation reads it.
  - **Naming keeps today's behaviour, deliberately.** Name selection still reads the name-like
    qualifiers in `NAME_QUALIFIERS` (`featureParser.ts:34`), `/label` included. The feature
    name then feeds what it feeds today:
    - feature comparison's identity fallback (`featureComparison.ts:38`);
    - the exported `/standard_name` (`serialize.ts:88`).

    FMT-3 records name selection as a local policy, and changing it would change comparison
    groups for SnapGene files. That is outside this spec. "Inert" here means no frame, strand,
    translation, coordinate or molecule computation reads the map.
  - It is kept in project files and shown in the feature details. The GenBank writer leaves it
    out and counts it, as it already does for unknown attributes (`report.droppedAttributes`,
    `serialize.ts:107-110`).

## Flow

1. The worker parses as today, but `parseGenBank` returns `{ records, findings }`. Each finding
   is `{ tier: 'refuse' | 'warning', code, record, feature?, line?, message }`.
2. **Any `refuse` finding:** the worker replies with a new `PARSE_REFUSED` message that carries
   all findings. `useBioWorker` adds nothing to the workspace, opens the refusal dialog and
   writes one log line.
   - **A refusal is a handled result, not an error.** The picker and drop paths both continue
     with the other files in the batch. Today the drop path settles only on success
     (`useFileHandlers.ts:316-319`, `dropRouting.ts:58-66`), so a refusal must resolve its
     entry, not reject it.
   - Cancellation and genuine worker errors keep their current handling.
   - **No stale diagnostics.** Before a refusal dialog or import notes are shown, the response's
     import-start workspace revision is checked, using #296's revision capture.
     - A response from a replaced workspace shows neither its dialog nor its notes, and its
       per-file refusal or notes log line is not written either.
     - Instead the log records the invalidation once, as #296 specifies: "<file> was not loaded:
       the workspace was replaced".
   - **Batch rule, agreed with PR #296** (its §B, "Refusals and invalidation in a dropped
     batch", `cc77b96`):
     - **Handled, and the batch continues:** a per-file refusal. That means this spec's
       validation findings, and #296's no-residues, category, lock and gap-removal-declined
       refusals.
     - **The ID map:** a handled refusal settles with an ID map that sets every identifier of
       every record in the refused file to `null`: its LOCUS name, ACCESSION and VERSION. Each
       is entered both raw and as `sanitizeId` would give it (`idHelpers.ts:21`). Otherwise an
       annotation naming `foo_bar` for a refused `foo;bar` would miss the null entry and fall
       through to an existing `foo_bar`. It does not settle with an empty map. A null entry skips the name, accession
       and sanitized-ID fallbacks and reports the ID as unmatched (`bioResponse.ts:111-116`).
       The batch merge keeps an ID null even when an accepted file in the same batch uses it.
     - **Rejects, and stops the batch:** invalidation only. That is the workspace being replaced
       (a stale workspace revision counts as replacement), a worker failure, or unmount.
   - **Category on refusal too.** `PARSE_REFUSED` carries each record's validated category
     where its unit token is readable. Before showing the dialog, the main thread compares it
     with the **current** workspace, like the commit-time guard. A mismatch is added to the
     same dialog, so a malformed protein file in a nucleotide workspace lists both problems at
     once. When no unit is readable, the dialog shows the unreadable-LOCUS finding and makes no
     category claim.
3. **Only warnings:** records load as today, and the warnings travel with `PARSE_SUCCESS`.
   `useBioWorker` writes one log line per file and adds the file's notes to the import summary.
4. **The session molecule gate moves to commit time.**
   - For GenBank files, the dispatch-time sniff (`useFileHandlers.ts:186-196`, and the drop path
     near `:306-318`) no longer refuses or stops anything. The worker always parses the file, so
     the refusal dialog can show a mismatch together with every other finding.
   - FASTA keeps #296's handling.
   - The authoritative check is PR #296's commit-time guard. Right before records are added, it
     compares the file's category with the **current** workspace, which covers concurrent picks
     and workspace replacement.
   - This spec depends on that guard and feeds it the validated unit-token category, not the
     sniff. So the gate and the parsed result agree (#244's clear part).
   - If this PR lands first, it adds the guard as #296 specifies it, and #296 reuses it.

**Showroom.** The showroom (`sampleWorkspace.ts:48-56`) parses bundled samples straight through
the worker handler, with no import UI. A refuse finding there already fails loudly, because the
loader throws on anything but success. The showroom shows no import notes, since its samples
are curated. A test pins the samples' exact warning list instead, so any new finding in a bundled
sample fails the build. This is a scope choice for the owner to confirm.

## Presentation

The mockup is `.code/docs/genbank-import-validation/import-validation.html` in this worktree
(untracked).

- **Refusal dialog:**
  - one dialog collects every refused file of the batch, one section per file in arrival order;
  - a refusal arriving while the dialog is open adds its file to it and never replaces another
    file's findings;
  - the existing dark modal pattern (`GapRemovalNotice`, `MoleculeTypeMismatchModal`), with the
    rose accent the app uses for removal;
  - title "Can't open this GenBank file";
  - the file name and "wasn't loaded", then one row per problem: record, plain-language reason,
    and the line or feature where it helps;
  - after 20 rows, "and N more";
  - "Copy details" copies the full list as text, and "Close" closes it;
  - `role="alertdialog"`, with focus on Close.
- **Log:**
  - a refused file: "phage_set.gb not opened: 3 problems in 2 records (length mismatch, gap
    character, location past the end)";
  - a file with notes: "t7_annotated.gb opened with 5 import notes (…)".
- **Import summary:**
  - while notes exist, the status bar shows an amber chip, "5 import notes";
  - it opens a popover listing each file's notes, grouped by check, with counts and the first
    five names per group;
  - each group with more than five has "Show all N", which expands it in place, and the popover
    has "Copy details" for the full text, so every affected feature can be found;
  - notes stay until the user clears them or the records are removed;
  - with no notes, nothing is shown.

## GenBank writer

- PR #296 adds the writer backstop for gap characters: a record whose `sequence` contains `-` or
  `.` is left out of the export and named in the report.
- This spec widens the same check to anything that is not an ALPHA-1 (DNA/RNA) or ALPHA-2
  (protein) residue, `*` included. It uses one shared predicate, `isGenBankResidue`, which the
  reader's check uses too.
- Whichever PR lands second adopts the shared predicate. LOCUS length and ORIGIN keep reading
  `record.sequence`.
- With the reader refusing these characters, the backstop should never trigger. It covers
  project files and in-app edits.

## Validation

Expected results never come from the parser under test.
- **Bundled real records.** Every GenBank file under `examples/` must load with no refuse
  finding. Their expected record IDs, lengths and molecule categories are checked against
  values read independently from each file's LOCUS line and base count, by a separate test
  helper.
- **Biopython parity, the reference-tool oracle, for the forms Biopython supports.** A pinned
  script beside the existing
  conformance runs (`docs/standards/conformance/run_biopython.py`, Biopython 1.88) parses every
  accepted fixture and every bundled example. For each record it writes:
  - the sequence;
  - each feature's key and its location parts as 0-based start, end and strand;
  - the extracted feature sequence.

  The output is checked in. Dunceious's parsed records and extracted sequences must match it
  for every accepted case Biopython supports: fuzzy ends, complement, joins, circular origin
  crossings, boundary positions, lowercase, RNA with T, and protein records.
- **The standard-derived oracle, where Biopython disagrees.** Biopython 1.88 rejects nested
  outer complements (conformance cases J4, J5 and W2, `docs/standards/conformance/README.md`).
  Those cases, and any other form the conformance README records as a Biopython disagreement,
  are checked against the existing independent `docs/standards/conformance/oracle.py`. For
  example, J4 `complement(join(complement(1..2),5..6))` on the conformance fixture sequence
  must extract `GTTG`, `oracle.py`'s result. EMBOSS's differing `GTCA` is not the target.
- **RNA records.** Biopython extracts minus-strand features with a DNA complement, while
  Dunceious complements U to A for RNA (`sequence.ts:46`). For RNA records, Biopython's output
  is compared after reading T and U as the same base, which ALPHA-1 allows. A minus-strand
  `ACGU` case checks this explicitly against `oracle.py`. For the defects Biopython warns about
  (length mismatch, unparseable location), its warning is the independent sign of the defect.
- **Literal flat files** in `src/core/genbank/__tests__/` cover the rest, each with its expected
  outcome written from the GenBank and INSDC rule it tests.

| Guarantee | Cases |
|---|---|
| Real records | Every `examples/**/*.gb` loads with no refuse finding, including the protein `human-pomc-NP_000930.gb` with no vocabulary warnings. Its `/coded_by` survives import and GenBank export. Sequences, location parts and extracted sequences match the checked-in Biopython 1.88 output |
| Residues | `acgtn` and `ACGU` with RNA LOCUS, and `ACGT` with RNA LOCUS (T in RNA): accepted. `ac-gt`, `ac.gt`, `ac*gt`, `ac1gt` inside a residue group, `ac?gt`: refused, each naming the position. Protein `MKV*`: refused at `*`; protein `MKUXBZJO`: accepted |
| Layout | Standard ORIGIN lines with counts and spaces: accepted, sequence unchanged |
| Length | LOCUS 10 bp with 10 bases: accepted; with 9 bases: refused with both numbers; LOCUS without a length: refused. A 120,000 bp record with long count columns: accepted |
| Structure | No LOCUS; ORIGIN header with no sequence lines; no ORIGIN at all; CONTIG with no ORIGIN; ORIGIN header followed by CONTIG and no sequence lines (CONTIG message both times); final record without `//`: each refused. A two-record file with one bad record loads neither |
| Locations | `<1..>10`, `complement(join(1..3,7..9))`: accepted. `1..2x0`, `1..20` on 10 bp, `0..5`, `AB123:1..5`, `order(1..3,5..7)`, `5.7`: refused with their messages. `10^11` refused until #230 lands, then accepted |
| Qualifiers | Unterminated `/note="abc`: refused. Unknown key `my_feature`: warning. `/organism` missing on `source`: warning. `/gene` repeated: warning naming it. `/label` on a CDS: no finding |
| Molecule | `LOCUS AA 4 bp DNA linear` is nucleotide; `LOCUS rnaseP 300 aa` is protein. A nucleotide and a protein record in one file: refused. A protein file picked together with a nucleotide file into an empty session: whichever commits second is refused, in both response orders. A protein-first file with a later malformed record, in a nucleotide session: one dialog listing the mismatch and the malformed record |
| Frame | `/codon_start=0`, `4`, `2junk`: note, translation suppressed, value kept. `/codon_start=2`: no note |
| Inert qualifiers | GenBank `/phase=1` on a CDS without `/codon_start`: stored in `unknownQualifiers`, the frame stays 1, export writes no `/codon_start=2`, and reimport gives the same CDS. `/_gffStrand="."`: the strand stays as parsed |
| Aliases | A refused file with `LOCUS X` and `ACCESSION AB123`, dropped with a GFF3 naming `AB123`, into a workspace that already has a record with accession `AB123`: the GFF3 rows stay unmatched. A refused `LOCUS foo;bar` with a GFF3 naming `foo_bar`, into a workspace that already has `foo_bar`: unmatched, for both the raw and the sanitized annotation ID |
| Qualifier recovery | A CDS with `/note="abc` unclosed, followed by an indented `/codon_start=4` and a later `gene` with a malformed location: one dialog with the unclosed note, which says the rest of that CDS wasn't checked, and the gene's location finding |
| Wrong-key and private qualifiers | `/codon_start` on a `gene`: wrong-key warning. `/label` on a CDS, and any qualifier on an unknown key: no wrong-key warning. An unknown key with `/gene` repeated still gets the unknown-key warning and the repeated-qualifier warning |
| Missing location | A `gene` key line with no location, followed by a valid CDS, in an otherwise valid record: refused, naming the gene |
| Invalid frame through GenBank | A CDS with `/codon_start=""`, and one with `4`: both loaded with notes, translation suppressed; GenBank export leaves each record out and reports it; a project file round trip keeps the value |
| ORIGIN grouping | A sequence line with a count and 60 residues without spaces: accepted |
| Stale responses | The workspace is replaced while a malformed file and a file with notes are parsing: neither the dialog nor the notes appear, and neither file's refusal or notes log line is written. The log has one invalidation line per file, saying the workspace was replaced |
| Frame-dependent outputs | `/codon_start=4` and `2junk` on a 9-base CDS with no stored translation: the Hub shows the reason, not `2 aa` or `NaN aa`; no GFF3 phase is exported from them. `/codon_start=2`: count and phase as today. A selection export clipping a `/codon_start=4` CDS keeps `4`, and on reimport the CDS is still flagged with translation suppressed. A clipped `/codon_start=2` CDS gets today's rebased frame |
| Naming unchanged | A CDS named only by `/label=A`: its name is `A`, comparison groups it as today, and export writes `/standard_name="A"` as today |
| Batch | A drop of `[bad.gb, good.gb]` and of `[good.gb, bad.gb]`: the good file loads, the bad one shows the dialog. A category-mismatched GenBank file followed by a valid file: the valid file loads. An annotation file dropped with `bad.gb` doesn't attach to an existing record with the same ID |
| Combined dialog | A protein file with a length mismatch, dropped into a nucleotide workspace: one dialog listing the mismatch and the category refusal. A file with an unreadable LOCUS unit: the LOCUS finding only |
| Notes access | Seven invalid-frame CDSs: the group shows five, "Show all 7" lists all seven, and "Copy details" includes all seven |
| Concurrent refusals | Two refused files whose responses arrive before the dialog is closed, in both orders: one dialog with both files' complete findings |
| Category and subtype | `LOCUS X 4 bp RNA` with `ACGT`: `rna`, complement and export as today. `LOCUS rnaseq1 4 bp DNA`: nucleotide category, subtype as today (the #243 limit). `LOCUS AA 4 aa`: protein |
| Nested complements | J4, J5 and W2 from the conformance fixture: accepted, locations and extraction equal to `oracle.py` |
| Showroom | The bundled showroom samples load with no refuse finding, and their warning list equals a pinned expected list (today: repeated `/db_xref` on the T7 record, until #242) |
| Duplicate names | Two `LOCUS X`: both load with unique IDs and one warning |
| Writer | A record whose `sequence` is `AC*GT` or `ACRGT?`: left out and reported; `ACRGT`: written with LOCUS 5 bp |
| Presentation | Refusal dialog lists every finding, "Copy details" copies them, nothing is added to the workspace. Notes chip appears only with notes, and the popover groups them |

The INSDC vocabulary module is checked by its own test against a hand-curated expected table.
The table lists every feature key with its mandatory and optional qualifiers, checked
independently against the pinned feature table (`docs/standards/sources.json`, fetched by
`scripts/fetch-standards.mjs`). The generator is deterministic and runs offline from the pinned
file. Its output records the source checksum, and a test fails if regenerating gives a different
module.

## Living documents

- **FMT-2:** truncation, length and residue rules now enforced.
- **FMT-3:** the vocabulary checks.
- **LOC rules:** the refused unsupported forms.
- **ALPHA-1 and ALPHA-2:** cite the shared predicate.
- **#244:** leave open for its FASTA part.

## Rejected alternatives

- **Strip invalid characters and warn.** Every coordinate after a stripped character would shift
  silently, so features would point at the wrong bases.
- **Refuse only the bad records and load the rest.** That is a partial import that is easy to
  miss, and the owner chose whole-file refusal. Record-level salvage would need its own UI and
  provenance.
- **Clamp out-of-range locations to the sequence.** It changes coordinates silently.
- **A dialog for warnings.** It interrupts every import of files from tools with private keys.

## Related

- #286 (point C); PR #296, the gapped/ungapped spec. It owns the gap-character writer backstop,
  which this spec widens, and the commit-time session guard, which this spec depends on.
- #244 (GenBank residues, length and molecule gate; the FASTA part stays open).
- #242, #243, #250, #225, #226, #230.
- #253 / PR #291 (translation check).

## Left to the builder

- Exact message wording, within the meanings above.
- Whether the import summary lives in its own component or extends `StatusBar`.
