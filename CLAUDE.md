# CLAUDE.md — Dunceious

Guidance for anyone (human or agent) working in this repo.

## Scientific rigor (first priority)

Scientists use Dunceious and treat its results as evidence. Any change that computes or displays a
biological result (search, alignment, translation, coordinates, consensus, scores, statistics,
import and export) must meet this bar. It outranks speed, convenience and visual polish.

- **Use established, published methods and standard defaults.** Name the method and its source (a
  paper or a reference tool and version) in the code's doc comment and in the living docs. Do not
  invent algorithms, scoring schemes, thresholds or heuristics. If no established method fits,
  stop and ask.
- **Verify, don't recall.** Check each method, default and convention against an authoritative
  source before relying on it: a widely used reference implementation (EMBOSS, NCBI BLAST, edlib,
  SSW), its documentation or source code, or a standard specification (SAM, INSDC). These
  implementations settle a method; there's no need to track down or re-derive the original paper.
  Say what you could not verify.
- **Match the effort to the risk.** Full rigor applies to what produces or shows a scientific
  result. Plumbing, interface chrome and refactors that leave results unchanged follow the normal
  engineering bar. Don't block on hard-to-reach sources when an established implementation
  answers the question.
- **No silent approximation.** A heuristic, cap, sampling step, time budget or fallback that can
  drop or change results must be visible to the user. Prefer an exact method when one is
  affordable.
- **Define every number shown.** Name the metric, its formula and the parameters behind it. A metric
  sharing a name with a reference tool's (identity, similarity, coverage, score) must use that
  tool's definition, or carry a different name.
- **Validate against an independent oracle.** Tests compare against a reference tool's output or a
  separate textbook implementation, never against the code's own logic. Cover IUPAC codes, RNA/U,
  alignment gaps, reverse strands, coordinate conventions and empty or boundary inputs.
- **Same input, same result,** on every browser, machine, SIMD or fallback build, and worker
  count.
- **Keep data local.** Sequences never leave the browser except through an action the user
  explicitly chooses, such as submitting to a named remote service.

**Sequence standards.** [`docs/standards/`](docs/standards/README.md) records which standard
governs each sequence operation (INSDC Feature Table, NCBI genetic codes, IUPAC codes, GFF3,
SAM, BED, …), at which version, and how the reference tools behave. Read the relevant rule before
changing such an operation, and follow its order of authority: the standard's text first, then
the recorded rules, then documented practice of the reference tools and major applications. When
none settles a case, stop and ask. `npm run standards:fetch` downloads the pinned documents.

## Project documents

Track durable documentation and historical design specs. Commit specs in `docs/specs/`
as `YYYY-MM-DD-<area>-<topic>.md` with YAML front matter; follow
[`docs/specs/README.md`](docs/specs/README.md) for metadata and lifecycle. Keep implementation
plans, review/IAR ledgers, handoffs and session notes untracked in `.code/docs/<task>/`
at the primary repository root. Put outcomes and verification evidence in the PR description
or comments; fold lasting decisions, invariants and limitations into the living docs.

## Issues

Issue forms in [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/) set the standard: a bug report
or a feature/design proposal. An issue filed with `gh issue create --body` skips the form, so its
body must use the form's `###` headings in the same order.

- **Code location** is required: every place involved, as `path:line` with a permalink pinned to a
  commit SHA, and the branch or commit read. The only exceptions are `Unknown` for a bug not yet
  traced and `New code` for a proposal with nothing to change yet.
- **Scientific basis** is required whenever the issue touches a scientific result (see
  [Scientific rigor](#scientific-rigor-first-priority)): the standard or reference tool with its
  version and section, a short quote of the rule, and a link. A proposal also names the method's
  standard defaults and the independent oracle that will validate it. Otherwise write
  `Not applicable:` and the reason.
- Titles take a Conventional Commits prefix (`bug:`, `feat:`, `design:`, `test:`).
- Before filing, search open and closed issues for duplicates; link related ones under
  **Related**.

## License headers (required, enforced)

Dunceious is **AGPL-3.0-or-later**. **Every covered source file MUST begin with the
project's AGPL license header.** Copy the exact text from any existing source file
(e.g. `vite.config.ts`).

- **Covered** (must have the header):
  - `.ts .tsx .js .mjs .cjs .css` → block comment `/* … */`
  - `.html .svg` → XML comment `<!-- … -->`
  - `.py .yml .yaml .sh` and `.gitignore` → `#`-prefixed lines
  - The header goes at the very top, but **after** a shebang (`#!…`), an HTML
    `<!DOCTYPE html>`, or an XML declaration.
- **Exempt** (cannot or by convention): `.json` (no comment syntax), `.md`, and
  binary assets (`*.png`, fonts, `*.gb`, lockfiles).
- **Generated files** must emit the header from their generator — e.g. `public/favicon.svg`
  is produced by `scripts/gen-brand-assets.py`, which writes the header into its output.
  Do not hand-edit generated files; they get overwritten.

**Enforcement:** `npm run lint:headers` runs in CI and fails on any missing header.
Auto-insert missing headers with:

```bash
node scripts/check-license-headers.mjs --fix
```

When you create **any** new covered file, add the header (or run `--fix`) before committing.

The ESLint warning ceiling in `npm run lint` only goes down; never raise it.

## Versioning & releases

Dunceious follows **SemVer**. The single source of truth is `package.json`
`version`, injected at build time as `__APP_VERSION__` (see `vite.config.ts`) and
surfaced in the StatusBar, the logger banner, and every exported file's
provenance stamp — so the number reaches users once it is deployed. History was
reconstructed on 2026-07-21 (see `CHANGELOG.md`); two anchors are load-bearing:
**`1.0.0`** = the import of the already-working app, **`2.0.0`** = the
layered-architecture rewrite. The old `3.4.0` was arbitrary and has been
discarded.

**Cloudflare Pages deploys `main`.** Read `main`'s `package.json` for the
production version and verify the deployed StatusBar after each promotion.
The historical `3.4.0` was corrected to `2.0.1` before the `2.5.0` promotion;
future promotions must strictly increase the version on `main`. The releases
first shipped as `2.8.0`, `2.8.1` and `2.9.0` were renumbered to `3.0.0`,
`3.0.1` and `3.1.0`: `v3.0.0` and `v3.0.1` tag the original promotion commits,
and `v3.1.0` tags the promotion that deployed the new number. The real `3.x`
line is unrelated to the discarded `3.4.0`.

**Bump rules** (highest-precedence change since the last release wins):

| Commit type | Bump |
| --- | --- |
| `feat!` / `BREAKING CHANGE:` footer / architecture-breaking `refactor!` | major |
| `feat` | minor |
| `fix`, `perf` | patch |
| `docs`, `test`, `refactor`, `chore`, `style`, `ci`, `build` | none |

**Promotion floor.** The table picks *how much* to bump; at a `develop` → `main`
promotion the floor is **at least a patch** — a deploy is a new live state, so no
promotion is version-less. A promotion carrying only `none`-type changes still
takes a patch. `version-guard` in CI enforces a strict increase.

**Cadence:** bump **once per `develop` → `main` promotion** — that is when
Cloudflare Pages actually deploys, so the version means "what is live." Do not
bump per feature-PR into `develop`.

Each PR adds one `changes/unreleased/<short-slug>.md` fragment; see
[`changes/README.md`](changes/README.md). Leave existing Unreleased entries in place.

**Release checklist** (run at every `develop` → `main` promotion):

```
1. Decide the bump from commits since the last release tag:
     git log "$(git tag --list 'v*' --sort=-v:refname | head -1)"..develop --no-merges --format='%s'
2. On develop, bump package.json + lock (no tag) and assemble the changelog:
     npm run version:minor      # or version:patch / version:major
     npm run changelog:release -- X.Y.Z  # optional second argument: YYYY-MM-DD
   Commit: chore(release): vX.Y.Z  — include CHANGELOG.md and fragment deletions
3. Open the develop → main promotion PR; CI must be green.
4. After merge, the Release tag workflow tags the MAIN merge commit vX.Y.Z.
   Do not push tags by hand. Confirm the tag exists; if the run failed, re-run
   it from the Actions tab (workflow_dispatch, optional `sha` input).
5. Verify the deployed StatusBar shows vX.Y.Z and a fresh export carries it.
```

Going forward, tags are annotated `vX.Y.Z`, created **only** on `main` promotion
commits by `.github/workflows/release-tag.yml`, so a tag means "this was deployed."
Agent sessions cannot push tags, which is why tagging lives in CI. **The
reconstructed backfill is the exception:** `v1.0.0`–`v2.4.1` sit on the
*develop-line* commits where each wave landed (main is behind and diverged), so
they mark **reconstructed development milestones**, not deployments — only `v1.0.0`–`v2.0.1` are also reachable from
`main`. The deploy-means-tag rule binds from the first real promotion onward.

## Pushes and Cloudflare Pages builds

Cloudflare Pages builds every push it is allowed to build (native Git
integration, no deploy workflow). Branch control is set to production `main`
plus preview branch `develop` only, so feature branches never build.

- Batch commits locally and push once per finished step, not per commit.
- Every agent commit on a branch other than `main` carries `[CF-Pages-Skip]` in
  its message. Pages reads only the last commit of a push, so that one must
  carry it. Never use `[skip ci]`: it also skips the GitHub Actions gates.
- PR titles into `develop` carry `[CF-Pages-Skip]` too: GitHub copies the title
  into the merge commit, so the merge does not build. PRs into `main` (the
  `develop` → `main` promotion) never carry it, or the release does not deploy.
- A live preview happens only on `develop` and only when the user asks: drop the
  marker from that PR's title before it is merged, and the merge builds
  `develop.dunceious.pages.dev`. Never create a branch just for a preview.
