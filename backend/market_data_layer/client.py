"""Market data client with Massive/Yahoo/Finnhub provider strategy."""

import os
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import requests
from shared.exceptions import MarketDataError
from shared.schemas import OHLCV, MarketOverview, MarketSnapshot, OptionContract, OptionsChain, StockQuote

try:
    from massive import RESTClient
    _HAS_MASSIVE_SDK = True
except ImportError:
    _HAS_MASSIVE_SDK = False

try:
    import finnhub
    _HAS_FINNHUB_SDK = True
except ImportError:
    _HAS_FINNHUB_SDK = False

try:
    import yfinance as yf
    _HAS_YFINANCE = True
except ImportError:
    _HAS_YFINANCE = False


class MarketDataClient:
    """Fetches market snapshot data from configured providers."""
    _history_cache: Dict[str, tuple[float, List[OHLCV], str, Optional[str]]] = {}
    _twelvedata_series_cache: Dict[str, tuple[float, List[OHLCV]]] = {}

    def __init__(
        self,
        provider: Optional[str] = None,
        timeout: int = 10,
        max_attempts: int = 3,
        backoff: float = 0.25,
        *,
        allow_yfinance: bool = True,
    ) -> None:
        self.provider = (provider or os.environ.get("MARKET_DATA_PROVIDER", "auto")).lower()
        self.timeout = timeout
        self.max_attempts = int(max_attempts) if max_attempts and int(max_attempts) > 0 else 1
        self.backoff = float(backoff) if backoff and float(backoff) > 0 else 0.0
        self.allow_yfinance = allow_yfinance
        self.massive_api_base = os.environ.get("MASSIVE_API_BASE", "https://api.massive.com").strip().rstrip("/")
        self.massive_api_key = (
            os.environ.get("MASSIVE_API_KEY")
            or os.environ.get("POLYGON_API_KEY")
            or ""
        ).strip()
        self.finnhub_api_key = (os.environ.get("FINNHUB_API_KEY") or "").strip()
        self.finnhub_api_base = os.environ.get("FINNHUB_API_BASE", "https://finnhub.io").strip().rstrip("/")
        self.twelvedata_api_key = (os.environ.get("TWELVEDATA_API_KEY") or "").strip()
        self.twelvedata_api_base = os.environ.get("TWELVEDATA_API_BASE", "https://api.twelvedata.com").strip().rstrip("/")
        self._finnhub_client = None
        if _HAS_FINNHUB_SDK and self.finnhub_api_key:
            try:
                # Official Finnhub SDK client.
                self._finnhub_client = finnhub.Client(api_key=self.finnhub_api_key)
            except Exception:
                self._finnhub_client = None
        self.massive_options_only = str(
            os.environ.get("MASSIVE_OPTIONS_ONLY", "true")
        ).strip().lower() in {"1", "true", "yes", "on"}
        self._massive_client = None
        if _HAS_MASSIVE_SDK and self.massive_api_key:
            try:
                self._massive_client = RESTClient(
                    api_key=self.massive_api_key,
                    connect_timeout=float(self.timeout),
                    read_timeout=float(self.timeout),
                    retries=int(self.max_attempts),
                    base=self.massive_api_base,
                    pagination=False,
                )
            except Exception:
                self._massive_client = None

        # Per-instance (per-request) diagnostics. Safe because API layer instantiates a new client per request.
        self.last_provider: str | None = None
        self.last_detail: str | None = None
        self._last_http_status: int | None = None
        self._last_http_url: str | None = None
        # Light cache for ticker name lookups (avoids repeated calls per session).
        self._ticker_name_cache: Dict[str, Optional[str]] = {}
        self.history_cache_ttl = int(os.environ.get("HISTORY_CACHE_TTL_SECONDS", "60") or "60")

    @staticmethod
    def _mock_base_price(symbol: str) -> float:
        known_prices = {"SPY": 510.0, "QQQ": 440.0, "AAPL": 190.0, "^VIX": 18.5, "VIX": 18.5}
        return known_prices.get(symbol, float(80 + sum(ord(char) for char in symbol) % 220))

    def _mock_stock_quote(self, symbol: str) -> StockQuote:
        base = self._mock_base_price(symbol)
        change_percent = ((sum(ord(char) for char in symbol) % 17) - 8) / 10
        change = base * change_percent / 100
        return StockQuote(
            symbol=symbol,
            company_name=f"{symbol} demo instrument",
            price=round(base, 2),
            change=round(change, 2),
            change_percent=round(change_percent, 2),
            volume=1_250_000,
            avg_volume=1_100_000,
            fifty_two_week_high=round(base * 1.18, 2),
            fifty_two_week_low=round(base * 0.76, 2),
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    def _mock_price_history(self, symbol: str, points: int = 180) -> List[OHLCV]:
        base = self._mock_base_price(symbol)
        today = date.today()
        rows: List[OHLCV] = []
        for index in range(points):
            trend = (index - points) * 0.0008
            cycle = ((index % 14) - 7) * 0.0015
            close = base * (1 + trend + cycle)
            open_price = close * (1 - 0.0015)
            rows.append(
                OHLCV(
                    date=(today - timedelta(days=points - index)).isoformat(),
                    open=round(open_price, 2),
                    high=round(close * 1.006, 2),
                    low=round(open_price * 0.994, 2),
                    close=round(close, 2),
                    volume=900_000 + index * 2_000,
                )
            )
        return rows

    def _to_iso_ts(self, raw_ts: Any) -> str:
        """Best-effort epoch conversion handling ns/ms/s."""
        if raw_ts is None:
            return datetime.now(timezone.utc).isoformat()
        try:
            ts = float(raw_ts)
            if ts > 1e17:  # ns
                ts = ts / 1_000_000_000.0
            elif ts > 1e13:  # us
                ts = ts / 1_000_000.0
            elif ts > 1e11:  # ms
                ts = ts / 1000.0
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        except Exception:
            return datetime.now(timezone.utc).isoformat()

    def _massive_headers(self) -> Dict[str, str]:
        # Massive official SDKs use Authorization: Bearer <API_KEY>.
        # Query-param apiKey is still supported for Polygon compatibility, but headers are preferred.
        if not self.massive_api_key:
            return {}
        return {"Authorization": f"Bearer {self.massive_api_key}"}

    def get_snapshot(self, symbol: str) -> MarketSnapshot:
        symbol = symbol.upper().strip()
        if not symbol:
            raise MarketDataError("Symbol is required for market snapshot")

        if self.provider == "mock":
            quote = self._mock_stock_quote(symbol)
            self.last_provider = "mock"
            return MarketSnapshot(
                symbol=symbol,
                spot_price=quote.price,
                iv_percentile=50.0,
                support_levels=[round(quote.price * 0.95, 2)],
                resistance_levels=[round(quote.price * 1.05, 2)],
            )

        if self.provider in {"massive", "auto"} and self.massive_api_key:
            massive_snapshot = self._from_massive(symbol)
            if massive_snapshot is not None:
                return massive_snapshot
            if self.provider == "massive":
                raise MarketDataError("Massive provider failed to return snapshot")

        if self.provider in {"yahoo", "auto"}:
            yahoo_snapshot = self._from_yahoo(symbol)
            if yahoo_snapshot is not None:
                return yahoo_snapshot
            if self.provider == "yahoo":
                raise MarketDataError("Yahoo provider failed to return snapshot")

        raise MarketDataError("Failed to fetch market snapshot")

    def get_stock_quote(self, symbol: str) -> StockQuote:
        """Return a UI-friendly quote payload (Option_Advisor-compatible fields)."""
        symbol = symbol.upper().strip()
        if not symbol:
            raise MarketDataError("Symbol is required for stock quote")

        if self.provider == "mock":
            self.last_provider = "mock"
            self.last_detail = "deterministic_demo_data"
            return self._mock_stock_quote(symbol)

        # Preferred non-Massive quote path for equities when configured.
        if self.provider in {"finnhub", "auto"} and self.finnhub_api_key:
            q = self._quote_from_finnhub(symbol)
            if q is not None:
                self.last_provider = "finnhub"
                self.last_detail = None
                return q
            if self.provider == "finnhub":
                raise MarketDataError("Finnhub provider failed to return stock quote")

        # Optionally disable Massive for stock quotes to reserve Massive usage for options only.
        if self.provider in {"twelvedata", "auto"} and self.twelvedata_api_key:
            q = self._quote_from_twelvedata(symbol)
            if q is not None:
                self.last_provider = "twelvedata"
                if self.last_detail is None:
                    self.last_detail = None
                return q
            if self.provider == "twelvedata":
                raise MarketDataError("Twelve Data provider failed to return stock quote")

        # Optionally disable Massive for stock quotes to reserve Massive usage for options only.
        if self.provider in {"massive", "auto"} and self.massive_api_key and not self.massive_options_only:
            q = self._quote_from_massive_snapshot(symbol)
            if q is not None:
                self.last_provider = "massive"
                self.last_detail = None
                return q
            # Snapshot requires paid plan; prev-day aggs work on free tier.
            q = self._quote_from_massive_prev(symbol)
            if q is not None:
                self.last_provider = "massive"
                self.last_detail = "quote_from_prev_aggs"
                return q
            if self.provider == "massive":
                raise MarketDataError("Massive provider failed to return stock quote")

        # Yahoo quote endpoint is a reasonable fallback for UI parity.
        q = self._quote_from_yahoo(symbol)
        if q is not None:
            self.last_provider = "yahoo"
            self.last_detail = None
            return q

        # v7/finance/quote is frequently blocked; try v8/finance/chart as fallback.
        q = self._quote_from_yahoo_chart(symbol)
        if q is not None:
            self.last_provider = "yahoo_chart"
            self.last_detail = "quote_from_chart_fallback"
            return q

        # yfinance library uses crumb-based auth and is more reliable than raw HTTP.
        if self.allow_yfinance:
            q = self._quote_from_yfinance(symbol)
            if q is not None:
                self.last_provider = "yfinance"
                self.last_detail = None
                return q

        raise MarketDataError("Failed to fetch stock quote")

    def _quote_from_finnhub(self, symbol: str) -> Optional[StockQuote]:
        """Fetch stock quote from Finnhub quote endpoint (SDK-first)."""
        if not self.finnhub_api_key:
            return None

        clean_symbol = symbol.upper().strip()
        # Finnhub expects VIX as "^VIX" is Yahoo style.
        if clean_symbol == "^VIX":
            clean_symbol = "VIX"

        payload: Optional[Dict[str, Any]] = None
        if self._finnhub_client is not None:
            try:
                row = self._finnhub_client.quote(clean_symbol)
                if isinstance(row, dict):
                    payload = row
                else:
                    payload = None
            except Exception:
                return None
        else:
            # SDK unavailable: keep lightweight REST fallback.
            url = f"{self.finnhub_api_base}/api/v1/quote"
            payload = self._safe_get(
                url,
                params={"symbol": clean_symbol, "token": self.finnhub_api_key},
                headers={},
            )

        if not payload:
            return None

        # Finnhub response fields: c(current), d(change), dp(%), h, l, o, pc(prev close), t(epoch sec)
        price = payload.get("c")
        if price is None:
            return None
        try:
            price_f = float(price)
        except Exception:
            return None
        if price_f <= 0:
            return None

        change = payload.get("d")
        change_percent = payload.get("dp")
        prev_close = payload.get("pc")

        if change is None and prev_close is not None:
            try:
                change = price_f - float(prev_close)
            except Exception:
                change = 0.0
        if change_percent is None and prev_close is not None:
            try:
                prev_f = float(prev_close)
                change_percent = ((price_f - prev_f) / prev_f * 100.0) if prev_f else 0.0
            except Exception:
                change_percent = 0.0

        ts_epoch = payload.get("t")
        if ts_epoch:
            try:
                ts = datetime.fromtimestamp(int(ts_epoch), tz=timezone.utc).isoformat()
            except Exception:
                ts = datetime.now(timezone.utc).isoformat()
        else:
            ts = datetime.now(timezone.utc).isoformat()

        return StockQuote(
            symbol=symbol.upper().strip(),
            company_name=None,
            price=round(price_f, 4),
            change=round(float(change or 0.0), 4),
            change_percent=round(float(change_percent or 0.0), 4),
            volume=0,
            avg_volume=0,
            market_cap=None,
            pe_ratio=None,
            fifty_two_week_high=None,
            fifty_two_week_low=None,
            sector=None,
            industry=None,
            timestamp=ts,
        )

    def get_price_history(self, symbol: str, period: str = "1mo", interval: str = "1d") -> List[OHLCV]:
        """Return OHLCV history for charting (best-effort)."""
        symbol = symbol.upper().strip()
        if not symbol:
            raise MarketDataError("Symbol is required for price history")

        if self.provider == "mock":
            self.last_provider = "mock"
            self.last_detail = "deterministic_demo_data"
            return self._mock_price_history(symbol)

        cache_key = f"{symbol}|{period}|{interval}"
        cache_now = time.time()
        cached = self._history_cache.get(cache_key)
        if cached and (cache_now - float(cached[0])) < float(self.history_cache_ttl):
            self.last_provider = str(cached[2] or "cache")
            self.last_detail = "history_cache_hit"
            return list(cached[1])

        def _store(out: List[OHLCV], provider: str, detail: Optional[str]) -> List[OHLCV]:
            if out:
                self._history_cache[cache_key] = (time.time(), list(out), provider, detail)
            self.last_provider = provider
            self.last_detail = detail
            return out

        if self.provider in {"finnhub", "auto"} and self.finnhub_api_key:
            fh = self._history_from_finnhub(symbol, period=period, interval=interval)
            if fh:
                return _store(fh, "finnhub", None)
            if self.provider == "finnhub":
                self.last_provider = "finnhub"
                self.last_detail = "history_finnhub_unavailable"
                raise MarketDataError("Finnhub provider failed to fetch price history")

        if self.provider in {"twelvedata", "auto"} and self.twelvedata_api_key:
            td = self._history_from_twelvedata(symbol, period=period, interval=interval)
            if td:
                return _store(td, "twelvedata", self.last_detail)
            if self.provider == "twelvedata":
                self.last_provider = "twelvedata"
                self.last_detail = "history_twelvedata_unavailable"
                raise MarketDataError("Twelve Data provider failed to fetch price history")

        # Optionally disable Massive for stock history to reserve Massive usage for options only.
        if self.provider in {"massive", "auto"} and self.massive_api_key and not self.massive_options_only:
            massive = self._history_from_massive(symbol, period=period, interval=interval)
            if massive:
                return _store(massive, "massive", None)
            if self.provider == "massive":
                self.last_provider = "massive"
                self.last_detail = "history_massive_unavailable"
                raise MarketDataError("Massive provider failed to fetch price history")

        # Yahoo chart endpoint supports range/interval semantics matching the existing UI.
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        payload = self._safe_get(url, params={"range": period, "interval": interval})
        if not payload:
            if self.allow_yfinance:
                yhist = self._history_from_yfinance(symbol, period=period, interval=interval)
                if yhist:
                    return _store(yhist, "yfinance", "history_from_yfinance_fallback")
            self.last_provider = self.last_provider or "yahoo"
            self.last_detail = "history_yahoo_unavailable"
            raise MarketDataError("Failed to fetch price history")

        chart = (payload.get("chart") or {})
        results = (chart.get("result") or [])
        if not results:
            if self.allow_yfinance:
                yhist = self._history_from_yfinance(symbol, period=period, interval=interval)
                if yhist:
                    return _store(yhist, "yfinance", "history_from_yfinance_fallback")
            self.last_provider = self.last_provider or "yahoo"
            self.last_detail = "history_empty_result"
            return []
        first = results[0] or {}
        ts = first.get("timestamp") or []
        indicators = (first.get("indicators") or {}).get("quote") or []
        if not indicators:
            if self.allow_yfinance:
                yhist = self._history_from_yfinance(symbol, period=period, interval=interval)
                if yhist:
                    return _store(yhist, "yfinance", "history_from_yfinance_fallback")
            self.last_provider = self.last_provider or "yahoo"
            self.last_detail = "history_missing_indicators"
            return []
        quote = indicators[0] or {}

        opens = quote.get("open") or []
        highs = quote.get("high") or []
        lows = quote.get("low") or []
        closes = quote.get("close") or []
        vols = quote.get("volume") or []

        out: List[OHLCV] = []
        for i, t in enumerate(ts):
            try:
                o = float(opens[i]) if opens[i] is not None else None
                h = float(highs[i]) if highs[i] is not None else None
                l = float(lows[i]) if lows[i] is not None else None
                c = float(closes[i]) if closes[i] is not None else None
                v = int(vols[i]) if i < len(vols) and vols[i] is not None else 0
                if o is None or h is None or l is None or c is None:
                    continue
                dt = datetime.fromtimestamp(int(t), tz=timezone.utc).isoformat()
                out.append(OHLCV(date=dt, open=round(o, 4), high=round(h, 4), low=round(l, 4), close=round(c, 4), volume=v))
            except Exception:
                continue
        return _store(out, "yahoo", None)

    def _history_from_finnhub(self, symbol: str, period: str, interval: str) -> List[OHLCV]:
        if not self.finnhub_api_key:
            return []

        def _resolution(iv: str) -> str:
            v = (iv or "1d").strip().lower()
            if v in {"1d", "1day", "day"}:
                return "D"
            if v in {"1wk", "1w", "week"}:
                return "W"
            if v in {"1mo", "1month", "month"}:
                return "M"
            if v.endswith("m"):
                try:
                    n = int(v[:-1])
                    if n in {1, 5, 15, 30, 60}:
                        return str(n)
                except Exception:
                    return "D"
            if v.endswith("h"):
                try:
                    n = int(v[:-1])
                    mins = n * 60
                    if mins in {60}:
                        return str(mins)
                except Exception:
                    return "D"
            return "D"

        def _days(p: str) -> int:
            m = {
                "1d": 1, "5d": 5, "1mo": 30, "3mo": 90, "6mo": 180,
                "1y": 365, "2y": 730, "5y": 1825, "max": 3650,
            }
            return int(m.get((p or "1mo").strip().lower(), 30))

        clean_symbol = symbol.upper().strip()
        if clean_symbol == "^VIX":
            clean_symbol = "VIX"
        to_ts = int(time.time())
        from_ts = int((datetime.now(timezone.utc) - timedelta(days=_days(period))).timestamp())
        res = _resolution(interval)

        payload: Optional[Dict[str, Any]] = None
        if self._finnhub_client is not None:
            try:
                row = self._finnhub_client.stock_candles(clean_symbol, res, from_ts, to_ts)
                payload = row if isinstance(row, dict) else None
            except Exception:
                payload = None
        if payload is None:
            url = f"{self.finnhub_api_base}/api/v1/stock/candle"
            payload = self._safe_get(
                url,
                params={
                    "symbol": clean_symbol,
                    "resolution": res,
                    "from": from_ts,
                    "to": to_ts,
                    "token": self.finnhub_api_key,
                },
                headers={},
            )

        if not payload:
            return []
        if str(payload.get("s") or "").lower() != "ok":
            return []

        ts = payload.get("t") or []
        opens = payload.get("o") or []
        highs = payload.get("h") or []
        lows = payload.get("l") or []
        closes = payload.get("c") or []
        vols = payload.get("v") or []
        if not isinstance(ts, list):
            return []

        out: List[OHLCV] = []
        for i, t in enumerate(ts):
            try:
                o = float(opens[i])
                h = float(highs[i])
                l = float(lows[i])
                c = float(closes[i])
                v = int(vols[i]) if i < len(vols) and vols[i] is not None else 0
                dt = datetime.fromtimestamp(int(t), tz=timezone.utc).isoformat()
                out.append(OHLCV(date=dt, open=round(o, 4), high=round(h, 4), low=round(l, 4), close=round(c, 4), volume=v))
            except Exception:
                continue
        return out

    def _history_from_yfinance(self, symbol: str, period: str, interval: str) -> List[OHLCV]:
        if not _HAS_YFINANCE:
            return []
        try:
            ticker = yf.Ticker(symbol)
            frame = ticker.history(period=period, interval=interval, auto_adjust=False, actions=False)
            if frame is None or frame.empty:
                return []

            out: List[OHLCV] = []
            for idx, row in frame.iterrows():
                try:
                    o = row.get("Open")
                    h = row.get("High")
                    l = row.get("Low")
                    c = row.get("Close")
                    v = row.get("Volume", 0)
                    if o is None or h is None or l is None or c is None:
                        continue
                    dt = idx.to_pydatetime()
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    out.append(
                        OHLCV(
                            date=dt.isoformat(),
                            open=round(float(o), 4),
                            high=round(float(h), 4),
                            low=round(float(l), 4),
                            close=round(float(c), 4),
                            volume=int(v or 0),
                        )
                    )
                except Exception:
                    continue
            return out
        except Exception:
            return []

    def _quote_from_twelvedata(self, symbol: str) -> Optional[StockQuote]:
        rows = self._twelvedata_series(symbol, interval="1day", outputsize=2)
        if not rows:
            return None
        latest = rows[-1]
        prev = rows[-2] if len(rows) > 1 else rows[-1]
        try:
            price_f = float(latest.close)
            prev_f = float(prev.close)
        except Exception:
            return None
        change = round(price_f - prev_f, 4)
        chg_pct = round((change / prev_f * 100.0), 4) if prev_f else 0.0
        ts = str(latest.date or "")
        return StockQuote(
            symbol=symbol.upper().strip(),
            company_name=None,
            price=round(price_f, 4),
            change=change,
            change_percent=chg_pct,
            volume=int(latest.volume or 0),
            avg_volume=0,
            market_cap=None,
            pe_ratio=None,
            fifty_two_week_high=None,
            fifty_two_week_low=None,
            sector=None,
            industry=None,
            timestamp=ts,
        )

    def _history_from_twelvedata(self, symbol: str, period: str, interval: str) -> List[OHLCV]:
        td_interval = self._twelvedata_interval(interval)
        outsize = self._twelvedata_outputsize(period, td_interval)
        rows = self._twelvedata_series(symbol, interval=td_interval, outputsize=outsize)
        return rows

    def _twelvedata_interval(self, interval: str) -> str:
        v = (interval or "1d").strip().lower()
        mapping = {
            "1m": "1min",
            "5m": "5min",
            "15m": "15min",
            "30m": "30min",
            "1h": "1h",
            "1d": "1day",
            "1wk": "1week",
            "1mo": "1month",
        }
        return mapping.get(v, "1day")

    def _twelvedata_outputsize(self, period: str, td_interval: str) -> int:
        p = (period or "1mo").strip().lower()
        day_map = {
            "1d": 1,
            "5d": 5,
            "1mo": 30,
            "3mo": 90,
            "6mo": 180,
            "1y": 365,
            "2y": 730,
            "5y": 1825,
            "max": 3650,
        }
        days = int(day_map.get(p, 30))
        if td_interval == "1min":
            return max(2, min(5000, days * 390))
        if td_interval == "5min":
            return max(2, min(5000, days * 78))
        if td_interval == "15min":
            return max(2, min(5000, days * 26))
        if td_interval == "30min":
            return max(2, min(5000, days * 13))
        if td_interval == "1h":
            return max(2, min(5000, days * 7))
        return max(2, min(5000, days))

    def _twelvedata_series(self, symbol: str, interval: str, outputsize: int) -> List[OHLCV]:
        if not self.twelvedata_api_key:
            return []
        clean_symbol = symbol.upper().strip()
        key = f"{clean_symbol}|{interval}|{int(outputsize)}"
        now_ts = time.time()
        cached = self._twelvedata_series_cache.get(key)
        if cached and (now_ts - float(cached[0])) < float(self.history_cache_ttl):
            self.last_detail = "twelvedata_cache_hit"
            return list(cached[1])

        url = f"{self.twelvedata_api_base}/time_series"
        payload = self._safe_get(
            url,
            params={
                "symbol": clean_symbol,
                "interval": interval,
                "outputsize": int(outputsize),
                "apikey": self.twelvedata_api_key,
                "format": "JSON",
            },
            headers={},
        )
        if not payload:
            return []
        values = payload.get("values") or []
        if not isinstance(values, list) or not values:
            return []
        out: List[OHLCV] = []
        # API returns reverse-chronological values; normalize to oldest->newest.
        for row in reversed(values):
            if not isinstance(row, dict):
                continue
            try:
                dt_raw = str(row.get("datetime") or "").strip()
                if not dt_raw:
                    continue
                # Twelve Data returns "2026-02-24" (daily) or "2026-02-24 09:30:00" (intraday).
                # Normalize to ISO 8601: replace space separator with T, add timezone if absent.
                dt_raw = dt_raw.replace(" ", "T", 1)
                if "T" not in dt_raw:
                    dt_raw = f"{dt_raw}T00:00:00"
                if "+" not in dt_raw and "Z" not in dt_raw:
                    dt_raw = f"{dt_raw}+00:00"
                out.append(
                    OHLCV(
                        date=dt_raw,
                        open=round(float(row.get("open")), 4),
                        high=round(float(row.get("high")), 4),
                        low=round(float(row.get("low")), 4),
                        close=round(float(row.get("close")), 4),
                        volume=int(float(row.get("volume") or 0)),
                    )
                )
            except Exception:
                continue
        if out:
            self._twelvedata_series_cache[key] = (time.time(), list(out))
        return out

    def get_market_overview(self) -> MarketOverview:
        """Market overview for dashboard (VIX, SPY, QQQ)."""
        vix = self.get_stock_quote("^VIX")
        spy = self.get_stock_quote("SPY")
        qqq = self.get_stock_quote("QQQ")
        ts = datetime.now(timezone.utc).isoformat()
        return MarketOverview(
            vix=float(vix.price),
            vix_change=float(vix.change),
            spy_price=float(spy.price),
            spy_change_percent=float(spy.change_percent),
            qqq_price=float(qqq.price),
            qqq_change_percent=float(qqq.change_percent),
            timestamp=ts,
        )

    def get_options_expirations(self, symbol: str) -> List[str]:
        """Return available options expiration dates as YYYY-MM-DD strings."""
        symbol = symbol.upper().strip()
        if not symbol:
            raise MarketDataError("Symbol is required for options expirations")

        if self.provider == "mock":
            raise MarketDataError("Mock provider is disabled")

        if self.provider in {"massive", "auto"} and self.massive_api_key:
            exps = self._options_expirations_from_massive(symbol)
            if exps:
                self.last_provider = "massive"
                self.last_detail = None
                return exps
            if self.provider == "massive":
                raise MarketDataError("Massive provider failed to fetch options expirations")

        url = f"https://query2.finance.yahoo.com/v7/finance/options/{symbol}"
        payload = self._safe_get(url, params={})
        if not payload:
            raise MarketDataError("Failed to fetch options expirations")

        chain = (payload.get("optionChain") or {})
        results = chain.get("result") or []
        if not results:
            return []
        exp_dates = results[0].get("expirationDates") or []
        out: List[str] = []
        for e in exp_dates:
            try:
                out.append(date.fromtimestamp(int(e)).isoformat())
            except Exception:
                continue
        self.last_provider = "yahoo"
        self.last_detail = None
        return out

    def get_options_chain(self, symbol: str, expiration: Optional[str] = None) -> OptionsChain:
        """Return options chain for a symbol, optionally at a specific expiration YYYY-MM-DD."""
        symbol = symbol.upper().strip()
        if not symbol:
            raise MarketDataError("Symbol is required for options chain")

        if self.provider == "mock":
            raise MarketDataError("Mock provider is disabled")

        if self.provider in {"massive", "auto"} and self.massive_api_key:
            chain = self._options_chain_from_massive(symbol, expiration=expiration)
            if chain is not None:
                self.last_provider = "massive"
                self.last_detail = None
                return chain
            if self.provider == "massive":
                raise MarketDataError("Massive provider failed to fetch options chain")

        # Map requested expiration to Yahoo epoch seconds
        exp_epoch: Optional[int] = None
        if expiration:
            try:
                want = date.fromisoformat(expiration)
            except Exception as e:
                raise MarketDataError(f"Invalid expiration format (expected YYYY-MM-DD): {expiration}") from e

            # Fetch expirations to find exact match and corresponding epoch
            url0 = f"https://query2.finance.yahoo.com/v7/finance/options/{symbol}"
            payload0 = self._safe_get(url0, params={})
            if payload0:
                results0 = ((payload0.get("optionChain") or {}).get("result") or [])
                if results0:
                    exp_dates = results0[0].get("expirationDates") or []
                    for ep in exp_dates:
                        try:
                            d = date.fromtimestamp(int(ep))
                            if d == want:
                                exp_epoch = int(ep)
                                break
                        except Exception:
                            continue
                    if exp_epoch is None and exp_dates:
                        # pick closest
                        best = None
                        best_diff = None
                        for ep in exp_dates:
                            try:
                                d = date.fromtimestamp(int(ep))
                                diff = abs((d - want).days)
                                if best_diff is None or diff < best_diff:
                                    best_diff = diff
                                    best = int(ep)
                            except Exception:
                                continue
                        exp_epoch = best
        url = f"https://query2.finance.yahoo.com/v7/finance/options/{symbol}"
        params = {"date": exp_epoch} if exp_epoch else {}
        payload = self._safe_get(url, params=params)
        if not payload:
            raise MarketDataError("Failed to fetch options chain")

        results = ((payload.get("optionChain") or {}).get("result") or [])
        if not results:
            raise MarketDataError("No options chain result")
        result = results[0] or {}
        quote = result.get("quote") or {}
        underlying = quote.get("regularMarketPrice")
        if underlying is None:
            underlying = quote.get("previousClose") or 0.0

        options = result.get("options") or []
        if not options:
            raise MarketDataError("No options data returned")
        first = options[0] or {}
        exp = first.get("expirationDate")
        exp_str = date.fromtimestamp(int(exp)).isoformat() if exp else (expiration or "")

        calls_raw = first.get("calls") or []
        puts_raw = first.get("puts") or []

        def map_contract(row: Dict[str, Any], opt_type: str) -> OptionContract:
            return OptionContract(
                contract_symbol=str(row.get("contractSymbol") or ""),
                strike=float(row.get("strike") or 0.0),
                expiration=exp_str,
                option_type=opt_type,
                last_price=float(row.get("lastPrice") or 0.0),
                bid=float(row.get("bid") or 0.0),
                ask=float(row.get("ask") or 0.0),
                volume=int(row.get("volume") or 0),
                open_interest=int(row.get("openInterest") or 0),
                implied_volatility=float(row.get("impliedVolatility") or 0.0),
                in_the_money=bool(row.get("inTheMoney") or False),
                delta=None,
                gamma=None,
                theta=None,
                vega=None,
                rho=None,
            )

        calls = [map_contract(r, "call") for r in calls_raw if isinstance(r, dict)]
        puts = [map_contract(r, "put") for r in puts_raw if isinstance(r, dict)]

        self.last_provider = "yahoo"
        self.last_detail = None
        return OptionsChain(
            symbol=symbol,
            underlying_price=float(underlying or 0.0),
            expiration_date=exp_str,
            calls=calls,
            puts=puts,
        )

    def _from_massive(self, symbol: str) -> Optional[MarketSnapshot]:
        url = f"{self.massive_api_base}/v2/aggs/ticker/{symbol}/prev"
        params = {"adjusted": "true"}
        payload = self._safe_get(url, params=params, headers=self._massive_headers())
        if not payload:
            return None

        results = payload.get("results")
        if not isinstance(results, list) or not results:
            return None

        close_value = results[0].get("c")
        if close_value is None:
            return None

        return self._snapshot_from_spot(symbol, float(close_value), source="massive")

    def _quote_from_massive_snapshot(self, symbol: str) -> Optional[StockQuote]:
        if self._massive_client is not None:
            try:
                snap = self._massive_client.get_snapshot_ticker("stocks", symbol)
                day = getattr(snap, "day", None)
                prev = getattr(snap, "prev_day", None)
                last_trade = getattr(snap, "last_trade", None)

                price = getattr(last_trade, "price", None) or getattr(day, "close", None) or getattr(prev, "close", None)
                prev_close = getattr(prev, "close", None)
                if price is None or prev_close is None:
                    return None

                price_f = float(price)
                prev_f = float(prev_close)
                change = price_f - prev_f
                chg_pct = (change / prev_f * 100.0) if prev_f else 0.0
                volume = int(getattr(day, "volume", 0) or 0)
                ts = self._to_iso_ts(getattr(last_trade, "sip_timestamp", None) or getattr(snap, "updated", None))

                return StockQuote(
                    symbol=symbol,
                    company_name=None,
                    price=round(price_f, 4),
                    change=round(change, 4),
                    change_percent=round(chg_pct, 4),
                    volume=volume,
                    avg_volume=0,
                    market_cap=None,
                    pe_ratio=None,
                    fifty_two_week_high=None,
                    fifty_two_week_low=None,
                    sector=None,
                    industry=None,
                    timestamp=ts,
                )
            except Exception:
                return None

        # Polygon-compatible snapshot endpoint. Base URL is configurable via MASSIVE_API_BASE.
        url = f"{self.massive_api_base}/v2/snapshot/locale/us/markets/stocks/tickers/{symbol}"
        payload = self._safe_get(url, params={}, headers=self._massive_headers())
        if not payload:
            return None

        ticker = payload.get("ticker") or {}
        day = ticker.get("day") or {}
        prev = ticker.get("prevDay") or {}
        last_trade = ticker.get("lastTrade") or {}

        price = last_trade.get("p") or day.get("c") or prev.get("c")
        prev_close = prev.get("c")
        if price is None or prev_close is None:
            return None

        price_f = float(price)
        prev_f = float(prev_close)
        change = price_f - prev_f
        chg_pct = (change / prev_f * 100.0) if prev_f else 0.0

        volume = int(day.get("v") or 0)
        ts_ms = last_trade.get("t") or ticker.get("updated") or None
        if ts_ms:
            try:
                ts = datetime.fromtimestamp(int(ts_ms) / 1000.0, tz=timezone.utc).isoformat()
            except Exception:
                ts = datetime.now(timezone.utc).isoformat()
        else:
            ts = datetime.now(timezone.utc).isoformat()

        return StockQuote(
            symbol=symbol,
            company_name=None,
            price=round(price_f, 4),
            change=round(change, 4),
            change_percent=round(chg_pct, 4),
            volume=volume,
            avg_volume=0,
            market_cap=None,
            pe_ratio=None,
            fifty_two_week_high=None,
            fifty_two_week_low=None,
            sector=None,
            industry=None,
            timestamp=ts,
        )

    def _quote_from_massive_prev(self, symbol: str) -> Optional[StockQuote]:
        """Build a quote from the previous-day aggregates endpoint.

        This endpoint works on the free Polygon/Massive tier (unlike snapshots).
        Returns the most recent close, open, high, low, and volume.
        """
        if self._massive_client is not None:
            try:
                prev = self._massive_client.get_previous_close_agg(symbol, adjusted=True)
                if prev is None or getattr(prev, "close", None) is None:
                    return None
                price_f = float(prev.close)
                open_val = float(getattr(prev, "open", price_f) or price_f)
                high_val = float(getattr(prev, "high", price_f) or price_f)
                low_val = float(getattr(prev, "low", price_f) or price_f)
                volume = int(getattr(prev, "volume", 0) or 0)
                change = round(price_f - open_val, 4)
                chg_pct = round((change / open_val * 100.0), 4) if open_val else 0.0
                ts = self._to_iso_ts(getattr(prev, "timestamp", None))
                name = self._get_ticker_name(symbol)
                return StockQuote(
                    symbol=symbol,
                    company_name=name,
                    price=round(price_f, 4),
                    change=change,
                    change_percent=chg_pct,
                    volume=volume,
                    avg_volume=0,
                    market_cap=None,
                    pe_ratio=None,
                    fifty_two_week_high=high_val,
                    fifty_two_week_low=low_val,
                    sector=None,
                    industry=None,
                    timestamp=ts,
                )
            except Exception:
                return None

        url = f"{self.massive_api_base}/v2/aggs/ticker/{symbol}/prev"
        payload = self._safe_get(url, params={"adjusted": "true"}, headers=self._massive_headers())
        if not payload:
            return None

        results = payload.get("results")
        if not isinstance(results, list) or not results:
            return None

        r = results[0]
        close_val = r.get("c")
        if close_val is None:
            return None

        price_f = float(close_val)
        open_val = float(r.get("o") or price_f)
        high_val = float(r.get("h") or price_f)
        low_val = float(r.get("l") or price_f)
        volume = int(r.get("v") or 0)

        # Change vs previous close is not in prev-aggs; compute from open.
        change = round(price_f - open_val, 4)
        chg_pct = round((change / open_val * 100.0), 4) if open_val else 0.0

        # Timestamp from the aggregate.
        ts_ms = r.get("t")
        if ts_ms:
            try:
                ts = datetime.fromtimestamp(int(ts_ms) / 1000.0, tz=timezone.utc).isoformat()
            except Exception:
                ts = datetime.now(timezone.utc).isoformat()
        else:
            ts = datetime.now(timezone.utc).isoformat()

        # Enrich with ticker name if available.
        name = self._get_ticker_name(symbol)

        return StockQuote(
            symbol=symbol,
            company_name=name,
            price=round(price_f, 4),
            change=change,
            change_percent=chg_pct,
            volume=volume,
            avg_volume=0,
            market_cap=None,
            pe_ratio=None,
            fifty_two_week_high=high_val,
            fifty_two_week_low=low_val,
            sector=None,
            industry=None,
            timestamp=ts,
        )

    def _get_ticker_name(self, symbol: str) -> Optional[str]:
        """Fetch company/ETF name from Massive ticker details, with light cache."""
        if symbol in self._ticker_name_cache:
            return self._ticker_name_cache[symbol]
        if self._massive_client is not None:
            try:
                details = self._massive_client.get_ticker_details(symbol)
                name = getattr(details, "name", None)
                self._ticker_name_cache[symbol] = name
                return name
            except Exception:
                self._ticker_name_cache[symbol] = None
                return None
        url = f"{self.massive_api_base}/v3/reference/tickers/{symbol}"
        payload = self._safe_get(url, params={}, headers=self._massive_headers())
        name = None
        if payload:
            results = payload.get("results") or {}
            name = results.get("name")
        self._ticker_name_cache[symbol] = name
        return name

    def _quote_from_yahoo(self, symbol: str) -> Optional[StockQuote]:
        url = "https://query1.finance.yahoo.com/v7/finance/quote"
        payload = self._safe_get(url, params={"symbols": symbol})
        if not payload:
            return None

        result = (((payload.get("quoteResponse") or {}).get("result")) or [])
        if not result:
            return None
        first = result[0] or {}

        price = first.get("regularMarketPrice")
        if price is None:
            return None

        change = first.get("regularMarketChange") or 0.0
        change_percent = first.get("regularMarketChangePercent") or 0.0
        volume = int(first.get("regularMarketVolume") or 0)
        avg_volume = int(first.get("averageDailyVolume3Month") or 0)

        ts_epoch = first.get("regularMarketTime")
        if ts_epoch:
            try:
                ts = datetime.fromtimestamp(int(ts_epoch), tz=timezone.utc).isoformat()
            except Exception:
                ts = datetime.now(timezone.utc).isoformat()
        else:
            ts = datetime.now(timezone.utc).isoformat()

        return StockQuote(
            symbol=str(first.get("symbol") or symbol).upper(),
            company_name=first.get("longName") or first.get("shortName"),
            price=float(price),
            change=float(change),
            change_percent=float(change_percent),
            volume=volume,
            avg_volume=avg_volume,
            market_cap=first.get("marketCap"),
            pe_ratio=first.get("trailingPE"),
            fifty_two_week_high=first.get("fiftyTwoWeekHigh"),
            fifty_two_week_low=first.get("fiftyTwoWeekLow"),
            sector=None,
            industry=None,
            timestamp=ts,
        )

    def _quote_from_yahoo_chart(self, symbol: str) -> Optional[StockQuote]:
        """Fallback: extract a quote from the v8/finance/chart endpoint.

        v7/finance/quote is frequently blocked; v8/chart is more reliable
        and still returns real-time prices during market hours.
        """
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        payload = self._safe_get(url, params={"range": "5d", "interval": "1d"})
        if not payload:
            return None

        chart = (payload.get("chart") or {})
        results = (chart.get("result") or [])
        if not results:
            return None
        first = results[0] or {}

        meta = first.get("meta") or {}
        price = meta.get("regularMarketPrice")
        prev_close = meta.get("previousClose") or meta.get("chartPreviousClose")
        if price is None:
            return None

        price_f = float(price)
        prev_f = float(prev_close) if prev_close is not None else price_f
        change = round(price_f - prev_f, 4)
        chg_pct = round((change / prev_f * 100.0), 4) if prev_f else 0.0

        volume = 0
        indicators = (first.get("indicators") or {}).get("quote") or []
        if indicators:
            vols = (indicators[0] or {}).get("volume") or []
            last_vol = [v for v in vols if v is not None]
            if last_vol:
                volume = int(last_vol[-1])

        ts = datetime.now(timezone.utc).isoformat()

        return StockQuote(
            symbol=str(meta.get("symbol") or symbol).upper(),
            company_name=None,
            price=round(price_f, 4),
            change=change,
            change_percent=chg_pct,
            volume=volume,
            avg_volume=0,
            market_cap=None,
            pe_ratio=None,
            fifty_two_week_high=None,
            fifty_two_week_low=None,
            sector=None,
            industry=None,
            timestamp=ts,
        )

    def _quote_from_yfinance(self, symbol: str) -> Optional[StockQuote]:
        """Fallback: use yfinance library which handles Yahoo's crumb auth internally.

        More reliable than raw HTTP when Yahoo rate-limits direct requests.
        """
        if not _HAS_YFINANCE:
            return None
        try:
            ticker = yf.Ticker(symbol)
            fi = ticker.fast_info

            price = getattr(fi, 'last_price', None)
            if price is None:
                return None
            price_f = float(price)

            prev_close = getattr(fi, 'previous_close', None)
            prev_f = float(prev_close) if prev_close is not None else price_f
            change = round(price_f - prev_f, 4)
            chg_pct = round((change / prev_f * 100.0), 4) if prev_f else 0.0

            volume = int(getattr(fi, 'last_volume', 0) or 0)
            market_cap = getattr(fi, 'market_cap', None)
            year_high = getattr(fi, 'year_high', None)
            year_low = getattr(fi, 'year_low', None)

            ts = datetime.now(timezone.utc).isoformat()

            return StockQuote(
                symbol=symbol.upper(),
                company_name=None,
                price=round(price_f, 4),
                change=change,
                change_percent=chg_pct,
                volume=volume,
                avg_volume=0,
                market_cap=float(market_cap) if market_cap else None,
                pe_ratio=None,
                fifty_two_week_high=float(year_high) if year_high else None,
                fifty_two_week_low=float(year_low) if year_low else None,
                sector=None,
                industry=None,
                timestamp=ts,
            )
        except Exception:
            return None

    def _from_yahoo(self, symbol: str) -> Optional[MarketSnapshot]:
        url = "https://query1.finance.yahoo.com/v7/finance/quote"
        payload = self._safe_get(url, params={"symbols": symbol})
        if not payload:
            return None

        result = (((payload.get("quoteResponse") or {}).get("result")) or [])
        if not result:
            return None

        first = result[0]
        spot = first.get("regularMarketPrice")
        if spot is None:
            return None

        return self._snapshot_from_spot(symbol, float(spot), source="yahoo")

    def _snapshot_from_spot(self, symbol: str, spot: float, source: str) -> MarketSnapshot:
        width = max(0.5, spot * 0.02)
        return MarketSnapshot(
            symbol=symbol,
            spot_price=round(spot, 4),
            iv_percentile=None,
            support_levels=[round(spot - width, 4), round(spot - (width * 2), 4)],
            resistance_levels=[round(spot + width, 4), round(spot + (width * 2), 4)],
        )

    def _safe_get(self, url: str, params: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> Optional[Dict[str, Any]]:
        # Best-effort, small retry for rate limits/transient failures.
        attempts = self.max_attempts
        backoff = self.backoff
        for i in range(attempts):
            try:
                response = requests.get(url, params=params, headers=headers, timeout=self.timeout)
                self._last_http_status = int(response.status_code)
                self._last_http_url = str(url)
                if response.status_code == 429 or response.status_code >= 500:
                    if i < attempts - 1:
                        if backoff:
                            time.sleep(backoff * (2 ** i))
                        continue
                    return None
                if response.status_code >= 400:
                    return None
                data = response.json()
                if isinstance(data, dict):
                    return data
                return None
            except (requests.RequestException, ValueError):
                if i < attempts - 1:
                    if backoff:
                        time.sleep(backoff * (2 ** i))
                    continue
                return None

    def _history_from_massive(self, symbol: str, period: str, interval: str) -> List[OHLCV]:
        # Maps our UI period/interval strings to Massive aggregates API.
        # Docs: /v2/aggs/ticker/{stocksTicker}/range/{multiplier}/{timespan}/{from}/{to}
        interval = (interval or "1d").lower().strip()
        period = (period or "1mo").lower().strip()

        multiplier = 1
        timespan = "day"
        if interval.endswith("m"):
            try:
                multiplier = int(interval[:-1])
            except Exception:
                multiplier = 1
            timespan = "minute"
        elif interval.endswith("h"):
            try:
                multiplier = int(interval[:-1])
            except Exception:
                multiplier = 1
            timespan = "hour"
        elif interval in {"1d", "1day", "day"}:
            multiplier = 1
            timespan = "day"
        elif interval in {"1wk", "1w", "week"}:
            multiplier = 1
            timespan = "week"
        elif interval in {"1mo", "1month", "month"}:
            multiplier = 1
            timespan = "month"

        days = 30
        if period == "1d":
            days = 1
        elif period == "5d":
            days = 5
        elif period == "1mo":
            days = 30
        elif period == "3mo":
            days = 90
        elif period == "6mo":
            days = 180
        elif period == "1y":
            days = 365
        elif period == "2y":
            days = 730
        elif period == "5y":
            days = 1825
        elif period == "max":
            days = 3650

        to_d = date.today()
        from_d = to_d - timedelta(days=days)
        from_s = from_d.isoformat()
        to_s = to_d.isoformat()

        if self._massive_client is not None:
            try:
                rows = list(
                    self._massive_client.list_aggs(
                        ticker=symbol,
                        multiplier=multiplier,
                        timespan=timespan,
                        from_=from_s,
                        to=to_s,
                        adjusted=True,
                        sort="asc",
                        limit=50000,
                    )
                )
                out: List[OHLCV] = []
                for row in rows:
                    try:
                        dt = self._to_iso_ts(getattr(row, "timestamp", None))
                        o = float(getattr(row, "open"))
                        h = float(getattr(row, "high"))
                        l = float(getattr(row, "low"))
                        c = float(getattr(row, "close"))
                        v = int(getattr(row, "volume", 0) or 0)
                        out.append(OHLCV(date=dt, open=round(o, 4), high=round(h, 4), low=round(l, 4), close=round(c, 4), volume=v))
                    except Exception:
                        continue
                if out:
                    return out
            except Exception:
                return []

        url = f"{self.massive_api_base}/v2/aggs/ticker/{symbol}/range/{multiplier}/{timespan}/{from_s}/{to_s}"
        params = {"adjusted": "true", "sort": "asc", "limit": 50000}
        payload = self._safe_get(url, params=params, headers=self._massive_headers())
        if not payload:
            return []

        results = payload.get("results") or []
        if not isinstance(results, list):
            return []

        out: List[OHLCV] = []
        for row in results:
            if not isinstance(row, dict):
                continue
            try:
                ts_ms = row.get("t")
                if ts_ms is None:
                    continue
                dt = datetime.fromtimestamp(int(ts_ms) / 1000.0, tz=timezone.utc).isoformat()
                o = float(row.get("o"))
                h = float(row.get("h"))
                l = float(row.get("l"))
                c = float(row.get("c"))
                v = int(row.get("v") or 0)
                out.append(OHLCV(date=dt, open=round(o, 4), high=round(h, 4), low=round(l, 4), close=round(c, 4), volume=v))
            except Exception:
                continue
        return out

    def _options_expirations_from_massive(self, symbol: str) -> List[str]:
        # Docs: /v3/reference/options/contracts?underlying_ticker=...
        today = date.today()
        max_date = today + timedelta(days=90)

        if self._massive_client is not None:
            expirations: set[str] = set()
            try:
                for row in self._massive_client.list_options_contracts(
                    underlying_ticker=symbol,
                    contract_type="call",
                    expiration_date_gte=today.isoformat(),
                    expiration_date_lte=max_date.isoformat(),
                    sort="expiration_date",
                    order="asc",
                    limit=1000,
                ):
                    exp = getattr(row, "expiration_date", None)
                    if exp:
                        expirations.add(str(exp))
                return sorted(expirations)[:50]
            except Exception:
                return []

        base_url = f"{self.massive_api_base}/v3/reference/options/contracts"
        headers = self._massive_headers()
        expirations: set[str] = set()

        # Try filter modifiers first (supported by Massive docs UI).
        params = {
            "underlying_ticker": symbol,
            "contract_type": "call",
            "limit": 1000,
            "sort": "expiration_date",
            "order": "asc",
            "expiration_date.gte": today.isoformat(),
            "expiration_date.lte": max_date.isoformat(),
        }
        payload = self._safe_get(base_url, params=params, headers=headers)
        if not payload:
            # Retry without modifiers in case account plan or endpoint rejects them.
            params = {
                "underlying_ticker": symbol,
                "contract_type": "call",
                "limit": 1000,
                "sort": "expiration_date",
                "order": "asc",
            }
            payload = self._safe_get(base_url, params=params, headers=headers)
            if not payload:
                return []

        next_url = payload.get("next_url")
        for row in payload.get("results") or []:
            if isinstance(row, dict) and row.get("expiration_date"):
                expirations.add(str(row["expiration_date"]))

        # Best-effort pagination, but stop early once we have enough expirations for UI.
        pages = 0
        while next_url and len(expirations) < 50 and pages < 10:
            pages += 1
            url = str(next_url)
            if url.startswith("/"):
                url = f"{self.massive_api_base}{url}"
            payload = self._safe_get(url, params={}, headers=headers)  # next_url already encodes query
            if not payload:
                break
            for row in payload.get("results") or []:
                if isinstance(row, dict) and row.get("expiration_date"):
                    expirations.add(str(row["expiration_date"]))
            next_url = payload.get("next_url")

        out = sorted(expirations)
        # Keep the list tight for UI dropdowns.
        return out[:50]

    def _options_chain_from_massive(self, symbol: str, expiration: Optional[str]) -> Optional[OptionsChain]:
        # Docs: /v3/snapshot/options/{underlyingAsset}
        if self._massive_client is not None:
            try:
                params: Dict[str, Any] = {"limit": 250, "sort": "strike_price", "order": "asc"}
                if expiration:
                    params["expiration_date"] = expiration
                rows = list(self._massive_client.list_snapshot_options_chain(symbol, params=params))
                if not rows:
                    return None

                calls: List[OptionContract] = []
                puts: List[OptionContract] = []
                spot = 0.0

                for row in rows:
                    details = getattr(row, "details", None)
                    if details is None:
                        continue
                    opt_type = str(getattr(details, "contract_type", "") or "").lower()
                    if opt_type not in {"call", "put"}:
                        continue

                    under = getattr(row, "underlying_asset", None)
                    if under is not None:
                        px = getattr(under, "price", None) or getattr(under, "value", None)
                        if px is not None:
                            try:
                                spot = float(px)
                            except Exception:
                                pass

                    strike = float(getattr(details, "strike_price", 0.0) or 0.0)
                    exp = str(getattr(details, "expiration_date", "") or expiration or "")
                    ticker = str(getattr(details, "ticker", "") or "")

                    last_trade = getattr(row, "last_trade", None)
                    last_quote = getattr(row, "last_quote", None)
                    day = getattr(row, "day", None)

                    last_price = float(getattr(last_trade, "price", 0.0) or 0.0)
                    if last_price <= 0.0 and day is not None:
                        try:
                            last_price = float(getattr(day, "close", 0.0) or 0.0)
                        except Exception:
                            last_price = 0.0

                    bid = float(getattr(last_quote, "bid", 0.0) or 0.0)
                    ask = float(getattr(last_quote, "ask", 0.0) or 0.0)
                    midpoint = float(getattr(last_quote, "midpoint", 0.0) or 0.0)
                    if bid <= 0.0 and midpoint > 0.0:
                        bid = midpoint
                    if ask <= 0.0 and midpoint > 0.0:
                        ask = midpoint
                    if bid <= 0.0 and ask <= 0.0 and last_price > 0.0:
                        bid = last_price
                        ask = last_price

                    volume = int(getattr(day, "volume", 0) or 0) if day is not None else 0
                    oi = int(getattr(row, "open_interest", 0) or 0)
                    iv = getattr(row, "implied_volatility", None)

                    greeks = getattr(row, "greeks", None)
                    delta = getattr(greeks, "delta", None) if greeks is not None else None
                    gamma = getattr(greeks, "gamma", None) if greeks is not None else None
                    theta = getattr(greeks, "theta", None) if greeks is not None else None
                    vega = getattr(greeks, "vega", None) if greeks is not None else None
                    rho = getattr(greeks, "rho", None) if greeks is not None else None

                    in_the_money = False
                    if spot and strike:
                        in_the_money = strike < spot if opt_type == "call" else strike > spot

                    c = OptionContract(
                        contract_symbol=ticker,
                        strike=strike,
                        expiration=exp,
                        option_type=opt_type,
                        last_price=last_price,
                        bid=bid,
                        ask=ask,
                        volume=volume,
                        open_interest=oi,
                        implied_volatility=float(iv) if iv is not None else None,
                        in_the_money=bool(in_the_money),
                        delta=delta,
                        gamma=gamma,
                        theta=theta,
                        vega=vega,
                        rho=rho,
                    )
                    if c.option_type == "call":
                        calls.append(c)
                    else:
                        puts.append(c)

                if not spot:
                    try:
                        spot = float(self.get_stock_quote(symbol).price)
                    except Exception:
                        spot = 0.0
                exp_date = expiration or (calls[0].expiration if calls else (puts[0].expiration if puts else date.today().isoformat()))
                return OptionsChain(
                    symbol=symbol,
                    underlying_price=float(spot),
                    expiration_date=str(exp_date),
                    calls=sorted(calls, key=lambda x: x.strike),
                    puts=sorted(puts, key=lambda x: x.strike),
                )
            except Exception:
                return None

        url = f"{self.massive_api_base}/v3/snapshot/options/{symbol}"
        params: Dict[str, Any] = {"limit": 250, "sort": "strike_price", "order": "asc"}
        if expiration:
            params["expiration_date"] = expiration
        payload = self._safe_get(url, params=params, headers=self._massive_headers())
        if not payload:
            return None

        results = payload.get("results") or []
        if not isinstance(results, list):
            results = []

        underlying_price = None
        ua = payload.get("underlying_asset") or payload.get("underlying") or None
        if isinstance(ua, dict):
            underlying_price = ua.get("price") or ua.get("last_price") or ua.get("value")

        # If the response doesn't contain underlying price, fall back to stock quote.
        if underlying_price is None:
            try:
                underlying_price = float(self.get_stock_quote(symbol).price)
            except Exception:
                underlying_price = 0.0
        spot = float(underlying_price or 0.0)

        calls: List[OptionContract] = []
        puts: List[OptionContract] = []

        def _get_num(d: Dict[str, Any], *keys: str) -> Optional[float]:
            for k in keys:
                v = d.get(k)
                if v is None:
                    continue
                try:
                    return float(v)
                except Exception:
                    continue
            return None

        def _get_int(d: Dict[str, Any], *keys: str) -> int:
            for k in keys:
                v = d.get(k)
                if v is None:
                    continue
                try:
                    return int(v)
                except Exception:
                    continue
            return 0

        def map_row(row: Dict[str, Any]) -> Optional[OptionContract]:
            details = row.get("details") if isinstance(row.get("details"), dict) else row
            opt_type = str(details.get("contract_type") or details.get("type") or "").lower()
            if opt_type not in {"call", "put"}:
                return None

            strike = _get_num(details, "strike_price", "strike") or 0.0
            exp = str(details.get("expiration_date") or details.get("expiration") or expiration or "")
            ticker = str(details.get("ticker") or details.get("options_ticker") or row.get("ticker") or "")

            last_trade = row.get("last_trade") or {}
            last_quote = row.get("last_quote") or {}

            last_price = _get_num(last_trade if isinstance(last_trade, dict) else {}, "price", "p") or _get_num(row, "last_price", "last") or 0.0
            bid = _get_num(last_quote if isinstance(last_quote, dict) else {}, "bid", "bp") or _get_num(row, "bid") or 0.0
            ask = _get_num(last_quote if isinstance(last_quote, dict) else {}, "ask", "ap") or _get_num(row, "ask") or 0.0

            day = row.get("day") or {}
            volume = _get_int(day if isinstance(day, dict) else {}, "volume", "v")
            oi = _get_int(row, "open_interest", "openInterest")
            iv = _get_num(row, "implied_volatility", "impliedVolatility")

            in_the_money = False
            if spot and strike:
                if opt_type == "call":
                    in_the_money = strike < spot
                else:
                    in_the_money = strike > spot

            greeks = row.get("greeks") or {}
            delta = _get_num(greeks if isinstance(greeks, dict) else {}, "delta")
            gamma = _get_num(greeks if isinstance(greeks, dict) else {}, "gamma")
            theta = _get_num(greeks if isinstance(greeks, dict) else {}, "theta")
            vega = _get_num(greeks if isinstance(greeks, dict) else {}, "vega")
            rho = _get_num(greeks if isinstance(greeks, dict) else {}, "rho")

            return OptionContract(
                contract_symbol=ticker,
                strike=float(strike),
                expiration=exp,
                option_type=opt_type,
                last_price=float(last_price),
                bid=float(bid),
                ask=float(ask),
                volume=int(volume),
                open_interest=int(oi),
                implied_volatility=float(iv) if iv is not None else None,
                in_the_money=bool(in_the_money),
                delta=delta,
                gamma=gamma,
                theta=theta,
                vega=vega,
                rho=rho,
            )

        for row in results:
            if not isinstance(row, dict):
                continue
            c = map_row(row)
            if not c:
                continue
            if c.option_type == "call":
                calls.append(c)
            else:
                puts.append(c)

        # Pagination for deeper chains.
        next_url = payload.get("next_url")
        pages = 0
        while next_url and pages < 8 and (len(calls) + len(puts)) < 1500:
            pages += 1
            nurl = str(next_url)
            if nurl.startswith("/"):
                nurl = f"{self.massive_api_base}{nurl}"
            payload = self._safe_get(nurl, params={}, headers=self._massive_headers())
            if not payload:
                break
            next_url = payload.get("next_url")
            for row in payload.get("results") or []:
                if not isinstance(row, dict):
                    continue
                c = map_row(row)
                if not c:
                    continue
                if c.option_type == "call":
                    calls.append(c)
                else:
                    puts.append(c)

        exp_date = expiration or (calls[0].expiration if calls else (puts[0].expiration if puts else (date.today().isoformat())))
        return OptionsChain(
            symbol=symbol,
            underlying_price=float(spot),
            expiration_date=str(exp_date),
            calls=sorted(calls, key=lambda x: x.strike),
            puts=sorted(puts, key=lambda x: x.strike),
        )
