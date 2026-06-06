"""File loaders. Always return a `pl.LazyFrame`."""

from __future__ import annotations

import io

import polars as pl


def load_csv_from_bytes(
    content: bytes,
    *,
    separator: str = ",",
    try_parse_dates: bool = True,
    infer_schema_length: int = 10_000,
) -> pl.LazyFrame:
    """Read CSV bytes into a `LazyFrame` (via in-memory `read_csv`)."""
    df = pl.read_csv(
        io.BytesIO(content),
        separator=separator,
        try_parse_dates=try_parse_dates,
        infer_schema_length=infer_schema_length,
    )
    return df.lazy()


def load_parquet_from_bytes(content: bytes) -> pl.LazyFrame:
    return pl.read_parquet(io.BytesIO(content)).lazy()


def load_from_upload(filename: str, content: bytes) -> pl.LazyFrame:
    """Dispatch on filename extension."""
    name = filename.lower()
    if name.endswith(".csv"):
        return load_csv_from_bytes(content, separator=",")
    if name.endswith(".tsv"):
        return load_csv_from_bytes(content, separator="\t")
    if name.endswith(".parquet"):
        return load_parquet_from_bytes(content)
    raise ValueError(
        f"Unsupported file type: {filename!r} (expected .csv, .tsv, or .parquet)"
    )
