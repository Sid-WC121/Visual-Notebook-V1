"""Viz layer — pure `(df, params) -> dict` functions.

For chart types: returns an ECharts option dict (the frontend
`<ChartCanvas>` passes it directly to `<ReactECharts>`).
For the map: returns a payload `{kind: 'map', center, points}` consumed
by `<MapCanvas>` (Leaflet).
"""
