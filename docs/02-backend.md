# 02 — Backend

> 🇬🇧 English · [🇮🇹 Italiano](../02-backend.md)

> Module-by-module walkthrough of the Python side.
> Suggested reading order: data → domain → viz → controller → api → main.

## Index
- [2.1 `main.py` — FastAPI entry](#21-mainpy--fastapi-entry)
- [2.2 `session.py` — in-memory sessions](#22-sessionpy--in-memory-sessions)
- [2.3 `controller.py` — per-session dispatcher](#23-controllerpy--per-session-dispatcher)
- [2.4 `data/` — Polars only](#24-data--polars-only)
- [2.5 `domain/` — History tree + Operations](#25-domain--history-tree--operations)
- [2.6 `viz/` — pure chart spec generators](#26-viz--pure-chart-spec-generators)
- [2.7 `api/` — FastAPI layer](#27-api--fastapi-layer)
- [2.8 `tests/`](#28-tests)

---

## 2.1 `main.py` — FastAPI entry

```python
app = FastAPI(title="Visual Notebook API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,    # crucial for the session cookie
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)

@app.get("/")
def root(): return {"ok": True, "service": "Visual Notebook", "docs": "/docs"}
```

**What it does**:
- Creates the FastAPI `app` instance.
- Configures CORS so the dev frontend (Vite on 5173) can talk to the
  backend (on 8000) **carrying the cookie**: without
  `allow_credentials=True` the browser would block the cross-origin
  cookie.
- Mounts the router with all endpoints under `/api/*`.

**Startup**: `uv run uvicorn visual_notebook.main:app --reload --port 8000`.
In production you'd serve the static React bundle via `StaticFiles` and
remove the CORS middleware.

---

## 2.2 `session.py` — in-memory sessions

```python
SESSION_COOKIE = "vn_session"

class SessionStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._controllers: dict[str, Controller] = {}
        self._touched: dict[str, datetime] = {}

    def get_or_create(self, session_id: str | None) -> tuple[str, Controller]:
        with self._lock:
            if session_id and session_id in self._controllers:
                self._touched[session_id] = datetime.utcnow()
                return session_id, self._controllers[session_id]
            new_id = session_id or secrets.token_urlsafe(16)
            ctrl = Controller()
            self._controllers[new_id] = ctrl
            self._touched[new_id] = datetime.utcnow()
            return new_id, ctrl

    def get(self, session_id) -> Controller | None: ...
    def drop(self, session_id) -> None: ...

# Module singleton
store = SessionStore()
```

**What it does**:
- Maintains a `{session_id: Controller}` map in memory.
- `get_or_create` is the API used by the `get_session()` dependency: if
  the cookie exists and there's already a Controller → reuse;
  otherwise generate a new `session_id` (`secrets.token_urlsafe(16)`)
  and create a Controller.
- `_lock` serialises access, but in practice the workflow is single-tab
  for a single user so contention is zero.

**What it does NOT do**:
- Disk / Redis persistence. Backend restart = sessions lost. For a
  single-user exploration tool this is acceptable (the client detects
  the inconsistency and starts over).
- Eviction. `_touched` keeps the timestamp but there's no cleanup job
  yet. In a production version you'd add a background task that
  evicts sessions inactive for > N hours.

---

## 2.3 `controller.py` — per-session dispatcher

A **stateful** class, one instance per session.

```python
class Controller:
    history: History | None
    dataset_name: str | None
    current_figure: Any | None
    last_error: str | None
```

### Lifecycle

```
Controller()                             # empty — has_data=False
   ↓ load_dataset(filename, content)
History(lf, "Loaded: <filename>")        # has_data=True
   ↓ execute("filter_range", {...}, from_state_id)
   ↓ execute("viz_histogram", {...})
   ↓ ...
   ↓ reset()
Controller()                             # back to empty
```

### Key methods

| Method | What it does | Errors |
|---|---|---|
| `load_dataset(filename, content)` | Opens the file via `data/loader.py`, validates the schema, creates a new `History` | `last_error` set if parsing fails |
| `execute(op_id, params, from_state_id?)` | Looks up the op in the registry → dispatches to data/viz/view → returns polymorphic `{kind, ...}` | Raises `KeyError` (op missing), `ValueError` (invalid params) |
| `branch_from(state_id, op_id, params)` | Data ops only: applies an op starting from a specific state (not the "current") | Raises if the op is viz/view |
| `goto(state_id)` | Moves `history.current` to an existing state | KeyError if the id doesn't exist |
| `preview(n, offset, state_id?)` | Materialises a window of rows (default 50) for the table preview | — |
| `export_csv(state_id?)` | Collects the LazyFrame → CSV bytes | — |
| `history_payload()` | Dump of the entire tree for `/api/history` | — |

### Result polymorphism

`execute()` always returns a dict, but populated keys depend on `op.kind`:

```python
# data
{"kind": "data", "state_id": "abc12345", "description": "sales > 100", "count": 2876}

# viz
{"kind": "viz", "spec": {"title": {...}, "xAxis": {...}, "series": [...]}}

# view
{"kind": "view", "payload": {"kind": "schema", "columns": [...]}}
```

The Pydantic `ExecuteResponse` has all fields optional and the frontend
discriminates on `kind`.

### Internal helper `_jsonify`

Polars row values (date, datetime, time) aren't JSON-serialisable
directly. `_jsonify` converts to ISO strings. Used in `preview()`.

---

## 2.4 `data/` — Polars only

The lowest layer. **Imports only Polars.** No reference to `domain/`,
`api/`, `controller.py`.

### `data/types.py`

```python
class ColumnType(str, Enum):
    NUMERIC = "numeric"
    CATEGORICAL = "categorical"
    TEMPORAL = "temporal"
    BOOLEAN = "boolean"
    OTHER = "other"

def classify(dtype: pl.DataType) -> ColumnType:
    if dtype.is_numeric(): return ColumnType.NUMERIC
    if dtype == pl.Boolean: return ColumnType.BOOLEAN
    if dtype.is_temporal(): return ColumnType.TEMPORAL
    if dtype in (pl.Utf8, pl.Categorical, pl.Enum): return ColumnType.CATEGORICAL
    return ColumnType.OTHER
```

A handful of high-level types over Polars' dozens of dtypes. Used
everywhere for: picking widgets in dialogs (numeric → Spinner range),
for the coloured badges in the table preview, for binning in the
heatmap.

### `data/loader.py`

3 `from_bytes` functions (CSV, TSV, Parquet) + 2 `from_path` (for local
use / testing) + a dispatcher `load_from_upload(filename, content)`
that picks the right loader based on extension.

They always return `pl.LazyFrame`. For in-memory CSV:

```python
def load_csv_from_bytes(content, *, separator=",", try_parse_dates=True, infer_schema_length=10_000):
    df = pl.read_csv(io.BytesIO(content), separator=separator,
                     try_parse_dates=try_parse_dates,
                     infer_schema_length=infer_schema_length)
    return df.lazy()
```

`pl.read_csv` on buffer + `.lazy()` instead of `pl.scan_csv` because the
file is already in memory (it came in via HTTP upload).
`try_parse_dates=True` lets Polars recognise ISO date columns
automatically.

### `data/schema.py`

```python
@dataclass(frozen=True)
class ColumnStats:
    column: str
    column_type: ColumnType
    null_count: int
    min: Any | None = None
    max: Any | None = None
    distinct_values: tuple[Any, ...] | None = None
    distinct_truncated: bool = False
```

#### `infer_schema(lf) -> dict[str, ColumnType]`
Wraps `lf.collect_schema()` (free operation, metadata only) and maps
each dtype to a `ColumnType`.

#### `schema_with_dtypes(lf) -> list[dict]`
List-of-dicts version of the above, handy for JSON-serialisation
toward `/api/schema`. Includes both the Polars dtype (`Float64`) and
the ColumnType (`"numeric"`).

#### `column_stats(lf, column) -> ColumnStats`
A single `collect()` over an aggregate:
- numeric/temporal → min, max, null_count
- categorical/boolean → distinct values (capped at 50, sorted) +
  null_count
- other → just null_count

Capping at 50 for a concrete reason: the dialog MultiSelect widget
must remain usable. Above 50, the `distinct_truncated=True` flag lets
the UI suggest "use filter_text_contains" or similar.

---

## 2.5 `domain/` — History tree + Operations

The **heart** of the backend. Pure Python, no FastAPI/IO.

### `domain/history.py`

```python
@dataclass(eq=False)
class State:
    lf: pl.LazyFrame
    description: str
    parent: "State | None" = None
    children: list["State"] = field(default_factory=list)
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    _count_cache: int | None = field(default=None, repr=False)
```

`eq=False` → identity, not equality. Two States with the same `id` BUT
different objects are treated as different (which never happens in
practice). Lets us put them in `dict[id, State]`.

#### `State.count` (property, lazy + cached)
```python
@property
def count(self) -> int:
    if self._count_cache is None:
        self._count_cache = int(self.lf.select(pl.len()).collect().item())
    return self._count_cache
```

Counts how many rows the state has — potentially expensive operation,
hence **caching**. The count is immutable (the state is immutable).

#### `History` class

```python
class History:
    root: State
    current: State
    _index: dict[str, State]   # id → State, O(1) lookup

    def apply(op_fn, description) -> State:
        new_lf = op_fn(self.current.lf)
        child = State(lf=new_lf, description=description, parent=self.current)
        self.current.children.append(child)
        self._index[child.id] = child
        self.current = child
        return child

    def goto(state_id) -> State: ...
    def branch_from(state_id, op_fn, description) -> State: ...
    def lineage() -> list[State]: ...     # from root to current
    def find(state_id) -> State: ...
    def all_states() -> list[State]: ...
```

The abstraction that enables branching: `branch_from(state_id, ...)`
is `goto(state_id)` + `apply(...)`, and since `apply` adds a *child*
to current, two `branch_from` calls with the same `state_id` but
different ops produce two *children* of the same parent → tree.

#### Tests (`tests/test_history.py`)
11 tests covering: root creation, unique ids, lazy count cache, linear
apply, goto without mutating the tree, branch (sibling), lineage, find,
all_states. They're the safety net of the most critical component.

### `domain/operations.py`

```python
@dataclass(frozen=True)
class ParamSpec:
    name: str
    kind: str            # "column" | "column_numeric" | "value_from_column" | ...
    label: str
    options: list[str] | None = None
    default: Any = None
    depends_on: str | None = None    # name of another param this one depends on

@dataclass(frozen=True)
class Operation:
    id: str              # "filter_range"
    label: str           # "Filter by range"
    menu: str            # Data | Filter | Group | Visualize | View
    kind: str            # data | viz | view
    params: list[ParamSpec]
    apply: Callable[..., Any]

OPERATIONS: list[Operation] = [
    Operation("sort_by", ..., apply=_sort_by),
    Operation("filter_range", ..., apply=_filter_range),
    ...
]
```

**Data-driven pattern**: the registry is the *single* source of truth.
Adding an op = adding a row to `OPERATIONS`. The frontend calls
`/api/operations` and auto-generates menus + dialogs from `params`.

#### The 21 ops are detailed in [`05-operations.md`](./05-operations.md).

#### `format_description(op, params)`
Function that turns `(op, params)` into a human-readable string for the
history strip chips. E.g.:
- `filter_range` → `"sales ∈ [100, 5000]"`
- `group_by` → `"Group by ship_mode → mean(sales)"`
- `keep_top_n` → `"Keep top 100"`

#### `operations_catalog() -> list[dict]`
Serialises the registry for the API. The dict includes `id, label,
menu, kind` and `params` as a list of `asdict(ParamSpec)`. The frontend
dialog builder maps each `param.kind` to a React widget.

---

## 2.6 `viz/` — pure chart spec generators

7 files: 6 chart types + a common one.

### `viz/_common.py`

Palette + shared helpers. Everything is *data* (constants + functions
that return ECharts dicts):

```python
INDIGO = "#4f46e5"
TEXT = "#0f172a"
GRID = "#e5e7eb"
HEATMAP_PALETTE = [...11 indigo shades...]

def title(text, subtitle=None) -> dict:    # ECharts title block, semibold 14px
def axis_name(label, gap=36) -> dict:      # axis name styling
def base_grid(*, has_subtitle=False) -> dict:  # adaptive padding
def base_tooltip() -> dict:                 # white, soft shadow
def axis_style() -> dict:                   # slate axis line, muted labels
def fmt_num(v) -> str:                      # "1.5k", "2.3M", "0.045"
def fmt_count(n) -> str:                    # human integers
def maybe_pluralise(n, word) -> str:        # "1 row" / "12 rows"
```

### The 6 viz functions

All have the same signature:

```python
def histogram(df: pl.DataFrame, params: dict) -> dict:
def scatter(df: pl.DataFrame, params: dict) -> dict:
def timeline(df: pl.DataFrame, params: dict) -> dict:
def bar_topn(df: pl.DataFrame, params: dict) -> dict:
def heatmap(df: pl.DataFrame, params: dict) -> dict:
def map_payload(df: pl.DataFrame, params: dict) -> dict:    # NB: kind="map"
```

**Pure functions**: no side effects, no state references. Receives an
already-materialised `df` and returns a dict. For the 5 standard
ECharts charts (histogram, scatter, timeline, bar_topn, heatmap) the
dict is an ECharts option ready to pass to
`<ReactECharts option={...} />`.

`map_payload` instead returns `{kind: "map", center, points, ...}` —
NOT an ECharts option, a custom payload that the frontend dispatches
to `<MapCanvas>` (Leaflet).

#### Heatmap: the most complex case
`heatmap.py` accepts columns of **any type** on both axes:
- numeric → equal-width bins via `np.digitize`
- temporal → bins on integer timestamps, edges labelled as dates
- categorical → distinct values

Plus an optional metric (`value` + `agg`) for heatmaps of aggregated
values instead of counts. See
[`05-operations.md → viz_heatmap`](./05-operations.md#viz_heatmap).

#### ECharts gotchas in the code
- **`tooltip.formatter` as template string**, not function-string. Eval
  of JS functions via JSON is blocked → we use `{c}`, `{a}`, `{b}`.
- **Heatmap palette starts at indigo-50, not white** — on a white
  background, count=1 cells would be invisible.
- **`label.formatter: "{@[2]}"`** on heatmap cells shows the count
  inside the cell (more readable than tooltip-only).

---

## 2.7 `api/` — FastAPI layer

### `api/deps.py`

A single function: `get_session(response, session_id=Cookie(...))`.
It's a FastAPI **dependency**.

```python
@dataclass
class Session:
    id: str
    controller: Controller
    def set_cookie_on(self, response): ...

def get_session(response, session_id=Cookie(default=None, alias="vn_session")) -> Session:
    sid, ctrl = store.get_or_create(session_id)
    sess = Session(id=sid, controller=ctrl)
    if session_id != sid:
        sess.set_cookie_on(response)   # new session → set the cookie
    return sess
```

Each endpoint declares `sess: Session = Depends(get_session)` and finds
the right Controller ready + the cookie set if needed.

### `api/schemas.py`

All Pydantic I/O models. They're the **frontend contract**:

| Pydantic | Used in |
|---|---|
| `SessionInfo` | `GET /session` |
| `UploadResponse` | `POST /upload` |
| `SchemaResponse` | `GET /schema` |
| `PreviewResponse` | `GET /preview` |
| `ColumnStatsResponse` | `GET /column-stats` |
| `OperationsCatalog` | `GET /operations` |
| `ExecuteRequest` / `ExecuteResponse` | `POST /execute` |
| `BranchRequest` | `POST /branch` |
| `GotoRequest` | `POST /goto` |
| `HistoryResponse` | `GET /history` |

`frontend/src/api/types.ts` mirrors these models 1-to-1 in TypeScript.

### `api/routes.py`

12 endpoints. Almost all are thin shells over `Controller`:

```
GET  /api/session                  → SessionInfo
POST /api/reset                    → {ok: true}
POST /api/upload                   → UploadResponse        (multipart file)
GET  /api/schema?state_id=...      → SchemaResponse
GET  /api/preview?n=&offset=&state_id=...  → PreviewResponse
GET  /api/column-stats?column=&state_id=...  → ColumnStatsResponse
GET  /api/operations               → OperationsCatalog     (static catalog)
POST /api/execute                  → ExecuteResponse
POST /api/branch                   → ExecuteResponse(kind=data)
POST /api/goto                     → {current_id}
GET  /api/history                  → HistoryResponse
GET  /api/export?state_id=...      → text/csv stream
```

The error handling pattern is uniform:

```python
try:
    result = sess.controller.execute(req.op_id, req.params, req.from_state_id)
except KeyError as exc:    raise HTTPException(404, detail=str(exc))
except ValueError as exc:  raise HTTPException(400, detail=str(exc))
except Exception as exc:   raise HTTPException(500, detail=str(exc))
```

The frontend (`api/client.ts`) intercepts these responses and extracts
`response.data.detail` as `Error.message`, so the top toast shows
exactly the Python text:

> `Aggregation 'mean' requires a numeric target column (got String).`

---

## 2.8 `tests/`

Just `test_history.py` for now — 11 tests on the only truly complex
data structure, the `History` tree.

```python
def test_root_state(history): ...
def test_state_id_unique(): ...
def test_apply_advances_current(history): ...
def test_count_lazy_and_cached(history): ...
def test_count_after_filter(history): ...
def test_goto_moves_current_without_mutating_tree(history): ...
def test_goto_unknown_raises(history): ...
def test_branch_from_creates_sibling(history): ...
def test_lineage_root_to_current(history): ...
def test_find_does_not_change_current(history): ...
def test_all_states_returns_full_tree(history): ...
```

Run with `uv run pytest backend`. All pass (~0.1 s total).

**What's missing**: tests on ops (trivial but useful), API tests (using
`httpx.AsyncClient(app=app, base_url=...)`), property-based tests on
`column_stats` with random datasets. Future roadmap.
