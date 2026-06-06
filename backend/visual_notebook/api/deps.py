"""FastAPI dependencies — session resolution + cookie wiring."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Cookie, Response

from visual_notebook.controller import Controller
from visual_notebook.session import SESSION_COOKIE, store


@dataclass
class Session:
    """A session = `(session_id, controller)` injected by `get_session`.

    The route handler is responsible for setting the cookie if needed —
    `set_cookie_on(response)` does that. We don't set it eagerly here
    because `Cookie(...)` resolves before `Response` is available.
    """
    id: str
    controller: Controller

    def set_cookie_on(self, response: Response) -> None:
        response.set_cookie(
            key=SESSION_COOKIE,
            value=self.id,
            httponly=True,
            samesite="lax",
            # path=/ so every endpoint sees it
            path="/",
        )


def get_session(
    response: Response,
    session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> Session:
    sid, ctrl = store.get_or_create(session_id)
    sess = Session(id=sid, controller=ctrl)
    if session_id != sid:
        sess.set_cookie_on(response)
    return sess
