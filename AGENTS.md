# AGENTS.md — Dunceious

Guidance for coding agents (Codex, Copilot, Gemini, and others). This is a **pointer**, not the
source of truth. The canonical architecture reference is **[`ARCHITECTURE.md`](ARCHITECTURE.md)**;
read it before moving code. Claude Code users also have the `dunceious-architecture` skill under
`.claude/skills/`, which links to the same document.

Dunceious is a client-side genome-viewer SPA (React 19 + TypeScript, Vite, Web Workers, d3,
react-window). Source is organized under `src/` into four layers.

## Scientific rigor (first priority)

Scientists treat Dunceious results as evidence. Anything that computes or displays a biological
result must:
- use established, published methods with standard defaults, verified against a widely used
  reference implementation or standard and cited (the original paper isn't required);
- invent nothing and approximate nothing silently;
- define every number shown;
- be validated against an independent oracle (a reference tool or a separate textbook
  implementation);
- give the same result on every machine and build;
- keep sequences local.

Full rigor applies to what produces or shows a scientific result. Changes that leave results
unchanged follow the normal engineering bar.

The full rule is in [`CLAUDE.md`](CLAUDE.md#scientific-rigor-first-priority).

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
`src/workers/protocol.ts`. Never add a duplicate type. Full rules, the layer tree, and worked
"where does X go" examples are in [`ARCHITECTURE.md`](ARCHITECTURE.md) §2.

## License headers (required, enforced)

Dunceious is **AGPL-3.0-or-later**. Every covered source file (`.ts .tsx .js .mjs .cjs .css`,
`.html .svg`, `.py .yml .yaml .sh`, `.gitignore`) MUST begin with the project's AGPL header (copy
it from any existing source file, e.g. `vite.config.ts`). `.md`, `.json`, and binary assets are
exempt. `npm run lint:headers` enforces this in CI; auto-insert with
`node scripts/check-license-headers.mjs --fix`. See [`CLAUDE.md`](CLAUDE.md) for the full rule.

## Pushes and Cloudflare Pages builds

Every push can trigger a Cloudflare Pages build. Batch pushes and follow the `[CF-Pages-Skip]` rules in [`CLAUDE.md`](CLAUDE.md#pushes-and-cloudflare-pages-builds).

## Before you claim done

`npm run typecheck` · `npm run lint` · `npm run test` · `npm run build` · `npm run lint:headers` — all green.

## Project documents

Track durable documentation and historical design specs. Commit specs in `docs/specs/`
as `YYYY-MM-DD-<area>-<topic>.md` with YAML front matter; follow
[`docs/specs/README.md`](docs/specs/README.md) for metadata and lifecycle. Keep implementation
plans, review/IAR ledgers, handoffs and session notes untracked in `.code/docs/<task>/`
at the primary repository root. Put outcomes and verification evidence in the PR description
or comments; fold lasting decisions, invariants and limitations into the living docs.
