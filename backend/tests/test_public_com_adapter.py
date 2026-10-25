"""Unit tests for input_layer.brokers.public_com.PublicComAdapter."""

from unittest.mock import MagicMock, patch

import pytest
from input_layer.brokers.public_com import PublicComAdapter, _parse_occ_symbol
from shared.exceptions import BrokerError


def _mock_response(json_data):
    m = MagicMock()
    m.json.return_value = json_data
    m.raise_for_status.return_value = None
    return m


# ── OCC symbol parsing ────────────────────────────────────────────────────────


def test_parse_occ_symbol_call() -> None:
    underlying, expiry, opt_type, strike = _parse_occ_symbol("AAPL231215C00190000")
    assert underlying == "AAPL"
    assert expiry == "2023-12-15"
    assert opt_type == "call"
    assert strike == 190.0


def test_parse_occ_symbol_put() -> None:
    underlying, expiry, opt_type, strike = _parse_occ_symbol("SPY240119P00450000")
    assert underlying == "SPY"
    assert expiry == "2024-01-19"
    assert opt_type == "put"
    assert strike == 450.0


def test_parse_occ_symbol_invalid_raises() -> None:
    with pytest.raises(BrokerError):
        _parse_occ_symbol("INVALID")


# ── _map_leg ──────────────────────────────────────────────────────────────────


def test_map_leg_long() -> None:
    raw = {"symbol": "AAPL231215C00190000", "quantity": 2, "cost_basis": 5.50}
    leg = PublicComAdapter._map_leg(raw)
    assert leg.side == "long"
    assert leg.quantity == 2
    assert leg.entry_price == 5.50
    assert leg.option_type == "call"
    assert leg.strike == 190.0


def test_map_leg_short() -> None:
    raw = {"symbol": "AAPL231215C00190000", "quantity": -1, "cost_basis": None}
    leg = PublicComAdapter._map_leg(raw)
    assert leg.side == "short"
    assert leg.quantity == 1
    assert leg.entry_price is None


# ── get_positions ─────────────────────────────────────────────────────────────


def test_get_positions_groups_by_underlying() -> None:
    payload = {
        "positions": [
            {"symbol": "AAPL231215C00190000", "quantity": 1, "cost_basis": 5.0},
            {"symbol": "AAPL240119P00180000", "quantity": -1, "cost_basis": 3.0},
        ]
    }
    adapter = PublicComAdapter(api_key="test")
    with patch("requests.get", return_value=_mock_response(payload)):
        snaps = adapter.get_positions()
    assert len(snaps) == 1
    assert snaps[0].symbol == "AAPL"
    assert len(snaps[0].legs) == 2


def test_get_positions_skips_unrecognized_symbols() -> None:
    payload = {
        "positions": [
            {"symbol": "AAPL", "quantity": 10},  # stock row — no OCC match
            {"symbol": "AAPL231215C00190000", "quantity": 1, "cost_basis": 5.0},
        ]
    }
    adapter = PublicComAdapter(api_key="test")
    with patch("requests.get", return_value=_mock_response(payload)):
        snaps = adapter.get_positions()
    assert len(snaps) == 1
    assert len(snaps[0].legs) == 1


# ── get_account ───────────────────────────────────────────────────────────────


def test_get_account_maps_fields() -> None:
    payload = {
        "buying_power": 25000.0,
        "options_buying_power": 10000.0,
        "risk_preference": "aggressive",
    }
    adapter = PublicComAdapter(api_key="test")
    with patch("requests.get", return_value=_mock_response(payload)):
        constraints = adapter.get_account()
    assert constraints.buying_power == 25000.0
    assert constraints.max_loss_tolerance == 10000.0
    assert constraints.risk_preference == "aggressive"


def test_get_account_unknown_risk_pref_defaults_to_moderate() -> None:
    payload = {"buying_power": 5000.0, "risk_preference": "yolo"}
    adapter = PublicComAdapter(api_key="test")
    with patch("requests.get", return_value=_mock_response(payload)):
        constraints = adapter.get_account()
    assert constraints.risk_preference == "moderate"
