"""Technical indicators and trend classification (pure computations)."""

from __future__ import annotations

from statistics import pstdev
from typing import List

from shared.schemas import BollingerBands, MACDResult, RSIResult, StochasticResult, TrendAnalysis


class TechnicalIndicatorService:
    @staticmethod
    def sma(prices: List[float], period: int) -> float:
        if not prices:
            return 0.0
        if len(prices) < period:
            return sum(prices) / len(prices)
        window = prices[-period:]
        return sum(window) / period

    @staticmethod
    def ema(prices: List[float], period: int) -> float:
        if not prices:
            return 0.0
        if len(prices) < period:
            return sum(prices) / len(prices)
        k = 2.0 / (period + 1.0)
        ema_val = prices[0]
        for p in prices[1:]:
            ema_val = (p - ema_val) * k + ema_val
        return ema_val

    @staticmethod
    def rsi(prices: List[float], period: int = 14) -> RSIResult:
        if len(prices) < period + 1:
            return RSIResult(value=50.0, condition="neutral")

        gains: List[float] = []
        losses: List[float] = []
        for i in range(1, len(prices)):
            delta = prices[i] - prices[i - 1]
            if delta >= 0:
                gains.append(delta)
                losses.append(0.0)
            else:
                gains.append(0.0)
                losses.append(-delta)

        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period
        for i in range(period, len(gains)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period

        if avg_loss == 0:
            value = 100.0
        else:
            rs = avg_gain / avg_loss
            value = 100.0 - (100.0 / (1.0 + rs))

        if value >= 70:
            cond = "overbought"
        elif value <= 30:
            cond = "oversold"
        else:
            cond = "neutral"

        return RSIResult(value=round(value, 2), condition=cond)

    @staticmethod
    def macd(prices: List[float], fast: int = 12, slow: int = 26, signal: int = 9) -> MACDResult:
        if len(prices) < slow:
            return MACDResult(macd_line=0.0, signal_line=0.0, histogram=0.0, trend="neutral")

        def ema_series(vals: List[float], period: int) -> List[float]:
            if not vals:
                return []
            k = 2.0 / (period + 1.0)
            out = [vals[0]]
            for v in vals[1:]:
                out.append((v - out[-1]) * k + out[-1])
            return out

        fast_ema = ema_series(prices, fast)
        slow_ema = ema_series(prices, slow)
        macd_line_series = [f - s for f, s in zip(fast_ema, slow_ema)]
        signal_series = ema_series(macd_line_series, signal)

        macd_line = macd_line_series[-1]
        signal_line = signal_series[-1]
        hist = macd_line - signal_line

        if macd_line > signal_line and hist > 0:
            trend = "bullish"
        elif macd_line < signal_line and hist < 0:
            trend = "bearish"
        else:
            trend = "neutral"

        return MACDResult(
            macd_line=round(macd_line, 4),
            signal_line=round(signal_line, 4),
            histogram=round(hist, 4),
            trend=trend,
        )

    @staticmethod
    def bollinger(prices: List[float], period: int = 20, std_dev: float = 2.0) -> BollingerBands:
        if not prices:
            return BollingerBands(upper_band=0.0, middle_band=0.0, lower_band=0.0, bandwidth=0.0, percent_b=0.5)
        if len(prices) < period:
            current = prices[-1]
            return BollingerBands(upper_band=current, middle_band=current, lower_band=current, bandwidth=0.0, percent_b=0.5)

        window = prices[-period:]
        middle = sum(window) / period
        std = pstdev(window)  # population std dev
        upper = middle + (std_dev * std)
        lower = middle - (std_dev * std)
        bandwidth = (upper - lower) / middle if middle else 0.0
        pct_b = (prices[-1] - lower) / (upper - lower) if (upper - lower) else 0.5
        return BollingerBands(
            upper_band=round(upper, 2),
            middle_band=round(middle, 2),
            lower_band=round(lower, 2),
            bandwidth=round(bandwidth, 4),
            percent_b=round(pct_b, 4),
        )

    @staticmethod
    def stochastic(prices: List[float], k_period: int = 14, d_period: int = 3, smooth_k: int = 3) -> StochasticResult:
        # If we don't have OHLC, approximate highs/lows with closes.
        if len(prices) < k_period:
            return StochasticResult(percent_k=50.0, percent_d=50.0, condition="neutral", signal="hold")

        raw_k: List[float] = []
        for i in range(k_period - 1, len(prices)):
            window = prices[i - k_period + 1 : i + 1]
            hi = max(window)
            lo = min(window)
            close = prices[i]
            if hi == lo:
                raw_k.append(50.0)
            else:
                raw_k.append(((close - lo) / (hi - lo)) * 100.0)

        # smooth K
        smoothed: List[float] = []
        for i in range(len(raw_k)):
            start = max(0, i - smooth_k + 1)
            chunk = raw_k[start : i + 1]
            smoothed.append(sum(chunk) / len(chunk))

        percent_k = smoothed[-1]
        d_chunk = smoothed[-d_period:] if len(smoothed) >= d_period else smoothed
        percent_d = sum(d_chunk) / len(d_chunk) if d_chunk else 50.0

        if percent_k >= 80:
            cond = "overbought"
        elif percent_k <= 20:
            cond = "oversold"
        else:
            cond = "neutral"

        # crossover heuristic
        signal = "hold"
        if len(smoothed) >= 2:
            prev_k = smoothed[-2]
            prev_d_chunk = smoothed[-(d_period + 1) : -1] if len(smoothed) >= d_period + 1 else smoothed[:-1]
            prev_d = sum(prev_d_chunk) / len(prev_d_chunk) if prev_d_chunk else percent_d
            if prev_k <= prev_d and percent_k > percent_d and percent_k < 50:
                signal = "buy"
            elif prev_k >= prev_d and percent_k < percent_d and percent_k > 50:
                signal = "sell"

        return StochasticResult(
            percent_k=round(percent_k, 2),
            percent_d=round(percent_d, 2),
            condition=cond,
            signal=signal,
        )

    def analyze_trend(self, prices: List[float], symbol: str = "") -> TrendAnalysis:
        current = prices[-1] if prices else 0.0

        sma_20 = self.sma(prices, 20)
        sma_50 = self.sma(prices, 50)
        sma_200 = self.sma(prices, 200)
        ema_12 = self.ema(prices, 12)
        ema_26 = self.ema(prices, 26)

        rsi = self.rsi(prices)
        macd = self.macd(prices)
        boll = self.bollinger(prices)
        stoch = self.stochastic(prices)

        # short-term trend
        if current > sma_20 > sma_50:
            short_term = "bullish"
        elif current < sma_20 < sma_50:
            short_term = "bearish"
        else:
            short_term = "neutral"

        # long-term trend
        price_vs_200 = "above" if current > sma_200 else "below"
        if current > sma_200 and sma_50 > sma_200:
            long_term = "bullish"
        elif current < sma_200 and sma_50 < sma_200:
            long_term = "bearish"
        else:
            long_term = "neutral"

        bullish = 0.0
        bearish = 0.0
        bullish += 1.0 if short_term == "bullish" else 0.0
        bearish += 1.0 if short_term == "bearish" else 0.0
        bullish += 1.0 if long_term == "bullish" else 0.0
        bearish += 1.0 if long_term == "bearish" else 0.0
        bullish += 1.0 if macd.trend == "bullish" else 0.0
        bearish += 1.0 if macd.trend == "bearish" else 0.0
        bullish += 0.5 if rsi.condition == "oversold" else 0.0
        bearish += 0.5 if rsi.condition == "overbought" else 0.0

        if bullish > bearish:
            direction = "bullish"
            strength = min(bullish / 3.5, 1.0)
        elif bearish > bullish:
            direction = "bearish"
            strength = min(bearish / 3.5, 1.0)
        else:
            direction = "neutral"
            strength = 0.5

        return TrendAnalysis(
            symbol=symbol,
            direction=direction,
            strength=round(float(strength), 2),
            rsi=rsi,
            macd=macd,
            bollinger=boll,
            stochastic=stoch,
            sma_20=round(sma_20, 2),
            sma_50=round(sma_50, 2),
            sma_200=round(sma_200, 2),
            ema_12=round(ema_12, 2),
            ema_26=round(ema_26, 2),
            price_vs_sma_200=price_vs_200,
            short_term_trend=short_term,
            long_term_trend=long_term,
        )


technical_indicator_service = TechnicalIndicatorService()

