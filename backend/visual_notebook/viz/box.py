"""Box plot — ECharts `boxplot` series."""

from __future__ import annotations

import polars as pl

from visual_notebook.viz._common import (
    INDIGO_LIGHT,
    axis_name,
    axis_style,
    base_grid,
    base_tooltip,
    maybe_pluralise,
    title,
)

def boxplot(df: pl.DataFrame, params: dict) -> dict:
    col: str = params["column"]
    group_by: str | None = params.get("by")

    sub = df.select([c for c in (col, group_by) if c]).drop_nulls()
    
    total = len(df)
    plotted = len(sub)
    dropped = total - plotted

    subtitle_parts = [maybe_pluralise(plotted, "row")]
    if dropped:
        subtitle_parts.append(f"{dropped} dropped (null)")

    categories = []
    box_data = []

    if group_by:
        # Grouped box plot
        groups = sub.group_by(group_by)
        for name, group_df in groups:
            # Polars group keys are tuples, extract the first element
            group_name = name[0] if isinstance(name, tuple) else name
            categories.append(str(group_name))
            series_col = group_df.get_column(col)
            
            if len(series_col) == 0:
                box_data.append([0, 0, 0, 0, 0])
                continue
            
            mn = series_col.min()
            q1 = series_col.quantile(0.25)
            med = series_col.median()
            q3 = series_col.quantile(0.75)
            mx = series_col.max()
            box_data.append([mn, q1, med, q3, mx])
    else:
        # Single box plot
        categories.append(col)
        series_col = sub.get_column(col)
        box_data.append([
            series_col.min(),
            series_col.quantile(0.25),
            series_col.median(),
            series_col.quantile(0.75),
            series_col.max()
        ])

    return {
        "title": title(f"Box Plot: {col}" + (f" by {group_by}" if group_by else ""), " · ".join(subtitle_parts)),
        "grid": base_grid(has_subtitle=True),
        "tooltip": {
            **base_tooltip(),
            "formatter": (
                "<b>{b}</b><br/>"
                "Max: {c5}<br/>"
                "Q3: {c4}<br/>"
                "Median: {c3}<br/>"
                "Q1: {c2}<br/>"
                "Min: {c1}"
            )
        },
        "xAxis": {
            "type": "category",
            "data": categories,
            **({"name": group_by, "nameLocation": "middle", "nameGap": 36, "nameTextStyle": {"color": "#334155"}} if group_by else {}),
            **axis_style()
        },
        "yAxis": {"type": "value", **axis_name(col, gap=44), **axis_style()},
        "dataset": [
            {
                "source": box_data
            }
        ],
        "series": [{
            "type": "boxplot",
            "datasetIndex": 0,
            "itemStyle": {
                "color": "#e0e7ff",
                "borderColor": INDIGO_LIGHT,
                "borderWidth": 1.5,
            },
        }],
        "dataZoom": [
            {
                "type": "slider",
                "xAxisIndex": 0,
                "bottom": 10,
                "height": 15,
                "show": len(categories) > 15,
                "start": 0,
                "end": min(100, (15 / max(1, len(categories)) * 100)) if len(categories) > 15 else 100
            },
            {
                "type": "inside",
                "xAxisIndex": 0,
                "disabled": len(categories) <= 15
            }
        ],
        "_column": col,
        "_by": group_by,
    }