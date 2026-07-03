# Folder structure (quick reference)

> Extract of `ARCHITECTURE.md` §2. **Canonical source:** [`../../../../ARCHITECTURE.md`](../../../../ARCHITECTURE.md).
> If this drifts, `ARCHITECTURE.md` wins. See §10 there for the restructure phase history.

All source lives under `src/`, in four layers. Imports point only **down** the stack:
`domain ← core ← workers/handlers ← app`.

```
src/
├── domain/bio/          # Pure biology model + algorithms. Imports NOTHING outside domain.
│   ├── types.ts         # Canonical model types (+ coordinate-convention docs)
│   ├── coordinate.ts    # transposition, aligned-segment building
│   ├── consensus.ts
│   ├── intervals.ts     # clip/split/wrap — the ONE clipInterval; splitWrapAround
│   ├── sequence.ts      # reverseComplement, translate + GENETIC_CODE, molecule-type
│   │                    #   detection, gap↔ungapped mapping, sessionMoleculeType
│   └── index.ts         # barrel
│
├── core/                # Pure format/search logic (was root services/). Imports domain only.
│   ├── genbank/         # read sub-parsers + serialize.ts (exportToGenBank)
│   ├── formats/         # fasta.ts (parse + exportToFasta), annotations.ts (BED/GFF3/BedGraph + exportToGff)
│   └── search/          # query.ts (degenerate→regex), align.ts (smithWaterman), exact.ts, fuzzy.ts — NO protocol import
│
├── workers/             # Thin shells + typed contracts + worker bodies.
│   ├── protocol.ts      # message contracts (may reference domain types)
│   ├── bio.worker.ts / search.worker.ts    # thin shells: postMessage(handler(e.data))
│   └── handlers/
│       ├── bio.ts       # handleBioMessage — orchestrates core + domain
│       └── search.ts    # runSearch + collectSeededFuzzyHits
│
└── app/                 # The React application. May import everything below it.
    ├── main.tsx + index.css   # entry (moved from root; index.html updated)
    ├── App.tsx          # composition root
    ├── logic/           # pure reducers/view-model (+ recordRemoval, runInlineSearch)
    ├── hooks/
    ├── components/      # modals, panels, nav, sidebar
    ├── viewer/          # GenomeViewer decomposed: slim container + layout.ts + tracks/ + Minimap + hooks + colors.ts
    └── lib/download.ts  # downloadBlob (the one DOM-coupled fn, kept out of core)
```

**Per layer, in one line:**

| Layer | Purpose | May import |
|---|---|---|
| `domain/bio` | Pure biology model + algorithms (types, coordinates, consensus, intervals, sequence) | only `domain` |
| `core` | Pure format parsing/serialization + search primitives (no DOM, no worker contract) | `domain` |
| `workers` | Typed `protocol` + thin worker shells + `handlers/` bodies that orchestrate `core` + `domain` | `core`, `domain`, own `protocol` |
| `app` | React UI, hooks, pure view-logic, the decomposed viewer, and all browser I/O | anything below it |

Root keeps only configs, `index.html`, `docs/`, `bench/`, `perf/`, `scripts/`, `.github/`. Root
`components/`, `services/`, and `types.ts` are gone.
