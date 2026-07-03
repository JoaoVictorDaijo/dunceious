# AGENTS.md — Dunceious

Guidance for coding agents (Codex, Copilot, Gemini, and others). This is a **pointer**, not the
source of truth. The canonical architecture reference is **[`ARCHITECTURE.md`](ARCHITECTURE.md)**;
read it before moving code. Claude Code users also have the `dunceious-architecture` skill under
`.claude/skills/`, which links to the same document.

Dunceious is a client-side genome-viewer SPA (React 19 + TypeScript, Vite, Web Workers, d3,
react-window). Source is organized under `src/` into four layers.

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

## Before you claim done

`npm run typecheck` · `npm run lint` · `npm run test` · `npm run build` · `npm run lint:headers` — all green.
