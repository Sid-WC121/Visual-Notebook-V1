"""In-memory session store.

A single `dict[session_id, Controller]` keyed by a cookie. Sessions are
created lazily on first request and live until the process restarts.
For a single-tenant student project this is enough.
"""

from __future__ import annotations

import secrets
import threading
from datetime import datetime

from visual_notebook.controller import Controller

SESSION_COOKIE = "vn_session"


class SessionStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._controllers: dict[str, Controller] = {}
        self._touched: dict[str, datetime] = {}

    def get_or_create(self, session_id: str | None) -> tuple[str, Controller]:
        with self._lock:
            if session_id and session_id in self._controllers:
                self._touched[session_id] = datetime.utcnow()
                return session_id, self._controllers[session_id]
            new_id = session_id or secrets.token_urlsafe(16)
            ctrl = Controller()
            self._controllers[new_id] = ctrl
            self._touched[new_id] = datetime.utcnow()
            return new_id, ctrl

    def get(self, session_id: str) -> Controller | None:
        with self._lock:
            return self._controllers.get(session_id)

    def drop(self, session_id: str) -> None:
        with self._lock:
            self._controllers.pop(session_id, None)
            self._touched.pop(session_id, None)


# Module-level singleton — picked up by the FastAPI dependency.
store = SessionStore()
