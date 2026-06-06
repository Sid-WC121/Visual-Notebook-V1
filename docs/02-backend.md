# 02 — Backend

> 🇮🇹 Italiano · [🇬🇧 English](./en/02-backend.md)

> Walkthrough modulo per modulo della parte Python.
> Ordine di lettura consigliato: data → domain → viz → controller → api → main.

## Indice
- [2.1 `main.py` — entry FastAPI](#21-mainpy--entry-fastapi)
- [2.2 `session.py` — sessioni in memoria](#22-sessionpy--sessioni-in-memoria)
- [2.3 `controller.py` — il dispatcher per sessione](#23-controllerpy--il-dispatcher-per-sessione)
- [2.4 `data/` — Polars only](#24-data--polars-only)
- [2.5 `domain/` — History tree + Operations](#25-domain--history-tree--operations)
- [2.6 `viz/` — pure chart spec generators](#26-viz--pure-chart-spec-generators)
- [2.7 `api/` — FastAPI layer](#27-api--fastapi-layer)
- [2.8 `tests/`](#28-tests)

---

## 2.1 `main.py` — entry FastAPI

```python
app = FastAPI(title="Visual Notebook API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,    # importantissimo per il cookie sessione
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)

@app.get("/")
def root(): return {"ok": True, "service": "Visual Notebook", "docs": "/docs"}
```

**Cosa fa**:
- Crea l'istanza `app` di FastAPI.
- Configura CORS per permettere al dev frontend (Vite su 5173) di
  parlare col backend (su 8000) **portando il cookie**: senza
  `allow_credentials=True` il browser bloccherebbe il cookie cross-origin.
- Monta il router con tutti gli endpoint sotto `/api/*`.

**Avvio**: `uv run uvicorn visual_notebook.main:app --reload --port 8000`.
In produzione si servirebbe il bundle React statico tramite `StaticFiles`
e si rimuoverebbe il middleware CORS.

---

## 2.2 `session.py` — sessioni in memoria

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

# Singleton modulo
store = SessionStore()
```

**Cosa fa**:
- Mantiene una mappa `{session_id: Controller}` in memoria.
- `get_or_create` è l'API usata dal dependency `get_session()`: se il
  cookie esiste e c'è già un Controller → riusa; altrimenti genera un
  nuovo `session_id` (`secrets.token_urlsafe(16)`) e crea un Controller.
- `_lock` serializza l'accesso, ma in pratica il workflow è single-tab
  per il singolo utente quindi la contesa è zero.

**Cosa NON fa**:
- Persistenza su disco / Redis. Riavvio backend = sessioni perse. Per
  un tool di esplorazione single-user è accettabile (il client riconosce
  l'incoerenza e ricomincia).
- Eviction. `_touched` tiene il timestamp ma non c'è ancora un cleanup
  job. In una versione produttiva si aggiungerebbe un task background
  che elimina sessioni inattive da > N ore.

---

## 2.3 `controller.py` — il dispatcher per sessione

Una **classe** stato-piena, una istanza per sessione.

```python
class Controller:
    history: History | None
    dataset_name: str | None
    current_figure: Any | None
    last_error: str | None
```

### Lifecycle

```
Controller()                             # vuoto — has_data=False
   ↓ load_dataset(filename, content)
History(lf, "Loaded: <filename>")        # has_data=True
   ↓ execute("filter_range", {...}, from_state_id)
   ↓ execute("viz_histogram", {...})
   ↓ ...
   ↓ reset()
Controller()                             # tornato vuoto
```

### Metodi chiave

| Metodo | Cosa fa | Errori |
|---|---|---|
| `load_dataset(filename, content)` | Apre il file via `data/loader.py`, valida lo schema, crea un nuovo `History` | `last_error` settato se il parsing fallisce |
| `execute(op_id, params, from_state_id?)` | Lookup op nel registry → dispatch su data/viz/view → ritorna `{kind, ...}` polimorfico | Solleva `KeyError` (op non esiste), `ValueError` (params invalidi) |
| `branch_from(state_id, op_id, params)` | Solo data ops: applica un'op partendo da uno stato specifico (non il "current") | Raise se l'op è viz/view |
| `goto(state_id)` | Sposta `history.current` su uno stato esistente | KeyError se l'id non c'è |
| `preview(n, offset, state_id?)` | Materializza una finestra di righe (50 default) per la table preview | — |
| `export_csv(state_id?)` | Collect del LazyFrame → bytes CSV | — |
| `history_payload()` | Dump dell'intero tree per `/api/history` | — |

### Polimorfismo del risultato

`execute()` ritorna sempre un dict, ma le chiavi popolate dipendono da `op.kind`:

```python
# data
{"kind": "data", "state_id": "abc12345", "description": "sales > 100", "count": 2876}

# viz
{"kind": "viz", "spec": {"title": {...}, "xAxis": {...}, "series": [...]}}

# view
{"kind": "view", "payload": {"kind": "schema", "columns": [...]}}
```

Il Pydantic `ExecuteResponse` ha tutti i campi opzionali e il frontend
discrimina su `kind`.

### Helper interno `_jsonify`

Polars row values (date, datetime, time) non sono JSON-serializzabili
direttamente. `_jsonify` converte in stringhe ISO. Usato in `preview()`.

---

## 2.4 `data/` — Polars only

Lo strato più basso. **Importa solo Polars.** Nessun riferimento a
`domain/`, `api/`, `controller.py`.

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

Una manciata di alti livelli sopra le decine di dtype di Polars. Usato
ovunque per: pickerare widget nei dialog (numeric → Spinner range), per
i badge colorati nella table preview, per il binning nella heatmap.

### `data/loader.py`

3 funzioni `from_bytes` (CSV, TSV, Parquet) + 2 `from path` (per uso
locale / test) + un dispatcher `load_from_upload(filename, content)` che
sceglie il loader giusto in base all'estensione.

Ritornano sempre `pl.LazyFrame`. Per CSV in memoria:

```python
def load_csv_from_bytes(content, *, separator=",", try_parse_dates=True, infer_schema_length=10_000):
    df = pl.read_csv(io.BytesIO(content), separator=separator,
                     try_parse_dates=try_parse_dates,
                     infer_schema_length=infer_schema_length)
    return df.lazy()
```

`pl.read_csv` su buffer + `.lazy()` invece di `pl.scan_csv` perché il
file è già in memoria (è arrivato via upload HTTP). `try_parse_dates=True`
fa sì che Polars riconosca colonne date ISO automaticamente.

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
Wrappa `lf.collect_schema()` (operazione gratis, solo metadati) e mappa
ogni dtype a un `ColumnType`.

#### `schema_with_dtypes(lf) -> list[dict]`
Versione list-of-dicts del precedente, comoda per JSON-serialization
verso `/api/schema`. Include sia il dtype Polars (`Float64`) che il
ColumnType ("numeric").

#### `column_stats(lf, column) -> ColumnStats`
Una sola `collect()` su un'aggregata:
- numerico/temporale → min, max, null_count
- categorico/boolean → distinct values (capped a 50, sorted) + null_count
- altro → solo null_count

Capping a 50 per un motivo concreto: il widget MultiSelect del dialog
deve restare usabile. Sopra 50 lo flag `distinct_truncated=True` permette
alla UI di suggerire "usa filter_text_contains" o simili.

---

## 2.5 `domain/` — History tree + Operations

Il **cuore** del backend. Pure Python, niente FastAPI/IO.

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

`eq=False` → identità, non equality. Due State con stesso `id` MA
oggetti diversi sono trattati come diversi (cosa che non succede mai
in pratica). Permette di metterli in `dict[id, State]`.

#### `State.count` (proprietà, lazy + cached)
```python
@property
def count(self) -> int:
    if self._count_cache is None:
        self._count_cache = int(self.lf.select(pl.len()).collect().item())
    return self._count_cache
```

Conta quante righe ha lo stato — operazione potenzialmente costosa, perciò
**caching**. Il count è immutabile (lo stato è immutabile).

#### Classe `History`

```python
class History:
    root: State
    current: State
    _index: dict[str, State]   # id → State, lookup O(1)

    def apply(op_fn, description) -> State:
        new_lf = op_fn(self.current.lf)
        child = State(lf=new_lf, description=description, parent=self.current)
        self.current.children.append(child)
        self._index[child.id] = child
        self.current = child
        return child

    def goto(state_id) -> State: ...
    def branch_from(state_id, op_fn, description) -> State: ...
    def lineage() -> list[State]: ...     # da root al current
    def find(state_id) -> State: ...
    def all_states() -> list[State]: ...
```

L'astrazione che permette il branching: `branch_from(state_id, ...)` è
`goto(state_id)` + `apply(...)`, e poiché `apply` aggiunge un *child*
al current, due chiamate `branch_from` con lo stesso `state_id` ma op
diverse producono due *figli* dello stesso parent → tree.

#### Test (`tests/test_history.py`)
11 test che coprono: root creation, id univoci, count cache lazy, apply
linea, goto senza mutare l'albero, branch (sibling), lineage, find,
all_states. Sono il safety net del componente più critico.

### `domain/operations.py`

```python
@dataclass(frozen=True)
class ParamSpec:
    name: str
    kind: str            # "column" | "column_numeric" | "value_from_column" | ...
    label: str
    options: list[str] | None = None
    default: Any = None
    depends_on: str | None = None    # nome di un altro param da cui dipende

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

**Pattern data-driven**: la registry è la *unica* fonte di verità.
Aggiungere un'op = aggiungere una riga in `OPERATIONS`. Il frontend
chiama `/api/operations` e auto-genera menu + dialog dai `params`.

#### Le 21 ops sono dettagliate in [`05-operazioni.md`](./05-operazioni.md).

#### `format_description(op, params)`
Funzione che trasforma `(op, params)` in una stringa human-readable per
i chip della history strip. Es.:
- `filter_range` → `"sales ∈ [100, 5000]"`
- `group_by` → `"Group by ship_mode → mean(sales)"`
- `keep_top_n` → `"Keep top 100"`

#### `operations_catalog() -> list[dict]`
Serializza la registry per l'API. Il dict include `id, label, menu, kind`
e `params` come lista di `asdict(ParamSpec)`. Il frontend dialog builder
mappa ogni `param.kind` a un widget React.

---

## 2.6 `viz/` — pure chart spec generators

7 file: 6 chart types + un comune.

### `viz/_common.py`

Palette + helper condivisi. Tutto è *dati* (constants + funzioni che
ritornano dict ECharts):

```python
INDIGO = "#4f46e5"
TEXT = "#0f172a"
GRID = "#e5e7eb"
HEATMAP_PALETTE = [...11 indigo shades...]

def title(text, subtitle=None) -> dict:    # ECharts title block, semibold 14px
def axis_name(label, gap=36) -> dict:      # axis name styling
def base_grid(*, has_subtitle=False) -> dict:  # padding adattivo
def base_tooltip() -> dict:                 # bianco, ombra soft
def axis_style() -> dict:                   # axis line slate, label muted
def fmt_num(v) -> str:                      # "1.5k", "2.3M", "0.045"
def fmt_count(n) -> str:                    # interi human
def maybe_pluralise(n, word) -> str:        # "1 row" / "12 rows"
```

### Le 6 viz functions

Tutte hanno la stessa firma:

```python
def histogram(df: pl.DataFrame, params: dict) -> dict:
def scatter(df: pl.DataFrame, params: dict) -> dict:
def timeline(df: pl.DataFrame, params: dict) -> dict:
def bar_topn(df: pl.DataFrame, params: dict) -> dict:
def heatmap(df: pl.DataFrame, params: dict) -> dict:
def map_payload(df: pl.DataFrame, params: dict) -> dict:    # NB: kind="map"
```

**Pure functions**: nessun side-effect, nessun riferimento a stato. Riceve
un `df` già materializzato e ritorna un dict. Per i chart ECharts standard
(histogram, scatter, timeline, bar_topn, heatmap) il dict è un'opzione
ECharts pronta da passare a `<ReactECharts option={...} />`.

`map_payload` invece ritorna `{kind: "map", center, points, ...}` —
NON è una option ECharts, è un payload custom che il frontend dispatch
verso `<MapCanvas>` (Leaflet).

#### Heatmap: il caso più complesso
`heatmap.py` accetta colonne di **qualsiasi tipo** sui due assi:
- numerico → bin equal-width via `np.digitize`
- temporale → bin sui timestamp interi, edge etichettati come date
- categorico → distinct values

Più una metrica opzionale (`value` + `agg`) per heatmap di valori
aggregati invece di counts. Vedi
[`05-operazioni.md → viz_heatmap`](./05-operazioni.md#viz_heatmap).

#### ECharts gotchas presenti nel codice
- **`tooltip.formatter` come template string**, non function-string.
  Eval di funzioni JS via JSON è blocked → usiamo `{c}`, `{a}`, `{b}`.
- **Heatmap palette parte da indigo-50, non bianco** — su sfondo bianco,
  cell con count=1 sarebbero invisibili.
- **`label.formatter: "{@[2]}"`** sulle celle heatmap mostra il count
  inside la cella (più leggibile del solo tooltip).

---

## 2.7 `api/` — FastAPI layer

### `api/deps.py`

Una sola funzione: `get_session(response, session_id=Cookie(...))`. È un
**dependency** FastAPI.

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
        sess.set_cookie_on(response)   # nuova sessione → setta cookie
    return sess
```

Ogni endpoint dichiara `sess: Session = Depends(get_session)` e si trova
il Controller giusto pronto + il cookie eventualmente settato.

### `api/schemas.py`

Tutti i Pydantic models I/O. Sono il **contratto col frontend**:

| Pydantic | Usato in |
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

Il `frontend/src/api/types.ts` ricalca questi modelli 1-a-1 in TypeScript.

### `api/routes.py`

12 endpoint. Quasi tutti sono shell sottili sopra `Controller`:

```
GET  /api/session                  → SessionInfo
POST /api/reset                    → {ok: true}
POST /api/upload                   → UploadResponse        (multipart file)
GET  /api/schema?state_id=...      → SchemaResponse
GET  /api/preview?n=&offset=&state_id=...  → PreviewResponse
GET  /api/column-stats?column=&state_id=...  → ColumnStatsResponse
GET  /api/operations               → OperationsCatalog     (catalog statico)
POST /api/execute                  → ExecuteResponse
POST /api/branch                   → ExecuteResponse(kind=data)
POST /api/goto                     → {current_id}
GET  /api/history                  → HistoryResponse
GET  /api/export?state_id=...      → text/csv stream
```

Il pattern di gestione errori è uniforme:

```python
try:
    result = sess.controller.execute(req.op_id, req.params, req.from_state_id)
except KeyError as exc:    raise HTTPException(404, detail=str(exc))
except ValueError as exc:  raise HTTPException(400, detail=str(exc))
except Exception as exc:   raise HTTPException(500, detail=str(exc))
```

Il frontend (`api/client.ts`) intercetta queste risposte e ne estrae
`response.data.detail` come `Error.message`, perciò il toast in alto
mostra esattamente il testo Python:

> `Aggregation 'mean' requires a numeric target column (got String).`

---

## 2.8 `tests/`

Solo `test_history.py` per ora — 11 test sull'unica struttura dati
veramente complessa, l'`History` tree.

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

Lanciati con `uv run pytest backend`. Tutti passano (~0.1 s totali).

**Cosa manca**: test sulle ops (banale ma utile), test sull'API
(usando `httpx.AsyncClient(app=app, base_url=...)`), property-based test
su `column_stats` con dataset random. Roadmap future.
