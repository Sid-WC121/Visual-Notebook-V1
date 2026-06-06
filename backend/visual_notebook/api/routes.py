"""HTTP routes. All return JSON; only `/export` returns a CSV stream.

Each route is a thin shell over `Controller`. Validation is done by
Pydantic on inputs; outputs are serialised by FastAPI via the response
model. Errors go to a single `HTTPException` raise so the frontend can
render them in its toast component.
"""

from __future__ import annotations

import io

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from visual_notebook.api.deps import Session, get_session
from visual_notebook.api.schemas import (
    BranchRequest,
    ColumnStatsResponse,
    ExecuteRequest,
    ExecuteResponse,
    GotoRequest,
    HistoryResponse,
    MultiExportRequest,
    NotebookExportRequest,
    NotebookImportResponse,
    OperationsCatalog,
    PreviewResponse,
    SchemaResponse,
    SessionInfo,
    UploadResponse,
)
from visual_notebook.data.schema import column_stats, schema_with_dtypes
from visual_notebook.domain.operations import operations_catalog

router = APIRouter()


@router.get("/session", response_model=SessionInfo)
def get_session_info(sess: Session = Depends(get_session)) -> SessionInfo:
    return SessionInfo(
        session_id=sess.id,
        has_data=sess.controller.has_data,
        dataset_name=sess.controller.dataset_name,
        last_error=sess.controller.last_error,
    )


@router.post("/reset")
def reset(sess: Session = Depends(get_session)) -> dict:
    sess.controller.reset()
    return {"ok": True}


@router.post("/export-notebook")
def export_notebook(
    req: NotebookExportRequest,
    sess: Session = Depends(get_session),
):
    if not sess.controller.has_data:
        raise HTTPException(status_code=400, detail="No dataset loaded.")
    data = sess.controller.export_notebook_zip(req.cells)
    name = (sess.controller.dataset_name or "notebook").rsplit(".", 1)[0] + ".nb.zip"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.post("/import-notebook", response_model=NotebookImportResponse)
async def import_notebook(
    file: UploadFile = File(...),
    sess: Session = Depends(get_session),
) -> NotebookImportResponse:
    content = await file.read()
    try:
        cells = sess.controller.import_notebook_zip(content)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    history = sess.controller.history
    assert history is not None
    return NotebookImportResponse(
        cells=cells,
        dataset_name=sess.controller.dataset_name or "imported",
        rows=history.current.count,
    )


@router.post("/upload", response_model=UploadResponse)
async def upload(
    file: UploadFile = File(...),
    sess: Session = Depends(get_session),
) -> UploadResponse:
    content = await file.read()
    sess.controller.load_dataset(file.filename or "uploaded", content)
    if sess.controller.last_error:
        raise HTTPException(status_code=400, detail=sess.controller.last_error)
    history = sess.controller.history
    assert history is not None
    return UploadResponse(
        session_id=sess.id,
        dataset_name=sess.controller.dataset_name or "",
        rows=history.current.count,
    )


def _require_history(sess: Session):
    if not sess.controller.has_data:
        raise HTTPException(status_code=400, detail="No dataset loaded.")
    return sess.controller.history  # type: ignore[return-value]


@router.get("/schema", response_model=SchemaResponse)
def schema(
    state_id: str | None = Query(None),
    sess: Session = Depends(get_session),
) -> SchemaResponse:
    _require_history(sess)
    lf = sess.controller.schema_for(state_id)
    return SchemaResponse(columns=schema_with_dtypes(lf))


@router.get("/preview", response_model=PreviewResponse)
def preview(
    n: int = 50,
    offset: int = 0,
    state_id: str | None = Query(None),
    sess: Session = Depends(get_session),
) -> PreviewResponse:
    _require_history(sess)
    payload = sess.controller.preview(n=n, offset=offset, state_id=state_id)
    if state_id:
        total = sess.controller.state_row_count(state_id)
    else:
        total = sess.controller.history.current.count  # type: ignore[union-attr]
    return PreviewResponse(
        columns=payload["columns"],
        rows=payload["rows"],
        total=total,
        shown=len(payload["rows"]),
        offset=payload["offset"],
    )


@router.get("/column-stats", response_model=ColumnStatsResponse)
def get_column_stats(
    column: str,
    state_id: str | None = Query(None),
    sess: Session = Depends(get_session),
) -> ColumnStatsResponse:
    _require_history(sess)
    lf = sess.controller.column_stats_for(column, state_id)
    try:
        stats = column_stats(lf, column)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return ColumnStatsResponse(
        column=stats.column,
        column_type=stats.column_type.value,
        null_count=stats.null_count,
        min=stats.min,
        max=stats.max,
        distinct_values=list(stats.distinct_values) if stats.distinct_values else None,
        distinct_truncated=stats.distinct_truncated,
    )


@router.get("/operations", response_model=OperationsCatalog)
def list_operations() -> OperationsCatalog:
    return OperationsCatalog(operations=operations_catalog())  # type: ignore[arg-type]


@router.post("/execute", response_model=ExecuteResponse)
def execute(
    req: ExecuteRequest, sess: Session = Depends(get_session)
) -> ExecuteResponse:
    if not sess.controller.has_data:
        raise HTTPException(status_code=400, detail="No dataset loaded.")
    try:
        result = sess.controller.execute(req.op_id, req.params, req.from_state_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc))
    return ExecuteResponse(**result)


@router.post("/goto")
def goto(req: GotoRequest, sess: Session = Depends(get_session)) -> dict:
    if not sess.controller.has_data:
        raise HTTPException(status_code=400, detail="No dataset loaded.")
    try:
        sess.controller.goto(req.state_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"current_id": req.state_id}


@router.post("/branch", response_model=ExecuteResponse)
def branch(req: BranchRequest, sess: Session = Depends(get_session)) -> ExecuteResponse:
    if not sess.controller.has_data:
        raise HTTPException(status_code=400, detail="No dataset loaded.")
    try:
        result = sess.controller.branch_from(req.state_id, req.op_id, req.params)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ExecuteResponse(kind="data", **result)


@router.get("/history", response_model=HistoryResponse)
def history_payload(sess: Session = Depends(get_session)) -> HistoryResponse:
    if not sess.controller.has_data:
        raise HTTPException(status_code=400, detail="No dataset loaded.")
    return HistoryResponse(**sess.controller.history_payload())


@router.get("/export")
def export(
    state_id: str | None = Query(None),
    sess: Session = Depends(get_session),
):
    if not sess.controller.has_data:
        raise HTTPException(status_code=400, detail="No dataset loaded.")
    data, name = sess.controller.export_csv(state_id=state_id)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.post("/export-all")
def export_all(
    req: MultiExportRequest = Body(...),
    sess: Session = Depends(get_session),
):
    if not sess.controller.has_data:
        raise HTTPException(status_code=400, detail="No dataset loaded.")
    data = sess.controller.export_all_csv_zip(req.state_ids)
    name = (sess.controller.dataset_name or "export").rsplit(".", 1)[0] + "_all.zip"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
