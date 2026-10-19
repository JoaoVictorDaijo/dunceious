---
title: "Greeter showroom: a test drive of the workbench on phones"
status: implemented
date: 2026-10-15
areas: ["greeter", "app", "viewer"]
prs: [174, 175]
issues: []
superseded_by: null
summary: "Phones get a sideways, read-only test drive that renders the real GenomeViewer, search panel and alignment dialog over bundled example records, with every action that would do work replaced by an explanation."
---
# Greeter showroom — design

## Why

The phone greeter explains Dunceious and then offers "Open the workbench on this phone anyway",
which loads the real desktop app into a layout that does not fit. People who tap it are curious
about the workbench, not trying to do work on a phone. They should get a faithful look at it
that cannot lose their time or data, and the greeter should stop offering a broken path.

The full mobile UI (spec on PR #140) stays the long-term plan. This showroom is an interim step
that reuses the same shared viewer, so the work carries over.

## Decisions (owner, 2026-10-15)

- **Fidelity:** a high-fidelity prototype that feels almost identical to the workbench, reusing
  real parts where possible, without running real work.
- **First version covers** the Visual Viewport and Search and alignment.
  **Deferred:** the Annotation Hub and the Import/Export menus (see *Deferred*).
- **Showroom only:** phones can no longer open the real workbench. Tablets, computers and
  `?shell=desktop` still can.
- **Privacy:** the "0 bytes uploaded. Ever." card goes; the greeter states plainly where files go.
- **Touch first:** finger pan and pinch zoom are added to the real viewer before the showroom is
  built, pulled forward from mobile PR 2 (see *Delivery*).

## Goals

- A phone visitor taps one button and, held sideways, sees the workbench with sample data.
- Panning, the minimap and ruler, zoom buttons, Go to position, layer toggles, record visibility,
  sequence search and its highlights behave exactly as on a computer, because they are the same code.
  Controls the workbench disables for this data (Conservation, without an alignment) stay disabled.
- Anything that would import, export, edit, delete, save or contact a server shows a short
  explanation of what it does in the workbench instead.
- Nothing the visitor does in the showroom is stored, sent or carried into the real workbench.

## Non-goals and anti-goals

- No real files in or out: no file pickers, no downloads, no project save, no clipboard writes
  of sequence data.
- No network request from the showroom beyond loading the app's own files from its origin: no
  `fetch` or XHR, and no navigation or new tab to another origin. Remote alignment is shown, never
  submitted.
- No changes to how the desktop workbench looks or behaves with a mouse and keyboard. The touch PR
  adds touch input to the viewer without changing the mouse path; otherwise desktop components are
  reused as they are and the showroom adapts around them.
- Not a tutorial with forced steps. Visitors explore; explanations appear when they tap.
- It must never be mistaken for the real tool: a persistent "Test drive" marker and an Exit
  control are always visible.

## Experience

### Entry

The greeter's "Best on a computer" section replaces "Open the workbench on this phone anyway" with
a primary button **Test-drive the workbench**. The button opens the showroom full screen.

### Turn sideways

In portrait, the showroom shows only a rotate prompt: a phone outline turning 90° along a curved
arrow (one loop of the animation, then still; no animation under reduced motion), the line
**Turn your phone sideways**, and a **Back** link. The prompt hides the moment the device is
landscape, and comes back if it returns to portrait. Detection uses
`matchMedia('(orientation: landscape)')`; the showroom never locks orientation.

### Layout (landscape phone, about 844 × 390)

```
┌ DUNCEIOUS  [Visual Viewport][Annotation Hub]  Pan|Select  Layers  Search  Align  Test drive · Exit ┐
│ ≡ │                                                                                                │
│   │                         real GenomeViewer (minimap, ruler, rows)                               │
│   │                                                                                                │
└───┴────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar (about 44 px):** an imitation of the workbench `TopNav`, rebuilt at phone height with the
  same colours, labels and order as the real one: the workspace switcher, Pan/Select, Layers,
  Project and Options. The switcher, Pan/Select and Layers work; Project and Options explain.
  A fixed "Test drive" marker and **Exit** (back to the greeter) are added at the end.
- **Sidebar:** closed by default, opened with ≡ as a drawer over the viewer, holding the same
  sections in the same order as the real `Sidebar`: Record Navigator (eye toggles and jump work),
  Navigation (Start, End, Go to position work), Ingestion (cards explain), Alignment (opens the
  dialog) and Sequence search (the real `SearchPanel`).
- **Viewer:** the real `GenomeViewer` fills the rest. The workbench footer is left out; its version
  and session chip are not needed in a test drive.
- **First visit:** a dismissible strip along the bottom: "This is a test drive with sample data.
  Tap anything to see what it does. Nothing is saved."

### Sample data

Three of the repository's example files (`examples/`), loaded together into one session as if
dropped at once: SARS-CoV-2 (NC_045512), the human mitochondrion (NC_012920) and influenza A/PR8
(eight segments), ten records in all. They are imported as raw text with Vite `?raw` and parsed in
the page by the same handler the bio worker uses (`handleBioMessage`). The showroom repeats the
steps the app's hooks run after a parse (`applyParseSuccess` in `logic/bioResponse.ts`, then
`PROCESS_RECORDS` on visible records), so it shows exactly what the workbench shows for those files.

### What works and what explains

| Control | In the showroom |
| --- | --- |
| Finger pan, pinch zoom, minimap, ruler, + / − / Fit, Go to position, Start / End | Real viewer code (touch from the touch PR) |
| Pan / Select switch | Real. Drag-to-select by touch stays with mobile PR 2; in Select mode a drag explains that it selects a region with a mouse |
| Context menu (long-press, right-click, the keyboard menu key) | Explains the workbench's right-click menu (zoom to annotation, view details, copy sequence, remove). The showroom stops every `contextmenu` event in the capture phase on its viewer wrapper, so the viewer's menu, its clipboard write and its `window.confirm` never run. iOS Safari fires no `contextmenu` on long-press, so the showroom also runs its own long-press timer (500 ms, cancelled by movement past the slop, a second finger, `pointercancel` or rotation) and suppresses the iOS callout with `-webkit-touch-callout: none`. A long-press that fires consumes its touch: the showroom stops that pointer's further moves in the capture phase (no panning until the finger lifts), swallows the `click` its release produces (so a feature's tap action does not replace the explanation), and ignores a native `contextmenu` for the same press, so exactly one explanation opens |
| Layers (annotations, translation, tracks) | Real toggles |
| Conservation layer | Disabled with the workbench's own reason, as in `TopNav`: the samples are unrelated, unaligned genomes, so `deriveAlignmentState` reports no alignment. Tapping it explains conservation |
| Record eye toggles, jump to record | Real |
| Sequence search (exact and fuzzy) | Real, run in the page over the sample records; hits highlight in the viewer |
| Annotate a hit, join hits | Explains what it would add |
| External links inside reused components (the consent screen's EMBL-EBI privacy notice and terms) | While the showroom is mounted, capture-phase `click`, `auxclick`, `contextmenu` and `dragstart` listeners on `document` (so portals are covered) stop every link to another origin and explain where it leads, and `-webkit-touch-callout: none` on the showroom root suppresses iOS link previews. That covers tap, keyboard activation, middle-click, the link context menu and dragging a link out, so it also holds on a computer opened with `?shell=greeter` |
| Align | Opens the real `AlignRemoteModal` with real preflight verdicts, under a fixed "Test drive: nothing will be sent" banner. Its real consent screen shows; ticking it is kept in memory only, as in the workbench. The email field is pre-filled with `you@example.org` so Align is reachable; Submit explains and sends nothing |
| Annotation Hub tab | Explains the Hub and says it is not in the test drive yet |
| Import, Export, Project, Options, ingestion cards, delete record, feature details, add annotation | Explain |

### Explanations

One component, a callout anchored to the tapped control (a bottom sheet when there is no room),
with a title naming the control, two or three sentences on what it does in the workbench, and a
**Got it** button. They read as a guide's notes, visually distinct from the workbench's own
tooltips: a sky outline and the label "In the workbench". Copy is plain and specific, for example:

> **Export** — Writes the sequences you choose as FASTA, GenBank, GFF3 or a project file, with a
> preview of exactly what goes in. Files are created by your browser and saved to your computer.

## Architecture

- **`src/app/showroom/`**, a third UI next to the greeter. The greeter lazy-loads it
  (`import('../showroom/Showroom')`) only when the button is tapped, so the greeter page stays
  small and the showroom never loads on a computer.
- **Reuse:** `viewer/GenomeViewer` and its modules, `components/SearchPanel`,
  `components/AlignRemoteModal`, pure `logic/` modules, `core/` search and alignment preflight,
  `workers/handlers/bio` for parsing. Chrome (top bar, sidebar) is rebuilt in the showroom: the
  real `TopNav` and `Sidebar` are bound to `App` state and desktop sizes.
- **State:** a small `useShowroomWorkspace` hook holds records, toggles, selection, search state
  and the open explanation, all in memory. The showroom never writes to `localStorage`,
  `sessionStorage`, IndexedDB or the clipboard, and never makes a network request. Two things it
  inherits are accepted: the reused modules bundle `lib/ebiClient` through `logic/remoteAlignment`
  (code that is never called), and importing `logic/alignConsentPref` clears a legacy
  `localStorage` key once, as it does in the workbench. Alignment consent lives in that module's
  memory, so ticking it in the showroom stays in the page.
- **Boundaries** (ESLint, like the greeter rule): the showroom may import `viewer/`, the named
  presentational components, `logic/`, `domain`, `core` and `workers/handlers`; it may not import
  `App`, `hooks/` (they own workers and app state), `lib/` or `shell/` directly. The rule checks
  direct imports only; the no-network and no-storage tests are what guard behaviour.
  The greeter may import only `showroom/Showroom`, and only dynamically.
- **Shell:** the greeter's "anyway" path is removed, and with it the `sessionStorage` override in
  `pickShell` (`rememberShell`, `SHELL_OVERRIDE_KEY`, `ShellEnv.storage`) and `openWorkbench` in
  `ShellRoot`. Detection and `?shell=greeter|desktop` stay.
- **Mobile plan:** when PR 1 of the mobile spec is rebuilt, `viewer/` moves to `shared/viewer/`
  and the showroom's imports move with it. The touch PR below is the pan-and-pinch part of mobile
  PR 2, built as that spec describes it; mobile PR 2 keeps the rest (touch select, `onFeatureTap`,
  compact toolbar, `initialCenterColumn`, `onViewportChange`).

## Delivery

1. **`feat(viewer): pan and pinch-zoom by touch`.** The pan-and-pinch part of mobile PR 2, with
   these decisions, which take precedence over that spec where they differ:
   - **Touch only.** The new controller handles `pointerType === 'touch'`. Mouse and pen keep the
     existing mouse handlers and behave exactly as today (pen drags already arrive as compatibility
     mouse events, so pen panning and selecting keep working).
   - **Where.** One controller per viewer owns every touch on two surfaces: the rows container (the
     element that has `onMouseDown` in `GenomeViewer`, `listContainerRef`) and the minimap.
     Selection-overlay handles are siblings of the rows container and are not touched; touch on
     them does nothing new in this PR.
   - **Minimap touch.** d3's brush tracks every finger on the screen (`event.touches`) and keeps
     its own gesture lifecycle, which cannot be shared safely with a second controller. So the
     brush is created with `.touchable(() => false)`: d3 handles mouse only, exactly as today, and
     touch on the minimap goes to the controller. One finger dragging on the minimap moves the
     visible window with the finger at the current zoom (as dragging the brush window does with a
     mouse); a tap centres the view on that position. Drawing a new brush extent by touch (which
     zooms) is deferred. Because `.touchable(() => false)` also stops d3 from setting
     `touch-action` on its overlay, the minimap surface gets `touch-action: none` explicitly, and
     the controller calls `preventDefault()` on every touch `pointerdown` there too (owned or
     rejected), so neither browser zoom nor compatibility mouse events reach d3's mouse brush.
   - **One surface at a time.** The surface a gesture's first finger lands on owns it until all
     of its fingers lift; fingers that land on the other surface meanwhile are ignored for their
     whole lifetime (their pointer ids are remembered and their events dropped). A pinch therefore
     needs both fingers on the rows. Because the controller is the only touch listener on both
     surfaces, there is no partial event stream to reconcile. Tested in both start orders and both
     release orders, followed by a normal mouse brush on the minimap.
   - **Stable capture.** When a touch stops being a tap (pending becomes panning, or a pinch
     starts), the controller calls `setPointerCapture(pointerId)` on the rows container, so a row
     react-window recycles mid-gesture cannot drop the stream. A tap is never captured, so its
     `click` still targets the feature or record under the finger (Pointer Events send the click
     to the capture target when one exists). After a pan or pinch the release `click` is
     suppressed. Moving capture off the touched child fires a bubbling `lostpointercapture` at that
     child before `gotpointercapture` on the container; that handoff is not a loss. Only a
     `lostpointercapture` whose target is the rows container itself, after the controller has
     received its own `gotpointercapture`, ends the gesture.
   - **No double path.** On every touch `pointerdown` on either surface, owned or rejected, the
     controller calls `preventDefault()`, which stops the browser's compatibility `mousedown`/`mouseup` for that
     touch, so the old mouse drag can never start alongside it. `click` still fires for taps, so
     tapping a record or feature works as before.
   - **App-owned scrolling.** The rows container and react-window's outer element (through the
     `VariableSizeList` `style` prop, next to `overflowX: 'hidden'`) both get `touch-action: none`.
     The outer element is itself a scroll container, and for panning the browser only consults
     `touch-action` up to the nearest scroll container, so `none` on the parent alone would not stop
     native vertical scrolling. One finger pans both
     axes, exactly like the mouse pan (`startPan`): horizontal through `horizontalScrollRef`,
     vertical through the react-window list. The browser never takes the gesture over, so a second
     finger can start a pinch at any moment.
   - **States.** Idle → pending (one finger down, under 6 px of movement) → panning; any state →
     pinching when a second finger lands; a third finger, `pointercancel` or a genuine capture loss
     (see *Stable capture*) ends the gesture without a jump. Lifting one finger of a pinch ends the gesture; the remaining
     finger does not pan until it is lifted and put down again.
   - **Pinch maths.** At pinch start, record the column under the midpoint
     (`anchorColumn`, from the midpoint's x relative to the sequence area, so excluding the
     120 px label gutter `SIDEBAR_WIDTH`) and the finger distance. On each move,
     `zoom = clamp(startZoom × distance / startDistance, fitZoom, MAX_ZOOM)` and
     `scrollLeft = anchorColumn × zoom − midpointX`, clamped to the scroll range by the browser.
     (The mobile spec's `zoomAroundAnchor` signature is replaced by this one.)
     The column under the fingers follows the midpoint as it moves, so a two-finger drag with no
     spread pans. The midpoint's vertical movement scrolls the list. A pure helper
     `pinchViewport({ anchorColumn, midpointX, startZoom, startDistance, distance, minZoom, maxZoom })`
     returns `{ zoom, scrollLeft }` and is unit-tested at both zoom limits.
   - **Focus flight.** Any touch gesture cancels a running focus flight, as mouse input already does.
   - Tests: the state machine and `pinchViewport` as pure units; jsdom pointer-event tests for
     pan, pinch, cancel and the no-compat-mousedown rule; the existing mouse tests unchanged. Real
     touch arbitration cannot be checked in jsdom, so a Playwright run with a touch device
     (`hasTouch`, CDP touch events) checks one-finger pan both ways, a vertical pan followed by a
  second finger turning into a pinch with no `pointercancel`, a row finger plus a minimap finger in
  both start and release orders moving the view only by the owning surface with no exceptions,
  a tap on a feature still running its click handler, a pan that starts on a feature continuing
  through the capture handoff, a minimap tap and drag with no browser zoom and no d3 mouse brush
  started by touch (mouse brushing still works), and that the page itself does not scroll or zoom.
2. **`feat(greeter): test-drive the workbench on a phone`.** Everything else in this spec.

## Greeter: where your files go

Replace the "0 bytes uploaded. Ever." card with a plain section:

> **Where your files go**
>
> Dunceious is a static website. Your browser downloads the app, then opens your files itself.
> They stay in that browser tab and are gone when you close it, unless you save a project, which
> writes a file to your own computer. There is no server that receives your files, no account and
> no database.
>
> Remote alignment is the one exception, and you choose it: it sends every loaded sequence,
> including hidden ones, and the email address you give to EMBL-EBI, and asks you first in every
> session.

Set as ordinary text in the page's type, with no badge, stat or card.

## Testing

- Touch PR: see *Delivery*, item 1.
- Unit: `useShowroomWorkspace` (search over sample records, toggles), the explanation registry
  (every explaining control has copy), orientation handling.
- Render (jsdom): the rotate prompt in portrait and the showroom in landscape (stubbed
  `matchMedia`); Exit returns to the greeter; explaining controls open their callout; long-press
  explains without a clipboard write or `window.confirm`; Submit in the alignment dialog explains,
  with spies proving no `fetch`, `XMLHttpRequest`, `navigator.clipboard.writeText`,
  `localStorage.setItem` or `sessionStorage.setItem` call during the whole session; tapping the
  consent screen's links explains instead of navigating, and `auxclick`, `contextmenu` and
  `dragstart` on them are stopped; a long-press on a feature opens exactly one explanation and no tap action.
- Browser (Playwright, `hasTouch`/`isMobile`, against the production build): every request the
  page makes during a scripted showroom session is same-origin, and no popup or navigation to
  another origin happens.
- Boundaries: the ESLint rule rejects a showroom import of `App`, `hooks/` or `lib/`, and the
  greeter's static import of the showroom.
- Build: the greeter chunk does not contain showroom code; the showroom is its own chunk.
- Visual: phone screenshots in portrait (rotate prompt) and landscape at 844 × 390 and 740 × 360,
  checked against the desktop workbench for fidelity.

## Deferred

- **Annotation Hub** in the showroom (tables, filters, record cards; the real `AnnotationHubPanel`
  is the likely reuse).
- **Import / Export menus** opening as in the workbench, with their options explained.
- Touch drag-to-select, touch on selection handles, and tapping a feature to open it, which stay
  with mobile PR 2.
- An aligned sample (for example a small alignment of related genomes) so Conservation can be
  shown working.

## Risks

- **Bundle:** the showroom chunk carries the viewer, d3, react-window and about 190 KB of example
  GenBank text. It loads only on request; measure it and keep the greeter chunk unchanged.
- **Fidelity drift:** the rebuilt top bar and sidebar can drift from the real ones. They copy
  labels and order from the real components, and the screenshot check compares them.
- **Reused components assume desktop:** `SearchPanel` and `AlignRemoteModal` are sized for a
  desktop sidebar and modal. The showroom shows them in a drawer and a scaled sheet; if either does
  not fit at 390 px height, it gets a scrolling container rather than changes to the component.
