# Dunceious

> **Intelligence is Overpriced.**
> **Invest in coffee and staff, not in genial expensive software.**

Dunceious is a high-performance, browser-based bioinformatics platform for **Multi-Sequence Alignment (MSA) visualization**, annotation management, and sequence analysis. It parses GenBank and FASTA files, runs sequence alignment, renders an interactive genome viewer with semantic zoom, and provides both exact (IUPAC degenerate codes) and fuzzy (Smith-Waterman) sequence search — all without a backend.

For a full feature description see [`documentation.md`](./documentation.md), for the technical design see [`ARCHITECTURE.md`](./ARCHITECTURE.md), and for usage instructions see [`USER_MANUAL.md`](./USER_MANUAL.md).

---

## Prerequisites

| Requirement | Minimum version |
|---|---|
| [Node.js](https://nodejs.org/) | **18** (LTS or later) |
| npm | Ships with Node.js |

> **Why Node.js 18?** The project uses Vite 6 and React 19, both of which require Node.js 18+.

---

## Installation & Local Development

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

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite development server on port 3000 |
| `npm run build` | Compile and bundle the app for production (output in `dist/`) |
| `npm run preview` | Locally preview the production build after `npm run build` |
| `npm run lint` | Run the TypeScript type-checker (`tsc --noEmit`) — no output means no errors |

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

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** license.  
Commercial use is **strictly prohibited** ~~without explicit written permission from the authors~~ no matter what.
