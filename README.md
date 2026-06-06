# Visual Notebook v1

No-code interactive data exploration tool — Polars (lazy) backend + React/TypeScript frontend with ECharts and Leaflet.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ FRONTEND       React + TypeScript + Vite + Tailwind     │
│                ECharts + Leaflet + dnd-kit              │
└─────────────────────────────────────────────────────────┘
                       ↕  HTTP / JSON
┌─────────────────────────────────────────────────────────┐
│ API            FastAPI (REST)                           │
└─────────────────────────────────────────────────────────┘
                       ↕
┌─────────────────────────────────────────────────────────┐
│ DOMAIN         History tree · Operation registry        │
└─────────────────────────────────────────────────────────┘
                       ↕
┌─────────────────────────────────────────────────────────┐
│ DATA           Polars LazyFrame                         │
└─────────────────────────────────────────────────────────┘
```

## Run locally

### Backend

```bash
uv sync

uv run uvicorn visual_notebook.main:app --reload --port 8000

uv run pytest

# To add a dependency
uv add --package visual-notebook <pacchetto>
```

API at http://localhost:8000 · OpenAPI docs at http://localhost:8000/docs.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend at http://localhost:5173 (Vite proxies `/api/*` to the backend).

## Layers

- **`backend/visual_notebook/data/`** — Polars-only loaders and schema inspection.
- **`backend/visual_notebook/domain/`** — `History` tree of `State`s and the `Operation` registry. UI-agnostic.
- **`backend/visual_notebook/viz/`** — pure `(df, params) -> ECharts option dict` functions (Leaflet uses `(df, params) -> map payload dict`).
- **`backend/visual_notebook/api/`** — FastAPI routes, Pydantic schemas, session dependency.
- **`frontend/src/api/`** — typed Axios client + TanStack Query hooks for every endpoint.
- **`frontend/src/components/`** — one component per panel (Header, MenuBar, ColumnPalette, ChartBuilder, ChartCanvas, etc.).
- **`frontend/src/store/`** — Zustand store for UI state (chart-builder slot selections, dialog open/close).

## Sessions

Backend keeps a `dict[session_id, Controller]` in memory. Each browser tab gets a fresh `session_id` cookie on first request; closing the tab discards the session.
