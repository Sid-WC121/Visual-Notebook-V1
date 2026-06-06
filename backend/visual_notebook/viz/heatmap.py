"""2-D heatmap.

Both axes accept *any* column type:
  - numeric  → equal-width bins, label "<lo>–<hi>"
  - temporal → equal-width time bins, label "<date> → <date>"
  - other    → distinct categorical values

Cell value is the count of rows in (x, y), or an aggregation
(mean/sum/min/max) of an optional numeric `value` column.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import polars as pl

from visual_notebook.viz._common import (
    HEATMAP_PALETTE,
    SANS,
    axis_name,
    axis_style,
    base_grid,
    base_tooltip,
    fmt_count,
    fmt_num,
    title,
)

DEFAULT_BINS = 10


def heatmap(df: pl.DataFrame, params: dict) -> dict:
    x_col: str = params["x"]
    y_col: str = params["y"]
    value_col: str | None = params.get("value") or None
    agg: str = (params.get("agg") or "count").lower()
    bins: int = max(2, int(params.get("bins") or DEFAULT_BINS))

    if agg != "count" and not value_col:
        raise ValueError(
            f"Aggregation '{agg}' requires a numeric Value column. "
            "Use agg='count' to count rows instead."
        )

    schema = df.schema

    x_labels, x_categories = _bin_column(df, x_col, schema[x_col], bins)
    y_labels, y_categories = _bin_column(df, y_col, schema[y_col], bins)
    x_col_type, x_bin_edges = _col_filter_info(df, x_col, schema[x_col], bins, len(x_categories))
    y_col_type, y_bin_edges = _col_filter_info(df, y_col, schema[y_col], bins, len(y_categories))

    work_data: dict[str, list] = {"_x": x_labels, "_y": y_labels}
    if value_col:
        if value_col not in schema:
            raise KeyError(f"Value column not found: {value_col!r}")
        work_data["_v"] = df.get_column(value_col).to_list()
    work = pl.DataFrame(work_data).drop_nulls(subset=["_x", "_y"])

    if agg == "count":
        agg_expr = pl.len().alias("v")
    else:
        col_v = pl.col("_v")
        agg_map = {
            "mean": col_v.mean(),
            "sum":  col_v.sum(),
            "min":  col_v.min(),
            "max":  col_v.max(),
        }
        if agg not in agg_map:
            raise ValueError(f"Unknown aggregation: {agg!r}")
        agg_expr = agg_map[agg].alias("v")

    grouped = work.group_by(["_x", "_y"]).agg(agg_expr)

    x_index = {v: i for i, v in enumerate(x_categories)}
    y_index = {v: i for i, v in enumerate(y_categories)}

    data: list[list] = []
    max_v: float = 0.0
    min_v: float = float("inf")
    for row in grouped.iter_rows(named=True):
        x, y, v = row["_x"], row["_y"], row["v"]
        if v is None or x not in x_index or y not in y_index:
            continue
        v = float(v)
        v = round(v, 2) if not v.is_integer() else int(v)
        data.append([x_index[x], y_index[y], v])
        max_v = max(max_v, float(v))
        min_v = min(min_v, float(v))

    if not data:
        min_v, max_v = 0.0, 1.0

    title_text = (
        f"{y_col} × {x_col}" if agg == "count"
        else f"{agg}({value_col}) — {y_col} × {x_col}"
    )
    n_cells = len(data)
    subtitle_parts = [
        f"{len(x_categories)}×{len(y_categories)} grid",
        f"{n_cells} non-empty cell{'' if n_cells == 1 else 's'}",
    ]
    if agg == "count":
        subtitle_parts.append(f"{fmt_count(len(work))} rows counted")
    else:
        subtitle_parts.append(f"{agg} of {value_col}")

    return {
        "title": title(title_text, " · ".join(subtitle_parts)),
        "grid": {**base_grid(has_subtitle=True), "left": 140, "right": 90, "bottom": 80},
        "tooltip": {**base_tooltip(), "position": "top"},
        "xAxis": {
            "type": "category", "data": x_categories,
            **axis_name(x_col, gap=50),
            "axisLabel": {
                "interval": 0, "rotate": 30,
                "color": "#64748b", "fontSize": 10, "fontFamily": SANS,
            },
            "splitArea": {"show": True},
            **{k: v for k, v in axis_style().items() if k != "axisLabel"},
        },
        "yAxis": {
            "type": "category", "data": y_categories,
            **axis_name(y_col, gap=120),
            "splitArea": {"show": True}, **axis_style(),
        },
        "visualMap": {
            "min": min_v if min_v < float("inf") else 0,
            "max": max_v if max_v > 0 else 1,
            "calculable": True,
            "orient": "vertical",
            "right": 8,
            "top": "center",
            "inRange": {"color": HEATMAP_PALETTE},
            "textStyle": {"color": "#334155", "fontSize": 11, "fontFamily": SANS},
        },
        "series": [{
            "type": "heatmap",
            "data": data,
            "label": {
                "show": True,
                "formatter": "{@[2]}",
                "color": "#0f172a",
                "fontSize": 11,
                "fontFamily": SANS,
            },
            "itemStyle": {"borderColor": "#ffffff", "borderWidth": 1},
            "emphasis": {
                "itemStyle": {
                    "shadowBlur": 8,
                    "shadowColor": "rgba(79,70,229,0.35)",
                },
            },
        }],
        "_x": x_col,
        "_y": y_col,
        "_xColType": x_col_type,
        "_yColType": y_col_type,
        "_xBinEdges": x_bin_edges,
        "_yBinEdges": y_bin_edges,
    }


# ── binning helpers ────────────────────────────────────────────────────

def _bin_column(
    df: pl.DataFrame, col: str, dtype: pl.DataType, n_bins: int
) -> tuple[list, list[str]]:
    s = df.get_column(col)
    if dtype.is_numeric():
        return _numeric_bins(s, n_bins)
    if dtype.is_temporal():
        return _temporal_bins(s, n_bins)
    string_s = s.cast(pl.Utf8)
    labels = string_s.to_list()
    cats = sorted({v for v in labels if v is not None})
    return labels, cats


def _numeric_bins(s: pl.Series, n_bins: int) -> tuple[list, list[str]]:
    arr = s.cast(pl.Float64).to_numpy()
    valid_mask = ~np.isnan(arr)
    finite = arr[valid_mask]
    if finite.size == 0:
        return [None] * len(arr), []
    mn, mx = float(finite.min()), float(finite.max())
    if mn == mx:
        cat = fmt_num(mn)
        return [cat if valid_mask[i] else None for i in range(len(arr))], [cat]

    edges = np.linspace(mn, mx, n_bins + 1)
    cats = [f"{fmt_num(edges[i])}–{fmt_num(edges[i + 1])}" for i in range(n_bins)]
    indices = np.clip(np.digitize(arr, edges[1:-1]), 0, n_bins - 1)
    labels = [cats[indices[i]] if valid_mask[i] else None for i in range(len(arr))]
    return labels, cats


def _temporal_bins(s: pl.Series, n_bins: int) -> tuple[list, list[str]]:
    valid_mask = s.is_not_null().to_numpy()
    if not valid_mask.any():
        return [None] * len(s), []

    int_arr = s.cast(pl.Int64, strict=False).to_numpy()
    valid = int_arr[valid_mask]
    mn, mx = int(valid.min()), int(valid.max())

    raw_list = s.to_list()
    if mn == mx:
        cat = _fmt_temporal(raw_list[int(np.argmax(valid_mask))])
        labels = [cat if valid_mask[i] else None for i in range(len(s))]
        return labels, [cat]

    edges = np.linspace(mn, mx, n_bins + 1)
    edge_vals = pl.Series(edges.astype(np.int64)).cast(s.dtype).to_list()
    cats = [
        f"{_fmt_temporal(edge_vals[i])} → {_fmt_temporal(edge_vals[i + 1])}"
        for i in range(n_bins)
    ]
    indices = np.clip(np.digitize(int_arr, edges[1:-1]), 0, n_bins - 1)
    labels = [cats[indices[i]] if valid_mask[i] else None for i in range(len(s))]
    return labels, cats


def _col_filter_info(
    df: pl.DataFrame, col: str, dtype: pl.DataType, bins: int, n_cats: int
) -> tuple[str, list | None]:
    """Return (col_type, bin_edges_or_None) for frontend filter computation."""
    if dtype.is_numeric():
        arr = df.get_column(col).cast(pl.Float64, strict=False).to_numpy()
        finite = arr[~np.isnan(arr)]
        if finite.size == 0 or n_cats == 0:
            return "numeric", None
        mn, mx = float(finite.min()), float(finite.max())
        if mn == mx:
            return "numeric", [mn, mx]
        edges = np.linspace(mn, mx, n_cats + 1).tolist()
        return "numeric", edges
    if dtype.is_temporal():
        s = df.get_column(col)
        int_arr = s.cast(pl.Int64, strict=False).to_numpy().astype(float)
        valid = int_arr[~np.isnan(int_arr)]
        if valid.size == 0 or n_cats == 0:
            return "temporal", None
        mn_i, mx_i = int(valid.min()), int(valid.max())
        edge_ints = np.linspace(mn_i, mx_i, n_cats + 1).astype(np.int64)
        edge_series = pl.Series(edge_ints).cast(s.dtype, strict=False)
        return "temporal", [_fmt_temporal(v) for v in edge_series.to_list()]
    return "categorical", None


def _fmt_temporal(v: Any) -> str:
    if v is None:
        return "?"
    if hasattr(v, "isoformat"):
        s = v.isoformat()
        return s.split("T")[0] if "T" in s else s[:10]
    return str(v)
