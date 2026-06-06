"""Pie chart — ECharts `pie` series."""

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

def pie(df: pl.DataFrame, params: dict) -> dict:
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
    
    # take top N
    top = counts.head(n)
    
    # sum the rest for 'Other' if there are more categories
    if len(counts) > n:
        other_count = counts.tail(len(counts) - n).select(pl.col("count").sum()).item()
        other_row = pl.DataFrame({col: ["Other"], "count": [other_count]}, schema=top.schema)
        top = pl.concat([top, other_row])

    data = [
        {"name": str(row[0]), "value": row[1]}
        for row in top.iter_rows()
    ]

    subtitle_parts = [maybe_pluralise(plotted, "row")]
    if dropped:
        subtitle_parts.append(f"{dropped} dropped (null)")

    return {
        "title": title(f"Top {n} in {col}", " · ".join(subtitle_parts)),
        "tooltip": {
            **base_tooltip(),
            "formatter": "{b}: {c} ({d}%)"
        },
        "legend": {
            "orient": "vertical",
            "right": 10,
            "top": "middle",
            "bottom": 20,
            "textStyle": {"color": "#64748b", "fontSize": 12, "fontFamily": "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif"}
        },
        "series": [{
            "type": "pie",
            "radius": ["40%", "70%"],
            "center": ["40%", "50%"],
            "avoidLabelOverlap": False,
            "itemStyle": {
                "borderRadius": 5,
                "borderColor": "#fff",
                "borderWidth": 2
            },
            "color": COLORS,
            "label": {"show": False, "position": "center"},
            "emphasis": {
                "label": {
                    "show": True,
                    "fontSize": 20,
                    "fontWeight": "bold",
                    "formatter": "{b}\n{d}%"
                }
            },
            "labelLine": {"show": False},
            "data": data,
        }],
        "_column": col,
    }