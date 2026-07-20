# Environment Accent — design prototypes

Interactive prototypes for the per-session **environment accent**: the chrome re-tints to
tell you where you are (which molecule you're viewing, or that you're in the Database Hub).

## The shareable file

`environment-accent-prototypes.html` is a single standalone page — open it by double-click in
any browser. It works offline, needs no account, no server and no install, and every control
in it is live. Send that one file to anyone who needs to review the design.

To regenerate it after editing anything under `prototypes/`:

```bash
node docs/design/build-bundle.mjs
```

Each prototype is embedded in its own iframe. They were authored independently and reuse class
names like `.app` and `.nav`, so the iframe is what stops one prototype's CSS bleeding into
another's.

## The governing rule

> **The environment accent lives in the FRAME, never on the DATA.**

The white viewport canvas and the white Hub table card are working surfaces. Anything washing
over them makes the data harder to read, which is the opposite of what a viewer is for. The
accent may only touch:

- the dark chrome — the top nav (header) and status bar (footer);
- the non-data backdrop — the Hub's cream area around the table card;
- ~~a thin accent **edge strip** at the chrome-to-canvas boundary.~~ **Revoked** — the accent renders only inside the header/footer chrome and the Hub backdrop; no edge strip bleeds onto the canvas.

The toolbar / ruler band stays flat. In the current prototype this is enforced structurally:
every gradient renders through exactly two `.hf-env` layers, one inside `.nav` and one inside
`.status`, each clipped by `overflow: hidden`. Nothing else in the document can paint a wash.

## State model

Mirrors `resolveEnvAccent` in `src/app/logic/environment.ts`. The null check runs **first**,
which is the easy thing to get wrong:

| Session | Viewport | Database Hub |
| --- | --- | --- |
| No file | neutral (no accent) | **neutral — not amber** |
| Nucleotide | sky | amber |
| Protein | violet | amber |

With no file loaded there is no environment, so the Hub does **not** go amber. Anyone wiring
this up who assumes "Hub always means amber" will paint amber chrome on an empty session.

---

## Backlog / open decisions

### 1. Theme options in settings — don't force a single style

**Resolved.** The theme switcher shipped on `feat/theme-switcher`: a seven-style shortlist
with `clean` as the default, both palette retunes applied (see item 3), and the edge bleed
removed. Spec: `docs/superpowers/specs/2026-07-20-theme-switcher-design.md`. The investigation
notes below are kept for the record.

We do not have to pick one treatment and discard the rest. The nine styles are all driven by
the same two `.hf-env` layers and the same `--env` tokens, so exposing them as a user setting
is plausibly cheap — the switch is one attribute on the app root.

**To investigate before committing to it:**

- Viability: is it genuinely just `data-hfstyle` on a root element, or does per-style CSS bloat
  the bundle enough to matter? All nine styles currently ship as static CSS.
- Where it lives: the existing global Options popover (PR #65) is the natural home.
- Persistence: localStorage vs. project file. Should a project carry its author's theme, or is
  it a per-user preference? Per-user is the safer default.
- Reduced motion: several styles animate. The `prefers-reduced-motion` gate already exists and
  must keep winning over any user selection.
- Accessibility: each style was contrast-tuned per palette (see below). A user-facing switch
  means every style must hold its contrast floor in **all** palettes, not just the default.
- Scope: is this a v1 feature or a follow-up? Shipping one good default first, with the
  machinery in place to add the switch later, is the lower-risk path.

### 2. Keep `A · Clean` as a supported option

**Resolved.** `clean` ships as one of the seven styles and is the default (see item 1 and
`docs/superpowers/specs/2026-07-20-theme-switcher-design.md`).

The flat baseline — accent edge strip plus tinted chrome accents, no wash — is a legitimate
choice, not just a control. It is the calmest option and the cheapest to render. If the theme
switch above happens, `A · Clean` should be one of the choices (and is a good candidate for
the default).

### 3. Palette changes awaiting sign-off

**Resolved.** Both retunes shipped on `feat/theme-switcher` — sky `--env3` → `#0d9488` (teal)
and protein `--env` → `#a78bfa` — applied across the seven-style shortlist (see item 1 and
`docs/superpowers/specs/2026-07-20-theme-switcher-design.md`).

Both are **live in the prototype** and marked in-file with revert instructions.

- **Sky `--env3`: `#6366f1` (indigo) → `#0d9488` (teal).** Indigo sits only 15.6° from protein's
  violet in OKLCH — a tighter gap than the steps *inside* a single family — and `--env3` is a
  prominent pool in several styles, so nucleotide and protein sessions read alike. The retune
  widens the worst gap to 56.2°. Conservative fallback: `#3b82f6` (blue-500, 33.7°).
- **Protein `--env`: `#8b5cf6` → `#a78bfa`.** Not only aesthetics — `#8b5cf6` measures
  **4.22:1** on the `#0f172a` chrome, failing WCAG AA for normal-size text, and that hex is
  `ENV_LAYERS.hex`, which is painted onto small text (wordmark accent, section labels).
  `#a78bfa` gives 6.56:1, matching sky's 6.44:1.

### 4. Rework the first-pass implementation

The env-accent code on this branch predates the prototypes. It holds up better than expected —
but one part is superseded:

- **Keep.** `src/app/logic/environment.ts` (`resolveEnvAccent`, `ENV_LAYERS`) is
  direction-agnostic and already encodes the correct precedence.
- **Keep.** The Hub's amber re-tint. `bg-amber-50/50` sits on the panel's outer container —
  the backdrop, which is where the accent belongs — and the rest are semantic accents
  (selection, hover, checkbox, buttons).
- **Replace.** The workspace edge strips and skylight wash in `App.tsx` / `TopNav.tsx`. This is
  the treatment that reads as "too simple": a single flat linear strip, one direction, no
  layering. The header/footer styles in the prototype replace it.

Token values will also need updating if the palette changes in item 3 are approved.

### 5. Amber runs hot

Measured across the styles, amber's additive-light budget is ~25% above sky and violet, which
are at parity with each other. If the set ever needs levelling, trim amber's aurora/conic
opacity rather than boosting the others.
