# Production browser regression

`npm run test:e2e` builds the application, starts a local Vite preview on port 4173,
and exercises the compiled app in Chromium, Firefox and WebKit with real bio/search workers. It covers
FASTA and GFF3 import, a reverse-strand annotation, alignment overlay, Hub editing
and navigation, sequence search, original/aligned FASTA, GenBank/GFF3 coordinates,
and format-2 project export/reload. An earlier project format must be refused
without changing the workspace. `showroom.spec.ts` drives the phone test drive with touch
emulation, portrait then landscape, and checks that it requests nothing from another origin and
opens no other page. `fuzzySearch.spec.ts` runs fuzzy search on the bundled SARS-CoV-2 genome in the
built search worker: a mutated 300- and 1000-base query must be found by identity within seconds.

`realSequences.spec.ts` imports every bundled GenBank example (4× CPU slowdown on Chromium, native speed on Firefox/WebKit),
checks annotation Focus, exact and mutated fuzzy subsequences, reverse strands,
the 100-result cap and clearing, and verifies both search modes dispatch to real
workers. Each case attaches elapsed time and main-thread long-task observations;
these include browser automation and rendering costs, so they are diagnostic
measurements rather than fixed performance thresholds.

To include a local directory of additional GenBank files (such as `TESTE`), set
`PLAYWRIGHT_SEQUENCE_DIR` to its absolute path. Each file runs separately, followed
by a combined session; the directory must contain compatible molecule types:

```sh
PLAYWRIGHT_SEQUENCE_DIR=/absolute/path/to/TESTE npm run test:e2e
```

An unset directory runs the bundled examples only. An invalid configured path
fails discovery rather than silently skipping the requested data.

After `npm ci`, install matching browsers with `npx playwright install --with-deps chromium firefox webkit`.
Run one engine with `npm run test:e2e:run -- --project=firefox` after building. CI runs each project in its own matrix job.

Native multi-touch injection in `touch.spec.ts` requires CDP: its cases remain unchanged on Chromium and are explicitly skipped on Firefox/WebKit. Responsive touch/tap journeys still run on all engines. Forced-colors emulation is Chromium-only. Long-task observations are collected only where the engine supports them; CPU throttling is unavailable outside Chromium.
To use an existing Chromium executable for the Chromium project:

```sh
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e:run -- --project=chromium
```

This is a local build check, not a deployment. It does not submit sequences to
remote alignment services, and it can't reach any other origin by accident:

- **Every spec imports `test` and `expect` from `e2e/fixtures.ts`.** Its guard aborts any request
  or WebSocket to another origin, before it reaches the network, and fails the test that made it.
  ESLint rejects a direct `@playwright/test` import under `e2e/`.
- **A redirect can't be aborted.** Routing sees only a redirect's first URL. A same-origin
  response that redirects to another origin still fails the test, but the redirected request
  isn't stopped. The preview server issues no such redirects.
- **Workers can't open WebSockets.** Playwright can't route a WebSocket opened in a worker, so
  ESLint keeps `WebSocket` out of `src/`. The page's WebSockets are closed by the guard.
- **`networkIsolation.spec.ts` checks the guard itself** in every engine. It sends requests from the
  page and from a worker, opens a WebSocket, and checks that an attempt left unconsumed fails its
  test. It also follows a faked redirect in Chromium and Firefox; Playwright's WebKit can't fake
  one.
- **`playwright.config.ts` blocks service workers,** because request interception can't see what
  a service worker answers.

The existing unit/component/integration suite remains
`npm test`; browser tests run separately. Failure traces and downloaded-test
artifacts live in ignored `test-results/`. Automated coverage does not replace visual review of the mobile shell.
