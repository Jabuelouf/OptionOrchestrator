"""Tests for /api/v1/backtest/run endpoint."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from api.server import app
from fastapi.testclient import TestClient
from market_data_layer import MarketDataClient


def test_backtest_returns_bar_chart_series(monkeypatch) -> None:
    """Backtest response should include API-backed daily return and trade P/L series."""

    def fake_history(self: MarketDataClient, symbol: str, period: str = "2y", interval: str = "1d"):
        start = datetime(2024, 1, 1, tzinfo=timezone.utc)
        out = []
        # 120 daily bars with a trend + oscillation to produce entries/exits.
        for i in range(120):
            px = 100.0 + (i * 0.15) + ((-1.0) ** i) * 0.8
            dt = (start + timedelta(days=i)).isoformat()
            out.append(type("Bar", (), {"date": dt, "open": px, "high": px * 1.01, "low": px * 0.99, "close": px, "volume": 1_000_000}))
        return out

    monkeypatch.setattr(MarketDataClient, "get_price_history", fake_history, raising=True)

    client = TestClient(app)
    resp = client.post(
        "/api/v1/backtest/run",
        json={
            "symbol": "SPY",
            "strategy": "sma_crossover",
            "config": {
                "initial_capital": 10000,
                "commission": 0,
                "start_date": "2024-01-01",
                "end_date": "2025-12-31",
            },
        },
    )
    assert resp.status_code == 200
    body = resp.json()

    assert "daily_returns" in body
    assert isinstance(body["daily_returns"], list)
    assert len(body["daily_returns"]) > 0
    assert "trade_pnl_series" in body
    assert isinstance(body["trade_pnl_series"], list)
    assert "trades" in body
    assert isinstance(body["trades"], list)
