"""Scatter plot — ECharts `scatter` series."""

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


def scatter(df: pl.DataFrame, params: dict) -> dict:
    x_col: str = params["x"]
    y_col: str = params["y"]

    raw = df.select([x_col, y_col])
    total = len(raw)
    sub = raw.drop_nulls()
    plotted = len(sub)
    dropped = total - plotted

    points = list(zip(
        sub.get_column(x_col).to_list(),
        sub.get_column(y_col).to_list(),
    ))

    subtitle_parts = [maybe_pluralise(plotted, "point")]
    if dropped:
        subtitle_parts.append(f"{dropped} dropped (null)")

    return {
        "title": title(f"{y_col} vs {x_col}", " · ".join(subtitle_parts)),
        "grid": base_grid(has_subtitle=True),
        # Default ECharts scatter tooltip shows "(x, y)" via {c}.
        "tooltip": base_tooltip(),
        "xAxis": {"type": "value", **axis_name(x_col), **axis_style()},
        "yAxis": {"type": "value", **axis_name(y_col, gap=44), **axis_style()},
        "series": [{
            "type": "scatter",
            "data": points,
            "symbolSize": 7,
            "itemStyle": {
                "color": INDIGO_LIGHT,
                "opacity": 0.65,
                "borderColor": "#4f46e5",
                "borderWidth": 0.5,
            },
        }],
        "_x": x_col,
        "_y": y_col,
    }
