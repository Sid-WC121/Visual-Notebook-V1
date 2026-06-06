# Documentation — Visual Notebook (`va_project`)

> 🇬🇧 English · [🇮🇹 Italiano](../README.md)

No-code interactive exploration tool for CSV / TSV / Parquet, inspired
by Jupyter but oriented to **visual analysis** instead of code. The
user builds a *notebook* of cells (tables and charts) that **rebase in
cascade** when a manipulation is applied to an upstream node.

## Index

| # | Document | What you'll find |
|---|---|---|
| 01 | [Architecture](./01-architecture.md) | Big picture: the 4 layers, tech stack, design decisions, folder layout |
| 02 | [Backend](./02-backend.md) | File-by-file walkthrough of the Python side: `data/`, `domain/`, `viz/`, `api/`, `controller.py`, `session.py`, `main.py` |
| 03 | [Frontend](./03-frontend.md) | File-by-file walkthrough of the React side: `api/`, `store/`, `lib/`, `components/`, `App.tsx`, `main.tsx` |
| 04 | [Cascade Rebase](./04-cascade.md) | Deep-dive into the "operations cascade" mechanism that rebases all downstream cells when you apply an op upstream |
| 05 | [Operations Catalog](./05-operations.md) | The 21 exposed operations (Data, Filter, Group, Visualize, View) with parameter signatures and exact semantics |

## TL;DR for the impatient

```
              UPLOAD CSV
                  ↓
       ┌──────────────────────┐
       │ Cell 0: Root         │  ← original LazyFrame
       └──────┬───────────────┘
              │  + filter sales > 100
       ┌──────▼───────────────┐
       │ Cell 1: filtered     │  ← derived state
       └──────┬───────────────┘
              │  + viz histogram
       ┌──────▼───────────────┐
       │ Cell 2: chart        │  ← leaf, doesn't advance state
       └──────────────────────┘
```

When you apply a new op on **cell 0** (e.g. `sort_by`), cell 0 doesn't
change (it's the upload), but a new cell is **inserted** right below it
and cells 1 and 2 are **rebased** on top: cell 1 re-applies its
`filter sales > 100` on the new state, cell 2 re-renders the histogram.
All in a single Promise on the frontend, a chain of `/api/branch` and
`/api/execute` calls on the backend.

If you only want to understand this mechanism → [04-cascade.md](./04-cascade.md).

## Quick commands

```bash
# Setup (uv creates .venv automatically on first run)
cd va_project
uv sync

# Backend (port 8000, OpenAPI on /docs)
uv run uvicorn visual_notebook.main:app --reload --port 8000

# Frontend (port 5173, Vite proxies /api/* to backend)
cd frontend
npm install
npm run dev

# Backend tests
uv run pytest backend
```

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Data engine | **Polars** (lazy) | Single-user, in-process; lazy lets us compose plans without materializing |
| Backend HTTP | **FastAPI** + Pydantic | Typed, free OpenAPI, fast with uvicorn |
| Python packaging | **uv** workspace | Manages venv + lockfile + dependencies in one tool |
| Frontend | **React 18** + TS + **Vite** | Modern standard, fast HMR, end-to-end type safety |
| Server state | **TanStack Query 5** | Smart cache + invalidation, retry, dedupe |
| UI state | **Zustand 4** | Lighter than Redux, perfect for local notebook state |
| Drag and drop | **@dnd-kit/core** | Accessible, type-safe, granular sensor control |
| Charts | **Apache ECharts** (via `echarts-for-react`) | Simpler API than BokehJS, lots of out-of-the-box charts |
| Maps | **Leaflet** (via `react-leaflet`) | Industry standard, free tile providers |
| Styling | **Tailwind CSS 3** | Utility-first, custom light minimalist palette in `tailwind.config.js` |

## Codebase conventions

- **English** in docstrings, identifiers, diagnostic logs. **Italian or
  English** in user-facing UI text (currently mostly Italian).
- **Pure layers**: `data/` imports nothing from above; `domain/` doesn't
  import from `api/` or frontend; viz functions are pure
  `(df, params) -> dict`.
- **Cookie-based sessions** (`vn_session` cookie), in-memory dict on the
  server. One session per browser tab.
- **Notebook persistence**: localStorage (Zustand persist), versioned.
  Bumping `version` in the store automatically invalidates old state.
- **History tree** server-side keeps every state (root → derived); the
  frontend shows a *linear view* of it (flat notebook).

## Glossary

| Term | Meaning |
|---|---|
| **State** | A node in the server-side `History` tree. Has a unique `id`, an associated Polars `LazyFrame`, a `description` and a `parent`. Immutable snapshot of the data at that point. |
| **Cell** | A unit of the frontend notebook. `TableCellData` points to a `state_id`; `ChartCellData` has an ECharts spec (or map payload) and a `sourceStateId`. |
| **`opChain`** | List of `{op_id, params}` steps that produced a table cell from its parent. Replayable for cascade rebase. |
| **Cascade** | Re-applying the `opChain` of all child cells on a new parent state when a new op is inserted upstream. |
| **fromChartId** | A tag marking filter cells born from an interactive click on a chart (histogram bin, scatter brush, etc.). A subsequent click on the same chart **replaces** that cell instead of stacking. |
| **Branch / branch_from** | In the `History` tree, applying an op starting from a specific `state_id` (not necessarily the "current" one). Creates a new child node of that state. |
