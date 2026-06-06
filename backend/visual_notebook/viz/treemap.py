"""Treemap chart — ECharts `treemap` series."""

from __future__ import annotations

import polars as pl

from visual_notebook.viz._common import (
    base_tooltip,
    maybe_pluralise,
    title,
)

def treemap(df: pl.DataFrame, params: dict) -> dict:
    col: str = params["column"]
    val_col: str | None = params.get("value")

    cols = [col]
    if val_col:
        cols.append(val_col)

    sub = df.select(cols).drop_nulls()

    total = len(df)
    plotted = len(sub)
    dropped = total - plotted

    if val_col:
        grouped = sub.group_by(col).agg(pl.col(val_col).sum().alias("v"))
        val_label = f"Sum of {val_col}"
    else:
        grouped = sub.group_by(col).len(name="v")
        val_label = "Count"

    grouped = grouped.sort("v", descending=True)
    
    data = [
        {"name": str(row[0]), "value": row[1]}
        for row in grouped.iter_rows()
    ]

    subtitle_parts = [maybe_pluralise(plotted, "row")]
    if dropped:
        subtitle_parts.append(f"{dropped} dropped (null)")

    return {
        "title": title(f"Treemap: {col} by {val_label}", " · ".join(subtitle_parts)),
        "tooltip": {
            **base_tooltip(),
            "formatter": "{b}: {c}"
        },
        "series": [{
            "type": "treemap",
            "data": data,
            "roam": False,
            "label": {
                "show": True,
                "formatter": "{b}\n{c}"
            },
            "itemStyle": {
                "borderColor": "#fff",
                "borderWidth": 1,
                "gapWidth": 1
            }
        }],
        "_column": col,
        "_value": val_col,
    }
