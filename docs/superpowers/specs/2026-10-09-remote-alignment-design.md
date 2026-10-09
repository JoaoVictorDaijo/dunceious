# Remote alignment via EMBL-EBI — design

Branch: `feat/remote-alignment` · Date: 2026-10-09

## Goal

Dunceious already overlays a pre-aligned FASTA onto the loaded records
(`Upload Pre-aligned FASTA` → `PARSE_FASTA { asAlignment: true }` →
`applyFastaResponse`). This feature adds a second way to obtain that FASTA:
send the loaded records to the EMBL-EBI Job Dispatcher, let the user pick the
aligner, and feed the returned alignment into **the same** pre-aligned pipe.
The two pipes converge at the overlay reducer `applyFastaResponse(…, true)`
and its outcome logs (see *Convergence point*); nothing downstream (overlay
validation, transposition, consensus) changes.

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

- Minimum is **2 sequences** for every engine (EBI-verified for all four).
- **Byte budget:** see *Preflight validation* — the built 60-column payload
  must be ≤ 995,000 / 1,990,000 / 3,980,000 bytes.
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
4. Remap aliases → real IDs in memory and hand the records to the shared
   overlay (`applyFastaResponse` + the same outcome logs as `FASTA_SUCCESS`).
   See *Convergence point*.
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
| `input-invalid` | local preflight issue, or EBI `400` on count/size/empty entry | specific issue | — (fix input / pick engine) |
| `email-invalid` | EBI `400 Please enter a valid email address` (local structural failures never reach submit) | inline under the email field: "EBI could not verify this address's domain" | yes, after edit |
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

A dedicated **Alignment** section in the Sidebar, directly above **Sequence
Search**, uses the shared `SectionTitle` with `fa-wand-magic-sparkles`. A
primary control uses the environment accent (`var(--env)`) and the current
slate chrome, as a natural sibling of the other sections. It is enabled
whenever records are loaded (preflight explains blocks inside the dialog).

- control label `Align Sequences`;
- one-line subtitle `MAFFT · Kalign · Clustal Ω · MUSCLE via EMBL-EBI`;
- while a job runs, the control reads `Alignment running` and reopens the
  monitor; a compact live summary shows engine, current step, and elapsed time;
- `data-tip`: "Send the loaded sequences to EMBL-EBI's servers for alignment,
  then overlay the result"; while locked, "Locked while the EBI alignment runs".

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
  browser." Structural check per *Preflight validation → Email*.
- **Privacy/attribution:** superseded by *Data-sharing consent*.
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
- On `done`: the dialog closes (or the pill shows success); the shared
  overlay log reports the result.
- The full-screen `ProcessingOverlay` is **not** used for the remote job
  (it would hide the cancel button and the monitor).

### Logs (via `addLog`)

`Remote alignment: submitted to EBI MAFFT (job <id>).`,
`Remote alignment: finished in 73 s.`, failures with reason and job id,
`Remote alignment cancelled (job <id> keeps running at EBI).`

## Architecture placement

Layer rules per `ARCHITECTURE.md`. Every new file carries the AGPL header.

| File | Layer | Contents |
| --- | --- | --- |
| `src/core/alignment/preflight.ts` | core | Pure: `validateEmail`, `preflightAlignment` (see *Preflight validation*). |
| `src/core/alignment/ebi.ts` (+ `index.ts`) | core | Pure: `ALIGNMENT_ENGINES` catalog (id, label, subtext, limits, `buildParams(moleculeKind)`), `DEFAULT_ENGINE`, `checkEngineLimits`, `buildSubmission(records) → { fasta, aliases, bytes }`, `parseEbiError(xml)`, `parseResultTypes(xml)`, `pickResultTypes`, `parseJobStatus(text)`, `remapAlignment(fasta, submission) → ok \| reason`. Imports `domain` and `core/formats/fasta` only. Takes plain `{ id, sequence }` inputs, not `SeqRecord`, where that suffices. |
| `src/app/lib/ebiClient.ts` | app | The only `fetch` caller: `submit`, `status`, `resultTypes`, `result`. Injected `fetch`, per-request timeout, maps responses to a typed `EbiResponse` (ok / http-400 with description / transient / network). |
| `src/app/logic/remoteAlignment.ts` | app | The job runner: an async function driving the state machine with injected `client`, `sleep`, `now`, `AbortSignal`, and an `onState` callback. All retry/backoff/poll-cadence logic lives here. Pure enough to unit-test with fakes. |
| `src/app/logic/alignEmailPref.ts` | app | `readAlignEmail` / `writeAlignEmail`, wrapped like `theme.ts` (`dunceious.alignEmail`). |
| `src/app/hooks/useRemoteAlignment.ts` | app | React glue: dialog open/close, state, `AbortController`, stale snapshot, `beforeunload`, final hand-off to the shared overlay (see *Convergence point*), `isAlignmentLocked`. |
| `src/app/components/AlignRemoteModal.tsx` | app | The dialog (picker, email, progress, errors). Exported from `components/index.ts`. |
| `Sidebar.tsx`, `App.tsx` | app | Trigger card + wiring. |

No worker protocol change: the final step reuses the overlay reducer
(see *Convergence point*).
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

## Preflight validation (amendment, 2026-10-09)

Nothing is sent to EBI until a local preflight passes. EBI's own `400`
validation stays as a backstop, never as the first line.

### Contract truth table (measured 2026-10-09, zero jobs created)

Sources, in order of authority: (1) EBI's behaviour, measured by posting
requests that carry one invalid parameter so EBI always answers `400` and its
message shows which other fields passed; (2) the per-tool Swagger 2.0 spec at
`/Tools/services/rest/{tool}?json` (parameter names, enums, required fields);
(3) prose docs. Where they disagree, (1) wins. Validation order observed: the
email is checked first and alone; all other parameters are then checked
together and every failure is listed.

| Field | EBI accepts | EBI rejects (message) |
| --- | --- | --- |
| `email` | ASCII local parts incl. `+ _ - .`, even `a..b`, `.a`, `a.`, 65 chars; uppercase; any domain **that exists in DNS** (`gmail.com`, `ebi.ac.uk`, `hotmail.co.uk`, `uol.com.br`, `google.museum`, `my-domain.com`); a trailing `.` | non-existent domains (`x.info`, `zzqq…12345.com`, `sub.example.com`), hosts without mail records (`mail.google.com`), `localhost`, IP literals, quoted local parts, display names, non-ASCII, spaces (incl. leading/trailing), `a@@x`, `x..com` → `Please enter a valid email address` |
| sequence count | 2 … max | `< 2` → `A minimum of 2 sequences is required`; `> max` → `Maximum {max} sequences allowed` (max: MAFFT 500, Kalign 2000, Clustal Ω 4000, MUSCLE 500 — all four verified at the boundary) |
| payload size | ≤ limit (see below) | `Input is too big, limit is {N}MB` |
| empty record | — | `Entry found which does not contain a sequence: {id}. …` |
| alphabet | **anything**: digits, `@`, `*` (trailing or internal), spaces, `.`, `-`, IUPAC, lowercase, `U`, `BZXJUO` | not validated at submission |
| `stype` vs content | not cross-checked (`dna` with protein accepted and vice versa) | — |
| enum params | Swagger enum values | `Invalid parameters: … should be one of the restricted values: …` |

Payload size: the documented "N MB" is **not** the raw `sequence` field —
a 999,999-byte single-line field is rejected by MAFFT. Bisection (1 KB
resolution) shows EBI re-formats the input to 60-column FASTA and limits
**that** to N × 1,000,000 bytes:

| Tool | Largest accepted single-line field | Same residues as 60-col FASTA | Limit |
| --- | --- | --- | --- |
| MAFFT / MUSCLE | 983,113 B | 999,497 B | 1,000,000 B |
| Kalign | 1,966,796 B | ≈ 1,999,586 B | 2,000,000 B |
| Clustal Ω | 3,934,179 B | ≈ 3,999,749 B | 4,000,000 B |

Dunceious rule: measure the payload **as built** (alias headers `>sN`,
60-column lines, `\n` endings, trailing newline) and require
`bytes ≤ 0.995 × N × 1,000,000` (995,000 / 1,990,000 / 3,980,000). The 0.5 %
margin absorbs EBI's unseen header normalisation; EBI's
`Input is too big, limit is NMB` stays the backstop and maps to `input-invalid`.

### Email (Dunceious side)

- Inline, as the user types (error shown after first blur or submit attempt);
  `Align` disabled while invalid. Purely structural — no network call.
- Structure, inspired by class-validator `@IsEmail()` but **bounded by the
  truth table above, never stricter than EBI** on what EBI accepts:
  trimmed for checking but the user is told to remove surrounding spaces
  (EBI rejects them, so we send the trimmed value); exactly one `@`;
  ASCII only; no spaces, quotes or `<…>` display names; local part ≥ 1 char
  with **no 64-char cap** (EBI accepted 65), total ≤ 254;
  dots in the local part are allowed anywhere (EBI accepts `a..b`, `.a`);
  domain = ≥ 2 labels of letters/digits/hyphen, no empty labels, final label
  letters only, ≥ 2 chars; a single trailing `.` allowed; no IP literals.
- EBI additionally verifies the **domain exists** (DNS). The client cannot
  replicate that; the authoritative answer is EBI's synchronous `400 Please
  enter a valid email address` on submit (no job is created). The runner
  maps it to `email-invalid`, the dialog returns to the configuring view
  with the error **inline under the email field** ("EBI could not verify
  this address's domain"), engine choice kept. Never probe EBI with poisoned
  requests from the app to pre-check emails (undocumented behaviour).
- After a successful submit, remember the email as `verified` in local
  storage, so the field shows a quiet check next time.
- `validateEmail(raw) → { ok: true, value } | { ok: false, reason: 'empty' | 'format' | 'too-long' | 'whitespace' }`
  in `src/core/alignment/preflight.ts`.

### Sequences, per engine

`preflightAlignment(records, engineId) → { ok: true, submission } | { ok: false, issues: Issue[] }`
in `src/core/alignment/preflight.ts`, pure, run for **every** engine when the
dialog opens (and whenever records change) so each engine row shows its own
verdict. `buildSubmission` runs only from a passing preflight.

Checks, all reported (not first-failure-only), each issue carrying a code,
a user-facing message, and the offending record IDs where relevant:

| Code | Rule | Applies to |
| --- | --- | --- |
| `too-few` | fewer than 2 records (EBI-verified min 2 for all four) | all |
| `too-many` | more records than the engine max (500 / 2000 / 4000 / 500, EBI-verified) | per engine |
| `too-large` | UTF-8 bytes of the exact `sequence` field that would be posted > engine max (1 / 2 / 4 / 1 MB, decimal) | per engine |
| `empty-sequence` | EBI-verified: a record whose sequence is empty after removing gaps (`-`, `.`) and whitespace | all |
| `invalid-characters` | **Dunceious guard, not an EBI rule** (EBI accepts any text and the aligner may drop or alter non-residue characters, which our round-trip check would only catch after the job ran): characters outside the session alphabet after removing gaps/whitespace, case-insensitive. Nucleotide: IUPAC `ACGTU RYSWKM BDHV N`. Protein: `ACDEFGHIKLMNPQRSTVWY BXZJUO`, plus `*` **only** as a single trailing stop, which is stripped before sending. List up to 5 offending record IDs and the distinct bad characters. | all |
| `internal-stop` | Dunceious guard: protein record with `*` before its last residue | all (protein) |

- The byte check measures the payload as built (alias headers, 60-column
  wrapping, newlines), which is the form EBI measures.
- Engine rows: an engine whose preflight fails is disabled and its subtext
  becomes the first issue's message (`612 sequences — MAFFT takes up to 500`);
  the full issue list is shown under the engine list when the **selected**
  engine fails. Issues that apply to all engines (`too-few`, `empty-sequence`,
  `invalid-characters`, `internal-stop`) are shown once at the top, and
  `Align` stays disabled.
- The Sidebar trigger stays enabled with ≥ 2 records; preflight explains any
  block inside the dialog rather than silently disabling the card.

### Tests (add to the spec's test list)

- `validateEmail`: one case per truth-table row — every address EBI accepted
  that is structurally checkable must pass (incl. `a..b@x.com`, 65-char local
  part, `a@x.com.`, `user+tag@gmail.com`), every structural rejection must
  fail (`a@localhost`, IP literal, quoted, display name, non-ASCII, spaces,
  `a@@x.com`, `a@x..com`, 1-letter TLD). Domain-existence cases are **not**
  client-testable and are documented as EBI-side.
- Runner: EBI `400 Please enter a valid email address` → `email-invalid` and
  returns to configuring with the email error set; a successful submit marks
  the email verified.
- `preflightAlignment`: each issue code at its boundary (2 vs 1 records;
  500 vs 501; built payload exactly at 995,000 bytes vs +1, and a case proving
  wrapping newlines are counted); multiple issues reported together; nucleotide IUPAC incl. `U` and
  lowercase passes; `@`/digits fail with IDs listed; protein trailing `*`
  stripped, internal `*` fails; gaps in `sequence` ignored; per-engine
  verdicts differ for the same records (e.g. 1500 records: Kalign/Clustal Ω
  ok, MAFFT/MUSCLE `too-many`).
- `AlignRemoteModal`: inline email error after blur, `Align` disabled while
  invalid; an engine failing preflight renders disabled with its reason;
  a global issue disables `Align` and is listed.

## Job monitor (amendment, 2026-10-09)

The progress view becomes a proper monitor of the API steps, and it can be
minimized so the user keeps browsing while EBI works.

### Stepper (inside the dialog)

A vertical stepper with one row per stage, driven by the state machine:

| Step | Enters when | Row detail |
| --- | --- | --- |
| Validated | preflight passed | engine, `N sequences · X KB` |
| Submitted | `/run` returned a job id | job id (mono, copy button) |
| Queued at EBI | first `QUEUED` | time in queue; after 2 min: "EBI's queue is busy" note |
| Aligning | first `RUNNING` | time running |
| Fetching result | `FINISHED` | chosen result type (`aln-fasta`/`fa`/`out`) |
| Applied | the shared overlay accepted the records | aligned length |

- Each row: status icon (pending / active / done / failed / skipped), the
  wall-clock time it was entered, and its duration once left. A step EBI skips
  (e.g. a job that goes straight to `RUNNING`) shows as *skipped*, not done.
- The active row pulses with the env accent (`motion-reduce`: static).
- A footer line shows poll transparency: `Last checked 3 s ago · next check in 5 s`.
  During transient-failure retries: `Connection hiccup — retrying (2/5)`.
- On failure the failed row turns rose with the reason message; rows after it
  stay pending. `Try again` and `Close` as before.
- Total elapsed timer in the header.

Step timestamps live in the runner state (`steps: Record<StepId, { status, enteredAt?, leftAt? }>`)
so the stepper is a pure render of state and is unit-testable.

### Minimized pill

- `Minimize` (and Escape / backdrop click while a job runs) collapses the dialog
  to a small floating pill (bottom-right, same visual family as
  `HubReturnPill`): engine, current step, elapsed, a tiny progress dot. Click
  reopens the dialog. Escape never cancels a job; only the `Cancel` button does.
- On success the pill shows `Aligned · 73 s` with a check, then fades after
  ~4 s. On failure it stays (rose) until opened.
- The pill is `role="status"` with `aria-live="polite"` announcing step changes.

## Concurrency: lock while a job runs (amendment, 2026-10-09)

Decision: **one remote job at a time, and nothing that changes the record set
or sequences may run while it does.** Overlapping jobs would race into the same
overlay and the last to finish would silently win.

Locked while a job is between `submitting` and `applying`:
- the `Align Sequences` card (shows "Alignment running" and opens the monitor);
- `Upload Pre-aligned FASTA`;
- batch ingest (`Drop Input Batch`), `Load Project JSON`;
- `Clear All` and per-record remove.

Each locked control is visibly disabled with a `data-tip`: "Locked while the
EBI alignment runs". Viewing, navigation, search, selection, annotations,
feature edits and exports stay available (they do not change `id`/`sequence`;
the overlay preserves features).

One source of truth: `useRemoteAlignment` exposes `isAlignmentLocked`, and
each locked handler also early-returns on it (UI-only disabling is not enough).
The stale-session guard stays as the backstop.

**Future (out of scope):** multiple concurrent jobs whose results land as
named *candidate alignments* the user applies explicitly, instead of
auto-overlaying. The lock is the safe default until then.

### Tests (additions)

- Runner: `steps` timestamps/durations for QUEUED→RUNNING→FINISHED, a job that
  skips QUEUED (step marked skipped), retry counter surfaced in state, poll
  timing fields.
- Stepper render: active/done/failed/skipped rows; busy-queue note after 2 min.
- Pill: minimize/reopen; success fade; failure persists; Escape minimizes
  instead of cancelling.
- Lock: each locked handler is a no-op while locked; controls disabled with
  the tip; unlocked again after done/failed/cancelled.

## Convergence point (amendment, 2026-10-09)

Supersedes *Result handling* step 4. Record IDs may contain spaces
(`makeUniqueId` produces `seq1 (1)`), and `parseFasta` keeps only the first
header token, so serializing remapped IDs back to FASTA text cannot
round-trip. The remote path therefore converges **one step later**, at the
overlay reducer, not at `PARSE_FASTA`:

- The runner already parses EBI's alias FASTA (`s1…sN`) to validate it; it
  remaps aliases to the exact record IDs in memory and produces
  `FastaAlignedRecord[]`.
- Those records go through the **same** `applyFastaResponse(prev, records, true)`
  and the **same** outcome logging the `FASTA_SUCCESS` branch of
  `useBioWorker` uses. Extract that branch's reducer call + logging into one
  shared function (e.g. `applyAlignmentOverlay(records, source)` returned by
  `useBioWorker`), used by both the worker response and the remote runner, so
  the pre-aligned and remote pipes share validation, overlay and logs.
- **No change to `parseFasta`, the `PARSE_FASTA` handler, or the worker
  protocol.** Revert any edits to `src/core/formats/fasta.ts`,
  `src/workers/handlers/bio.ts` and the `record.name` fallback in
  `src/app/logic/bioResponse.ts`.
- Out of scope, reported separately: the manual *Upload Pre-aligned FASTA*
  path has the same pre-existing limitation for IDs containing spaces.

## Data-sharing consent (amendment, 2026-10-09)

Dunceious otherwise never sends sequences anywhere; this feature is the one
exception, so it is gated behind an explicit, informed acknowledgement.
EMBL-EBI's own Job Dispatcher privacy notice names **consent** as its lawful
basis, which is one more reason the user must agree before the first upload.

### What EMBL-EBI states (Job Dispatcher privacy notice, published 2022-11-25)

- Collected: email address, IP address, date/time, operating system, browser,
  amount of data transmitted.
- Job logs and the associated email are deleted after **7 days**; web logs
  with IPs are kept **30 days**, then anonymised.
- Access: authorised EMBL-EBI staff; no transfers to third countries.
- Links (both open in a new tab, `rel="noreferrer"`):
  - Privacy notice: `https://www.ebi.ac.uk/jdispatcher/assets/html/privacy-notice.pdf`
  - Terms of use: `https://www.ebi.ac.uk/about/terms-of-use/`

### Consent step

The first time the dialog opens in a browser it shows a consent step
**instead of** the engine picker:

- Title: **"Your sequences will leave this browser"**.
- Body (concise bullets):
  - "Everything else in Dunceious runs locally. Alignment is the exception:
    all loaded sequences, including hidden ones, are uploaded to EMBL-EBI's
    Job Dispatcher servers in the UK and aligned there."
  - "EMBL-EBI also receives your email and IP address. Per its privacy
    notice, job logs and your email are deleted after 7 days and web logs
    after 30 days."
  - "Don't send sequences you are not allowed to share, such as unpublished,
    confidential or patient-derived data."
  - Links: "EMBL-EBI privacy notice" · "Terms of use".
- A required checkbox: **"I understand that my sequences and email will be
  sent to EMBL-EBI and handled under its terms of use and privacy notice."**
- Footer: `Cancel` · `Continue` (disabled until the box is checked).
  Continue records consent and swaps to the engine picker.
- Accessibility: the step is the dialog's content (same focus trap); the
  checkbox has a proper `<label>`; the links are reachable by keyboard.

### Persistence: once per browser, versioned, revocable

- `src/app/logic/alignConsentPref.ts`, wrapped like `theme.ts`:
  `readAlignConsent(): { acceptedAt: string } | null`,
  `writeAlignConsent(now)`, `clearAlignConsent()`. Key
  `dunceious.alignConsent`, value `{ version, acceptedAt }`.
- `ALIGN_CONSENT_VERSION` (start at `1`) lives next to the consent copy.
  A stored record with another version counts as **no consent**, so editing
  the disclosure text means bumping the version and re-asking everyone.
- Storage blocked or throwing → consent is held in memory for the session
  only (the step reappears next visit); never crash.
- After consent, the configuring view starts with one quiet line:
  "Sending to EMBL-EBI · agreed {date} · **Review**" where Review reopens the
  consent step showing the current state, with a **Revoke** action that
  clears the record and keeps the dialog on the consent step.
- This replaces the earlier one-line privacy/attribution paragraph under the
  email field.

### Enforcement

- Consent is a precondition of **submit**, enforced in
  `useRemoteAlignment.submit` (early return without a valid consent), not
  only by hiding UI. No request is ever made to EBI before consent.
- The Sidebar card's tip becomes "Send the loaded sequences to EMBL-EBI's
  servers for alignment, then overlay the result".

### Tests

- `alignConsentPref`: none stored → null; current version → record; other
  version → null; write/clear round-trip; blocked storage → in-memory, no throw.
- `AlignRemoteModal`: first open shows the consent step with both links and
  `Continue` disabled; checking enables it; Continue shows the engine picker;
  with stored consent the picker shows directly with the "agreed" line;
  Review → Revoke returns to the consent step and clears storage.
- Hook/integration: `submit` without consent makes **no** `client.submit`
  call; after consent it does.

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
