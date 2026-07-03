# Centralized App Version — Design

**Date:** 2026-07-03
**Status:** Approved (brainstorm)

## Problem

The app version is duplicated across five hardcoded string literals in three files plus `package.json`, all hand-maintained — and they have already drifted. The init banner shows `v3.3` while the footer and export stamps show `v3.4` and `package.json` is `3.4.0`.

Inventory:

| Location | Current literal | Role |
|---|---|---|
| `package.json:4` | `"version": "3.4.0"` | canonical npm version |
| `src/app/hooks/useAppLogger.ts:33` | `Dunceious Pro v3.3 [Unified Workspace] …` | init banner (**stale**) |
| `src/app/components/StatusBar.tsx:32` | `Dunceious v3.4` | footer |
| `src/app/hooks/useFileHandlers.ts:278` | `version: '3.4'` | exported selection JSON provenance |
| `src/app/hooks/useFileHandlers.ts:330` | `version: '3.4'` | exported project JSON provenance |

The two export stamps are **write-only provenance**: verified that the project-import path (`useFileHandlers.ts:236`) parses the JSON and reads only `project.records` — nothing reads `.version`. So they are not a functional file-schema version and can safely track the app version.

## Goal

One source of truth for the app version so these strings can never diverge again. Scope is the version **number** only; surrounding branding text is left untouched.

## Decision — source of truth

`package.json` `version` is the single source. `vite.config.ts` reads it and injects it at build time as a compile-time global `__APP_VERSION__`; every UI/provenance string references that constant. Bumping is `npm version patch|minor|major` (updates `package.json` and creates a matching `vX.Y.Z` git tag for free).

The current value flows through unchanged: `3.4.0` → rendered `v3.4.0` everywhere (which fixes the stale `v3.3` banner). No hardcoded version number remains in `src/`.

**Rejected alternatives:**
- **Git tags via `git describe` at build** — Cloudflare Pages may shallow-clone without tags, so the build can't reliably see them; and no tags exist yet. (A future `npm version` bump does create tags, so this path stays open later without depending on it at build.)
- **Generated `src/version.ts` prebuild script** or **`import.meta.env.VITE_*`** — more moving parts than a `define` global for no benefit here.

## Design

### 1. Injection (build)
- `vite.config.ts`: import `version` from `./package.json` and add to `define`:
  ```js
  define: { __APP_VERSION__: JSON.stringify(pkg.version) }
  ```
  Reading `package.json` in the Vite config is fine (`with { type: 'json' }` import, or read+parse); the value is baked into the bundle as a string literal at build.
- `vite-env.d.ts`: add `declare const __APP_VERSION__: string;` so TypeScript knows the global.
- **Test environment:** the consumers are imported by Vitest tests. The `define` must also apply under Vitest (it shares the Vite pipeline via `vite.config.ts` / `vitest.shared.ts`) so `__APP_VERSION__` resolves in tests; if the test config does not inherit `define`, add it there too. Implementation must confirm `npm run test` stays green (no `__APP_VERSION__ is not defined`).

### 2. Consumers (number only; surrounding text unchanged)
- `useAppLogger.ts:33` → `` `Dunceious Pro v${__APP_VERSION__} [Unified Workspace] initialized. Ready for research.` ``
- `StatusBar.tsx:32` → `` `Dunceious v${__APP_VERSION__}` `` inside the existing `<span>`
- `useFileHandlers.ts:278` and `:330` → `version: __APP_VERSION__`

### 3. Display format
Full semver from `package.json` (`3.4.0`), keeping the `v` prefix where the existing text already had one.

## Out of scope (this change)
- Product-name / branding reconciliation ("Pro" / "[Unified Workspace]" vs plain "Dunceious") — left as-is by decision.
- No version bump is performed here; this only centralizes. (Bumping later = `npm version`.)
- No CI guard test against re-introduced hardcoded literals — the single constant already prevents drift; can be added later if desired.

## Testing / verification
- `npm run build` green; the built bundle contains `3.4.0` at the injection sites.
- `npm run test` green (518 tests; confirm `__APP_VERSION__` resolves under Vitest).
- `grep -rnE 'v?3\.[0-9]' src/` shows no remaining hardcoded app-version literal (excluding the AGPL "version 3 of the License" header text).
- Functional smoke: init-log banner and footer both render `v3.4.0`; an exported project JSON carries `"version": "3.4.0"`.

## Notes
- No new source files (edits only) → no AGPL headers to add. (A `version.ts` module would need the header, but this design does not introduce one.)
- Lands on `feat/centralized-app-version` → PR into `develop` (separate from the in-flight `develop→main` promotion PR #61).
