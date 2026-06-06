"""Data layer — Polars only. Must not import from `domain`, `api`, `viz`."""

from visual_notebook.data.loader import (
    load_csv_from_bytes,
    load_from_upload,
    load_parquet_from_bytes,
)
from visual_notebook.data.schema import column_stats, infer_schema
from visual_notebook.data.types import ColumnType

__all__ = [
    "ColumnType",
    "column_stats",
    "infer_schema",
    "load_csv_from_bytes",
    "load_from_upload",
    "load_parquet_from_bytes",
]
