from __future__ import annotations

from datetime import datetime, timezone

from api.server import app
from fastapi.testclient import TestClient
from market_data_layer import MarketDataClient
from shared.exceptions import MarketDataError
from shared.schemas import StockQuote


def _quote(symbol: str) -> StockQuote:
    return StockQuote(
        symbol=symbol.upper(),
        company_name=symbol.upper(),
        price=100.0,
        change=1.0,
        change_percent=1.0,
        volume=1000,
        avg_volume=1000,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


def test_market_analysis_survives_history_provider_failure(monkeypatch) -> None:
    def fake_quote(self: MarketDataClient, symbol: str):
        return _quote(symbol)

    def fake_history(self: MarketDataClient, symbol: str, period: str = "1mo", interval: str = "1d"):
        raise MarketDataError("history unavailable")

    monkeypatch.setattr(MarketDataClient, "get_stock_quote", fake_quote, raising=True)
    monkeypatch.setattr(MarketDataClient, "get_price_history", fake_history, raising=True)

    client = TestClient(app)
    resp = client.get("/api/v1/market/NFLX/analysis")
    assert resp.status_code == 200
    body = resp.json()
    assert body["quote"]["symbol"] == "NFLX"
    assert body["history"] == []


def test_market_history_returns_empty_list_on_provider_failure(monkeypatch) -> None:
    def fake_history(self: MarketDataClient, symbol: str, period: str = "1mo", interval: str = "1d"):
        raise MarketDataError("history unavailable")

    monkeypatch.setattr(MarketDataClient, "get_price_history", fake_history, raising=True)

    client = TestClient(app)
    resp = client.get("/api/v1/market/NFLX/history")
    assert resp.status_code == 200
    assert resp.json() == []
