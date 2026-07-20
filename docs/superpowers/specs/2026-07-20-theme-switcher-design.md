# Theme framework + switcher — design

**Date:** 2026-07-20 · **Branch:** `feat/theme-switcher` (off `feat/env-accent-design`) · **Status:** approved

Supersedes the "pick one treatment" plan from the environment-accent round: instead of choosing
a single chrome style now, ship a theme framework and expose the shortlisted styles as a user
setting in the Options popover. The final default can be chosen later by pruning the registry.

## Decisions locked in

| Decision | Ruling |
| --- | --- |
| Theme scope | A theme = **chrome style + palette** (not full app theming) |
| Style shortlist (7) | `clean` (default) · `layered-light` · `aurora` · `conic` · `light-shaft` (Prism Shafts) · `duotone-drift` · `mesh-grain` — Light Beam and Underglow Rail dropped |
| Edge bleed | **Removed everywhere.** No `.edge-strip` / `.hub-edge` / `envEdgeGradient` wash on or over a working surface, in any theme |
| Palette retunes | Both approved: sky `--env3` `#6366f1` → `#0d9488` (teal); protein `--env` `#8b5cf6` → `#a78bfa` (WCAG AA fix) |
| Persistence | `localStorage`, per-user, per-device |
| Approach | **B** — TS palette registry as single source of truth + static per-style CSS referencing CSS custom properties |

## Governing rule (amended)

> **The environment accent lives in the FRAME, never on the DATA — and never bleeds past it.**

The accent may touch only:

- the dark chrome — the top nav (header) and the status bar (footer), each gradient rendered
  through exactly one `.hf-env` layer clipped by `overflow: hidden`;
- the Hub's non-data backdrop (the cream area around the table card, e.g. the amber tint).

The former third clause — a thin accent edge strip at the chrome-to-canvas boundary — is
**revoked**. The prototype `.edge-strip` / `.hub-edge` elements do not get ported, and the
first-pass `envEdgeGradient` strips in the app are deleted, not replaced.

## Model

```ts
type EnvKey = 'nucleotide' | 'protein' | 'hub';

interface EnvPalette {
  env: string;   // primary accent (also tints TS-side text/icons, e.g. the helix mark)
  env2: string;  // secondary pool used by gradient styles
  env3: string;  // tertiary pool used by gradient styles
}

interface Theme {
  key: ThemeKey;              // the 7 keys above
  label: string;              // display name in the picker
  palette: Record<EnvKey, EnvPalette>;
}
```

V1: all 7 themes reference one shared `DEFAULT_PALETTE` constant (with the approved retunes).
The per-theme `palette` field exists so future themes can diverge without reworking the
framework. `DEFAULT_THEME = 'clean'`.

## Architecture (all app layer)

- **`src/app/logic/theme.ts`** — the registry (`THEMES`, `DEFAULT_THEME`, `DEFAULT_PALETTE`),
  the `Theme`/`EnvPalette` types, and pref persistence (`getThemePref` / `setThemePref`)
  following the `clearConfirmationPref.ts` pattern. All accent color tokens live here —
  single home.
- **`src/app/logic/environment.ts`** — keeps `resolveEnvAccent` (pure which-environment
  logic) and the env key types; stops owning hex/rgb values. `ENV_LAYERS`' color fields and
  `envEdgeGradient` are removed; call sites read colors from the active theme instead.
- **`src/app/themes.css`** — new stylesheet (AGPL header) holding the ported per-style CSS
  from `docs/design/prototypes/gradient-frame-styles.html`, scoped under
  `[data-theme="<key>"]`. Gradients reference only `var(--env)`/`var(--env2)`/`var(--env3)`
  — no hardcoded palette hexes. Animated styles wrap their motion in
  `@media (prefers-reduced-motion: no-preference)`; the static gradient still renders when
  motion is reduced. The OS reduced-motion setting always beats the theme choice.
- **App root** (`App.tsx`) — carries `data-theme={themeKey}` and `data-env={envAccent}`, and
  sets `--env`/`--env2`/`--env3` inline from the active theme's palette for the resolved
  environment (`data-env="none"` sets no vars; `clean`'s `.hf-env` stays `background: none`).
- **Chrome components** (`TopNav.tsx`, `StatusBar.tsx`) — each gains one `.hf-env` layer div
  inside an `overflow: hidden` container; the existing `envEdgeGradient` strips are removed.
  TS-side tinting (wordmark, section labels) reads the active theme's `palette[env].env`.
- **`OptionsPanel.tsx`** — new **Theme** section between Feature Colors and Workspace: a
  radio list of the 7 labels, Clean first, selection applied and persisted immediately.

### Data flow

`getThemePref()` on mount → `themeKey` state in `App` → passed to `OptionsPanel` (same
prop pattern as `skipClearAllConfirmation`) → `setThemePref` on change → root attributes +
CSS vars re-render → static CSS does the rest.

## Error handling

- Stored pref missing, unknown, or from a removed theme → fall back to `DEFAULT_THEME`
  (Clean) silently; next explicit selection overwrites the stale value.
- `localStorage` unavailable (private mode, embedding) → in-memory default, no crash —
  same guard shape as `clearConfirmationPref.ts`.

## State model (unchanged)

`resolveEnvAccent` precedence is untouched: null session → `none` (Hub is **not** amber with
no file loaded); Hub tab → `hub`; otherwise the molecule's own environment.

## Testing

- **Unit:** pref round-trip incl. unknown-key fallback and no-`localStorage` guard
  (mirroring `clearConfirmationPref` tests); registry integrity (7 unique keys, default
  present, complete palettes per env); env→CSS-var mapping incl. `none`.
- **Visual:** Playwright CLI pass over the 3 sessions × 2 modes matrix for at least Clean,
  Layered Light, and one animated style (Aurora); explicit check that no accent paints over
  the white viewport canvas or Hub table card (the bleed regression).
- **Suite:** `npm run typecheck`, `lint`, `test`, `build`, `lint:headers` all green.

## Docs

- `docs/design/README.md`: record the amended governing rule, the shortlist, and mark
  backlog items 1–3 resolved. Prototypes stay untouched as the design record.
- Token values in prototypes are NOT retro-edited; the registry is now the source of truth.

## Out of scope

- Full app theming (surfaces, text, feature colors) — feature colors remain their own
  Options section.
- Per-project theme persistence (project-file schema untouched).
- Porting Light Beam / Underglow Rail — they remain prototype-only.
- Choosing the final shipped default beyond Clean — that's the point of the switcher.
