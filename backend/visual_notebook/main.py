"""FastAPI entry point.

Run: `uvicorn visual_notebook.main:app --reload --port 8000`
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from visual_notebook.api.routes import router

app = FastAPI(
    title="Visual Notebook API",
    version="0.2.0",
    description="No-code data exploration backend (Polars + History tree).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/")
def root() -> dict:
    return {"ok": True, "service": "Visual Notebook", "docs": "/docs"}
