---
name: dunceious-architecture
description: Use when working in the Dunceious genome-viewer codebase and deciding where code belongs — its folder structure, the layered architecture (domain ← core ← workers/handlers ← app), the layer import rules, "where do I put…", or how to add a parser, a worker message type, a UI component, or a domain algorithm. Points to ARCHITECTURE.md as the canonical source.
---

# Dunceious Architecture

**Canonical source:** [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) at the repo root. This skill
is a thin doorway — it summarizes and links; it never restates the rules in full. If anything
here disagrees with `ARCHITECTURE.md`, **`ARCHITECTURE.md` wins.**

Dunceious is a client-side genome-viewer SPA (React 19 + TypeScript, Vite, Web Workers, d3,
react-window). Source is organized under `src/` into four layers; imports only point **down**:

```
domain  ←  core  ←  workers/handlers  ←  app
```

- **`src/domain/bio`** — pure biology model + algorithms; imports nothing outside `domain`.
- **`src/core`** — pure format/search logic (the renamed `services/`); imports `domain` only.
- **`src/workers`** — typed `protocol` + thin worker shells + `handlers/` bodies; import `core` + `domain`.
- **`src/app`** — the React app; may import anything below it. All React/DOM/browser I/O lives here.

## Quick answers

- **The layer tree + per-layer purpose** → [`references/structure.md`](references/structure.md)
- **The import rules + one-canonical-type-home** → [`references/import-rules.md`](references/import-rules.md)
- **"Where does X go?" (parser / worker message / UI component / domain algorithm), with worked examples** → [`references/where-does-x-go.md`](references/where-does-x-go.md)
- **Everything, in depth** → [`ARCHITECTURE.md`](../../../ARCHITECTURE.md)
- **Why the restructure + the phase plan** → [`docs/superpowers/specs/2026-07-02-architecture-restructure-design.md`](../../../docs/superpowers/specs/2026-07-02-architecture-restructure-design.md)

## Non-negotiables

- **License headers:** every covered source file (`.ts .tsx .js .mjs .cjs .css`, plus `.html .svg .py .yml .yaml .sh`, `.gitignore`) must start with the AGPL header. `.md`/`.json`/binaries are exempt. `npm run lint:headers` enforces; auto-fix with `node scripts/check-license-headers.mjs --fix`. See the repo `CLAUDE.md`.
- **One home per type:** model types in `src/domain/bio/types.ts`; wire contracts in `src/workers/protocol.ts`. Never add a duplicate `SearchResult` / `SearchOptions` / FASTA-record shape.
- **Green after every change:** `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.
