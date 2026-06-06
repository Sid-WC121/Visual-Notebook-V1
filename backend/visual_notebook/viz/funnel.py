"""Funnel chart — ECharts `funnel` series."""

from __future__ import annotations

import polars as pl

from visual_notebook.viz._common import (
    base_tooltip,
    maybe_pluralise,
    title,
)

COLORS = [
    "#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#ec4899", "#f97316", "#84cc16", "#06b6d4"
]

def funnel(df: pl.DataFrame, params: dict) -> dict:
    col: str = params["column"]
    try:
        n: int = int(params.get("n", 5))
    except (ValueError, TypeError):
        n = 5

    raw = df.select([col]).drop_nulls()
    total = len(df)
    plotted = len(raw)
    dropped = total - plotted

    # Count frequencies, sort descending
    counts = (
        raw.group_by(col)
        .len(name="count")
        .sort("count", descending=True)
    )
    
    top = counts.head(n)

    data = [
        {"name": str(row[0]), "value": row[1]}
        for row in top.iter_rows()
    ]

    subtitle_parts = [maybe_pluralise(plotted, "row"), f"Top {n}"]
    if dropped:
        subtitle_parts.append(f"{dropped} dropped (null)")

    return {
        "title": title(f"Funnel of {col}", " · ".join(subtitle_parts)),
        "tooltip": {
            **base_tooltip(),
            "trigger": "item",
            "formatter": "{b} : {c} ({d}%)"
        },
        "legend": {
            "orient": "vertical",
            "right": 10,
            "top": "middle",
            "bottom": 20,
            "textStyle": {"color": "#64748b", "fontSize": 12, "fontFamily": "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif"}
        },
        "series": [{
            "name": col,
            "type": "funnel",
            "left": "5%",
            "width": "65%",
            "label": {
                "position": "inside",
                "formatter": "{b}",
                "color": "#fff",
                "fontSize": 12,
                "fontWeight": "bold"
            },
            "itemStyle": {
                "borderColor": "#fff",
                "borderWidth": 1
            },
            "color": COLORS,
            "data": data,
        }],
        "_column": col,
    }
