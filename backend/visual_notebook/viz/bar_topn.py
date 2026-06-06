"""Top-N bar chart — horizontal bars with value labels at the bar end."""

from __future__ import annotations

import polars as pl

from visual_notebook.viz._common import (
    INDIGO,
    MONO,
    SANS,
    axis_name,
    axis_style,
    base_grid,
    base_tooltip,
    fmt_count,
    title,
)


def bar_topn(df: pl.DataFrame, params: dict) -> dict:
    column: str = params["column"]
    n: int = max(1, int(params.get("n", 10)))

    counts = (
        df.group_by(column)
          .agg(pl.len().alias("count"))
          .sort("count", descending=True)
    )
    total_distinct = len(counts)
    top = counts.head(n)
    cats = top.get_column(column).cast(pl.Utf8).to_list()
    vals = top.get_column("count").to_list()

    # Reverse for horizontal layout: largest at the top of the chart.
    cats = cats[::-1]
    vals = vals[::-1]

    shown = len(cats)
    subtitle = (
        f"of {total_distinct} distinct {'value' if total_distinct == 1 else 'values'} · "
        f"counting rows"
    )

    return {
        "title": title(f"Top {shown} · {column}", subtitle),
        "grid": {**base_grid(has_subtitle=True), "left": 130, "right": 60},
        "tooltip": {**base_tooltip(), "trigger": "axis"},
        "xAxis": {"type": "value", **axis_name("count"), **axis_style()},
        "yAxis": {
            "type": "category",
            "data": cats,
            "axisLabel": {
                "color": "#0f172a",
                "fontSize": 12,
                "fontFamily": MONO,
            },
            **{k: v for k, v in axis_style().items() if k != "axisLabel"},
        },
        "series": [{
            "type": "bar",
            "data": vals,
            "itemStyle": {"color": INDIGO, "borderRadius": [0, 5, 5, 0]},
            "barCategoryGap": "30%",
            # Value at the right end of each bar.
            "label": {
                "show": True,
                "position": "right",
                "formatter": "{c}",
                "color": "#334155",
                "fontSize": 11,
                "fontFamily": SANS,
                "fontWeight": "500",
            },
        }],
        "dataZoom": [
            {
                "type": "slider",
                "yAxisIndex": 0,
                "right": 10,
                "width": 15,
                "show": shown > 15,
                "start": max(0, 100 - (15 / shown * 100)) if shown > 15 else 0,
                "end": 100
            },
            {
                "type": "inside",
                "yAxisIndex": 0,
                "disabled": shown <= 15
            }
        ],
        "_column": column,
    }


# Re-exported for tests / ad-hoc callers — silence the "imported but
# unused" linter complaint.
_ = fmt_count
