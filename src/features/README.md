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

> **Phase status**: These directories are scaffolded and ready for future hook
> and component extraction from `src/app/`. All active code currently lives in
> `src/app/` and `src/app/components/`; migration proceeds incrementally
> without behaviour changes.
