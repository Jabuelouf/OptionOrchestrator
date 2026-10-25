from api.v1.strategies import compare_strategies


def test_compare_strategies_returns_expected_keys(monkeypatch) -> None:
    monkeypatch.setenv("MARKET_DATA_PROVIDER", "mock")
    res = compare_strategies({"symbol": "SPY", "risk_tolerance": "moderate"})
    assert "symbol" in res
    assert "current_price" in res
    assert "strategy_scores" in res
