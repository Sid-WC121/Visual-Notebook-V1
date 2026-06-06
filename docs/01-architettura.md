# 01 — Architettura

> 🇮🇹 Italiano · [🇬🇧 English](./en/01-architecture.md)

> Vista d'insieme del progetto: come sono organizzati gli strati,
> da dove viaggiano i dati, perché abbiamo fatto certe scelte.

## Indice locale
- [1.1 Mappa generale](#11-mappa-generale)
- [1.2 I 4 strati](#12-i-4-strati)
- [1.3 Flusso di una richiesta](#13-flusso-di-una-richiesta)
- [1.4 Modello dati: History tree + Notebook](#14-modello-dati-history-tree--notebook)
- [1.5 Decisioni di design (e perché)](#15-decisioni-di-design-e-perché)
- [1.6 Struttura cartelle](#16-struttura-cartelle)
- [1.7 Sessioni e persistenza](#17-sessioni-e-persistenza)

---

## 1.1 Mappa generale

```
   Browser                                  Backend Python
┌──────────────┐    HTTP / JSON           ┌─────────────────────────┐
│  React + TS  │  ◄──────────────────►    │ FastAPI                 │
│  Vite proxy  │   cookie  vn_session      │  ↕                      │
│              │                           │ Controller              │
│  Components  │                           │  ↕                      │
│  Zustand     │                           │ Domain (History, Ops)   │
│  TanStack Q. │                           │  ↕                      │
│  ECharts /   │                           │ Data (Polars LazyFrame) │
│  Leaflet     │                           │                         │
└──────────────┘                           └─────────────────────────┘
       │                                               │
       │ persist localStorage                          │ in-memory
       ▼                                               ▼
   notebook                                       SessionStore
   cells[]                                       {sid: Controller}
```

Due processi separati durante lo sviluppo:

- `uvicorn visual_notebook.main:app --port 8000` — backend FastAPI
- `npm run dev` — Vite dev server su 5173 con proxy `/api/*` → 8000

In produzione (non implementato) si servirebbe il bundle frontend statico
direttamente da FastAPI con `app.mount("/", StaticFiles(...))`, eliminando
il proxy.

---

## 1.2 I 4 strati

```
┌───────────────────────────────────────────────────────┐
│ PRESENTATION (frontend/src/components/)               │
│   React components, Tailwind, drag-and-drop           │
└──────────────────┬────────────────────────────────────┘
                   │ HTTP
┌──────────────────▼────────────────────────────────────┐
│ API (backend/visual_notebook/api/)                    │
│   FastAPI routes, Pydantic schemas, deps cookie sess  │
└──────────────────┬────────────────────────────────────┘
                   │ Python calls
┌──────────────────▼────────────────────────────────────┐
│ ORCHESTRATION (backend/visual_notebook/controller.py) │
│   Controller: tiene 1 History per sessione, dispatch  │
│   tra data/viz/view operations                        │
└──────────────────┬────────────────────────────────────┘
                   │
┌──────────────────▼────────────────────────────────────┐
│ DOMAIN (backend/visual_notebook/domain/)              │
│   - history.py: tree of `State` nodes                 │
│   - operations.py: registry dichiarativo + apply fns  │
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
│   No imports da api/, controller, history             │
└───────────────────────────────────────────────────────┘
```

**Regole di import**:
- `data/` → solo Polars
- `domain/` → `data/`, `viz/`
- `viz/` → solo Polars + numpy (pure functions)
- `controller.py` → `data/`, `domain/`
- `api/` → tutto il backend
- Frontend → solo HTTP, niente import diretti del backend

Questa rigidità è quello che ci ha permesso di **scambiare la UI senza
rompere il dominio**: la prima versione del progetto (`visual-notebook` v1)
usava Bokeh server come UI; la v2 corrente usa React. Il `domain/` e
`data/` sono praticamente identici tra le due versioni.

---

## 1.3 Flusso di una richiesta

Esempio: l'utente clicca su una pillola del chart-builder e fa "Genera"
per un istogramma su `sales`.

```
1. ChartBuilder onClick "Genera"
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
6. JSON serializzato → ritorna al frontend
   │
   ▼
7. notebook store inserisce un ChartCellData con spec=...
   │  Zustand emit → componenti che usano `cells` re-renderano
   ▼
8. ChartCellView passa lo spec a <ReactECharts>
   │
   ▼
9. ECharts canvas render
```

L'operazione di `viz` **non avanza lo stato**: né History né Notebook
hanno un nuovo nodo "stato dati" — il chart è una *lente* sul dato,
non una sua trasformazione.

Per un'operazione di `data` il flusso è simile ma:
- backend usa `branch_from(state_id, op_id, params)` invece di `execute(...)`
- crea un nuovo `State` nel tree, lo collega come figlio del genitore
- ritorna `{state_id, description, count}`
- frontend inserisce un `TableCellData` nel notebook
- **se ci sono celle a valle**, le **rebasa** in cascata (vedi
  [04-cascade.md](./04-cascade.md))

---

## 1.4 Modello dati: History tree + Notebook

Due modelli paralleli, sincronizzati ma autonomi:

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

Ogni nodo `State` è **immutabile**: ha `id` (uuid8), `lf` (LazyFrame),
`description`, `parent`, `children`, `count` cached.

Mai si modifica uno State esistente — un'op ne crea uno nuovo collegato.
Il tree può ramificarsi: due op diverse applicate allo stesso parent
producono due figli.

### Client-side: Notebook (flat array)

```ts
cells: [
  { type: "table", stateId: "root_id", description: "Loaded: orders.csv", opChain: [] },
  { type: "table", stateId: "id_A",    description: "sales > 100",         opChain: [{op_id:"filter_range", params:{...}}] },
  { type: "chart", sourceStateId: "id_A", opId: "viz_histogram", spec: {...} },
  { type: "table", stateId: "id_C",    description: "no nulls in sales",   opChain: [{op_id:"filter_not_null", ...}] },
]
```

Il notebook è una **lista**, non un albero — è la lineage che l'utente
vede. Internamente ogni cella tabella sa quale `opChain` l'ha prodotta
*dalla cella precedente*. La cella chart sa qual è la sua `sourceStateId`
(la tabella precedente).

### Il legame tra i due

- L'`stateId` di una `TableCellData` punta a uno `State` nel server tree.
- L'`sourceStateId` di una `ChartCellData` punta allo `State` su cui il
  chart è stato renderizzato.
- L'`opChain` della cella permette al frontend di **ricostruire** lo
  stato facendo replay delle ops — necessario per la cascade rebase.

---

## 1.5 Decisioni di design (e perché)

### Perché Polars **lazy**, non eager?
Una manipolazione (filter, group, sort) costruisce un piano logico ma non
materializza dati. Solo quando un viz fa `.collect()` o l'API risponde a
`/preview` si calcola davvero. Su dataset grandi questo significa che
applicare 5 filtri in fila non scansiona 5 volte il file: Polars optimizza
la query in un'unica passata.

### Perché un `History` *tree* server-side?
Permette il branching futuro (oggi non esposto in UI ma supportato
dall'API). Storage memoria O(N) sul numero di stati distinti, ognuno
contiene solo un LazyFrame (riferimento a un piano logico, non dati).

### Perché un `opChain` per ogni cella, non solo `opId`?
Per gestire le **operazioni compound**: un brush su scatter produce due
filtri (range x AND range y) che devono essere atomici dal punto di vista
dell'utente (un solo "step" nella history) ma replayabili come una catena
di 2 calls `/branch`.

### Perché Zustand **e** TanStack Query, non solo uno?
- TanStack Query gestisce **stato server**: `/schema`, `/preview`,
  `/operations`, `/history`. Cache, dedupe, refetch on invalidation.
- Zustand gestisce **stato UI puro**: dialog aperto, slot del chart-
  builder selezionati, errore corrente, lista celle del notebook.

Mischiarli sarebbe confuso. La regola: se viene dal backend → React Query;
se è solo del browser → Zustand.

### Perché ECharts e non BokehJS?
La v1 del progetto usava Bokeh server (UI + render). La v2 separa:
backend produce solo *specifiche di chart* (dict ECharts), il frontend
fa il rendering. ECharts ha un'API più dichiarativa di BokehJS, una
documentazione molto più navigabile, e ottime feature out-of-the-box
(visualMap per heatmap, dataZoom per timeline, brush per scatter).

### Perché `uv` e non `pip` + `venv`?
- Lockfile (`uv.lock`) automatico → riproducibilità
- Workspace: il `pyproject.toml` root dichiara `members = ["backend"]` e
  abbiamo accesso a `uv run` da qualsiasi cartella senza attivare nulla
- ~10× più veloce di pip per resolve + install

### Perché sessioni in cookie + dict in-memory invece di un DB?
Strumento single-user, single-tab. Il LazyFrame è un riferimento a un
piano lazy: se il browser tab si chiude, perdere lo stato è OK. La
persistenza vera della "lineage" (cosa sto esplorando) sta lato browser
(localStorage tramite Zustand persist).

---

## 1.6 Struttura cartelle

```
va_project/
├── pyproject.toml              # uv workspace root
├── uv.lock                     # lockfile (committato)
├── README.md
├── orders.csv                  # dataset demo (5009 righe)
│
├── backend/
│   ├── pyproject.toml          # workspace member "visual-notebook"
│   ├── visual_notebook/
│   │   ├── __init__.py
│   │   ├── main.py             # entry uvicorn: crea FastAPI app
│   │   ├── controller.py       # Controller (1 per sessione)
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
│   │       ├── schemas.py      # tutti i Pydantic models I/O
│   │       └── routes.py       # gli endpoint /api/*
│   └── tests/
│       └── test_history.py     # 11 test sull'History tree
│
└── frontend/
    ├── package.json
    ├── vite.config.ts          # proxy /api → :8000
    ├── tailwind.config.js      # palette light minimalist
    ├── tsconfig.json
    ├── index.html              # carica Leaflet CSS
    └── src/
        ├── main.tsx            # entry React + QueryClientProvider
        ├── App.tsx             # DnDContext + state switcher
        ├── styles/index.css    # Tailwind base + Leaflet overrides
        ├── api/
        │   ├── client.ts       # axios instance + branchOp + executeFromState
        │   ├── hooks.ts        # tutti i useXxx() per /api/*
        │   └── types.ts        # tipi TS che ricalcano Pydantic
        ├── store/
        │   ├── notebook.ts     # cells[] + applyChainAndCascade + ...
        │   └── ui.ts           # dialog, slot selezionati, errori
        ├── lib/
        │   ├── format.ts       # formatNumber, formatCellValue, typeBadge
        │   └── chartTypes.ts   # CHART_TYPES per il chart-builder
        └── components/
            ├── Header.tsx
            ├── UploadPanel.tsx
            ├── ErrorToast.tsx
            ├── NotebookPage.tsx        # mostra cells[]
            ├── TableCellView.tsx       # cella tabella + toolbar
            ├── ChartCellView.tsx       # cella chart (ECharts | Leaflet)
            ├── ManipulationPanel.tsx   # form per data ops
            ├── VisualizationPanel.tsx  # chart-builder con drag-and-drop
            ├── TablePreview.tsx        # tabella paginata interna a cella
            ├── SchemaView.tsx          # vista schema (per view ops)
            └── MapCanvas.tsx           # rendering Leaflet
```

---

## 1.7 Sessioni e persistenza

### Server-side
`backend/visual_notebook/session.py` mantiene un dict thread-safe:

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

Il singleton `store` è creato a livello di modulo. `get_session()` in
`api/deps.py` legge il cookie `vn_session`, lo passa a `get_or_create`,
e setta il cookie sul response se è nuovo.

Quando il processo backend si riavvia → tutti gli stati persi. Il
frontend rileva l'incoerenza tra `notebook.cells[0].stateId` e il vero
root del backend, e fa truncate(0).

### Client-side
Zustand persist middleware salva `cells[]` in `localStorage` con chiave
`va-notebook`. La key ha una `version: 3` — bumpando la versione, il
middleware esegue la `migrate()` che (per ora) **scarta** tutto lo stato
vecchio e ricomincia da zero.

```ts
{
  name: "va-notebook",
  version: 3,
  migrate: (_persisted, _version) => ({ cells: [] }),
  partialize: (s) => ({ cells: s.cells }),
}
```

Bumps: si fanno quando lo schema delle celle cambia in modo
backwards-incompatible (es. v2 → v3 quando abbiamo introdotto `opChain`
sostituendo `opId`+`opParams`).
