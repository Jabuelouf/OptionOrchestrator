from __future__ import annotations

import os
from types import SimpleNamespace

from market_data_layer import MarketDataClient


def test_options_chain_uses_midpoint_or_last_when_bid_ask_missing(monkeypatch) -> None:
    os.environ["MASSIVE_API_KEY"] = "test_key"
    c = MarketDataClient(provider="massive")

    # Stub Massive SDK client object on instance.
    class _StubMassive:
        def list_snapshot_options_chain(self, symbol, params=None):
            row = SimpleNamespace(
                details=SimpleNamespace(
                    contract_type="call",
                    expiration_date="2026-02-27",
                    strike_price=275.0,
                    ticker=f"{symbol}260227C00275000",
                ),
                underlying_asset=SimpleNamespace(price=275.5),
                last_trade=SimpleNamespace(price=1.23),
                last_quote=SimpleNamespace(bid=0.0, ask=0.0, midpoint=1.21),
                day=SimpleNamespace(volume=1234, close=1.2),
                open_interest=999,
                implied_volatility=0.42,
                greeks=SimpleNamespace(delta=0.5, gamma=0.03, theta=-0.02, vega=0.1, rho=0.01),
            )
            return [row]

    c._massive_client = _StubMassive()

    chain = c.get_options_chain("AAPL", expiration="2026-02-27")
    assert chain.calls
    first = chain.calls[0]
    assert first.last_price == 1.23
    assert first.bid == 1.21
    assert first.ask == 1.21
