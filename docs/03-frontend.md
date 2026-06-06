# 03 — Frontend

> 🇮🇹 Italiano · [🇬🇧 English](./en/03-frontend.md)

> Walkthrough modulo per modulo della parte React/TypeScript.
> Ordine di lettura consigliato: api → store → lib → components → App.

## Indice
- [3.1 `main.tsx` — entry React](#31-maintsx--entry-react)
- [3.2 `App.tsx` — root + DnD context](#32-apptsx--root--dnd-context)
- [3.3 `api/` — client HTTP + hook + tipi](#33-api--client-http--hook--tipi)
- [3.4 `store/` — Zustand stores](#34-store--zustand-stores)
- [3.5 `lib/` — helper puri](#35-lib--helper-puri)
- [3.6 `components/` — UI](#36-components--ui)
- [3.7 Styling: Tailwind + classi semantiche](#37-styling-tailwind--classi-semantiche)

---

## 3.1 `main.tsx` — entry React

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
```

- **`StrictMode`** in dev fa doppio-render dei componenti per catturare
  effetti collaterali. In prod è no-op.
- **`QueryClient` config**: `staleTime: 0` (ogni query è "stale" subito,
  refetch ad ogni invalidate), `refetchOnWindowFocus: false` (non
  ricaricare automaticamente quando torno sul tab — confonderebbe in
  un'app che modifica lo stato lato server), `retry: false` (errori
  vengono mostrati subito invece di insistere).

---

## 3.2 `App.tsx` — root + DnD context

```tsx
export default function App() {
  const { data: session } = useSession();
  const cells = useNotebookStore((s) => s.cells);
  const initNotebook = useNotebookStore((s) => s.initNotebook);
  const truncateFrom = useNotebookStore((s) => s.truncateFrom);
  const setSlot = useUIStore((s) => s.setSlot);
  const setError = useUIStore((s) => s.setError);
  const vizCellId = useUIStore((s) => s.vizCellId);
  const [dragChip, setDragChip] = useState<{column, colType} | null>(null);

  const { data: history } = useHistory(!!session?.has_data);

  // Init root cell after upload
  useEffect(() => {
    if (!session?.has_data || cells.length > 0 || !history) return;
    const root = history.states.find(s => s.parent_id === null);
    initNotebook({ id: ..., type: "table", stateId: root.id, ... opChain: [] });
  }, [session?.has_data, history, cells.length, initNotebook]);

  // Clear notebook on session reset
  useEffect(() => {
    if (!session?.has_data && cells.length > 0) truncateFrom(0);
  }, [session]);

  // Detect persisted-stateId mismatch (server restart)
  useEffect(() => { ... }, [session, history]);

  return !session ? <Connecting/>
       : !session.has_data ? <UploadScreen/>
       : <DndContext onDragStart={...} onDragEnd={...}>
           <Header totalRows={...}/>
           <ErrorToast/>
           <main><NotebookPage/></main>
           <DragOverlay>{dragChip && <ChipPreview/>}</DragOverlay>
         </DndContext>;
}
```

### Tre stati di App

1. **`session === undefined`** → loading "Connecting…"
2. **`!session.has_data`** → drop-zone `<UploadPanel>`
3. **dataset caricato** → notebook con DndContext

### useEffect 1: inizializzazione root cell

Dopo l'upload, `useHistory()` torna l'albero degli stati. Trova il root
(`parent_id === null`) e lo trasforma in una `TableCellData` con
`opChain: []` (la root non viene da un'op). Salvato in `notebook.cells[0]`.

### useEffect 2: clear su reset

Se la sessione perde `has_data` (l'utente clicca "Load different file" →
backend resetta) e ci sono celle in localStorage, le **azzera**.

### useEffect 3: detect server restart

Se il `notebook.cells[0].stateId` non corrisponde più al root del backend
(succede dopo che il backend si è riavviato e ha generato nuovi UUID),
azzera. Senza questo, il frontend manderebbe richieste con stateId che
non esistono più → 404.

### DnD context

`@dnd-kit/core` è il provider. Ascolta `onDragStart`/`onDragEnd`. Quando
una colonna chip viene trascinata su un drop slot:

```tsx
const onDragEnd = (e: DragEndEvent) => {
  const dragged = e.active.data.current;       // {kind: "column", column, type}
  const target = e.over?.data.current;          // {kind: "vp-slot", cellId, slotName, accepts}

  if (target.cellId !== vizCellId) return;      // solo lo slot del viz panel attivo
  if (target.accepts !== "any" && dragged.type !== target.accepts) {
    setError(`Tipo incompatibile: ${dragged.column} è ${dragged.type}, lo slot vuole ${target.accepts}.`);
    return;
  }
  setSlot(target.slotName, dragged.column, dragged.type);
};
```

`<DragOverlay>` mostra una preview del chip mentre lo trascini, con
classe portal-style che rispetta gli stili del chip originale.

---

## 3.3 `api/` — client HTTP + hook + tipi

### `api/client.ts`

```ts
export const http = axios.create({
  baseURL: "/api",
  withCredentials: true,    // INVIA il cookie vn_session
  timeout: 30_000,
});

http.interceptors.response.use((r) => r, (err) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") err.message = detail;
  return Promise.reject(err);
});
```

L'interceptor traduce gli errori HTTP in messaggi leggibili: il backend
ritorna `{detail: "..."}` per ogni 4xx/5xx, e noi sostituiamo il messaggio
generico di axios con quel testo. Così `error.message` nel toast è
sempre il vero messaggio Python.

### Funzioni helper imperative

```ts
export async function branchOp(stateId, opId, params): Promise<ExecuteResponse> {
  return (await http.post("/branch", {state_id: stateId, op_id: opId, params})).data;
}
export async function executeFromState(opId, params, fromStateId): Promise<ExecuteResponse> {
  return (await http.post("/execute", {op_id: opId, params, from_state_id: fromStateId})).data;
}
```

Usate dal **notebook store** durante la cascade — quando devi fare 5
chiamate API in sequenza, `useMutation` di TanStack Query è scomodo
(mescola gestione stato e retry); meglio chiamare axios direttamente.

### `api/hooks.ts`

Tutti i `useXxx()` per ogni endpoint, costruiti su TanStack Query.

```ts
const K = {
  session: ["session"],
  schema:  (stateId) => ["schema", stateId ?? "current"],
  preview: (stateId, n, offset) => ["preview", stateId, n, offset],
  ops:     ["operations"],
  history: ["history"],
  colStats:(col, stateId) => ["column-stats", col, stateId ?? "current"],
};

export function useSession()      { return useQuery({queryKey: K.session,  queryFn: ...}); }
export function useOperations()   { return useQuery({queryKey: K.ops,       queryFn: ..., staleTime: Infinity}); }
export function useSchema(sid)    { return useQuery({queryKey: K.schema(sid), enabled: !!sid, ...}); }
export function usePreview(sid, n=50, off=0) {
  return useQuery({
    queryKey: K.preview(sid, n, off),
    enabled: !!sid,
    queryFn: ...,
    placeholderData: (prev) => prev,    // smooth pagination
  });
}
export function useHistory(enabled) { ... }
export function useColumnStats(col, sid, enabled=true) {
  return useQuery({..., staleTime: 60_000});  // distinct values cambiano poco
}

// Mutations
export function useUpload()       { ... onSuccess: invalidate session+history }
export function useExecuteFrom()  { ... mutation per /execute }
export function useBranchFrom()   { ... mutation per /branch }
export function useReset()        { ... onSuccess: invalidateQueries() (tutto) }
```

**Tre dettagli importanti**:
1. **Query key strategy**: include `stateId` perché lo *stesso* `useSchema`
   chiamato da celle diverse deve avere cache distinte (ogni cella ha
   uno stato proprio).
2. **`staleTime: Infinity` per `useOperations`**: il catalog operazioni
   è statico a runtime, non serve mai refetcharlo.
3. **`placeholderData: (prev) => prev` su `usePreview`**: durante il
   cambio pagina la table non flickera, mostra la pagina vecchia con
   opacità ridotta finché arriva la nuova.

### `api/types.ts`

Mirror dei Pydantic backend in TypeScript. Tipo chiave per il notebook:

```ts
export interface OpStep {
  op_id: string;
  params: Record<string, unknown>;
}

export interface CellMeta {
  fromChartId?: string;   // tag per cascade-replace (vedi 04-cascade.md)
}

export interface TableCellData {
  id: string;
  type: "table";
  stateId: string;          // → server-side State.id
  description: string;
  rowCount: number;
  lineage: string[];        // descrizioni di tutti i passi fino a qui
  opChain: OpStep[];        // ops che hanno prodotto questa cella dal genitore
  meta?: CellMeta;
}

export interface ChartCellData {
  id: string;
  type: "chart";
  opId: string;             // viz_histogram, viz_map, ...
  opParams: Record<string, unknown>;
  spec: Record<string, unknown>;   // ECharts option dict | MapPayload
  sourceStateId: string;    // → tabella da cui sono renderizzato
  lineage: string[];
}

export type CellData = TableCellData | ChartCellData;
```

---

## 3.4 `store/` — Zustand stores

Due store distinti, **non** condividono stato.

### `store/notebook.ts`

```ts
interface NotebookState {
  cells: CellData[];
  isCascading: boolean;
  cascadeError: string | null;

  initNotebook: (root: TableCellData) => void;
  truncateFrom: (index: number) => void;
  applyChainAndCascade: (parentIndex, ops, options?) => Promise<void>;
  applyChainAfterChart: (chartIndex, chartId, ops) => Promise<void>;
  appendChartCell: (parentIndex, opId, params) => Promise<void>;
}
```

#### `applyChainAndCascade(parentIndex, ops, options?)`

Il cuore. Vedi [04-cascade.md](./04-cascade.md) per il deep dive.

Sintesi:
1. Prende `parent = cells[parentIndex]` (può essere table O chart cell —
   leggiamo `stateId` se table, `sourceStateId` se chart).
2. Applica `ops` in catena su `parent.stateId` con `branchOp` →
   stato finale, `count`, `description`.
3. Crea una `TableCellData` con `opChain: ops, meta: options?.meta`.
4. **Cascade**: per ogni cella `cells[parentIndex+1..]` re-applica il
   suo `opChain` (table) o re-esegue la viz (chart) sul nuovo stato.
5. Se una rebase fallisce → ferma la cascade, scrive in `cascadeError`,
   tronca tutto da quel punto in giù.
6. Setta `isCascading: false` alla fine (success o fail).

#### `applyChainAfterChart(chartIndex, chartId, ops)`

Versione speciale per i filter prodotti da click interattivi su un chart.
Differenza: prima di cascadare, controlla se la cella *immediatamente
successiva* al chart è anch'essa una "chart-derived filter" dello
stesso chart (`meta.fromChartId === chartId`). Se sì, la **rimuove**
prima di applicare la nuova → click successivi sullo stesso chart
sostituiscono la selezione invece di stackare filtri contraddittori.

Poi delega a `applyChainAndCascade` con `meta: {fromChartId: chartId}`
così la nuova cella è marchiata.

#### `appendChartCell(parentIndex, opId, params)`

I chart sono *leaves*: non avanzano lo stato. Quindi questa action
**inserisce** una `ChartCellData` dopo `parentIndex` senza troncare il
resto del notebook (non c'è nulla da rebase).

#### Persistenza

```ts
{
  name: "va-notebook",
  version: 3,
  migrate: (_persisted, _version) => ({ cells: [] }),
  partialize: (s) => ({ cells: s.cells }),     // non persistere isCascading/error
}
```

`partialize` esclude i flag transienti. `version` bumped quando lo
schema delle celle cambia: `migrate` scarta lo stato vecchio e parte
da zero.

#### Dev hint

```ts
if (import.meta.env.DEV) {
  (window as any).__notebookStore = useNotebookStore;
}
```

In dev console: `__notebookStore.getState().cells` per ispezionare.

### `store/ui.ts`

```ts
interface UIState {
  dialogOp: OperationDef | null;
  openDialog/closeDialog

  errorMessage: string | null;
  setError

  vizCellId: string | null;     // id della cella che ha il viz panel aperto
  chartTypeId: string;
  slots: { [slotName]: {column, type} }
  extras: { [name]: number | string }
  openVizPanel/closeVizPanel
  setChartTypeId  // anche resetta slots+extras
  setSlot/clearSlot/setExtra/setExtras
}
```

UI state pure: cosa è aperto, cosa è selezionato, ultimo errore. Non
viene persistito (è transiente per definizione).

`vizCellId` è una *chiave globale*: un solo viz panel può essere aperto
alla volta. Se apri il viz panel sulla cella B mentre era aperto sulla
A, A si chiude automaticamente. Questo è coordinato in `TableCellView.tsx`
chiamando `openVizPanel(cell.id)` / `closeVizPanel()`.

---

## 3.5 `lib/` — helper puri

### `lib/format.ts`

```ts
export function formatNumber(n: number): string;        // n.toLocaleString()
export function formatCellValue(v: unknown): string;    // float trim, etc.
export function formatType(kind: string): string;       // "Numeric"
export function typeBadge(kind: string): string;        // "#", "A", "⌚", "✓", "?"
```

### `lib/chartTypes.ts`

```ts
export interface ChartSlot {
  name: string;        // "x", "column", "lat", ...
  label: string;       // "X (numeric)"
  accepts: "numeric" | "categorical" | "temporal" | "boolean" | "any";
}

export interface ChartExtra {
  name: string;
  label: string;
  default: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface ChartType {
  id: string;          // "viz_histogram"
  label: string;
  icon: string;
  slots: ChartSlot[];
  extras: ChartExtra[];
}

export const CHART_TYPES: ChartType[] = [
  { id: "viz_histogram", label: "Histogram", slots: [{name:"column", accepts:"numeric"}], extras: [{name:"bins", default:30}] },
  { id: "viz_scatter",   slots: [{name:"x", accepts:"numeric"}, {name:"y", accepts:"numeric"}] },
  { id: "viz_bar_topn",  slots: [{name:"column", accepts:"categorical"}], extras: [{name:"n", default:10}] },
  { id: "viz_timeline",  slots: [{name:"x", accepts:"temporal"}, {name:"y", accepts:"numeric"}] },
  { id: "viz_heatmap",   slots: [{name:"x", accepts:"any"}, {name:"y", accepts:"any"}], extras: [{name:"bins", default:10}] },
  { id: "viz_map",       slots: [{name:"lat", accepts:"numeric"}, {name:"lon", accepts:"numeric"}] },
];
```

Mirror del backend ma più semplice (il backend supporta più param come
agg/value per heatmap). Il chart-builder sceglie da qua quali pillole
e quali slot mostrare.

---

## 3.6 `components/` — UI

13 componenti. Vediamoli per ruolo.

### Layout & navigation

#### `Header.tsx`
Bar superiore: cubo indigo + "Visual Notebook" + meta dataset
(filename + row count) + due bottoni "Export CSV" e "Load different file"
quando un dataset è caricato. Usa `useSession()` e `useReset()`.

#### `UploadPanel.tsx`
Drop zone + click-to-browse. Usa `useUpload()` e gestisce lo stato di
drag locale (`isDragging`). Sta da solo nel viewport quando `!has_data`.

#### `ErrorToast.tsx`
Banner rossa in alto. Mostra `errorMessage` da UIStore. Auto-dismiss
dopo 8 secondi via `setTimeout`. Bottone × per chiudere subito.

#### `NotebookPage.tsx`
Map sopra `notebook.cells` e renderizza `TableCellView` o `ChartCellView`
per ognuno. Auto-scroll al fondo quando una nuova cella viene appesa
(detect `cells.length > prevLength`).

### Celle del notebook

#### `TableCellView.tsx`
Card della cella tabella. Contiene:
- **Header**: badge "Dataset"/"Tabella", description, lineage chips
  indigo, row count, ↓ CSV link, × per `truncateFrom(index)` (escluso
  per la root)
- **TablePreview** inline (limitata in altezza, paginata)
- **Toolbar**: due bottoni "+ Manipolazione" e "+ Visualizzazione"
- **Pannello inline**: quando uno dei due bottoni è attivo, sotto
  apre un riquadro indigo con `<ManipulationPanel>` o `<VisualizationPanel>`

`useState<PanelMode>` localmente per gestire quale dei due è aperto.
Coordinato col `vizCellId` globale dello store UI per non avere due viz
panel aperti su due celle diverse.

#### `ChartCellView.tsx`
Card della cella chart. Render condizionale:
```tsx
{cell.opId === "viz_map"
  ? <MapCanvas payload={cell.spec as MapPayload} />
  : <ReactECharts option={spec} notMerge ... onEvents={onEvents}/>
}
```

Inoltre **chart interattivi**: handlers su click di bin (histogram), bar
(bar_topn), brush (scatter), datazoom (timeline), cell click (heatmap).
Ogni handler costruisce una catena di filter ops e chiama
`applyChainAfterChart(cellIndex, cell.id, ops)`. Vedi
[04-cascade.md → chart-driven filters](./04-cascade.md#chart-driven-filters).

#### `TablePreview.tsx`
Tabella HTML custom (no DataTable di nessuna libreria) con:
- Header sticky con type-badge per ogni colonna
- Righe alternate, hover indigo
- Numeri allineati a destra, null italic muted, boolean tinted
- Pagination `« ‹ X-Y of Z › »` in alto a destra
- Auto-reset offset quando il `currentId` cambia (apply op upstream)

Ha un parametro `stateId` — diverso dalla cella in cui sta — per
fetchare la `usePreview()` giusta.

### Form e widget

#### `ManipulationPanel.tsx`
Form per data ops. Apre con una grid 2×N di bottoni icona+label per
ogni op data; click su uno → swap in `OpForm` con `Field` per ogni
ParamSpec.

`Field` discrimina su `spec.kind`:
| kind | Widget |
|---|---|
| `column` / `column_*` | `<select>` filtrato per type |
| `column_numeric_optional` | `<select>` con opzione "(none)" |
| `value_from_column` | `<select>` popolato da distinct values del column param |
| `multi_values_from_column` | `<select multiple>` da distinct values |
| `columns_multi` | `<select multiple>` di nomi colonna |
| `enum` | `<select>` da `spec.options` |
| `int` / `number` | `<input type="number">` |
| `text` (default) | `<input type="text">` |

Auto-fill: per `filter_range`, quando l'utente sceglie la colonna,
`useColumnStats` carica min/max e li scrive nei campi min/max.

Su Apply chiama `applyChainAndCascade(cellIndex, [{op_id, params}])`.

#### `VisualizationPanel.tsx`
Chart-builder con:
- **Pillole** per scegliere il chart type (Histogram, Scatter, ecc.)
- **Palette inline a sinistra**: chip colonna draggabili (anche
  cliccabili per assignment al primo slot vuoto compatibile)
- **Slot drop targets** (un drop per ogni `ChartSlot` del chart selezionato)
- **Extras inline** (bins, n)
- **Generate button** che chiama `appendChartCell(cellIndex, ...)`

I drop sono droppabili da chip della stessa cella (`useDroppable` con
`cellId` nel data). `App.tsx` filtra drop su `target.cellId === vizCellId`
così non puoi droppare su un viz panel di un'altra cella per sbaglio.

### Output specializzati

#### `MapCanvas.tsx`
Wrapper Leaflet (via `react-leaflet`):
- `<MapContainer>` con tile CartoDB light
- `<CircleMarker>` per ogni `point` dal payload
- `<Recenter>` componente che chiama `map.setView(center, ...)` quando
  cambia il center (necessario perché `MapContainer` cache la view
  iniziale e non fa fly automatico)

#### `SchemaView.tsx`
Resa visuale del payload `{kind: "schema", columns: [...]}`. Card grid
responsive con bordo sinistro colorato per tipo, dtype badge indigo,
chip null/range. (Attualmente non triggerato da nessuna UI — il
view_schema può essere chiamato via API ma non c'è ancora un bottone
nella TableCellView. Roadmap.)

---

## 3.7 Styling: Tailwind + classi semantiche

### Palette custom in `tailwind.config.js`

```js
colors: {
  bg: "#fafafa",       panel: "#ffffff",     panel2: "#f9fafb",   panel3: "#f3f4f6",
  border: "#e5e7eb",   border2: "#d1d5db",
  text: "#0f172a",     textd: "#334155",     textdim: "#64748b",  textmute: "#94a3b8",
  accent: "#4f46e5",   accentl: "#6366f1",   accent50: "#eef2ff",
  success: "#10b981",  warn: "#f59e0b",      danger: "#ef4444",   pink: "#ec4899",
}
```

Uso semantico:
- `bg-panel` — superfici (card)
- `bg-panel2` — surface 2 (alternate row, header)
- `bg-panel3` — hover/active
- `text-text` / `text-textd` / `text-textdim` / `text-textmute` —
  scala 4 livelli di contrasto del testo
- `bg-accent` per primari, `bg-accent50` per backgrounds tenui (hover
  accent), `text-accent` per accenti foreground

### Convenzioni componenti

- Card: `bg-panel border border-border rounded-lg shadow-card`
- Bottone primario: `bg-accent text-white border-accent hover:bg-indigo-700`
- Bottone secondario: `bg-panel border-border hover:bg-panel2 hover:border-border2 text-text`
- Type badge (numeric/categorical/...) usa Tailwind built-in:
  `bg-indigo-50 text-indigo-700`, `bg-emerald-50 text-emerald-700`,
  `bg-amber-50 text-amber-700`, `bg-pink-50 text-pink-700`
- Font sizes piccoli usati spesso: `text-[11px]` per caption,
  `text-[12px]` form labels, `text-[13px]` body, `text-[14px]` h-tags.

### Leaflet override (in `styles/index.css`)

Le classi `.leaflet-control-attribution`, `.leaflet-bar a`, ecc. vengono
override per matchare il tema light minimalist. Senza override avrebbero
sfondi grigi chiari di default che stonano col panel bianco.
