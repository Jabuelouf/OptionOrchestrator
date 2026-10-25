from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import uuid4

from fastapi import APIRouter, Body, Query

router = APIRouter()

# In-memory alert rules for UI parity.
_ALERTS: Dict[str, Dict[str, Any]] = {}


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@router.get("/", response_model=None)
def list_alerts(symbol: Optional[str] = Query(None)) -> Dict[str, Dict[str, Any]]:
    """Return a dict keyed by alert id (matches the UI's historical expectation)."""
    if not symbol:
        return _ALERTS
    sym = symbol.upper().strip()
    return {k: v for k, v in _ALERTS.items() if str(v.get("symbol") or "").upper() == sym}


@router.post("/", response_model=None)
def create_alert(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    symbol = str(payload.get("symbol") or "").upper().strip()
    metric = str(payload.get("metric") or "price").lower().strip()
    operator = str(payload.get("operator") or "gt").lower().strip()
    try:
        threshold = float(payload.get("threshold"))
    except Exception:
        threshold = 0.0

    alert_id = str(uuid4())
    rule = {
        "id": alert_id,
        "symbol": symbol,
        "name": payload.get("name") or f"{symbol} {metric} {operator} {threshold}",
        "created_at": _now(),
        "is_active": True,
        "condition": {
            "metric": metric,
            "operator": operator,
            "threshold": threshold,
        },
    }
    _ALERTS[alert_id] = rule
    return rule


@router.delete("/{alert_id}", response_model=None)
def delete_alert(alert_id: str) -> Dict[str, Any]:
    existed = alert_id in _ALERTS
    _ALERTS.pop(alert_id, None)
    return {"deleted": bool(existed), "id": alert_id}


@router.post("/check", response_model=None)
def check_alerts() -> Dict[str, Any]:
    """Stubbed alert evaluation runner.

    Later this will evaluate rules against real-time quotes/indicators and enqueue notifications.
    """
    triggered = []
    for a in _ALERTS.values():
        if a.get("is_active"):
            # Placeholder: nothing triggers yet.
            pass
    return {"checked_at": _now(), "triggered": triggered, "active": sum(1 for a in _ALERTS.values() if a.get("is_active"))}

