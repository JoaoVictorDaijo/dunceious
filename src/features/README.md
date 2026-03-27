# src/features

Feature-first modules for the Dunceious application.

Each feature folder follows this structure:

```
feature/
  components/   UI components specific to the feature
  hooks/        React hooks that own the feature's stateful logic
  services/     Pure orchestration / use-case logic
```

## Features

| Folder       | Responsibility                                         |
|--------------|--------------------------------------------------------|
| `alignment/` | Alignment workflow: gap insertion, consensus, params   |
| `ingestion/` | File loading: GenBank, FASTA, BED, GFF3                |
| `search/`    | Exact / IUPAC / fuzzy (Smith-Waterman) search workflow |
| `viewer/`    | Genome viewport, selection, zoom, panning              |

> **Phase status**: These directories are scaffolded and ready for Phase 3
> (hook extraction from `App.tsx`) and Phase 4 (parser modularisation).
> Components and hooks currently live in `src/app/` and will be migrated
> incrementally without behaviour changes.
