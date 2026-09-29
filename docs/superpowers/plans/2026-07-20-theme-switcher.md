# Theme Framework + Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-selectable theme (chrome gradient style + accent palette) to the Options popover, backed by a small framework, so the seven shortlisted env-accent styles can be swapped at runtime until a final default is chosen — and remove the accent edge-bleed onto the viewport/hub working surfaces.

**Architecture:** Approach B — a TypeScript palette registry (`theme.ts`) is the single source of truth for the accent tokens; React sets `--env`/`--env2`/`--env3` custom properties inline on the app root for the resolved environment and a `data-theme` attribute for the chosen style; static CSS (`themes.css`) holds the seven ported style blocks, each scoped under `[data-theme="<key>"]` and referencing only those vars. The gradient renders exclusively through two `.hf-env` layers clipped inside the header (`<nav>`) and footer (status bar). The old edge strips are deleted.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind (utility classes), CSS custom properties + `@property`, Vitest, Playwright CLI (visual verification). Branch: `feat/theme-switcher`.

---

## Background the executor must know

- **Governing rule (amended):** the environment accent lives in the FRAME (header + footer chrome, and the Hub's non-data backdrop) and **never bleeds onto a working surface**. The prototype's `.edge-strip`/`.hub-edge` boundary strips are **not** ported; the two `envEdgeGradient` strips currently in the app are **deleted**.
- **The seven styles** and their `data-theme` keys: `clean` (default), `layered-light`, `aurora`, `conic`, `light-shaft` (labelled "Prism Shafts"), `duotone-drift`, `mesh-grain`. (`beam`/"Light Beam" and `underglow-rail` are intentionally excluded.)
- **Palette retunes (both approved, already live in the prototype tokens):** nucleotide `--env3` = `#0d9488` (teal, was indigo `#6366f1`); protein `--env` = `#a78bfa` (was `#8b5cf6`, which failed WCAG AA on the chrome). These are the shipped values.
- **The port source of truth** is `docs/design/prototypes/gradient-frame-styles.html`. Every CSS rule below was transcribed from it, applying ONE mechanical selector map:

  | Prototype selector | `themes.css` selector | Meaning |
  | --- | --- | --- |
  | `[data-hfstyle="KEY"] .hf-env` | `[data-theme="KEY"] .hf-env` | both bars |
  | `[data-hfstyle="KEY"] .nav .hf-env` | `[data-theme="KEY"] .app-nav .hf-env` | header only |
  | `[data-hfstyle="KEY"] .status .hf-env` | `[data-theme="KEY"] .app-status .hf-env` | footer only |

  Layout/mode rules from the prototype (`.app[data-tab=…]`, `.mcell`, `.edge-strip`, `.mode-*`) are **not** ported — that behaviour already lives in the React/Tailwind chrome.
- **Resolved spec inconsistency (`data-env="none"`):** the design doc said "none sets no vars", but the prototype ships a deliberate luminance-matched **neutral** family for the no-session state (see its lines 86–101). This plan ships **neutral vars** for `none` (grays `#929ba8 / #b8bec7 / #6e7684`), so the helix/labels sit neutral when empty and bloom to the molecule colour on load. The `@property` initial values remain the sky defaults as a pre-hydration fallback only.
- **`data-theme` collision check:** the prototype's demo page uses `:root[data-theme="light|dark"]` for its own light/dark page chrome. Our app is dark-only and never sets that; we set `data-theme` = the style key on the **app root div** (not `:root`). No collision. (Verify during Task 3 that nothing else sets `data-theme`.)

---

## File Structure

**Create:**
- `src/app/logic/theme.ts` — palette + theme registry, `EnvPalette`/`Theme`/`ThemeKey` types, `THEMES`, `DEFAULT_THEME_KEY`, `DEFAULT_PALETTE`, `getTheme`, `resolveThemeVars`, `readThemePref`, `writeThemePref`. Single source of truth for accent tokens.
- `src/app/logic/__tests__/theme.test.ts` — registry integrity, `resolveThemeVars`, persistence round-trip.
- `src/app/themes.css` — `@property` machinery, `.hf-env` containment, the seven `[data-theme]` style blocks, reduced-motion gates. AGPL header required.

**Modify:**
- `src/app/main.tsx` — import `./themes.css`.
- `src/app/App.tsx` — theme state from pref; root `data-theme`/`data-env`/`app-root` class + inline vars; delete the bottom edge strip; thread `themeKey`/`onSetThemeKey` to `TopNav`; drop the `envAccent` prop to `Sidebar`; trim the `environment` import.
- `src/app/components/TopNav.tsx` — `app-nav` class + header `.hf-env` layer + content wrapper; helix uses `var(--env)`; delete the bottom edge strip; new `themeKey`/`onSetThemeKey` props passed to `OptionsPanel`; trim imports.
- `src/app/components/StatusBar.tsx` — `app-status` wrapper + footer `.hf-env` layer + content wrapper.
- `src/app/components/Sidebar.tsx` — drop `envAccent` prop + `envAccentColor` import; section labels use `var(--env)`.
- `src/app/components/OptionsPanel.tsx` — new **Theme** section (radio list of the seven themes) between Feature Colors and Workspace.
- `src/app/logic/environment.ts` — slim to `resolveEnvAccent` + `EnvAccentKey`; remove `ENV_LAYERS`, `EnvLayer`, `envLayer`, `envAccentColor`, `envEdgeGradient`.
- `src/app/logic/__tests__/environment.test.ts` — drop the removed-API cases; keep `resolveEnvAccent`.
- `docs/design/README.md` — record the amended rule, the shortlist, mark backlog items 1–3 resolved.

---

## Task 1: Theme registry + palette (`theme.ts`)

**Files:**
- Create: `src/app/logic/theme.ts`
- Test: `src/app/logic/__tests__/theme.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/logic/__tests__/theme.test.ts` (copy the AGPL header block verbatim from `src/app/logic/clearConfirmationPref.ts` lines 1–18, then):

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  THEMES,
  THEME_KEYS,
  DEFAULT_THEME_KEY,
  DEFAULT_PALETTE,
  getTheme,
  resolveThemeVars,
  readThemePref,
  writeThemePref,
} from '../theme';

const KEY = 'dunceious.theme';

function makeStorage(seed?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    store,
  };
}
function stubWindow(storage: ReturnType<typeof makeStorage>) {
  vi.stubGlobal('window', { localStorage: storage });
}

describe('theme registry', () => {
  it('ships exactly the seven shortlisted keys, clean first', () => {
    expect(THEME_KEYS).toEqual([
      'clean', 'layered-light', 'aurora', 'conic', 'light-shaft', 'duotone-drift', 'mesh-grain',
    ]);
  });

  it('default is clean and present in the registry', () => {
    expect(DEFAULT_THEME_KEY).toBe('clean');
    expect(THEMES.some(t => t.key === DEFAULT_THEME_KEY)).toBe(true);
  });

  it('every theme has a non-empty label and unique key', () => {
    const keys = THEMES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of THEMES) expect(t.label.length).toBeGreaterThan(0);
  });

  it('the palette covers all four environments with three hex tokens each', () => {
    for (const env of ['nucleotide', 'protein', 'hub', 'none'] as const) {
      const p = DEFAULT_PALETTE[env];
      for (const slot of ['env', 'env2', 'env3'] as const) {
        expect(p[slot]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it('ships the approved retunes (sky teal env3, protein a78bfa)', () => {
    expect(DEFAULT_PALETTE.nucleotide.env3).toBe('#0d9488');
    expect(DEFAULT_PALETTE.protein.env).toBe('#a78bfa');
  });

  it('resolveThemeVars maps the resolved env to the three CSS custom properties', () => {
    expect(resolveThemeVars(getTheme('clean'), 'hub')).toEqual({
      '--env': '#f59e0b', '--env2': '#fbbf24', '--env3': '#f97316',
    });
  });

  it('resolveThemeVars returns the neutral family for none', () => {
    expect(resolveThemeVars(getTheme('aurora'), 'none')).toEqual({
      '--env': '#929ba8', '--env2': '#b8bec7', '--env3': '#6e7684',
    });
  });

  it('getTheme falls back to the default for an unknown key', () => {
    expect(getTheme('nonsense' as never).key).toBe(DEFAULT_THEME_KEY);
  });
});

describe('theme persistence', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the default when unset', () => {
    stubWindow(makeStorage());
    expect(readThemePref()).toBe('clean');
  });

  it('round-trips a valid key', () => {
    const storage = makeStorage();
    stubWindow(storage);
    writeThemePref('aurora');
    expect(storage.getItem(KEY)).toBe('aurora');
    expect(readThemePref()).toBe('aurora');
  });

  it('reads the default when the stored key is unknown/stale', () => {
    stubWindow(makeStorage({ [KEY]: 'removed-theme' }));
    expect(readThemePref()).toBe('clean');
  });

  it('is a no-op without a window (SSR/non-DOM)', () => {
    expect(() => writeThemePref('conic')).not.toThrow();
    expect(readThemePref()).toBe('clean');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/logic/__tests__/theme.test.ts`
Expected: FAIL — cannot resolve `../theme`.

- [ ] **Step 3: Implement `theme.ts`**

Create `src/app/logic/theme.ts` (copy the AGPL header block verbatim from `clearConfirmationPref.ts` lines 1–18, then):

```ts
import type { EnvAccentKey } from './environment';

/** One accent's three token slots. `env` also tints chrome text/icons (helix, labels). */
export interface EnvPalette {
  env: string;
  env2: string;
  env3: string;
}

export type ThemeKey =
  | 'clean' | 'layered-light' | 'aurora' | 'conic'
  | 'light-shaft' | 'duotone-drift' | 'mesh-grain';

export interface Theme {
  key: ThemeKey;
  label: string;
  /** Per-environment token sets. V1 themes all share DEFAULT_PALETTE. */
  palette: Record<EnvAccentKey, EnvPalette>;
}

/**
 * The shipped accent palette — the single source of truth for the env tokens.
 * Values are the prototype's tuned families with both approved retunes:
 * nucleotide.env3 teal (#0d9488) and protein.env #a78bfa (WCAG AA on the chrome).
 * `none` is a luminance-matched neutral family, not eyeballed grey — it keeps the
 * no-session chrome from dropping below any contrast the coloured families survive.
 */
export const DEFAULT_PALETTE: Record<EnvAccentKey, EnvPalette> = {
  nucleotide: { env: '#0ea5e9', env2: '#22d3ee', env3: '#0d9488' },
  protein:    { env: '#a78bfa', env2: '#d8b4fe', env3: '#c026d3' },
  hub:        { env: '#f59e0b', env2: '#fbbf24', env3: '#f97316' },
  none:       { env: '#929ba8', env2: '#b8bec7', env3: '#6e7684' },
};

export const DEFAULT_THEME_KEY: ThemeKey = 'clean';

export const THEMES: Theme[] = [
  { key: 'clean',         label: 'Clean',         palette: DEFAULT_PALETTE },
  { key: 'layered-light', label: 'Layered Light', palette: DEFAULT_PALETTE },
  { key: 'aurora',        label: 'Aurora',        palette: DEFAULT_PALETTE },
  { key: 'conic',         label: 'Conic Sheen',   palette: DEFAULT_PALETTE },
  { key: 'light-shaft',   label: 'Prism Shafts',  palette: DEFAULT_PALETTE },
  { key: 'duotone-drift', label: 'Duotone Drift', palette: DEFAULT_PALETTE },
  { key: 'mesh-grain',    label: 'Mesh Grain',    palette: DEFAULT_PALETTE },
];

export const THEME_KEYS: ThemeKey[] = THEMES.map(t => t.key);

const isThemeKey = (v: string | null): v is ThemeKey =>
  v !== null && THEME_KEYS.includes(v as ThemeKey);

/** The theme for a key, falling back to the default for anything unknown. */
export const getTheme = (key: ThemeKey): Theme =>
  THEMES.find(t => t.key === key) ?? THEMES.find(t => t.key === DEFAULT_THEME_KEY)!;

/** The three CSS custom properties for a theme at a resolved environment. */
export const resolveThemeVars = (
  theme: Theme,
  env: EnvAccentKey,
): Record<'--env' | '--env2' | '--env3', string> => {
  const p = theme.palette[env];
  return { '--env': p.env, '--env2': p.env2, '--env3': p.env3 };
};

const STORAGE_KEY = 'dunceious.theme';

/** The persisted theme key for this browser, or the default when unset/unknown. */
export const readThemePref = (): ThemeKey => {
  if (typeof window === 'undefined') return DEFAULT_THEME_KEY;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isThemeKey(stored) ? stored : DEFAULT_THEME_KEY;
};

/** Persist the chosen theme key (per browser). */
export const writeThemePref = (key: ThemeKey): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, key);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/logic/__tests__/theme.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Header lint + typecheck**

Run: `npm run lint:headers && npm run typecheck`
Expected: header check passes; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/logic/theme.ts src/app/logic/__tests__/theme.test.ts
git commit -m "feat(app): add theme registry + accent palette single-source-of-truth"
```

---

## Task 2: Port the seven styles into `themes.css`

**Files:**
- Create: `src/app/themes.css`
- Modify: `src/app/main.tsx:23` (add import)

- [ ] **Step 1: Create `src/app/themes.css`**

Start the file with the AGPL header as a **block comment** (`/* … */`) — copy the exact text from `src/app/index.css` lines 1–18. Then paste the following verbatim:

```css
/* ============================================================
   ENVIRONMENT ACCENT — header/footer gradient styles.
   The accent renders ONLY through the two .hf-env layers inside
   .app-nav (header) and .app-status (footer). Every rule reads the
   --env / --env2 / --env3 custom properties, which React sets on
   .app-root from the active theme's palette for the resolved env.
   Ported from docs/design/prototypes/gradient-frame-styles.html.
   ============================================================ */

@property --env  { syntax: "<color>"; inherits: true; initial-value: #0ea5e9; }
@property --env2 { syntax: "<color>"; inherits: true; initial-value: #22d3ee; }
@property --env3 { syntax: "<color>"; inherits: true; initial-value: #0d9488; }
@property --conic-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }

.app-root {
  --grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  transition: --env 650ms ease, --env2 650ms ease, --env3 650ms ease;
}

/* The containment layer. Absolutely positioned, NON-stacking-context on purpose
   so screen-blend styles composite against the bar's own dark background.
   Never wrap it in a filter/transform/isolation ancestor. */
.hf-env { position: absolute; inset: 0; overflow: hidden; pointer-events: none; transition: opacity 650ms ease; }

/* ── A · CLEAN — no wash; only the constant tinted chrome accents ── */
[data-theme="clean"] .hf-env { background: none; }

/* ── LAYERED LIGHT ── */
[data-theme="layered-light"] .hf-env {
  background-repeat: no-repeat;
  background-blend-mode: screen;
  background-position: 0 0, 0 0, 0 0;
  animation: layered-light-drift 54s ease-in-out infinite;
}
[data-theme="layered-light"] .app-nav .hf-env {
  background-image:
    radial-gradient(64% 165% at 13% -30%, color-mix(in srgb, var(--env2) 46%, transparent) 0%, color-mix(in srgb, var(--env2) 15%, transparent) 40%, transparent 70%),
    radial-gradient(52% 140% at 88% -6%, color-mix(in srgb, var(--env3) 38%, transparent) 0%, color-mix(in srgb, var(--env3) 12%, transparent) 44%, transparent 74%),
    radial-gradient(96% 130% at 52% 145%, color-mix(in srgb, var(--env) 22%, transparent) 0%, transparent 66%);
}
[data-theme="layered-light"] .app-status .hf-env {
  background-image:
    radial-gradient(58% 150% at 15% 132%, color-mix(in srgb, var(--env2) 30%, transparent) 0%, color-mix(in srgb, var(--env2) 10%, transparent) 46%, transparent 76%),
    radial-gradient(50% 135% at 87% 122%, color-mix(in srgb, var(--env3) 26%, transparent) 0%, color-mix(in srgb, var(--env3) 9%, transparent) 48%, transparent 78%),
    radial-gradient(88% 120% at 50% -40%, color-mix(in srgb, var(--env) 14%, transparent) 0%, transparent 70%);
}
@keyframes layered-light-drift {
  0%, 100% { background-position: 0 0, 0 0, 0 0; }
  50%      { background-position: 9px 2px, -8px 3px, 0 -3px; }
}
@media (prefers-reduced-motion: reduce) { [data-theme="layered-light"] .hf-env { animation: none; } }

/* ── AURORA BANDS ── */
[data-theme="aurora"] .hf-env {
  opacity: 0.72;
  mix-blend-mode: screen;
  -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.24) 38%, rgba(0,0,0,0.62) 74%, #000 100%);
          mask-image: linear-gradient(to bottom, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.24) 38%, rgba(0,0,0,0.62) 74%, #000 100%);
}
[data-theme="aurora"] .hf-env::before,
[data-theme="aurora"] .hf-env::after { content: ""; position: absolute; inset: -15% -25% -40%; will-change: transform; }
[data-theme="aurora"] .hf-env::before {
  background:
    radial-gradient(18% 95%  at  8% 66%, color-mix(in srgb, var(--env2) 78%, transparent), transparent 62%),
    radial-gradient(19% 100% at 27% 70%, color-mix(in srgb, var(--env)  76%, transparent), transparent 64%),
    radial-gradient(17% 92%  at 46% 63%, color-mix(in srgb, var(--env3) 68%, transparent), transparent 62%),
    radial-gradient(18% 98%  at 66% 70%, color-mix(in srgb, var(--env2) 70%, transparent), transparent 64%),
    radial-gradient(16% 90%  at 86% 65%, color-mix(in srgb, var(--env)  66%, transparent), transparent 62%);
  filter: blur(15px) saturate(1.75);
  animation: aurora-drift 34s ease-in-out infinite alternate;
}
[data-theme="aurora"] .hf-env::after {
  background:
    radial-gradient(24% 110% at 17% 74%, color-mix(in srgb, var(--env3) 52%, transparent), transparent 68%),
    radial-gradient(22% 105% at 57% 76%, color-mix(in srgb, var(--env)  48%, transparent), transparent 68%),
    radial-gradient(20% 100% at 92% 74%, color-mix(in srgb, var(--env3) 42%, transparent), transparent 68%);
  filter: blur(22px) saturate(1.5);
  opacity: 0.66;
  animation: aurora-drift-slow 52s ease-in-out infinite alternate;
}
[data-theme="aurora"] .app-status .hf-env {
  opacity: 0.52;
  -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.42) 48%, #000 100%);
          mask-image: linear-gradient(to bottom, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.42) 48%, #000 100%);
}
[data-theme="aurora"] .app-status .hf-env::before { filter: blur(10px) saturate(1.55); }
[data-theme="aurora"] .app-status .hf-env::after  { filter: blur(15px) saturate(1.4); opacity: 0.5; }
@keyframes aurora-drift      { 0% { transform: translate3d(-3%,0,0) skewX(-4deg); } 100% { transform: translate3d(3%,0,0) skewX(4deg); } }
@keyframes aurora-drift-slow { 0% { transform: translate3d(4%,0,0) skewX(3deg); } 100% { transform: translate3d(-4%,0,0) skewX(-3deg); } }
@media (prefers-reduced-motion: reduce) {
  [data-theme="aurora"] .hf-env::before, [data-theme="aurora"] .hf-env::after { animation: none; }
}

/* ── CONIC SHEEN ── */
[data-theme="conic"] .hf-env {
  mix-blend-mode: screen;
  opacity: .32;
  -webkit-mask-image: radial-gradient(120% 140% at 50% 50%, #000 45%, transparent 100%);
          mask-image: radial-gradient(120% 140% at 50% 50%, #000 45%, transparent 100%);
}
[data-theme="conic"] .hf-env::before {
  content: ""; position: absolute; inset: -24px -40px;
  background: conic-gradient(from var(--conic-angle, 0deg) at 50% -140%, var(--env3), var(--env), var(--env2), var(--env3), var(--env), var(--env2), var(--env3));
  filter: blur(30px) saturate(1.2);
  animation: conic-sheen-drift 120s linear infinite;
  will-change: background;
}
[data-theme="conic"] .app-status .hf-env {
  opacity: .28;
  -webkit-mask-image: radial-gradient(120% 185% at 50% 50%, #000 50%, transparent 100%);
          mask-image: radial-gradient(120% 185% at 50% 50%, #000 50%, transparent 100%);
}
[data-theme="conic"] .app-status .hf-env::before {
  inset: -14px -40px;
  background: conic-gradient(from var(--conic-angle, 0deg) at 50% -230%, var(--env3), var(--env), var(--env2), var(--env3), var(--env), var(--env2), var(--env3));
  filter: blur(20px) saturate(1.2);
  animation-duration: 150s;
}
@keyframes conic-sheen-drift { from { --conic-angle: 0deg; } to { --conic-angle: 360deg; } }
@media (prefers-reduced-motion: reduce) { [data-theme="conic"] .hf-env::before { animation: none; } }

/* ── PRISM SHAFTS (light-shaft) ── */
[data-theme="light-shaft"] .hf-env {
  background-image: linear-gradient(112deg, color-mix(in srgb, var(--env) 9%, transparent), transparent 46%, color-mix(in srgb, var(--env3) 8%, transparent));
}
[data-theme="light-shaft"] .hf-env::before,
[data-theme="light-shaft"] .hf-env::after {
  content: ""; position: absolute; top: 0; bottom: 0; left: -16%; width: 132%;
  pointer-events: none; mix-blend-mode: screen; will-change: transform;
}
[data-theme="light-shaft"] .hf-env::before {
  background-image:
    linear-gradient(107deg, transparent 12%, color-mix(in srgb, var(--env2) 22%, transparent) 20%, transparent 31%),
    linear-gradient(107deg, transparent 41%, color-mix(in srgb, var(--env) 26%, transparent) 49%, color-mix(in srgb, var(--env) 26%, transparent) 51%, transparent 61%),
    linear-gradient(107deg, transparent 73%, color-mix(in srgb, var(--env2) 16%, transparent) 81%, transparent 91%);
  animation: light-shaft-drift-near 30s ease-in-out infinite alternate;
}
[data-theme="light-shaft"] .hf-env::after {
  background-image:
    linear-gradient(112deg, transparent 20%, color-mix(in srgb, var(--env3) 26%, transparent) 33%, transparent 49%),
    linear-gradient(112deg, transparent 56%, color-mix(in srgb, var(--env) 18%, transparent) 67%, transparent 83%);
  opacity: 0.85;
  animation: light-shaft-drift-far 46s ease-in-out infinite alternate;
}
@keyframes light-shaft-drift-near { from { transform: translate3d(-1.5%,0,0); } to { transform: translate3d(2.5%,0,0); } }
@keyframes light-shaft-drift-far  { from { transform: translate3d(1.5%,0,0); }  to { transform: translate3d(-2%,0,0); } }
[data-theme="light-shaft"] .app-status .hf-env {
  background-image: linear-gradient(112deg, color-mix(in srgb, var(--env) 7%, transparent), transparent 50%, color-mix(in srgb, var(--env3) 6%, transparent));
}
[data-theme="light-shaft"] .app-status .hf-env::before { opacity: 0.6; }
[data-theme="light-shaft"] .app-status .hf-env::after  { opacity: 0.42; }
@media (prefers-reduced-motion: reduce) {
  [data-theme="light-shaft"] .hf-env::before, [data-theme="light-shaft"] .hf-env::after { animation: none; transform: none; }
}

/* ── DUOTONE DRIFT ── */
[data-theme="duotone-drift"] .hf-env {
  --dd-gain: 1; --dd-amp: 1;
  background: linear-gradient(93deg,
    color-mix(in oklab, var(--env)  calc(17% * var(--dd-gain)), transparent)   0%,
    color-mix(in oklab, var(--env)  calc(6%  * var(--dd-gain)), transparent)  40%,
    color-mix(in oklab, var(--env2) calc(7%  * var(--dd-gain)), transparent)  66%,
    color-mix(in oklab, var(--env2) calc(16% * var(--dd-gain)), transparent) 100%);
}
[data-theme="duotone-drift"] .hf-env::before,
[data-theme="duotone-drift"] .hf-env::after { content: ""; position: absolute; inset: -24% -22%; mix-blend-mode: screen; will-change: transform, opacity; }
[data-theme="duotone-drift"] .hf-env::before {
  background: linear-gradient(90deg, color-mix(in oklab, var(--env) calc(22% * var(--dd-gain)), transparent), color-mix(in oklab, var(--env2) calc(14% * var(--dd-gain)), transparent) 76%, transparent);
  animation: duotone-drift-pan 34s ease-in-out infinite alternate;
}
[data-theme="duotone-drift"] .hf-env::after {
  background: linear-gradient(86deg, transparent, color-mix(in oklab, var(--env3) calc(14% * var(--dd-gain)), transparent) 32%, color-mix(in oklab, var(--env2) calc(24% * var(--dd-gain)), transparent) 100%);
  opacity: calc(0.5 * var(--dd-gain));
  animation: duotone-drift-breathe 41s ease-in-out infinite alternate;
}
@keyframes duotone-drift-pan { from { transform: translate3d(calc(-3.6% * var(--dd-amp)),0,0); } to { transform: translate3d(calc(3.6% * var(--dd-amp)),0,0); } }
@keyframes duotone-drift-breathe {
  from { transform: translate3d(calc(2.4% * var(--dd-amp)),0,0);  opacity: calc(0.30 * var(--dd-gain)); }
  to   { transform: translate3d(calc(-2.4% * var(--dd-amp)),0,0); opacity: calc(0.60 * var(--dd-gain)); }
}
[data-theme="duotone-drift"] .app-status .hf-env { --dd-gain: 0.6; --dd-amp: 0.5; }
@media (prefers-reduced-motion: reduce) {
  [data-theme="duotone-drift"] .hf-env::before, [data-theme="duotone-drift"] .hf-env::after { animation: none; transform: none; }
}

/* ── MESH + GRAIN ── */
[data-theme="mesh-grain"] .hf-env::before {
  content: ""; position: absolute; inset: -25%;
  background:
    radial-gradient(58% 190% at 6% 128%, color-mix(in srgb, var(--env2) 60%, transparent) 0%, transparent 60%),
    radial-gradient(52% 175% at 92% -34%, color-mix(in srgb, var(--env) 52%, transparent) 0%, transparent 62%),
    radial-gradient(40% 150% at 63% 132%, color-mix(in srgb, var(--env3) 42%, transparent) 0%, transparent 58%);
  mix-blend-mode: screen; will-change: transform;
  animation: mesh-grain-drift 52s ease-in-out infinite alternate;
}
[data-theme="mesh-grain"] .hf-env::after {
  content: ""; position: absolute; inset: 0;
  background: var(--grain); background-size: 160px 160px;
  mix-blend-mode: overlay; opacity: 0.2;
}
@keyframes mesh-grain-drift { from { transform: translate3d(-1.2%, 0.6%, 0) scale(1.05); } to { transform: translate3d(1.4%, -0.8%, 0) scale(1.07); } }
[data-theme="mesh-grain"] .app-status .hf-env::before {
  inset: -60% -25%;
  background:
    radial-gradient(70% 320% at 10% 0%, color-mix(in srgb, var(--env2) 32%, transparent) 0%, transparent 64%),
    radial-gradient(64% 300% at 90% 100%, color-mix(in srgb, var(--env) 28%, transparent) 0%, transparent 66%);
  animation-duration: 64s;
}
[data-theme="mesh-grain"] .app-status .hf-env::after { opacity: 0.14; }
@media (prefers-reduced-motion: reduce) { [data-theme="mesh-grain"] .hf-env::before { animation: none; } }

/* ── Reduced motion: also snap the token re-tint instead of interpolating. ── */
@media (prefers-reduced-motion: reduce) { .app-root { transition: none; } }
```

- [ ] **Step 2: Import the stylesheet**

In `src/app/main.tsx`, add the import immediately after line 23 (`import './index.css';`):

```ts
import './themes.css';
```

- [ ] **Step 3: Verify header lint + build**

Run: `npm run lint:headers && npm run build`
Expected: header check passes; Vite build succeeds (the `@property`/`color-mix` CSS is valid and inert until `data-theme` is set, so nothing renders differently yet).

- [ ] **Step 4: Commit**

```bash
git add src/app/themes.css src/app/main.tsx
git commit -m "feat(app): port the seven env-accent styles into themes.css"
```

---

## Task 3: Integrate the theme into the chrome

This task rewires every consumer to the new mechanism. `environment.ts` still exports the old color API after this task (it is trimmed in Task 4), so the tree stays green throughout. Apply all steps, then verify once.

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/components/TopNav.tsx`
- Modify: `src/app/components/StatusBar.tsx`
- Modify: `src/app/components/Sidebar.tsx`
- Modify: `src/app/components/OptionsPanel.tsx`

- [ ] **Step 1: Pre-check for `data-theme` collisions**

Run: `rg -n 'data-theme' src index.html 2>/dev/null`
Expected: no existing writer of `data-theme` in app code (only this feature will set it). If any is found, stop and reconcile before continuing.

- [ ] **Step 2: `OptionsPanel.tsx` — add the Theme section**

Add the theme import near the top (after the existing imports, around line 21):

```tsx
import { THEMES, type ThemeKey } from '@/src/app/logic/theme';
```

Extend `OptionsPanelProps` (currently ends at line 33) with two props:

```tsx
  themeKey: ThemeKey;
  onSetThemeKey: (key: ThemeKey) => void;
```

Add them to the destructured params (the `({ … })` list at lines 51–56):

```tsx
  themeKey,
  onSetThemeKey,
```

Insert a new **Theme** section between the Feature Colors block and the Workspace block — i.e. immediately before the `{/* Workspace preferences */}` comment (line 156). Paste:

```tsx
          {/* Theme — the chrome accent style (per browser) */}
          <div className="px-5 py-4 border-b border-slate-800">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-3">Theme</span>
            <div role="radiogroup" aria-label="Chrome theme" className="grid grid-cols-2 gap-2">
              {THEMES.map(t => (
                <button
                  key={t.key}
                  role="radio"
                  aria-checked={themeKey === t.key}
                  onClick={() => onSetThemeKey(t.key)}
                  className={`text-left px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-tight transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${
                    themeKey === t.key
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                      : 'bg-black/20 border-slate-800/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
```

- [ ] **Step 3: `TopNav.tsx` — header layer, helix var, drop the strip, thread the prop**

Replace the environment import (line 23) with the OptionsPanel import kept and the theme type added:

```tsx
import OptionsPanel from './OptionsPanel';
import type { ThemeKey } from '@/src/app/logic/theme';
```

(Delete the whole `import { ENV_LAYERS, resolveEnvAccent, envAccentColor, envEdgeGradient } … environment';` line — TopNav no longer needs any of it.)

Add two props to `TopNavProps` (after line 33's `onSetSkipClearAllConfirmation`):

```tsx
  themeKey: ThemeKey;
  onSetThemeKey: (key: ThemeKey) => void;
```

Add them to the destructured params (after `onSetSkipClearAllConfirmation,`):

```tsx
  themeKey,
  onSetThemeKey,
```

Delete the local `const envAccent = resolveEnvAccent(activeTab, sessionMoleculeType);` (line 80).

Change the outer return: the component currently returns a fragment `<>` wrapping `<nav>` and a strip `<div>`. Replace the `<nav …>` opening tag (line 83) so it becomes a positioned, clipped container, and wrap its content. Concretely, the render becomes:

```tsx
  return (
  <nav className="app-nav relative h-16 border-b border-slate-800/80 bg-slate-900/95 backdrop-blur-md shrink-0 z-50">
    <div className="hf-env" aria-hidden="true" />
    <div className="relative z-[1] h-full flex items-center justify-between px-6">
```

…then keep the existing inner content unchanged EXCEPT the helix color, and close with `</div></nav>` instead of `</nav></>` plus the deleted strip.

> **Do NOT put `overflow-hidden` on `.app-nav`.** The Options popover renders inline (no portal) as an `absolute top-full` child inside the nav's containing block; an ancestor `overflow-hidden` would geometrically clip the whole popover (the theme picker included) regardless of `z-index`. The gradient stays contained without it — `.hf-env` is `position:absolute; inset:0` and self-clips its washes via its own `overflow:hidden` in `themes.css`. (The footer `.app-status` keeps `overflow-hidden` safely: it has no outward-opening menu.)

Helix (lines 93–96): replace the inline color with the CSS var:

```tsx
          <i
            className="fas fa-helix text-xl animate-spin-slow transition-colors duration-700 motion-reduce:transition-none"
            style={{ color: 'var(--env)' }}
          ></i>
```

Pass the new props to `OptionsPanel` (currently lines 203–208):

```tsx
      <OptionsPanel
        featureColors={featureColors}
        onSetFeatureColors={onSetFeatureColors}
        skipClearAllConfirmation={skipClearAllConfirmation}
        onSetSkipClearAllConfirmation={onSetSkipClearAllConfirmation}
        themeKey={themeKey}
        onSetThemeKey={onSetThemeKey}
      />
```

Delete the entire bottom edge-strip block — the `<div className="relative shrink-0 h-3 pointer-events-none overflow-hidden"> … </div>` at lines 211–221 — and the fragment wrapper (`</>`). The final two lines of the render are now `</div></nav>`.

- [ ] **Step 4: `StatusBar.tsx` — footer layer**

Replace the single root `<div>` (lines 30–72) with a clipped container that holds the footer `.hf-env` and wraps the existing content. The component body becomes:

```tsx
const StatusBar: React.FC<StatusBarProps> = ({ sessionMoleculeType }) => (
  <div className="app-status relative bg-slate-950 border-t border-slate-800 overflow-hidden">
    <div className="hf-env" aria-hidden="true" />
    <div className="relative z-[1] px-6 py-2 flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-slate-600">
      {/* …the existing two inner <div class="flex …"> blocks, unchanged… */}
    </div>
  </div>
);
```

Keep the two inner content blocks (the left links group and the right session/meta group, lines 31–71) exactly as they are, just moved inside the new `relative z-[1]` wrapper.

- [ ] **Step 5: `Sidebar.tsx` — drop the env prop, use the var**

Remove the environment import (line 23) entirely. Remove `envAccent: EnvAccentKey;` from the props interface (line 29) and `envAccent,` from the destructured params (line 77). Replace the accent-color line (line 121):

```tsx
  // The sidebar's brand-accent section labels re-tint with the workspace mode.
  const accentColor = 'var(--env)';
```

(Leave every `style={{ color: accentColor }}` usage as-is — they now read the inherited custom property. Do a quick `rg -n 'accentColor' src/app/components/Sidebar.tsx` to confirm all usages still resolve.)

- [ ] **Step 6: `App.tsx` — root wiring, delete the strip, thread the prop**

Replace the environment import (line 31) and add the theme import:

```tsx
import { resolveEnvAccent } from './logic/environment';
import { getTheme, readThemePref, writeThemePref, resolveThemeVars, type ThemeKey } from './logic/theme';
```

Add theme state next to the other misc UI state (after line 78's `skipClearAllConfirmation` state):

```tsx
  const [themeKey, setThemeKey] = useState<ThemeKey>(readThemePref);
```

Add a handler next to `handleSetSkipClearAllConfirmation` (after line 214):

```tsx
  const handleSetThemeKey = (key: ThemeKey) => {
    writeThemePref(key);
    setThemeKey(key);
  };
```

Compute the root style from the active theme + resolved env. Add just below `const envAccent = resolveEnvAccent(activeTab, sessionMoleculeType);` (line 199):

```tsx
  const themeStyle = resolveThemeVars(getTheme(themeKey), envAccent) as React.CSSProperties;
```

Change the root element (line 237) to carry the theme attributes, class, and vars:

```tsx
    <div
      className="app-root flex flex-col h-screen bg-[#0f172a] text-slate-200 overflow-hidden font-sans select-none"
      data-theme={themeKey}
      data-env={envAccent}
      style={themeStyle}
    >
```

Pass the theme props to `TopNav` (add to the prop list around line 281, next to the skip-confirmation props):

```tsx
        themeKey={themeKey}
        onSetThemeKey={handleSetThemeKey}
```

Remove the `envAccent={envAccent}` prop from `<Sidebar>` (line 304) — Sidebar no longer takes it.

Delete the bottom edge-strip block entirely — the `<div className="relative shrink-0 h-3 pointer-events-none overflow-hidden"> … </div>` at lines 408–418.

- [ ] **Step 7: Typecheck, lint, test, build**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all green. (If TS rejects the custom-property style object, the `as React.CSSProperties` cast on `themeStyle` covers it; ensure it is present.)

- [ ] **Step 8: Commit**

```bash
git add src/app/App.tsx src/app/components/TopNav.tsx src/app/components/StatusBar.tsx src/app/components/Sidebar.tsx src/app/components/OptionsPanel.tsx
git commit -m "feat(app): drive the chrome accent from the theme registry; remove edge bleed"
```

---

## Task 4: Slim `environment.ts` to the resolver

Now that no consumer imports the color API, remove it.

**Files:**
- Modify: `src/app/logic/environment.ts`
- Test: `src/app/logic/__tests__/environment.test.ts`

- [ ] **Step 1: Update the test first**

Rewrite `src/app/logic/__tests__/environment.test.ts` so it only covers `resolveEnvAccent` (keep the AGPL header). Replace the import (line 21) and delete the `envAccentColor`/`envLayer` describe blocks:

```ts
import { describe, it, expect } from 'vitest';
import { resolveEnvAccent } from '../environment';

describe('resolveEnvAccent', () => {
  it('is none when no molecule is loaded, regardless of tab', () => {
    expect(resolveEnvAccent('alignment', null)).toBe('none');
    expect(resolveEnvAccent('features', null)).toBe('none');
  });

  it('is the molecule environment in the viewport', () => {
    expect(resolveEnvAccent('alignment', 'nucleotide')).toBe('nucleotide');
    expect(resolveEnvAccent('alignment', 'protein')).toBe('protein');
  });

  it('is hub in the Database Hub when a molecule is loaded', () => {
    expect(resolveEnvAccent('features', 'nucleotide')).toBe('hub');
    expect(resolveEnvAccent('features', 'protein')).toBe('hub');
  });
});
```

- [ ] **Step 2: Run it to verify it fails to compile**

Run: `npx vitest run src/app/logic/__tests__/environment.test.ts`
Expected: PASS (the file compiles — `resolveEnvAccent` still exists). This step confirms the test is green BEFORE the trim; the trim in Step 3 keeps it green.

- [ ] **Step 3: Trim `environment.ts`**

Replace the body of `src/app/logic/environment.ts` below the AGPL header with only the resolver and its types (delete `ENV_LAYERS`, `EnvLayer`, `envLayer`, `envAccentColor`, `envEdgeGradient`):

```ts
export type EnvAccentKey = 'nucleotide' | 'protein' | 'hub' | 'none';

/**
 * The active environment accent. With no molecule there is no environment, so the
 * Database Hub does NOT go amber on an empty session — the null check runs first.
 * In the Hub the accent reads `hub`; in the viewport it reads the molecule's own
 * environment. Colour values for each key live in the theme registry (theme.ts).
 */
export const resolveEnvAccent = (
  activeTab: 'alignment' | 'features',
  moleculeType: 'nucleotide' | 'protein' | null,
): EnvAccentKey => {
  if (moleculeType === null) return 'none';
  if (activeTab === 'features') return 'hub';
  return moleculeType;
};
```

- [ ] **Step 4: Verify the whole suite is green**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all green (theme.test.ts, environment.test.ts, clearConfirmationPref.test.ts, and the rest of the suite). This confirms no lingering import of the removed API.

- [ ] **Step 5: Commit**

```bash
git add src/app/logic/environment.ts src/app/logic/__tests__/environment.test.ts
git commit -m "refactor(app): reduce environment.ts to the pure env resolver"
```

---

## Task 5: Documentation

**Files:**
- Modify: `docs/design/README.md`

- [ ] **Step 1: Update the design README**

In `docs/design/README.md`:
- Under "The governing rule", replace the third bullet ("a thin accent **edge strip** at the chrome-to-canvas boundary") with a note that the edge strip is **revoked**: the accent renders only inside the header and footer chrome and the Hub backdrop.
- In the Backlog section, mark items **1 (theme options)**, **2 (keep A · Clean)**, and **3 (palette changes)** as **Resolved** — theme switcher shipped on `feat/theme-switcher` with the seven-style shortlist (`clean` default), both palette retunes applied, and the edge bleed removed. Reference `docs/superpowers/specs/2026-07-20-theme-switcher-design.md`.
- Leave the prototypes and item 5 (amber-runs-hot note) untouched.

- [ ] **Step 2: Header lint (README is exempt but run the check anyway)**

Run: `npm run lint:headers`
Expected: passes (`.md` is exempt; this confirms nothing else regressed).

- [ ] **Step 3: Commit**

```bash
git add docs/design/README.md
git commit -m "docs(design): record theme switcher — edge bleed revoked, backlog 1-3 resolved"
```

---

## Task 6: Visual verification (Playwright CLI)

Not a unit test — a manual visual pass using the local Playwright CLI (per project convention; do NOT add the Playwright MCP). This proves the render and the no-bleed guarantee.

**Files:** none (verification only).

- [ ] **Step 1: Build and serve**

Run: `npm run build && npm run preview` (note the local URL).

- [ ] **Step 2: Screenshot the matrix**

Using the Playwright CLI, capture the chrome for at least these states and eyeball each:
- **Themes:** `clean` (default), `layered-light`, and `aurora` (an animated, screen-blend style — the highest render risk under the nav's `backdrop-blur`).
- **Sessions × modes per theme:** no file (neutral), a nucleotide file in Viewport (sky) and in Hub (amber), a protein file in Viewport (violet).
- Switch themes via the Options popover → Theme section and confirm the chrome re-tints.

- [ ] **Step 3: Assert the guarantees**

Confirm by inspection:
1. **No bleed:** no accent wash touches the white viewport canvas or the Hub table card — the gradient is contained to the header and footer bars only. (This is the regression the user reported; it must be gone.)
1b. **Options popover reachable:** click the gear and confirm the *entire* popover renders unclipped — the Theme picker, Feature Colors, and the Workspace toggle all visible below the nav. (Guards the `overflow-hidden`-clips-the-popover regression, which has no unit coverage since the project has no DOM test infra.)
2. **Screen-blend presence:** aurora's curtains are actually visible in the header/footer over the `bg-slate-900/95` nav. If they are invisible, the nav's `backdrop-blur` is suppressing the blend — fix by giving `.app-nav`/`.app-status` an explicit opaque background layer behind `.hf-env` (e.g. drop the `/95` alpha to solid `#0f172a` on those two bars) and re-verify. Record the outcome.
3. **Reduced motion:** with the OS "reduce motion" setting on, animations stop and the theme switch re-tints instantly (no 650ms interpolation), while each style keeps its static resting composition.
4. **Persistence:** choose a non-default theme, reload — it persists.

- [ ] **Step 4: Record the result**

Note pass/fail for each guarantee in the PR description (or `docs/pr-review-toolkit/<pr>-loop.md` if IAR runs). No commit unless a fix from Step 3.2 was applied — if so:

```bash
git add -A && git commit -m "fix(app): ensure header/footer accent composites over an opaque bar"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-07-20-theme-switcher-design.md`):
- Model (`Theme`/`EnvPalette`, per-theme palette, `clean` default) → Task 1. ✓ (extended to 4 envs incl. `none` — see resolved inconsistency.)
- `theme.ts` single token home + persistence → Task 1. ✓
- `themes.css` with `[data-theme]` scoping, `.hf-env` clipping, reduced-motion gates → Task 2. ✓
- Root `data-theme`/`data-env` + inline vars; CSS references vars only → Task 3 (App). ✓
- `environment.ts` keeps `resolveEnvAccent`, loses color tokens → Task 4. ✓
- Chrome components add the `.hf-env` layers; helix/labels read `var(--env)` → Task 3. ✓
- OptionsPanel Theme section between Feature Colors and Workspace → Task 3 (Step 2). ✓
- Edge-bleed removal (both strips + `envEdgeGradient`) → Task 3 (App+TopNav) + Task 4. ✓
- Both palette retunes as shipped values → Task 1 (`DEFAULT_PALETTE`), asserted in test. ✓
- Error handling: unknown/missing pref → default; no `localStorage` → in-memory default → Task 1 (`readThemePref`/`isThemeKey`), asserted. ✓
- Testing: pref round-trip + unknown-key + no-window; registry integrity; env→vars mapping; visual matrix + bleed check → Tasks 1 & 6. ✓
- Docs update → Task 5. ✓
- Out of scope (full app theming, per-project persistence, beam/underglow) → untouched. ✓

**Placeholder scan:** none — every file's full content or exact edit is given; the CSS is transcribed verbatim with a single documented selector substitution.

**Type consistency:** `ThemeKey`, `EnvPalette`, `Theme`, `EnvAccentKey`, `resolveThemeVars`, `getTheme`, `readThemePref`/`writeThemePref`, `THEMES`/`THEME_KEYS`/`DEFAULT_THEME_KEY`/`DEFAULT_PALETTE` are named identically across Tasks 1, 3, 4. `theme.ts` imports `EnvAccentKey` from `environment.ts` (one-way; no cycle). The `.app-root`/`.app-nav`/`.app-status`/`.hf-env` class names in `themes.css` (Task 2) match the JSX in Task 3.
