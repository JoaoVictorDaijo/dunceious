# Architecture Restructure — Design

**Date:** 2026-07-02
**Status:** Approved (direction locked with maintainer; per-phase plans to be refined in dedicated sessions)
**Scope:** Unify the codebase under `src/` into an honest layered architecture, remove
duplication/dead code, decompose the oversized `GenomeViewer`, close high-value JSDoc gaps,
and encode the architecture as an agent-facing skill.

> This spec is the **north star**. Each phase below has its own detailed plan under
> `docs/superpowers/plans/2026-07-02-arch-phase*.md`. The maintainer will hand individual
> phases to separate sessions to deep-dive and execute. Nothing here is executed by the
> authoring session.

---

## 1. Context — where Dunceious stands today

Dunceious is a client-side genome-viewer SPA (~9.5k lines of source: React 19 + TypeScript,
Vite, Web Workers, d3, react-window). The **conceptual** architecture is already sound and
well-tested (252 tests, ratcheted coverage gate). The problem is **physical**: the code is
split across two worlds that don't agree on where anything lives.

| World | Holds | Problem |
|---|---|---|
| Repo root | `components/GenomeViewer.tsx`, `services/`, `types.ts`, `index.tsx`, `index.css` | "services" is a misnomer (pure functions, not I/O clients); `types.ts` is a dead shim |
| `src/` | `app/`, `domain/bio/`, `workers/` | The canonical layer (types, domain, worker protocol) migrated here; implementations were left at root |

**The core structural smell:** root `services/` and `src/` reference each other
bidirectionally. `src/workers/bioWorker.ts` imports *down* into `services/bio/handleBioMessage.ts`,
which imports *back up* into `src/domain/bio` and `src/workers/protocol`. A single bio
operation crosses the root↔`src` boundary three times. And `services/search/*` imports the
worker `protocol` — a layer inversion (pure logic depending on the worker contract). These
aren't two layers; they're **one layer arbitrarily cut in half** by an unfinished migration.

The pristine part: `src/domain/bio/` imports nothing but itself and is the canonical home of
the types. It anchors the target structure.

## 2. Locked decisions

1. **Layered structure under `src/`** (not feature-first) — the app is essentially one big
   feature (the viewer), so grouping by technical role is the natural fit.
2. **Functions, not classes** — the "many one-function files" get grouped into a few cohesive
   pure-function modules behind barrels. No classes/namespaces for stateless utilities
   (they add ceremony and defeat tree-shaking).
3. **Incremental phased PRs** — each PR independently green (`typecheck` + `lint` + tests +
   `build`), mirroring the successful Phase 0–6 and Phase 2A approach.
4. **Pure-logic layer named `src/core/`** (renamed from `services/`).
5. **GenomeViewer decomposition is in-scope** as its own multi-PR phase (Phase D).
6. **Keep a full `ARCHITECTURE.md`** for human readers **and** make the architecture
   agent-consumable across tools (Claude skill + Codex `AGENTS.md` + others) via a single
   canonical rules source. See §6.

## 3. Target structure

```
src/
├── domain/bio/          # Pure biology model + algorithms. Imports NOTHING outside domain.
│   ├── types.ts         # Canonical types (+ coordinate-convention docs)
│   ├── coordinate.ts    # transposition, aligned-segment building
│   ├── consensus.ts
│   ├── intervals.ts     # clip/split/wrap — owns the ONE clipInterval; splitWrapAround adopted
│   ├── sequence.ts      # NEW: reverseComplement, translate+GENETIC_CODE, molecule-type
│   │                    #      detection, gap↔ungapped mapping, sessionMoleculeType
│   └── index.ts         # barrel
│
├── core/                # Pure format/search logic (was `services/`). Imports domain only.
│   ├── genbank/         # read sub-parsers (existing) + serialize.ts (exportToGenBank)
│   ├── formats/         # fasta.ts (parse + exportToFasta), annotations.ts (BED/GFF3/BedGraph + exportToGff)
│   └── search/          # query.ts (degenerate→regex), align.ts (smithWaterman),
│                        #   exact.ts, fuzzy.ts — pure primitives, NO protocol import
│
├── workers/             # Thin shells + typed contracts + worker bodies.
│   ├── protocol.ts      # message contracts (may reference domain types)
│   ├── bio.worker.ts / search.worker.ts    # thin shells
│   └── handlers/
│       ├── bio.ts       # handleBioMessage (was services/bio) — orchestrates core + domain
│       └── search.ts    # runSearch + collectSeededFuzzyHits (was services/search/runSearch)
│
└── app/                 # The React application. May import everything below it.
    ├── main.tsx + index.css   # entry (moved from root; index.html updated)
    ├── App.tsx          # composition root
    ├── logic/           # pure reducers/view-model (+ recordRemoval, runInlineSearch)
    ├── hooks/
    ├── components/      # modals, panels, nav, sidebar + SessionCrossfade (dedup)
    ├── viewer/          # GenomeViewer decomposed (from root components/)
    │   ├── GenomeViewer.tsx   # slim container
    │   ├── layout.ts          # pure layout engine (testable, no React)
    │   ├── tracks/            # SequenceTrack, ConservationTrack, QuantitativeTrack
    │   ├── Minimap.tsx
    │   ├── useViewport.ts / useSelectionDrag.ts
    │   └── colors.ts          # display palette (from bioUtils — it's presentation)
    └── lib/download.ts  # downloadBlob (the one DOM-coupled fn, out of core)
```

Root keeps only true root things: configs, `index.html`, `docs/`, `bench/`, `perf/`,
`scripts/`, `.github/`. **`components/`, `services/`, `types.ts` at root all disappear.**

## 4. Layer import rules (the contract; ESLint-enforceable)

```
domain  ←  core  ←  workers/handlers  ←  app
```

1. `src/domain/**` imports **only** `domain`. No DOM, no React, no core/workers/app.
2. `src/core/**` imports `domain` **only**. Never workers, app, React, or DOM.
   (Fixes today's `core → workers/protocol` inversion by relocating worker bodies to
   `workers/handlers/`.)
3. `src/workers/**` imports `core` + `domain` + own `protocol`.
4. `src/app/**` may import anything below it. All React + DOM + browser I/O lives here.
5. **One canonical home per type:** model types in `domain/bio/types.ts`; wire contracts in
   `workers/protocol.ts` (referencing domain types). No duplicate `SearchResult` /
   `SearchOptions` / FASTA-record shapes.
6. Enforce with an import-boundary ESLint rule (`eslint-plugin-boundaries` or
   `import/no-restricted-paths`) plus the existing `max-lines` / `max-lines-per-function`
   guards (flip to `error` once Phase D lands `GenomeViewer` under 600 lines).

## 5. Debt inventory (drives the phases)

**Duplication:**
- `reverseComplement` — byte-identical in `services/bioUtils.ts:321` and `services/searchLogic.ts:73`.
- Molecule-type detection — 4 divergent impls with 3 different protein alphabets:
  `services/moleculeType.ts:33`, `useFileHandlers.ts:47` + `:37`, `genbank/headerParser.ts:64`;
  plus a JSDoc/code alphabet mismatch at `useFileHandlers.ts:45`.
- Non-gap segment extraction — same algorithm as `getNonGapSegments` (`searchLogic.ts:84`)
  and `buildAlignedSegments` (`coordinate.ts:54`).
- `clipInterval` — **name collision, different semantics**: `bioUtils.ts:344` (clips + rebases
  local) vs `intervals.ts:28` (clips, absolute). Bug trap.
- "is-protein session" computed 3× (`viewModel.ts:98`, `useSearchWorker.ts:104`,
  `useFileHandlers.ts:91`).
- Duplicate types: `SearchResult` (`searchLogic.ts:25` vs `domain/bio/types.ts:81`),
  `SearchOptions` (`protocol.ts:123` vs `useSearchWorker.ts:32`), FASTA aligned-record `Pick`
  (`protocol.ts:90` vs `bioResponse.ts:24`).
- `brokenFeatureMap` memo duplicated within `GenomeViewer.tsx:150` and `:642`; CDS/ORF filter
  literal `['CDS','ORF','orf','cds']` 3× in the same file.

**Dead code (verify zero refs, then delete):** `AlignmentParams` / `AlignmentMode` /
`DEFAULT_PARAMS` / `WorkflowStep` (vestigial MAFFT/MUSCLE), `ProjectState`; `splitWrapAround`
(only its own test — adopt it over the 2 inline copies rather than delete); the `bioUtils`
`makeUniqueId` re-export; the root `types.ts` shim.

**`bioUtils.ts` (430 lines) is a grab-bag** of 5 concerns → split: translation/CDS,
display colors (→ app, presentation), format serializers (→ core), browser `downloadBlob`
(→ app), selection slicing.

**`GenomeViewer.tsx` (2190 lines, zero doc comments)** — decompose into `layout.ts` (pure) +
`tracks/` + `Minimap` + `useViewport` + `useSelectionDrag`; kill the render-path `any`
(`recordLayouts` output is untyped).

**JSDoc gaps (highest leverage first):** `domain/bio/types.ts` field docs (the coordinate
model — 0-based half-open, `start>end` = circular wrap, `alignedSequence` vs `sequence`);
`searchLogic` gap/coordinate helpers; `core/formats/annotations` coordinate systems (BED
0-based vs GFF3 1-based→0-based); `recordRemoval` nullability; the export serializers.

**Comment-policy violations:** self-invalidating comment `GenomeViewer.tsx:1130`; refactor-
history narration in `viewModel.ts` ("Extracted verbatim from…") and mildly in
`search/exact.ts` / `runInlineSearch.ts` (keep the design rationale, trim the history);
name-restating docblocks in `annotations.ts`.

**Doc drift:** `ARCHITECTURE.md` references `uniquifyId()` (renamed to `makeUniqueId`) and
calls the modular structure "complete."

## 6. Cross-agent architecture guidance (single source, three doorways)

To serve maintainers using different agents (Claude Code, Codex, others), keep **one canonical
rules document** and have every front-end point at it:

- **Canonical source:** `ARCHITECTURE.md` (full, human-readable) — kept and reconciled with
  reality. It carries the layer taxonomy, import rules, "where does X go" guide, and
  conventions.
- **Claude skill:** `.claude/skills/dunceious-architecture/SKILL.md` — a thin, trigger-rich
  entrypoint ("architecture", "folder structure", "where do I put…", "add a parser/worker/
  component") that summarizes the rules and links to `ARCHITECTURE.md` for depth. `references/`
  holds the structure diagram + import-rules table + worked examples.
- **Codex / generic agents:** root `AGENTS.md` — a short pointer file (Codex's convention)
  that references `ARCHITECTURE.md` and the layer rules.

The rules live in exactly one place; the skill and `AGENTS.md` are doorways, not copies, so
they can't drift apart. Phase 0 builds all three.

## 7. Phases (each = its own plan + PR series)

| Phase | Plan file | Summary | Depends on |
|---|---|---|---|
| **0** | `…arch-phase0-architecture-skill.md` | Build the skill + `AGENTS.md` + reconcile `ARCHITECTURE.md` (the north star) | — |
| **A** | `…arch-phaseA-dedupe-deadcode.md` | Dead-code deletion, type-dedup, name-collision fix, local dups — **no new modules** | — |
| **B** | `…arch-phaseB-domain-sequence.md` | Create `domain/bio/sequence.ts`; consolidate sequence primitives (reverseComplement, molecule-type, gap-mapping, translate) | A |
| **C** | `…arch-phaseC-core-relocation.md` | `services/` → `src/core/`; move worker bodies to `workers/handlers/` (fix inversion); split `bioUtils`; move DOM/presentation to `app/`; kill `types.ts` shim; normalize `@/` paths | B |
| **D** | `…arch-phaseD-viewer-decomposition.md` | `GenomeViewer` → `src/app/viewer/` decomposed (pure `layout.ts` + `tracks/` + `Minimap` + hooks); type the render path | C |
| **E** | `…arch-phaseE-docs-enforcement.md` | High-value JSDoc, comment-policy fixes, `ARCHITECTURE.md` reconcile, flip ESLint size guard to error + add boundary rule | C, D |

Ordering rationale: A shrinks the surface and removes the `clipInterval` bug trap before B
consolidates primitives; B establishes `domain/bio/sequence.ts` before C relocates everything
into `core/`; D moves the viewer after C so it imports final paths; E documents/enforces last
(though the highest-value `domain/bio/types.ts` coordinate docs may be pulled forward into B).
Phase 0 has no code dependency and should be written first as the target reference. A/B and the
docs work parallelize well across sessions.

## 8. Global constraints (apply to every phase)

- **Behavior-preserving** unless a phase explicitly changes behavior. Moves are verbatim
  (add/adjust `export` + imports only). If a test can't pass, recompute from source; if the
  code is genuinely wrong, STOP and report — do not weaken tests or silently "fix" logic.
- **AGPL header** on every new covered source file (copy from an existing file; `.md` is
  exempt). `npm run lint:headers` enforces.
- **CI mirror after each task:** `npm run typecheck`, `npm run lint`, `npm run test` (or
  `test:coverage`), `npm run build` — all green (`build` passing proves the worker/Vite
  wiring survives moves).
- **Coverage ratchet:** the gate `include` follows code as it moves (`services/**` →
  `src/core/**`); re-baseline thresholds a few points below achieved (raise, never lower).
- **One canonical type home**; no new duplicate type declarations.
- **RTK note:** if `vitest`/tool output looks garbled, prefix with `rtk proxy`.

## 9. Success criteria

- No source at repo root except configs/`index.html`; no `services/`, `components/`,
  `types.ts` at root.
- ESLint import-boundary rule passes; `max-lines` flipped to `error` at 600 with no violations.
- Zero duplicate implementations of `reverseComplement` / molecule-type detection / non-gap
  segments; one `clipInterval`; one `SearchResult` / `SearchOptions` / FASTA-record type.
- `GenomeViewer.tsx` < 600 lines; no `any` on its render path.
- `domain/bio/types.ts` documents the coordinate model; the flagged comment-policy violations
  are gone.
- The architecture skill + `AGENTS.md` exist and match a reconciled `ARCHITECTURE.md`.
- Test count and coverage ≥ current at every merge.
