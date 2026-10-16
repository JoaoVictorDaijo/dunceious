# Production browser regression

`npm run test:e2e` builds the application, starts a local Vite preview on port 4173,
and exercises the compiled app in Chromium with real bio/search workers. It covers
FASTA and GFF3 import, a reverse-strand annotation, alignment overlay, Hub editing
and navigation, sequence search, original/aligned FASTA, GenBank/GFF3 coordinates,
and format-2 project export/reload. An earlier project format must be refused
without changing the workspace. `showroom.spec.ts` drives the phone test drive with touch
emulation, portrait then landscape, and checks that it requests nothing from another origin and
opens no other page.

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
