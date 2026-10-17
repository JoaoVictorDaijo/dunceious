---
title: "Top bar layout: keep the layer toggles visible on office screens"
status: implemented
date: 2026-10-17
areas: ["app", "viewer"]
prs: [187]
issues: []
superseded_by: null
summary: "Project folds into the cog, Compare and Clear selection move to the viewport toolbar, and the top bar gives up niceties in a fixed order so the four layer toggles stay inline down to about 950 px."
---
# Top bar layout — design

## Why

The four viewport layer toggles (Annotations, Tracks, Translation, Conservation) used to sit
side by side in the top bar. Once the Hub tools, the Project menu and Compare joined the bar,
the toggles stopped fitting and now collapse into a "Layers 3/4" dropdown on most screens.
Measured on the deployed site with two records loaded, the toggles stay hidden at every common
width, including 1920 px: the space right of the centred mode switcher is about half the bar
minus 212 px (428 px at 1280, 748 px at 1920), while the tools need roughly 786 px.

The owner wants the layers to be clear in the bar, not hidden under a dropdown, on 1080p
monitors and on smaller square office monitors, while keeping the breathing room between the
wordmark and the rest of the bar on wide screens.

## Decisions (owner, 2026-10-16 and 2026-10-17)

- **Project folds into the cog.** The separate Project button goes away.
- **Compare appears only once sequences are aligned**, the way the selection tools appear only
  when bases are selected. It is not shown disabled.
- **The mode switcher stays centred** whenever it can. On smaller screens it may slide left,
  and the bar compresses in a fixed order (below).
- **Short names before folding.** Before the layers fold into a dropdown, the toggles switch to
  coloured dots with short names.
- **Last resort is today's dropdown**: "Layers N/4" with the coloured dots and the per-layer
  popover, unchanged.

## Goals

- In the Visual Viewport, the four layer toggles are inline at every width from 1920 px down to
  about 950 px of bar width.
- The top bar does not change width while working: controls that come and go (selection tools,
  Compare) live in the viewport toolbar, not the top bar.
- On wide screens the bar looks as it does today: wordmark and slogan on the left, switcher
  centred, tools on the right.
- No overlap or clipping between the wordmark, the switcher and the tools at any width down to
  680 px (half of a 1366 px screen). Phones are out of scope: `pickShell` sends them to the
  greeter.

## Non-goals

- No visual restyle: colours, Inter, the uppercase chrome labels, the env accent and the toggle
  styles stay as they are.
- No change to what the Hub toolbar contains (search, Import, Export), only to how much room
  the bar leaves it.
- No change to layer, comparison or selection behaviour; only where their controls live.
- No changes to the phone greeter.

## Anti-goals (would count as failure even if it works)

- The layers end up in the dropdown on a 1280–1920 px screen.
- The bar visibly flickers or oscillates between steps while resizing, or while selecting bases.
- Project actions or their shortcuts become harder to reach than today (Ctrl/⌘+S and Ctrl/⌘+O
  must keep working with the menu closed).

## Design

### 1. Top bar contents

After this change the top bar holds, left to right:

1. Sidebar toggle, wordmark, slogan (unchanged).
2. Mode switcher: Visual Viewport / Annotation Hub (unchanged contents).
3. Workspace tools:
   - **Viewport:** drag mode (pan/select), the layer toggles (inline tray or the fallback
     dropdown).
   - **Hub:** the existing Hub toolbar (search, Import, Export), unchanged.
4. A divider, then the **cog**, which now holds Project and the options.

Removed from the top bar: the Project button, the Compare button and the Clear selection
button.

### 2. The cog menu

The cog opens one panel with two parts:

- **Project** (top): the three existing actions, with their current labels, descriptions,
  icons, disabled rules and shortcut hints: Save project (Ctrl/⌘ S), Open project… (Ctrl/⌘ O),
  Clear workspace… (danger, separated). The existing workspace line ("N sequences in this
  workspace" / "The workspace is empty") heads the section.
- **Options** (below): the existing feature colours and theme controls, unchanged.

Rules:

- The cog keeps its gear icon. Its accessible name and tooltip become "Project and options".
- The global Save/Open shortcuts, the hidden file input and the "Saved as …" notice must not
  depend on the panel being open. The notice anchors under the cog.
- `locked` / `workspaceLocked` behaviour is unchanged.
- The builder chooses the panel's ARIA pattern (a dialog containing a group of action buttons
  is fine) but must keep: Escape closes it and returns focus to the cog, outside click closes
  it, and every action is reachable by keyboard.
- The combined panel is taller than either menu today. Cap it to the viewport height below the
  bar and scroll inside it; every Project, colour and theme control stays reachable by pointer
  and keyboard at 1366×768 and 1024×600, and a focused control scrolls into view.

### 3. The viewport toolbar

The toolbar under the top bar (minimap, Go to, selection tools, Fit, zoom) gains:

- **Compare**: the existing `ComparisonMenu` moves here, placed after the selection tools and
  before Fit. It is rendered only when `canCompare` is true (at least two aligned records).
  - When `canCompare` turns false, the button disappears; if its menu was open, the menu closes.
    Comparison settings are kept as today.
  - When `canCompare` turns from false to true during a session, the button plays one short
    arrival animation (slide in plus one accent ring, under half a second, then a ring of about
    a second). It does not animate when the viewer first mounts already comparable (for example
    after opening a saved project). Under `prefers-reduced-motion: reduce` there is no animation.
- **The comparison panel** must render above the ruler and sequence content and must not be
  clipped by viewer ancestors (today it opens below the top bar; in the toolbar it would sit in
  the toolbar's `z-20` context under the ruler's `z-30` one). Rendering it through a portal
  anchored to its trigger, as `TooltipLayer` does, is acceptable. It stays inside the visible
  viewport and keeps outside-click and Escape dismissal with focus returning to the trigger.
- **Clear selection**: a small × button at the end of the existing selection group (after the
  export button), shown only while a selection exists, with accessible name "Clear selection"
  and tooltip "Clear the current selection". It calls the same handler the top-bar Clear button
  calls today. Other ways of clearing a selection are unchanged.

**Toolbar fitting.** The toolbar's width is the viewer's, after the sidebar (320 px by default,
resizable) and padding, so at 1024 px with the sidebar open it is only about 700 px. Its
controls are fixed-width today, the selection readout grows with coordinate length, and the
Compare trigger grows up to 14 rem with the reference name. When the controls do not fit
beside the minimap, the toolbar gives way in this order, first step that fits:

1. The minimap shrinks, down to a 160 px minimum.
2. The Compare trigger drops the reference name and shows its icon and "Compare".
3. Center and Zoom sel become icon buttons, with their names as accessible names and tooltips.
4. The selection readout hides (it already hides below the `md` breakpoint).
5. Last resort: the controls move below the minimap and wrap across as many rows as they need.
   The toolbar's height follows its content, keyboard order stays the same, and no action is
   hidden at any step.

### 4. How the top bar compresses

The bar measures its contents and applies the **first step that fits**, trying them in this
order. Each step keeps everything the earlier steps gave up.

| Step | What gives way | About where (prototype, Viewport, 2 records) |
| --- | --- | --- |
| 0 | Nothing: switcher dead centre, wide logo gap (64 px minimum), slogan shown | above ~1540 px |
| 1 | Switcher slides left from centre, only as far as the tools need | ~1540 → 1394 px |
| 2 | Logo gap minimum drops to 32 px | 1394 px |
| 3 | Slogan hides (the wordmark stays) | 1362 px |
| 4 | Layer toggles get tighter padding and letter-spacing | 1216 px |
| 5 | Switcher labels become "Viewport" and "Hub" | 1176 px |
| 6 | Layer toggles show short names: Annot, Tracks, Transl, Conserv | 1054 px |
| 7 | Layer toggles fold into today's "Layers N/4" dropdown | 948 px |
| 8 | Switcher shows icons only | 762 px |

The widths come from the prototype and are targets, not contracts; the real app will land
close to them. The order is the contract.

Placement rule, in bar-local coordinates:

- `preferredLeft = (barWidth − switcherWidth) / 2` (the switcher centred on the bar)
- `minLeft = brandRight + logoGap` (the step's minimum logo gap)
- `maxLeft = toolsLeft − toolsGap − switcherWidth`

A step fits when `minLeft ≤ maxLeft` and the tools end inside the bar's right padding. The
switcher's left edge is then `max(minLeft, min(preferredLeft, maxLeft))`: centred while it fits,
slid left only as far as the tools need. Step 0 additionally requires
`minLeft ≤ preferredLeft ≤ maxLeft` (dead centre, no slide). In later steps the switcher may sit
right of centre when the wordmark and its gap reach past the centred position.

Rules:

- **Hub mode** uses the same order. Steps 4, 6 and 7 do not apply (no layer toggles). The Hub
  toolbar is elastic (search has a 200 px minimum), so measure it at its minimum width. The Hub
  adds two steps after step 8, because its tools alone do not fit at 680 px otherwise:
  - **H1:** Import and Export become icon-only buttons, with their names as accessible names
    and tooltips.
  - **H2:** the search field's minimum width drops to 140 px.

  - **H3 (both modes, last step):** the wordmark hides; the sidebar toggle stays. Added after
    measurement: at 680 px in the Hub, a `1000 / 1000` search counter with its arrows and an
    80 px typing width still overlapped the switcher after H2 by about 110 px. The Viewport
    never reaches this step above 680 px.

  The top bar stays one row (64 px) in both modes. If a measured layout still overlaps at
  680 px after H3, stop and raise it rather than adding another step.
- **Labels and access:** short and icon-only forms keep the full names as accessible names and
  as tooltips (`data-tip`). Layer toggles keep their existing tooltip text, including disabled
  reasons.
- **Stability:** the choice depends only on widths, never on the previous step, so resizing back
  restores earlier steps. The bar must not flicker: no visible intermediate step during a
  measurement, and no ResizeObserver feedback loop. The existing measuring code in `TopNav.tsx`
  (natural tray width, ResizeObserver, inline/dropdown switch) is the starting point to extend.
  Measuring the natural width of each variant once per content or font change and choosing the
  step arithmetically is preferred over applying each step to the DOM in turn.
- **Removing Clear and Compare from the top bar** means a selection no longer changes the top
  bar's width; the measurement dependency on `activeSelection` goes away.

### 5. Phone showroom

`ShowroomTopBar.tsx` mirrors the workbench bar's classes, labels and order. Its Project and
Options buttons merge into one cog the same way, so the showroom stays faithful. Its layers
stay in their dropdown (it targets 740 px). It keeps explaining rather than acting.

## Acceptance checks

- At 1920, 1600, 1440, 1366 and 1280 px viewport widths with records loaded in the Visual
  Viewport (sidebar open, Annotation Hub not active), the four layer toggles are inline with
  full names; at 1920 the switcher is centred (within 1 px) and the slogan is visible.
- At 1024 px the toggles are inline with short names. At 900 px they are in the "Layers N/4"
  dropdown, which works as today.
- At 680 px nothing in the bar overlaps or is clipped, in both modes; in the Hub, with an empty
  search and with search results showing a multi-digit counter (`1000 / 1000`) and its arrows,
  while the search input keeps at least 80 px of typing width. This case falls under the Hub's
  measure-and-raise rule.
- The viewport toolbar keeps every control visible and operable with a selection and Compare
  both showing (long coordinates, a reference name long enough to hit the 14 rem cap) at 1366,
  1024, 900 and 680 px with the sidebar open.
- The open comparison panel sits fully above the ruler, with its top controls clickable.
- The cog panel's last theme control is reachable at 1366×768 and 1024×600.
- Selecting and clearing bases does not change anything in the top bar.
- Compare is absent with fewer than two aligned records, appears in the viewport toolbar once
  there are two, and opens the existing comparison menu.
- Project actions work from the cog, including both shortcuts with the panel closed, the
  "Saved as" notice, and the locked workspace state.
- Existing unit, render and e2e tests pass after being updated for the moved controls
  (for example `e2e/workspace.spec.ts` opens the Project menu from the nav), and new tests cover:
  step selection from given widths, switcher placement, the cog's Project section, Compare's
  visibility rule, and Clear selection in the toolbar.
- `npm run lint:headers`, type checks and lint pass.

## Left to the builder

- Component boundaries: whether ProjectMenu's content becomes a section component inside
  OptionsPanel or a new combined component, and where the step-selection logic lives (a pure
  function in `src/app/logic/` is preferred, so it can be unit-tested; follow ARCHITECTURE.md).
- Exact animation curves and durations within the limits above.
- How the short names are stored next to the existing layer definitions.
- Any living docs or in-app help that describe where Project, Compare or Clear live must be
  updated in the same PR.

## Rejected alternatives

- **Keep the switcher always centred.** At 1280 px the space right of centre is about 428 px,
  less than the drag mode, inline toggles and cog need (~557 px), so the toggles could only stay
  inline from about 1540 px. Rejected for the office-monitor goal; the switcher still prefers
  the centre.
- **Switcher always beside the wordmark.** Fits easily but loses the centred look the owner
  wants on wide screens.
- **A second top-bar row in the Hub on narrow screens.** Changes the 64 px bar height the
  viewer layout assumes; icon-only Import/Export and a narrower search keep one row instead.
- **Compare stays in the top bar, hidden until aligned.** When it appears it costs about 107 px
  and would push the toggles back into the dropdown at 1280–1366 px, so the bar would change
  layout the moment the user aligns. Moving it to the viewport toolbar follows the existing
  precedent of selection-only tools there.
- **Project in the wordmark (an app menu).** Costs no width, but logos rarely act as menus and
  it is less discoverable than the cog the owner proposed.
