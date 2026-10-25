from __future__ import annotations

import os
from typing import Any, Dict

import market_data_layer.client as client_mod
from market_data_layer import MarketDataClient


def setup_function() -> None:
    MarketDataClient._history_cache.clear()


def test_finnhub_quote_mapping_uses_sdk(monkeypatch) -> None:
    os.environ["MARKET_DATA_PROVIDER"] = "finnhub"
    os.environ["FINNHUB_API_KEY"] = "fh_test_key"
    os.environ["FINNHUB_API_BASE"] = "https://finnhub.io"

    seen: Dict[str, Any] = {}

    class _StubClient:
        def __init__(self, api_key: str) -> None:
            seen["api_key"] = api_key

        def quote(self, symbol: str):
            seen["symbol"] = symbol
            return {
                "c": 188.12,
                "d": 1.75,
                "dp": 0.94,
                "h": 189.0,
                "l": 186.5,
                "o": 186.7,
                "pc": 186.37,
                "t": 1739392200,
            }

    monkeypatch.setattr(client_mod, "_HAS_FINNHUB_SDK", True)
    monkeypatch.setattr(client_mod, "finnhub", type("_StubMod", (), {"Client": _StubClient}), raising=False)

    c = MarketDataClient(provider="finnhub")
    assert c._finnhub_client is not None
    # If SDK path is used, no raw requests call should occur.
    monkeypatch.setattr(client_mod.requests, "get", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("requests path should not be used")))

    q = c.get_stock_quote("AAPL")
    assert q.symbol == "AAPL"
    assert q.price == 188.12
    assert q.change == 1.75
    assert q.change_percent == 0.94
    assert seen.get("api_key") == "fh_test_key"
    assert seen.get("symbol") == "AAPL"


def test_finnhub_quote_rest_fallback_when_sdk_unavailable(monkeypatch) -> None:
    os.environ["MARKET_DATA_PROVIDER"] = "finnhub"
    os.environ["FINNHUB_API_KEY"] = "fh_test_key"
    os.environ["FINNHUB_API_BASE"] = "https://finnhub.io"

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
        return _Resp(200, {"c": 188.12, "d": 1.75, "dp": 0.94, "pc": 186.37, "t": 1739392200})

    monkeypatch.setattr(client_mod, "_HAS_FINNHUB_SDK", False)
    monkeypatch.setattr(client_mod.requests, "get", fake_get)

    c = MarketDataClient(provider="finnhub")
    q = c.get_stock_quote("AAPL")
    assert q.price == 188.12
    assert "/api/v1/quote" in str(seen.get("url"))
    assert (seen.get("params") or {}).get("token") == "fh_test_key"


def test_finnhub_history_mapping_uses_sdk(monkeypatch) -> None:
    os.environ["MARKET_DATA_PROVIDER"] = "finnhub"
    os.environ["FINNHUB_API_KEY"] = "fh_test_key"
    os.environ["FINNHUB_API_BASE"] = "https://finnhub.io"

    seen: Dict[str, Any] = {}

    class _StubClient:
        def __init__(self, api_key: str) -> None:
            seen["api_key"] = api_key

        def stock_candles(self, symbol: str, resolution: str, from_ts: int, to_ts: int):
            seen["symbol"] = symbol
            seen["resolution"] = resolution
            seen["from_ts"] = from_ts
            seen["to_ts"] = to_ts
            return {
                "s": "ok",
                "t": [1739392200],
                "o": [186.7],
                "h": [189.0],
                "l": [186.5],
                "c": [188.12],
                "v": [123456],
            }

    monkeypatch.setattr(client_mod, "_HAS_FINNHUB_SDK", True)
    monkeypatch.setattr(client_mod, "finnhub", type("_StubMod", (), {"Client": _StubClient}), raising=False)

    c = MarketDataClient(provider="finnhub")
    out = c.get_price_history("AAPL", period="1mo", interval="1d")
    assert len(out) == 1
    assert out[0].close == 188.12
    assert seen.get("resolution") == "D"
    assert seen.get("symbol") == "AAPL"


def test_finnhub_history_rest_fallback_when_sdk_unavailable(monkeypatch) -> None:
    os.environ["MARKET_DATA_PROVIDER"] = "finnhub"
    os.environ["FINNHUB_API_KEY"] = "fh_test_key"
    os.environ["FINNHUB_API_BASE"] = "https://finnhub.io"

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
                "s": "ok",
                "t": [1739392200],
                "o": [186.7],
                "h": [189.0],
                "l": [186.5],
                "c": [188.12],
                "v": [123456],
            },
        )

    monkeypatch.setattr(client_mod, "_HAS_FINNHUB_SDK", False)
    monkeypatch.setattr(client_mod.requests, "get", fake_get)

    c = MarketDataClient(provider="finnhub")
    out = c.get_price_history("AAPL", period="1mo", interval="1d")
    assert len(out) == 1
    assert out[0].close == 188.12
    assert "/api/v1/stock/candle" in str(seen.get("url"))
    assert (seen.get("params") or {}).get("resolution") == "D"
    assert (seen.get("params") or {}).get("token") == "fh_test_key"
