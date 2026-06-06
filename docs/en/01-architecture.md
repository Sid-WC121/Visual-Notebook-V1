# 01 — Architecture

> 🇬🇧 English · [🇮🇹 Italiano](../01-architettura.md)

> Big picture of the project: how the layers are organized, where data
> flows, why we made certain choices.

## Local index
- [1.1 General map](#11-general-map)
- [1.2 The 4 layers](#12-the-4-layers)
- [1.3 Request flow](#13-request-flow)
- [1.4 Data model: History tree + Notebook](#14-data-model-history-tree--notebook)
- [1.5 Design decisions (and why)](#15-design-decisions-and-why)
- [1.6 Folder layout](#16-folder-layout)
- [1.7 Sessions and persistence](#17-sessions-and-persistence)

---

## 1.1 General map

```
   Browser                                  Python Backend
┌──────────────┐    HTTP / JSON           ┌─────────────────────────┐
│  React + TS  │  ◄──────────────────►    │ FastAPI                 │
│  Vite proxy  │   cookie  vn_session     │  ↕                      │
│              │                          │ Controller              │
│  Components  │                          │  ↕                      │
│  Zustand     │                          │ Domain (History, Ops)   │
│  TanStack Q. │                          │  ↕                      │
│  ECharts /   │                          │ Data (Polars LazyFrame) │
│  Leaflet     │                          │                         │
└──────────────┘                          └─────────────────────────┘
       │                                               │
       │ persist localStorage                          │ in-memory
       ▼                                               ▼
   notebook                                       SessionStore
   cells[]                                       {sid: Controller}
```

Two separate processes during development:

- `uvicorn visual_notebook.main:app --port 8000` — FastAPI backend
- `npm run dev` — Vite dev server on 5173 with proxy `/api/*` → 8000

In production (not implemented) you would serve the built frontend
bundle directly from FastAPI with `app.mount("/", StaticFiles(...))`,
removing the proxy.

---

## 1.2 The 4 layers

```
┌───────────────────────────────────────────────────────┐
│ PRESENTATION (frontend/src/components/)               │
│   React components, Tailwind, drag-and-drop           │
└──────────────────┬────────────────────────────────────┘
                   │ HTTP
┌──────────────────▼────────────────────────────────────┐
│ API (backend/visual_notebook/api/)                    │
│   FastAPI routes, Pydantic schemas, cookie sess deps  │
└──────────────────┬────────────────────────────────────┘
                   │ Python calls
┌──────────────────▼────────────────────────────────────┐
│ ORCHESTRATION (backend/visual_notebook/controller.py) │
│   Controller: 1 History per session, dispatcher       │
│   between data/viz/view operations                    │
└──────────────────┬────────────────────────────────────┘
                   │
┌──────────────────▼────────────────────────────────────┐
│ DOMAIN (backend/visual_notebook/domain/)              │
│   - history.py: tree of `State` nodes                 │
│   - operations.py: declarative registry + apply fns   │
└──────────────────┬────────────────────────────────────┘
                   │
┌──────────────────▼────────────────────────────────────┐
│ DATA (backend/visual_notebook/data/)                  │
│   Polars LazyFrame, schema inspection, file loaders   │
└───────────────────────────────────────────────────────┘
                   ↑
                   │ Pure functions
┌──────────────────┴────────────────────────────────────┐
│ VIZ (backend/visual_notebook/viz/)                    │
│   `(pl.DataFrame, params) -> ECharts dict | MapPayload│
│   No imports from api/, controller, history           │
└───────────────────────────────────────────────────────┘
```

**Import rules**:
- `data/` → only Polars
- `domain/` → `data/`, `viz/`
- `viz/` → only Polars + numpy (pure functions)
- `controller.py` → `data/`, `domain/`
- `api/` → entire backend
- Frontend → only HTTP, no direct backend imports

This rigidity is what allowed us to **swap the UI without breaking the
domain**: the first version of the project (`visual-notebook` v1) used
Bokeh server as UI; the current v2 uses React. The `domain/` and
`data/` are practically identical between the two versions.

---

## 1.3 Request flow

Example: the user clicks a pill in the chart-builder and hits "Generate"
for a histogram on `sales`.

```
1. ChartBuilder onClick "Generate"
   │
   ▼
2. notebook store: appendChartCell(parentIndex=0, "viz_histogram", {column:"sales", bins:30})
   │
   ▼
3. api/client.ts: executeFromState("viz_histogram", {...}, parent.stateId)
   │  POST /api/execute  body={op_id, params, from_state_id}
   ▼
4. backend api/routes.py @router.post("/execute")
   │  → Controller.execute(...)
   ▼
5. Controller.execute:
   │  - get_operation("viz_histogram") → Operation(kind="viz", apply=histogram)
   │  - df = history.find(from_state_id).lf.collect()
   │  - spec = histogram(df, params)   # viz/histogram.py — pure fn
   │  - return {kind: "viz", spec: {...ECharts opts...}}
   ▼
6. JSON serialised → returns to the frontend
   │
   ▼
7. notebook store inserts a ChartCellData with spec=...
   │  Zustand emit → components using `cells` re-render
   ▼
8. ChartCellView passes the spec to <ReactECharts>
   │
   ▼
9. ECharts canvas render
```

A `viz` operation **does not advance state**: neither History nor
Notebook get a new "data state" node — the chart is a *lens* on the
data, not a transformation of it.

For a `data` operation the flow is similar but:
- backend uses `branch_from(state_id, op_id, params)` instead of
  `execute(...)`
- creates a new `State` in the tree, links it as a child of the parent
- returns `{state_id, description, count}`
- frontend inserts a `TableCellData` in the notebook
- **if there are downstream cells**, they get **rebased** in cascade
  (see [04-cascade.md](./04-cascade.md))

---

## 1.4 Data model: History tree + Notebook

Two parallel models, synchronised but autonomous:

### Server-side: `History` tree

```
              State(root)
              │ "Loaded: orders.csv"  count=5009
              │
        ┌─────┼─────┐
        │           │
   State(A)     State(B)
   "sales>100"  "ship_mode=Std"
   count=2876    count=300
        │
   State(C)
   "+drop nulls"
   count=2876
```

Each `State` node is **immutable**: it has `id` (uuid8), `lf`
(LazyFrame), `description`, `parent`, `children`, cached `count`.

You never modify an existing State — an op creates a new one linked to
it. The tree can branch: two different ops applied to the same parent
produce two children.

### Client-side: Notebook (flat array)

```ts
cells: [
  { type: "table", stateId: "root_id", description: "Loaded: orders.csv", opChain: [] },
  { type: "table", stateId: "id_A",    description: "sales > 100",         opChain: [{op_id:"filter_range", params:{...}}] },
  { type: "chart", sourceStateId: "id_A", opId: "viz_histogram", spec: {...} },
  { type: "table", stateId: "id_C",    description: "no nulls in sales",   opChain: [{op_id:"filter_not_null", ...}] },
]
```

The notebook is a **list**, not a tree — it's the lineage the user
sees. Internally, every table cell knows which `opChain` produced it
*from the previous cell*. The chart cell knows what its `sourceStateId`
is (the previous table).

### The link between the two

- The `stateId` of a `TableCellData` points to a `State` in the server
  tree.
- The `sourceStateId` of a `ChartCellData` points to the `State` the
  chart was rendered from.
- The cell's `opChain` lets the frontend **reconstruct** the state by
  replaying ops — necessary for the cascade rebase.

---

## 1.5 Design decisions (and why)

### Why Polars **lazy**, not eager?
A manipulation (filter, group, sort) builds a logical plan but doesn't
materialise data. Only when a viz calls `.collect()` or the API responds
to `/preview` does it actually compute. On large datasets this means
applying 5 filters in a row doesn't scan the file 5 times: Polars
optimises the query into a single pass.

### Why a server-side `History` *tree*?
It enables future branching (not exposed in the UI today but supported
by the API). Memory storage O(N) on the number of distinct states, each
contains only a LazyFrame (a reference to a logical plan, not data).

### Why an `opChain` per cell, not just `opId`?
To handle **compound operations**: a brush on a scatter produces two
filters (range x AND range y) that must be atomic from the user's POV
(a single "step" in history) but replayable as a chain of 2
`/branch` calls.

### Why both Zustand **and** TanStack Query, not just one?
- TanStack Query handles **server state**: `/schema`, `/preview`,
  `/operations`, `/history`. Cache, dedupe, refetch on invalidation.
- Zustand handles **pure UI state**: open dialog, chart-builder slot
  selections, current error, notebook cell list.

Mixing them would be confusing. The rule: if it comes from the
backend → React Query; if it's only browser-side → Zustand.

### Why ECharts and not BokehJS?
The project's v1 used Bokeh server (UI + render). v2 separates: backend
produces only *chart specs* (ECharts dicts), the frontend renders.
ECharts has a more declarative API than BokehJS, much more navigable
documentation, and great out-of-the-box features (visualMap for
heatmaps, dataZoom for timelines, brush for scatters).

### Why `uv` and not `pip` + `venv`?
- Automatic lockfile (`uv.lock`) → reproducibility
- Workspace: the root `pyproject.toml` declares `members = ["backend"]`
  and we get `uv run` from any folder without activating anything
- ~10× faster than pip for resolve + install

### Why cookie sessions + in-memory dict instead of a DB?
Single-user, single-tab tool. The LazyFrame is a reference to a lazy
plan: if the browser tab closes, losing state is OK. The real
"lineage" persistence (what I'm exploring) lives on the browser side
(localStorage via Zustand persist).

---

## 1.6 Folder layout

```
va_project/
├── pyproject.toml              # uv workspace root
├── uv.lock                     # lockfile (committed)
├── README.md
├── orders.csv                  # demo dataset (5009 rows)
│
├── backend/
│   ├── pyproject.toml          # workspace member "visual-notebook"
│   ├── visual_notebook/
│   │   ├── __init__.py
│   │   ├── main.py             # uvicorn entry: creates FastAPI app
│   │   ├── controller.py       # Controller (1 per session)
│   │   ├── session.py          # SessionStore (cookie → Controller)
│   │   ├── data/               # Polars-only
│   │   │   ├── loader.py       # load_csv_from_bytes, load_parquet, dispatch
│   │   │   ├── schema.py       # infer_schema, column_stats, schema_with_dtypes
│   │   │   └── types.py        # ColumnType enum + classify(dtype)
│   │   ├── domain/             # Pure logic over LazyFrame
│   │   │   ├── history.py      # State, History tree
│   │   │   └── operations.py   # OPERATIONS registry + apply functions
│   │   ├── viz/                # Pure (df, params) -> dict
│   │   │   ├── _common.py      # palette, axis_style, fmt_num, title()
│   │   │   ├── histogram.py
│   │   │   ├── scatter.py
│   │   │   ├── timeline.py
│   │   │   ├── bar_topn.py
│   │   │   ├── heatmap.py
│   │   │   └── map.py
│   │   └── api/
│   │       ├── deps.py         # get_session(): cookie → Session(id, ctrl)
│   │       ├── schemas.py      # all I/O Pydantic models
│   │       └── routes.py       # the /api/* endpoints
│   └── tests/
│       └── test_history.py     # 11 tests on the History tree
│
└── frontend/
    ├── package.json
    ├── vite.config.ts          # proxy /api → :8000
    ├── tailwind.config.js      # light minimalist palette
    ├── tsconfig.json
    ├── index.html              # loads Leaflet CSS
    └── src/
        ├── main.tsx            # entry React + QueryClientProvider
        ├── App.tsx             # DnDContext + state switcher
        ├── styles/index.css    # Tailwind base + Leaflet overrides
        ├── api/
        │   ├── client.ts       # axios instance + branchOp + executeFromState
        │   ├── hooks.ts        # all useXxx() for /api/*
        │   └── types.ts        # TS types mirroring Pydantic
        ├── store/
        │   ├── notebook.ts     # cells[] + applyChainAndCascade + ...
        │   └── ui.ts           # dialog, selected slots, errors
        ├── lib/
        │   ├── format.ts       # formatNumber, formatCellValue, typeBadge
        │   └── chartTypes.ts   # CHART_TYPES for the chart-builder
        └── components/
            ├── Header.tsx
            ├── UploadPanel.tsx
            ├── ErrorToast.tsx
            ├── NotebookPage.tsx        # renders cells[]
            ├── TableCellView.tsx       # table cell + toolbar
            ├── ChartCellView.tsx       # chart cell (ECharts | Leaflet)
            ├── ManipulationPanel.tsx   # form for data ops
            ├── VisualizationPanel.tsx  # chart-builder with drag-and-drop
            ├── TablePreview.tsx        # paginated table inside cell
            ├── SchemaView.tsx          # schema view (for view ops)
            └── MapCanvas.tsx           # Leaflet rendering
```

---

## 1.7 Sessions and persistence

### Server-side
`backend/visual_notebook/session.py` keeps a thread-safe dict:

```python
class SessionStore:
    _controllers: dict[str, Controller]
    _touched: dict[str, datetime]

    def get_or_create(self, session_id: str | None) -> tuple[str, Controller]:
        if session_id and session_id in self._controllers:
            return session_id, self._controllers[session_id]
        new_id = secrets.token_urlsafe(16)
        ctrl = Controller()
        self._controllers[new_id] = ctrl
        return new_id, ctrl
```

The `store` singleton is created at module level. `get_session()` in
`api/deps.py` reads the `vn_session` cookie, passes it to
`get_or_create`, and sets the cookie on the response if it's new.

When the backend process restarts → all states lost. The frontend
detects the inconsistency between `notebook.cells[0].stateId` and the
real backend root, and does `truncate(0)`.

### Client-side
The Zustand persist middleware saves `cells[]` in `localStorage` under
the key `va-notebook`. The key has `version: 3` — bumping the version,
the middleware runs `migrate()` which (currently) **discards** all old
state and starts from scratch.

```ts
{
  name: "va-notebook",
  version: 3,
  migrate: (_persisted, _version) => ({ cells: [] }),
  partialize: (s) => ({ cells: s.cells }),
}
```

Bumps: when the cell schema changes in a backwards-incompatible way
(e.g. v2 → v3 when we introduced `opChain` replacing `opId`+`opParams`).
