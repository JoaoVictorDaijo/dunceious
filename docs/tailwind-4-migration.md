# Tailwind 4 migration proposal

**Owner browser-policy approval is required before merge.** This proposal targets develop;
it is not a release or an approval to remove older-browser support.

## Compatibility decision

Tailwind 4.3.3 requires Safari 16.4+, Chrome 111+ and Firefox 128+ for its CSS engine.
The proposed Vite build/CSS targets are Chrome/Edge 111+, Firefox 128+ and Safari 16.4+.
Former targets were Chrome 87, Edge 88, Firefox 78 and Safari 14. JavaScript transpilation
cannot restore missing CSS features. Keep Tailwind 3.4 if the reduction is not accepted.
Tests on current browser engines do not certify those exact minimum versions.

App version remains 3.7.2: repository policy bumps only at develop-to-main promotion.
This proposal adds a Changed fragment. A future approved release must account for the
breaking browser compatibility change.

## Compiler and theme

Pin tailwindcss and @tailwindcss/postcss to matching 4.3.3 versions. PostCSS already
integrates Vite and the CSS regression tests, so both retain one compiler path.
The dedicated Vite plugin is an alternative, not needed alongside that existing path.
The adapter handles imports/prefixing; remove standalone autoprefixer, retain PostCSS
for the tests. The new Oxide dependency requires Node 20+.

The CSS entry imports Tailwind and explicitly loads tailwind.config.js with @config.
Keep the custom slate/environment colors, the full prior sans/mono fallback stacks, animations and
tailwindcss-animate plugin. tailwind.colors.json records the published 3.4.19 palette,
preventing an incidental switch to v4's different OKLCH colors. It is static data, not
a retained v3 compiler/dependency. The original MIT notice ships in public/tailwind-palette.NOTICE.txt. Tests compile the real entry/config through v4.

## Breaking-change review

| Area | Project decision / verification |
| --- | --- |
| Directives/config | Replace @tailwind with the v4 import; explicitly load JavaScript config. No CLI integration is used. |
| Radius/shadow/blur | Map old small utilities to extra-small and old bare utilities to small, preserving the prior scale. |
| Outline | Map outline-none to outline-hidden to retain forced-colors visibility. The interactive genome strip needs focus-visible:outline-solid because outline-hidden otherwise leaves v4 focus outlines at none; a real-control browser regression protects it. |
| Rings | Preserve explicit widths/colors and the legacy default blue at 50% opacity; bare ring maps to ring-3. |
| Borders/controls | Keep gray-200 default borders, gray-400 placeholders and enabled/disabled button cursors. |
| Fonts/colors/plugins | Keep Inter/JetBrains Mono, prior colors, environment opacity modifiers and animation utilities. Restore fixed font-size line heights; v4 unitless defaults otherwise shrink arbitrary-size descendants and move Hub/sidebar controls. |
| Spacing/dividers | Review all 57 vertical stacks; there is no space-x or divide consumer. Fifteen inline-label stacks and the mixed block/inline identity-slider stack use explicit following-sibling top margins to retain v3 gaps and container heights. The label stacks each have two visible children. Ordinary block/flex stacks retain v4 spacing. Actual navigation, search, selection, record/annotation metadata and showroom controls are measured against the v3 baseline. |
| Variants/dark | Check arbitrary state selectors and keyboard focus. Dark chrome uses explicit colors, not dark: variants. Descendant focus stacks now target the focused child (v3 generated parent-focus selectors); actual export keyboard outlines are tested. No direct-child/typography ordering stack was found. |
| Arbitrary values | Grid commas are minmax() arguments, not comma-separated tracks. No bare variable shorthand was found. |
| Hidden | Native file inputs remain hidden; viewport bands/labels toggle the hidden property; showroom sidebar uses conditional hidden. No DOM consumer relies on display utilities overriding hidden. |
| Hover/touch | Hover is now restricted to hover-capable primary pointers. Touch controls must remain usable through their existing explicit rules/actions. |
| Transforms | No transform-none reset or custom transition-[...,transform] consumer was found. Viewer transform attributes are separate. |
| Cascade/imports | Compare the real font/app/chrome/Font Awesome import order, project Hub styles and focused controls. |
| Other features | No removed opacity/flex aliases, prefix, safelist, corePlugins, container override or custom @layer utilities were found. Existing @layer blocks contain base rules only. |

## Validation and review

Preserve the two neutral Hub color/edge assertions. Add regressions for explicit theme,
environment utilities, animation generation and real-browser computed styles/focus.
Cover controls, borders/rings, radius/shadows, spacing/fonts, responsive layouts and
light/dark preferences, plus import/export/project reload, navigation and the showroom.
Record reused baseline evidence separately from newly executed tests.

Independent review remains required before publication; owner browser-policy approval is required before merge.

## Sources

Reviewed on 2026-10-22:

- https://tailwindcss.com/docs/upgrade-guide
- https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.3
- https://tailwindcss.com/docs/font-size
- https://tailwindcss.com/docs/outline-style
- Published npm metadata and installed manifests/integrities for tailwindcss,
  @tailwindcss/postcss, @tailwindcss/node and @tailwindcss/oxide 4.3.3.
