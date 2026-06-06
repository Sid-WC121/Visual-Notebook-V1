# 05 — Catalogo Operazioni

> 🇮🇹 Italiano · [🇬🇧 English](./en/05-operations.md)

> Le 21 operazioni esposte dal backend, raggruppate per menu, ognuna con:
> parametri, semantica esatta, esempio di chiamata API, file dove si
> trova l'implementazione.

## Tre tipi di op

| Kind | Effetto | Output ECharts/payload | Esempi |
|---|---|---|---|
| `data` | crea un nuovo `State` (avanza il tree) | — | `sort_by`, `filter_range`, `group_by` |
| `viz`  | renderizza un grafico, non avanza lo stato | dict ECharts (o `MapPayload`) | `viz_histogram`, `viz_map` |
| `view` | ispezione read-only, non avanza lo stato | dict payload custom | `view_schema`, `view_row_count` |

## Convenzione `params` ParamSpec.kind

| `kind` (frontend) | UI widget | Note |
|---|---|---|
| `column` | `<select>` di tutti i nomi | qualsiasi tipo |
| `column_numeric` | `<select>` filtrato | solo numeric |
| `column_categorical` | `<select>` filtrato | categorical + boolean |
| `column_temporal` | `<select>` filtrato | solo temporal |
| `column_numeric_optional` | `<select>` con voce "(none)" | numeric, opzionale |
| `value_from_column` | `<select>` da distinct values | popolato via `useColumnStats` quando il `column` companion cambia |
| `multi_values_from_column` | `<select multiple>` | come sopra ma multi |
| `columns_multi` | `<select multiple>` di nomi colonna | per ops che operano su sottoinsieme di colonne |
| `enum` | `<select>` da `spec.options` | es. `agg`, `order` |
| `int` / `number` | `<input type="number">` | step=1 per `int`, libero per `number` |
| `text` | `<input type="text">` | fallback |

`depends_on` è un nome di un altro param: triggera l'auto-fill (es. min/max
per `filter_range` quando l'utente sceglie la colonna).

---

# Data (4 ops)

## `sort_by`

```python
ParamSpec("column", "column", "Column"),
ParamSpec("order", "enum", "Order", options=["asc", "desc"], default="asc"),
```

```python
def _sort_by(lf, p):
    return lf.sort(p["column"], descending=(p["order"] == "desc"))
```

Sort lazy in-place sulla colonna.

```http
POST /api/branch
{
  "state_id": "abc12345",
  "op_id": "sort_by",
  "params": {"column": "sales", "order": "desc"}
}
→ {kind: "data", state_id: "...", description: "Sort sales desc", count: 5009}
```

## `keep_top_n`

```python
ParamSpec("n", "int", "N", default=100),
```

```python
def _keep_top_n(lf, p):
    n = int(p["n"])
    if n < 1: raise ValueError("N must be at least 1.")
    return lf.head(n)
```

Limita lo stato alle prime `n` righe (dopo il sort precedente, se c'è).

## `drop_column`

```python
ParamSpec("column", "column", "Column"),
```

```python
def _drop_column(lf, p):
    col = p["column"]
    if col not in lf.collect_schema():
        raise ValueError(f"Column not found: {col!r}")
    return lf.drop(col)
```

Rimuove una colonna. Errore esplicito se non esiste invece di lasciare
fallire Polars con un messaggio più oscuro.

## `rename_column`

```python
ParamSpec("column", "column", "Column"),
ParamSpec("new_name", "text", "New name"),
```

```python
def _rename_column(lf, p):
    col = p["column"]
    new_name = (p.get("new_name") or "").strip()
    if not new_name: raise ValueError("New name cannot be empty.")
    schema = lf.collect_schema()
    if col not in schema: raise ValueError(f"Column not found: {col!r}")
    if new_name != col and new_name in schema:
        raise ValueError(f"Column {new_name!r} already exists — pick another name.")
    return lf.rename({col: new_name})
```

Validazioni:
- nome destinazione non vuoto (whitespace stripped)
- colonna sorgente esiste
- nome destinazione non in collisione con un'altra colonna

---

# Filter (8 ops)

## `filter_range`

```python
ParamSpec("column", "column_numeric", "Column"),
ParamSpec("min", "number", "Min", default=0, depends_on="column"),
ParamSpec("max", "number", "Max", default=100, depends_on="column"),
```

```python
def _filter_range(lf, p):
    col, min_val, max_val = p["column"], p["min"], p["max"]
    dtype = lf.collect_schema().get(col)

    # Coerce ISO strings to date/datetime when col is temporal
    if dtype is not None and dtype.is_temporal() and isinstance(min_val, str):
        for parse in (datetime.date.fromisoformat, datetime.datetime.fromisoformat):
            try:
                min_val = parse(min_val); max_val = parse(max_val); break
            except (ValueError, TypeError): continue

    # Be forgiving: swap if user accidentally inverted
    try:
        if min_val is not None and max_val is not None and min_val > max_val:
            min_val, max_val = max_val, min_val
    except TypeError: pass

    return lf.filter((pl.col(col) >= min_val) & (pl.col(col) <= max_val))
```

Filtro inclusivo `[min, max]`. Funziona su numeric (default) e temporal
(coercion da ISO strings).

`depends_on="column"` fa sì che il dialog auto-popoli min/max con i
veri valori della colonna (`useColumnStats(column)` → min, max).

## `filter_equals`

```python
ParamSpec("column", "column_categorical", "Column"),
ParamSpec("value", "value_from_column", "Value", depends_on="column"),
```

```python
def _filter_equals(lf, p):
    return lf.filter(pl.col(p["column"]).cast(pl.Utf8) == str(p["value"]))
```

Match esatto. `cast(pl.Utf8)` perché il dialog passa il value come
stringa (è un Select). Funziona per tutti i tipi che si stringificano
ragionevolmente.

## `filter_in_values`

```python
ParamSpec("column", "column_categorical", "Column"),
ParamSpec("values", "multi_values_from_column", "Values", depends_on="column"),
```

```python
def _filter_in_values(lf, p):
    values = p["values"] or []
    if not values: return lf      # nessun valore selezionato → no-op
    return lf.filter(pl.col(p["column"]).cast(pl.Utf8).is_in([str(v) for v in values]))
```

`IN`-style filter. Il MultiSelect del dialog mostra i distinct values
della colonna scelta (auto-popolato).

## `filter_text_contains`

```python
ParamSpec("column", "column", "Column"),
ParamSpec("text", "text", "Substring"),
```

```python
def _filter_text_contains(lf, p):
    text = p.get("text") or ""
    if not text: return lf       # empty text → no-op (NOT match-everything)
    return lf.filter(pl.col(p["column"]).cast(pl.Utf8).str.contains(text, literal=True))
```

**Importante**: `literal=True`. Senza questo flag Polars interpreta
`text` come regex per default — un utente che cerca `"O.K."` matcherebbe
"OXK" perché `.` è il jolly regex. Con `literal=True` è un substring
match puro.

## `filter_not_null` (single column)

```python
ParamSpec("column", "column", "Column"),
```

```python
def _filter_not_null(lf, p):
    return lf.filter(pl.col(p["column"]).is_not_null())
```

"Drop nulls in this column".

## `filter_null` (single column)

```python
ParamSpec("column", "column", "Column"),
```

```python
def _filter_null(lf, p):
    return lf.filter(pl.col(p["column"]).is_null())
```

"Keep only rows where this column is null". Utile per ispezionare
missingness.

## `drop_rows_any_null` (row-level)

```python
ParamSpec("columns", "columns_multi", "Restrict to columns (optional — leave empty for all)"),
```

```python
def _drop_rows_any_null(lf, p):
    cols = p.get("columns") or []
    if not cols: return lf.drop_nulls()    # tutte le colonne
    schema = lf.collect_schema()
    missing = [c for c in cols if c not in schema]
    if missing: raise ValueError(f"Column(s) not found: {', '.join(missing)}")
    return lf.drop_nulls(subset=cols)
```

"Complete-cases" filter. Rimuove righe che hanno almeno un null in
**qualsiasi** colonna (default) o nelle colonne selezionate.

## `keep_rows_any_null` (row-level)

```python
ParamSpec("columns", "columns_multi", "Restrict to columns (optional — leave empty for all)"),
```

```python
def _keep_rows_any_null(lf, p):
    cols = p.get("columns") or []
    schema = lf.collect_schema()
    if not cols: cols = list(schema)
    missing = [c for c in cols if c not in schema]
    if missing: raise ValueError(f"Column(s) not found: {', '.join(missing)}")
    if not cols: return lf
    return lf.filter(pl.any_horizontal([pl.col(c).is_null() for c in cols]))
```

Inverso di `drop_rows_any_null`. Tieni solo righe che hanno almeno un
null fra le colonne selezionate (utile per ispezione).

`pl.any_horizontal(...)` è il riduttore row-wise di `OR` su una lista
di expressions booleane.

---

# Group (1 op)

## `group_by`

```python
ParamSpec("by", "column", "Group by"),
ParamSpec("target", "column", "Target column"),
ParamSpec("agg", "enum", "Aggregation",
          options=["count", "sum", "mean", "min", "max"], default="count"),
```

```python
def _group_by(lf, p):
    by = p["by"]
    target = (p.get("target") or "").strip() or None
    agg = p["agg"]
    schema = lf.collect_schema()

    if by not in schema:
        raise ValueError(f"Group-by column not found: {by!r}")

    if agg == "count":
        return lf.group_by(by).agg(pl.len().alias("count")).sort(by)

    if not target:
        raise ValueError(f"Aggregation '{agg}' requires a target column.")
    if target not in schema:
        raise ValueError(f"Target column not found: {target!r}")
    if agg in ("sum", "mean") and not schema[target].is_numeric():
        raise ValueError(f"Aggregation '{agg}' requires a numeric target column (got {schema[target]}).")

    expr = pl.col(target)
    return lf.group_by(by).agg({
        "sum":  expr.sum(),
        "mean": expr.mean(),
        "min":  expr.min(),
        "max":  expr.max(),
    }[agg].alias(f"{target}_{agg}")).sort(by)
```

Aggregazione per gruppi. Note:

- `agg=count` ignora completamente `target` e produce alias `"count"`.
- `agg=sum/mean` validano che il target sia numerico (Polars su stringhe
  fa concatenazione, comportamento sorprendente).
- `min/max` funzionano anche su temporal/string (lessicografico).
- Lo stato risultante ha schema completamente diverso (solo `by` +
  `<target>_<agg>` o solo `by` + `count`). Questo cambia il working
  set per le ops successive: per esempio dopo un group_by, il
  `target` originale non esiste più — ops a valle che lo usavano
  fallirebbero in cascade rebase. È un edge case voluto e rilevato.

---

# Visualize (6 ops)

Tutte e 6 hanno `kind="viz"`. Ricevono un `pl.DataFrame` (già collected)
e ritornano un `dict` ECharts (o `MapPayload`).

## `viz_histogram`

```python
ParamSpec("column", "column_numeric", "Column"),
ParamSpec("bins", "int", "Bins", default=30),
```

```python
def histogram(df, params):
    column, bins = params["column"], max(2, int(params.get("bins", 30)))
    raw = df.get_column(column)
    nulls = int(raw.null_count())
    values = raw.drop_nulls().to_numpy()
    if values.size == 0:
        return _empty(f"Histogram of {column}", "no values")

    counts, edges = np.histogram(values, bins=bins)
    labels = [f"{fmt_num(edges[i])} – {fmt_num(edges[i+1])}" for i in range(bins)]
    return {
        title: ..., grid: ..., tooltip: {trigger: "axis"},
        xAxis: { type: "category", data: labels, axisLabel: {interval: bins//12, rotate: 30} },
        yAxis: { type: "value", name: "count" },
        series: [{ type: "bar", data: counts.tolist(), itemStyle: {color: INDIGO} }],
    }
```

Bin equal-width via `np.histogram`. Subtitle: "30 bins · 5009 values".
Etichette ruotate 30° per evitare overlap con bin lunghi.

## `viz_scatter`

```python
ParamSpec("x", "column_numeric", "X"),
ParamSpec("y", "column_numeric", "Y"),
```

`(x, y)` points, Polars drop_nulls sui due, points → list di tuple,
ECharts `series.type = "scatter"`. Tooltip default mostra `(x, y)`.

## `viz_timeline`

```python
ParamSpec("x", "column_temporal", "X (time)"),
ParamSpec("y", "column_numeric", "Y"),
```

Line chart, x temporal sortato. Subtitle: "5009 points · 2024-01-01 → 2024-12-31".
ECharts `xAxis.type = "time"` consuma ISO strings direttamente.

## `viz_bar_topn`

```python
ParamSpec("column", "column_categorical", "Column"),
ParamSpec("n", "int", "N", default=10),
```

`group_by(column).len() → sort desc → head(n)`. Bar orizzontali
(`yAxis: category`, `xAxis: value`) con label del count visibile a destra
di ogni barra (`series.label.position: "right"`).

## `viz_heatmap`

L'op più complessa. Accetta tutto.

```python
ParamSpec("x", "column", "X (any)"),
ParamSpec("y", "column", "Y (any)"),
ParamSpec("value", "column_numeric_optional", "Value (optional)"),
ParamSpec("agg", "enum", "Aggregation",
          options=["count", "mean", "sum", "min", "max"], default="count"),
ParamSpec("bins", "int", "Bins (numeric / temporal axes)", default=10),
```

Logica:
1. **Bin** ogni asse separatamente in base al dtype:
   - numeric → equal-width via `np.digitize`, label `"56.0–78.9"`
   - temporal → bin sui timestamp interi, label `"2024-01-01 → 2024-03-01"`
   - categorical → distinct values sorted
2. Costruisci un working DataFrame con `_x`, `_y`, e opzionale `_v`.
3. Drop le righe con `_x` o `_y` null.
4. `group_by([_x, _y]).agg(...)` con:
   - `count` → `pl.len()`
   - `sum/mean/min/max` → `pl.col("_v").{agg}()`
5. Mappa `_x, _y` a indici nei `x_categories`/`y_categories` per ECharts.
6. Ritorna ECharts `series.type: "heatmap"` con `data: [[xi, yi, v], ...]`,
   `visualMap` (gradient bianco→indigo), label visibile dentro le celle.

Validazione: `agg != "count"` richiede `value`, altrimenti errore.

## `viz_map`

```python
ParamSpec("lat", "column_numeric", "Latitude"),
ParamSpec("lon", "column_numeric", "Longitude"),
```

Ritorna **NON** un dict ECharts ma un `MapPayload`:
```python
{
  "kind": "map",
  "lat_col": "...",
  "lon_col": "...",
  "center": [avg_lat, avg_lon],
  "points": [[lat, lon], ...],   # capped at 5000
  "error": "..." (opzionale)
}
```

Il frontend `ChartCellView` discrimina su `cell.opId === "viz_map"` e
passa il payload a `<MapCanvas>` (Leaflet) invece di ECharts.

Auto-detection: se `lat`/`lon` non sono passati, prova a indovinare da
nomi colonna (`"lat"`, `"latitude"`, `"lon"`, `"lng"`, `"long"`,
`"longitude"`).

---

# View (2 ops)

`kind="view"`: come viz, non avanzano lo stato. Ricevono `lf` (LazyFrame
non collected) e ritornano un dict di payload custom.

## `view_schema`

Nessun param.

```python
def _view_schema(lf, p):
    schema = lf.collect_schema()
    # Single collect for null counts + min/max for numeric/temporal cols
    null_exprs = [pl.col(c).null_count().alias(f"__nulls__{c}") for c in schema]
    range_exprs = []
    for c, dt in schema.items():
        if dt.is_numeric() or dt.is_temporal():
            range_exprs.extend([
                pl.col(c).min().alias(f"__min__{c}"),
                pl.col(c).max().alias(f"__max__{c}"),
            ])
    stats = lf.select(*null_exprs, *range_exprs).collect().row(0, named=True)

    return {
        "kind": "schema",
        "columns": [
            {
                "name": name,
                "type": classify(dt).value,
                "dtype": str(dt),
                "nulls": int(stats[f"__nulls__{name}"] or 0),
                **({"min": _stringify(stats[f"__min__{name}"]),
                    "max": _stringify(stats[f"__max__{name}"])}
                   if dt.is_numeric() or dt.is_temporal() else {}),
            }
            for name, dt in schema.items()
        ],
    }
```

Restituisce un payload che il frontend `<SchemaView>` renderizza come
grid di card (una per colonna), ognuna con bordo sinistro colorato per
type, dtype Polars, range numerico (se applicabile), null count.

**Una sola collect()** per tutti i null_count + tutti i min/max in
parallelo — evita N collects sequenziali.

## `view_row_count`

Nessun param.

```python
def _view_row_count(lf, p):
    return {"kind": "row_count", "count": int(lf.select(pl.len()).collect().item())}
```

Ritorna semplicemente il count. Il frontend lo mostra come grande
numero con gradient indigo (vedi vecchio `RowCountView` in
`ChartCanvas.tsx` — funzione che però attualmente non è esposta nella
UI v2; il count è già visibile nell'header di ogni TableCellView).

---

# Riassunto registry

```
[Data]      sort_by · keep_top_n · drop_column · rename_column
[Filter]    filter_range · filter_equals · filter_in_values · filter_text_contains
            filter_not_null · filter_null · drop_rows_any_null · keep_rows_any_null
[Group]     group_by
[Visualize] viz_histogram · viz_scatter · viz_timeline · viz_bar_topn · viz_heatmap · viz_map
[View]      view_schema · view_row_count
```

Tutte e 21 testate end-to-end con il dataset `orders.csv` (5009 righe,
schema `id, order_date, ship_mode, customer_id, sales`). 21/21 verde.

# Aggiungere una nuova op

1. Implementa la funzione `_my_op(lf_or_df, params) -> ...` in
   `domain/operations.py`.
2. Aggiungi una `Operation(...)` alla lista `OPERATIONS`.
3. Se necessario, aggiungi un caso in `format_description(op, params)`
   per il chip della history strip.
4. Se l'op richiede un nuovo `kind` di ParamSpec (es. `"my_special"`),
   aggiungi il case-handler in `frontend/src/components/ManipulationPanel.tsx`
   `Field` component.
5. Se è un nuovo viz (`kind="viz"`), aggiungi il chart type in
   `frontend/src/lib/chartTypes.ts` per esporlo nel chart-builder.
6. (Opzionale) Aggiungi un'icona in `DATA_OP_ICONS` di
   `ManipulationPanel.tsx`.

Test backend manuale:
```bash
curl -s -b /tmp/vn_cookies -H "Content-Type: application/json" \
     -d '{"state_id":"<root>","op_id":"my_op","params":{...}}' \
     http://localhost:8000/api/branch
```

Il frontend prende automaticamente la nuova op via `/api/operations` —
nessuna modifica al codice React necessaria per le ops standard
(nuovi `kind` di ParamSpec sì).
