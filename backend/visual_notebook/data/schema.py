"""Schema inspection — used by dialogs and the API layer."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Any

import polars as pl

from visual_notebook.data.types import ColumnType, classify

MAX_DISTINCT_VALUES = 50


@dataclass(frozen=True)
class ColumnStats:
    column: str
    column_type: ColumnType
    null_count: int
    min: Any | None = None
    max: Any | None = None
    distinct_values: tuple[Any, ...] | None = None
    distinct_truncated: bool = False


def infer_schema(lf: pl.LazyFrame) -> dict[str, ColumnType]:
    return {name: classify(dt) for name, dt in lf.collect_schema().items()}


def schema_with_dtypes(lf: pl.LazyFrame) -> list[dict[str, str]]:
    """Schema as list of dicts — convenient for the API."""
    out: list[dict[str, str]] = []
    for name, dt in lf.collect_schema().items():
        out.append(
            {"name": name, "type": classify(dt).value, "dtype": str(dt)}
        )
    return out


def column_stats(lf: pl.LazyFrame, column: str) -> ColumnStats:
    """Compute summary stats for a single column. One small `collect()`."""
    schema = lf.collect_schema()
    if column not in schema:
        raise KeyError(f"Column not in schema: {column!r}")

    dtype = schema[column]
    ctype = classify(dtype)
    col = pl.col(column)

    if ctype in (ColumnType.NUMERIC, ColumnType.TEMPORAL):
        row = lf.select(
            col.min().alias("min"),
            col.max().alias("max"),
            col.null_count().alias("nulls"),
        ).collect().row(0, named=True)
        return ColumnStats(
            column=column,
            column_type=ctype,
            null_count=int(row["nulls"]),
            min=_unwrap(row["min"]),
            max=_unwrap(row["max"]),
        )

    if ctype in (ColumnType.CATEGORICAL, ColumnType.BOOLEAN):
        distinct_lf = (
            lf.select(col)
            .drop_nulls()
            .unique()
            .sort(column)
            .limit(MAX_DISTINCT_VALUES + 1)
        )
        values = distinct_lf.collect().get_column(column).to_list()
        truncated = len(values) > MAX_DISTINCT_VALUES
        if truncated:
            values = values[:MAX_DISTINCT_VALUES]
        nulls = lf.select(col.null_count().alias("n")).collect().item()
        return ColumnStats(
            column=column,
            column_type=ctype,
            null_count=int(nulls),
            distinct_values=tuple(values),
            distinct_truncated=truncated,
        )

    nulls = lf.select(col.null_count().alias("n")).collect().item()
    return ColumnStats(column=column, column_type=ctype, null_count=int(nulls))


def _unwrap(value: Any) -> Any:
    if isinstance(value, (date, datetime, time)):
        return value.isoformat()
    return value
