# CLAUDE.md — Dunceious

Guidance for anyone (human or agent) working in this repo.

## License headers (required, enforced)

Dunceious is **AGPL-3.0-or-later**. **Every covered source file MUST begin with the
project's AGPL license header.** Copy the exact text from any existing source file
(e.g. `vite.config.ts`).

- **Covered** (must have the header):
  - `.ts .tsx .js .mjs .cjs .css` → block comment `/* … */`
  - `.html .svg` → XML comment `<!-- … -->`
  - `.py .yml .yaml .sh` and `.gitignore` → `#`-prefixed lines
  - The header goes at the very top, but **after** a shebang (`#!…`), an HTML
    `<!DOCTYPE html>`, or an XML declaration.
- **Exempt** (cannot or by convention): `.json` (no comment syntax), `.md`, and
  binary assets (`*.png`, fonts, `*.gb`, lockfiles).
- **Generated files** must emit the header from their generator — e.g. `public/favicon.svg`
  is produced by `scripts/gen-brand-assets.py`, which writes the header into its output.
  Do not hand-edit generated files; they get overwritten.

**Enforcement:** `npm run lint:headers` runs in CI and fails on any missing header.
Auto-insert missing headers with:

```bash
node scripts/check-license-headers.mjs --fix
```

When you create **any** new covered file, add the header (or run `--fix`) before committing.

## Versioning & releases

Dunceious follows **SemVer**. The single source of truth is `package.json`
`version`, injected at build time as `__APP_VERSION__` (see `vite.config.ts`) and
surfaced in the StatusBar, the logger banner, and every exported file's
provenance stamp — so the number ships to users. History was reconstructed on
2026-07-21 (see `CHANGELOG.md`); two anchors are load-bearing: **`1.0.0`** = the
import of the already-working app, **`2.0.0`** = the layered-architecture rewrite.
The old `3.4.0` was arbitrary and has been discarded.

**Bump rules** (highest-precedence change since the last release wins):

| Commit type | Bump |
| --- | --- |
| `feat!` / `BREAKING CHANGE:` footer / architecture-breaking `refactor!` | major |
| `feat` | minor |
| `fix`, `perf` | patch |
| `docs`, `test`, `refactor`, `chore`, `style`, `ci`, `build` | none |

**Cadence:** bump **once per `develop` → `main` promotion** — that is when
Cloudflare Pages actually deploys, so the version means "what is live." Do not
bump per feature-PR into `develop`.

**Release checklist** (run at every `develop` → `main` promotion):

```
1. Decide the bump from commits since the last tag:
     git log $(git describe --tags --abbrev=0)..develop --no-merges --format='%s'
2. On develop, bump package.json + lock (no tag):
     npm run version:minor      # or version:patch / version:major
   Commit: chore(release): vX.Y.Z  — and add the entry to CHANGELOG.md
3. Open the develop → main promotion PR; CI must be green.
4. After merge, tag the MAIN merge commit and push:
     git tag -a vX.Y.Z <main-merge-sha> -m "Release vX.Y.Z"
     git push origin vX.Y.Z
5. Verify the deployed StatusBar shows vX.Y.Z and a fresh export carries it.
```

Tags are annotated `vX.Y.Z`, created **only** on `main` promotion commits (never
per develop-PR) so a tag always means "this was deployed."
