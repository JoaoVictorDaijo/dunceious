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
