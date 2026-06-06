"""Area chart — ECharts `line` series with `areaStyle` over a temporal x-axis."""

from __future__ import annotations

import polars as pl

from visual_notebook.viz.timeline import _iso, _short_date
from visual_notebook.viz._common import (
    INDIGO,
    INDIGO_LIGHT,
    axis_name,
    axis_style,
    base_grid,
    base_tooltip,
    maybe_pluralise,
    title,
)

def area(df: pl.DataFrame, params: dict) -> dict:
    x_col: str = params["x"]
    y_col: str = params["y"]

    raw = df.select([x_col, y_col]).drop_nulls()
    sub = raw.sort(x_col)
    xs_native = sub.get_column(x_col).to_list()
    xs = [_iso(v) for v in xs_native]
    ys = sub.get_column(y_col).to_list()
    points = list(zip(xs, ys))
    n = len(points)

    subtitle_parts = [maybe_pluralise(n, "point")]
    if xs_native:
        subtitle_parts.append(f"{_short_date(xs_native[0])} → {_short_date(xs_native[-1])}")

    return {
        "title": title(f"{y_col} area over {x_col}", " · ".join(subtitle_parts)),
        "grid": base_grid(has_subtitle=True),
        "tooltip": {**base_tooltip(), "trigger": "axis"},
        "xAxis": {"type": "time", **axis_name(x_col), **axis_style()},
        "yAxis": {"type": "value", **axis_name(y_col, gap=44), **axis_style()},
        "series": [{
            "type": "line",
            "data": points,
            "lineStyle": {"color": INDIGO, "width": 2},
            "itemStyle": {"color": INDIGO},
            "areaStyle": {
                "color": {
                    "type": "linear",
                    "x": 0, "y": 0, "x2": 0, "y2": 1,
                    "colorStops": [
                        {"offset": 0, "color": INDIGO_LIGHT},
                        {"offset": 1, "color": "rgba(99, 102, 241, 0.05)"}
                    ]
                }
            },
            "symbol": "circle",
            "symbolSize": 2,
            "smooth": True,
        }],
        "_x": x_col,
        "_y": y_col,
    }
