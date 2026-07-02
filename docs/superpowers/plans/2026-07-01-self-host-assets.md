# Self-host frontend assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile Tailwind v3 and Font Awesome at build time so the deployed `dist/` depends on zero third-party CDNs, with pixel-identical output and no behavior change.

**Architecture:** Add a standard Tailwind v3 + PostCSS + autoprefixer pipeline and self-host Font Awesome via npm; import both stylesheets from `index.tsx` so Vite emits hashed CSS + webfont assets and injects the `<link>`. Then strip the Tailwind Play CDN, the Font Awesome cdnjs link, the dead esm.sh importmap, and the broken `/index.css` link from `index.html`.

**Tech Stack:** Vite 6, React 19, Tailwind CSS v3, PostCSS 8 + autoprefixer, `@fortawesome/fontawesome-free` 6.4.0, TypeScript 5.9.

## Global Constraints

- Tailwind **v3** only (NOT v4 — v4 is deferred to backlog; its changed defaults would break parity).
- Font Awesome **6.4.0** (exact match to the current CDN version → identical icons).
- Repo is `"type": "module"` — all `.js` config files use `export default`, not `module.exports`.
- Deploy target is site **root** (Vite `base` stays default `/`). Do not set `base`.
- Preserve every existing class name and the `<body>` utility classes. No visual change.
- All **499** existing tests plus `typecheck` and `lint` must stay green.
- **Commits are user-gated** (project rule: commit only when the user asks). Make edits and run verification; do not run `git commit` until the user requests it.

---

### Task 1: Add the build-time Tailwind v3 + Font Awesome pipeline (CDN still present as safety net)

**Files:**
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `index.css` (repo root)
- Create: `vite-env.d.ts` (repo root)
- Modify: `index.tsx` (add two CSS imports)
- Modify: `package.json` (dependencies — via npm install)

**Interfaces:**
- Produces: a hashed `dist/assets/*.css` bundle containing all used Tailwind utilities + Font Awesome, plus hashed `*.woff2` webfonts. `index.html` is NOT changed in this task, so styling is briefly served by both the bundled CSS and the CDN (redundant, harmless).

- [ ] **Step 1: Install dependencies**

```bash
npm install -D tailwindcss@^3.4 postcss@^8.4 autoprefixer@^10.4
npm install --save-exact @fortawesome/fontawesome-free@6.4.0
```

Expected: installs succeed; `package.json` gains `tailwindcss`/`postcss`/`autoprefixer` under `devDependencies` and `@fortawesome/fontawesome-free` (pinned exactly to `6.4.0`, no caret) under `dependencies`. **Exact pin, not `^6.4.0`** — the Global Constraint requires byte-identical parity with the CDN's 6.4.0, and a caret would float to the latest 6.x.

- [ ] **Step 2: Create `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './src/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 3: Create `postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Create `index.css` (repo root)**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 5: Create `vite-env.d.ts` (repo root)**

Needed so `tsc --noEmit` recognizes `.css` module imports (via Vite's ambient `*.css` declaration).

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 6: Add the CSS imports to `index.tsx`**

Add these two lines immediately after the existing `import ReactDOM ...` line (top of the import block, after the license header):

```ts
import './index.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
```

- [ ] **Step 7: Build and verify the CSS + webfonts are emitted**

Run: `npm run build`
Expected: build succeeds; then:
```bash
ls dist/assets/*.css        # expect at least one hashed .css file
ls dist/assets/*.woff2      # expect Font Awesome webfont files
```
Both listings are non-empty.

- [ ] **Step 8: Verify typecheck still passes (CSS-import types resolve)**

Run: `npm run typecheck`
Expected: PASS (no "Cannot find module './index.css'" — the `vite-env.d.ts` reference resolves it).

- [ ] **Step 9: Visual sanity check**

Run: `npm run preview` and open the served URL. Confirm the app renders styled (it will be, from both bundled CSS and the still-present CDN). Note it for the real parity check in Task 2.

---

### Task 2: Remove all runtime CDNs, the dead importmap, and the broken CSS link from `index.html`

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: the bundled CSS from Task 1 (now the ONLY styling source).
- Produces: a `dist/index.html` that references only same-origin hashed assets.

- [ ] **Step 1: Remove the four external/dead references from `index.html`**

Delete these lines from `<head>`:
- `<script src="https://cdn.tailwindcss.com"></script>`
- `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">`
- `<link rel="stylesheet" href="/index.css">`
- the entire `<script type="importmap"> ... </script>` block (react/react-dom/d3 → esm.sh)

Keep: `<meta>` tags, `<title>`, the `<body class="...">` classes, `<div id="root">`, and `<script type="module" src="/index.tsx">`.

- [ ] **Step 2: Rebuild**

Run: `npm run build`
Expected: build succeeds (Vite may no longer emit the `/index.css doesn't exist` warning).

- [ ] **Step 3: Verify zero third-party hosts in the built output (PRIMARY success criterion)**

Run:
```bash
grep -rEn "cdn\.tailwindcss\.com|cdnjs\.cloudflare\.com|esm\.sh|href=\"/index\.css\"" dist/
```
Expected: **no matches** (exit code 1). If anything matches, the cleanup is incomplete.

- [ ] **Step 4: Confirm the built HTML links the bundled CSS**

Run: `grep -En "assets/.*\.css" dist/index.html`
Expected: a `<link rel="stylesheet" ... href="/assets/index-*.css">` injected by Vite.

- [ ] **Step 5: Visual parity check vs. today**

Run: `npm run preview`. Spot-check against the current look: body background (`bg-slate-900`), the sky/violet gradients, `ring-2 ring-sky-500/*` selection outlines, dashed upload borders, and Font Awesome icons — including the `fa-github` brand icon (StatusBar) and any `fa-spin` spinner. Must be indistinguishable from the pre-change app.

---

### Task 3: Full verification gate + commit

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS. (If ESLint flags the new `.js`/`.d.ts` config files, fix minimally — e.g. formatting — without changing behavior.)

- [ ] **Step 3: Full test suite**

Run: `npm run test`
Expected: all **499** tests pass (0 failures). These are logic tests; they should be unaffected, and confirm no import/wiring regression.

- [ ] **Step 4: Final external-host grep on a fresh build**

Run:
```bash
npm run build && grep -rEn "cdn\.tailwindcss\.com|cdnjs\.cloudflare\.com|esm\.sh|href=\"/index\.css\"" dist/ && echo "FAIL: external ref found" || echo "PASS: dist is CDN-free"
```
Expected: `PASS: dist is CDN-free`.

- [ ] **Step 5: Commit (ONLY after the user asks)**

```bash
git add tailwind.config.js postcss.config.js index.css vite-env.d.ts index.tsx index.html package.json package-lock.json docs/superpowers/
git commit -m "chore: self-host Tailwind v3 + Font Awesome, drop runtime CDNs

Compile Tailwind v3 (postcss + autoprefixer) and self-host Font Awesome 6.4.0
at build time; remove the cdn.tailwindcss.com script, the cdnjs Font Awesome
link, the dead esm.sh importmap, and the broken /index.css link from index.html.
Built dist/ now depends on zero third-party CDNs. No visual or behavior change.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** Tailwind v3 build (Task 1) ✓; self-host Font Awesome (Task 1) ✓; delete importmap + broken `/index.css` + Tailwind CDN + FA CDN (Task 2) ✓; zero-CDN grep gate (Tasks 2–3) ✓; 499 tests + typecheck + lint (Tasks 1, 3) ✓; visual parity (Tasks 1–2) ✓; ESM configs, FA 6.4.0, base=`/`, no class changes (Global Constraints) ✓. `vite-env.d.ts` added to cover the `.css`-import typecheck requirement the spec's verification implies. v4 deferred (Global Constraints + spec Backlog) ✓.

**Placeholder scan:** none — every step has exact commands/code and expected output.

**Type consistency:** file paths and the two import lines are referenced identically across tasks; grep pattern for the zero-CDN gate is identical in Task 2 Step 3 and Task 3 Step 4.
