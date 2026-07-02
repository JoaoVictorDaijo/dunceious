# Where does X go? (decision guide)

> Extract of `ARCHITECTURE.md` §2 (extension rules). **Canonical source:**
> [`../../../../ARCHITECTURE.md`](../../../../ARCHITECTURE.md). If this drifts, it wins.

**Decision, in one pass:**

1. Is it **pure biology model or algorithm** (no file formats, no DOM, no worker contract)? → `src/domain/bio/`.
2. Is it **pure format parsing/serialization or a search primitive**? → `src/core/` (`formats/`, `genbank/`, or `search/`). Imports `domain` only.
3. Does it **cross the worker boundary** (new request/response, or worker orchestration)? → `src/workers/` (`protocol.ts` for the contract; `handlers/` for the body).
4. Is it **React, a hook, view-logic, or browser I/O**? → `src/app/`.

If two seem to fit, pick the **lowest** layer it can live in without importing upward.

---

## Worked example 1 — adding a new file-format parser (e.g. VCF)

- **File:** `src/core/formats/vcf.ts` (a new format module alongside `fasta.ts` / `annotations.ts`).
- **May import:** `src/domain/bio/types` for the shapes it returns. Nothing from `workers`/`app`/React/DOM.
- **New shape?** If VCF needs a model type not already in `domain/bio/types.ts`, add it **there** (not in the parser). Do not invent a parser-local duplicate.
- **Wire it in:** the bio worker doesn't parse — it delegates. Call `parseVcf` from `src/workers/handlers/bio.ts` under the appropriate `PARSE_*` branch (add the branch + protocol message per example 2 if it's a new message).
- **AGPL header:** yes — it's a `.ts` file (18-line header identical to `vite.config.ts` lines 1-18).
- **Anti-pattern:** importing `protocol` from a `core/` parser (layer inversion) or reading `window`/`document` there.

## Worked example 2 — adding a new worker message type

- **Contract:** add the request + response interfaces to `src/workers/protocol.ts` and extend the relevant discriminated union (`BioWorkerRequest`/`BioWorkerResponse` or the search equivalents). Reference `domain/bio/types` for payload shapes — don't redeclare them.
- **Body:** handle the new `type` branch in the pure handler `src/workers/handlers/bio.ts` (or `search.ts`), returning the response — **not** in the worker's `onmessage`. The worker shell stays a one-liner: `self.onmessage = e => self.postMessage(handleBioMessage(e.data))`.
- **Dispatch:** post the typed request and consume the typed response from the owning hook in `src/app/hooks/` (e.g. `useBioWorker` / `useSearchWorker`).
- **Tests:** the handler is a pure function — unit-test it directly (see the existing handler tests). Protocol-shape tests live in `src/workers/__tests__/`.

## Worked example 3 — adding a new UI component

- **File:** `src/app/components/MyPanel.tsx` for an app-scoped panel/modal/nav element; or `src/app/viewer/` if it's part of the genome-viewer rendering (tracks, minimap, overlays).
- **May import:** anything below it — `core`, `domain`, hooks, other components. This is the only layer allowed React + DOM.
- **Barrel:** export it from `src/app/components/index.ts` if that barrel is how siblings are consumed.
- **AGPL header:** yes — `.tsx` is covered.
- **Anti-pattern:** putting rendering/React into `core` or `domain`; those layers must stay framework-free.

## Worked example 4 — adding a new domain algorithm

- **File:** `src/domain/bio/<name>.ts` (e.g. a new alignment or coordinate transform), exported from `src/domain/bio/index.ts`.
- **May import:** only other `domain/bio` modules. **No** DOM, React, `core`, `workers`, or `app`.
- **Types:** define/extend model types in `src/domain/bio/types.ts`; document the coordinate convention (0-based half-open; `start > end` means a circular wrap).
- **Consumption:** `core` and `workers/handlers` may call it; the app may call it via a worker or directly.
- **AGPL header:** yes — `.ts` is covered.
- **Anti-pattern:** a "domain" function that reaches into `services`/`core` or touches the worker `protocol` — that's a layering violation; invert the dependency so `core`/`workers` depend on `domain`, never the reverse.
