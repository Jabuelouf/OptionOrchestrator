"""Unit tests for input_layer.normalize_payload."""

import pytest
from input_layer import normalize_payload
from shared.exceptions import InputValidationError

_VALID_LEG = {"type": "call", "strike": 450.0, "expiry": "2025-06-20", "quantity": 1}


def _valid_payload(**overrides):
    base = {
        "position": {"symbol": "SPY", "legs": [_VALID_LEG]},
        "account": {"buying_power": 5000.0, "max_loss_tolerance": 1000.0, "risk_preference": "moderate"},
    }
    base.update(overrides)
    return base


# ── Happy path ────────────────────────────────────────────────────────────────


def test_valid_payload_returns_tuple() -> None:
    snapshot, constraints = normalize_payload(_valid_payload())
    assert snapshot.symbol == "SPY"
    assert constraints.max_loss_tolerance == 1000.0
    assert constraints.risk_preference == "moderate"
    assert len(snapshot.legs) == 1


# ── Missing required keys ─────────────────────────────────────────────────────


def test_missing_position_key_raises() -> None:
    payload = {"account": {"buying_power": 1000.0, "max_loss_tolerance": 500.0}}
    with pytest.raises(InputValidationError):
        normalize_payload(payload)


def test_missing_account_key_raises() -> None:
    payload = {"position": {"symbol": "AAPL", "legs": [_VALID_LEG]}}
    with pytest.raises(InputValidationError):
        normalize_payload(payload)


# ── Symbol validation ─────────────────────────────────────────────────────────


def test_empty_symbol_raises() -> None:
    payload = _valid_payload()
    payload["position"]["symbol"] = ""
    with pytest.raises(InputValidationError):
        normalize_payload(payload)


def test_lowercase_symbol_is_uppercased() -> None:
    payload = _valid_payload()
    payload["position"]["symbol"] = "aapl"
    snapshot, _ = normalize_payload(payload)
    assert snapshot.symbol == "AAPL"


# ── Legs validation ───────────────────────────────────────────────────────────


def test_empty_legs_raises() -> None:
    payload = _valid_payload()
    payload["position"]["legs"] = []
    with pytest.raises(InputValidationError):
        normalize_payload(payload)


# ── Leg side derivation ───────────────────────────────────────────────────────


def test_negative_quantity_sets_side_short() -> None:
    payload = _valid_payload()
    payload["position"]["legs"] = [{"type": "put", "strike": 440.0, "expiry": "2025-06-20", "quantity": -1}]
    snapshot, _ = normalize_payload(payload)
    assert snapshot.legs[0].side == "short"


def test_positive_quantity_sets_side_long() -> None:
    snapshot, _ = normalize_payload(_valid_payload())
    assert snapshot.legs[0].side == "long"


# ── Default risk_preference ───────────────────────────────────────────────────


def test_risk_preference_defaults_to_moderate() -> None:
    payload = _valid_payload()
    del payload["account"]["risk_preference"]
    _, constraints = normalize_payload(payload)
    assert constraints.risk_preference == "moderate"
