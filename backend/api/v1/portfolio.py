from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List
from uuid import uuid4

from fastapi import APIRouter, Body

router = APIRouter()

# In-memory portfolio for UI parity. Replace with persistence later.
_POSITIONS: List[Dict[str, Any]] = []


def _seed_if_empty() -> None:
    if _POSITIONS:
        return
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    _POSITIONS.append(
        {
            "id": str(uuid4()),
            "symbol": "SPY",
            "strategy_name": "Demo Position",
            "entry_date": now,
            "status": "open",
            "unrealized_pl": 0.0,
            "legs": [
                {"action": "buy", "quantity": 1, "expiration": None, "strike": None, "option_type": "stock", "premium": 100.0}
            ],
        }
    )


@router.get("/", response_model=None)
def get_all_positions() -> List[Dict[str, Any]]:
    _seed_if_empty()
    return _POSITIONS


@router.post("/", response_model=None)
def add_position(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Add a position (best-effort). The UI currently has manual add disabled."""
    pos = dict(payload or {})
    pos.setdefault("id", str(uuid4()))
    pos.setdefault("entry_date", datetime.now(timezone.utc).replace(microsecond=0).isoformat())
    pos.setdefault("status", "open")
    pos.setdefault("unrealized_pl", 0.0)
    pos.setdefault("legs", [])
    _POSITIONS.append(pos)
    return pos


@router.post("/correlation", response_model=None)
def correlation(payload: Dict[str, Any] = Body(default={})) -> Dict[str, Any]:
    """Return a simple correlation matrix for UI rendering.

    The UI sometimes calls this without symbols; fall back to portfolio symbols.
    """
    symbols = payload.get("symbols") if isinstance(payload, dict) else None
    if not isinstance(symbols, list) or not symbols:
        _seed_if_empty()
        symbols = sorted({p.get("symbol") for p in _POSITIONS if p.get("symbol")})

    symbols = [str(s).upper().strip() for s in symbols if str(s).strip()]
    n = len(symbols)
    # Identity matrix (placeholder). Replace with history-based correlations later.
    values = [[1.0 if i == j else 0.15 for j in range(n)] for i in range(n)]
    diversification_score = 100.0 if n <= 1 else max(0.0, 100.0 - (n - 1) * 12.5)
    return {
        "matrix": {"symbols": symbols, "values": values},
        "diversification_score": float(diversification_score),
    }


@router.get("/var", response_model=None)
def value_at_risk(
    confidence: float = 0.95,
    horizon_days: int = 1,
) -> Dict[str, Any]:
    """Return VaR metrics with the keys the UI expects.

    This is currently a placeholder; it produces conservative fixed percentages.
    """
    _seed_if_empty()
    # Rough portfolio value proxy.
    portfolio_value = 0.0
    for p in _POSITIONS:
        legs = p.get("legs") or []
        for leg in legs:
            if not isinstance(leg, dict):
                continue
            if str(leg.get("option_type") or "").lower() == "stock":
                try:
                    qty = float(leg.get("quantity") or 0.0)
                    prem = float(leg.get("premium") or 0.0)
                    portfolio_value += qty * prem
                except Exception:
                    continue
    portfolio_value = max(portfolio_value, 10000.0)

    # Conservative placeholder (1-day horizon). Replace with parametric/historical/MC later.
    pct95 = 0.015
    pct99 = 0.03
    var95 = portfolio_value * pct95
    var99 = portfolio_value * pct99
    return {
        "parametric_var_95": {"value_at_risk": round(var95, 2), "value_at_risk_pct": round(pct95 * 100.0, 2)},
        "parametric_var_99": {"value_at_risk": round(var99, 2), "value_at_risk_pct": round(pct99 * 100.0, 2)},
        "historical_var_95": {"value_at_risk": round(var95 * 1.05, 2), "value_at_risk_pct": round(pct95 * 105.0 * 100.0 / 100.0, 2)},
        "historical_var_99": {"value_at_risk": round(var99 * 1.05, 2), "value_at_risk_pct": round(pct99 * 105.0 * 100.0 / 100.0, 2)},
        "monte_carlo_var_95": {"value_at_risk": round(var95 * 1.1, 2), "value_at_risk_pct": round(pct95 * 110.0 * 100.0 / 100.0, 2)},
        "monte_carlo_var_99": {"value_at_risk": round(var99 * 1.1, 2), "value_at_risk_pct": round(pct99 * 110.0 * 100.0 / 100.0, 2)},
        "confidence": float(confidence),
        "horizon_days": int(horizon_days),
        "portfolio_value": round(float(portfolio_value), 2),
    }

