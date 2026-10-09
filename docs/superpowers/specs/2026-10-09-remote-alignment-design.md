# Remote alignment via EMBL-EBI — design

Branch: `feat/remote-alignment` · Date: 2026-10-09

## Goal

Dunceious already overlays a pre-aligned FASTA onto the loaded records
(`Upload Pre-aligned FASTA` → `PARSE_FASTA { asAlignment: true }` →
`applyFastaResponse`). This feature adds a second way to obtain that FASTA:
send the loaded records to the EMBL-EBI Job Dispatcher, let the user pick the
aligner, and feed the returned alignment into **the same** pre-aligned pipe.
The two pipes converge at `PARSE_FASTA { asAlignment: true }`; nothing
downstream (overlay validation, transposition, consensus) changes.

Hands-off is the product goal: one click, one choice (pre-selected), one email
the browser remembers, a progress view, and the alignment appears.

## The provider contract (verified live, 2026-10-09)

Base: `https://www.ebi.ac.uk/Tools/services/rest/{tool}`. Free, no API key,
no account, **no email verification** (a job runs immediately on submit).

| Call | Method | Success | Failure |
| --- | --- | --- | --- |
| `/{tool}/run` | `POST`, `application/x-www-form-urlencoded` | `200 text/plain` job id, e.g. `mafft-R20261009-164411-0503-68520297-p1m` | `400 text/xml` `<error><description>…</description></error>` |
| `/{tool}/status/{id}` | `GET` | `200 text/plain`: `QUEUED`, `RUNNING`, `FINISHED`, `ERROR`, `FAILURE`, `NOT_FOUND` | `400` XML error |
| `/{tool}/resulttypes/{id}` | `GET` | `200` XML; identifiers in `<identifier>…</identifier>` | `400` XML error |
| `/{tool}/result/{id}/{type}` | `GET` | `200` body | `400` XML error (e.g. `Job '…' is still queued`, `Requested renderer 'aln-fasta' not available…`) |

- **CORS:** every call above returned `Access-Control-Allow-Origin: *` for an
  `https://dunceious.pages.dev` origin; the `POST` preflight allows
  `content-type`. Call EBI directly from the browser — **no proxy**.
- **Unknown job id:** `status` answers `200 NOT_FOUND` (not an HTTP error).
- **Validation is synchronous.** Bad input comes back as `400` from `/run`
  with a human-readable description, never as a job. Observed messages:
  - `Please enter an email address`
  - `Please enter a valid email address`
  - `Invalid parameters: Sequence -> A minimum of 2 sequences is required`
  - `Invalid parameters: Sequence -> Entry found which does not contain a sequence: b. …`
  - `Invalid parameters: Sequence Type -> Value for "stype" is not valid: …`
- **Result type naming varies.** Normal jobs list both `aln-fasta` and `fa`;
  a 2-sequence MAFFT job listed **no `aln-fasta`** and carried the alignment
  under `out`. An `error` result type is present on **successful** MAFFT jobs
  (it is the program's stderr log); its presence is not a failure signal.
- **There is no cancel endpoint.** Abandoned jobs run to completion server-side.
- **Results are retained 7 days** (fetch immediately; no reliance on retention).
- **Fair use:** at most 30 jobs in flight per user; excessive use is handled
  under the EMBL-EBI Terms of Use (blocking possible, thresholds unpublished).
  Rate limiting is not documented: treat `429` and `5xx` as transient.
- **Attribution required** in services that use it.
- **Queue time varies.** Observed 5–12 s normally, one MAFFT job sat `QUEUED`
  ≥ 60 s (total 78 s for 2 × 10 bp). No hard client timeout may fail a job
  that is merely queued.

### Measured on `TESTE/` (3 coronavirus genomes, ~30 kb each, 90 KB)

| Engine | Total (submit → result) | Aligned length | Output order |
| --- | --- | --- | --- |
| Kalign | 24 s | 30,641 | input |
| MAFFT | 73 s | 32,116 | input (`order=input`) |
| Clustal Omega | 160 s | 32,796 | input (`order=input`) |
| MUSCLE | 237 s | 32,088 | **reordered** (no order parameter) |

All four: IDs preserved, equal lengths, gaps stripped == input.

## Engines

The user chooses the engine every time. No automatic fallback between engines.
MAFFT is pre-selected and carries a "Default" mark.

| id | Label | Subtext (UI copy) | Max seqs | Max bytes | Params (nucleotide / protein) |
| --- | --- | --- | --- | --- | --- |
| `mafft` *(default)* | MAFFT | Accurate and quick on whole genomes. The best general choice. | 500 | 1 MB | `stype=dna\|protein`, `format=fasta`, `order=input` |
| `kalign` | Kalign | Fastest, about 3× MAFFT. Slightly less precise on divergent sequences. | 2000 | 2 MB | `stype=dna\|protein`, `format=fasta` |
| `clustalo` | Clustal Omega | Takes the largest inputs. Slower on long genomes. | 4000 | 4 MB | `stype=dna\|protein`, `outfmt=fa`, `order=input` |
| `muscle` | MUSCLE | Accurate on small sets. Slowest on long sequences. | 500 | 1 MB | `format=fasta` (no `stype`) |

- Minimum is **2 sequences** for every engine (verified for MAFFT and Kalign;
  a `400` from EBI for the others is still handled).
- **Byte budget** = UTF-8 length of the submitted `sequence` field, compared
  against `1_000_000 × N` (decimal, conservative).
- An engine whose limits the session exceeds stays visible but disabled, with
  the reason as its subtext (e.g. `612 sequences — MAFFT takes up to 500`).
  If MAFFT is disabled, nothing is auto-selected for the user; the submit
  button stays disabled until they pick an enabled engine.
- `stype`: `protein` when `isProteinSession(records)`, else `dna` (RNA is sent
  as `dna`; EBI aligns U as a nucleotide).

## Submission payload

- **All** records are sent, visible or hidden, because the overlay rejects a
  FASTA that does not cover every loaded record (`reject-mismatch`). The
  dialog states the count, e.g. `3 sequences · 90 KB`.
- Send the **original ungapped** `record.sequence` (strip any `-`), never
  `alignedSequence`. Re-aligning replaces the current alignment; when one
  exists, the dialog says so.
- **Alias IDs.** Headers are `>s1`, `>s2`, … in record order, with a
  `Map<alias, recordId>` kept client-side. Real IDs never reach EBI; this
  avoids any header mangling and makes the remap exact.
- Line-wrap at 60 (cosmetic) and end with a trailing newline (EBI advises it).
- Fields: `email`, `title=dunceious`, `sequence`, plus the engine params.

## Result handling

1. Pick the result type from `resulttypes`, in order: `aln-fasta`, `fa`,
   `out`. None present → `no-alignment` failure.
2. Parse the body as FASTA (`core/formats/fasta.ts#parseFasta`). If the body
   does not start with `>` after trimming, try the next type in the list.
3. Validate before touching state:
   - alias set equals the submitted alias set;
   - all aligned lengths equal and > 0;
   - for every record, aligned sequence with gaps removed equals the
     submitted ungapped sequence (case-insensitive).
   Any failure → `invalid-result` with the specific reason.
4. Remap aliases → real IDs, serialize as FASTA, and post
   `{ type: 'PARSE_FASTA', content, asAlignment: true }` through the existing
   `postToWorker`. From here the pre-aligned pipe owns the outcome
   (`applyFastaResponse` + its existing logs).
5. **Stale-session guard.** Snapshot `[id, sequence]` of all records at submit.
   Before step 4, compare with the current records; if anything changed
   (records added, removed, or edited), discard the result with a `stale`
   message instead of overlaying.

## States the client must model

A single discriminated union drives the UI. No boolean soup.

```
idle
  → configuring                       (dialog open: engine + email)
  → submitting                        (POST /run in flight)
  → queued   { jobId, since }         (status QUEUED)
  → running  { jobId, since }         (status RUNNING)
  → fetching { jobId }                (resulttypes + result)
  → applying                          (posted to the worker)
  → done                              (dialog closes; log line)
  → failed   { reason, detail, jobId? }
  → cancelled { jobId? }
```

`failed.reason` is one of:

| reason | Trigger | User-facing message (gist) | Retry offered |
| --- | --- | --- | --- |
| `input-invalid` | local pre-check: < 2 records, over engine limits, empty sequence | specific limit | — (fix input / pick engine) |
| `email-invalid` | local check, or EBI `400` mentioning email | "EBI needs a valid email" | yes, after edit |
| `rejected` | `/run` `400` (any other description) | EBI's description verbatim | yes |
| `job-error` | status `ERROR` or `FAILURE` | "The aligner failed"; show the last lines of the `error` result if fetchable | yes |
| `job-lost` | status `NOT_FOUND` | "EBI no longer has this job" | yes |
| `no-alignment` | none of `aln-fasta`/`fa`/`out` yields FASTA | "EBI returned no alignment" | yes |
| `invalid-result` | validation in *Result handling* fails | which check failed | yes |
| `stale` | records changed while the job ran | "Records changed during alignment; result discarded" | yes |
| `network` | `fetch` rejects (offline, DNS, CORS, abort by timeout) | "Can't reach EBI" | yes |
| `http` | non-`400` HTTP error that survived retries (`429`, `5xx`, other) | status code + EBI description if XML | yes |

### Network policy

- **Submit is never retried automatically** (a retry could create a duplicate
  job). A network failure on submit → `network`; the user retries.
- **Polling** (`status`, `resulttypes`, `result`): transient failures
  (`fetch` rejection, `429`, `5xx`) are retried with backoff; after **5
  consecutive** transient failures → `network`/`http`. Honour `Retry-After`
  on `429`/`503` when present (seconds form), capped at 60 s.
- **Poll cadence:** 3 s for the first 30 s, then 5 s until 2 min, then 10 s.
- **Per-request timeout:** 30 s via `AbortSignal` (a slow single request is a
  transient failure, not a job failure).
- **No overall job timeout.** Long queues are normal; the progress view shows
  elapsed time and, after 2 min in `QUEUED`, a note: "EBI's queue is busy —
  you can keep waiting or cancel."
- **One job at a time** per tab (the trigger is disabled while a job runs).
- **Cancel** aborts in-flight requests and stops polling; the job keeps
  running at EBI (no cancel endpoint) — the log line says so.
- **Unload:** while a job is between `submitting` and `applying`, register a
  `beforeunload` prompt; leaving loses the job's result.
- Every `400` body is parsed for `<description>`; unparseable bodies fall back
  to the raw text, trimmed to 300 chars.

## UI

### Trigger

A new card in the Sidebar's Ingestion section directly under
`Upload Pre-aligned FASTA`, same card style, disabled while
`records.length < 2` or a job runs:

- icon `fa-wand-magic-sparkles` (or the closest existing FA 6 free icon);
- title `Align Sequences`;
- subtitle `MAFFT · Kalign · Clustal Ω · MUSCLE via EMBL-EBI`;
- `data-tip`: "Send the loaded sequences to EMBL-EBI for alignment, then
  overlay the result".

### Dialog (`AlignRemoteModal`)

Follows the existing modal language (`MoleculeTypeMismatchModal` structure,
current theme tokens; accents use `var(--env)` so it matches the session's
environment colour).

- **Header:** "Align with EMBL-EBI" · `N sequences · X KB · nucleotide|peptide`.
- **Engine list:** four selectable rows (radio semantics, keyboard
  navigable, `role="radiogroup"`). Each row: label, one-line subtext, limits
  in small mono text (`≤ 500 seqs · 1 MB`). MAFFT carries a small
  **Default** pill using the env accent. The selected row shows an accent
  border/seam.
- **Email:** single input, pre-filled from local storage; helper text:
  "EBI requires a contact email for each job. It is stored only in this
  browser." Basic shape check before enabling submit.
- **Privacy/attribution line:** "Your sequences are sent to EMBL-EBI's Job
  Dispatcher and processed under their terms of use." with a link to
  `https://www.ebi.ac.uk/about/terms-of-use/`.
- **Replace warning** when any record has `alignedSequence`.
- **Footer:** `Cancel` · `Align` (primary).

### Progress & outcome (same dialog, swaps body)

- Stage line: `Submitting…` → `Queued at EBI` → `Aligning (MAFFT)` →
  `Fetching result` → `Applying alignment`; elapsed timer; job id in small
  mono text (copyable).
- Indeterminate progress bar (EBI exposes no percentage).
- `Cancel` button throughout.
- On `failed`: message per the table, `Try again` (keeps engine + email) and
  `Close`.
- On `done`: dialog closes; the existing overlay log reports the result.
- The full-screen `ProcessingOverlay` is **not** used for the remote job
  (it would hide the cancel button); it still appears for the final local
  `PARSE_FASTA` step as today.

### Logs (via `addLog`)

`Remote alignment: submitted to EBI MAFFT (job <id>).`,
`Remote alignment: finished in 73 s.`, failures with reason and job id,
`Remote alignment cancelled (job <id> keeps running at EBI).`

## Architecture placement

Layer rules per `ARCHITECTURE.md`. Every new file carries the AGPL header.

| File | Layer | Contents |
| --- | --- | --- |
| `src/core/alignment/ebi.ts` (+ `index.ts`) | core | Pure: `ALIGNMENT_ENGINES` catalog (id, label, subtext, limits, `buildParams(moleculeKind)`), `DEFAULT_ENGINE`, `checkEngineLimits`, `buildSubmission(records) → { fasta, aliases, bytes }`, `parseEbiError(xml)`, `parseResultTypes(xml)`, `pickResultTypes`, `parseJobStatus(text)`, `remapAlignment(fasta, submission) → ok \| reason`. Imports `domain` and `core/formats/fasta` only. Takes plain `{ id, sequence }` inputs, not `SeqRecord`, where that suffices. |
| `src/app/lib/ebiClient.ts` | app | The only `fetch` caller: `submit`, `status`, `resultTypes`, `result`. Injected `fetch`, per-request timeout, maps responses to a typed `EbiResponse` (ok / http-400 with description / transient / network). |
| `src/app/logic/remoteAlignment.ts` | app | The job runner: an async function driving the state machine with injected `client`, `sleep`, `now`, `AbortSignal`, and an `onState` callback. All retry/backoff/poll-cadence logic lives here. Pure enough to unit-test with fakes. |
| `src/app/logic/alignEmailPref.ts` | app | `readAlignEmail` / `writeAlignEmail`, wrapped like `theme.ts` (`dunceious.alignEmail`). |
| `src/app/hooks/useRemoteAlignment.ts` | app | React glue: dialog open/close, state, `AbortController`, stale snapshot, `beforeunload`, final `postToWorker(PARSE_FASTA asAlignment)`. |
| `src/app/components/AlignRemoteModal.tsx` | app | The dialog (picker, email, progress, errors). Exported from `components/index.ts`. |
| `Sidebar.tsx`, `App.tsx` | app | Trigger card + wiring. |

No worker protocol change: the final step reuses `PARSE_FASTA`.
No new dependencies.

## Tests

No test hits the network. Follow the existing injected-dependency style.

- `src/core/alignment/__tests__/ebi.test.ts`: catalog/limits (boundaries at
  500/501, 1 MB ± 1 byte, min 2), `buildParams` per engine and molecule kind
  (MUSCLE has no `stype`), `buildSubmission` (aliases, ungapped, `-` stripped,
  trailing newline), `parseEbiError` (every observed message above, plus junk),
  `parseResultTypes`, `pickResultTypes` (`aln-fasta` > `fa` > `out`; `error`
  ignored), `parseJobStatus` (all six + unknown), `remapAlignment` (happy
  path, reordered output à la MUSCLE, missing alias, extra alias, unequal
  lengths, ungapped mismatch, lowercase output).
- `src/app/lib/__tests__/ebiClient.test.ts`: fake `fetch` for 200 / 400 XML
  / 429 with `Retry-After` / 503 / rejection / timeout abort.
- `src/app/logic/__tests__/remoteAlignment.test.ts`: fake client + fake clock
  covering every `failed.reason`, `QUEUED → RUNNING → FINISHED`, long queue
  with no timeout, 4 transient failures then success, 5 → failure, submit not
  retried, cancel mid-poll, `out`-only result types, `error` type present on a
  successful job.
- `src/app/logic/__tests__/alignEmailPref.test.ts`: as `clearConfirmationPref`.
- `src/app/components/__tests__/AlignRemoteModal.test.tsx` via
  `renderHarness`: MAFFT pre-selected with the Default mark, disabled engine
  shows its reason, submit disabled without email, replace warning, failure
  view shows message + Try again.

## Out of scope

- In-browser (WebAssembly) alignment.
- Engine parameters beyond the defaults above (strategy, gap penalties).
- Aligning a subset of records.
- Persisting a running job across reloads.
- A CSP (none exists today). If one is added later it needs
  `connect-src https://www.ebi.ac.uk`.

## Acceptance

- `npm run typecheck`, `npm run lint`, `npm run lint:headers`,
  `npm run test`, `npm run build` green.
- Manual: load `TESTE/*.gb`, run each engine once, alignment overlays; cancel
  mid-queue leaves the session untouched; wrong email shows EBI's message.
