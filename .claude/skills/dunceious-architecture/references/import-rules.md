# Layer import rules (quick reference)

> Extract of `ARCHITECTURE.md` §2 (import rules) and the design spec §4.
> **Canonical source:** [`../../../../ARCHITECTURE.md`](../../../../ARCHITECTURE.md). If this drifts, it wins.

Imports only ever point **down** this stack — never sideways-up:

```
domain  ←  core  ←  workers/handlers  ←  app
```

| Layer | MUST import only | MUST NOT import |
|---|---|---|
| `src/domain/**` | `domain` | DOM, React, `core`, `workers`, `app` |
| `src/core/**` | `domain` | `workers`, `app`, React, DOM |
| `src/workers/**` | `core`, `domain`, own `protocol` | `app`, React, DOM |
| `src/app/**` | anything below it | — (top layer; owns all React + DOM + browser I/O) |

**Why:** the pre-restructure root `services/*` depended on the worker `protocol` (a pure-logic →
worker inversion), and a single bio operation crossed the root↔`src` boundary three times. Moving
the worker bodies into `src/workers/handlers/` and `services/` into `src/core/` removed the
inversion. These boundaries are **ESLint-enforced** (an import-boundary `no-restricted-imports`
rule plus `max-lines` at `error`).

## One canonical home per type

Never declare a second copy of a shared shape. If you need a type, import it from its home.

| Type kind | Canonical home |
|---|---|
| Biology model types (`SeqRecord`, `BioFeature`, `SearchResult`, `QuantitativeTrack`, …) | `src/domain/bio/types.ts` |
| Worker wire contracts (`BioWorkerRequest`/`Response`, `SearchWorkerRequest`/`Response`, `SearchOptions`, FASTA aligned-record shape) | `src/workers/protocol.ts` (referencing domain types) |

Known duplicates the restructure collapses (do not reintroduce): `SearchResult`,
`SearchOptions`, and the FASTA aligned-record `Pick<>` shape.
