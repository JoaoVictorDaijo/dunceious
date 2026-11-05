# Canonical-correctness audit: handoff

This file lets the audit in [#284](https://github.com/JoaoVictorDaijo/dunceious/pull/284) resume on another computer without the original session. It is the entry point, and its [appendix](#appendix-the-audit-library) holds the text of the audit's local library.

> [!IMPORTANT]
> **Delete this file in the last commit before #284 merges.** The project's `CLAUDE.md` (§ Project documents) keeps handoffs untracked. The owner asked for this one to be tracked on 2026-11-05, and only while #284 is open.

## Start

```bash
git fetch origin && git switch docs/standards-oracle-audit   # or: wt switch docs/standards-oracle-audit
```

Then read this file, run [the resume steps](#resume-steps), and rebuild the oracles.

## Goal

The audit looks for code whose scientific result is **objectively wrong**: a published standard settles the case, and a pinned oracle disagrees with Dunceious. An oracle is a canonical reference implementation, either run or read. The audit fixes those defects without regressing anything. A finding needs all three of these:
1. A pinned oracle disagrees with Dunceious on a concrete input.
2. The standard's text, or the oracle's documented contract, backs the oracle.
3. A cross-check by the other model family returned CONFIRMED.

The orchestrator plans, dispatches and verifies. It owns the index, the ledger and every GitHub decision. Each worker takes one module in a side session the owner can watch.

## How work lands: #284 is the audit

Owner's instruction, 2026-11-05: **#284 is the audit's actual work.** It stays an open draft into `develop`, on branch `docs/standards-oracle-audit`. Its findings, fixture tests, rule updates in `docs/standards/` and fixes all land on this branch. This replaces the older "one PR per module into `develop`" lines in the original orchestrator handoff (appendix, `handoff.md`). The worker procedure and the briefs already follow the new model.

- **Workers:** each worker gets a module branch cut from `docs/standards-oracle-audit`. After its cross-check and regression guard, the orchestrator merges the branch into `docs/standards-oracle-audit` with a merge commit and pushes. #284's CI must then be green. Workers open no PRs of their own.
- **Keep it current:** when `develop` moves, merge `origin/develop` into the branch with a merge commit. Never rebase it.
- **Commits:** Conventional Commits, each carrying `[CF-Pages-Skip]`.
- **PR description:** update the title and description as findings land, giving the defect, the oracle and its version, and the test.
- **This file:**
  - update its state table and owner decisions when they change;
  - to hand off again, refresh the appendix from `$LIB`, keeping one marker and fence per file.

## State on 2026-11-05

| Item | State |
|---|---|
| Phase 0: local library | Done on the original machine: the oracles below, [an index of 12 modules (M1–M12)](#indexmd), and [a ledger seeded with A1's 13 cases](#ledgermd) |
| PR #284 | Draft into `develop`, on branch `docs/standards-oracle-audit`, pushed to origin. **Don't merge it** |
| CLAUDE.md wording | In #284 (`626b666`), with the widened trigger ("…or a reference tool disagrees with it") |
| Survey move-out (Option A) | **Done in #284** (`be2e9f2`), with the owner's approval on 2026-11-05. `survey/`, `tools.json` and `tool-counts.json` are out of the tree, and `tools.md` links the last commit that holds them (`5058424`). Local copies are in `.code/keep/canonical-correctness/reference/` on the original machine |
| History rewrite (Option B) | Commands and rollback are in the appendix (`proposals/move-out.md`). **Not recommended** (see decision 1) |
| Mirror backup | `.code/keep/canonical-correctness/backup/dunceious.git` on the original machine, made 2026-11-03: 280 refs, `main` `75b2f1d`, `develop` `e03f065`, 38 tags. **Keep it until the owner confirms stability** |
| Phase 1, v4.0.0 batch | **Not started.** The four task chips on the original machine were dismissed on 2026-11-05 when the work moved to #284. The updated briefs are in the appendix |
| `develop` | `5058424` (#281–#283 have merged since the plan; none is scientific) |
| Known deviations already filed | #225, #226, #230, #231, #241–#261 (each one cited by its rule in `docs/standards/`) |

## Owner decisions waiting

1. **History rewrite (Option B) on top of A: not recommended, but still open.** **A rewrite can't take the material off GitHub:**
   - force-pushes leave `refs/pull/*` read-only;
   - 22 of the 232 PR head refs contain `0a4c1f1`, the commit that added the survey;
   - "GitHub Support won't remove non-sensitive data" (GitHub's sensitive-data removal page, read 2026-11-03).

   The rewrite would still:
   - give new SHAs to `develop` (93 commits since `0a4c1f1`), `main` and `v4.0.0`;
   - break every clone;
   - need the owner to allow force-pushes on `main` and `develop` and to push the tag.

   Run it only if the owner asks, and only after the survey removal has reached `develop`, so the rewritten tips keep their trees.
2. **CLAUDE.md wording in #284.** The owner chooses between:
   - the base variant, without the "or a reference tool disagrees with it" clause;
   - the widened variant that #284 carries now.
3. **UCSC `bedToBigBed`/`validateFiles` for M7.** Their licence allows only non-commercial use.
4. **Jalview for METRIC-5.** This matters only once #254 is decided.
5. **Merges.** **Never merge #284.** The owner decides when it goes to `develop`, and this file is deleted before then.
   - Module branches merge into `docs/standards-oracle-audit` with merge commits.
   - Promotions to `main` follow the release checklist in `CLAUDE.md`.

## Resume steps

1. Check out `docs/standards-oracle-audit` ([Start](#start)).
2. Recreate the library, `$LIB` = `<primary checkout>/.code/keep/canonical-correctness/`. It is ignored through `/.code/` in `.git/info/exclude`. From the worktree, run:

   ```bash
   R=<primary checkout>   # e.g. ~/dunceious
   L=$R/.code/keep/canonical-correctness
   python3 -I - "$L" docs/canonical-correctness-handoff.md <<'EOF'
   import pathlib, re, sys
   lib, text = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]).read_text()
   for path, body in re.findall(r'<!-- lib: (\S+) -->\n`{5}markdown\n(.*?)\n`{5}\n', text, re.S):
       out = lib / path
       out.parent.mkdir(parents=True, exist_ok=True)
       out.write_text(body + '\n')
       print(out)
   EOF
   grep -rl --include='*.md' /home/mainframe/dunceious "$L" | xargs -r sed -i "s#/home/mainframe/dunceious#$R#g"
   ```

   - The script writes 15 files.
   - The last line replaces the original machine's path in the briefs and the procedure.
   - Then rebuild `oracles/` (below) and A1's run folder (below).
3. Get the owner's answers to [the decisions above](#owner-decisions-waiting).
4. Dispatch the four v4.0.0-batch workers as side sessions the owner can watch: a task chip, or `start_session` when the app offers it, but never the Agent tool's background `fork`. Each one branches from `docs/standards-oracle-audit`. Then work through Phase 1 step 2 by risk: M1 → M2 → M4/M5/M6 → M8/M9 → M10 → M11, then M3, M7 and M12.
5. Merge each worker's branch into `docs/standards-oracle-audit`, and its `runs/<module>/ledger.md` into `ledger.md`. Relay worker questions as quotes, and keep the GitHub footprint to #284 itself.

## Rebuild the oracles (Linux x86-64)

Put each oracle in its own new, empty directory under `oracles/`, and record `VERSION`, `SHA256`, `SOURCE_URL` and `run.md` (the appendix has the `run.md` texts). Run oracles only on inputs you wrote, and keep scripts in `runs/<module>/`. **Never install a system package or a second Node:** those are owner gates.

```bash
L=<primary checkout>/.code/keep/canonical-correctness
# NCBI table2asn 1.29.324
mkdir -p $L/oracles/table2asn && cd $L/oracles/table2asn
curl -fsSLO https://ftp.ncbi.nlm.nih.gov/asn1-converters/by_program/table2asn/linux64.table2asn.gz
gunzip linux64.table2asn.gz && mv linux64.table2asn table2asn && chmod +x table2asn
sha256sum table2asn   # 1.29.324: 88ec2acb32ab63b67d758311865b7dc0d4b98cae16c5b9f42454f28afb921d5b
./table2asn -version
```

**NCBI may now serve a newer build, and then the hash will differ.** Record the new version, re-run A1 and check its `.val` verdicts against the ledger before relying on it.

```bash
# NCBI C++ Toolkit source at 912b751 (read it, never build it)
mkdir -p $L/oracles/ncbi-cxx-toolkit && cd $L/oracles/ncbi-cxx-toolkit
git init -q src && cd src && git remote add origin https://github.com/ncbi/ncbi-cxx-toolkit-public.git
git sparse-checkout set --no-cone '/src/objmgr/util/' '/include/objmgr/util/' '/src/objtools/validator/' '/include/objtools/validator/' '/src/objects/seqfeat/' '/include/objects/seqfeat/' '/src/objects/seqloc/' '/src/objtools/format/' '/include/objtools/format/' '/src/objtools/readers/' '/include/objtools/readers/'
git fetch -q --depth 1 --filter=blob:none origin 912b751f211cb8757684d1ab4bfbdf05fb243da6 && git checkout -q FETCH_HEAD
sha256sum src/objmgr/util/sequence.cpp   # 3d4f6fceb4c37f572e403ccb874e5c804b63aceac847b9b4041507e8f796f32a
```

```bash
# NCBI gc.prt 4.6
mkdir -p $L/oracles/ncbi-gc-prt && cd $L/oracles/ncbi-gc-prt
curl -fsSLO https://ftp.ncbi.nih.gov/entrez/misc/data/gc.prt
sha256sum gc.prt   # 2aecbdd09ecc5e0d233c105090a593737298ef93d88f6bc0c1bef26df6051a04 (= docs/standards/sources.json)
```

```bash
# Biopython 1.88 (secondary oracle) in its own venv, from wheels only
mkdir -p $L/oracles/biopython && cd $L/oracles/biopython
pip download 'biopython==1.88' --only-binary=:all: -d wheels && sha256sum wheels/*.whl > SHA256
uv venv --python /usr/bin/python3 venv
uv pip install --python venv/bin/python --no-index --find-links wheels 'biopython==1.88'
```

The original machine used CPython 3.10.12 and numpy 2.2.6, with the cp310 wheels `b321ee0f…07c2` (biopython) and `fc7b73d0…8915` (numpy). Wheel hashes depend on the Python version, so record your own.

- **EMBOSS 6.6.0:**
  - the original machine had Ubuntu 22.04's `emboss 6.6.0+dfsg-11ubuntu1`, which `embossversion -auto` reports as `6.6.0.0`;
  - **on a new machine, installing it is a system install, which is an owner gate** (`sudo apt install emboss`);
  - Debian renames `cons` to `em_cons`, and `transeq` has no tables 24–33.
- **Downloaded later by each module's worker** (commands in `index.md`):
  - edlib v1.2.7;
  - GenomeTools v1.6.6 (`make cairo=no`);
  - bedtools v2.31.1 (`bedtools.static`);
  - htslib/samtools 1.25 (`--disable-bz2 --disable-lzma --disable-libcurl`);
  - parasail v2.6.2, only if EMBOSS leaves a score row open.
- **`git-filter-repo` 2.47.0** (only for Option B): `uv venv backup/tools/venv && uv pip install --python backup/tools/venv/bin/python 'git-filter-repo==2.47.0'`.

## A1 inputs (re-create `runs/translation-terminal-stop/`)

Run from that folder:

```bash
../../oracles/table2asn/table2asn -i X.fsa -f X.tbl -V vb -a s -o X.sqn 2> X.log
```

Exit 0 is normal. So is exit 2 for `joins`, which logs an "internal partials" `Problem:` warning. Each case's verdict is in the ledger (appendix), and the repo pins them in `src/domain/bio/__tests__/fixtures/ncbi-validator-terminal-stop.json`. On the original machine, a re-run on 2026-11-03 gave byte-identical `.val`, `.gbf` and `.stats` files.

`Parduczia.fsa`
```text
>plus_complete [organism=Parduczia sp.] [gcode=27]
ATGCCCTGA
>plus_5partial [organism=Parduczia sp.] [gcode=27]
ATGCCCTGA
>plus_3partial [organism=Parduczia sp.] [gcode=27]
ATGCCCTGA
>minus_complete [organism=Parduczia sp.] [gcode=27]
TCAGGGCAT
>minus_5partial [organism=Parduczia sp.] [gcode=27]
TCAGGGCAT
>minus_3partial [organism=Parduczia sp.] [gcode=27]
TCAGGGCAT
>plus_internal [organism=Parduczia sp.] [gcode=27]
ATGTGACCCTGA
```

`Parduczia.tbl` (tab-separated; qualifier lines start with three tabs)
```text
>Feature plus_complete
1	9	CDS
			product	p
>Feature plus_5partial
<1	9	CDS
			product	p
>Feature plus_3partial
1	>9	CDS
			product	p
>Feature minus_complete
9	1	CDS
			product	p
>Feature minus_5partial
<9	1	CDS
			product	p
>Feature minus_3partial
9	>1	CDS
			product	p
>Feature plus_internal
1	12	CDS
			product	p
```

`joins.fsa`
```text
>join_5partial_mixed [organism=Parduczia sp.] [gcode=27]
ATGCCCAAATCA
>join_interior_gt [organism=Parduczia sp.] [gcode=27]
ATGCCCAAATGA
>join_3partial [organism=Parduczia sp.] [gcode=27]
ATGCCCAAATGA
>join_3partial_mixed [organism=Parduczia sp.] [gcode=27]
ATGCCCAAATCA
>minus_join_5partial [organism=Parduczia sp.] [gcode=27]
TCAAAAGGGCAT
>minus_join_3partial [organism=Parduczia sp.] [gcode=27]
TCAAAAGGGCAT
```

`joins.tbl`
```text
>Feature join_5partial_mixed
<1	6	CDS
12	10
			product	p
>Feature join_interior_gt
1	>6	CDS
10	12
			product	p
>Feature join_3partial
1	6	CDS
10	>12
			product	p
>Feature join_3partial_mixed
1	6	CDS
12	>10
			product	p
>Feature minus_join_5partial
<12	7	CDS
3	1
			product	p
>Feature minus_join_3partial
12	7	CDS
3	>1
			product	p
```

## Findings and gotchas

- **The vendored SSW (`wasm/local-align/vendor/ssw/`) is not independent** for local-search scores. EMBOSS `water`/`matcher` is, and the existing fixtures already use it.
- **gc.prt is the generator's input** (`npm run standards:genetic-codes`), so it can't independently check `geneticCodes.ts`. Use the table2asn validator or Biopython's `CodonTable`.
- **table2asn:**
  - The genetic code comes from `[gcode=N]` in the defline.
  - In the `.tbl`, `<` goes on the 5′ column and `>` on the 3′ column, whatever the strand.
  - **Only the validator's translation is authoritative.** In `SEQ_FEAT.MisMatchAA` that is the bracket after `translation`; the bracket after `protein` is the protein table2asn built.
- **Nested double complements:** Biopython rejects them, an oracle limitation. EMBOSS `extractfeat` reads them differently. The hand-applied INSDC oracle `docs/standards/conformance/oracle.py` follows the standard's text.
- **Test budget:** at most 4 vitest workers across all concurrent runs. Vitest 4.1.11 has only `--maxWorkers`, and `vitest.config` sets no cap, so the default is CPUs − 1. With four workers running at once, each one runs `npx vitest run --maxWorkers=1`.
- **18 local test failures:** tests in `uiEffects.hub`, `uiEffects.search`, `AlignRemoteModal` and `useRemoteAlignment` fail under Node 26's web storage. CI on Node 22 is authoritative for them.
- **Stale worktree base:** an app task-chip worktree may start from the primary checkout's stale branch. Before anything else, each worker runs `git fetch origin && git switch -C <branch> origin/docs/standards-oracle-audit`.
- **Original machine's primary checkout:**
  - it sits on `refactor/remove-themes`, which PR #211 already merged, and its tracked changes are at risk;
  - two local branches have no commits of their own and can be removed: `claude/confident-rubin-c41cbd` and `claude/nice-cannon-fd75fe`;
  - nothing has been removed: each removal needs the owner's approval.
- **#284 isn't monitored.** The app's PR monitor refused to bind #284 to the original session (`bind_pr`: repository not in the session), so nothing watches its CI automatically.

## Not verified

- Whether table2asn tries a network taxonomy lookup. It printed "Falling back on built-in data for popular organisms". Use synthetic inputs only.
- Whether Ubuntu's EMBOSS patches change any computed output.
- Whether table2asn reads GFF3 through `-f x.gff3`.
- Whether `[topology=circular]` makes table2asn build a circular record.

## Appendix: the audit library

This appendix holds the text of `$LIB` as it stood on 2026-11-05. The script in [Resume steps](#resume-steps) writes each file back to its path. The library's `runs/` outputs, oracle binaries, survey copies and mirror backup aren't copied here. The A1 inputs and the rebuild commands above replace them.

- **Read the original orchestrator handoff (`handoff.md`, written 2026-11-03) with the [state table](#state-on-2026-11-05) in hand:**
  - Phase 0 is done;
  - `start_session` wasn't available, so workers go out as task chips;
  - the move-out (Option A) and the CLAUDE.md wording are in #284.
- **Superseded by the owner on 2026-11-05:** wherever `handoff.md` says "one PR per module, into `develop`" or talks about merging PRs into `develop`, the work lands on `docs/standards-oracle-audit` instead ([How work lands](#how-work-lands-284-is-the-audit)).
- **The briefs use the original machine's paths.** The resume script replaces them.

### `handoff.md`

<details><summary>the original orchestrator instructions (2026-11-03)</summary>

<!-- lib: handoff.md -->
`````markdown
# Handoff: canonical-correctness audit (orchestrator)

You are the **orchestrator** of a long-running audit of Dunceious (`/home/mainframe/dunceious`). The goal is to find code whose scientific result is **objectively wrong**: a published standard settles the case, and an **oracle** (a canonical reference implementation, run or read) disagrees with Dunceious. Fix those defects without regressing anything.

You plan, dispatch and verify. Workers do the module-level digging. You own the ledger, the oracle index and every decision about what reaches GitHub.

Written 2026-11-03 from the v4.0.0 release review session. The owner is the repo owner (`JoaoVictorDaijo`).

## Why this exists

The v4.0.0 review found A1. A CDS that is partial at its 5′ end did not get its last codon read as a stop under genetic codes 27, 28 and 31. The project's own rule (`docs/standards/translation.md`) stated the wrong behaviour, so tests passed. Recall did not settle it. Two NCBI references did:

- the NCBI C++ Toolkit source (`x_Translate` in `src/objmgr/util/sequence.cpp`, which gates the stop on `is_3prime_complete` only);
- the NCBI validator, run locally (`table2asn` 1.29.324 `-V v`, read from `SEQ_FEAT.MisMatchAA`).

It was fixed in PR #278 with the validator's output pinned as a fixture. Assume the code has more of these, and hunt them the same way.

## Read first

- `CLAUDE.md` § Scientific rigor and § Sequence standards. Pass both to every worker.
- `docs/standards/README.md`: the order of authority (standard text → recorded rule → reference tools → ask the owner) and the evidence levels (Tested / Documented / Contract / Unknown). The audit **uses** this order; it does not replace it.
- `docs/standards/operations.md`, `metrics.md`, `formats.md`, `locations.md`, `translation.md`, `tools.md`. These already map most operations to a standard, a rule ID and the tools' behaviour. They are the starting module map. Don't rebuild it.
- `ARCHITECTURE.md` and the `dunceious-architecture` skill: the layers (domain ← core ← workers/handlers ← app).
- `~/.claude/references/delegation.md` (models, efforts, ask-first moves) and `~/.claude/references/codex-delegation.md` plus the `codex-duplex:delegating-to-codex` skill (Sol/Astra jobs).
- `~/.claude/references/resource-limits.md`. The machine has 16 CPUs and 16 GB. Keep at most 4 test workers in total across all concurrent runs.

## Scope

**In:** anything that computes, shows, imports or exports a biological result. That includes translation, genetic codes, start and stop codons, reverse complement, IUPAC, RNA/U, INSDC locations (join, order, complement, partial ends, circular origin), feature sequence and envelope, frameshift junctions, FASTA, GenBank and GFF3 parsing and export, gap handling, alignment overlay and remapping, search (fuzzy/edlib, IUPAC, local/SSW: scores, CIGAR, coordinates), consensus, and every displayed metric (identity, coverage, scores, lengths).

**Out:** style, naming, UX wording, performance, refactors, and anything that is a matter of opinion. A behaviour the standards leave open is an **owner decision**, not a finding: record its options and ask.

A **finding** needs all of the following:
1. A pinned oracle disagrees with Dunceious on a concrete input.
2. The standard's text, or the oracle's documented contract, says the oracle is right.
3. A second model family has tried to refute it and failed.

## Phase 0: the local library (do this first)

The owner wants audit material **out of GitHub history**. Build it as a local library under `/home/mainframe/dunceious/.code/keep/canonical-correctness/`. That folder is untracked, already ignored, and kept outside any worktree.

```
canonical-correctness/
  handoff.md         # this file
  index.md           # oracle index: module → behaviour → standard §, rule ID → oracle (tool, version, sha256, how to run) → status
  ledger.md          # one row per behaviour checked: input class, oracle verdict, Dunceious verdict, finding ID, cross-check, PR
  oracles/<tool>/    # binaries and pinned source checkouts, each with VERSION, SHA256, SOURCE_URL, run.md
  runs/<module>/     # inputs, raw oracle output, comparison scripts (kept until the owner says to delete)
```

- **Seed the index** with the oracles already in hand:
  - NCBI `table2asn` 1.29.324 (linux64, sha256 `88ec2acb…21d5b`), already in `oracles/table2asn/` with VERSION, SHA256 and SOURCE_URL; the A1 inputs and outputs are in `runs/translation-terminal-stop/`. Add its `run.md`. Gotchas: the genetic code comes from `[gcode=N]` in the FASTA defline, not a `.tbl` `transl_table` qualifier; in the `.tbl`, `<` goes on the 5′ column and `>` on the 3′ column whatever the strand; the protein it builds can disagree with its own validator, and only the **validator's** translation is the authority.
  - NCBI C++ Toolkit source, `ncbi/ncbi-cxx-toolkit-public` at `912b751`.
  - NCBI `gc.prt` 4.6 (already pinned by `npm run standards:fetch`).
  - Biopython 1.88 (fixture `src/domain/bio/__tests__/fixtures/ncbi-genetic-codes.biopython.json`). Biopython is not installed on this machine.
- **Oracles run on this machine only.** Download each one into its own new, empty directory. Record its version and sha256, and run it only on inputs you wrote. Never install a second Node or a system package to get around an environment problem: ask the owner. Prefer the standard body's own tool:
  - **NCBI** (`table2asn`/`asn2gb` validator, C++ Toolkit, BLAST) for INSDC, GenBank and genetic codes;
  - **EMBOSS 6.6.0** for `transeq`, `revseq`, `needle`/`water` and `cons`;
  - **edlib** for edit distance and CIGAR;
  - **SSW / parasail** for Smith-Waterman scores;
  - **htslib/samtools** for SAM and CIGAR conventions;
  - **GenomeTools `gt gff3validator`** for GFF3;
  - Biopython as a secondary oracle.
  When two oracles disagree, the standard's text decides. When it doesn't, stop and ask.
- **What stays in the repo:** any fixture a test reads (for example the `ncbi-*.json` fixtures). CI must reproduce every test without the local library. A fixture records the tool, version and sha256 of what produced it, never a local path.
- **Move-out proposal (owner approval required before any step).** List the tracked material that is audit or reference rather than product: candidates are `docs/standards/survey/`, `tools.json`, `tool-counts.json` and parts of `docs/standards/` no code or test reads. Give each item a reason and say who reads it. Removing it from **history** means rewriting `main` and `develop` (`git filter-repo` plus a force-push). That breaks every clone, open PR, tag (`v*` sits on rewritten commits) and the Cloudflare Pages link. Prepare the plan, the exact commands, a mirror backup (`git clone --mirror` into `.code/keep/canonical-correctness/backup/`) and a rollback. Then **stop and wait for the owner's go-ahead**, and keep the backup until the owner confirms the result is stable.
- **CLAUDE.md proposal (owner decision).** Draft one sentence for § Scientific rigor: *when a rule or a test can't settle a case, settle it with the oracle: read the reference implementation's source at that branch, or run the reference tool, and cite file, commit or version*. The existing "Verify, don't recall" bullet already points this way, so propose sharpening it rather than adding a new rule. Show the diff and don't commit it unasked.

Phase 0 is done when `index.md` lists every module from the map with a chosen oracle or `none found (ask)`, the seeded oracles run from `oracles/`, and both proposals have been shown to the owner.

## Phase 1: recent PRs, then the whole code

1. **The v4.0.0 promotion first.** Audit the scientific PRs merged into `develop` since v3.7.3: #236 #237 #238 #240 #262 #264 #265 #266 #269 #270, plus #278. The review already covered them once (Astra + Claude); the audit adds oracle **runs**. Finish this batch before 2.
2. **Then all of the code, module by module**, ordered by risk: translation and locations, then formats (GenBank, GFF3, FASTA export round-trips), search scores and coordinates, alignment overlay and remap, then consensus and metrics.

Each phase is done when every behaviour row in `ledger.md` for its scope has an oracle verdict or an `ask` entry.

## Worker procedure (one module per worker)

Dispatch each module to a **side session the owner can watch in the sidebar** (owner request, 2026-11-03), never to the Agent tool's background `fork`, which the sidebar doesn't show. Use `start_session` if the app offers it. Otherwise post one task chip (`spawn_task`) per module, which the owner clicks to start. A chip's session runs in its own app-managed worktree on a `claude/<name>` branch, so its brief tells it to rename the branch to the repo's naming (never `agent-*` or `claude/*`) before its first push. A session not in an app worktree uses `wt` at `.code/worktrees/audit/<module>`. The brief must stand alone: the module's rows from `index.md`, the standards rule IDs, the oracle and how to run it, and this procedure. Tell it to follow `CLAUDE.md` and `testing-standards`. Read a worker's transcript with `list_events` and steer it with `SendMessage`. Ask the owner before filing worker sessions under a sidebar group.

1. **Behaviours:** list every user-visible result the module produces, with its rule ID. Done when each exported function or displayed number in the module maps to a row.
2. **Inputs:** build cases for each row, covering IUPAC codes, RNA/U, upper and lower case, gaps, reverse strand, `<`/`>` on each end, join, order and nested complement, circular origin crossing, empty input and boundaries (length 0, 1, 2, an incomplete last codon).
3. **Oracle run:** run the oracle and keep its raw output in `runs/<module>/`. Compare it with Dunceious through the same public function the app uses. Done when every case has both outputs side by side.
4. **Classify** each disagreement:
   - **candidate defect**: the standard backs the oracle;
   - **oracle limitation**: the tool's documented scope excludes the case;
   - **owner decision**: the standard is silent and the tools differ.
   Check which of the tool's code paths is the authority, as with `table2asn`'s validator against its own protein.
5. **Cross-check:** the worker sends every candidate defect to an independent reviewer of the other model family, with the inputs and the oracle output but not the worker's conclusion. Use **Sol `medium`** by default, **Sol `high`** for interacting contracts (locations × strand × circularity), and **Astra `medium`** only for the hardest cases. The owner pre-approved Astra for this effort; state each use in one line. The reviewer tries to refute the finding and to find a case the fix would break. Only a CONFIRMED verdict proceeds.
6. **Fix:** batch the confirmed defects into **one PR per module**, into `develop`.
   - Each fix carries an oracle-pinned fixture test that fails on the old code. Show that it does.
   - The PR updates the governing rule in `docs/standards/` and adds one changelog fragment.
   - Commit and PR conventions follow `CLAUDE.md`: Conventional Commits, `[CF-Pages-Skip]` on commits and on PR titles into develop.
   - Run typecheck, lint (the warning ceiling only goes down), headers, and vitest with `--maxWorkers=4`.
   - Locally, 18 tests in `uiEffects.hub`, `uiEffects.search`, `AlignRemoteModal` and `useRemoteAlignment` fail under Node 26's web storage. CI on Node 22 is authoritative for them.
7. **Regression guard:** a second Sol `medium` pass reviews the fix diff alone, asking what the change breaks. Watch PR CI (all three e2e engines).

A worker is done when its ledger rows are all classified, every confirmed defect sits in an open PR with a green CI, and it reports to you. Relay worker questions and results to the owner as `codex-duplex` blockquotes.

## GitHub footprint (keep it small)

- Keep the ledgers, raw runs, oracle binaries and per-finding notes local. PR descriptions carry only what a future maintainer needs: the defect, the oracle and its version, and the test.
- File a GitHub issue only for a confirmed defect that won't be fixed in the same pass, or for an owner decision that must outlive the session. Use the repo's issue form and label rules (CLAUDE.md § Issues). Prefer fixing over filing.
- Re-rate an existing issue (as with #241 → `severity:medium`) with one comment, not a thread.

## Owner gates (stop and ask)

- The history rewrite and its force-push, and removing anything tracked.
- The CLAUDE.md wording.
- Every owner-decision row.
- Any oracle that needs a login, a licence or a system install.
- Merging any PR: you may merge PRs into develop only if the owner says so for that batch. Use merge commits. Promotions to `main` stay with the release process.

## Known state at handoff

- v4.0.0 is released and live: #275 (bump), #276 (promotion, main `75b2f1d`, tag `v4.0.0`) and the back-merges #279 and #280 are merged, so `develop` contains `main`.
- #277 (CSS degradation targets) and #278 (A1 fix plus the SSW CI check, `1147e9f`) shipped in v4.0.0.
- Open related issues: #241 (edited nested complement, severity:medium), #225 (`order()` lost on edit), #226 (per-end `<`/`>` lost by the parser).
- `docs/standards/translation.md` TRANS-3: alternative start codons show their sense residue, not Met (documented as "Partial"). This is a candidate for the translation module.
`````

</details>

### `index.md`

<details><summary>module → behaviour → rule → oracle → status, the oracle table and the Phase 1 dispatch</summary>

<!-- lib: index.md -->
`````markdown
# Oracle index

Module → behaviour → governing standard and rule ID → oracle → status. Rule IDs, sections and
Dunceious paths come from `docs/standards/` on `develop` at `e03f065` (v4.0.0 + back-merges). The
rule files stay the authority for what each rule says; this index only picks the oracle that
checks it. Workers expand each row into input classes in `ledger.md`.

Order of authority (from `docs/standards/README.md`): standard text → recorded rule → reference
tools → ask the owner. When two oracles disagree, the standard's text decides; when it doesn't,
the row becomes an owner decision.

## Oracles

Status: **ready** (runs from `oracles/`), **acquire** (chosen; the module's worker downloads it
into a new, empty `oracles/<tool>/` and records VERSION, SHA256, SOURCE_URL, run.md), **ask**
(needs the owner: licence, login or system install), **none found (ask)**.

| Oracle | Version | sha256 / pin | Where | How to run | Status |
|---|---|---|---|---|---|
| NCBI table2asn (validator, flat-file writer, FASTA modifier and `.tbl`/GFF3 readers) | 1.29.324 linux64 | `88ec2acb…21d5b` | `oracles/table2asn/` | `oracles/table2asn/run.md` | ready; A1 re-run byte-identical |
| NCBI C++ Toolkit source | `912b751f` (2026-11-02) | git commit; `sequence.cpp` `3d4f6fce…` | `oracles/ncbi-cxx-toolkit/src/` (sparse) | `oracles/ncbi-cxx-toolkit/run.md` | ready |
| NCBI gc.prt | 4.6 | `2aecbdd0…51a04` (= `sources.json`) | `oracles/ncbi-gc-prt/` | data; `run.md` | ready; Dunceious's generator input, so not independent of `geneticCodes.ts` |
| Biopython (secondary) | 1.88, numpy 2.2.6, CPython 3.10.12 | wheels `b321ee0f…`, `fc7b73d0…` | `oracles/biopython/venv/` | `oracles/biopython/run.md` | ready |
| EMBOSS | 6.6.0.0 (Ubuntu `6.6.0+dfsg-11ubuntu1`, preinstalled) | per binary in `oracles/emboss/SHA256` | `/usr/bin` | `oracles/emboss/run.md` | ready; `transeq` lacks tables 24–33; `cons` is `em_cons` |
| edlib (C++ library + `edlib-aligner`) | v1.2.7 (2021-08-20); rules cite the 1.1.2 manual | — | `oracles/edlib/` | build `edlib.cpp` + `apps/aligner` with g++ | acquire |
| GenomeTools `gt gff3validator` | v1.6.6 (2025-10-06) | — | `oracles/genometools/` | `make cairo=no` from the release tarball | acquire |
| bedtools | v2.31.1 (2023-11-07) | — | `oracles/bedtools/` | release asset `bedtools.static` | acquire |
| htslib + samtools | 1.25 (2026-10-27) | — | `oracles/samtools/` | `./configure --disable-bz2 --disable-lzma --disable-libcurl` (zlib headers present) | acquire |
| parasail (secondary SW score) | v2.6.2 | — | `oracles/parasail/` | Python wheel in its own venv | acquire, only if EMBOSS leaves a score row open |
| SSW | v1.2.5 | — | — | — | **not independent**: Dunceious vendors it (`wasm/local-align/vendor/ssw/`); use only to locate a divergence |
| UCSC `bedToBigBed`/`validateFiles` | — | — | — | — | **ask**: UCSC's licence is free for non-commercial use only |
| Jalview conservation | 2.11.5.2 | — | — | — | **ask**: Java desktop app; every METRIC-5 row is an open owner decision anyway |
| EBI Job Dispatcher services | dated 2026-10-23 | — | remote | — | out of the oracle-run scope: remote services; record the contract only |

## Modules

Phase 1 order: the v4.0.0 PR batch first (PRs named per module), then module by module in the
order below. Status per row: **not started**, **in ledger** (rows exist), **verified** (oracle
agrees), **defect → PR**, **ask**.

### M1. Translation and genetic codes

Code: `src/domain/bio/geneticCodes.ts`, `src/domain/bio/sequence.ts` (translation, codons),
`src/domain/bio/locationFlags.ts`, `src/app/viewer/cds.ts`, `src/app/viewer/tracks/SequenceTrack.tsx`,
`src/app/greeter/genomeZoom.ts`, `src/app/logic/easterEgg.ts`. v4.0.0 PRs: #237, #278.

| Behaviour | Standard § | Rule | Oracle | Status |
|---|---|---|---|---|
| Codon table content, all 27 NCBI ids, invalid/empty `/transl_table` | gc.prt 4.6; INSDC FT 11.4 `/transl_table` | TRANS-1 | table2asn validator (`[gcode=N]`); Biopython `CodonTable` | not started |
| Context-dependent terminal stop (tables 27, 28, 31) by 3′ completeness | gc.prt 4.6 `sncbieaa` | TRANS-1 | table2asn validator; Toolkit `sequence.cpp:3724` | verified for A1's 13 cases; defect fixed in #278 |
| `/codon_start` 1–3, with `<` and minus strand | INSDC FT 11.4 `/codon_start` | TRANS-2 | table2asn validator; Biopython `cds=True` | not started |
| Alternative initiator of a complete CDS read as Met | NCBI Genetic Codes, Starts row | TRANS-3 | table2asn validator; Toolkit `sequence.cpp:3670` (`check_start`) and `:3733` (`alt_start`) | not started; handoff candidate (Dunceious shows V) |
| `/transl_except` applied or not | INSDC FT 11.4 `/transl_except` | TRANS-4 | table2asn validator (applies it) | not started |
| Ordinary translation and Sec/Pyl recoding labels | gc.prt 4.6; INSDC `/transl_except` | OP-21 | table2asn validator; EMBOSS `transeq` (tables ≤23, no CDS mode) | not started |
| Codons across split exons and display frames | INSDC join + codon_start | OP-8 | table2asn validator (protein from joins); Biopython `extract` + `translate` | not started |
| Transcription, coding vs template strand | — (documented practice) | OP-17 | Biopython `transcribe`; EMBOSS `revseq` for the complement | not started |
| Partial CDS: incomplete last codon, `X` for ambiguous codons | gc.prt 4.6; NCBI validator | TRANS-1 | table2asn validator; Toolkit `x_Translate` | not started |

### M2. Locations and feature sequence

Code: `src/core/genbank/locationParser.ts`, `src/domain/bio/sequence.ts` (`extractFeatureSequence`),
`intervals.ts`, `strand.ts`, `featureEnvelope.ts`, `frameshift.ts`, `locationFlags.ts`,
`coordinate.ts`, `src/app/components/RecordDetailsModal.tsx`, `src/app/logic/viewModel.ts`.
v4.0.0 PRs: #238, #240. Open issues: #241, #225, #226, #230, #231.

| Behaviour | Standard § | Rule | Oracle | Status |
|---|---|---|---|---|
| `join()` concatenation in written order | INSDC FT 11.4 §3.4.2.2 | LOC-1 | table2asn (`.tbl` multi-interval → `.gbf` + protein); Biopython `extract`; EMBOSS `extractfeat -join Y` | not started |
| `order()` kept distinct from `join()` | §3.4.2.2 | LOC-2 | Biopython; EMBOSS `seqret` | known deviation #225 |
| `complement()`, per interval and nested | §3.4.2.2, §3.4.3 | LOC-3 | hand INSDC oracle (`docs/standards/conformance/oracle.py`) + table2asn; Biopython rejects nesting (limitation) | not started; #241 open |
| `<` `>` per end, both strands | §3.4.2.1, §3.4.3 | LOC-4 | table2asn `.tbl` → `.gbf` location string | known deviation #226 |
| `n^n+1` between-base sites | §3.4.2.1 | LOC-5 | Biopython; table2asn `.gbf` | known deviation #230 |
| Origin-crossing features | INSDC FT 11.4; GFF3 1.26 | LOC-6 | table2asn (circular `[topology=circular]`); Biopython `extract` | not started |
| Sequence of a multi-interval feature | §3.4.2.2 | LOC-7 | table2asn; Biopython; EMBOSS `extractfeat` | not started |
| Feature length (sum of parts) | Biopython `len(location)` | METRIC-2 | Biopython; table2asn `.stats`/protein length | not started |
| Positions shown to users (1-based, inclusive) | §3.4.2.1 | COORD-1 | standard text | known deviation #231 |
| Linear interval clipping | bedtools 2.31 intersect | OP-5 | bedtools (acquire) | not started |
| Four strand states | GFF3 1.26 col 7 | OP-6 | gt gff3validator (acquire); standard text | not started |
| Ribosomal slippage and frameshift junctions | INSDC `/ribosomal_slippage` | OP-7 | table2asn validator on a slippage CDS | not started; #255 open |

### M3. Alphabets, IUPAC, reverse complement

Code: `src/domain/bio/sequence.ts` (reverse complement), `src/core/search/query.ts`,
`src/core/alignment/preflight.ts`.

| Behaviour | Standard § | Rule | Oracle | Status |
|---|---|---|---|---|
| Ambiguity-code complements, T/U, case | NC-IUB 1984; INSDC FT 11.4 §7.4.1 | ALPHA-1 | EMBOSS `revseq`; standard table | not started |
| IUPAC degenerate query matching | NC-IUB 1984 | ALPHA-1 | standard table (set inclusion); EMBOSS `fuzznuc` | not started |
| Amino-acid codes U O B Z J X | INSDC FT 11.4 §7.4.3 | ALPHA-2 | standard text; EMBOSS `water` with EBLOSUM62 | not started |

### M4. GenBank import and export

Code: `src/core/genbank/*` (`recordSplitter`, `headerParser`, `featureParser`, `qualifierParser`,
`qualifierRules`, `toSeqRecord`, `serialize`), `src/workers/handlers/bio.ts`.

| Behaviour | Standard § | Rule | Oracle | Status |
|---|---|---|---|---|
| Entries, LOCUS/header fields, sequence layout | GenBank 274.0 §3 | FMT-2 | table2asn `.gbf` (NCBI's writer); Biopython `SeqIO` round-trip | known deviations #243, #244 |
| Feature table and qualifier fidelity, repeated qualifiers | INSDC FT 11.4; GenBank §3.4.12 | FMT-3 | table2asn `.gbf`; Toolkit `objtools/format`; Biopython | known deviation #242 |
| Declared molecule type | GenBank §3.4.4.1–2 | OP-2 | table2asn `.gbf` LOCUS | known deviation #243 |
| Source qualifiers and multi-source spans | INSDC source | OP-9 | table2asn validator | known deviation #242 |
| Date, geography and missing-value validation | INSDC `/collection_date`, `/geo_loc_name` | OP-18 | table2asn validator (`SEQ_DESCR.BadCollectionDate` and related codes) | known deviation #247 |
| Accession label | GenBank §3.4.6 | METRIC-3a | standard text | known deviation #259 |

### M5. GFF3 import and export

Code: `src/core/formats/gff3.ts`, `src/core/formats/soTypes.ts`.
v4.0.0 PR: #265.

| Behaviour | Standard § | Rule | Oracle | Status |
|---|---|---|---|---|
| INSDC key → SO term | GFF3 1.26; SO 2026-08-07 | FMT-1 | gt gff3validator (acquire) with SO; NCBI GFF3 documentation | not started |
| Attachment to the named landmark | GFF3 1.26 col 1 | FMT-9 | gt gff3validator; table2asn GFF3 input (to verify) | not started; owner decision open |
| CDS phase, strand-relative | GFF3 1.26 col 8 | FMT-11 | gt gff3validator (`-typecheck`); table2asn GFF3 → protein | not started |
| Source column kept on export | GFF3 1.26 col 2 | FMT-17 | gt gff3validator; round trip | not started (#265) |
| Coordinates, multi-part features, origin wrap on export | GFF3 1.26 | LOC-6, FMT-11 | gt gff3validator; table2asn GFF3 input | not started |

### M6. FASTA and definition lines

Code: `src/core/formats/fasta.ts`, `src/core/formats/ncbiModifiers.ts`, `src/app/logic/bioResponse.ts`
(gap removal), `src/app/components/GapRemovalNotice.tsx`. v4.0.0 PRs: #269, #270.

| Behaviour | Standard § | Rule | Oracle | Status |
|---|---|---|---|---|
| Ordinary FASTA syntax, IDs, wrapping | Biopython 1.88; NCBI FASTA guidance | FMT-4 | Biopython `SeqIO`; EMBOSS `seqret` | known deviation #244 |
| `-` removed from sequences and reported | NCBI FASTA guidance | FMT-4 | table2asn (how it treats `-`); Biopython | not started (#269, #270) |
| `[key=value]` definition-line modifiers | NCBI modifiers, 2026-10-23 | FMT-5 | table2asn (NCBI's own modifier parser; `.gbf` source qualifiers) | not started |
| Identifier boundaries and namespaces | NCBI FASTA guidance | OP-16 | table2asn; Biopython | not started |
| Aligned FASTA columns | Biopython 1.88; EMBOSS aligned FASTA | FMT-6 | Biopython `AlignIO`; EMBOSS `seqret -osformat fasta` | not started; owner decision open |

### M7. BED and bedGraph

Code: `src/core/formats/annotations.ts`, `src/app/viewer/tracks/QuantitativeTrack.tsx`.

| Behaviour | Standard § | Rule | Oracle | Status |
|---|---|---|---|---|
| BED fields, 0-based half-open coordinates, score | GA4GH BED v1 | FMT-7, METRIC-7b | bedtools (acquire); standard text | known deviation #250 |
| bedGraph intervals and values | UCSC bedGraph | FMT-8, METRIC-7a | bedtools `genomecov`/`merge`; UCSC tools need **ask** | known deviation #250, #260 |

### M8. Exact and fuzzy search, CIGAR

Code: `src/core/search/{exact,fuzzy,editPath,query,hitColumns,hitPaths}.ts`, `src/domain/bio/cigar.ts`,
`src/domain/bio/searchHit.ts`, `src/core/formats/searchHitNote.ts`. v4.0.0 PR: #264.

| Behaviour | Standard § | Rule | Oracle | Status |
|---|---|---|---|---|
| Whole-query approximate occurrences (HW edit distance) | Edlib HW mode | OP-12 | edlib (acquire) | not started; enumeration owner decision open |
| Anchored traceback and CIGAR | Edlib NW/path; SAM 1.6 §1.4 | OP-20 | edlib `edlibAlignmentToCigar`; samtools (acquire) | not started |
| Supported CIGAR subset, `=`/`X` vs `M` | SAM 1.6 §1.4, §2.2 | FMT-10 | samtools `view` on a synthetic SAM | not started |
| Exact search, both strands, IUPAC | NC-IUB 1984 | ALPHA-1 | EMBOSS `fuzznuc` (`-pmismatch 0`, `-complement`) | not started |
| Search-hit note fields on export | — (private) | FMT-15 | none found (ask) | #264 shipped; no external oracle |

### M9. Local alignment search

Code: `src/core/search/local/*` (`scoring`, `engine`, `bound`, `selection`, `metrics`, `stream`),
`wasm/local-align/` (EMBOSS matcher port + vendored SSW), `src/app/logic/hitAlignmentText.ts`.

| Behaviour | Standard § | Rule | Oracle | Status |
|---|---|---|---|---|
| Scoring defaults (EDNAFULL/EBLOSUM62, 10/0.5) | EMBOSS 6.6.0 `water` | ALN-1 | EMBOSS `water` | existing fixtures (27 cases) |
| Score, coordinates, alignment strings | Smith-Waterman-Gotoh | ALN-1 | EMBOSS `water`; parasail as secondary | not started |
| Ranking best-N, ties, overlaps | EMBOSS `matcher` 6.6 | OP-13 | EMBOSS `matcher` | existing fixtures; merge owner decision open |
| Pair glyphs and identity/similarity/gap counts | EMBOSS srspair; AJAX rev 1.132 | METRIC-6a, 6b, FMT-13 | EMBOSS `water -aformat3 srspair` | not started; 6b names owner decision open |
| Reverse-strand hits and coordinates | — | ALN-1 | EMBOSS `water` on `revseq` output | not started |

### M10. Alignment overlay and remap

Code: `src/core/alignment/{ebi,preflight,index}.ts`, `src/domain/bio/sequence.ts` (overlay),
`src/app/logic/projectFile.ts`. v4.0.0 PR: #266.

| Behaviour | Standard § | Rule | Oracle | Status |
|---|---|---|---|---|
| Residue ↔ column maps and boundaries | Biopython 1.88 `indices`/`inverse_indices` | OP-4 | Biopython `Alignment` | known deviation #260 |
| Rectangular alignment, refuse residue mismatch | Biopython `MultipleSeqAlignment` | OP-15, FMT-6 | Biopython `AlignIO` | not started (#266) |
| EBI submission parameters | EBI parameter XML 2026-10-23 | FMT-12, METRIC-8a | contract only (remote) | out of oracle-run scope |

### M11. Consensus and displayed metrics

Code: `src/domain/bio/{consensus,referenceComparison,details,recordStatus}.ts`,
`src/core/search/local/metrics.ts`, `src/core/exportReport.ts`, `src/app/logic/featureComparison.ts`.

| Behaviour | Standard § | Rule | Oracle | Status |
|---|---|---|---|---|
| Sequence length vs alignment width | NCBI residue length; EMBOSS length | METRIC-1 | EMBOSS `infoseq`; Biopython `len` | known deviation #259 |
| Identity naming and denominator | EMBOSS Identity/Length; BLAST report | METRIC-4 | EMBOSS `needle`/`water` | owner decision open #257, #258 |
| Consensus, conservation, column population | EMBOSS cons 6.6; Jalview | METRIC-5a–c | EMBOSS `em_cons`; Jalview **ask** | owner decision open #254 |
| Reference comparison policy | EMBOSS showalign | METRIC-6c | EMBOSS `showalign` | owner decision open |
| Counts: annotations, hits, ledger, completeness | various | METRIC-10a–e | none found (ask) | owner decisions open #256, #257, #259 |
| Overflow, minimap density, context, precision | — | METRIC-7c, 9a, 9b, 11 | none found (ask) | owner decisions open |

### M12. Operations without a reference method

Rows that are owner decisions by the rule files' own record. Workers check only whether a
documented contract the code states is broken; otherwise they leave the row as `ask`.

| Behaviour | Rule | Oracle | Status |
|---|---|---|---|
| Molecule type from composition | OP-1 | none found (ask) | owner decision open |
| Mixed molecule types in a workspace | OP-3 | none found (ask) | owner decision open |
| Feature comparison labels | OP-10 | none found (ask) | owner decision open #256 |
| Metadata grouping, filtering, sorting | OP-11 | none found (ask) | owner decision open |
| Annotations seeded from a selection | OP-14 | Biopython `SimpleLocation` bounds | owner decision open (defaults) |
| Biological joining of search hits | OP-19 | none found (ask) | owner decision open |
| Parser routing | FMT-16 | none found (ask) | owner decision open |
| Project file and saved-search schemas | FMT-14, FMT-15 | none found (ask) | no standard found |

## Phase 1 dispatch

Worker brief: `worker-procedure.md` plus a per-module chip prompt. Workers keep their rows in
`runs/<module>/ledger.md` and report in `runs/<module>/REPORT.md`; the orchestrator merges them into
`ledger.md`.

| Batch | Module(s) | PRs | Cross-check | Chip | Status |
|---|---|---|---|---|---|
| v4.0.0 | M1 translation | #237, #278 (+ #236/#262 claims) | Sol `medium` | `task_645e4cd7` | chip posted 2026-11-03; dismissed 2026-11-05 (work moved to #284) |
| v4.0.0 | M2 locations | #238, #240 (+ claims) | Sol `high` | `task_94aa6d84` | chip posted 2026-11-03; dismissed 2026-11-05 (work moved to #284) |
| v4.0.0 | M5 GFF3, M6 FASTA, M8 note | #265, #269, #270, #264 (+ claims) | Sol `medium` | `task_67cecbbb` | chip posted 2026-11-03; dismissed 2026-11-05 (work moved to #284) |
| v4.0.0 | M10 overlay | #266 (+ claims) | Sol `medium` | `task_86038b8f` | chip posted 2026-11-03; dismissed 2026-11-05 (work moved to #284) |
`````

</details>

### `worker-procedure.md`

<details><summary>the procedure every worker follows</summary>

<!-- lib: worker-procedure.md -->
`````markdown
# Worker procedure (canonical-correctness audit)

You audit one module of Dunceious (`/home/mainframe/dunceious`, GitHub `JoaoVictorDaijo/dunceious`)
for code whose scientific result is **objectively wrong**: a published standard settles the case
and a pinned **oracle** (a canonical reference implementation, run or read) disagrees with
Dunceious. You fix those defects without regressing anything. An orchestrator session owns the
central index and ledger and every decision about what reaches GitHub; you report to it.

The library is `/home/mainframe/dunceious/.code/keep/canonical-correctness/` (`$LIB` below). It is
untracked and outside every worktree. Read `$LIB/index.md` (your module's rows and the oracle
table) and each oracle's `$LIB/oracles/<tool>/run.md` before running it.

## Setup

1. Your worktree may start from a stale branch. Before anything else, with no changes of your own:
   `git fetch origin && git switch -C <branch> origin/docs/standards-oracle-audit`, the branch of the
   working PR #284 (owner, 2026-11-05: the audit's work lands there; #284 stays open and unmerged).
   Name your module branch in the repo's style
   (`fix/<module>-<topic>`, `test/<…>`, `docs/<…>`); never `claude/*`, `agent-*` or a provider name.
2. Read, from that checkout: `CLAUDE.md` § Scientific rigor, § Sequence standards, § Issues,
   § Pushes and Cloudflare Pages builds; `docs/standards/README.md` (order of authority, evidence
   levels); your module's rule files in `docs/standards/`; `ARCHITECTURE.md` (layers: domain ← core
   ← workers/handlers ← app). Follow them.
3. Follow these skills and references, invoking the skills by name: `moveusp-standards:testing-standards`
   (record its coverage decision before writing tests), `codex-duplex:delegating-to-codex` with
   `~/.claude/references/codex-delegation.md` and `~/.claude/references/delegation.md` (cross-check
   reviewers), `~/.claude/references/resource-limits.md`, `~/.claude/references/git-and-github.md`
   before any commit, push or PR.
4. `npm ci` in your worktree.

## Steps

1. **Behaviours.** List every user-visible result your scope produces, each with its rule ID.
   Done when each exported function or displayed number in scope maps to a row.
2. **Inputs.** Write cases per row: IUPAC codes, RNA/U, upper and lower case, gaps, reverse strand,
   `<`/`>` on each end, join, order and nested complement, circular origin crossing, empty input and
   boundaries (length 0, 1, 2, an incomplete last codon). Use synthetic sequences only.
3. **Oracle run.** Put inputs, raw oracle output and comparison scripts in `$LIB/runs/<module>/`
   (scripts there, never inside `$LIB/oracles/`). Get Dunceious's answer through the **same public
   function the app uses** (a `tsx` script or a scratch vitest file outside `src/`), not a private
   helper. Done when every case has both outputs side by side.
   - An oracle marked **acquire** in the index: download it into a new, empty `$LIB/oracles/<tool>/`,
     record `VERSION`, `SHA256`, `SOURCE_URL` and a `run.md`, and build only with the commands the
     index names. Never install a system package or a second Node; if an oracle needs a login, a
     licence, `sudo` or a system install, stop and ask the orchestrator.
4. **Classify** each disagreement: **candidate defect** (the standard backs the oracle), **oracle
   limitation** (the tool's documented scope excludes the case), **owner decision** (the standard is
   silent and the tools differ). Check which of the tool's code paths is the authority (for
   table2asn, the validator's translation, never the protein it builds). Two oracles disagreeing:
   the standard's text decides; if it doesn't, it is an owner decision.
5. **Cross-check** every candidate defect with an independent reviewer of the other model family
   through codex-duplex: give it the inputs, the oracle output and the standard's text, **not your
   conclusion**, and ask it to refute the defect and to find a case the fix would break. Sol
   `medium` by default; Sol `high` for interacting contracts (locations × strand × circularity);
   Astra `medium` only for the hardest cases (pre-approved for this effort; state each use in one
   line). Only a CONFIRMED verdict proceeds.
6. **Fix** confirmed defects on your module branch, one branch per module, cut from
   `docs/standards-oracle-audit`. Push it and tell the orchestrator; the orchestrator merges it into
   `docs/standards-oracle-audit` with a merge commit after the regression guard, so the work shows in #284.
   Open no PR of your own:
   - each fix carries an oracle-pinned fixture test that fails on the old code; show it failing;
   - a fixture records the tool, version and sha256 of what produced it, never a local path; CI
     must reproduce every test without `$LIB`;
   - update the governing rule in `docs/standards/` and add one `changes/unreleased/<slug>.md`;
   - Conventional Commits, `[CF-Pages-Skip]` on every commit; no assistant
     attribution; the AGPL header on every new covered file;
   - run `npm run typecheck`, `npm run lint` (the warning ceiling only goes down), `npm run
     lint:headers`, and vitest. **Test-worker budget:** at most 4 vitest workers across all audit
     sessions together, so run the full suite with `npx vitest run --maxWorkers=1` (Vitest 4 has no
     `--minWorkers`); single test files are fine at any time;
   - locally, 18 tests in `uiEffects.hub`, `uiEffects.search`, `AlignRemoteModal` and
     `useRemoteAlignment` fail under Node 26's web storage; CI on Node 22 is authoritative for them.
7. **Regression guard.** A second Sol `medium` pass reviews the fix diff alone, asking what it
   breaks. After the orchestrator merges your branch, #284's CI (all three e2e engines) must be green.

## Ledger and report

Keep your rows in `$LIB/runs/<module>/ledger.md`, with the central ledger's columns:
`Module | Rule | Behaviour | Input class | Run | Oracle verdict | Dunceious (at <sha>) | Class |
Finding | Cross-check | Commit`. The orchestrator merges them into `$LIB/ledger.md`; do not edit that file.

You are done when every row in scope is classified, every confirmed defect is committed and pushed on
your module branch with the local checks passing, and you have written `$LIB/runs/<module>/REPORT.md`: rows checked, findings with oracle
and cross-check verdicts, owner decisions with their options, oracle limitations, what you could
not verify, and the branch and commit SHAs. Then end your turn saying so.

## Stop and ask (the orchestrator relays to the owner)

- An owner-decision row: record its options and keep going on the other rows.
- Any oracle needing a login, a licence or a system install.
- Removing anything tracked, editing CLAUDE.md, or any GitHub post (PRs, issues, comments): the
  orchestrator owns #284 and files an issue only when the owner agrees.
- Merging: never merge anything into `develop` or `main`, and never merge #284.
`````

</details>

### `briefs/M1-translation.md`

<details><summary>brief for M1, translation (PRs #237, #278)</summary>

<!-- lib: briefs/M1-translation.md -->
`````markdown
You are an audit worker for Dunceious (repo at /home/mainframe/dunceious, GitHub JoaoVictorDaijo/dunceious). Module: **M1, translation and genetic codes**.

First read and follow `/home/mainframe/dunceious/.code/keep/canonical-correctness/worker-procedure.md` (setup, steps, ledger, test budget, stop-and-ask rules). It is complete; this prompt only adds your scope. Then read your rows in `/home/mainframe/dunceious/.code/keep/canonical-correctness/index.md` § M1 and the run.md of each oracle you use. Do not touch the primary checkout at /home/mainframe/dunceious (it sits on a stale branch with the owner's changes); work only in your own worktree, cut from `origin/docs/standards-oracle-audit` (working PR #284) as the procedure says. Branch name: `fix/translation-oracle-audit`.

Scope (the v4.0.0 batch first): PRs #237 (translate with every NCBI genetic code) and #278 (5′-partial CDS terminal stop, finding A1), plus the claims PRs #236 and #262 recorded in `docs/standards/translation.md` and OP-8/OP-21 in `operations.md`.

Behaviour rows (rule IDs from docs/standards/):
- TRANS-1: codon table content for all 27 NCBI ids (1–6, 9–16, 21–33), codon by codon; invalid and empty `/transl_table`; context-dependent terminal stop (tables 27, 28, 31) decided by 3′ completeness. Re-run A1's 13 cases (inputs in `$LIB/runs/translation-terminal-stop/`, validator output already there) through the public translation function and record the commit.
- TRANS-2: `/codon_start` 1–3, with `<` and on the minus strand.
- TRANS-3: alternative initiator of a complete CDS. Handoff candidate: Dunceious's computed path translates a GTG initiator as V; NCBI reads Met. Check the validator and Toolkit `src/objmgr/util/sequence.cpp:3670` (`check_start`) and `:3733` (`alt_start`) at 912b751.
- TRANS-4: `/transl_except` (table2asn applies it; Biopython doesn't).
- OP-21 ordinary translation and Sec/Pyl labels; OP-8 codons across split exons; incomplete last codon and ambiguous codons (`X`).

Code: `src/domain/bio/geneticCodes.ts`, `src/domain/bio/sequence.ts`, `src/domain/bio/locationFlags.ts`, `src/app/viewer/cds.ts`, `src/app/viewer/tracks/SequenceTrack.tsx`, `src/app/greeter/genomeZoom.ts`.

Oracles (all ready): NCBI table2asn 1.29.324 validator (`$LIB/oracles/table2asn/run.md`: genetic code from `[gcode=N]` in the FASTA defline; only the validator's translation in `SEQ_FEAT.MisMatchAA` is authoritative), NCBI C++ Toolkit source at 912b751 (`$LIB/oracles/ncbi-cxx-toolkit/`), Biopython 1.88 as secondary (`$LIB/oracles/biopython/`), EMBOSS transeq (tables ≤23 only, no CDS mode). gc.prt 4.6 is Dunceious's generator input, so it is not an independent check of `geneticCodes.ts`.

Cross-check reviewer: Sol `medium` by default. Results go in `$LIB/runs/translation/ledger.md` and `$LIB/runs/translation/REPORT.md`; confirmed M1 defects go on your module branch for the orchestrator to merge into #284's branch.
`````

</details>

### `briefs/M2-locations.md`

<details><summary>brief for M2, locations (PRs #238, #240)</summary>

<!-- lib: briefs/M2-locations.md -->
`````markdown
You are an audit worker for Dunceious (repo at /home/mainframe/dunceious, GitHub JoaoVictorDaijo/dunceious). Module: **M2, locations and feature sequence**.

First read and follow `/home/mainframe/dunceious/.code/keep/canonical-correctness/worker-procedure.md` (setup, steps, ledger, test budget, stop-and-ask rules). It is complete; this prompt only adds your scope. Then read your rows in `/home/mainframe/dunceious/.code/keep/canonical-correctness/index.md` § M2 and the run.md of each oracle you use. Do not touch the primary checkout at /home/mainframe/dunceious (it sits on a stale branch with the owner's changes); work only in your own worktree, cut from `origin/docs/standards-oracle-audit` (working PR #284) as the procedure says. Branch name: `fix/locations-oracle-audit`.

Scope (the v4.0.0 batch first): PRs #238 (feature sequence and both named lengths in the details window) and #240 (nested complements evaluated in INSDC order), plus the claims PRs #236 and #262 recorded in `docs/standards/locations.md` and METRIC-2 in `metrics.md`.

Behaviour rows: LOC-1 join order; LOC-3 complement per interval and nested (outer complement over mixed and uniform inner strands, nested origin wrap); LOC-4 `<`/`>` on each end and both strands; LOC-6 origin-crossing features, including parts that do not touch base 1; LOC-7 sequence of a multi-interval feature; METRIC-2 feature length; the location flags and record status #238 added. Known deviations already tracked (do not re-file, but do record whether the oracle confirms them): #241 (edited nested complement), #225 (`order()` read as `join`), #226 (per-end markers lost), #230 (`n^n+1`), #231 (displayed coordinates).

Code: `src/core/genbank/locationParser.ts`, `src/domain/bio/sequence.ts` (`extractFeatureSequence`), `intervals.ts`, `strand.ts`, `featureEnvelope.ts`, `frameshift.ts`, `locationFlags.ts`, `recordStatus.ts`, `coordinate.ts`, `src/app/components/RecordDetailsModal.tsx`, `src/app/logic/viewModel.ts`.

Oracles (ready): NCBI table2asn 1.29.324 (`$LIB/oracles/table2asn/run.md`; a five-column `.tbl` gives NCBI's own location string in `.gbf` and, for a CDS, its protein; in the `.tbl`, `<` goes on the first column and `>` on the second whatever the strand; check whether `[topology=circular]` in the defline makes a circular record before relying on it); the hand-applied INSDC oracle in the repo, `docs/standards/conformance/oracle.py` (independent of the code); Biopython 1.88 as secondary (it rejects nested double complements, an oracle limitation); EMBOSS `extractfeat -join Y` (differs on nested complements; the standard's text decides). Toolkit source at 912b751 for how NCBI orders nested parts (`$LIB/oracles/ncbi-cxx-toolkit/`).

Cross-check reviewer: Sol `high` (locations × strand × circularity interact). Results go in `$LIB/runs/locations/ledger.md` and `$LIB/runs/locations/REPORT.md`; confirmed M2 defects go on your module branch for the orchestrator to merge into #284's branch.
`````

</details>

### `briefs/M5-M6-formats.md`

<details><summary>brief for M5 GFF3, M6 FASTA and the M8 note (PRs #265, #269, #270, #264)</summary>

<!-- lib: briefs/M5-M6-formats.md -->
`````markdown
You are an audit worker for Dunceious (repo at /home/mainframe/dunceious, GitHub JoaoVictorDaijo/dunceious). Modules: **M5 GFF3 and M6 FASTA**, scoped to what the v4.0.0 batch changed. One branch per module.

First read and follow `/home/mainframe/dunceious/.code/keep/canonical-correctness/worker-procedure.md` (setup, steps, ledger, test budget, stop-and-ask rules). It is complete; this prompt only adds your scope. Then read your rows in `/home/mainframe/dunceious/.code/keep/canonical-correctness/index.md` §§ M5, M6 and M8 (last row) and the run.md of each oracle you use. Do not touch the primary checkout at /home/mainframe/dunceious (it sits on a stale branch with the owner's changes); work only in your own worktree, cut from `origin/docs/standards-oracle-audit` (working PR #284) as the procedure says. Branches: `fix/gff3-oracle-audit`, `fix/fasta-oracle-audit` (one per module, only if it has a confirmed defect).

Scope:
- #265 (keep the imported GFF3 source column on export), FMT-17, plus the GFF3 export behaviours it touches: FMT-1 (INSDC key → SO term, SO 2026-08-07), FMT-11 (strand-relative CDS phase, including minus strand, split exons and `/codon_start` 2 and 3), coordinates of multi-part features. Code: `src/core/formats/gff3.ts`, `src/core/formats/soTypes.ts`.
- #269 and #270 (`-` removed from FASTA loaded as sequences, and reported), FMT-4, and FMT-5 definition-line modifiers as far as #269 touches parsing. Code: `src/core/formats/fasta.ts`, `src/core/formats/ncbiModifiers.ts`, `src/app/logic/bioResponse.ts`, `src/app/components/GapRemovalNotice.tsx`.
- #264 (omit an unrecorded threshold from exported search notes), FMT-15: a private format with no external standard. Only check that every value the note states is recorded and correct; otherwise classify as owner decision. Code: `src/core/formats/searchHitNote.ts`.
- Claims PRs #236 and #262 recorded in `docs/standards/formats.md` for these rule IDs.
- Known deviation #244 (FASTA wrapping) is tracked; do not re-file it.

Oracles:
- **GenomeTools `gt gff3validator` 1.6.6: acquire.** Download the v1.6.6 release tarball from github.com/genometools/genometools into a new, empty `$LIB/oracles/genometools/`, record VERSION, SHA256, SOURCE_URL and run.md, and build with `make cairo=no` there (gcc 11, make and zlib headers are present). If the build needs any system package, stop and ask; do not install one. Run `gt gff3validator` and, with `-typecheck` against SO 2026-08-07 (`docs/standards/sources/so-2026-08-07.obo`), on Dunceious's exported GFF3.
- NCBI table2asn 1.29.324 (ready, `$LIB/oracles/table2asn/run.md`): it reads FASTA deflines with NCBI's own modifier parser and can read GFF3 annotation. Check that it accepts GFF3 with `-f x.gff3` before relying on it; its `.gbf` then shows NCBI's interpretation of phase and coordinates.
- Biopython 1.88 (secondary, ready) and EMBOSS `seqret` (ready) for FASTA parsing.

Cross-check reviewer: Sol `medium`. Results go in `$LIB/runs/formats/ledger.md` and `$LIB/runs/formats/REPORT.md`; confirmed defects go on the module branches for the orchestrator to merge into #284's branch.
`````

</details>

### `briefs/M10-overlay.md`

<details><summary>brief for M10, overlay (PR #266)</summary>

<!-- lib: briefs/M10-overlay.md -->
`````markdown
You are an audit worker for Dunceious (repo at /home/mainframe/dunceious, GitHub JoaoVictorDaijo/dunceious). Module: **M10, alignment overlay and remap**, scoped to the v4.0.0 batch.

First read and follow `/home/mainframe/dunceious/.code/keep/canonical-correctness/worker-procedure.md` (setup, steps, ledger, test budget, stop-and-ask rules). It is complete; this prompt only adds your scope. Then read your rows in `/home/mainframe/dunceious/.code/keep/canonical-correctness/index.md` § M10 and `$LIB/oracles/biopython/run.md`. Do not touch the primary checkout at /home/mainframe/dunceious (it sits on a stale branch with the owner's changes); work only in your own worktree, cut from `origin/docs/standards-oracle-audit` (working PR #284) as the procedure says. Branch name: `fix/overlay-oracle-audit`.

Scope: PR #266 (refuse alignment overlays whose residues differ) and the claims PRs #236 and #262 recorded for OP-4, OP-15 and FMT-6 in `docs/standards/operations.md` and `formats.md`. Behaviour rows:
- OP-15 / FMT-6: which aligned-FASTA inputs are accepted as a rectangular alignment and overlaid: equal row lengths, ID sets, empty rows, rows whose ungapped residues differ from the loaded record (case, T/U, IUPAC codes, `*`, `.` as gap, trailing gaps).
- OP-4: residue ↔ column maps and their boundaries (first and last residue, all-gap columns, a row that is all gaps), including what the app shows for a column with no residue. Known deviation #260 is tracked; do not re-file.
- EBI submission (FMT-12, METRIC-8a) is out of scope: remote services, contract only.

Code: `src/core/alignment/preflight.ts`, `src/core/alignment/index.ts`, `src/core/alignment/ebi.ts`, `src/domain/bio/sequence.ts` (overlay), `src/app/logic/bioResponse.ts`, `src/app/logic/projectFile.ts`.

Oracle: Biopython 1.88 (`Bio.Align.Alignment` `indices`/`inverse_indices`, `Bio.AlignIO` / `MultipleSeqAlignment`), ready in `$LIB/oracles/biopython/`. It is a secondary oracle and there is no standard-body tool for these rows, so a disagreement is a candidate defect only when Biopython's documented contract or a standard's text backs it; otherwise it is an owner decision. EMBOSS `seqret -osformat fasta` (ready) shows how EMBOSS reads the same aligned FASTA.

Cross-check reviewer: Sol `medium`. Results go in `$LIB/runs/overlay/ledger.md` and `$LIB/runs/overlay/REPORT.md`; confirmed defects go on your module branch for the orchestrator to merge into #284's branch.
`````

</details>

### `ledger.md`

<details><summary>the ledger: A1 and its 13 cases</summary>

<!-- lib: ledger.md -->
`````markdown
# Ledger

One row per behaviour and input class checked. Rule IDs come from `docs/standards/`; module IDs
(M1–M12) from `index.md`. Raw inputs and outputs live in `runs/<module>/`.

Classification: **agree**, **candidate defect** (the standard backs the oracle), **oracle
limitation** (the tool's documented scope excludes the case), **owner decision** (the standard
is silent and the tools differ). A finding (`F<n>`) needs all three of: a pinned oracle
disagreeing on a concrete input, the standard or the oracle's contract backing the oracle, and
a CONFIRMED cross-check by the other model family.

Cross-check: reviewer, model and effort, verdict (CONFIRMED / REFUTED), date.

## Findings

| ID | Module | Rule | Summary | Oracle | Cross-check | PR / issue |
|---|---|---|---|---|---|---|
| A1 | M1 | TRANS-1 | 5′-partial CDS did not read its last codon as a stop under tables 27, 28, 31 | table2asn 1.29.324 validator; Toolkit `sequence.cpp:3724` | v4.0.0 review (Astra + Claude) | fixed in #278 |

## Rows

| Module | Rule | Behaviour | Input class | Run | Oracle verdict | Dunceious (at) | Class | Finding | Cross-check | PR |
|---|---|---|---|---|---|---|---|---|---|---|
| M1 | TRANS-1 | terminal stop, table 27 | `1..9`, `ATGCCCTGA` | `runs/translation-terminal-stop/Parduczia` | stop (`MisMatchAA` translation `*`) | stop (#278) | agree | A1 | v4.0.0 review | #278 |
| M1 | TRANS-1 | terminal stop, table 27 | `<1..9` | same | stop | stop (#278); residue before | agree after fix | A1 | v4.0.0 review | #278 |
| M1 | TRANS-1 | terminal stop, table 27 | `1..>9` | same | residue (no `MisMatchAA`) | residue | agree | — | — | — |
| M1 | TRANS-1 | terminal stop, table 27 | `complement(1..9)` | same | stop | stop | agree | — | — | — |
| M1 | TRANS-1 | terminal stop, table 27 | `complement(1..>9)` (5′-partial) | same | stop | stop (#278); residue before | agree after fix | A1 | v4.0.0 review | #278 |
| M1 | TRANS-1 | terminal stop, table 27 | `complement(<1..9)` (3′-partial) | same | residue | residue | agree | — | — | — |
| M1 | TRANS-1 | internal vs terminal TGA, table 27 | `1..12`, `ATGTGACCCTGA` | same | internal `W`, terminal stop | same | agree | — | — | — |
| M1 | TRANS-1 | terminal stop, joins | `join(<1..6,complement(10..12))` | `runs/translation-terminal-stop/joins` | stop | stop (#278) | agree after fix | A1 | v4.0.0 review | #278 |
| M1 | TRANS-1 | terminal stop, joins | `join(1..>6,10..12)` (internal partial) | same | stop | stop | agree | — | — | — |
| M1 | TRANS-1 | terminal stop, joins | `join(1..6,10..>12)` | same | residue | residue | agree | — | — | — |
| M1 | TRANS-1 | terminal stop, joins | `join(1..6,complement(<10..12))` | same | residue | residue | agree | — | — | — |
| M1 | TRANS-1 | terminal stop, joins | `complement(join(1..3,7..>12))` (5′-partial) | same | stop | stop (#278) | agree after fix | A1 | v4.0.0 review | #278 |
| M1 | TRANS-1 | terminal stop, joins | `complement(join(<1..3,7..12))` (3′-partial) | same | residue | residue | agree | — | — | — |

The Dunceious column for these rows is the pinned fixture
`src/domain/bio/__tests__/fixtures/ncbi-validator-terminal-stop.json` as of #278; the M1 worker
re-runs them through the public translation function and replaces "(#278)" with a commit.
`````

</details>

### `proposals/move-out.md`

<details><summary>the move-out proposal: Option A done in #284; Option B commands and rollback</summary>

<!-- lib: proposals/move-out.md -->
`````markdown
# Proposal: move audit and reference material out of the repository

Status: **Option A is done in #284** (`be2e9f2`, approved by the owner on 2026-11-05; `tools.md` links
`5058424`). Option B is not recommended and stays open. Every step below needs the
owner's go-ahead; the rewrite also needs the owner's own hands (branch protection, the tag push).

Read at `develop` `e03f065`, `main` `75b2f1d`, 2026-11-03.

## Inventory

| Item | Size | Who reads it | Kind | Recommendation |
|---|---|---|---|---|
| `docs/standards/survey/` (3 ledgers: first survey, tool survey, cohort) | 164 KB | humans re-verifying `tools.json`; `tools.json`'s `ranking` note; links in `tools.md` | audit evidence | **move out** |
| `docs/standards/tools.json` | 621 KB | `tools.md` (summarises it, links it); `README.md` link | survey data | **move out** |
| `docs/standards/tool-counts.json` | 49 KB | `tools.md` | survey data | **move out** |
| `docs/standards/tools.md` | 13 KB | step 3 of the order of authority ("major applications listed in Tools"); agents via CLAUDE.md | living rule support | keep; rewrite its data links and "Updating" section |
| `docs/standards/conformance/` | ~20 KB | `RecordDetailsModal.test.tsx:66` and `featureSequenceViews.test.ts:26` name `expected-oracle.txt` / `oracle.py` as their oracle | test provenance | keep: a future maintainer needs it to re-derive those expectations |
| `docs/standards/sources/` (`so-2026-08-07.obo`, EMBL manual, NOTICE) | 1.1 MB | `scripts/fetch-standards.mjs:31` reads stored documents from here | pinned standards | keep (a script reads it) |
| `docs/standards/*.md` rule files, `sources.json`, `sources.md` | — | CLAUDE.md § Sequence standards, code comments citing rule IDs | living docs | keep |

No code, test or script reads the three "move out" items (`git grep` over `src`, `scripts`,
`e2e`, `.github`, `package.json`).

## Finding: a history rewrite does not take the material out of GitHub

GitHub's "Removing sensitive data from a repository" page (read 2026-11-03):

- A force-push "will fail to push any refs starting with `refs/pull/`, since GitHub marks those as
  read-only." Those refs keep the old history, reachable by SHA.
- Only GitHub Support can dereference them, and "GitHub Support won't remove non-sensitive data."

In the mirror backup, **22 of the 232 PR head refs contain `0a4c1f1`**, the commit that added the
survey data (2026-10-23). They would keep every byte of it public after any rewrite. The repo is
public with 0 forks.

So the rewrite buys a cleaner `git log` on `main` and `develop` and pays for it with: new SHAs for
93 `develop` commits since `0a4c1f1`, for `main` and for tag `v4.0.0`; broken local clones and
worktrees; PR diffs and review comments on rewritten commits lost; and owner-only steps.
The material itself is 1.67 MB across 10 blobs in history.

**Recommendation: Option A alone.** Take the files out of the tree going forward and keep
history. Choose Option B only if the reason for removal is one that a cleaner `git log` actually
serves; if the reason is that the content must not be public, neither option achieves it.

## Option A (recommended): remove from the tree, keep history

One PR into `develop`, after the owner approves removing these tracked files.

1. Copy the three items into the local library first. Done: `reference/` holds them as of
   `e03f065` (`git archive`), with `reference/SHA256`.
2. Branch from `origin/develop` in a worktree, `chore/standards-survey-out`.
3. `git rm -r docs/standards/survey docs/standards/tools.json docs/standards/tool-counts.json`
4. `tools.md`: replace lines 8–12 with a dated provenance note pointing at the last commit that
   held the data (`https://github.com/JoaoVictorDaijo/dunceious/tree/e03f065/docs/standards`);
   rewrite "Updating" (lines 180–184) to say the dataset is kept outside the repo and how to
   regenerate the tables. `README.md:10`: same link change. Owner choice: link the permalink,
   or say only "kept outside the repository" with no link.
5. Fragment `changes/unreleased/standards-survey-out.md`; commit
   `docs: move the tool-survey dataset out of the repository [CF-Pages-Skip]`; PR title carries
   `[CF-Pages-Skip]`. Checks: `npm run lint:headers`, a link check over `docs/standards/`.

Rollback: revert the PR.

## Option B: rewrite history (only after A, only with the owner)

Run A first so the rewritten tips keep their trees: then every rewritten tip has the same tree
as before, which is the main correctness check.

Owner-only prerequisites:
- Pause merges into `main` and `develop` for the duration.
- Settings → Branches: allow force pushes on `main` and `develop` (both currently
  `allow_force_pushes=false`), and restore it afterwards.
- The push itself: agent sessions cannot push tags (CLAUDE.md § Versioning), and `v4.0.0` must move.

Commands, from `/home/mainframe/dunceious/.code/keep/canonical-correctness/`:

```bash
# 0. Refresh the backup right before the rewrite and record its refs again
git -C backup/dunceious.git remote update --prune
git -C backup/dunceious.git for-each-ref --format='%(objectname) %(refname)' > backup/REFS-pre-rewrite.txt

# 1. git-filter-repo 2.47.0 is already in its own venv (backup/tools/venv; no system install).
#    It was set up with: uv venv backup/tools/venv && uv pip install --python backup/tools/venv/bin/python 'git-filter-repo==2.47.0'

# 2. Rewrite a copy, never the backup
git clone --mirror backup/dunceious.git rewrite.git
cd rewrite.git
../backup/tools/venv/bin/git-filter-repo --sensitive-data-removal --invert-paths \
  --path docs/standards/survey/ --path docs/standards/tools.json --path docs/standards/tool-counts.json

# 3. Verify before any push
git log --all --oneline -- docs/standards/survey docs/standards/tools.json docs/standards/tool-counts.json   # must print nothing
for r in main develop; do
  [ "$(git rev-parse refs/heads/$r^{tree})" = "$(git -C ../backup/dunceious.git rev-parse refs/heads/$r^{tree})" ] && echo "$r tree unchanged" || echo "$r TREE CHANGED"
done
git cat-file -p v4.0.0 | head -5    # annotated tag rewritten, still on main's promotion commit

# 4. Push (owner): branches and tags in one atomic push; refs/pull/* are left alone by design
git remote set-url origin https://github.com/JoaoVictorDaijo/dunceious.git
git push --atomic --force origin 'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'
```

Expected side effects:
- The push to `main` runs `release-tag.yml`; `v4.0.0` already exists, so it logs "already exists …
  nothing to do" (`release-tag.yml:66`). The atomic push makes sure the tag is there first.
- Cloudflare Pages rebuilds `main` (its last commit has no `[CF-Pages-Skip]`) with the same
  content and version; earlier deployments keep their old SHAs.
- Open PRs #138 and #140 branch from before `0a4c1f1`; their merge bases do not change.
- Local: every clone and worktree must re-fetch and move its branches. A branch with unpushed
  work is rebased with `git rebase --onto <new-develop> <old-develop> <branch>`, using
  `filter-repo/commit-map` in `rewrite.git` to map old SHAs to new ones.

Rollback (exact while nobody has pushed on top of the rewrite):

```bash
cd backup/dunceious.git
git push --atomic --force origin 'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'
```

## Backup

- `backup/dunceious.git`: `git clone --mirror` of `origin`, made 2026-11-03 (`backup/CREATED`), 280
  refs listed in `backup/REFS.txt` (`main` `75b2f1d`, `develop` `e03f065`, 38 tags, 232 PR refs).
- `reference/`: the three items as of `e03f065` (made with this proposal).
- Kept until the owner confirms the result is stable and authorises deleting it.
`````

</details>

### `proposals/claude-md.md`

<details><summary>the CLAUDE.md proposal (in #284)</summary>

<!-- lib: proposals/claude-md.md -->
`````markdown
# Proposal: sharpen "Verify, don't recall" (CLAUDE.md § Scientific rigor)

Status: **in draft PR #284** (2026-11-05), with the widened trigger below; the owner picks the variant. Against `develop` `e03f065`, CLAUDE.md lines 15–19.

```diff
 - **Verify, don't recall.** Check each method, default and convention against an authoritative
   source before relying on it: a widely used reference implementation (EMBOSS, NCBI BLAST, edlib,
   SSW), its documentation or source code, or a standard specification (SAM, INSDC). These
   implementations settle a method; there's no need to track down or re-derive the original paper.
-  Say what you could not verify.
+  When a recorded rule or a test can't settle a case, settle it with the oracle: read the
+  reference implementation's source at the branch that decides it, or run the reference tool,
+  and cite the file and commit or the tool version. Say what you could not verify.
```

Why this wording: it sharpens the existing bullet instead of adding one, and "oracle" is the word
the next bullet ("Validate against an independent oracle") and `docs/standards/` already use.

Open point for the owner: A1's rule did not fail to settle the case, it settled it wrongly, and
the tests agreed with it. To cover that, the trigger can be widened to
"When a recorded rule or a test can't settle a case, or a reference tool disagrees with it, …".
`````

</details>

### `oracles/table2asn/run.md`

<details><summary>how to run table2asn</summary>

<!-- lib: oracles/table2asn/run.md -->
`````markdown
# table2asn 1.29.324 (NCBI): validator oracle

Authority for: CDS translation as NCBI validates it (genetic codes, partial ends, terminal stops,
joins and complements), INSDC location semantics through the `.tbl` five-column format, and the
GenBank flat file NCBI would write (`.gbf`).

## Run

From the run's own directory under `runs/<module>/` (outputs land next to the inputs):

    ../../oracles/table2asn/table2asn -i X.fsa -f X.tbl -V vb -a s -o X.sqn 2> X.log

- `-V v` writes the validator report `X.val`; `-V vb` also writes the flat file `X.gbf`.
- `-a s` treats a multi-record FASTA as a set. Outputs: `X.sqn` (ASN.1), `X.val`, `X.gbf`, `X.stats`.
- Exit 0, or 2 when the feature table logs a `Problem:` warning (for example "internal partials");
  outputs are still written. Any other exit means the run failed.
- The banner "This copy of table2asn is more than 1 year old" comes from the current NCBI download; ignore it.
- It prints "Falling back on built-in data for popular organisms". Whether it tries a network
  taxonomy lookup first was not checked. Use synthetic inputs only.

## Gotchas

- The genetic code comes from `[gcode=N]` in the FASTA defline. A `transl_table` qualifier in the
  `.tbl` is not what sets it.
- In the `.tbl`, `<` goes on the 5′ column (first) and `>` on the 3′ column (second), whatever the
  strand: `<9  1  CDS` is `complement(1..>9)`.
- The protein table2asn builds can disagree with its own validator. **Only the validator's
  translation is the authority.** In `SEQ_FEAT.MisMatchAA`, `Residue n in protein [W] != translation [*]`,
  the bracket after `translation` is the validator's answer and the one after `protein` is the
  builder's.
- The validator translates through the C++ Toolkit (`x_Translate`, see `../ncbi-cxx-toolkit/run.md`).

## Reproducibility

`runs/translation-terminal-stop/rerun-2026-11-03/` re-ran the A1 inputs with the command above:
`.val`, `.gbf` and `.stats` are byte-identical to the originals (`cmp -s`).
`````

</details>

### `oracles/ncbi-cxx-toolkit/run.md`

<details><summary>how to read the NCBI C++ Toolkit source</summary>

<!-- lib: oracles/ncbi-cxx-toolkit/run.md -->
`````markdown
# NCBI C++ Toolkit source at 912b751 (read, not built)

Authority for how NCBI's own code implements translation, location handling, validation and
flat-file formatting. Read the branch that decides the case and cite `file:line` at this commit.

## Layout

`src/` is a shallow, blob-filtered, sparse checkout of `ncbi/ncbi-cxx-toolkit-public` at
`912b751f211cb8757684d1ab4bfbdf05fb243da6`. Checked-out paths:

- `src/objmgr/util/`, `include/objmgr/util/`: `sequence.cpp` (`CSeqTranslator`, `x_Translate`), feature utilities
- `src/objtools/validator/`, `include/objtools/validator/`: the validator table2asn runs
- `src/objtools/format/`, `include/objtools/format/`: GenBank flat-file writer (asn2gb)
- `src/objtools/readers/`, `include/objtools/readers/`: FASTA, five-column table and GFF3 readers
- `src/objects/seqfeat/`, `src/objects/seqloc/`: genetic-code and location object code

Add a path (fetches its blobs from GitHub on demand):

    git -C src sparse-checkout add '/src/<dir>/'

## Anchors

- Terminal stop on a 3′-complete CDS: `src/objmgr/util/sequence.cpp:3724`
  (`... && is_3prime_complete`), inside `x_Translate` (signature at :3639). This settled A1.

## Caveats

- Source reading tells you what one code path does; check that it is the path the validator
  (`table2asn -V v`) actually takes, and prefer a table2asn run when one can show it.
- `src/` is a downloaded tree: read it, never build or execute anything from it.
`````

</details>

### `oracles/ncbi-gc-prt/run.md`

<details><summary>how to use gc.prt</summary>

<!-- lib: oracles/ncbi-gc-prt/run.md -->
`````markdown
# NCBI gc.prt 4.6: genetic-code tables (data)

The NCBI Genetic Codes in ASN.1 text form: per table, `ncbieaa` (amino acids), `sncbieaa`
(starts: `M` initiator, `*` context-dependent stop) and the base rows. Same file and checksum as
`docs/standards/sources.json` id `ncbi-genetic-codes`.

Independence: Dunceious generates `src/domain/bio/geneticCodes.ts` from this file
(`npm run standards:genetic-codes`), so gc.prt is the source, not an independent check of the
generator. For table content, compare against Biopython's `Bio.Data.CodonTable` (a separate parse)
or against table2asn's validator.

Read it with any text tool; there is nothing to run.
`````

</details>

### `oracles/biopython/run.md`

<details><summary>how to run Biopython</summary>

<!-- lib: oracles/biopython/run.md -->
`````markdown
# Biopython 1.88 (secondary oracle)

Secondary to the NCBI and EMBOSS oracles: it settles nothing on its own when a standard body's
tool answers. Use it for translation (`Seq.translate(table=, cds=)`), `SeqFeature.extract`,
GenBank/FASTA parse and write (`Bio.SeqIO`), reverse complement and codon tables.

## Run

Keep scripts in `runs/<module>/`, never in this folder, and run them with the venv's Python in
isolated mode from the run directory:

    ../../oracles/biopython/venv/bin/python -I script.py > script.out 2>&1

`-I` keeps the user site and the current directory off the import path; the venv's own
site-packages still loads. Wheels and their sha256 are in `wheels/` and `SHA256`; to rebuild:

    uv venv --python /usr/bin/python3 venv
    uv pip install --python venv/bin/python --no-index --find-links wheels 'biopython==1.88'

## Known behaviour

- `translate()` warns on tables 27, 28 and 31 that dual-meaning codons read as the residue;
  `cds=True` then reads the last codon as a stop (A1: `ATGCCCTGA`, table 27 → `MP`).
- GenBank parsing rejects nested double complements (`location is None`) and warns; record the
  warning text, it is part of the oracle output.

Smoke run: `runs/_smoke/biopython.out`.
`````

</details>

### `oracles/emboss/run.md`

<details><summary>how to run EMBOSS</summary>

<!-- lib: oracles/emboss/run.md -->
`````markdown
# EMBOSS 6.6.0.0 (preinstalled Ubuntu package)

The Ubuntu package `emboss 6.6.0+dfsg-11ubuntu1` was on this machine before the audit; the audit
installed nothing. Binaries are in `/usr/bin` (sha256 in `SHA256`, package list in `PACKAGES`).
`embossversion -auto` reports `6.6.0.0`, the version the repo's EMBOSS fixtures require.

Authority for: `transeq` (translation by frame/table), `revseq` (reverse complement), `needle` and
`water` (global/local alignment scores and identity), `matcher` (best-N local alignments),
`em_cons` (consensus; Debian renames `cons` to `em_cons`), `extractfeat` and `seqret`
(feature extraction and GenBank round-trip).

## Run

    transeq -auto -sequence in.fa -table 0 -frame 1 -outseq stdout
    revseq  -auto -sequence in.fa -outseq stdout
    water   -auto -asequence q.fa -bsequence r.fa -gapopen 10 -gapextend 0.5 -aformat3 srspair -outfile stdout
    needle  -auto -asequence q.fa -bsequence r.fa -gapopen 10 -gapextend 0.5 -aformat3 srspair -outfile stdout
    em_cons -auto -sequence aln.fa -outseq stdout
    extractfeat -auto -sequence x.gb -sformat genbank -type CDS -join Y -osformat fasta -outseq stdout

The local-search fixtures' exact `water`/`matcher` templates are in the repo at
`src/core/search/local/__tests__/fixtures/emboss/README.md`.

## Gotchas

- `transeq -table` (checked with `transeq -help -verbose`): 0 is the standard code, 1 the standard
  code with alternative initiation codons, and 2–23 are the NCBI ids. **Tables 24–33 do not exist
  in 6.6.0** (`/usr/share/EMBOSS/data/EGC.*` stops at 23): an oracle limitation, so use table2asn
  or Biopython there.
- `transeq` marks an untranslatable codon `X` and a stop `*`; it has no CDS mode and never reads
  `/transl_table`, `/codon_start` or partial ends.
- EMBOSS ignores the feature table of a GenBank record with no REFERENCE block; add one.
- `+dfsg` strips non-free files; whether Ubuntu's patches change any computed output was not
  checked. Compare a result against upstream behaviour only through the documented contract.

Smoke run: `runs/_smoke/transeq.out`, `runs/_smoke/revseq.out`.
`````

</details>
