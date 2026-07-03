# Phase 0 · Architecture Guidance — Skill + AGENTS.md + ARCHITECTURE.md Reconcile

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the agent-facing architecture guidance that the rest of the restructure builds toward — the **north star**. Make `ARCHITECTURE.md` the single canonical description of the *target* layered architecture (while still honestly marking today's state), then add two thin **doorways** into it so every agent gets the same guidance: a Claude project skill (`.claude/skills/dunceious-architecture/`) and a root `AGENTS.md` (Codex / generic-agent convention). This phase writes **docs/config only — no app code.**

**Architecture:** The rules live in exactly one place — `ARCHITECTURE.md`. The skill and `AGENTS.md` summarize and **link** to it; they are not copies (so they can't drift). The skill's `references/` dir holds three quick-reference extracts (structure diagram, import-rules table, a "where does X go" decision guide with worked examples), each citing `ARCHITECTURE.md` as canonical. The target layout and layer rules are locked by the design spec `docs/superpowers/specs/2026-07-02-architecture-restructure-design.md` (§3 structure, §4 import rules, §6 cross-agent doorways) — this plan conforms to it exactly: layers `domain ← core ← workers/handlers ← app`, pure-logic layer named **`core`** (not `services`), all source under `src/`.

**Tech Stack:** Markdown only. No TypeScript, no build changes, no dependencies.

## Global Constraints

- **Docs/config only.** No `.ts/.tsx/.js/.css` files are created or edited in this phase. Every deliverable is Markdown: `ARCHITECTURE.md` (edit), `.claude/skills/dunceious-architecture/SKILL.md` (create), `.claude/skills/dunceious-architecture/references/*.md` (create), `AGENTS.md` (create).
- **AGPL header:** `CLAUDE.md` and `scripts/check-license-headers.mjs` classify `.md` as **exempt** (no comment syntax → skipped by the header linter). **No AGPL header is required or wanted on any Phase 0 deliverable** — they are all `.md`. (If any future step here were to add a covered file — `.ts/.tsx/.js/.mjs/.cjs/.css/.html/.svg/.py/.yml/.yaml/.sh/.gitignore` — it would need the 18-line header identical to `vite.config.ts` lines 1-18; that does not apply here.) The final task still runs `npm run lint:headers` to prove nothing regressed.
- **Canonical-source discipline:** `ARCHITECTURE.md` is the one source of truth. The skill + `AGENTS.md` + `references/*.md` must **link back** to it and state that it wins on any conflict. Do not paste the full rule prose into the doorways.
- **Conform to the spec, don't re-derive it:** the target tree, layer names (`core`, `workers/handlers`), and import rules come verbatim from the design spec §3/§4/§6. Do not rename layers or invent placements the spec doesn't state.
- **Phase E ownership boundary (make it explicit, don't collide):** *Phase 0 OWNS `ARCHITECTURE.md`'s content* — it writes the doc to describe the target and marks target-vs-current. *Phase E only does the FINAL accuracy pass* (once code has actually moved to the target paths, verify the doc matches reality and remove the dual-state 🎯/📍 markers) *and flips ESLint enforcement* (size guard → `error`, add the import-boundary rule). Phase 0 does **not** touch ESLint config or `eslint.config.js`. Phase E does **not** rewrite the target description — it verifies it. This split is called out in `ARCHITECTURE.md` §10 so the two phases don't overwrite each other.
- **Branch/PR flow (per repo convention):** work on a feature branch off `develop` (e.g. `arch/phase0-architecture-skill`); PRs target **`develop`** (integration), not `main`. Do not commit/push until the task's commit step.
- **Commit style:** Conventional Commits; end each commit message with the `Co-Authored-By: Claude <noreply@anthropic.com>` trailer (repo convention).
- **CI mirror (final task):** `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run lint:headers` — all green. This phase changes no code, so these are unaffected; running them is cheap insurance that the tree is still green before the PR.
- **RTK note:** if any tool output looks garbled/truncated, prefix the command with `rtk proxy`.

## File structure

| File | Action | Responsibility |
|---|---|---|
| `ARCHITECTURE.md` | modify | Canonical architecture reference; reconcile to describe the 🎯 target layout + layer rules + canonical-source model; mark 🎯 target vs 📍 current; fix `uniquifyId→makeUniqueId`; drop "modularisation complete" framing |
| `.claude/skills/dunceious-architecture/SKILL.md` | create | Thin, trigger-rich entrypoint; summarizes + links to `ARCHITECTURE.md` and the references |
| `.claude/skills/dunceious-architecture/references/structure.md` | create | 🎯 target `src/` tree + per-layer purpose (quick-reference extract) |
| `.claude/skills/dunceious-architecture/references/import-rules.md` | create | Layer arrow diagram + the import rules + single-canonical-type-home table |
| `.claude/skills/dunceious-architecture/references/where-does-x-go.md` | create | Decision guide + 4 worked examples (parser, worker message type, UI component, domain algorithm) |
| `AGENTS.md` | create | Root Codex/generic-agent pointer to `ARCHITECTURE.md` + layer rules + license-header rule |

---

## Task 1: Reconcile `ARCHITECTURE.md` to the target architecture

`ARCHITECTURE.md` becomes the canonical north star. Apply the edits below in order against the current file (verified against the live doc: the stale `uniquifyId()` is at line 106; the "modularisation … complete" framing is at §10 lines 201–218; the current §2 folder tree spans lines 17–74). Preserve all `---` separators and section numbering except where an edit replaces a whole section body.

**Note on scope vs Phase E:** Phase 0 writes the *target description* and fixes the two explicitly-named stale items. Detailed pipeline prose in §3–§7 still describes some pre-restructure paths; add the 📍-current marker (Step 3 banner + §2 current-state callout) but do **not** exhaustively rewrite every path — Phase E does the line-by-line accuracy pass once code has moved. Do not touch ESLint config here.

**Files:**
- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: Replace the top banner (current lines 1–5).**

Match the existing header + version line + intro sentence:
```markdown
# Dunceious Architecture Overview

> Current version: **v3.4 (Modular Workspace)**

This document outlines the high-level architecture of the Dunceious bioinformatics platform.
```
Replace with:
```markdown
# Dunceious Architecture Overview

> **This is the canonical architecture reference (the north star).** The codebase is
> mid-restructure toward a single layered `src/` tree. Sections tagged **🎯 Target** describe
> the destination the restructure is converging on; notes tagged **📍 Current** describe
> what exists today and will be reconciled/removed as phases land. The full phase plan is in
> `docs/superpowers/specs/2026-07-02-architecture-restructure-design.md`. **Phase E** does the
> final accuracy pass (verifying the doc against the moved code and dropping the 🎯/📍 markers)
> and flips the ESLint enforcement — Phase 0 owns everything else in this document.

This document outlines the high-level architecture of the Dunceious client-side genome-viewer
SPA (React 19 + TypeScript, Vite, Web Workers, d3, react-window).
```

- [ ] **Step 2: Add two principles to §1 (Core Principles).**

After the existing `**Layered Visualization**` bullet (current line 13), append two bullets:
```markdown
- **Layered under `src/` (🎯 Target)**: code is grouped by technical role into four layers — `domain ← core ← workers/handlers ← app` — and imports only ever point **down** the stack. See §2.
- **Single canonical source of truth**: architecture rules live only in this document; `AGENTS.md` and the `dunceious-architecture` Claude skill are thin doorways that link here, never copies. Model types have one home (`src/domain/bio/types.ts`); wire contracts have one home (`src/workers/protocol.ts`).
```

- [ ] **Step 3: Replace the whole §2 block (current lines 17–74).**

Replace everything from the `## 2. Folder Structure` heading through the end of the current `### Extension Rules` bullet list (i.e. lines 17–74, stopping *before* the `---` separator on line 75) with the block below verbatim:

````markdown
## 2. Folder Structure

### 🎯 Target — the layered `src/` tree (destination of the restructure)

All source lives under `src/`, grouped by technical role into four layers. Imports only ever
point **down** this stack:

```
domain  ←  core  ←  workers/handlers  ←  app
```

```
src/
├── domain/bio/          # Pure biology model + algorithms. Imports NOTHING outside domain.
│   ├── types.ts         # Canonical types (+ coordinate-convention docs)
│   ├── coordinate.ts    # transposition, aligned-segment building
│   ├── consensus.ts
│   ├── intervals.ts     # clip/split/wrap — the ONE clipInterval; splitWrapAround
│   ├── sequence.ts      # reverseComplement, translate + GENETIC_CODE, molecule-type
│   │                    #   detection, gap↔ungapped mapping, sessionMoleculeType
│   └── index.ts         # barrel
│
├── core/                # Pure format/search logic (was root services/). Imports domain only.
│   ├── genbank/         # read sub-parsers + serialize.ts (exportToGenBank)
│   ├── formats/         # fasta.ts (parse + exportToFasta), annotations.ts (BED/GFF3/BedGraph + exportToGff)
│   └── search/          # query.ts (degenerate→regex), align.ts (smithWaterman), exact.ts, fuzzy.ts — NO protocol import
│
├── workers/             # Thin shells + typed contracts + worker bodies.
│   ├── protocol.ts      # message contracts (may reference domain types)
│   ├── bio.worker.ts / search.worker.ts    # thin shells
│   └── handlers/
│       ├── bio.ts       # handleBioMessage — orchestrates core + domain
│       └── search.ts    # runSearch + collectSeededFuzzyHits
│
└── app/                 # The React application. May import everything below it.
    ├── main.tsx + index.css   # entry (moved from root; index.html updated)
    ├── App.tsx          # composition root
    ├── logic/           # pure reducers/view-model (+ recordRemoval, runInlineSearch)
    ├── hooks/
    ├── components/      # modals, panels, nav, sidebar
    ├── viewer/          # GenomeViewer decomposed: slim container + layout.ts + tracks/ + Minimap + hooks + colors.ts
    └── lib/download.ts  # downloadBlob (the one DOM-coupled fn, kept out of core)
```

Root keeps only true root things: configs, `index.html`, `docs/`, `bench/`, `perf/`,
`scripts/`, `.github/`. In the target, root `components/`, `services/`, and `types.ts` no
longer exist.

### Layer import rules (the contract)

1. `src/domain/**` imports **only** `domain`. No DOM, React, core, workers, or app.
2. `src/core/**` imports `domain` **only**. Never workers, app, React, or DOM.
3. `src/workers/**` imports `core` + `domain` + its own `protocol`.
4. `src/app/**` may import anything below it. All React + DOM + browser I/O lives here.
5. **One canonical home per type:** model types in `domain/bio/types.ts`; wire contracts in
   `workers/protocol.ts` (referencing domain types). No duplicate `SearchResult` /
   `SearchOptions` / FASTA-record shapes.

These boundaries will be **enforced by an import-boundary ESLint rule added in Phase E**
(alongside flipping the `max-lines` guard to `error`). Until then they are a convention.

### 📍 Current — layout during migration

Until the restructure completes, some source still lives at the repo root and under a root
`services/` directory (a legacy name — it holds pure functions, not I/O clients):

- `components/GenomeViewer.tsx` — the rendering engine (→ `src/app/viewer/`, decomposed, in Phase D).
- `services/` — pure format/search logic + helpers (`genbank/`, `parsers/`, `search/`,
  `bio/handleBioMessage.ts`, `searchLogic.ts`, `bioUtils.ts`, `idHelpers.ts`,
  `moleculeType.ts`); becomes `src/core/` + `src/workers/handlers/` in Phase C.
- `types.ts`, `index.tsx`, `index.css` at root — folded into `src/app/` in Phase C
  (`index.html`'s `/index.tsx` entry is repointed then).
- `src/app/`, `src/domain/bio/`, `src/workers/` already exist and anchor the target.

Per-phase migration status is in §10.

### Extension rules — where does new code go?

- **New domain algorithm** → `src/domain/bio/<file>.ts`; export from `index.ts`. Imports nothing outside `domain`.
- **New file-format parser / search primitive** → `src/core/formats/` or `src/core/search/`; imports `domain` only; wire it into a `src/workers/handlers/*` body.
- **New worker message type** → add request/response to `src/workers/protocol.ts` (reference domain types), handle the branch in `src/workers/handlers/{bio,search}.ts`, dispatch from the relevant `src/app/hooks/*` hook.
- **New UI component** → `src/app/components/` (or `src/app/viewer/` if it belongs to the genome viewer); may import anything below it.

Full worked examples: `.claude/skills/dunceious-architecture/references/where-does-x-go.md`.
`AGENTS.md` and `.claude/skills/dunceious-architecture/` are doorways into this document.
````

- [ ] **Step 4: Fix the stale `uniquifyId()` reference in §4 (current line 106).**

Match the fragment at the end of the batch-load bullet:
```markdown
via `uniquifyId()` in `useBioWorker`.
```
Replace with:
```markdown
via `makeUniqueId()` (in `src/app/logic/bioResponse.ts`).
```
(Verified: the function is `makeUniqueId` in `services/idHelpers.ts`, re-exported by `services/bioUtils.ts:22`, and called from `src/app/logic/bioResponse.ts` — the old `uniquifyId()`/`useBioWorker` reference is doubly stale.)

- [ ] **Step 5: Add a 🎯-target note to the "How to add a new worker message type" list in §3.**

The steps in §3 (current lines 89–96) still say to handle the new branch "in the relevant worker's `onmessage` handler". Directly under the numbered list (after current line 96), insert:
```markdown
> **🎯 Target:** the branch logic lives in the pure handler (`src/workers/handlers/bio.ts` / `search.ts`), not in the worker's `onmessage` — the worker shell is a one-line `postMessage(handler(e.data))`. Dispatch from the relevant `src/app/hooks/*` hook. See §2 and the skill's `where-does-x-go.md`.
```

- [ ] **Step 6: Replace §10 (current lines 201–218) to drop the "complete" framing.**

Replace the entire §10 block — from `## 10. Refactor Roadmap` through the `> **PR #10** …` blockquote (current lines 201–218) — with:
```markdown
## 10. Restructure Status

The 2024–2026 modularisation (Phases 0–6, PRs #7–#14) established `src/app/`, `src/domain/bio/`,
`src/workers/`, the modular GenBank parser, worker contracts, and `strictNullChecks`. A
**follow-on architecture restructure** is now in flight to unify the remaining root code
(`components/`, `services/`, `types.ts`) into the layered `src/` tree in §2 and to enforce the
layer boundaries. It does **not** claim the structure is finished; the tracking table below is
the source of truth for what has moved.

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | Architecture skill + `AGENTS.md` + this reconcile (the north star) | 🎯 in progress |
| A | Dead-code deletion, type-dedup, `clipInterval` name-collision fix — no new modules | planned |
| B | `src/domain/bio/sequence.ts` — consolidate sequence primitives | planned |
| C | `services/` → `src/core/`; worker bodies → `src/workers/handlers/`; split `bioUtils`; DOM/presentation → `app/`; kill `types.ts` shim | planned |
| D | `GenomeViewer` → `src/app/viewer/` decomposed (`layout.ts` + `tracks/` + `Minimap` + hooks) | planned |
| E | High-value JSDoc + comment-policy fixes; **final `ARCHITECTURE.md` accuracy pass** (verify the moved code, drop the 🎯/📍 markers); flip ESLint size guard to `error` + add the import-boundary rule | planned |

See `docs/superpowers/specs/2026-07-02-architecture-restructure-design.md` for the full per-phase
plans. **Ownership:** Phase 0 owns this document's content (the target description); Phase E owns
the final verification + ESLint enforcement, so the two never overwrite each other.
```

- [ ] **Step 7: Verify the reconcile.**

```bash
cd /home/mainframe/dunceious
grep -n "uniquifyId" ARCHITECTURE.md; echo "uniquifyId hits above should be NONE"
grep -n "are \*\*complete\*\*" ARCHITECTURE.md; echo "complete-framing hits above should be NONE"
grep -c "🎯 Target\|📍 Current" ARCHITECTURE.md; echo "^ marker count should be > 0"
grep -n "src/core/\|workers/handlers\|domain  ←  core" ARCHITECTURE.md | head; echo "^ target layer content present"
```
Expect: zero `uniquifyId`, zero old "complete" framing, markers present, target content present.

- [ ] **Step 8: Commit.**

```bash
cd /home/mainframe/dunceious
git add ARCHITECTURE.md
git commit -m "docs(arch): reconcile ARCHITECTURE.md to the target layered structure" \
  -m "Describe the target src/ layout + layer import rules + single-canonical-source model; mark target vs current; fix uniquifyId->makeUniqueId; drop 'modularisation complete' framing. Phase E does the final accuracy pass + ESLint enforcement." \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Create the `dunceious-architecture` Claude skill

A thin, trigger-rich entrypoint plus a `references/` dir of quick-reference extracts. The skill **summarizes and links** to `ARCHITECTURE.md`; it is not a copy. All files are `.md` (no AGPL header).

**Files:**
- Create: `.claude/skills/dunceious-architecture/SKILL.md`
- Create: `.claude/skills/dunceious-architecture/references/structure.md`
- Create: `.claude/skills/dunceious-architecture/references/import-rules.md`
- Create: `.claude/skills/dunceious-architecture/references/where-does-x-go.md`

**Interfaces:**
- Frontmatter: `name: dunceious-architecture`, `description:` (third-person, "Use when…", trigger-rich, < 500 chars; total frontmatter < 1024 chars).
- Internal links resolve relative to `SKILL.md`: `references/*.md`, and to the repo root docs via `../../../ARCHITECTURE.md` and the spec.

- [ ] **Step 1: Create the directory.**

```bash
mkdir -p /home/mainframe/dunceious/.claude/skills/dunceious-architecture/references
```

- [ ] **Step 2: Create `SKILL.md`** (thin entrypoint — no rule prose copied):

```markdown
---
name: dunceious-architecture
description: Use when working in the Dunceious genome-viewer codebase and deciding where code belongs — its folder structure, the layered architecture (domain ← core ← workers/handlers ← app), the layer import rules, "where do I put…", or how to add a parser, a worker message type, a UI component, or a domain algorithm. Points to ARCHITECTURE.md as the canonical source.
---

# Dunceious Architecture

**Canonical source:** [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) at the repo root. This skill
is a thin doorway — it summarizes and links; it never restates the rules in full. If anything
here disagrees with `ARCHITECTURE.md`, **`ARCHITECTURE.md` wins.**

Dunceious is a client-side genome-viewer SPA (React 19 + TypeScript, Vite, Web Workers, d3,
react-window). Source is being unified under `src/` into four layers; imports only point **down**:

```
domain  ←  core  ←  workers/handlers  ←  app
```

- **`src/domain/bio`** — pure biology model + algorithms; imports nothing outside `domain`.
- **`src/core`** — pure format/search logic (the renamed `services/`); imports `domain` only.
- **`src/workers`** — typed `protocol` + thin worker shells + `handlers/` bodies; import `core` + `domain`.
- **`src/app`** — the React app; may import anything below it. All React/DOM/browser I/O lives here.

> **Migration note:** the tree is mid-restructure. Some code still lives at the repo root
> (`components/GenomeViewer.tsx`, `services/`, `types.ts`). `ARCHITECTURE.md` marks 🎯 target
> vs 📍 current and §10 tracks per-phase status.

## Quick answers

- **The target tree + per-layer purpose** → [`references/structure.md`](references/structure.md)
- **The import rules + one-canonical-type-home** → [`references/import-rules.md`](references/import-rules.md)
- **"Where does X go?" (parser / worker message / UI component / domain algorithm), with worked examples** → [`references/where-does-x-go.md`](references/where-does-x-go.md)
- **Everything, in depth** → [`ARCHITECTURE.md`](../../../ARCHITECTURE.md)
- **Why the restructure + the phase plan** → [`docs/superpowers/specs/2026-07-02-architecture-restructure-design.md`](../../../docs/superpowers/specs/2026-07-02-architecture-restructure-design.md)

## Non-negotiables

- **License headers:** every covered source file (`.ts .tsx .js .mjs .cjs .css`, plus `.html .svg .py .yml .yaml .sh`, `.gitignore`) must start with the AGPL header. `.md`/`.json`/binaries are exempt. `npm run lint:headers` enforces; auto-fix with `node scripts/check-license-headers.mjs --fix`. See the repo `CLAUDE.md`.
- **One home per type:** model types in `src/domain/bio/types.ts`; wire contracts in `src/workers/protocol.ts`. Never add a duplicate `SearchResult` / `SearchOptions` / FASTA-record shape.
- **Green after every change:** `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.
```

- [ ] **Step 3: Create `references/structure.md`** (target tree — a quick-reference extract):

````markdown
# Target folder structure (quick reference)

> Extract of `ARCHITECTURE.md` §2. **Canonical source:** [`../../../../ARCHITECTURE.md`](../../../../ARCHITECTURE.md).
> If this drifts, `ARCHITECTURE.md` wins. See §10 there for what has actually moved yet.

All source lives under `src/`, in four layers. Imports point only **down** the stack:
`domain ← core ← workers/handlers ← app`.

```
src/
├── domain/bio/          # Pure biology model + algorithms. Imports NOTHING outside domain.
│   ├── types.ts         # Canonical model types (+ coordinate-convention docs)
│   ├── coordinate.ts    # transposition, aligned-segment building
│   ├── consensus.ts
│   ├── intervals.ts     # clip/split/wrap — the ONE clipInterval; splitWrapAround
│   ├── sequence.ts      # reverseComplement, translate + GENETIC_CODE, molecule-type
│   │                    #   detection, gap↔ungapped mapping, sessionMoleculeType
│   └── index.ts         # barrel
│
├── core/                # Pure format/search logic (was root services/). Imports domain only.
│   ├── genbank/         # read sub-parsers + serialize.ts (exportToGenBank)
│   ├── formats/         # fasta.ts (parse + exportToFasta), annotations.ts (BED/GFF3/BedGraph + exportToGff)
│   └── search/          # query.ts (degenerate→regex), align.ts (smithWaterman), exact.ts, fuzzy.ts — NO protocol import
│
├── workers/             # Thin shells + typed contracts + worker bodies.
│   ├── protocol.ts      # message contracts (may reference domain types)
│   ├── bio.worker.ts / search.worker.ts    # thin shells: postMessage(handler(e.data))
│   └── handlers/
│       ├── bio.ts       # handleBioMessage — orchestrates core + domain
│       └── search.ts    # runSearch + collectSeededFuzzyHits
│
└── app/                 # The React application. May import everything below it.
    ├── main.tsx + index.css   # entry (moved from root; index.html updated)
    ├── App.tsx          # composition root
    ├── logic/           # pure reducers/view-model (+ recordRemoval, runInlineSearch)
    ├── hooks/
    ├── components/      # modals, panels, nav, sidebar
    ├── viewer/          # GenomeViewer decomposed: slim container + layout.ts + tracks/ + Minimap + hooks + colors.ts
    └── lib/download.ts  # downloadBlob (the one DOM-coupled fn, kept out of core)
```

**Per layer, in one line:**

| Layer | Purpose | May import |
|---|---|---|
| `domain/bio` | Pure biology model + algorithms (types, coordinates, consensus, intervals, sequence) | only `domain` |
| `core` | Pure format parsing/serialization + search primitives (no DOM, no worker contract) | `domain` |
| `workers` | Typed `protocol` + thin worker shells + `handlers/` bodies that orchestrate `core` + `domain` | `core`, `domain`, own `protocol` |
| `app` | React UI, hooks, pure view-logic, the decomposed viewer, and all browser I/O | anything below it |

Root keeps only configs, `index.html`, `docs/`, `bench/`, `perf/`, `scripts/`, `.github/`. In
the target, root `components/`, `services/`, and `types.ts` are gone.
````

- [ ] **Step 4: Create `references/import-rules.md`** (rules + canonical-type-home table):

````markdown
# Layer import rules (quick reference)

> Extract of `ARCHITECTURE.md` §2 (import rules) and the design spec §4.
> **Canonical source:** [`../../../../ARCHITECTURE.md`](../../../../ARCHITECTURE.md). If this drifts, it wins.

Imports only ever point **down** this stack — never sideways-up:

```
domain  ←  core  ←  workers/handlers  ←  app
```

| Layer | MUST import only | MUST NOT import |
|---|---|---|
| `src/domain/**` | `domain` | DOM, React, `core`, `workers`, `app` |
| `src/core/**` | `domain` | `workers`, `app`, React, DOM |
| `src/workers/**` | `core`, `domain`, own `protocol` | `app`, React, DOM |
| `src/app/**` | anything below it | — (top layer; owns all React + DOM + browser I/O) |

**Why:** today's root `services/*` depends on the worker `protocol` (a pure-logic → worker
inversion) and a single bio operation crosses the root↔`src` boundary three times. Relocating
worker bodies into `src/workers/handlers/` and `services/` into `src/core/` removes the
inversion. These boundaries become **ESLint-enforced in Phase E** (import-boundary rule +
`max-lines` flipped to `error`); until then they are a reviewed convention.

## One canonical home per type

Never declare a second copy of a shared shape. If you need a type, import it from its home.

| Type kind | Canonical home |
|---|---|
| Biology model types (`SeqRecord`, `BioFeature`, `SearchResult`, `QuantitativeTrack`, …) | `src/domain/bio/types.ts` |
| Worker wire contracts (`BioWorkerRequest`/`Response`, `SearchWorkerRequest`/`Response`, `SearchOptions`, FASTA aligned-record shape) | `src/workers/protocol.ts` (referencing domain types) |

Known duplicates the restructure collapses (do not reintroduce): `SearchResult`,
`SearchOptions`, and the FASTA aligned-record `Pick<>` shape.
````

- [ ] **Step 5: Create `references/where-does-x-go.md`** (decision guide + 4 worked examples):

````markdown
# Where does X go? (decision guide)

> Extract of `ARCHITECTURE.md` §2 (extension rules). **Canonical source:**
> [`../../../../ARCHITECTURE.md`](../../../../ARCHITECTURE.md). If this drifts, it wins.

**Decision, in one pass:**

1. Is it **pure biology model or algorithm** (no file formats, no DOM, no worker contract)? → `src/domain/bio/`.
2. Is it **pure format parsing/serialization or a search primitive**? → `src/core/` (`formats/`, `genbank/`, or `search/`). Imports `domain` only.
3. Does it **cross the worker boundary** (new request/response, or worker orchestration)? → `src/workers/` (`protocol.ts` for the contract; `handlers/` for the body).
4. Is it **React, a hook, view-logic, or browser I/O**? → `src/app/`.

If two seem to fit, pick the **lowest** layer it can live in without importing upward.

---

## Worked example 1 — adding a new file-format parser (e.g. VCF)

- **File:** `src/core/formats/vcf.ts` (a new format module alongside `fasta.ts` / `annotations.ts`).
- **May import:** `src/domain/bio/types` for the shapes it returns. Nothing from `workers`/`app`/React/DOM.
- **New shape?** If VCF needs a model type not already in `domain/bio/types.ts`, add it **there** (not in the parser). Do not invent a parser-local duplicate.
- **Wire it in:** the bio worker doesn't parse — it delegates. Call `parseVcf` from `src/workers/handlers/bio.ts` under the appropriate `PARSE_*` branch (add the branch + protocol message per example 2 if it's a new message).
- **AGPL header:** yes — it's a `.ts` file (18-line header identical to `vite.config.ts` lines 1-18).
- **Anti-pattern:** importing `protocol` from a `core/` parser (layer inversion) or reading `window`/`document` there.

## Worked example 2 — adding a new worker message type

- **Contract:** add the request + response interfaces to `src/workers/protocol.ts` and extend the relevant discriminated union (`BioWorkerRequest`/`BioWorkerResponse` or the search equivalents). Reference `domain/bio/types` for payload shapes — don't redeclare them.
- **Body:** handle the new `type` branch in the pure handler `src/workers/handlers/bio.ts` (or `search.ts`), returning the response — **not** in the worker's `onmessage`. The worker shell stays a one-liner: `self.onmessage = e => self.postMessage(handleBioMessage(e.data))`.
- **Dispatch:** post the typed request and consume the typed response from the owning hook in `src/app/hooks/` (e.g. `useBioWorker` / `useSearchWorker`).
- **Tests:** the handler is a pure function — unit-test it directly (see the existing handler tests). Protocol-shape tests live in `src/workers/__tests__/`.

## Worked example 3 — adding a new UI component

- **File:** `src/app/components/MyPanel.tsx` for an app-scoped panel/modal/nav element; or `src/app/viewer/` if it's part of the genome-viewer rendering (tracks, minimap, overlays).
- **May import:** anything below it — `core`, `domain`, hooks, other components. This is the only layer allowed React + DOM.
- **Barrel:** export it from `src/app/components/index.ts` if that barrel is how siblings are consumed.
- **AGPL header:** yes — `.tsx` is covered.
- **Anti-pattern:** putting rendering/React into `core` or `domain`; those layers must stay framework-free.

## Worked example 4 — adding a new domain algorithm

- **File:** `src/domain/bio/<name>.ts` (e.g. a new alignment or coordinate transform), exported from `src/domain/bio/index.ts`.
- **May import:** only other `domain/bio` modules. **No** DOM, React, `core`, `workers`, or `app`.
- **Types:** define/extend model types in `src/domain/bio/types.ts`; document the coordinate convention (0-based half-open; `start > end` means a circular wrap).
- **Consumption:** `core` and `workers/handlers` may call it; the app may call it via a worker or directly.
- **AGPL header:** yes — `.ts` is covered.
- **Anti-pattern:** a "domain" function that reaches into `services`/`core` or touches the worker `protocol` — that's a layering violation; invert the dependency so `core`/`workers` depend on `domain`, never the reverse.
````

- [ ] **Step 6: Validate the skill is well-formed.**

```bash
cd /home/mainframe/dunceious
D=.claude/skills/dunceious-architecture
ls -1 "$D"/SKILL.md "$D"/references/structure.md "$D"/references/import-rules.md "$D"/references/where-does-x-go.md
# frontmatter present + under the 1024-char budget:
node -e '
const fs=require("fs");
const t=fs.readFileSync(".claude/skills/dunceious-architecture/SKILL.md","utf8");
const m=t.match(/^---\n([\s\S]*?)\n---/);
if(!m){console.error("NO FRONTMATTER");process.exit(1);}
const fm=m[1];
console.log("frontmatter chars:", fm.length, fm.length<1024?"OK(<1024)":"TOO LONG");
console.log("has name:", /^name:\s*dunceious-architecture/m.test(fm));
console.log("has description:", /^description:\s*Use when/m.test(fm));
'
# every relative markdown link target resolves:
node -e '
const fs=require("fs"),path=require("path");
const base=".claude/skills/dunceious-architecture";
let bad=0;
for(const f of ["SKILL.md","references/structure.md","references/import-rules.md","references/where-does-x-go.md"]){
  const dir=path.dirname(path.join(base,f));
  const body=fs.readFileSync(path.join(base,f),"utf8");
  for(const mm of body.matchAll(/\]\((\.[^)]+\.md)\)/g)){
    const target=path.normalize(path.join(dir,mm[1]));
    if(!fs.existsSync(target)){console.error("BROKEN LINK in",f,"->",mm[1],"=>",target);bad++;}
  }
}
console.log(bad===0?"all relative .md links resolve":("BROKEN LINKS: "+bad));
process.exit(bad?1:0);
'
```
Expect: all four files listed, frontmatter under budget with `name`/`description` present, and "all relative .md links resolve". Fix any broken link (the `../` depth from `references/*.md` to root is four levels: `../../../../ARCHITECTURE.md`; from `SKILL.md` it is three: `../../../ARCHITECTURE.md`).

- [ ] **Step 7: Commit.**

```bash
cd /home/mainframe/dunceious
git add .claude/skills/dunceious-architecture
git commit -m "docs(arch): add dunceious-architecture Claude skill (doorway to ARCHITECTURE.md)" \
  -m "Thin trigger-rich SKILL.md + references/ (structure diagram, import-rules table, where-does-x-go decision guide with worked examples). Links to ARCHITECTURE.md as canonical; not a copy." \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Create root `AGENTS.md` (Codex / generic-agent doorway)

A short pointer file (Codex's convention) so non-Claude agents get the same guidance. It links to `ARCHITECTURE.md`, states the layer rules, and states the license-header rule. It is a doorway, not a copy — no rule prose beyond the one-line contract.

**Files:**
- Create: `AGENTS.md`

- [ ] **Step 1: Create `AGENTS.md`:**

````markdown
# AGENTS.md — Dunceious

Guidance for coding agents (Codex, Copilot, Gemini, and others). This is a **pointer**, not the
source of truth. The canonical architecture reference is **[`ARCHITECTURE.md`](ARCHITECTURE.md)**;
read it before moving code. Claude Code users also have the `dunceious-architecture` skill under
`.claude/skills/`, which links to the same document.

Dunceious is a client-side genome-viewer SPA (React 19 + TypeScript, Vite, Web Workers, d3,
react-window). Source is being unified under `src/` into four layers.

## Layer rules (the contract)

Imports only ever point **down** this stack:

```
domain  ←  core  ←  workers/handlers  ←  app
```

- **`src/domain/**`** — pure biology model + algorithms; imports only `domain`.
- **`src/core/**`** — pure format/search logic (the renamed `services/`); imports `domain` only.
- **`src/workers/**`** — typed `protocol` + thin worker shells + `handlers/` bodies; imports `core` + `domain`.
- **`src/app/**`** — the React app; may import anything below it. All React/DOM/browser I/O lives here.

One canonical home per type: model types in `src/domain/bio/types.ts`; worker wire contracts in
`src/workers/protocol.ts`. Never add a duplicate type. Full rules, the target tree, and worked
"where does X go" examples are in [`ARCHITECTURE.md`](ARCHITECTURE.md) §2.

> The tree is mid-restructure; some code still lives at the repo root (`components/`,
> `services/`, `types.ts`). `ARCHITECTURE.md` marks 🎯 target vs 📍 current and §10 tracks status.

## License headers (required, enforced)

Dunceious is **AGPL-3.0-or-later**. Every covered source file (`.ts .tsx .js .mjs .cjs .css`,
`.html .svg`, `.py .yml .yaml .sh`, `.gitignore`) MUST begin with the project's AGPL header (copy
it from any existing source file, e.g. `vite.config.ts`). `.md`, `.json`, and binary assets are
exempt. `npm run lint:headers` enforces this in CI; auto-insert with
`node scripts/check-license-headers.mjs --fix`. See [`CLAUDE.md`](CLAUDE.md) for the full rule.

## Before you claim done

`npm run typecheck` · `npm run lint` · `npm run test` · `npm run build` · `npm run lint:headers` — all green.
````

- [ ] **Step 2: Validate links resolve.**

```bash
cd /home/mainframe/dunceious
ls -1 AGENTS.md ARCHITECTURE.md CLAUDE.md
grep -q "ARCHITECTURE.md" AGENTS.md && echo "links to ARCHITECTURE.md: OK"
```

- [ ] **Step 3: Commit.**

```bash
cd /home/mainframe/dunceious
git add AGENTS.md
git commit -m "docs(arch): add root AGENTS.md pointer for non-Claude agents" \
  -m "Short Codex/generic-agent doorway: links to ARCHITECTURE.md, states the layer rules and the AGPL license-header rule. Not a copy." \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Full CI mirror + open PR

**Files:** none (verification + PR only).

- [ ] **Step 1: CI mirror (proves the docs-only change left the tree green).**

```bash
cd /home/mainframe/dunceious
npm run typecheck > /dev/null 2>&1; echo "typecheck=$?"
npm run lint > /dev/null 2>&1; echo "lint=$?"
rtk proxy npx vitest run > /dev/null 2>&1; echo "test=$?"
npm run build > /dev/null 2>&1; echo "build=$?"
npm run lint:headers > /dev/null 2>&1; echo "headers=$?"
```
All five must be `0` (lint `0` = warnings only). This phase touches no code, so any non-zero here is a **pre-existing** failure unrelated to Phase 0 — investigate before opening the PR, do not "fix" it inside this docs phase.

- [ ] **Step 2: Sanity-check the three doorways all point at the canonical source.**

```bash
cd /home/mainframe/dunceious
grep -q "ARCHITECTURE.md" AGENTS.md && \
grep -q "ARCHITECTURE.md" .claude/skills/dunceious-architecture/SKILL.md && \
grep -q "canonical" .claude/skills/dunceious-architecture/references/structure.md && \
echo "all doorways reference the canonical source: OK"
```

- [ ] **Step 3: Push + open PR against `develop`.**

```bash
cd /home/mainframe/dunceious
git push -u origin arch/phase0-architecture-skill
gh pr create --base develop \
  --title "docs(arch): Phase 0 — architecture skill + AGENTS.md + ARCHITECTURE.md north star" \
  --body "$(cat <<'EOF'
Phase 0 of the architecture restructure (docs/config only — no app code).

- **ARCHITECTURE.md** reconciled to describe the TARGET layered `src/` structure (domain ← core ← workers/handlers ← app), the layer import rules, and the single-canonical-source model. Marks 🎯 target vs 📍 current so it works as a north star during migration. Fixes the stale `uniquifyId`→`makeUniqueId` reference and drops the "modularisation complete" framing.
- **.claude/skills/dunceious-architecture/** — thin, trigger-rich SKILL.md + references/ (structure diagram, import-rules table, where-does-x-go decision guide with worked examples). Doorway to ARCHITECTURE.md, not a copy.
- **AGENTS.md** — root Codex/generic-agent pointer to ARCHITECTURE.md + the layer rules + the license-header rule.

Ownership boundary: Phase 0 owns ARCHITECTURE.md's content; **Phase E** does the final accuracy pass (verify against moved code, drop the 🎯/📍 markers) and flips ESLint enforcement. See docs/superpowers/specs/2026-07-02-architecture-restructure-design.md §6.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

- **Spec coverage:** the three deliverables from the design spec §6 (canonical `ARCHITECTURE.md`, Claude skill, Codex `AGENTS.md`) each map to a task (1/2/3). Target tree matches spec §3 verbatim (layer named **`core`**, worker bodies under `workers/handlers/`); import rules match spec §4; the "single source, three doorways" model matches spec §6.
- **Accuracy verified against live code:** `uniquifyId` returns zero hits — the function is `makeUniqueId` (`services/idHelpers.ts`, re-exported by `bioUtils.ts:22`, called from `src/app/logic/bioResponse.ts`); the stale ref sits at `ARCHITECTURE.md:106`. The "complete" framing is §10 lines 201–218. The current tree in the plan's 📍-current callout was enumerated from disk (Phase 2A's `services/{bio,parsers,search}`, `src/app/logic/` already exist; `components/GenomeViewer.tsx`, root `types.ts`/`index.tsx`/`index.css` still at root; `index.html` entry is `/index.tsx`).
- **Docs-only / AGPL:** every deliverable is `.md`, which `scripts/check-license-headers.mjs` treats as exempt — no header is added, and `npm run lint:headers` is run to prove no regression. The header rule itself is documented in the skill + `AGENTS.md` for the covered-file case.
- **Doorways, not copies:** SKILL.md and `AGENTS.md` summarize + link and explicitly state `ARCHITECTURE.md` wins on conflict; the `references/*.md` extracts each carry a "canonical source / if this drifts, it wins" header. The structure diagram/table appearing in both `ARCHITECTURE.md` and `references/` is deliberate per spec §6 (references hold the quick-reference aids) — behavior-preserving of the single-source model because they cite the canonical doc.
- **Phase E collision avoided:** the ownership split (Phase 0 = content; Phase E = final accuracy pass + ESLint enforcement) is stated in Global Constraints, in the `ARCHITECTURE.md` banner, and in §10 — Phase 0 does not touch `eslint.config.js`.
- **Sequencing / green:** Task 1 (canonical doc) precedes the doorways that link to it; Task 4 runs the full CI mirror. No code changes, so typecheck/lint/test/build are unaffected — a non-zero result is flagged as pre-existing, not fixed here.
- **No placeholders:** every file body is given in full; the only "match/replace" instructions (Task 1) quote exact current text with verified line anchors. Link-depth (`../../../` from SKILL.md, `../../../../` from references/) is validated by a script step, not assumed.
- **Branch/PR:** feature branch off `develop`, PR base `develop` (per repo convention; not `main`). Commits use Conventional Commits + the `Co-Authored-By` trailer.
