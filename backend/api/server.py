"""FastAPI boundary for the Train/Test orchestrator runtime.

Keep `api/main.py` as a CLI smoke/demo entrypoint.
"""

from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any, Dict

from fastapi import Body, FastAPI, Header, Response
from fastapi.middleware.cors import CORSMiddleware
from orchestrator_layer import RescueOrchestrator
from shared.persistence import try_persist_run

from api.v1 import router as v1_router

app = FastAPI(title="Option-Orchestrator API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix="/api/v1")


def _to_jsonable(obj: Any) -> Any:
    if is_dataclass(obj):
        return asdict(obj)
    if isinstance(obj, dict):
        return {k: _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_jsonable(v) for v in obj]
    return obj


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/rescue")
def rescue(
    response: Response,
    payload: Dict[str, Any] = Body(...),
    x_session_id: str | None = Header(default=None),
) -> Dict[str, Any]:
    orchestrator = RescueOrchestrator()
    result = orchestrator.run(payload)
    body = _to_jsonable(result)

    # Best-effort persistence. Never fails the request.
    symbol = None
    try:
        position = payload.get("position") if isinstance(payload, dict) else None
        if isinstance(position, dict):
            symbol = position.get("symbol")
    except Exception:
        symbol = None

    run_id = try_persist_run(
        kind="rescue",
        payload=payload,
        response=body if isinstance(body, dict) else {"result": body},
        symbol=str(symbol).upper() if symbol else None,
        session_id=x_session_id,
    )
    if response is not None:
        response.headers["X-Orchestration-Persisted"] = "1" if run_id else "0"
        if run_id:
            response.headers["X-Orchestration-Run-Id"] = str(run_id)

    return body
