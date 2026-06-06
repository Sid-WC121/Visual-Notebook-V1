"""Histogram — ECharts `bar` series with manually computed bins."""

from __future__ import annotations

import numpy as np
import polars as pl

from visual_notebook.viz._common import (
    INDIGO,
    SANS,
    axis_name,
    axis_style,
    base_grid,
    base_tooltip,
    fmt_count,
    fmt_num,
    maybe_pluralise,
    title,
)


def histogram(df: pl.DataFrame, params: dict) -> dict:
    column: str = params["column"]
    bins: int = max(2, int(params.get("bins", 30)))

    raw = df.get_column(column)
    nulls = int(raw.null_count())
    values = raw.drop_nulls().to_numpy()
    if values.size == 0:
        return _empty(f"Histogram of {column}", "no values")

    counts, edges = np.histogram(values, bins=bins)
    labels = [f"{fmt_num(edges[i])} – {fmt_num(edges[i + 1])}" for i in range(bins)]

    subtitle_parts = [
        f"{bins} bins",
        maybe_pluralise(int(values.size), "value"),
    ]
    if nulls:
        subtitle_parts.append(f"{fmt_count(nulls)} null{'' if nulls == 1 else 's'}")

    return {
        "title": title(f"Histogram of {column}", " · ".join(subtitle_parts)),
        "grid": base_grid(has_subtitle=True),
        "tooltip": {**base_tooltip(), "trigger": "axis"},
        "xAxis": {
            "type": "category",
            "data": labels,
            **axis_name(column, gap=46),
            "axisLabel": {
                "interval": _label_interval(bins),
                "rotate": 30,
                "color": "#64748b",
                "fontSize": 10,
                "fontFamily": SANS,
            },
            **{k: v for k, v in axis_style().items() if k != "axisLabel"},
        },
        "yAxis": {
            "type": "value",
            **axis_name("count"),
            **axis_style(),
        },
        "series": [{
            "type": "bar",
            "data": counts.tolist(),
            "itemStyle": {"color": INDIGO, "borderRadius": [4, 4, 0, 0]},
            "barCategoryGap": "12%",
        }],
        "_binEdges": edges.tolist(),
        "_column": column,
    }


def _label_interval(bins: int) -> int:
    """Show roughly 12 axis labels max — skip every Nth for higher bin counts."""
    return max(0, bins // 12)


def _empty(title_text: str, subtitle: str) -> dict:
    return {
        "title": title(title_text, subtitle),
        "graphic": [{
            "type": "text",
            "left": "center", "top": "middle",
            "style": {
                "text": "no data",
                "fill": "#94a3b8",
                "font": "12px ui-monospace, Menlo, monospace",
            },
        }],
    }
