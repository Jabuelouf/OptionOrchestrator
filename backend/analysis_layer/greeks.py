"""Greeks and scenario analysis using Black-Scholes approximations."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from math import erf, exp, log, pi, sqrt
from typing import Dict, List, Tuple

from shared.schemas import PositionGreeks, PositionSnapshot

CONTRACT_MULTIPLIER = 100.0
DEFAULT_IV = 0.30
DEFAULT_RATE = 0.04
MIN_T = 1.0 / 365.0


def black_scholes_price(option_type: str, spot: float, strike: float, t: float, rate: float, sigma: float) -> float:
    """European Black-Scholes price (approximation)."""
    sigma = max(float(sigma), 1e-6)
    t = max(float(t), MIN_T)
    spot = float(spot)
    strike = float(strike)
    rate = float(rate)

    sigma_sqrt_t = sigma * sqrt(t)
    d1 = (log(spot / strike) + (rate + 0.5 * sigma * sigma) * t) / sigma_sqrt_t
    d2 = d1 - sigma_sqrt_t

    def cdf(x: float) -> float:
        return 0.5 * (1.0 + erf(x / sqrt(2.0)))

    if option_type == "call":
        return max(0.0, spot * cdf(d1) - strike * exp(-rate * t) * cdf(d2))
    return max(0.0, strike * exp(-rate * t) * cdf(-d2) - spot * cdf(-d1))


@dataclass
class LegGreeks:
    delta: float
    gamma: float
    theta: float
    vega: float


class GreeksAnalyzer:
    """Computes portfolio Greeks using Black-Scholes per-leg approximations."""

    def calculate(
        self,
        position: PositionSnapshot,
        spot_price: float | None = None,
        implied_vol: float = DEFAULT_IV,
        risk_free_rate: float = DEFAULT_RATE,
    ) -> PositionGreeks:
        spot = float(spot_price) if spot_price is not None else self._fallback_spot(position)

        total_delta = 0.0
        total_gamma = 0.0
        total_theta = 0.0
        total_vega = 0.0

        for leg in position.legs:
            leg_type = self._infer_option_type(leg.option_type)
            t = self._time_to_expiry_years(leg.expiry)
            greeks = self._black_scholes_greeks(
                option_type=leg_type,
                spot=spot,
                strike=leg.strike,
                t=t,
                rate=risk_free_rate,
                sigma=max(implied_vol, 0.01),
            )
            qty = float(leg.quantity)
            total_delta += greeks.delta * qty * CONTRACT_MULTIPLIER
            total_gamma += greeks.gamma * qty * CONTRACT_MULTIPLIER
            total_theta += greeks.theta * qty * CONTRACT_MULTIPLIER
            total_vega += greeks.vega * qty * CONTRACT_MULTIPLIER

        return PositionGreeks(
            delta=round(total_delta, 4),
            gamma=round(total_gamma, 6),
            theta=round(total_theta, 4),
            vega=round(total_vega, 4),
            est_max_loss=None,
        )

    def scenario_pnl(
        self,
        position: PositionSnapshot,
        pct_moves: List[float],
        spot_price: float | None = None,
        implied_vol: float = DEFAULT_IV,
        risk_free_rate: float = DEFAULT_RATE,
    ) -> Dict[float, float]:
        spot = float(spot_price) if spot_price is not None else self._fallback_spot(position)
        greeks = self.calculate(
            position=position,
            spot_price=spot,
            implied_vol=implied_vol,
            risk_free_rate=risk_free_rate,
        )

        pnl: Dict[float, float] = {}
        for move in pct_moves:
            d_s = spot * float(move)
            # Delta-gamma approximation
            est = (greeks.delta * d_s) + (0.5 * greeks.gamma * (d_s ** 2))
            pnl[float(move)] = round(est, 2)
        return pnl

    def _fallback_spot(self, position: PositionSnapshot) -> float:
        if not position.legs:
            return 100.0
        return float(sum(leg.strike for leg in position.legs) / len(position.legs))

    def _infer_option_type(self, raw: str) -> str:
        token = raw.lower()
        if "put" in token:
            return "put"
        return "call"

    def _time_to_expiry_years(self, expiry: str) -> float:
        try:
            y, m, d = expiry.split("-")
            exp_date = date(int(y), int(m), int(d))
            days = max((exp_date - date.today()).days, 1)
            return max(days / 365.0, MIN_T)
        except Exception:
            return 30.0 / 365.0

    def _black_scholes_greeks(
        self,
        option_type: str,
        spot: float,
        strike: float,
        t: float,
        rate: float,
        sigma: float,
    ) -> LegGreeks:
        d1, d2 = self._d1_d2(spot, strike, t, rate, sigma)
        nd1 = self._norm_cdf(d1)
        nd2 = self._norm_cdf(d2)
        pdf_d1 = self._norm_pdf(d1)

        if option_type == "call":
            delta = nd1
            theta = (
                -(spot * pdf_d1 * sigma) / (2 * sqrt(t))
                - rate * strike * exp(-rate * t) * nd2
            ) / 365.0
        else:
            delta = nd1 - 1.0
            theta = (
                -(spot * pdf_d1 * sigma) / (2 * sqrt(t))
                + rate * strike * exp(-rate * t) * self._norm_cdf(-d2)
            ) / 365.0

        gamma = pdf_d1 / (spot * sigma * sqrt(t))
        # Vega scaled to 1 vol point (1.0% change)
        vega = (spot * pdf_d1 * sqrt(t)) / 100.0

        return LegGreeks(delta=delta, gamma=gamma, theta=theta, vega=vega)

    def _d1_d2(self, spot: float, strike: float, t: float, rate: float, sigma: float) -> Tuple[float, float]:
        sigma_sqrt_t = sigma * sqrt(t)
        d1 = (log(spot / strike) + (rate + 0.5 * sigma * sigma) * t) / sigma_sqrt_t
        d2 = d1 - sigma_sqrt_t
        return d1, d2

    def _norm_cdf(self, x: float) -> float:
        return 0.5 * (1.0 + erf(x / sqrt(2.0)))

    def _norm_pdf(self, x: float) -> float:
        return exp(-0.5 * x * x) / sqrt(2.0 * pi)
