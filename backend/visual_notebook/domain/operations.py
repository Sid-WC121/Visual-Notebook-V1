"""Operation registry — single source of truth.

Op kinds:
  - "data" → `(lf: pl.LazyFrame, params: dict) -> pl.LazyFrame`
  - "viz"  → `(df: pl.DataFrame, params: dict) -> dict`     (ECharts option / Leaflet payload)
  - "view" → `(lf: pl.LazyFrame, params: dict) -> dict`     (read-only inspection)

The `params` schema for each operation is declarative (`ParamSpec`),
which lets the frontend auto-generate dialogs.
"""

from __future__ import annotations

import datetime
from dataclasses import asdict, dataclass
from typing import Any, Callable

import polars as pl

from visual_notebook.viz.bar_topn import bar_topn
from visual_notebook.viz.heatmap import heatmap
from visual_notebook.viz.histogram import histogram
from visual_notebook.viz.map import map_payload
from visual_notebook.viz.scatter import scatter
from visual_notebook.viz.timeline import timeline
from visual_notebook.viz.pie import pie
from visual_notebook.viz.box import boxplot
from visual_notebook.viz.area import area
from visual_notebook.viz.funnel import funnel
from visual_notebook.viz.treemap import treemap
from visual_notebook.viz.bar_stacked import bar_stacked


@dataclass(frozen=True)
class ParamSpec:
    name: str
    kind: str
    label: str
    options: list[str] | None = None
    default: Any = None
    depends_on: str | None = None


@dataclass(frozen=True)
class Operation:
    id: str
    label: str
    menu: str
    kind: str
    params: list[ParamSpec]
    apply: Callable[..., Any]


def _sort_by(lf: pl.LazyFrame, p: dict) -> pl.LazyFrame:
    return lf.sort(p["column"], descending=(p["order"] == "desc"))


def _keep_top_n(lf: pl.LazyFrame, p: dict) -> pl.LazyFrame:
    n = int(p["n"])
    if n < 1:
        raise ValueError("N must be at least 1.")
    return lf.head(n)


def _drop_column(lf: pl.LazyFrame, p: dict) -> pl.LazyFrame:
    col = p["column"]
    if col not in lf.collect_schema():
        raise ValueError(f"Column not found: {col!r}")
    return lf.drop(col)


def _rename_column(lf: pl.LazyFrame, p: dict) -> pl.LazyFrame:
    col = p["column"]
    new_name = (p.get("new_name") or "").strip()
    if not new_name:
        raise ValueError("New name cannot be empty.")
    schema = lf.collect_schema()
    if col not in schema:
        raise ValueError(f"Column not found: {col!r}")
    if new_name != col and new_name in schema:
        raise ValueError(f"Column {new_name!r} already exists — pick another name.")
    return lf.rename({col: new_name})


def _filter_range(lf: pl.LazyFrame, p: dict) -> pl.LazyFrame:
    col = p["column"]
    min_val: Any = p["min"]
    max_val: Any = p["max"]

    dtype = lf.collect_schema().get(col)
    if dtype is not None and dtype.is_temporal() and isinstance(min_val, str):
        for parse in (datetime.date.fromisoformat, datetime.datetime.fromisoformat):
            try:
                min_val = parse(min_val)
                max_val = parse(max_val)
                break
            except (ValueError, TypeError):
                continue

    try:
        if min_val is not None and max_val is not None and min_val > max_val:
            min_val, max_val = max_val, min_val
    except TypeError:
        pass

    return lf.filter((pl.col(col) >= min_val) & (pl.col(col) <= max_val))


def _filter_equals(lf: pl.LazyFrame, p: dict) -> pl.LazyFrame:
    return lf.filter(pl.col(p["column"]).cast(pl.Utf8) == str(p["value"]))


def _filter_in_values(lf: pl.LazyFrame, p: dict) -> pl.LazyFrame:
    values = p["values"] or []
    if not values:
        return lf
    return lf.filter(pl.col(p["column"]).cast(pl.Utf8).is_in([str(v) for v in values]))


def _filter_text_contains(lf: pl.LazyFrame, p: dict) -> pl.LazyFrame:
    text = p.get("text") or ""
    if not text:
        return lf
    return lf.filter(
        pl.col(p["column"]).cast(pl.Utf8).str.contains(text, literal=True)
    )


def _filter_not_null(lf: pl.LazyFrame, p: dict) -> pl.LazyFrame:
    return lf.filter(pl.col(p["column"]).is_not_null())


def _filter_null(lf: pl.LazyFrame, p: dict) -> pl.LazyFrame:
    return lf.filter(pl.col(p["column"]).is_null())


def _drop_rows_any_null(lf: pl.LazyFrame, p: dict) -> pl.LazyFrame:
    """Drop rows that contain at least one null in any of `columns`
    (or any column at all if `columns` is empty / unset)."""
    cols = p.get("columns") or []
    if not cols:
        return lf.drop_nulls()
    schema = lf.collect_schema()
    missing = [c for c in cols if c not in schema]
    if missing:
        raise ValueError(f"Column(s) not found: {', '.join(missing)}")
    return lf.drop_nulls(subset=cols)


def _keep_rows_any_null(lf: pl.LazyFrame, p: dict) -> pl.LazyFrame:
    """Keep only rows that have at least one null among `columns`
    (or any column at all if `columns` is empty / unset)."""
    cols = p.get("columns") or []
    schema = lf.collect_schema()
    if not cols:
        cols = list(schema)
    missing = [c for c in cols if c not in schema]
    if missing:
        raise ValueError(f"Column(s) not found: {', '.join(missing)}")
    if not cols:
        return lf
    return lf.filter(pl.any_horizontal([pl.col(c).is_null() for c in cols]))


def _group_by(lf: pl.LazyFrame, p: dict) -> pl.LazyFrame:
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
    target_dtype = schema[target]
    if agg in ("sum", "mean") and not target_dtype.is_numeric():
        raise ValueError(
            f"Aggregation '{agg}' requires a numeric target column "
            f"(got {target_dtype})."
        )

    expr = pl.col(target)
    agg_map = {
        "sum":  expr.sum(),
        "mean": expr.mean(),
        "min":  expr.min(),
        "max":  expr.max(),
    }
    if agg not in agg_map:
        raise ValueError(f"Unknown aggregation: {agg!r}")
    return (
        lf.group_by(by)
          .agg(agg_map[agg].alias(f"{target}_{agg}"))
          .sort(by)
    )


def _view_schema(lf: pl.LazyFrame, p: dict) -> dict:
    """Schema as a structured payload — frontend renders it."""
    schema = lf.collect_schema()
    null_exprs = [pl.col(c).null_count().alias(f"__nulls__{c}") for c in schema]
    range_exprs = []
    range_cols: list[str] = []
    for c, dt in schema.items():
        if dt.is_numeric() or dt.is_temporal():
            range_cols.append(c)
            range_exprs.append(pl.col(c).min().alias(f"__min__{c}"))
            range_exprs.append(pl.col(c).max().alias(f"__max__{c}"))
    try:
        stats = lf.select(*null_exprs, *range_exprs).collect().row(0, named=True)
    except Exception:  # noqa: BLE001
        stats = {}
    columns = []
    for name, dt in schema.items():
        nulls = int(stats.get(f"__nulls__{name}", 0) or 0)
        kind = (
            "numeric" if dt.is_numeric()
            else "temporal" if dt.is_temporal()
            else "boolean" if dt == pl.Boolean
            else "categorical" if dt in (pl.Utf8, pl.Categorical)
            else "other"
        )
        col_payload = {"name": name, "type": kind, "dtype": str(dt), "nulls": nulls}
        if name in range_cols:
            mn = stats.get(f"__min__{name}")
            mx = stats.get(f"__max__{name}")
            col_payload["min"] = _stringify(mn)
            col_payload["max"] = _stringify(mx)
        columns.append(col_payload)
    return {"kind": "schema", "columns": columns}


def _view_row_count(lf: pl.LazyFrame, p: dict) -> dict:
    n = int(lf.select(pl.len()).collect().item())
    return {"kind": "row_count", "count": n}


def _stringify(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        return f"{v:.6g}"
    return str(v)


OPERATIONS: list[Operation] = [
    Operation("sort_by", "Sort by column", "Data", "data", [
        ParamSpec("column", "column", "Column"),
        ParamSpec("order", "enum", "Order", options=["asc", "desc"]),
    ], _sort_by),
    Operation("keep_top_n", "Keep top N rows", "Data", "data", [
        ParamSpec("n", "int", "N", default=100),
    ], _keep_top_n),
    Operation("drop_column", "Drop column", "Data", "data", [
        ParamSpec("column", "column", "Column"),
    ], _drop_column),
    Operation("rename_column", "Rename column", "Data", "data", [
        ParamSpec("column", "column", "Column"),
        ParamSpec("new_name", "text", "New name"),
    ], _rename_column),

    Operation("filter_range", "Filter by range", "Filter", "data", [
        ParamSpec("column", "column_rangeable", "Column"),
        ParamSpec("min", "number", "Min", default=0, depends_on="column"),
        ParamSpec("max", "number", "Max", default=100, depends_on="column"),
    ], _filter_range),
    Operation("filter_equals", "Filter by value (equals)", "Filter", "data", [
        ParamSpec("column", "column_categorical", "Column"),
        ParamSpec("value", "value_from_column", "Value", depends_on="column"),
    ], _filter_equals),
    Operation("filter_in_values", "Filter by multiple values (in)", "Filter", "data", [
        ParamSpec("column", "column_categorical", "Column"),
        ParamSpec("values", "multi_values_from_column", "Values", depends_on="column"),
    ], _filter_in_values),
    Operation("filter_text_contains", "Filter by text contains", "Filter", "data", [
        ParamSpec("column", "column", "Column"),
        ParamSpec("text", "text", "Substring"),
    ], _filter_text_contains),
    Operation("filter_not_null", "Drop nulls in column", "Filter", "data", [
        ParamSpec("column", "column", "Column"),
    ], _filter_not_null),
    Operation("filter_null", "Keep only nulls", "Filter", "data", [
        ParamSpec("column", "column", "Column"),
    ], _filter_null),
    Operation("drop_rows_any_null", "Drop rows with any null", "Filter", "data", [
        ParamSpec(
            "columns", "columns_multi",
            "Restrict to columns (optional — leave empty for all)",
        ),
    ], _drop_rows_any_null),
    Operation("keep_rows_any_null", "Keep rows with any null", "Filter", "data", [
        ParamSpec(
            "columns", "columns_multi",
            "Restrict to columns (optional — leave empty for all)",
        ),
    ], _keep_rows_any_null),

    Operation("group_by", "Group by + aggregate", "Group", "data", [
        ParamSpec("by", "column", "Group by"),
        ParamSpec("target", "column", "Target column"),
        ParamSpec("agg", "enum", "Aggregation",
                  options=["count", "sum", "mean", "min", "max"], default="count"),
    ], _group_by),

    Operation("viz_histogram", "Histogram", "Visualize", "viz", [
        ParamSpec("column", "column_numeric", "Column"),
        ParamSpec("bins", "int", "Bins", default=30),
    ], histogram),
    Operation("viz_scatter", "Scatter", "Visualize", "viz", [
        ParamSpec("x", "column_numeric", "X"),
        ParamSpec("y", "column_numeric", "Y"),
    ], scatter),
    Operation("viz_timeline", "Timeline (line)", "Visualize", "viz", [
        ParamSpec("x", "column_temporal", "X (time)"),
        ParamSpec("y", "column_numeric", "Y"),
    ], timeline),
    Operation("viz_area", "Area Chart", "Visualize", "viz", [
        ParamSpec("x", "column_temporal", "X (time)"),
        ParamSpec("y", "column_numeric", "Y"),
    ], area),
    Operation("viz_pie", "Pie Chart", "Visualize", "viz", [
        ParamSpec("column", "column_categorical", "Column"),
        ParamSpec("n", "int", "Top N", default=5),
    ], pie),
    Operation("viz_funnel", "Funnel Chart", "Visualize", "viz", [
        ParamSpec("column", "column_categorical", "Column"),
        ParamSpec("n", "int", "Top N", default=5),
    ], funnel),
    Operation("viz_treemap", "Treemap", "Visualize", "viz", [
        ParamSpec("column", "column_categorical", "Category"),
        ParamSpec("value", "column_numeric_optional", "Value (optional)"),
    ], treemap),
    Operation("viz_bar_stacked", "Stacked Bar", "Visualize", "viz", [
        ParamSpec("x", "column", "X Axis"),
        ParamSpec("by", "column_categorical", "Stack By"),
        ParamSpec("y", "column_numeric_optional", "Y Value (optional)"),
    ], bar_stacked),
    Operation("viz_boxplot", "Box Plot", "Visualize", "viz", [
        ParamSpec("column", "column_numeric", "Column"),
        ParamSpec("by", "column_categorical_optional", "Group by (optional)"),
    ], boxplot),
    Operation("viz_bar_topn", "Bar (top N)", "Visualize", "viz", [
        ParamSpec("column", "column_categorical", "Column"),
        ParamSpec("n", "int", "N", default=10),
    ], bar_topn),
    Operation("viz_heatmap", "Heatmap", "Visualize", "viz", [
        ParamSpec("x", "column", "X (any)"),
        ParamSpec("y", "column", "Y (any)"),
        ParamSpec("value", "column_numeric_optional", "Value (optional)"),
        ParamSpec("agg", "enum", "Aggregation",
                  options=["count", "mean", "sum", "min", "max"], default="count"),
        ParamSpec("bins", "int", "Bins (numeric / temporal axes)", default=10),
    ], heatmap),
    Operation("viz_map", "Map (lat / lon)", "Visualize", "viz", [
        ParamSpec("lat", "column_numeric", "Latitude"),
        ParamSpec("lon", "column_numeric", "Longitude"),
    ], map_payload),

    Operation("view_schema", "Show schema", "View", "view", [], _view_schema),
    Operation("view_row_count", "Show row count", "View", "view", [], _view_row_count),
]


def get_operation(op_id: str) -> Operation:
    for op in OPERATIONS:
        if op.id == op_id:
            return op
    raise KeyError(f"Unknown operation: {op_id!r}")


def operations_catalog() -> list[dict]:
    """Serialise the registry for the API. The frontend builds menus / dialogs
    from this payload, so the format is the contract."""
    out = []
    for op in OPERATIONS:
        out.append({
            "id": op.id,
            "label": op.label,
            "menu": op.menu,
            "kind": op.kind,
            "params": [asdict(p) for p in op.params],
        })
    return out


def format_description(op: Operation, params: dict) -> str:
    if op.id == "sort_by":
        return f"Sort {params['column']} {params['order']}"
    if op.id == "keep_top_n":
        return f"Keep top {params['n']}"
    if op.id == "drop_column":
        return f"Drop {params['column']}"
    if op.id == "rename_column":
        return f"Rename {params['column']} → {params['new_name']}"
    if op.id == "filter_range":
        return f"{params['column']} ∈ [{params['min']}, {params['max']}]"
    if op.id == "filter_equals":
        return f"{params['column']} = {params['value']!r}"
    if op.id == "filter_in_values":
        vals = params.get("values") or []
        sample = ", ".join(str(v) for v in vals[:3])
        more = f" +{len(vals) - 3}" if len(vals) > 3 else ""
        return f"{params['column']} ∈ {{{sample}{more}}}"
    if op.id == "filter_text_contains":
        return f"{params['column']} contains {params['text']!r}"
    if op.id == "filter_not_null":
        return f"{params['column']} not null"
    if op.id == "filter_null":
        return f"{params['column']} is null"
    if op.id == "drop_rows_any_null":
        cols = params.get("columns") or []
        return (
            f"Drop incomplete rows in {{{', '.join(cols[:3])}{', …' if len(cols) > 3 else ''}}}"
            if cols else "Drop rows with any null"
        )
    if op.id == "keep_rows_any_null":
        cols = params.get("columns") or []
        return (
            f"Keep rows with any null in {{{', '.join(cols[:3])}{', …' if len(cols) > 3 else ''}}}"
            if cols else "Keep rows with any null"
        )
    if op.id == "group_by":
        return f"Group by {params['by']} → {params['agg']}({params['target']})"
    return op.label
