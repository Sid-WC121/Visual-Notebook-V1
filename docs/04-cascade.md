# 04 — Cascade Rebase

> 🇮🇹 Italiano · [🇬🇧 English](./en/04-cascade.md)

> Il **meccanismo distintivo** del progetto. Quando applichi un'op a
> monte di celle esistenti, tutte le celle a valle vengono ri-applicate
> sul nuovo stato — non troncate. Charts incluso.

## Indice
- [4.1 Il problema risolto](#41-il-problema-risolto)
- [4.2 Modello concettuale](#42-modello-concettuale)
- [4.3 Implementazione lato client (notebook store)](#43-implementazione-lato-client-notebook-store)
- [4.4 Tre azioni del notebook store](#44-tre-azioni-del-notebook-store)
- [4.5 Chart-driven filters: replace semantics](#45-chart-driven-filters-replace-semantics)
- [4.6 Casi limite e gestione errori](#46-casi-limite-e-gestione-errori)
- [4.7 Esempio end-to-end commentato](#47-esempio-end-to-end-commentato)

---

## 4.1 Il problema risolto

Versione naive del notebook (prima della cascade):

```
Cell 0: Root                    300 rows
Cell 1: filter sales > 100      150 rows
Cell 2: filter ship_mode=A       30 rows
Cell 3: histogram of sales       (chart su Cell 2)
```

Adesso applico una nuova op sulla **Cell 0** (es. `sort_by date`).
Cosa succede?

**Versione naive**: Cell 1, 2, 3 vengono *troncate*. Perdo 3 step di
lavoro. Devo rifare tutto.

**Versione cascade** (quella che abbiamo):
1. Cell 0 resta (è la root, non si modifica).
2. Si **inserisce** una nuova Cell 1 = Cell 0 + sort_by date (300 righe,
   ordinate).
3. La vecchia Cell 1 (`filter sales > 100`) viene **rebase**: re-applica
   `filter sales > 100` sulla nuova Cell 1, diventa Cell 2 con 150 righe
   (probabilmente ordinate diversamente).
4. La vecchia Cell 2 (`filter ship_mode=A`) viene rebase su Cell 2,
   diventa Cell 3 con 30 righe.
5. La vecchia Cell 3 (histogram) viene **re-renderizzata** con la nuova
   Cell 3 come `sourceStateId`.

Tutto il lavoro di esplorazione preservato. È una **rebase Git
applicata ai dati**.

---

## 4.2 Modello concettuale

### Ogni cella ricorda l'op che l'ha prodotta

```ts
TableCellData {
  stateId: "abc123",
  description: "sales > 100",
  opChain: [
    { op_id: "filter_range", params: { column: "sales", min: 100, max: 1e9 } }
  ],
}
```

`opChain` è un **array** perché alcune ops sono "compound" e devono
essere atomiche dal punto di vista dell'utente:

```ts
// Cella prodotta dal brush su scatter (rect su area)
opChain: [
  { op_id: "filter_range", params: { column: "x", min: ..., max: ... } },
  { op_id: "filter_range", params: { column: "y", min: ..., max: ... } },
]
```

Per la maggior parte delle ops l'array ha un solo elemento.

### Charts non hanno opChain

```ts
ChartCellData {
  opId: "viz_histogram",
  opParams: { column: "sales", bins: 30 },
  sourceStateId: "abc123",
  spec: { ...ECharts option dict... },
}
```

I chart sono **leaf**: non avanzano lo stato dati, sono lenti. Per
re-renderizzarli non serve un chain — basta `op_id` e `opParams`.

### La cascade è "replay"

Date queste due primitive:

```python
branch(state_id, op_id, params) -> {state_id', count, description}
execute(op_id, params, from_state_id) -> {spec}
```

E un notebook:

```
[Root, A(opChain_A), B(opChain_B), Chart_C(opId_C, opParams_C), D(opChain_D)]
```

Quando inserisco una nuova op X dopo Root:

```
[Root, X, A', B', Chart_C', D']

dove:
  X.stateId   = branch(Root.stateId, X)
  A'.stateId  = branch(X.stateId, opChain_A[0]) [poi opChain_A[1]...]
  B'.stateId  = branch(A'.stateId, opChain_B[0]) [...]
  Chart_C'.spec = execute(opId_C, opParams_C, from_state_id=B'.stateId)
  D'.stateId  = branch(B'.stateId, opChain_D[0]) [...]
```

**Importante**: i chart NON avanzano lo stato. La D' viene rebasata su
B' (la tabella prima del chart), non sul chart. Chart_C' usa
`sourceStateId = B'.stateId`.

---

## 4.3 Implementazione lato client (notebook store)

Il codice è in `frontend/src/store/notebook.ts`. Riassunto della
funzione `applyChainAndCascade`:

```ts
applyChainAndCascade: async (parentIndex, ops, options?) => {
  const cells = get().cells;
  const parent = cells[parentIndex];
  if (!parent) return;

  // Charts hanno sourceStateId, tables hanno stateId. Astrai.
  const parentStateId = parent.type === "table" ? parent.stateId : parent.sourceStateId;
  const parentLineage = parent.lineage;

  set({ isCascading: true, cascadeError: null });

  try {
    // 1. Applica la chain `ops` sopra il genitore → stato finale
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

    // 2. Rebase ogni cella a valle
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
        // prevTableStateId NON cambia: i chart non avanzano lo stato
      }
    }

    set({ cells: newCells, isCascading: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    set({ isCascading: false, cascadeError: msg });
  }
},
```

### Pattern fondamentale: `prevTableStateId`

La variabile più importante della cascade è `prevTableStateId`. Si
aggiorna **solo** quando si processa una `table` cell. Per i `chart`
resta lo stesso (il chart si renderizza sopra di esso ma non lo modifica).

Questo garantisce che ogni cella tabella **branch dalla tabella
precedente** (non dal chart che potrebbe essere in mezzo).

### Pattern fondamentale: lineage immutabile

Ogni cella ricostruisce `lineage = [...prevTableLineage, miaDescrizione]`.
La lineage non è una proprietà calcolata in render — è **memorizzata**
e viene aggiornata ad ogni rebase. Così i chip indigo della UI
(visibili nel header di ogni cella) raccontano sempre la chain corrente.

---

## 4.4 Tre azioni del notebook store

| Action | Quando si usa | Effetto |
|---|---|---|
| `applyChainAndCascade(parentIndex, ops, opts?)` | Manipolazione manuale via ManipulationPanel; chart filter "non interactive" | Inserisce + cascade |
| `applyChainAfterChart(chartIndex, chartId, ops)` | Click su bin/bar/cell di un chart | **Replace** la cella precedente dello stesso chart, poi cascade |
| `appendChartCell(parentIndex, opId, params)` | Generate dal VisualizationPanel | Inserisce un chart leaf, NO cascade (solo shift) |

### `appendChartCell` non fa cascade

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
        ...s.cells.slice(parentIndex + 1),    // INSERT, non truncate
      ],
      isCascading: false,
    }));
  } catch (e) { ... }
},
```

**Perché niente cascade**: un chart è leaf. Le celle a valle del parent
NON dipendono dal chart, dipendono dal parent stesso. Se inserisco un
chart tra parent e una cella esistente, la cella esistente continua a
branch dal parent (non dal chart) → niente da rebasare.

---

## 4.5 Chart-driven filters: replace semantics

Quando l'utente clicca un bin di un istogramma, ChartCellView chiama:

```ts
applyChainAfterChart(cellIndex, cell.id, [{op_id: "filter_range", params: {...}}]);
```

Cosa fa `applyChainAfterChart` di diverso da `applyChainAndCascade`?

```ts
applyChainAfterChart: async (chartIndex, chartId, ops) => {
  const cells = get().cells;
  const next = cells[chartIndex + 1];

  // Se la cella subito dopo questo chart è ANCHE una chart-derived filter
  // dello STESSO chart, eliminala prima di cascadare. L'utente vuole
  // "swappare" la selezione, non accumulare filtri.
  if (next && next.type === "table" && next.meta?.fromChartId === chartId) {
    set({
      cells: [
        ...cells.slice(0, chartIndex + 1),
        ...cells.slice(chartIndex + 2),    // skip "next"
      ],
    });
  }

  // Adesso cascade normalmente, marchiando la nuova cella come
  // "venuta da questo chart"
  await get().applyChainAndCascade(chartIndex, ops, {
    meta: { fromChartId: chartId },
  });
},
```

### Esempio

```
Cell 0: Root
Cell 1: Histogram of price                       (chart, id=H1)
Cell 2: filter price ∈ [56, 78]    meta.fromChartId=H1
Cell 3: filter_not_null discount_pct  (manual, no meta)
```

User clicca un altro bin sull'istogramma → `[10, 33]`.

`applyChainAfterChart(1, "H1", [filter_range [10,33]])`:
1. `next = cells[2]` ha `meta.fromChartId === "H1"` → **rimuove**
   cells[2] dall'array.
2. Notebook diventa `[Root, Histogram, filter_not_null]` (cell_3
   shifted to index 2).
3. `applyChainAndCascade(1, [filter_range [10,33]], {meta:{fromChartId:"H1"}})` →
   inserisce nuova filter [10,33] dopo l'istogramma con il marker.
4. Cascade: cell shifted (filter_not_null) si rebasa sopra la nuova
   filter [10,33].

**Risultato**:
```
Cell 0: Root
Cell 1: Histogram                                (unchanged)
Cell 2: filter price ∈ [10, 33]    meta.fromChartId=H1   (replaced)
Cell 3: filter_not_null discount_pct (rebased on Cell 2)
```

Cell 3 è ancora valida — il filter not null funziona regardless del
range di prezzo. **No `0 rows`.**

### Senza questa logica…

`applyChainAndCascade` plain produrrebbe:
```
Cell 0: Root
Cell 1: Histogram
Cell 2: filter price ∈ [10, 33]   (new, inserted)
Cell 3: filter price ∈ [56, 78]   (rebased on Cell 2)  ← ZERO ROWS!
Cell 4: filter_not_null            (rebased on Cell 3)  ← ZERO ROWS!
```

Le due selezioni sono mutualmente esclusive ([10,33] ∩ [56,78] = ∅) →
catastrofico zero. Era il bug originale.

### Solo le filter "interattive" sono replaceable

Se l'utente fa la stessa filter `price ∈ [10,33]` via ManipulationPanel
manuale, NON ha `meta.fromChartId`, quindi `applyChainAfterChart` la
lascerebbe stare (cercherebbe solo cell con quel marker).

Le filter manuali sono trattate come "step intenzionali" che l'utente
ha esplicitamente messo — non vanno cancellati silenziosamente.

---

## 4.6 Casi limite e gestione errori

### Op rebase fallisce a metà cascade

Esempio: la nuova op a monte è `drop_column sales`. Una cella a valle
ha `opChain: [{filter_range, params:{column:"sales", min:100, max:5000}}]`.
Quando proviamo a re-applicare il filter sulla colonna che non esiste
più → backend ritorna 400 "unable to find column 'sales'".

Il codice cattura nel `try/catch` esterno, scrive `cascadeError`, e
**ferma** la cascade dopo aver salvato le celle già rebasate con successo.

```
[Root, X(new), A'(rebased ok), B'(rebased ok), <FALLITO da qui in poi>]
```

Le celle dalla failed in giù vengono **scartate**. L'utente vede:
- nuovo notebook con le celle rebased correttamente
- rosso `cascadeError` displayed nei panel manipulation/visualization
- toast con messaggio del backend

L'utente può rimuovere la cella problematica e ricominciare, oppure
modificare la op a monte.

### `opChain` vuoto (legacy)

Se per qualche motivo una cella ha `opChain: []` (es. stato persisted
da una versione vecchia che non aveva ancora opChain), il loop fa
`break` e non rebasa nulla a valle. Le celle dopo vengono perdute.

In pratica: con `version: 3` del persist e `migrate` che azzera tutto,
questa situazione non dovrebbe mai capitare. Ma il safety net c'è.

### Chart con `opParams` mancanti

Se una `ChartCellData` non ha `opParams` (legacy), `executeFromState`
non ha cosa passare. Lo skippiamo:
```ts
if (!old.opId || !old.opParams) break;
```

Stesso esito del caso precedente: cascade fermata, celle a valle perse.

### `isCascading` come signal UI

```ts
set({ isCascading: true });
// ... await sequence di branch/execute ...
set({ isCascading: false });
```

I componenti che mostrano bottoni "Apply" / "Generate" leggono questo
flag e mostrano "Applicando in cascata…" / "Generando…" + disabled.

Durante la cascade le altre azioni utente sono UI-disabled (i bottoni
sono `disabled={isCascading}`). In un'app più sofisticata si potrebbe
permettere cancellazione (`AbortController` su axios) ma per ora la
cascade è veloce ($\le$ 200ms su dataset modesti).

---

## 4.7 Esempio end-to-end commentato

Setup iniziale:
- Carico `orders.csv` (5009 righe)
- Faccio filter `sales > 100` → 2876 righe
- Genero histogram di `sales` → chart cell
- Faccio filter `ship_mode = "Standard Class"` sotto il chart → 2018 righe

Notebook:
```
[0] Root          5009 rows  opChain=[]
[1] sales > 100   2876 rows  opChain=[{filter_range, sales [100, 1e9]}]
[2] hist(sales)              opId=viz_histogram, sourceStateId=cells[1]
[3] ship_mode=Std 2018 rows  opChain=[{filter_equals, ship_mode "Standard Class"}]
                             (parent table = cells[1], non cells[2] perché chart è leaf)
```

User: clicco su un bin del chart `[200, 250]` → trigger
`applyChainAfterChart(2, H1, [filter_range sales [200,250]])`.

Step 1 — pulizia: `next = cells[3]`. La sua `meta?.fromChartId` è
**undefined** (è un filter manuale, non da chart). Quindi NON la rimuoviamo.

Step 2 — applyChainAndCascade(2, [filter_range [200,250]], {meta:{fromChartId:"H1"}}):
- `parent = cells[2]` (chart). `parentStateId = chart.sourceStateId = cells[1].stateId`.
- `branch(cells[1].stateId, "filter_range", {sales [200,250]})` →
  nuovo state `Y` con count=410.
- Inserted cell: `{stateId: Y, opChain: [filter_range [200,250]], meta: {fromChartId:"H1"}}`
  inserito a indice 3.

Step 3 — cascade. Cella vecchia a indice 3 era `ship_mode=Std`.
- `branch(Y, "filter_equals", {ship_mode "Standard Class"})` → state `Z`
  con count=287.
- Updated cell: `{stateId: Z, opChain: stesso, lineage: [...new]}`.

Notebook finale:
```
[0] Root          5009 rows
[1] sales > 100   2876 rows
[2] hist(sales)              (chart unchanged)
[3] sales [200,250]  410 rows  meta.fromChartId=H1   (NEW)
[4] ship_mode=Std    287 rows                      (rebased)
```

L'utente vede istantaneamente il chart inalterato (è la stessa lente),
una nuova filter cell che rappresenta la sua selezione, e la cella
ship_mode aggiornata col nuovo count.

Se ora clicco un altro bin `[500, 600]`:
- `next = cells[3]` ha `meta.fromChartId === H1` → **rimossa**.
- Notebook temporaneamente: `[Root, ..., hist, ship_mode=Std]`.
- Cascade con la nuova filter inserisce a indice 3, rebasa ship_mode → indice 4.

Notebook stabile:
```
[0] Root
[1] sales > 100
[2] hist(sales)
[3] sales [500,600]   meta.fromChartId=H1   (replaced)
[4] ship_mode=Std    (rebased over the new filter)
```

Click successivi sull'istogramma rimpiazzano sempre cells[3], mai
accumulano. Le celle "manuali" (cells[4]) seguono come d'incanto.
