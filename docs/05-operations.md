# 05 — Operations Catalog

> 🇬🇧 English · [🇮🇹 Italiano](../05-operazioni.md)

> The 21 operations exposed by the backend, grouped by menu, each with:
> parameters, exact semantics, example API call, file where the
> implementation lives.

## Three op kinds

| Kind | Effect | ECharts/payload output | Examples |
|---|---|---|---|
| `data` | Creates a new `State` (advances the tree) | — | `sort_by`, `filter_range`, `group_by` |
| `viz`  | Renders a chart, doesn't advance state | ECharts dict (or `MapPayload`) | `viz_histogram`, `viz_map` |
| `view` | Read-only inspection, doesn't advance state | Custom payload dict | `view_schema`, `view_row_count` |

## ParamSpec.kind convention

| `kind` (frontend) | UI widget | Notes |
|---|---|---|
| `column` | `<select>` of all column names | any type |
| `column_numeric` | filtered `<select>` | numeric only |
| `column_categorical` | filtered `<select>` | categorical + boolean |
| `column_temporal` | filtered `<select>` | temporal only |
| `column_numeric_optional` | `<select>` with "(none)" entry | numeric, optional |
| `value_from_column` | `<select>` from distinct values | populated via `useColumnStats` when the companion `column` changes |
| `multi_values_from_column` | `<select multiple>` | as above but multi |
| `columns_multi` | `<select multiple>` of column names | for ops operating on a subset of columns |
| `enum` | `<select>` from `spec.options` | e.g. `agg`, `order` |
| `int` / `number` | `<input type="number">` | step=1 for `int`, free for `number` |
| `text` | `<input type="text">` | fallback |

`depends_on` is the name of another param: triggers auto-fill (e.g.
min/max for `filter_range` when the user picks the column).

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

Lazy in-place sort on the column.

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

Limit the state to the first `n` rows (after the previous sort, if
any).

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

Drop a column. Explicit error if it doesn't exist instead of letting
Polars fail with a more obscure message.

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

Validations:
- destination name not empty (whitespace stripped)
- source column exists
- destination name not colliding with another column

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

Inclusive `[min, max]` filter. Works on numeric (default) and temporal
(coercion from ISO strings).

`depends_on="column"` makes the dialog auto-populate min/max with the
real column values (`useColumnStats(column)` → min, max).

## `filter_equals`

```python
ParamSpec("column", "column_categorical", "Column"),
ParamSpec("value", "value_from_column", "Value", depends_on="column"),
```

```python
def _filter_equals(lf, p):
    return lf.filter(pl.col(p["column"]).cast(pl.Utf8) == str(p["value"]))
```

Exact match. `cast(pl.Utf8)` because the dialog passes the value as a
string (it's a Select). Works for any type that stringifies sensibly.

## `filter_in_values`

```python
ParamSpec("column", "column_categorical", "Column"),
ParamSpec("values", "multi_values_from_column", "Values", depends_on="column"),
```

```python
def _filter_in_values(lf, p):
    values = p["values"] or []
    if not values: return lf      # no values selected → no-op
    return lf.filter(pl.col(p["column"]).cast(pl.Utf8).is_in([str(v) for v in values]))
```

`IN`-style filter. The dialog MultiSelect shows the distinct values of
the chosen column (auto-populated).

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

**Important**: `literal=True`. Without this flag Polars interprets
`text` as a regex by default — a user searching `"O.K."` would match
"OXK" because `.` is the regex wildcard. With `literal=True` it's a
pure substring match.

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

"Keep only rows where this column is null". Useful for inspecting
missingness.

## `drop_rows_any_null` (row-level)

```python
ParamSpec("columns", "columns_multi", "Restrict to columns (optional — leave empty for all)"),
```

```python
def _drop_rows_any_null(lf, p):
    cols = p.get("columns") or []
    if not cols: return lf.drop_nulls()    # all columns
    schema = lf.collect_schema()
    missing = [c for c in cols if c not in schema]
    if missing: raise ValueError(f"Column(s) not found: {', '.join(missing)}")
    return lf.drop_nulls(subset=cols)
```

"Complete-cases" filter. Drops rows that have at least one null in
**any** column (default) or in the selected columns.

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

Inverse of `drop_rows_any_null`. Keep only rows that have at least one
null among the selected columns (useful for inspection).

`pl.any_horizontal(...)` is the row-wise `OR` reducer over a list of
boolean expressions.

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

Group aggregation. Notes:

- `agg=count` completely ignores `target` and produces alias `"count"`.
- `agg=sum/mean` validate that the target is numeric (Polars on
  strings does concatenation — surprising behaviour).
- `min/max` work also on temporal/string (lexicographic).
- The resulting state has a completely different schema (just `by` +
  `<target>_<agg>` or just `by` + `count`). This changes the working
  set for subsequent ops: e.g. after a group_by, the original `target`
  no longer exists — downstream ops using it would fail in cascade
  rebase. It's an intentional, detected edge case.

---

# Visualize (6 ops)

All 6 have `kind="viz"`. They receive a `pl.DataFrame` (already
collected) and return a `dict` ECharts (or `MapPayload`).

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

Equal-width bins via `np.histogram`. Subtitle: "30 bins · 5009 values".
Labels rotated 30° to avoid overlap with long bins.

## `viz_scatter`

```python
ParamSpec("x", "column_numeric", "X"),
ParamSpec("y", "column_numeric", "Y"),
```

`(x, y)` points, Polars drop_nulls on both, points → list of tuples,
ECharts `series.type = "scatter"`. Default tooltip shows `(x, y)`.

## `viz_timeline`

```python
ParamSpec("x", "column_temporal", "X (time)"),
ParamSpec("y", "column_numeric", "Y"),
```

Line chart, x temporal sorted. Subtitle: "5009 points · 2024-01-01 → 2024-12-31".
ECharts `xAxis.type = "time"` consumes ISO strings directly.

## `viz_bar_topn`

```python
ParamSpec("column", "column_categorical", "Column"),
ParamSpec("n", "int", "N", default=10),
```

`group_by(column).len() → sort desc → head(n)`. Horizontal bars
(`yAxis: category`, `xAxis: value`) with the count label visible to
the right of each bar (`series.label.position: "right"`).

## `viz_heatmap`

The most complex op. Accepts everything.

```python
ParamSpec("x", "column", "X (any)"),
ParamSpec("y", "column", "Y (any)"),
ParamSpec("value", "column_numeric_optional", "Value (optional)"),
ParamSpec("agg", "enum", "Aggregation",
          options=["count", "mean", "sum", "min", "max"], default="count"),
ParamSpec("bins", "int", "Bins (numeric / temporal axes)", default=10),
```

Logic:
1. **Bin** each axis separately based on the dtype:
   - numeric → equal-width via `np.digitize`, label `"56.0–78.9"`
   - temporal → bins on integer timestamps, label `"2024-01-01 → 2024-03-01"`
   - categorical → distinct values sorted
2. Build a working DataFrame with `_x`, `_y`, and optional `_v`.
3. Drop rows with `_x` or `_y` null.
4. `group_by([_x, _y]).agg(...)` with:
   - `count` → `pl.len()`
   - `sum/mean/min/max` → `pl.col("_v").{agg}()`
5. Map `_x, _y` to indices in `x_categories`/`y_categories` for
   ECharts.
6. Return ECharts `series.type: "heatmap"` with `data: [[xi, yi, v], ...]`,
   `visualMap` (white→indigo gradient), label visible inside cells.

Validation: `agg != "count"` requires `value`, otherwise error.

## `viz_map`

```python
ParamSpec("lat", "column_numeric", "Latitude"),
ParamSpec("lon", "column_numeric", "Longitude"),
```

Returns **NOT** an ECharts dict but a `MapPayload`:
```python
{
  "kind": "map",
  "lat_col": "...",
  "lon_col": "...",
  "center": [avg_lat, avg_lon],
  "points": [[lat, lon], ...],   # capped at 5000
  "error": "..." (optional)
}
```

The `ChartCellView` frontend dispatches on `cell.opId === "viz_map"`
and passes the payload to `<MapCanvas>` (Leaflet) instead of ECharts.

Auto-detection: if `lat`/`lon` aren't passed, it tries to guess from
column names (`"lat"`, `"latitude"`, `"lon"`, `"lng"`, `"long"`,
`"longitude"`).

---

# View (2 ops)

`kind="view"`: like viz, they don't advance state. They receive `lf`
(non-collected LazyFrame) and return a custom payload dict.

## `view_schema`

No params.

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

Returns a payload that the frontend `<SchemaView>` renders as a grid
of cards (one per column), each with type-coloured left border, Polars
dtype, numeric range (if applicable), null count.

**A single collect()** for all null_counts + all min/max in parallel —
avoids N sequential collects.

## `view_row_count`

No params.

```python
def _view_row_count(lf, p):
    return {"kind": "row_count", "count": int(lf.select(pl.len()).collect().item())}
```

Simply returns the count. The frontend would show it as a large
number with indigo gradient (see old `RowCountView` in
`ChartCanvas.tsx` — function that's currently not exposed in the v2
UI; the count is already visible in the header of every
TableCellView).

---

# Registry summary

```
[Data]      sort_by · keep_top_n · drop_column · rename_column
[Filter]    filter_range · filter_equals · filter_in_values · filter_text_contains
            filter_not_null · filter_null · drop_rows_any_null · keep_rows_any_null
[Group]     group_by
[Visualize] viz_histogram · viz_scatter · viz_timeline · viz_bar_topn · viz_heatmap · viz_map
[View]      view_schema · view_row_count
```

All 21 tested end-to-end with the `orders.csv` dataset (5009 rows,
schema `id, order_date, ship_mode, customer_id, sales`). 21/21 green.

# Adding a new op

1. Implement the `_my_op(lf_or_df, params) -> ...` function in
   `domain/operations.py`.
2. Add an `Operation(...)` to the `OPERATIONS` list.
3. If needed, add a case in `format_description(op, params)` for the
   history strip chip.
4. If the op requires a new ParamSpec `kind` (e.g. `"my_special"`),
   add the case-handler in
   `frontend/src/components/ManipulationPanel.tsx` `Field` component.
5. If it's a new viz (`kind="viz"`), add the chart type in
   `frontend/src/lib/chartTypes.ts` to expose it in the chart-builder.
6. (Optional) Add an icon in `DATA_OP_ICONS` of
   `ManipulationPanel.tsx`.

Manual backend test:
```bash
curl -s -b /tmp/vn_cookies -H "Content-Type: application/json" \
     -d '{"state_id":"<root>","op_id":"my_op","params":{...}}' \
     http://localhost:8000/api/branch
```

The frontend automatically picks up the new op via `/api/operations` —
no React code changes needed for standard ops (new ParamSpec `kind`s
yes).
