"""Stacked Bar chart — ECharts `bar` series with stack."""

from __future__ import annotations

import polars as pl

from visual_notebook.viz._common import (
    axis_name,
    axis_style,
    base_grid,
    base_tooltip,
    maybe_pluralise,
    title,
)

def bar_stacked(df: pl.DataFrame, params: dict) -> dict:
    x_col: str = params["x"]
    by_col: str = params["by"]
    y_col: str | None = params.get("y")

    cols = [x_col, by_col]
    if y_col:
        cols.append(y_col)

    sub = df.select(cols).drop_nulls()

    total = len(df)
    plotted = len(sub)
    dropped = total - plotted

    if y_col:
        grouped = sub.group_by([x_col, by_col]).agg(pl.col(y_col).sum().alias("v"))
        val_label = f"Sum of {y_col}"
    else:
        grouped = sub.group_by([x_col, by_col]).len(name="v")
        val_label = "Count"

    # Pivot to get x_col as rows and by_col as columns
    try:
        pivoted = grouped.pivot(values="v", index=x_col, on=by_col, aggregate_function="first")
    except AttributeError:
        # Fallback for older Polars API
        pivoted = grouped.pivot(values="v", index=x_col, columns=by_col, aggregate_function="first")
        
    pivoted = pivoted.sort(x_col)
    pivoted = pivoted.fill_null(0)

    x_data = pivoted.get_column(x_col).to_list()
    series_cols = [c for c in pivoted.columns if c != x_col]

    series = []
    for s in series_cols:
        series.append({
            "name": str(s),
            "type": "bar",
            "stack": "total",
            "emphasis": {
                "focus": "series"
            },
            "data": pivoted.get_column(s).to_list()
        })

    subtitle_parts = [maybe_pluralise(plotted, "row")]
    if dropped:
        subtitle_parts.append(f"{dropped} dropped (null)")

    return {
        "title": title(f"Stacked Bar: {x_col} by {by_col}", " · ".join(subtitle_parts)),
        "grid": base_grid(has_subtitle=True),
        "tooltip": {**base_tooltip(), "trigger": "axis"},
        "legend": {
            "type": "scroll",
            "bottom": 10,
            "textStyle": {"color": "#64748b"}
        },
        "xAxis": {
            "type": "category",
            "data": [str(x) for x in x_data],
            **axis_name(x_col, gap=36),
            **axis_style()
        },
        "yAxis": {"type": "value", **axis_name(val_label, gap=44), **axis_style()},
        "series": series,
        "dataZoom": [
            {
                "type": "slider",
                "xAxisIndex": 0,
                "bottom": 40,
                "height": 15,
                "show": len(x_data) > 15,
                "start": 0,
                "end": min(100, (15 / max(1, len(x_data)) * 100)) if len(x_data) > 15 else 100
            },
            {
                "type": "inside",
                "xAxisIndex": 0,
                "disabled": len(x_data) <= 15
            }
        ],
        "_x": x_col,
        "_by": by_col,
        "_y": y_col,
    }