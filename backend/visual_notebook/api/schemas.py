"""Pydantic request / response schemas — the contract shared with the frontend."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SessionInfo(BaseModel):
    session_id: str
    has_data: bool
    dataset_name: str | None = None
    last_error: str | None = None


class UploadResponse(BaseModel):
    session_id: str
    dataset_name: str
    rows: int
    last_error: str | None = None


class SchemaColumn(BaseModel):
    name: str
    type: str
    dtype: str


class SchemaResponse(BaseModel):
    columns: list[SchemaColumn]


class PreviewResponse(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    total: int
    shown: int
    offset: int = 0


class ColumnStatsResponse(BaseModel):
    column: str
    column_type: str
    null_count: int
    min: Any | None = None
    max: Any | None = None
    distinct_values: list[Any] | None = None
    distinct_truncated: bool = False


class ParamSpecModel(BaseModel):
    name: str
    kind: str
    label: str
    options: list[str] | None = None
    default: Any = None
    depends_on: str | None = None


class OperationModel(BaseModel):
    id: str
    label: str
    menu: str
    kind: str
    params: list[ParamSpecModel]


class OperationsCatalog(BaseModel):
    operations: list[OperationModel]


class ExecuteRequest(BaseModel):
    op_id: str
    params: dict = Field(default_factory=dict)
    from_state_id: str | None = None


class BranchRequest(BaseModel):
    state_id: str
    op_id: str
    params: dict = Field(default_factory=dict)


class GotoRequest(BaseModel):
    state_id: str


class MultiExportRequest(BaseModel):
    state_ids: list[str]


class StateNode(BaseModel):
    id: str
    description: str
    count: int
    parent_id: str | None
    is_current: bool


class NotebookExportRequest(BaseModel):
    cells: list[dict]


class NotebookImportResponse(BaseModel):
    cells: list[dict]
    dataset_name: str
    rows: int


class HistoryResponse(BaseModel):
    current_id: str
    lineage_ids: list[str]
    states: list[StateNode]


class ExecuteResponse(BaseModel):
    """Polymorphic — holds either a new state, a chart, or a view payload."""
    kind: str
    state_id: str | None = None
    description: str | None = None
    count: int | None = None
    spec: dict | None = None
    payload: dict | None = None


class ErrorResponse(BaseModel):
    detail: str
