from __future__ import annotations

import os
from typing import Any, Dict, Optional

import market_data_layer.client as client_mod
from market_data_layer import MarketDataClient
from shared.exceptions import MarketDataError
from shared.schemas import OHLCV


def setup_function() -> None:
    MarketDataClient._history_cache.clear()


class _Resp:
    def __init__(self, status_code: int, payload: Dict[str, Any]) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> Dict[str, Any]:
        return self._payload


def test_massive_history_uses_bearer_auth(monkeypatch) -> None:
    os.environ["MARKET_DATA_PROVIDER"] = "massive"
    os.environ["MASSIVE_API_KEY"] = "test_key"
    os.environ["MASSIVE_API_BASE"] = "https://api.massive.com"
    os.environ["MASSIVE_OPTIONS_ONLY"] = "false"

    seen: Dict[str, Any] = {}

    def fake_get(url: str, params: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None, timeout: int = 10):
        seen["url"] = url
        seen["headers"] = headers or {}
        # Minimal aggs payload shape
        return _Resp(
            200,
            {"results": [{"t": 1700000000000, "o": 1.0, "h": 2.0, "l": 0.5, "c": 1.5, "v": 123}]},
        )

    # Force legacy REST fallback path for this auth-header regression test.
    monkeypatch.setattr(client_mod, "_HAS_MASSIVE_SDK", False)
    monkeypatch.setattr(client_mod.requests, "get", fake_get)

    c = MarketDataClient(provider="massive")
    out = c.get_price_history("TSLA", period="5d", interval="1d")
    assert len(out) == 1
    assert "/v2/aggs/ticker/TSLA/range/1/day/" in str(seen.get("url"))
    assert (seen.get("headers") or {}).get("Authorization") == "Bearer test_key"


def test_price_history_falls_back_to_yfinance_when_yahoo_chart_fails(monkeypatch) -> None:
    monkeypatch.delenv("MASSIVE_API_KEY", raising=False)
    monkeypatch.delenv("POLYGON_API_KEY", raising=False)

    c = MarketDataClient(provider="yahoo", allow_yfinance=True)
    monkeypatch.setattr(c, "_safe_get", lambda url, params, headers=None: None)
    expected = [
        OHLCV(
            date="2026-02-14T00:00:00+00:00",
            open=100.0,
            high=101.0,
            low=99.0,
            close=100.5,
            volume=1000,
        )
    ]
    monkeypatch.setattr(c, "_history_from_yfinance", lambda symbol, period, interval: expected)

    out = c.get_price_history("AAPL", period="1mo", interval="1d")
    assert out == expected
    assert c.last_provider == "yfinance"
    assert c.last_detail == "history_from_yfinance_fallback"


def test_price_history_raises_without_fallback_when_yahoo_chart_fails(monkeypatch) -> None:
    monkeypatch.delenv("MASSIVE_API_KEY", raising=False)
    monkeypatch.delenv("POLYGON_API_KEY", raising=False)

    c = MarketDataClient(provider="yahoo", allow_yfinance=False)
    monkeypatch.setattr(c, "_safe_get", lambda url, params, headers=None: None)

    try:
        c.get_price_history("AAPL", period="1mo", interval="1d")
        assert False, "Expected MarketDataError"
    except MarketDataError:
        assert True
