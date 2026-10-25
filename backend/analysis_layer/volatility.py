"""Volatility computations (pure computations)."""

from __future__ import annotations

from math import log, sqrt
from statistics import stdev
from typing import List, Optional

from shared.schemas import VolatilityAnalysis


class VolatilityService:
    @staticmethod
    def historical_volatility(prices: List[float], period: int, annualize: bool = True) -> float:
        if len(prices) < period + 1:
            return 0.0
        window = prices[-(period + 1) :]
        rets: List[float] = []
        for i in range(1, len(window)):
            p0 = window[i - 1]
            p1 = window[i]
            if p0 and p1 and p0 > 0 and p1 > 0:
                rets.append(log(p1 / p0))
        if len(rets) < 2:
            return 0.0
        sigma = stdev(rets)
        if annualize:
            sigma *= sqrt(252.0)
        return round(sigma * 100.0, 2)

    @staticmethod
    def classify_from_iv_rank(iv_rank: float) -> str:
        if iv_rank < 25:
            return "low"
        if iv_rank < 50:
            return "moderate"
        if iv_rank < 75:
            return "high"
        return "extreme"

    @staticmethod
    def recommendation(iv_rank: float, hv_30: float, current_iv: float) -> str:
        iv_premium = current_iv - hv_30 if current_iv else 0.0
        if iv_rank >= 70:
            if iv_premium > 5:
                return "SELL PREMIUM: High IV Rank + IV > HV. Consider iron condors, credit spreads, or covered calls."
            return "SELL PREMIUM: High IV Rank. Consider credit spreads or iron condors."
        if iv_rank >= 50:
            return "NEUTRAL/SELL: Moderate-high IV. Consider neutral strategies like iron condors or butterflies."
        if iv_rank >= 30:
            return "MIXED: Moderate IV. Debit spreads or directional plays may work."
        if iv_premium < -5:
            return "BUY PREMIUM: Low IV Rank + IV < HV. Consider long options, straddles, or debit spreads."
        return "BUY PREMIUM: Low IV Rank. Options are cheap - consider debit spreads or long options."

    def analyze(self, prices: List[float], symbol: str = "", current_iv: Optional[float] = None) -> VolatilityAnalysis:
        hv_10 = self.historical_volatility(prices, 10)
        hv_30 = self.historical_volatility(prices, 30)
        hv_60 = self.historical_volatility(prices, 60)

        # Without a dedicated IV history feed, we don't compute IV rank/percentile yet.
        iv_rank = None
        iv_percentile = None

        # Estimate volatility level from HV trend if IV rank isn't available.
        if hv_10 > hv_30 * 1.2:
            vol_level = "high"
        elif hv_10 < hv_30 * 0.8:
            vol_level = "low"
        else:
            vol_level = "moderate"

        if hv_10 > hv_30 * 1.1:
            hv_trend = "increasing"
        elif hv_10 < hv_30 * 0.9:
            hv_trend = "decreasing"
        else:
            hv_trend = "stable"

        # Use HV as proxy for IV if current IV isn't available.
        iv_proxy = float(current_iv) if current_iv is not None else float(hv_30)
        rec = self.recommendation(iv_rank or 50.0, hv_30, iv_proxy)

        return VolatilityAnalysis(
            symbol=symbol,
            historical_volatility_10=hv_10,
            historical_volatility_30=hv_30,
            historical_volatility_60=hv_60,
            current_iv=current_iv,
            iv_rank=iv_rank,
            iv_percentile=iv_percentile,
            volatility_level=vol_level,
            hv_trend=hv_trend,
            recommendation=rec,
        )


volatility_service = VolatilityService()
