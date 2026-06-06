"""Controller — owns one `History` per session.

Pure Python service object: no FastAPI imports. The API layer wraps
this with HTTP-aware dependencies; tests instantiate it directly.
"""

from __future__ import annotations

import io
import json
import uuid
import zipfile
from typing import Any

import polars as pl

from visual_notebook.data.loader import load_from_upload
from visual_notebook.domain.history import History
from visual_notebook.domain.operations import (
    format_description,
    get_operation,
)


class Controller:
    def __init__(self) -> None:
        self.history: History | None = None
        self.dataset_name: str | None = None
        self.raw_dataset: bytes | None = None
        self.last_chart: dict | None = None
        self.last_error: str | None = None

    @property
    def has_data(self) -> bool:
        return self.history is not None

    def load_dataset(self, filename: str, content: bytes) -> None:
        try:
            lf = load_from_upload(filename, content)
            lf.collect_schema()  # validate schema is readable
        except Exception as exc:  # noqa: BLE001
            self.last_error = f"{type(exc).__name__}: {exc}"
            return
        self.history = History(lf, f"Loaded: {filename}")
        self.dataset_name = filename
        self.raw_dataset = content
        self.last_chart = None
        self.last_error = None

    def reset(self) -> None:
        self.history = None
        self.dataset_name = None
        self.raw_dataset = None
        self.last_chart = None
        self.last_error = None

    def _require_history(self) -> History:
        if self.history is None:
            raise RuntimeError("No dataset loaded.")
        return self.history

    def execute(self, op_id: str, params: dict, from_state_id: str | None = None) -> dict[str, Any]:
        """Run an operation. Returns a structured payload describing the result."""
        history = self._require_history()
        if from_state_id is not None:
            history.goto(from_state_id)
        op = get_operation(op_id)
        try:
            if op.kind == "data":
                state = history.apply(
                    lambda lf: op.apply(lf, params),
                    description=format_description(op, params),
                )
                self.last_error = None
                return {
                    "kind": "data",
                    "state_id": state.id,
                    "description": state.description,
                    "count": state.count,
                }
            if op.kind == "viz":
                df = history.current.lf.collect()
                spec = op.apply(df, params)
                self.last_chart = spec
                self.last_error = None
                return {"kind": "viz", "spec": spec}
            if op.kind == "view":
                lf = history.current.lf
                payload = op.apply(lf, params)
                self.last_chart = payload
                self.last_error = None
                return {"kind": "view", "payload": payload}
            raise ValueError(f"Unknown op kind: {op.kind!r}")
        except Exception as exc:  # noqa: BLE001
            self.last_error = f"{type(exc).__name__}: {exc}"
            raise

    def goto(self, state_id: str) -> None:
        self._require_history().goto(state_id)

    def branch_from(self, state_id: str, op_id: str, params: dict) -> dict:
        history = self._require_history()
        op = get_operation(op_id)
        if op.kind != "data":
            raise ValueError("Only data ops can branch.")
        state = history.branch_from(
            state_id,
            lambda lf: op.apply(lf, params),
            description=format_description(op, params),
        )
        return {
            "state_id": state.id,
            "description": state.description,
            "count": state.count,
        }

    def _clean_desc(self, text: str) -> str:
        """Utility to turn a description into a filesystem-safe string."""
        import re
        clean = re.sub(r"[^a-zA-Z0-9\s_-]", "", text)
        clean = re.sub(r"[\s_-]+", "_", clean).strip("_")
        return clean or "export"

    def export_csv(self, state_id: str | None = None) -> tuple[bytes, str]:
        """Return CSV bytes and a suggested filename."""
        history = self._require_history()
        state = history.find(state_id) if state_id else history.current
        df = state.lf.collect()
        buf = df.write_csv()

        name = self._clean_desc(state.description)
        return (buf.encode("utf-8") if isinstance(buf, str) else buf), f"{name}.csv"

    def export_all_csv_zip(self, state_ids: list[str]) -> bytes:
        """Create a ZIP containing CSVs for all requested state IDs."""
        history = self._require_history()
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i, sid in enumerate(state_ids):
                state = history.find(sid)
                df = state.lf.collect()
                clean_desc = self._clean_desc(state.description)
                filename = f"{i+1:02d}_{clean_desc}.csv"
                zf.writestr(filename, df.write_csv())
        return buf.getvalue()

    def _cell_source_state_id(self, cell: dict) -> str | None:
        if cell.get("type") == "table":
            return cell.get("stateId")
        if cell.get("type") == "chart":
            return cell.get("sourceStateId")
        return None

    def export_notebook_zip(self, cells: list[dict]) -> bytes:
        """Create a ZIP containing the raw dataset and the cells 'recipe'."""
        if not self.raw_dataset or not self.dataset_name:
            raise ValueError("No dataset loaded to export.")

        simplified_cells = []
        previous_source_state_id: str | None = None
        original_chain_by_state_id: dict[str, list[dict]] = {}
        for index, cell in enumerate(cells):
            cell_type = cell.get("type")
            if cell_type == "table":
                parent_source_state_id = previous_source_state_id if index > 0 else None
                state_id = cell.get("stateId")
                if state_id:
                    try:
                        state = self._require_history().find(state_id)
                        parent_source_state_id = state.parent.id if state.parent else None
                    except KeyError:
                        pass
                op_chain = cell.get("opChain", [])
                parent_chain = original_chain_by_state_id.get(parent_source_state_id or "")
                if parent_chain and op_chain[: len(parent_chain)] == parent_chain:
                    op_chain = op_chain[len(parent_chain):]
                simplified_cells.append(
                    {
                        "type": "table",
                        "id": cell.get("id"),
                        "stateId": state_id,
                        "parentSourceStateId": parent_source_state_id,
                        "opChain": op_chain,
                        "meta": cell.get("meta"),
                    }
                )
                if state_id:
                    original_chain_by_state_id[state_id] = cell.get("opChain", [])
            elif cell_type == "chart":
                simplified_cells.append(
                    {
                        "type": "chart",
                        "id": cell.get("id"),
                        "opId": cell.get("opId"),
                        "opParams": cell.get("opParams"),
                        "sourceStateId": cell.get("sourceStateId"),
                        "timelineRange": cell.get("timelineRange"),
                    }
                )
            previous_source_state_id = self._cell_source_state_id(cell) or previous_source_state_id

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(self.dataset_name, self.raw_dataset)
            recipe = {
                "version": 3,
                "dataset_filename": self.dataset_name,
                "cells": simplified_cells,
            }
            zf.writestr("notebook.json", json.dumps(recipe))

        return buf.getvalue()

    def import_notebook_zip(self, zip_content: bytes) -> list[dict]:
        """Restore a notebook from a ZIP. Returns the cells to be restored in the frontend."""
        buf = io.BytesIO(zip_content)
        with zipfile.ZipFile(buf, "r") as zf:
            names = zf.namelist()
            if "notebook.json" not in names:
                raise ValueError("ZIP is not a valid notebook (missing notebook.json).")

            recipe = json.loads(zf.read("notebook.json"))
            version = recipe.get("version", 1)
            filename = recipe["dataset_filename"]
            if filename not in names:
                raise ValueError(f"ZIP is missing the dataset file: {filename}")

            dataset_bytes = zf.read(filename)
            self.load_dataset(filename, dataset_bytes)

            cells = recipe.get("cells", [])
            if not cells:
                return []

            root_id = self.history.root.id  # type: ignore[union-attr]
            prefix_cache: dict[tuple, str] = {(): root_id}
            old_to_new: dict[str, str] = {}
            previous_source_state_id = root_id
            previous_table_chain: list[dict] = []

            restored_cells = []

            for cell in cells:
                if cell["type"] == "table":
                    op_chain = cell.get("opChain", [])
                    old_id = cell.get("stateId")

                    if not op_chain:
                        last_state_id = root_id
                    elif version >= 3:
                        parent_old_state = cell.get("parentSourceStateId")
                        last_state_id = old_to_new.get(parent_old_state, previous_source_state_id)
                        for op in op_chain:
                            res = self.execute(
                                op["op_id"],
                                op.get("params", {}),
                                from_state_id=last_state_id,
                            )
                            last_state_id = res["state_id"]
                    else:
                        is_absolute_chain = (
                            not previous_table_chain
                            or op_chain[: len(previous_table_chain)] == previous_table_chain
                        )
                        if is_absolute_chain:
                            current_prefix = []
                            last_state_id = root_id
                            for op in op_chain:
                                op_id = op["op_id"]
                                params = op.get("params", {})
                                current_prefix.append((op_id, json.dumps(params, sort_keys=True)))
                                prefix_key = tuple(current_prefix)
                                if prefix_key in prefix_cache:
                                    last_state_id = prefix_cache[prefix_key]
                                else:
                                    res = self.execute(op_id, params, from_state_id=last_state_id)
                                    last_state_id = res["state_id"]
                                    prefix_cache[prefix_key] = last_state_id
                        else:
                            last_state_id = previous_source_state_id
                            for op in op_chain:
                                res = self.execute(
                                    op["op_id"],
                                    op.get("params", {}),
                                    from_state_id=last_state_id,
                                )
                                last_state_id = res["state_id"]

                    if old_id:
                        old_to_new[old_id] = last_state_id
                    previous_source_state_id = last_state_id
                    previous_table_chain = op_chain

                    self.goto(last_state_id)
                    state = self.history.find(last_state_id)

                    restored_cells.append({
                        "id": cell.get("id") or str(uuid.uuid4()),
                        "type": "table",
                        "stateId": last_state_id,
                        "description": state.description,
                        "rowCount": state.count,
                        "lineage": [s.description for s in self.history.lineage()],
                        "opChain": op_chain,
                        "meta": cell.get("meta"),
                    })

                elif cell["type"] == "chart":
                    op_id = cell.get("opId")
                    params = cell.get("opParams")
                    source_state_id = None

                    if version >= 3:
                        old_source = cell.get("sourceStateId")
                        source_state_id = old_to_new.get(old_source, previous_source_state_id)
                    else:
                        old_source = cell.get("sourceStateId")
                        if old_source and old_source in old_to_new:
                            source_state_id = old_to_new[old_source]
                        else:
                            source_state_id = previous_source_state_id

                    if source_state_id and op_id and params:
                        try:
                            res = self.execute(op_id, params, from_state_id=source_state_id)
                            if res["kind"] == "viz":
                                self.goto(source_state_id)
                                lineage = [s.description for s in self.history.lineage()]
                                values = ", ".join(str(v) for v in params.values() if v)
                                step_desc = f"{op_id.replace('viz_', '')}: {values or '—'}"

                                restored_cells.append(
                                    {
                                        "id": cell.get("id") or str(uuid.uuid4()),
                                        "type": "chart",
                                        "opId": op_id,
                                        "opParams": params,
                                        "spec": res["spec"],
                                        "sourceStateId": source_state_id,
                                        "lineage": [*lineage, step_desc],
                                        "timelineRange": cell.get("timelineRange"),
                                    }
                                )
                                previous_source_state_id = source_state_id
                        except Exception:  # noqa: BLE001
                            if version < 2 and "spec" in cell:
                                restored_cells.append(cell)

            return restored_cells

    def preview(self, n: int = 50, offset: int = 0, state_id: str | None = None) -> dict:
        """Return a window of rows: `[offset, offset+n)` of the given state (or current)."""
        history = self._require_history()
        offset = max(0, int(offset))
        n = max(1, int(n))
        lf = history.find(state_id).lf if state_id else history.current.lf
        df = lf.slice(offset, n).collect()
        rows = []
        for row in df.iter_rows():
            rows.append([_jsonify(v) for v in row])
        return {"columns": list(df.columns), "rows": rows, "offset": offset}

    def state_row_count(self, state_id: str) -> int:
        return self._require_history().find(state_id).count

    def schema_for(self, state_id: str | None = None):
        history = self._require_history()
        lf = history.find(state_id).lf if state_id else history.current.lf
        return lf

    def column_stats_for(self, column: str, state_id: str | None = None):
        history = self._require_history()
        lf = history.find(state_id).lf if state_id else history.current.lf
        return lf

    def history_payload(self) -> dict:
        history = self._require_history()
        states = []
        for s in history.all_states():
            states.append({
                "id": s.id,
                "description": s.description,
                "count": s.count,
                "parent_id": s.parent.id if s.parent else None,
                "is_current": s is history.current,
            })
        return {
            "current_id": history.current.id,
            "states": states,
            "lineage_ids": [s.id for s in history.lineage()],
        }


def _jsonify(v: Any) -> Any:
    """Polars row values → JSON-safe primitives."""
    from datetime import date, datetime, time
    if v is None:
        return None
    if isinstance(v, (date, datetime, time)):
        return v.isoformat()
    if isinstance(v, (bytes, bytearray)):
        return v.decode("utf-8", errors="replace")
    if isinstance(v, pl.Series):
        return v.to_list()
    return v
