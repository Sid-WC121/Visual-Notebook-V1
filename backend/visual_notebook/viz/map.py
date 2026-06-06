"""Map payload — a list of points the frontend renders with Leaflet."""

from __future__ import annotations

import polars as pl

LAT_CANDIDATES = ("lat", "latitude")
LON_CANDIDATES = ("lon", "lng", "long", "longitude")


def map_payload(df: pl.DataFrame, params: dict) -> dict:
    lat_col = params.get("lat") or _auto(df.columns, LAT_CANDIDATES)
    lon_col = params.get("lon") or _auto(df.columns, LON_CANDIDATES)
    if lat_col is None or lon_col is None:
        return {"kind": "map", "error": "No latitude/longitude columns detected.",
                "points": [], "center": None}

    sub = df.select([lat_col, lon_col]).drop_nulls()
    points = list(zip(
        sub.get_column(lat_col).to_list(),
        sub.get_column(lon_col).to_list(),
    ))
    cap = int(params.get("max_points", 5_000))
    if len(points) > cap:
        points = points[:cap]
    if not points:
        return {"kind": "map", "points": [], "center": None}

    center = (
        sum(p[0] for p in points) / len(points),
        sum(p[1] for p in points) / len(points),
    )
    return {
        "kind": "map",
        "lat_col": lat_col,
        "lon_col": lon_col,
        "center": list(center),
        "points": [[float(la), float(lo)] for la, lo in points],
    }


def _auto(columns: list[str], candidates: tuple[str, ...]) -> str | None:
    lower = {c.lower(): c for c in columns}
    for c in candidates:
        if c in lower:
            return lower[c]
    return None
