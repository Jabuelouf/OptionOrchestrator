"""Persistence helpers that are safe to call from runtime paths.

Design goals:
- No-op when persistence is not configured/enabled.
- Never break core API flow if the DB is unavailable or schema isn't migrated yet.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

from sqlalchemy.exc import SQLAlchemyError

from .db import db_session, get_database_url
from .models import OrchestrationRun


def persistence_enabled() -> bool:
    # Enable if explicitly opted-in, or if DATABASE_URL is provided (expected in deployed envs).
    if os.environ.get("PERSIST_RUNS", "").strip() in {"1", "true", "TRUE", "yes", "YES"}:
        return True
    return bool(os.environ.get("DATABASE_URL", "").strip())


def try_persist_run(
    *,
    kind: str,
    payload: Dict[str, Any],
    response: Dict[str, Any],
    symbol: Optional[str] = None,
    session_id: Optional[str] = None,
) -> Optional[int]:
    """Persist a run, returning the DB id if successful; otherwise None."""
    if not persistence_enabled():
        return None

    # Touch URL so we fail early on totally invalid config.
    _ = get_database_url()

    try:
        with db_session() as s:
            run = OrchestrationRun(
                kind=kind,
                session_id=session_id,
                symbol=symbol,
                request_json=payload,
                response_json=response,
                summary=str(response.get("assessment") or ""),
            )
            s.add(run)
            s.flush()  # assign id
            return int(run.id)
    except SQLAlchemyError:
        return None
    except Exception:
        return None

