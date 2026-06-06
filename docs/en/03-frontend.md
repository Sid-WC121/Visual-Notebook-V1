# 03 — Frontend

> 🇬🇧 English · [🇮🇹 Italiano](../03-frontend.md)

> Module-by-module walkthrough of the React/TypeScript side.
> Suggested reading order: api → store → lib → components → App.

## Index
- [3.1 `main.tsx` — React entry](#31-maintsx--react-entry)
- [3.2 `App.tsx` — root + DnD context](#32-apptsx--root--dnd-context)
- [3.3 `api/` — HTTP client + hooks + types](#33-api--http-client--hooks--types)
- [3.4 `store/` — Zustand stores](#34-store--zustand-stores)
- [3.5 `lib/` — pure helpers](#35-lib--pure-helpers)
- [3.6 `components/` — UI](#36-components--ui)
- [3.7 Styling: Tailwind + semantic classes](#37-styling-tailwind--semantic-classes)

---

## 3.1 `main.tsx` — React entry

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

- **`StrictMode`** in dev double-renders components to catch
  side effects. In production it's a no-op.
- **`QueryClient` config**: `staleTime: 0` (every query is "stale"
  immediately, refetch on every invalidate), `refetchOnWindowFocus:
  false` (don't auto-reload when I come back to the tab — confusing in
  an app that mutates server state), `retry: false` (errors surface
  immediately instead of being retried).

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

### Three App states

1. **`session === undefined`** → loading "Connecting…"
2. **`!session.has_data`** → drop-zone `<UploadPanel>`
3. **dataset loaded** → notebook with DndContext

### useEffect 1: root cell initialisation

After upload, `useHistory()` returns the state tree. Find the root
(`parent_id === null`) and turn it into a `TableCellData` with
`opChain: []` (the root doesn't come from an op). Saved in
`notebook.cells[0]`.

### useEffect 2: clear on reset

If the session loses `has_data` (user clicks "Load different file" →
backend resets) and there are cells in localStorage, clear them.

### useEffect 3: detect server restart

If `notebook.cells[0].stateId` no longer matches the backend root
(happens after backend restart with new UUIDs), clear. Without this,
the frontend would send requests with stateIds that don't exist
anymore → 404.

### DnD context

`@dnd-kit/core` is the provider. Listens to `onDragStart`/`onDragEnd`.
When a column chip is dragged onto a drop slot:

```tsx
const onDragEnd = (e: DragEndEvent) => {
  const dragged = e.active.data.current;       // {kind: "column", column, type}
  const target = e.over?.data.current;          // {kind: "vp-slot", cellId, slotName, accepts}

  if (target.cellId !== vizCellId) return;      // only the active viz panel's slot
  if (target.accepts !== "any" && dragged.type !== target.accepts) {
    setError(`Type mismatch: ${dragged.column} is ${dragged.type}, slot wants ${target.accepts}.`);
    return;
  }
  setSlot(target.slotName, dragged.column, dragged.type);
};
```

`<DragOverlay>` shows a preview of the chip while you drag, with
portal-style classes that respect the original chip's styles.

---

## 3.3 `api/` — HTTP client + hooks + types

### `api/client.ts`

```ts
export const http = axios.create({
  baseURL: "/api",
  withCredentials: true,    // SENDS the vn_session cookie
  timeout: 30_000,
});

http.interceptors.response.use((r) => r, (err) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") err.message = detail;
  return Promise.reject(err);
});
```

The interceptor translates HTTP errors into readable messages: the
backend returns `{detail: "..."}` for every 4xx/5xx, and we replace
axios's generic message with that text. So `error.message` in the
toast is always the real Python message.

### Imperative helpers

```ts
export async function branchOp(stateId, opId, params): Promise<ExecuteResponse> {
  return (await http.post("/branch", {state_id: stateId, op_id: opId, params})).data;
}
export async function executeFromState(opId, params, fromStateId): Promise<ExecuteResponse> {
  return (await http.post("/execute", {op_id: opId, params, from_state_id: fromStateId})).data;
}
```

Used by the **notebook store** during cascade — when you have to make 5
API calls in sequence, TanStack Query's `useMutation` is awkward (it
mixes state and retry management); cleaner to call axios directly.

### `api/hooks.ts`

All `useXxx()` hooks for each endpoint, built on TanStack Query.

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
  return useQuery({..., staleTime: 60_000});  // distinct values rarely change
}

// Mutations
export function useUpload()       { ... onSuccess: invalidate session+history }
export function useExecuteFrom()  { ... mutation per /execute }
export function useBranchFrom()   { ... mutation per /branch }
export function useReset()        { ... onSuccess: invalidateQueries() (everything) }
```

**Three important details**:
1. **Query key strategy**: includes `stateId` because the *same*
   `useSchema` called by different cells must have distinct caches
   (each cell has its own state).
2. **`staleTime: Infinity` for `useOperations`**: the operation
   catalog is static at runtime, no need to ever refetch it.
3. **`placeholderData: (prev) => prev` on `usePreview`**: during page
   change the table doesn't flicker, it shows the old page with
   reduced opacity until the new one arrives.

### `api/types.ts`

Mirror of the backend Pydantic models in TypeScript. Key type for the
notebook:

```ts
export interface OpStep {
  op_id: string;
  params: Record<string, unknown>;
}

export interface CellMeta {
  fromChartId?: string;   // tag for cascade-replace (see 04-cascade.md)
}

export interface TableCellData {
  id: string;
  type: "table";
  stateId: string;          // → server-side State.id
  description: string;
  rowCount: number;
  lineage: string[];        // descriptions of every step up to here
  opChain: OpStep[];        // ops that produced this cell from its parent
  meta?: CellMeta;
}

export interface ChartCellData {
  id: string;
  type: "chart";
  opId: string;             // viz_histogram, viz_map, ...
  opParams: Record<string, unknown>;
  spec: Record<string, unknown>;   // ECharts option dict | MapPayload
  sourceStateId: string;    // → table this chart was rendered from
  lineage: string[];
}

export type CellData = TableCellData | ChartCellData;
```

---

## 3.4 `store/` — Zustand stores

Two distinct stores, **not** sharing state.

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

The core. See [04-cascade.md](./04-cascade.md) for the deep dive.

Summary:
1. Take `parent = cells[parentIndex]` (can be table OR chart cell —
   we read `stateId` if table, `sourceStateId` if chart).
2. Apply `ops` chained on `parent.stateId` with `branchOp` →
   final state, `count`, `description`.
3. Create a `TableCellData` with `opChain: ops, meta: options?.meta`.
4. **Cascade**: for every cell in `cells[parentIndex+1..]` re-apply
   its `opChain` (table) or re-execute the viz (chart) on the new
   state.
5. If a rebase fails → halt cascade, write `cascadeError`, drop
   everything from there down.
6. Set `isCascading: false` at the end (success or fail).

#### `applyChainAfterChart(chartIndex, chartId, ops)`

Special version for filters produced by interactive clicks on a chart.
Difference: before cascading, it checks if the cell *immediately
following* the chart is also a "chart-derived filter" from the same
chart (`meta.fromChartId === chartId`). If so, **removes** it before
applying the new one → subsequent clicks on the same chart replace
the selection instead of stacking contradictory filters.

Then delegates to `applyChainAndCascade` with `meta: {fromChartId:
chartId}` so the new cell is tagged.

#### `appendChartCell(parentIndex, opId, params)`

Charts are *leaves*: they don't advance state. So this action
**inserts** a `ChartCellData` after `parentIndex` without truncating
the rest of the notebook (nothing to rebase).

#### Persistence

```ts
{
  name: "va-notebook",
  version: 3,
  migrate: (_persisted, _version) => ({ cells: [] }),
  partialize: (s) => ({ cells: s.cells }),     // don't persist isCascading/error
}
```

`partialize` excludes transient flags. `version` bumped when the cell
schema changes: `migrate` discards old state and starts fresh.

#### Dev hint

```ts
if (import.meta.env.DEV) {
  (window as any).__notebookStore = useNotebookStore;
}
```

In dev console: `__notebookStore.getState().cells` to inspect.

### `store/ui.ts`

```ts
interface UIState {
  dialogOp: OperationDef | null;
  openDialog/closeDialog

  errorMessage: string | null;
  setError

  vizCellId: string | null;     // id of the cell with the viz panel open
  chartTypeId: string;
  slots: { [slotName]: {column, type} }
  extras: { [name]: number | string }
  openVizPanel/closeVizPanel
  setChartTypeId  // also resets slots+extras
  setSlot/clearSlot/setExtra/setExtras
}
```

Pure UI state: what's open, what's selected, last error. Not persisted
(transient by definition).

`vizCellId` is a *global key*: only one viz panel can be open at a
time. If you open the viz panel on cell B while it was open on A, A
closes automatically. Coordinated in `TableCellView.tsx` by calling
`openVizPanel(cell.id)` / `closeVizPanel()`.

---

## 3.5 `lib/` — pure helpers

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

Mirror of the backend but simpler (the backend supports more params
like agg/value for heatmap). The chart-builder picks from here which
pills to show and which slots to render.

---

## 3.6 `components/` — UI

13 components. Let's go through them by role.

### Layout & navigation

#### `Header.tsx`
Top bar: indigo cube + "Visual Notebook" + dataset meta (filename + row
count) + two buttons "Export CSV" and "Load different file" when a
dataset is loaded. Uses `useSession()` and `useReset()`.

#### `UploadPanel.tsx`
Drop zone + click-to-browse. Uses `useUpload()` and manages local
drag state (`isDragging`). Standalone in the viewport when
`!has_data`.

#### `ErrorToast.tsx`
Red banner at the top. Shows `errorMessage` from UIStore. Auto-dismiss
after 8 seconds via `setTimeout`. × button to close immediately.

#### `NotebookPage.tsx`
Maps over `notebook.cells` and renders `TableCellView` or
`ChartCellView` for each. Auto-scrolls to bottom when a new cell is
appended (detects `cells.length > prevLength`).

### Notebook cells

#### `TableCellView.tsx`
Table cell card. Contains:
- **Header**: "Dataset"/"Tabella" badge, description, indigo lineage
  chips, row count, ↓ CSV link, × for `truncateFrom(index)` (excluded
  for the root)
- **TablePreview** inline (height-limited, paginated)
- **Toolbar**: two buttons "+ Manipolazione" and "+ Visualizzazione"
- **Inline panel**: when one of the two buttons is active, opens an
  indigo box below with `<ManipulationPanel>` or `<VisualizationPanel>`

`useState<PanelMode>` locally to track which of the two is open.
Coordinated with the global `vizCellId` of the UI store so you don't
have two viz panels open on two different cells.

#### `ChartCellView.tsx`
Chart cell card. Conditional render:
```tsx
{cell.opId === "viz_map"
  ? <MapCanvas payload={cell.spec as MapPayload} />
  : <ReactECharts option={spec} notMerge ... onEvents={onEvents}/>
}
```

Plus **interactive charts**: handlers for click on bin (histogram), bar
(bar_topn), brush (scatter), datazoom (timeline), cell click
(heatmap). Each handler builds a chain of filter ops and calls
`applyChainAfterChart(cellIndex, cell.id, ops)`. See
[04-cascade.md → chart-driven filters](./04-cascade.md#chart-driven-filters).

#### `TablePreview.tsx`
Custom HTML table (no DataTable from any library) with:
- Sticky header with type-badge for every column
- Alternating rows, indigo hover
- Right-aligned numbers, italic muted nulls, tinted booleans
- `« ‹ X-Y of Z › »` pagination top right
- Auto-reset offset when `currentId` changes (apply op upstream)

Has a `stateId` parameter — different from the cell it sits in — to
fetch the right `usePreview()`.

### Forms and widgets

#### `ManipulationPanel.tsx`
Form for data ops. Opens with a 2×N grid of icon+label buttons for
each data op; click on one → swap to `OpForm` with `Field` for each
ParamSpec.

`Field` discriminates on `spec.kind`:
| kind | Widget |
|---|---|
| `column` / `column_*` | `<select>` filtered by type |
| `column_numeric_optional` | `<select>` with "(none)" option |
| `value_from_column` | `<select>` populated from distinct values of the column param |
| `multi_values_from_column` | `<select multiple>` from distinct values |
| `columns_multi` | `<select multiple>` of column names |
| `enum` | `<select>` from `spec.options` |
| `int` / `number` | `<input type="number">` |
| `text` (default) | `<input type="text">` |

Auto-fill: for `filter_range`, when the user picks the column,
`useColumnStats` loads min/max and writes them in the min/max fields.

On Apply calls `applyChainAndCascade(cellIndex, [{op_id, params}])`.

#### `VisualizationPanel.tsx`
Chart-builder with:
- **Pills** for picking chart type (Histogram, Scatter, etc.)
- **Inline palette on the left**: draggable column chips (also
  clickable for assignment to the first compatible empty slot)
- **Slot drop targets** (one drop for each `ChartSlot` of the
  selected chart)
- **Inline extras** (bins, n)
- **Generate button** that calls `appendChartCell(cellIndex, ...)`

The drops are droppable from chips of the same cell (`useDroppable`
with `cellId` in `data`). `App.tsx` filters drops on `target.cellId
=== vizCellId` so you can't accidentally drop on another cell's viz
panel.

### Specialised outputs

#### `MapCanvas.tsx`
Leaflet wrapper (via `react-leaflet`):
- `<MapContainer>` with CartoDB light tile
- `<CircleMarker>` for every `point` from the payload
- `<Recenter>` component that calls `map.setView(center, ...)` when
  the center changes (necessary because `MapContainer` caches the
  initial view and doesn't auto-fly)

#### `SchemaView.tsx`
Visual rendering of the `{kind: "schema", columns: [...]}` payload.
Responsive card grid with type-coloured left border, indigo dtype
badge, null/range chips. (Currently not triggered by any UI — the
view_schema can be invoked via API but there's no button in
TableCellView yet. Roadmap.)

---

## 3.7 Styling: Tailwind + semantic classes

### Custom palette in `tailwind.config.js`

```js
colors: {
  bg: "#fafafa",       panel: "#ffffff",     panel2: "#f9fafb",   panel3: "#f3f4f6",
  border: "#e5e7eb",   border2: "#d1d5db",
  text: "#0f172a",     textd: "#334155",     textdim: "#64748b",  textmute: "#94a3b8",
  accent: "#4f46e5",   accentl: "#6366f1",   accent50: "#eef2ff",
  success: "#10b981",  warn: "#f59e0b",      danger: "#ef4444",   pink: "#ec4899",
}
```

Semantic use:
- `bg-panel` — surfaces (cards)
- `bg-panel2` — surface 2 (alternate row, header)
- `bg-panel3` — hover/active
- `text-text` / `text-textd` / `text-textdim` / `text-textmute` —
  4-level text contrast scale
- `bg-accent` for primary, `bg-accent50` for soft backgrounds (accent
  hover), `text-accent` for foreground accents

### Component conventions

- Card: `bg-panel border border-border rounded-lg shadow-card`
- Primary button: `bg-accent text-white border-accent hover:bg-indigo-700`
- Secondary button: `bg-panel border-border hover:bg-panel2 hover:border-border2 text-text`
- Type badges (numeric/categorical/...) use Tailwind built-ins:
  `bg-indigo-50 text-indigo-700`, `bg-emerald-50 text-emerald-700`,
  `bg-amber-50 text-amber-700`, `bg-pink-50 text-pink-700`
- Frequently used small font sizes: `text-[11px]` for caption,
  `text-[12px]` form labels, `text-[13px]` body, `text-[14px]` h-tags.

### Leaflet override (in `styles/index.css`)

`.leaflet-control-attribution`, `.leaflet-bar a`, etc. classes are
overridden to match the light minimalist theme. Without overrides
they'd have default light-grey backgrounds that clash with the white
panel.
