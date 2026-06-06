"""Shared chart styling — light minimalist theme.

All viz functions go through these helpers so titles, axes, tooltips,
and number formatting stay consistent across chart types.
"""

from __future__ import annotations

from typing import Any

INDIGO = "#4f46e5"
INDIGO_LIGHT = "#6366f1"
EMERALD = "#059669"
AMBER = "#d97706"
PINK = "#db2777"
TEXT = "#0f172a"        # titles, primary labels
TEXT_DIM = "#64748b"    # tick labels
TEXT_MUTE = "#94a3b8"   # subtitle / secondary
GRID = "#e5e7eb"        # split lines
AXIS = "#cbd5e1"        # axis lines

SANS = "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif"
MONO = "ui-monospace, 'SF Mono', Menlo, monospace"

# Single-hue indigo scale for the heatmap. Starts from indigo-50 so low
# cells are visible on a white panel.
HEATMAP_PALETTE = [
    "#eef2ff", "#e0e7ff", "#c7d2fe", "#a5b4fc",
    "#818cf8", "#6366f1", "#4f46e5", "#4338ca",
    "#3730a3", "#312e81", "#1e1b4b",
]


def title(text: str, subtitle: str | None = None) -> dict:
    """Bold title at the top-left, plus an optional muted subtitle.

    Subtitle is good for cardinality / range hints (e.g.
    "300 rows · 30 bins · 0 nulls") and uses ECharts' `subtext` slot
    so spacing stays consistent.
    """
    cfg: dict = {
        "text": text,
        "left": 16,
        "top": 12,
        "textStyle": {
            "color": TEXT,
            "fontSize": 14,
            "fontWeight": 600,
            "fontFamily": SANS,
        },
    }
    if subtitle:
        cfg["subtext"] = subtitle
        cfg["subtextStyle"] = {
            "color": TEXT_MUTE,
            "fontSize": 11,
            "fontFamily": SANS,
            "fontWeight": "normal",
        }
        cfg["itemGap"] = 4
    return cfg


def axis_name(label: str, gap: int = 36) -> dict:
    """Standard axis-name styling — sans-serif, medium weight, slate."""
    return {
        "name": label,
        "nameLocation": "middle",
        "nameGap": gap,
        "nameTextStyle": {
            "color": "#334155",
            "fontSize": 12,
            "fontFamily": SANS,
            "fontWeight": 500,
        },
    }


def base_grid(*, has_subtitle: bool = False) -> dict:
    """Chart-area inset. Leaves more room on top when there's a subtitle."""
    top = 70 if has_subtitle else 50
    return {"left": 60, "right": 28, "top": top, "bottom": 60, "containLabel": True}


def base_tooltip() -> dict:
    return {
        "trigger": "item",
        "backgroundColor": "#ffffff",
        "borderColor": GRID,
        "borderWidth": 1,
        "padding": [8, 12],
        "textStyle": {"color": TEXT, "fontSize": 12, "fontFamily": SANS},
        "extraCssText": "box-shadow: 0 4px 12px rgba(15,23,42,0.08); border-radius: 8px;",
    }


def axis_style() -> dict:
    return {
        "axisLine": {"lineStyle": {"color": AXIS}},
        "axisLabel": {"color": TEXT_DIM, "fontSize": 11, "fontFamily": SANS},
        "axisTick": {"lineStyle": {"color": AXIS}},
        "splitLine": {"lineStyle": {"color": GRID, "opacity": 1}},
    }


# ── number / value formatting ──────────────────────────────────────────

def fmt_num(v: float) -> str:
    """Compact human number — '1.5k', '2.3M', '0.045', '1.2e-08'."""
    av = abs(v)
    if av == 0:
        return "0"
    if av >= 1e9:
        return f"{v / 1e9:.2f}B"
    if av >= 1e6:
        return f"{v / 1e6:.2f}M"
    if av >= 1e3:
        return f"{v / 1e3:.2f}k"
    if av < 1e-3:
        return f"{v:.2e}"
    return f"{v:.3g}"


def fmt_count(n: int | float) -> str:
    """Compact count like '300', '1.2k', '4.5M'."""
    n = int(n)
    if n < 1_000:
        return str(n)
    if n < 1_000_000:
        return f"{n / 1_000:.1f}k"
    return f"{n / 1_000_000:.1f}M"


def maybe_pluralise(n: int, word: str) -> str:
    return f"{fmt_count(n)} {word}{'' if n == 1 else 's'}"
