# Self-host frontend assets — Tailwind v3 build + Font Awesome, drop runtime CDNs

**Date:** 2026-07-01
**Branch:** `chore/self-host-assets` (in-place on the main checkout; no worktree)
**Status:** design approved, pending spec review

## Problem

The built `dist/index.html` depends on three third-party hosts at runtime, which is off-brand
for a privacy-focused, local-only genomics tool and adds availability risk before hosting on
Cloudflare Pages:

1. `cdn.tailwindcss.com` — the Tailwind **Play CDN** (Tailwind **v3**; confirmed via the bundled
   PostCSS 8.4.49 fingerprint). It is a **hard dependency for 100% of styling** — the repo bundles
   **zero** CSS today (no CSS import, no tailwind/postcss config; `find dist -name '*.css'` = none).
   If the CDN is unreachable the entire UI renders unstyled. Tailwind documents this CDN as
   dev-only, not for production.
2. `cdnjs.cloudflare.com` — Font Awesome 6.4.0 stylesheet + webfonts, no SRI.
3. A dead `esm.sh` **importmap** (React/react-dom/d3) — vestigial: Vite already bundles those into
   `/assets/index-*.js` (0 `esm.sh` refs in `dist/assets/*.js`), so it never fires at runtime.

Plus a **broken** `<link rel="stylesheet" href="/index.css">` — no such file exists → 404 every load.

## Goal / success criteria

- Built `dist/` contacts **zero** third-party hosts. Primary check: grep `dist/` finds no
  `cdn.tailwindcss.com`, `cdnjs.cloudflare.com`, `esm.sh`, and no dangling `/index.css`.
- **Pixel-identical** to the current look. Because the Play CDN is v3, a v3 build reproduces it
  exactly, and the app has **zero dynamically-constructed class names** (verified: every
  `className={\`...\`}` interpolates whole literal class strings; the only `-${}` hits are React
  keys / SVG ids), so a build-time content scan misses nothing.
- No app behavior change. `npm run typecheck`, `npm run lint`, and all **499** tests stay green.

## Non-goals

- Doc-staleness updates (README/ARCHITECTURE/DOCUMENTATION/USER_MANUAL) — separate session.
- Cloudflare Pages dashboard wiring — the user does that after this merges.
- Tailwind **v4** upgrade — see Backlog.

## Approach (chosen)

**Tailwind v3 via PostCSS + autoprefixer** for exact parity; **self-host Font Awesome** via the
npm package; delete the dead importmap, the broken `/index.css` link, and the Tailwind CDN script.
Vite compiles/bundles the CSS + webfonts into hashed static assets and injects the `<link>`.

### Files

**Added**
- `tailwind.config.js` — ESM export (repo is `"type":"module"`); `content`:
  `['./index.html', './index.tsx', './src/**/*.{ts,tsx}', './components/**/*.{ts,tsx}']`;
  stock v3 `theme`, no plugins.
- `postcss.config.js` — ESM; plugins `tailwindcss`, `autoprefixer`.
- `index.css` (repo root, beside `index.tsx`) — `@tailwind base; @tailwind components; @tailwind utilities;`.

**Modified**
- `index.tsx` — add at top: `import './index.css';` and
  `import '@fortawesome/fontawesome-free/css/all.min.css';`.
- `index.html` — remove the `cdn.tailwindcss.com` `<script>`, the cdnjs Font Awesome `<link>`,
  the broken `<link href="/index.css">`, and the entire `<script type="importmap">` block. Keep the
  `<body>` utility classes. (Vite injects the hashed CSS `<link>` at build.)
- `package.json` — devDeps: `tailwindcss@^3.4`, `postcss@^8.4`, `autoprefixer@^10.4`;
  deps: `@fortawesome/fontawesome-free@^6.4.0` (matches the current CDN 6.4.0 → identical icons).

## Data flow (build)

`index.tsx` imports CSS → PostCSS runs Tailwind v3 over the content globs (generates only used
utilities) → autoprefixer → one hashed `dist/assets/index-*.css`. Font Awesome's
`url(../webfonts/*.woff2)` refs are rewritten by Vite and the woff2 files emitted (hashed) into
`dist/assets/`. No in-browser runtime compilation (unlike the Play CDN) → faster first paint.

## Edge cases / risks

- **`fa-helix`** is not a standard FA6-free icon; whatever it renders via CDN 6.4.0 renders
  identically self-hosted from the same 6.4.0. Parity preserved; not fixed here (noted only).
- **FA webfont bundling** through Vite `url()` handling is standard; explicitly confirm the woff2
  files land in `dist/assets` and icons render (including `fa-github` brand and `fa-spin`).
- **CSS import order** (Font Awesome + Tailwind preflight): no conflict expected (FA is `.fa*`
  classes + `@font-face`).

## Verification (done bar)

1. `npm run build` succeeds.
2. Grep `dist/` → **zero** external hosts and no `/index.css` reference. (Primary criterion.)
3. `npm run typecheck` + `npm run lint` + `npm run test` (499) green.
4. `vite preview` → manual visual spot-check vs. current: body bg, gradients, `ring-2` selections,
   dashed borders, all FA icons. Indistinguishable from today.

## Backlog (not now)

- **Tailwind v4** (`@tailwindcss/vite`): one-line config, faster, current major, but its changed
  defaults (border color → `currentColor`, ring width 3px→1px, ring/placeholder colors, shadow
  scale) would drift this heavily-tuned UI and need a visual-diff + compat pass. Revisit as a
  dedicated upgrade.
- Optional: add `.nvmrc` = `20` (CI parity) when wiring CF Pages.
