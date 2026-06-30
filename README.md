# Dunceious

> **Intelligence is Overpriced.**
> **Invest in coffee and staff, not in genial expensive software.**

Dunceious is a high-performance, browser-based bioinformatics platform for **Multi-Sequence Alignment (MSA) visualization**, annotation management, and sequence analysis. It parses GenBank and FASTA files, runs sequence alignment, renders an interactive genome viewer with semantic zoom, and provides both exact (IUPAC degenerate codes) and fuzzy (Smith-Waterman) sequence search — all without a backend.

For a full feature description see [`DOCUMENTATION.md`](./DOCUMENTATION.md), for the technical design see [`ARCHITECTURE.md`](./ARCHITECTURE.md), and for usage instructions see [`USER_MANUAL.md`](./USER_MANUAL.md).

---

## Prerequisites

| Requirement                    | Minimum version    |
| ------------------------------ | ------------------ |
| [Node.js](https://nodejs.org/) | **18** (or later)  |
| npm                            | Ships with Node.js |

> **Why Node.js 18?** The project uses Vite 6 and React 19, both of which require Node.js 18+.

There are many ways to install Node.js, but we recommend **NVM (Node Version Manager)** as it lets you install and switch between Node versions without touching your system install. Use [nvm](https://github.com/nvm-sh/nvm) on Linux and macOS, or [nvm-windows](https://github.com/coreybutler/nvm-windows) on Windows.

Once NVM is installed, run `nvm install --lts` to install the latest LTS release of Node.js. npm is bundled with it, so that single command is everything you need to install and run Dunceious.

---

## Installation & Local Development

> Make sure you have **Node.js 18+** installed before running any of the steps below — see [Prerequisites](#prerequisites).

### 1. Clone the repository

```bash
git clone https://github.com/JoaoVictorDaijo/dunceious.git
cd dunceious
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the development server

```bash
npm run dev
```

The app will be available at **http://localhost:3000**. The dev server supports hot-module replacement (HMR), so your changes are reflected instantly.

---

## Available Scripts

| Command           | What it does                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`     | Start the Vite development server on port 3000                                                                                                        |
| `npm run build`   | Type-check and bundle the app — useful for catching build-time errors or verifying a change compiles cleanly                                          |
| `npm run preview` | Serve the last `npm run build` output locally — useful for testing a built artifact                                                                   |
| `npm run typecheck` | Type-check the codebase with `tsc --noEmit` — no output means no type errors                                                                        |
| `npm run lint`      | Run ESLint over the codebase (`eslint .`)                                                                                                            |
| `npm test`        | Run the unit test suite (excludes benchmarks)                                                                                                         |
| `npm run perf`    | Run performance tests (`*.perf.bench.ts`) — measure grid transposition, consensus, and core algorithm speeds on large datasets                        |
| `npm run bench`   | Run the GenBank parser benchmark grid (seq length × record count) and write results to `bench/results/benchmark.json` and SVG plots to `bench/plots/` |
| `npm run plot`    | Regenerate the SVG plots from an existing `bench/results/benchmark.json` without re-running the benchmarks                                            |

---

## Tech Stack

- **React 19** — UI framework (Hooks-based, no class components)
- **TypeScript 5** — Strict type safety across the entire codebase
- **Vite 6** — Build tool and dev server
- **D3.js 7** — Coordinate scaling and SVG rendering
- **react-window** — Virtualized list rendering for large sequence sets
- **Tailwind CSS** (CDN) — Utility-first styling
- **FontAwesome 6** (CDN) — Icon set

---

## License

This project is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License** as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See the `COPYING` file for details.
