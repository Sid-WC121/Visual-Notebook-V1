# 04 — Cascade Rebase

> 🇬🇧 English · [🇮🇹 Italiano](../04-cascade.md)

> The **distinctive mechanism** of the project. When you apply an op
> upstream of existing cells, all downstream cells get re-applied on
> the new state — not truncated. Charts included.

## Index
- [4.1 The problem solved](#41-the-problem-solved)
- [4.2 Conceptual model](#42-conceptual-model)
- [4.3 Client-side implementation (notebook store)](#43-client-side-implementation-notebook-store)
- [4.4 Three notebook store actions](#44-three-notebook-store-actions)
- [4.5 Chart-driven filters: replace semantics](#45-chart-driven-filters-replace-semantics)
- [4.6 Edge cases and error handling](#46-edge-cases-and-error-handling)
- [4.7 Annotated end-to-end example](#47-annotated-end-to-end-example)

---

## 4.1 The problem solved

Naive notebook (before cascade):

```
Cell 0: Root                    300 rows
Cell 1: filter sales > 100      150 rows
Cell 2: filter ship_mode=A       30 rows
Cell 3: histogram of sales       (chart on Cell 2)
```

Now I apply a new op on **Cell 0** (e.g. `sort_by date`). What happens?

**Naive version**: Cell 1, 2, 3 get *truncated*. I lose 3 steps of
work. I have to redo everything.

**Cascade version** (what we have):
1. Cell 0 stays (it's the root, doesn't get modified).
2. A new Cell 1 = Cell 0 + sort_by date is **inserted** (300 rows,
   sorted).
3. The old Cell 1 (`filter sales > 100`) gets **rebased**: re-applies
   `filter sales > 100` on the new Cell 1, becomes Cell 2 with 150
   rows (probably ordered differently).
4. The old Cell 2 (`filter ship_mode=A`) gets rebased on Cell 2,
   becomes Cell 3 with 30 rows.
5. The old Cell 3 (histogram) gets **re-rendered** with the new Cell
   3 as `sourceStateId`.

All exploration work preserved. It's a **Git rebase applied to data**.

---

## 4.2 Conceptual model

### Each cell remembers the op that produced it

```ts
TableCellData {
  stateId: "abc123",
  description: "sales > 100",
  opChain: [
    { op_id: "filter_range", params: { column: "sales", min: 100, max: 1e9 } }
  ],
}
```

`opChain` is an **array** because some ops are "compound" and must be
atomic from the user's POV:

```ts
// Cell produced by scatter brush (rect on area)
opChain: [
  { op_id: "filter_range", params: { column: "x", min: ..., max: ... } },
  { op_id: "filter_range", params: { column: "y", min: ..., max: ... } },
]
```

For most ops the array has a single element.

### Charts don't have opChain

```ts
ChartCellData {
  opId: "viz_histogram",
  opParams: { column: "sales", bins: 30 },
  sourceStateId: "abc123",
  spec: { ...ECharts option dict... },
}
```

Charts are **leaves**: they don't advance the data state, they're
lenses. To re-render them you don't need a chain — just `op_id` and
`opParams`.

### The cascade is a "replay"

Given these two primitives:

```python
branch(state_id, op_id, params) -> {state_id', count, description}
execute(op_id, params, from_state_id) -> {spec}
```

And a notebook:

```
[Root, A(opChain_A), B(opChain_B), Chart_C(opId_C, opParams_C), D(opChain_D)]
```

When I insert a new op X after Root:

```
[Root, X, A', B', Chart_C', D']

where:
  X.stateId   = branch(Root.stateId, X)
  A'.stateId  = branch(X.stateId, opChain_A[0]) [then opChain_A[1]...]
  B'.stateId  = branch(A'.stateId, opChain_B[0]) [...]
  Chart_C'.spec = execute(opId_C, opParams_C, from_state_id=B'.stateId)
  D'.stateId  = branch(B'.stateId, opChain_D[0]) [...]
```

**Important**: charts DO NOT advance state. D' gets rebased on B' (the
table before the chart), not on the chart. Chart_C' uses
`sourceStateId = B'.stateId`.

---

## 4.3 Client-side implementation (notebook store)

The code is in `frontend/src/store/notebook.ts`. Summary of the
`applyChainAndCascade` function:

```ts
applyChainAndCascade: async (parentIndex, ops, options?) => {
  const cells = get().cells;
  const parent = cells[parentIndex];
  if (!parent) return;

  // Charts have sourceStateId, tables have stateId. Abstract.
  const parentStateId = parent.type === "table" ? parent.stateId : parent.sourceStateId;
  const parentLineage = parent.lineage;

  set({ isCascading: true, cascadeError: null });

  try {
    // 1. Apply chain `ops` on top of parent → final state
    let curState = parentStateId;
    let lastDesc = "";
    let lastCount = 0;
    for (const step of ops) {
      const r = await branchOp(curState, step.op_id, step.params);
      if (r.kind !== "data" || !r.state_id) throw new Error("...");
      curState = r.state_id;
      lastDesc = r.description ?? lastDesc;
      lastCount = r.count ?? lastCount;
    }

    const inserted: TableCellData = {
      id: crypto.randomUUID(),
      type: "table",
      stateId: curState,
      description: lastDesc || ops[ops.length-1].op_id,
      rowCount: lastCount,
      lineage: [...parentLineage, lastDesc],
      opChain: ops,
      meta: options?.meta,
    };

    // 2. Rebase every downstream cell
    const newCells: CellData[] = [
      ...cells.slice(0, parentIndex + 1),
      inserted,
    ];

    let prevTableStateId = inserted.stateId;
    let prevTableLineage = inserted.lineage;

    for (let i = parentIndex + 1; i < cells.length; i++) {
      const old = cells[i];

      if (old.type === "table") {
        if (!old.opChain || old.opChain.length === 0) break;  // legacy
        let stateId = prevTableStateId;
        let desc = "";
        let count = 0;
        for (const step of old.opChain) {
          const r = await branchOp(stateId, step.op_id, step.params);
          if (r.kind !== "data" || !r.state_id) throw new Error(`Could not rebase '${step.op_id}'.`);
          stateId = r.state_id;
          desc = r.description ?? desc;
          count = r.count ?? count;
        }
        const updated: TableCellData = {
          ...old,
          stateId,
          description: desc || old.description,
          rowCount: count,
          lineage: [...prevTableLineage, desc || old.description],
        };
        newCells.push(updated);
        prevTableStateId = updated.stateId;
        prevTableLineage = updated.lineage;
      } else {
        // chart
        if (!old.opId || !old.opParams) break;
        const r = await executeFromState(old.opId, old.opParams, prevTableStateId);
        if (r.kind !== "viz" || !r.spec) throw new Error(`Could not re-render chart '${old.opId}'.`);
        const ownStep = old.lineage[old.lineage.length - 1] ?? "";
        const updated: ChartCellData = {
          ...old,
          spec: r.spec,
          sourceStateId: prevTableStateId,
          lineage: [...prevTableLineage, ownStep],
        };
        newCells.push(updated);
        // prevTableStateId DOES NOT change: charts don't advance state
      }
    }

    set({ cells: newCells, isCascading: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    set({ isCascading: false, cascadeError: msg });
  }
},
```

### Key pattern: `prevTableStateId`

The most important variable in the cascade is `prevTableStateId`. It
updates **only** when we process a `table` cell. For `chart`s it stays
the same (the chart renders on top of it but doesn't modify it).

This guarantees that every table cell **branches from the previous
table** (not from the chart that might be in between).

### Key pattern: immutable lineage

Every cell rebuilds `lineage = [...prevTableLineage, myDescription]`.
The lineage isn't a computed property at render — it's **stored** and
gets updated on every rebase. So the indigo chips in the UI (visible
in every cell's header) always tell the current chain.

---

## 4.4 Three notebook store actions

| Action | When used | Effect |
|---|---|---|
| `applyChainAndCascade(parentIndex, ops, opts?)` | Manual manipulation via ManipulationPanel; non-interactive chart filter | Insert + cascade |
| `applyChainAfterChart(chartIndex, chartId, ops)` | Click on bin/bar/cell of a chart | **Replace** the previous cell from the same chart, then cascade |
| `appendChartCell(parentIndex, opId, params)` | Generate from VisualizationPanel | Insert a chart leaf, NO cascade (just shift) |

### `appendChartCell` doesn't cascade

```ts
appendChartCell: async (parentIndex, opId, params) => {
  const cells = get().cells;
  const parent = cells[parentIndex];
  if (!parent || parent.type !== "table") return;

  set({ isCascading: true });
  try {
    const r = await executeFromState(opId, params, parent.stateId);
    const cell: ChartCellData = { ..., sourceStateId: parent.stateId };

    set((s) => ({
      cells: [
        ...s.cells.slice(0, parentIndex + 1),
        cell,
        ...s.cells.slice(parentIndex + 1),    // INSERT, not truncate
      ],
      isCascading: false,
    }));
  } catch (e) { ... }
},
```

**Why no cascade**: a chart is a leaf. The cells downstream of the
parent DO NOT depend on the chart, they depend on the parent itself.
If I insert a chart between parent and an existing cell, the existing
cell continues to branch from the parent (not from the chart) → nothing
to rebase.

---

## 4.5 Chart-driven filters: replace semantics

When the user clicks an istogram bin, ChartCellView calls:

```ts
applyChainAfterChart(cellIndex, cell.id, [{op_id: "filter_range", params: {...}}]);
```

What does `applyChainAfterChart` do differently from
`applyChainAndCascade`?

```ts
applyChainAfterChart: async (chartIndex, chartId, ops) => {
  const cells = get().cells;
  const next = cells[chartIndex + 1];

  // If the cell right after this chart is ALSO a chart-derived filter
  // from the SAME chart, drop it before cascading. The user wants to
  // "swap" the selection, not accumulate filters.
  if (next && next.type === "table" && next.meta?.fromChartId === chartId) {
    set({
      cells: [
        ...cells.slice(0, chartIndex + 1),
        ...cells.slice(chartIndex + 2),    // skip "next"
      ],
    });
  }

  // Now cascade normally, marking the new cell as
  // "came from this chart"
  await get().applyChainAndCascade(chartIndex, ops, {
    meta: { fromChartId: chartId },
  });
},
```

### Example

```
Cell 0: Root
Cell 1: Histogram of price                       (chart, id=H1)
Cell 2: filter price ∈ [56, 78]    meta.fromChartId=H1
Cell 3: filter_not_null discount_pct  (manual, no meta)
```

User clicks another bin on the histogram → `[10, 33]`.

`applyChainAfterChart(1, "H1", [filter_range [10,33]])`:
1. `next = cells[2]` has `meta.fromChartId === "H1"` → **removes**
   cells[2] from the array.
2. Notebook becomes `[Root, Histogram, filter_not_null]` (cell_3
   shifted to index 2).
3. `applyChainAndCascade(1, [filter_range [10,33]], {meta:{fromChartId:"H1"}})` →
   inserts new filter [10,33] after the histogram with the marker.
4. Cascade: shifted cell (filter_not_null) gets rebased on top of the
   new filter [10,33].

**Result**:
```
Cell 0: Root
Cell 1: Histogram                                (unchanged)
Cell 2: filter price ∈ [10, 33]    meta.fromChartId=H1   (replaced)
Cell 3: filter_not_null discount_pct (rebased on Cell 2)
```

Cell 3 is still valid — filter_not_null works regardless of price
range. **No `0 rows`.**

### Without this logic…

Plain `applyChainAndCascade` would produce:
```
Cell 0: Root
Cell 1: Histogram
Cell 2: filter price ∈ [10, 33]   (new, inserted)
Cell 3: filter price ∈ [56, 78]   (rebased on Cell 2)  ← ZERO ROWS!
Cell 4: filter_not_null            (rebased on Cell 3)  ← ZERO ROWS!
```

The two selections are mutually exclusive ([10,33] ∩ [56,78] = ∅) →
catastrophic zero. That was the original bug.

### Only "interactive" filters are replaceable

If the user does the same `price ∈ [10,33]` filter manually via
ManipulationPanel, it does NOT have `meta.fromChartId`, so
`applyChainAfterChart` would leave it alone (it only looks for cells
with that marker).

Manual filters are treated as "intentional steps" the user has
explicitly added — they shouldn't be silently deleted.

---

## 4.6 Edge cases and error handling

### Op rebase fails mid-cascade

Example: the new upstream op is `drop_column sales`. A downstream
cell has `opChain: [{filter_range, params:{column:"sales", min:100, max:5000}}]`.
When we try to re-apply the filter on the column that no longer
exists → backend returns 400 "unable to find column 'sales'".

The code catches in the outer `try/catch`, writes `cascadeError`, and
**stops** the cascade after saving the cells already rebased
successfully.

```
[Root, X(new), A'(rebased ok), B'(rebased ok), <FAILED from here on>]
```

The cells from the failure onwards get **dropped**. The user sees:
- new notebook with the correctly rebased cells
- red `cascadeError` displayed in the manipulation/visualization
  panels
- toast with the backend message

The user can remove the problematic cell and start over, or modify
the upstream op.

### Empty `opChain` (legacy)

If for some reason a cell has `opChain: []` (e.g. state persisted
from a version that didn't have opChain yet), the loop `break`s and
doesn't rebase anything downstream. Cells after it get lost.

In practice: with `version: 3` of the persist and `migrate` clearing
everything, this situation should never happen. But the safety net
is there.

### Chart with missing `opParams`

If a `ChartCellData` doesn't have `opParams` (legacy),
`executeFromState` has nothing to pass. We skip it:
```ts
if (!old.opId || !old.opParams) break;
```

Same outcome as the previous case: cascade halted, downstream cells
lost.

### `isCascading` as UI signal

```ts
set({ isCascading: true });
// ... await sequence of branch/execute ...
set({ isCascading: false });
```

Components that show "Apply" / "Generate" buttons read this flag and
show "Applying cascade…" / "Generating…" + disabled state.

During cascade other user actions are UI-disabled (buttons are
`disabled={isCascading}`). In a more sophisticated app you could
allow cancellation (`AbortController` on axios) but for now cascade
is fast (≤ 200ms on modest datasets).

---

## 4.7 Annotated end-to-end example

Initial setup:
- Load `orders.csv` (5009 rows)
- Filter `sales > 100` → 2876 rows
- Generate histogram of `sales` → chart cell
- Filter `ship_mode = "Standard Class"` below the chart → 2018 rows

Notebook:
```
[0] Root          5009 rows  opChain=[]
[1] sales > 100   2876 rows  opChain=[{filter_range, sales [100, 1e9]}]
[2] hist(sales)              opId=viz_histogram, sourceStateId=cells[1]
[3] ship_mode=Std 2018 rows  opChain=[{filter_equals, ship_mode "Standard Class"}]
                             (parent table = cells[1], not cells[2] because chart is leaf)
```

User: I click a bin on the chart `[200, 250]` → triggers
`applyChainAfterChart(2, H1, [filter_range sales [200,250]])`.

Step 1 — cleanup: `next = cells[3]`. Its `meta?.fromChartId` is
**undefined** (it's a manual filter, not from the chart). So we DO NOT
remove it.

Step 2 — applyChainAndCascade(2, [filter_range [200,250]], {meta:{fromChartId:"H1"}}):
- `parent = cells[2]` (chart). `parentStateId = chart.sourceStateId = cells[1].stateId`.
- `branch(cells[1].stateId, "filter_range", {sales [200,250]})` →
  new state `Y` with count=410.
- Inserted cell: `{stateId: Y, opChain: [filter_range [200,250]], meta: {fromChartId:"H1"}}`
  inserted at index 3.

Step 3 — cascade. Old cell at index 3 was `ship_mode=Std`.
- `branch(Y, "filter_equals", {ship_mode "Standard Class"})` → state
  `Z` with count=287.
- Updated cell: `{stateId: Z, opChain: same, lineage: [...new]}`.

Final notebook:
```
[0] Root          5009 rows
[1] sales > 100   2876 rows
[2] hist(sales)              (chart unchanged)
[3] sales [200,250]  410 rows  meta.fromChartId=H1   (NEW)
[4] ship_mode=Std    287 rows                      (rebased)
```

The user sees instantly: the chart unchanged (it's the same lens),
a new filter cell representing his selection, and the ship_mode cell
updated with the new count.

If now I click another bin `[500, 600]`:
- `next = cells[3]` has `meta.fromChartId === H1` → **removed**.
- Notebook temporarily: `[Root, ..., hist, ship_mode=Std]`.
- Cascade with the new filter inserts at index 3, rebases ship_mode →
  index 4.

Stable notebook:
```
[0] Root
[1] sales > 100
[2] hist(sales)
[3] sales [500,600]   meta.fromChartId=H1   (replaced)
[4] ship_mode=Std    (rebased over the new filter)
```

Subsequent clicks on the histogram always replace cells[3], never
accumulate. The "manual" cells (cells[4]) follow as if by magic.
