"""Column type classification used by dialogs, palette, and viz."""

from __future__ import annotations

from enum import Enum

import polars as pl


class ColumnType(str, Enum):
    NUMERIC = "numeric"
    CATEGORICAL = "categorical"
    TEMPORAL = "temporal"
    BOOLEAN = "boolean"
    OTHER = "other"


def classify(dtype: pl.DataType) -> ColumnType:
    """Map a Polars dtype to a `ColumnType`."""
    if dtype.is_numeric():
        return ColumnType.NUMERIC
    if dtype == pl.Boolean:
        return ColumnType.BOOLEAN
    if dtype.is_temporal():
        return ColumnType.TEMPORAL
    if dtype in (pl.Utf8, pl.Categorical, pl.Enum):
        return ColumnType.CATEGORICAL
    return ColumnType.OTHER
