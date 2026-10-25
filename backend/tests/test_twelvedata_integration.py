from __future__ import annotations

import os
from typing import Any, Dict

import market_data_layer.client as client_mod
from market_data_layer import MarketDataClient


def setup_function() -> None:
    MarketDataClient._history_cache.clear()
    MarketDataClient._twelvedata_series_cache.clear()


def test_twelvedata_history_uses_time_series_with_minimal_outputsize(monkeypatch) -> None:
    os.environ["MARKET_DATA_PROVIDER"] = "twelvedata"
    os.environ["TWELVEDATA_API_KEY"] = "td_test_key"
    os.environ["TWELVEDATA_API_BASE"] = "https://api.twelvedata.com"

    seen: Dict[str, Any] = {}

    class _Resp:
        def __init__(self, status_code: int, payload: Dict[str, Any]) -> None:
            self.status_code = status_code
            self._payload = payload

        def json(self) -> Dict[str, Any]:
            return self._payload

    def fake_get(url: str, params=None, headers=None, timeout: int = 10):
        seen["url"] = url
        seen["params"] = params or {}
        return _Resp(
            200,
            {
                "values": [
                    {"datetime": "2026-02-15", "open": "100", "high": "102", "low": "99", "close": "101", "volume": "1200"},
                    {"datetime": "2026-02-14", "open": "99", "high": "101", "low": "98", "close": "100", "volume": "1100"},
                ]
            },
        )

    monkeypatch.setattr(client_mod.requests, "get", fake_get)

    c = MarketDataClient(provider="twelvedata")
    out = c.get_price_history("AAPL", period="5d", interval="1d")
    assert len(out) == 2
    assert out[-1].close == 101.0
    assert "/time_series" in str(seen.get("url"))
    assert (seen.get("params") or {}).get("interval") == "1day"
    assert (seen.get("params") or {}).get("outputsize") == 5
    assert (seen.get("params") or {}).get("apikey") == "td_test_key"


def test_twelvedata_quote_reuses_cached_series_to_reduce_calls(monkeypatch) -> None:
    os.environ["MARKET_DATA_PROVIDER"] = "twelvedata"
    os.environ["TWELVEDATA_API_KEY"] = "td_test_key"
    os.environ["TWELVEDATA_API_BASE"] = "https://api.twelvedata.com"

    seen: Dict[str, Any] = {"calls": 0}

    class _Resp:
        def __init__(self, status_code: int, payload: Dict[str, Any]) -> None:
            self.status_code = status_code
            self._payload = payload

        def json(self) -> Dict[str, Any]:
            return self._payload

    def fake_get(url: str, params=None, headers=None, timeout: int = 10):
        seen["calls"] += 1
        return _Resp(
            200,
            {
                "values": [
                    {"datetime": "2026-02-15", "open": "100", "high": "102", "low": "99", "close": "101", "volume": "1200"},
                    {"datetime": "2026-02-14", "open": "99", "high": "101", "low": "98", "close": "100", "volume": "1100"},
                ]
            },
        )

    monkeypatch.setattr(client_mod.requests, "get", fake_get)

    c = MarketDataClient(provider="twelvedata")
    q1 = c.get_stock_quote("AAPL")
    q2 = c.get_stock_quote("AAPL")
    assert q1.price == 101.0
    assert round(q1.change_percent, 4) == 1.0
    assert q2.price == 101.0
    assert seen["calls"] == 1
