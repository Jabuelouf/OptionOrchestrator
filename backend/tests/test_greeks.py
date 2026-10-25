from analysis_layer import GreeksAnalyzer
from shared.schemas import OptionLeg, PositionSnapshot


def test_long_call_has_positive_delta_and_gamma() -> None:
    analyzer = GreeksAnalyzer()
    position = PositionSnapshot(
        symbol="AAPL",
        legs=[
            OptionLeg(
                option_type="long_call",
                strike=100.0,
                expiry="2030-12-20",
                quantity=1,
                side="long",
                entry_price=5.0,
            )
        ],
    )

    greeks = analyzer.calculate(position=position, spot_price=102.0, implied_vol=0.25, risk_free_rate=0.03)

    assert greeks.delta > 0
    assert greeks.gamma > 0
    assert greeks.vega > 0


def test_short_put_flips_sign_from_long_put() -> None:
    analyzer = GreeksAnalyzer()

    long_put = PositionSnapshot(
        symbol="AAPL",
        legs=[
            OptionLeg(
                option_type="long_put",
                strike=100.0,
                expiry="2030-12-20",
                quantity=1,
                side="long",
                entry_price=4.0,
            )
        ],
    )
    short_put = PositionSnapshot(
        symbol="AAPL",
        legs=[
            OptionLeg(
                option_type="short_put",
                strike=100.0,
                expiry="2030-12-20",
                quantity=-1,
                side="short",
                entry_price=4.0,
            )
        ],
    )

    long_g = analyzer.calculate(position=long_put, spot_price=98.0, implied_vol=0.30, risk_free_rate=0.03)
    short_g = analyzer.calculate(position=short_put, spot_price=98.0, implied_vol=0.30, risk_free_rate=0.03)

    assert long_g.delta < 0
    assert short_g.delta > 0
    assert short_g.gamma < 0


def test_scenario_pnl_moves_with_direction_for_long_call() -> None:
    analyzer = GreeksAnalyzer()
    position = PositionSnapshot(
        symbol="MSFT",
        legs=[
            OptionLeg(
                option_type="call",
                strike=100.0,
                expiry="2030-12-20",
                quantity=1,
                side="long",
            )
        ],
    )

    pnl = analyzer.scenario_pnl(position=position, pct_moves=[-0.05, 0.0, 0.05], spot_price=100.0)
    assert pnl[-0.05] < pnl[0.0]
    assert pnl[0.05] > pnl[0.0]
