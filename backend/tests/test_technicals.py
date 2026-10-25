from analysis_layer.technicals import technical_indicator_service


def test_trend_analysis_returns_expected_shape() -> None:
    # Simple increasing series should generally be bullish.
    prices = [float(i) for i in range(1, 300)]
    t = technical_indicator_service.analyze_trend(prices, symbol="SPY")
    assert t.symbol == "SPY"
    assert t.direction in {"bullish", "bearish", "neutral"}
    assert 0.0 <= t.strength <= 1.0
    assert t.rsi.value >= 0.0

