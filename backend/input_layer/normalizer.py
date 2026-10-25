"""Input normalization routines."""

from typing import Any, Dict, Tuple

from shared.exceptions import InputValidationError
from shared.schemas import AccountConstraints, OptionLeg, PositionSnapshot

REQUIRED_TOP_LEVEL_KEYS = ("position", "account")


def normalize_payload(payload: Dict[str, Any]) -> Tuple[PositionSnapshot, AccountConstraints]:
    """Validate and normalize input payload into shared schema objects."""
    for key in REQUIRED_TOP_LEVEL_KEYS:
        if key not in payload:
            raise InputValidationError(f"Missing top-level key: {key}")

    position = payload["position"]
    account = payload["account"]

    symbol = str(position.get("symbol", "")).upper().strip()
    legs_raw = position.get("legs", [])

    if not symbol:
        raise InputValidationError("Position symbol is required")
    if not isinstance(legs_raw, list) or not legs_raw:
        raise InputValidationError("Position legs must be a non-empty list")

    legs = []
    for leg in legs_raw:
        legs.append(
            OptionLeg(
                option_type=str(leg.get("type", "unknown")),
                strike=float(leg.get("strike")),
                expiry=str(leg.get("expiry")),
                quantity=int(leg.get("quantity", 0)),
                side="short" if int(leg.get("quantity", 0)) < 0 else "long",
                entry_price=float(leg["entry_price"]) if "entry_price" in leg else None,
            )
        )

    position_snapshot = PositionSnapshot(symbol=symbol, legs=legs, notes=payload.get("notes"))
    constraints = AccountConstraints(
        buying_power=float(account.get("buying_power", 0.0)),
        max_loss_tolerance=float(account.get("max_loss_tolerance", 0.0)),
        risk_preference=str(account.get("risk_preference", "moderate")),
    )

    return position_snapshot, constraints
