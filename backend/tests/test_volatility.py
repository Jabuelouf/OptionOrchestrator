from analysis_layer.volatility import volatility_service


def test_volatility_analysis_returns_expected_shape() -> None:
    prices = [100.0 + (i * 0.1) for i in range(300)]
    v = volatility_service.analyze(prices, symbol="SPY", current_iv=None)
    assert v.symbol == "SPY"
    assert v.historical_volatility_10 >= 0.0
    assert v.historical_volatility_30 >= 0.0
    assert v.volatility_level in {"low", "moderate", "high", "extreme"}
    assert v.hv_trend in {"increasing", "decreasing", "stable"}

