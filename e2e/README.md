# Production browser regression

`npm run test:e2e` builds the application, starts a local Vite preview on port 4173,
and exercises the compiled app in Chromium with real bio/search workers. It covers
FASTA and GFF3 import, a reverse-strand annotation, alignment overlay, Hub editing
and navigation, sequence search, original/aligned FASTA, GenBank/GFF3 coordinates,
and format-2 project export/reload. An earlier project format must be refused
without changing the workspace. `showroom.spec.ts` drives the phone test drive with touch
emulation, portrait then landscape, and checks that it requests nothing from another origin and
opens no other page. `fuzzySearch.spec.ts` runs fuzzy search on the bundled SARS-CoV-2 genome in the
built search worker: a mutated 300- and 1000-base query must be found by identity within seconds.

`realSequences.spec.ts` imports every bundled GenBank example at 4× CPU slowdown,
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

After `npm ci`, install the test browser with `npx playwright install chromium`.
An existing Chromium can be used instead:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

This is a local build check, not a deployment. It does not submit sequences to
remote alignment services. The existing unit/component/integration suite remains
`npm test`; browser tests run separately. Failure traces and downloaded-test
artifacts live in ignored `test-results/`. Chromium coverage does not certify every
supported browser or replace visual review of the mobile shell.
