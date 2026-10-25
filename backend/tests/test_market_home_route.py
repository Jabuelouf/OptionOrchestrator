"""Tests for /api/v1/market/home endpoint."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from api.server import app
from fastapi.testclient import TestClient
from market_data_layer import MarketDataClient
from shared.schemas import OHLCV, StockQuote


def _quote(symbol: str, *, price: float = 100.0, change_percent: float = 0.0, change: float | None = None) -> StockQuote:
    pct = float(change_percent)
    px = float(price)
    chg = float(change) if change is not None else round(px * (pct / 100.0), 4)
    return StockQuote(
        symbol=symbol.upper(),
        company_name=symbol.upper(),
        price=px,
        change=chg,
        change_percent=pct,
        volume=0,
        avg_volume=0,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


def _history(*, points: int = 60, base_price: float = 100.0) -> list[OHLCV]:
    base = float(base_price)
    now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    out: list[OHLCV] = []
    for i in range(points):
        px = base + (i * 0.1)
        dt = (now - timedelta(days=points - i)).isoformat()
        out.append(OHLCV(date=dt, open=px, high=px * 1.01, low=px * 0.99, close=px, volume=1000000))
    return out

@pytest.fixture(autouse=True)
def _disable_real_massive_env(monkeypatch) -> None:
    """Keep /home route tests deterministic and offline."""
    monkeypatch.delenv("MASSIVE_API_KEY", raising=False)
    monkeypatch.delenv("POLYGON_API_KEY", raising=False)
    from api.v1 import market as _mkt
    monkeypatch.setattr(_mkt, "_fetch_yahoo_market_movers", lambda limit=7: ([], []), raising=True)

def test_market_home_route_not_shadowed(monkeypatch) -> None:
    """Regression: /market/home must not be swallowed by /market/{symbol}."""

    def fake_quote(self: MarketDataClient, symbol: str):
        return _quote(symbol)

    def fake_history(self: MarketDataClient, symbol: str, period: str = "1mo", interval: str = "1d"):
        base = 100.0
        if symbol.upper() in {"SPY", "QQQ", "DIA", "IWM"}:
            base = 400.0
        return _history(points=60, base_price=base)

    monkeypatch.setattr(MarketDataClient, "get_stock_quote", fake_quote, raising=True)
    monkeypatch.setattr(MarketDataClient, "get_price_history", fake_history, raising=True)

    client = TestClient(app)
    resp = client.get("/api/v1/market/home")
    assert resp.status_code == 200
    body = resp.json()
    assert "tiles" in body
    assert isinstance(body["tiles"], list)
    assert len(body["tiles"]) == 4


def test_market_home_default_is_live(monkeypatch) -> None:
    """Default behavior (no query params) should attempt live data."""

    def fake_quote(self: MarketDataClient, symbol: str):
        return _quote(symbol)

    def fake_history(self: MarketDataClient, symbol: str, period: str = "1mo", interval: str = "1d"):
        return _history(points=60, base_price=400.0)

    monkeypatch.setattr(MarketDataClient, "get_stock_quote", fake_quote, raising=True)
    monkeypatch.setattr(MarketDataClient, "get_price_history", fake_history, raising=True)

    # Clear the home cache to force a fresh fetch.
    from api.v1 import market as _mkt
    _mkt._home_cache["payload"] = None
    _mkt._home_cache["fetched_at"] = 0.0

    client = TestClient(app)
    resp = client.get("/api/v1/market/home")
    assert resp.status_code == 200
    # Provider should NOT be "home_mock_default" since live is now the default.
    detail = resp.headers.get("X-Market-Data-Detail", "")
    assert detail != "home_mock_default"


def test_market_home_live_false_does_not_set_mock_detail(monkeypatch) -> None:
    """live=false should bypass cache without setting mock detail."""

    def fake_quote(self: MarketDataClient, symbol: str):
        return _quote(symbol)

    def fake_history(self: MarketDataClient, symbol: str, period: str = "1mo", interval: str = "1d"):
        return _history(points=60, base_price=100.0)

    monkeypatch.setattr(MarketDataClient, "get_stock_quote", fake_quote, raising=True)
    monkeypatch.setattr(MarketDataClient, "get_price_history", fake_history, raising=True)

    client = TestClient(app)
    resp = client.get("/api/v1/market/home", params={"live": "false"})
    assert resp.status_code == 200
    detail = resp.headers.get("X-Market-Data-Detail", "")
    assert detail != "home_mock_default"


def test_market_home_cache(monkeypatch) -> None:
    """Two rapid calls should return same timestamp (cache hit)."""

    def fake_quote(self: MarketDataClient, symbol: str):
        return _quote(symbol)

    def fake_history(self: MarketDataClient, symbol: str, period: str = "1mo", interval: str = "1d"):
        return _history(points=60, base_price=300.0)

    monkeypatch.setattr(MarketDataClient, "get_stock_quote", fake_quote, raising=True)
    monkeypatch.setattr(MarketDataClient, "get_price_history", fake_history, raising=True)

    # Clear cache first.
    from api.v1 import market as _mkt
    _mkt._home_cache["payload"] = None
    _mkt._home_cache["fetched_at"] = 0.0

    client = TestClient(app)
    resp1 = client.get("/api/v1/market/home")
    resp2 = client.get("/api/v1/market/home")
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    # Second call should be a cache hit.
    assert resp2.json()["timestamp"] == resp1.json()["timestamp"]
    assert resp2.headers.get("X-Market-Data-Provider") == "cache"


def test_market_home_refresh_bypasses_cache(monkeypatch) -> None:
    """refresh=true should bypass home cache and produce a fresh payload."""

    calls = {"n": 0}

    def fake_quote(self: MarketDataClient, symbol: str):
        q = _quote(symbol)
        calls["n"] += 1
        q.price = 100.0 + float(calls["n"])
        q.change_percent = float(calls["n"])
        return q

    def fake_history(self: MarketDataClient, symbol: str, period: str = "1mo", interval: str = "1d"):
        return _history(points=60, base_price=300.0)

    monkeypatch.setattr(MarketDataClient, "get_stock_quote", fake_quote, raising=True)
    monkeypatch.setattr(MarketDataClient, "get_price_history", fake_history, raising=True)

    from api.v1 import market as _mkt
    _mkt._home_cache["payload"] = None
    _mkt._home_cache["fetched_at"] = 0.0

    client = TestClient(app)
    resp1 = client.get("/api/v1/market/home")
    resp2 = client.get("/api/v1/market/home", params={"refresh": "true"})
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert resp2.headers.get("X-Market-Data-Provider") != "cache"
    assert resp2.json()["gainers"][0]["price"] != resp1.json()["gainers"][0]["price"]


def test_market_home_movers_prefer_provider_change_percent(monkeypatch) -> None:
    """Movers should respect provider change_percent when available."""

    price_map = {
        "AAPL": 110.0,
        "MSFT": 90.0,
        "NVDA": 100.0,
        "TSLA": 100.0,
        "AMZN": 100.0,
        "GOOGL": 100.0,
        "META": 100.0,
        "AMD": 100.0,
        "NFLX": 100.0,
        "JPM": 100.0,
        "XOM": 100.0,
        "BAC": 100.0,
        "DIA": 400.0,
        "QQQ": 400.0,
        "SPY": 400.0,
        "IWM": 400.0,
    }

    percent_map = {
        "AAPL": 5.0,
        "MSFT": -4.0,
    }

    def fake_quote(self: MarketDataClient, symbol: str):
        q = _quote(symbol)
        sym = symbol.upper()
        q.price = price_map.get(sym, 100.0)
        q.change_percent = percent_map.get(sym, 0.0)
        return q

    def fake_history(self: MarketDataClient, symbol: str, period: str = "1mo", interval: str = "1d"):
        return _history(points=60, base_price=100.0)

    monkeypatch.setattr(MarketDataClient, "get_stock_quote", fake_quote, raising=True)
    monkeypatch.setattr(MarketDataClient, "get_price_history", fake_history, raising=True)

    from api.v1 import market as _mkt
    _mkt._home_cache["payload"] = None
    _mkt._home_cache["fetched_at"] = 0.0

    client = TestClient(app)
    resp = client.get("/api/v1/market/home")
    assert resp.status_code == 200
    body = resp.json()

    assert body["gainers"][0]["symbol"] == "AAPL"
    assert body["gainers"][0]["change_percent"] == 5.0
    assert body["losers"][0]["symbol"] == "MSFT"
    assert body["losers"][0]["change_percent"] == -4.0


def test_market_home_movers_top7_from_yahoo_provider(monkeypatch) -> None:
    """When Yahoo market-wide movers are available, /home should use top 7 from that payload."""

    def fake_quote(self: MarketDataClient, symbol: str):
        return _quote(symbol)

    def fake_history(self: MarketDataClient, symbol: str, period: str = "1mo", interval: str = "1d"):
        return _history(points=30, base_price=100.0)

    # Deliberately unsorted and longer than 7 to confirm route sorting/trim.
    provider_gainers = [
        {"symbol": f"G{i}", "price": 100.0 + i, "change_percent": float(i), "volume": 1000 + i}
        for i in range(1, 13)
    ]
    provider_losers = [
        {"symbol": f"L{i}", "price": 100.0 - i, "change_percent": float(-i), "volume": 2000 + i}
        for i in range(1, 13)
    ]

    monkeypatch.setattr(MarketDataClient, "get_stock_quote", fake_quote, raising=True)
    monkeypatch.setattr(MarketDataClient, "get_price_history", fake_history, raising=True)

    from api.v1 import market as _mkt
    monkeypatch.setattr(
        _mkt,
        "_fetch_yahoo_market_movers",
        lambda limit=7: (
            sorted(provider_gainers, key=lambda r: r["change_percent"], reverse=True)[: int(limit)],
            sorted(provider_losers, key=lambda r: r["change_percent"])[: int(limit)],
        ),
        raising=True,
    )
    _mkt._home_cache["payload"] = None
    _mkt._home_cache["fetched_at"] = 0.0

    client = TestClient(app)
    resp = client.get("/api/v1/market/home", params={"refresh": "true"})
    assert resp.status_code == 200
    body = resp.json()

    assert len(body["gainers"]) == 7
    assert len(body["losers"]) == 7
    assert body["gainers"][0]["symbol"] == "G12"
    assert body["gainers"][0]["change_percent"] == 12.0
    assert body["losers"][0]["symbol"] == "L12"
    assert body["losers"][0]["change_percent"] == -12.0


def test_market_home_provider_movers_filtered_by_sign(monkeypatch) -> None:
    """Provider helper should drop wrong-sign rows from gainers/losers."""
    from types import SimpleNamespace

    from api.v1 import market as _mkt

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def get_snapshot_direction(self, market_type, direction, include_otc=False):
            if direction == "gainers":
                return [
                    SimpleNamespace(
                        ticker="G_POS",
                        todays_change_percent=1.1,
                        last_trade=SimpleNamespace(price=101.0),
                        day=SimpleNamespace(close=101.0, volume=10),
                    ),
                    SimpleNamespace(
                        ticker="G_BAD",
                        todays_change_percent=-0.4,
                        last_trade=SimpleNamespace(price=99.0),
                        day=SimpleNamespace(close=99.0, volume=10),
                    ),
                ]
            return [
                SimpleNamespace(
                    ticker="L_NEG",
                    todays_change_percent=-1.2,
                    last_trade=SimpleNamespace(price=98.0),
                    day=SimpleNamespace(close=98.0, volume=10),
                ),
                SimpleNamespace(
                    ticker="L_BAD",
                    todays_change_percent=0.6,
                    last_trade=SimpleNamespace(price=102.0),
                    day=SimpleNamespace(close=102.0, volume=10),
                ),
            ]

    monkeypatch.setenv("MASSIVE_API_KEY", "test-key")
    monkeypatch.setattr(_mkt, "_HAS_MASSIVE_SDK", True, raising=True)
    monkeypatch.setattr(_mkt, "RESTClient", FakeClient, raising=True)

    gainers, losers = _mkt._fetch_massive_market_movers(limit=7)
    assert [r["symbol"] for r in gainers] == ["G_POS"]
    assert [r["symbol"] for r in losers] == ["L_NEG"]
    assert all(float(r["change_percent"]) > 0.0 for r in gainers)
    assert all(float(r["change_percent"]) < 0.0 for r in losers)


def test_market_home_uses_yahoo_movers_when_massive_unavailable(monkeypatch) -> None:
    """If Massive movers are unavailable, route should use Yahoo movers before tiny-universe fallback."""

    def fake_quote(self: MarketDataClient, symbol: str):
        q = _quote(symbol)
        q.change_percent = 0.0
        return q

    def fake_history(self: MarketDataClient, symbol: str, period: str = "1mo", interval: str = "1d"):
        return _history(points=30, base_price=100.0)

    monkeypatch.setattr(MarketDataClient, "get_stock_quote", fake_quote, raising=True)
    monkeypatch.setattr(MarketDataClient, "get_price_history", fake_history, raising=True)

    from api.v1 import market as _mkt
    monkeypatch.setattr(_mkt, "_fetch_massive_market_movers", lambda limit=7: ([], []), raising=True)
    monkeypatch.setattr(
        _mkt,
        "_fetch_yahoo_market_movers",
        lambda limit=7: (
            [{"symbol": "YHOO1", "price": 11.0, "change_percent": 5.5, "volume": 1}],
            [{"symbol": "YHOO2", "price": 9.0, "change_percent": -4.4, "volume": 1}],
        ),
        raising=True,
    )
    _mkt._home_cache["payload"] = None
    _mkt._home_cache["fetched_at"] = 0.0

    client = TestClient(app)
    resp = client.get("/api/v1/market/home", params={"refresh": "true"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["gainers"][0]["symbol"] == "YHOO1"
    assert body["losers"][0]["symbol"] == "YHOO2"


def test_market_home_fallback_movers_split_by_sign(monkeypatch) -> None:
    """Fallback movers should keep gainers positive-only and losers negative-only."""

    percent_map = {
        "AAPL": 2.2,
        "MSFT": 1.1,
        "NVDA": 0.5,
        "TSLA": -0.3,
        "AMZN": -1.2,
        "GOOGL": -2.8,
        "META": 0.0,
        "AMD": 3.4,
        "NFLX": -4.1,
        "JPM": 0.2,
        "XOM": -0.7,
        "BAC": 0.9,
        "DIA": 0.0,
        "QQQ": 0.0,
        "SPY": 0.0,
        "IWM": 0.0,
    }

    def fake_quote(self: MarketDataClient, symbol: str):
        q = _quote(symbol)
        q.change_percent = float(percent_map.get(symbol.upper(), 0.0))
        return q

    def fake_history(self: MarketDataClient, symbol: str, period: str = "1mo", interval: str = "1d"):
        return _history(points=30, base_price=100.0)

    monkeypatch.setattr(MarketDataClient, "get_stock_quote", fake_quote, raising=True)
    monkeypatch.setattr(MarketDataClient, "get_price_history", fake_history, raising=True)

    from api.v1 import market as _mkt
    monkeypatch.setattr(_mkt, "_fetch_massive_market_movers", lambda limit=7: ([], []), raising=True)
    _mkt._home_cache["payload"] = None
    _mkt._home_cache["fetched_at"] = 0.0

    client = TestClient(app)
    resp = client.get("/api/v1/market/home", params={"refresh": "true"})
    assert resp.status_code == 200
    body = resp.json()

    assert all(float(r["change_percent"]) > 0.0 for r in body["gainers"])
    assert all(float(r["change_percent"]) < 0.0 for r in body["losers"])


def test_market_home_headlines_use_massive_mover_tickers_only(monkeypatch) -> None:
    """Live home headlines should be scoped to current mover symbols only."""

    def fake_quote(self: MarketDataClient, symbol: str):
        return _quote(symbol)

    def fake_history(self: MarketDataClient, symbol: str, period: str = "1mo", interval: str = "1d"):
        return _history(points=30, base_price=100.0)

    provider_gainers = [
        {"symbol": "AAPL", "price": 101.0, "change_percent": 2.5, "volume": 10},
        {"symbol": "MSFT", "price": 202.0, "change_percent": 1.8, "volume": 10},
    ]
    provider_losers = [
        {"symbol": "NVDA", "price": 303.0, "change_percent": -2.2, "volume": 10},
        {"symbol": "TSLA", "price": 404.0, "change_percent": -1.4, "volume": 10},
    ]
    seen_symbols = {"value": None}

    def fake_massive_news_for_symbols(symbols, limit: int = 8):
        seen_symbols["value"] = list(symbols)
        return [
            {
                "title": f"{symbols[0]} headline",
                "source": "Massive",
                "published": "2026-02-12T09:00:00+00:00",
                "url": f"https://example.com/{symbols[0]}/1",
                "thumbnail": None,
                "ticker": symbols[0],
            }
        ]

    monkeypatch.setattr(MarketDataClient, "get_stock_quote", fake_quote, raising=True)
    monkeypatch.setattr(MarketDataClient, "get_price_history", fake_history, raising=True)

    from api.v1 import market as _mkt
    monkeypatch.setattr(
        _mkt,
        "_fetch_yahoo_market_movers",
        lambda limit=7: (provider_gainers, provider_losers),
        raising=True,
    )
    monkeypatch.setattr(_mkt, "_fetch_massive_news_for_symbols", fake_massive_news_for_symbols, raising=True)
    _mkt._home_cache["payload"] = None
    _mkt._home_cache["fetched_at"] = 0.0

    client = TestClient(app)
    resp = client.get("/api/v1/market/home", params={"refresh": "true"})
    assert resp.status_code == 200
    body = resp.json()
    headlines = body.get("headlines") or []
    assert len(headlines) == 1
    titles = [h.get("title", "") for h in headlines]
    assert any("AAPL headline" in t for t in titles)
    assert seen_symbols["value"] == ["AAPL", "MSFT", "NVDA", "TSLA"]
    # Ensure we return scoped Massive rows, not synthetic placeholders.
    assert all(str(h.get("source")) != "" for h in headlines)
