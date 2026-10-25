from __future__ import annotations

import concurrent.futures
import os
import time as _time
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

import requests
from analysis_layer import technical_indicator_service, volatility_service
from fastapi import APIRouter, Query, Response
from market_data_layer import MarketDataClient
from shared.exceptions import MarketDataError
from shared.schemas import OHLCV, MarketOverview, OptionsChain, StockQuote, TrendAnalysis, VolatilityAnalysis

try:
    import yfinance as yf
    _HAS_YFINANCE = True
except ImportError:
    _HAS_YFINANCE = False

try:
    from massive import RESTClient
    _HAS_MASSIVE_SDK = True
except ImportError:
    _HAS_MASSIVE_SDK = False


router = APIRouter()


def _fetch_yfinance_news(symbol: str, limit: int = 5) -> List[dict]:
    """Fetch real news via yfinance. Returns list of headline dicts or empty list.

    Handles both yfinance <1.0 format (top-level title/publisher/link)
    and yfinance 1.0+ format (nested {id, content: {title, provider, canonicalUrl}}).
    """
    if not _HAS_YFINANCE:
        return []
    try:
        ticker = yf.Ticker(symbol)
        raw_news = getattr(ticker, 'news', None)
        if not raw_news or not isinstance(raw_news, list):
            return []
        out = []
        for item in raw_news[:limit]:
            if not isinstance(item, dict):
                continue

            # yfinance 1.0+: news items are {id, content: {...}}
            content = item.get('content') or {}

            # Title: try content.title first (1.0+), then top-level (old format)
            title = content.get('title') or item.get('title') or item.get('headline') or ''
            if not title:
                continue

            # Provider: content.provider.displayName (1.0+) or top-level publisher (old)
            provider_obj = content.get('provider') or {}
            provider = provider_obj.get('displayName') if isinstance(provider_obj, dict) else None
            if not provider:
                provider = item.get('publisher') or item.get('source') or 'Yahoo Finance'

            # URL: content.canonicalUrl.url (1.0+) or top-level link/url (old)
            canon = content.get('canonicalUrl') or {}
            link = canon.get('url') if isinstance(canon, dict) else None
            if not link:
                link = item.get('link') or item.get('url') or ''

            # Published time: content.pubDate (1.0+) or top-level providerPublishTime (old)
            pub_ts = content.get('pubDate') or item.get('providerPublishTime') or item.get('published', '')
            if isinstance(pub_ts, (int, float)):
                pub_str = datetime.fromtimestamp(int(pub_ts), tz=timezone.utc).isoformat()
            else:
                pub_str = str(pub_ts) if pub_ts else datetime.now(timezone.utc).isoformat()

            # Thumbnail
            thumbnail = None
            thumb_obj = content.get('thumbnail') or item.get('thumbnail')
            if thumb_obj and isinstance(thumb_obj, dict):
                resolutions = thumb_obj.get('resolutions') or []
                if resolutions and isinstance(resolutions, list):
                    thumbnail = resolutions[0].get('url')

            out.append({
                'title': title,
                'source': str(provider),
                'published': pub_str,
                'url': str(link),
                'thumbnail': thumbnail,
            })
        return out
    except Exception:
        return []


def _fetch_massive_news(symbol: str, limit: int = 5) -> List[dict]:
    """Fetch news from Massive/Polygon v2/reference/news endpoint."""
    api_key = (os.environ.get("MASSIVE_API_KEY") or os.environ.get("POLYGON_API_KEY") or "").strip()
    api_base = os.environ.get("MASSIVE_API_BASE", "https://api.massive.com").strip().rstrip("/")
    if not api_key:
        return []
    try:
        if _HAS_MASSIVE_SDK:
            client = RESTClient(
                api_key=api_key,
                connect_timeout=3.0,
                read_timeout=3.0,
                retries=1,
                base=api_base,
                pagination=False,
            )
            items = list(
                client.list_ticker_news(
                    ticker=symbol,
                    limit=int(limit),
                    sort="published_utc",
                    order="desc",
                )
            )
            out = []
            for item in items[:limit]:
                title = getattr(item, "title", None) or ""
                if not title:
                    continue
                publisher = getattr(item, "publisher", None)
                source = getattr(publisher, "name", None) if publisher is not None else None
                out.append({
                    "title": title,
                    "source": str(source or "Massive"),
                    "published": str(getattr(item, "published_utc", "") or datetime.now(timezone.utc).isoformat()),
                    "url": str(getattr(item, "article_url", "") or ""),
                    "thumbnail": getattr(item, "image_url", None),
                })
            return out

        # SDK unavailable: fallback to direct REST.
        url = f"{api_base}/v2/reference/news"
        headers = {"Authorization": f"Bearer {api_key}"}
        params = {"ticker": symbol, "limit": int(limit), "sort": "published_utc", "order": "desc"}
        # Keep UI fast; /home should not block for long on news.
        r = requests.get(url, params=params, headers=headers, timeout=3)
        if r.status_code != 200:
            return []
        data = r.json()
        results = data.get("results") or []
        out = []
        for item in results[:limit]:
            if not isinstance(item, dict):
                continue
            title = item.get("title") or ""
            if not title:
                continue
            pub_obj = item.get("publisher") or {}
            source = pub_obj.get("name") if isinstance(pub_obj, dict) else str(pub_obj)
            article_url = item.get("article_url") or ""
            published = item.get("published_utc") or datetime.now(timezone.utc).isoformat()
            thumbnail = item.get("image_url")
            out.append({
                'title': title,
                'source': source or 'Massive',
                'published': str(published),
                'url': str(article_url),
                'thumbnail': thumbnail,
            })
        return out
    except Exception:
        return []


def _news_watchlist() -> List[str]:
    """Home news watchlist symbols from env (comma-separated)."""
    raw = (os.environ.get("HOME_NEWS_WATCHLIST") or "").strip()
    if not raw:
        return ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META"]
    out: List[str] = []
    for part in raw.split(","):
        sym = part.strip().upper()
        if sym and sym not in out:
            out.append(sym)
    return out


def _fetch_massive_watchlist_news(limit: int = 8) -> List[dict]:
    """Massive-only home headlines from watchlist tickers."""
    items: List[dict] = []
    seen: set[str] = set()
    for sym in _news_watchlist():
        for row in _fetch_massive_news(sym, limit=3):
            key = str(row.get("url") or row.get("title") or "")
            if not key or key in seen:
                continue
            seen.add(key)
            row["ticker"] = sym
            items.append(row)

    def _published_key(x: dict) -> str:
        return str(x.get("published") or "")

    items.sort(key=_published_key, reverse=True)
    return items[: int(limit)]


def _fetch_news(symbol: str, limit: int = 5) -> List[dict]:
    """Unified stock-news fetcher: Massive -> yfinance."""
    news = _fetch_massive_news(symbol, limit=limit)
    if news:
        return news
    news = _fetch_yfinance_news(symbol, limit=limit)
    if news:
        return news
    return []


def _fetch_massive_market_movers(limit: int = 7) -> tuple[List[dict], List[dict]]:
    """Fetch market-wide top gainers/losers from Massive snapshots.

    Uses provider-native day % change fields (no local percent calculation).
    Returns empty lists when Massive is unavailable.
    """
    api_key = (os.environ.get("MASSIVE_API_KEY") or os.environ.get("POLYGON_API_KEY") or "").strip()
    api_base = os.environ.get("MASSIVE_API_BASE", "https://api.massive.com").strip().rstrip("/")
    if not api_key:
        return [], []

    def _map_row(item: object) -> Optional[dict]:
        try:
            symbol = str(getattr(item, "ticker", "") or "").upper().strip()
            if not symbol:
                return None
            pct = getattr(item, "todays_change_percent", None)
            if pct is None:
                return None
            last_trade = getattr(item, "last_trade", None)
            day = getattr(item, "day", None)
            price = (
                float(getattr(last_trade, "price", 0.0) or 0.0)
                if last_trade is not None
                else 0.0
            )
            if price <= 0.0 and day is not None:
                price = float(getattr(day, "close", 0.0) or 0.0)
            volume = int(getattr(day, "volume", 0) or 0) if day is not None else 0
            return {
                "symbol": symbol,
                "price": float(price),
                "change_percent": float(pct),
                "volume": int(volume),
            }
        except Exception:
            return None

    def _map_row_rest(item: dict) -> Optional[dict]:
        if not isinstance(item, dict):
            return None
        symbol = str(item.get("ticker") or "").upper().strip()
        if not symbol:
            return None
        pct = item.get("todaysChangePerc")
        if pct is None:
            return None
        last_trade = item.get("lastTrade") or {}
        day = item.get("day") or {}
        try:
            price = float((last_trade.get("p") if isinstance(last_trade, dict) else 0.0) or 0.0)
            if price <= 0.0:
                price = float((day.get("c") if isinstance(day, dict) else 0.0) or 0.0)
            volume = int((day.get("v") if isinstance(day, dict) else 0) or 0)
            return {
                "symbol": symbol,
                "price": float(price),
                "change_percent": float(pct),
                "volume": int(volume),
            }
        except Exception:
            return None

    try:
        if _HAS_MASSIVE_SDK:
            client = RESTClient(
                api_key=api_key,
                connect_timeout=3.0,
                read_timeout=3.0,
                retries=1,
                base=api_base,
                pagination=False,
            )
            gainers_raw = list(client.get_snapshot_direction("stocks", "gainers", include_otc=False))
            losers_raw = list(client.get_snapshot_direction("stocks", "losers", include_otc=False))
            gainers = [
                row for row in (_map_row(x) for x in gainers_raw)
                if row is not None and float(row.get("change_percent", 0.0)) > 0.0
            ]
            losers = [
                row for row in (_map_row(x) for x in losers_raw)
                if row is not None and float(row.get("change_percent", 0.0)) < 0.0
            ]
            gainers.sort(key=lambda r: r["change_percent"], reverse=True)
            losers.sort(key=lambda r: r["change_percent"])
            return gainers[: int(limit)], losers[: int(limit)]

        # SDK unavailable: fallback to direct REST.
        headers = {"Authorization": f"Bearer {api_key}"}
        params = {"include_otc": "false"}
        g_resp = requests.get(
            f"{api_base}/v2/snapshot/locale/us/markets/stocks/gainers",
            params=params,
            headers=headers,
            timeout=3,
        )
        l_resp = requests.get(
            f"{api_base}/v2/snapshot/locale/us/markets/stocks/losers",
            params=params,
            headers=headers,
            timeout=3,
        )
        if g_resp.status_code != 200 or l_resp.status_code != 200:
            return [], []
        g_data = g_resp.json()
        l_data = l_resp.json()
        g_rows = g_data.get("tickers") or []
        l_rows = l_data.get("tickers") or []
        gainers = [
            row for row in (_map_row_rest(x) for x in g_rows)
            if row is not None and float(row.get("change_percent", 0.0)) > 0.0
        ]
        losers = [
            row for row in (_map_row_rest(x) for x in l_rows)
            if row is not None and float(row.get("change_percent", 0.0)) < 0.0
        ]
        gainers.sort(key=lambda r: r["change_percent"], reverse=True)
        losers.sort(key=lambda r: r["change_percent"])
        return gainers[: int(limit)], losers[: int(limit)]
    except Exception:
        return [], []


def _fetch_massive_news_for_symbols(symbols: List[str], limit: int = 8) -> List[dict]:
    """Fetch Massive news scoped to provided ticker list (ticker.any_of path)."""
    api_key = (os.environ.get("MASSIVE_API_KEY") or os.environ.get("POLYGON_API_KEY") or "").strip()
    api_base = os.environ.get("MASSIVE_API_BASE", "https://api.massive.com").strip().rstrip("/")
    if not api_key:
        return []

    unique: List[str] = []
    seen_syms: set[str] = set()
    for s in symbols:
        sym = str(s or "").upper().strip()
        if sym and sym not in seen_syms:
            seen_syms.add(sym)
            unique.append(sym)
    if not unique:
        return []

    any_of = ",".join(unique)
    fetch_limit = max(25, int(limit) * 4)

    def _normalize_row(item: dict) -> Optional[dict]:
        if not isinstance(item, dict):
            return None
        title = str(item.get("title") or "").strip()
        if not title:
            return None
        published = str(item.get("published_utc") or datetime.now(timezone.utc).isoformat())
        url = str(item.get("article_url") or "")
        thumbnail = item.get("image_url")
        pub_obj = item.get("publisher") or {}
        source = pub_obj.get("name") if isinstance(pub_obj, dict) else str(pub_obj or "Massive")
        tickers = item.get("tickers") or []
        if not isinstance(tickers, list):
            tickers = []
        ticker = None
        for t in tickers:
            ts = str(t or "").upper().strip()
            if ts in seen_syms:
                ticker = ts
                break
        if ticker is None and tickers:
            ticker = str(tickers[0]).upper()
        return {
            "title": title,
            "source": str(source or "Massive"),
            "published": published,
            "url": url,
            "thumbnail": thumbnail,
            "ticker": ticker,
        }

    try:
        rows: List[dict] = []
        if _HAS_MASSIVE_SDK:
            client = RESTClient(
                api_key=api_key,
                connect_timeout=3.0,
                read_timeout=3.0,
                retries=1,
                base=api_base,
                pagination=False,
            )
            items = list(
                client.list_ticker_news(
                    limit=fetch_limit,
                    sort="published_utc",
                    order="desc",
                    params={"ticker.any_of": any_of},
                )
            )
            for item in items:
                d = {
                    "title": getattr(item, "title", None),
                    "published_utc": getattr(item, "published_utc", None),
                    "article_url": getattr(item, "article_url", None),
                    "image_url": getattr(item, "image_url", None),
                    "publisher": {"name": getattr(getattr(item, "publisher", None), "name", None)},
                    "tickers": list(getattr(item, "tickers", None) or []),
                }
                row = _normalize_row(d)
                if row is not None:
                    rows.append(row)
        else:
            url = f"{api_base}/v2/reference/news"
            headers = {"Authorization": f"Bearer {api_key}"}
            params = {
                "ticker.any_of": any_of,
                "limit": int(fetch_limit),
                "sort": "published_utc",
                "order": "desc",
            }
            r = requests.get(url, params=params, headers=headers, timeout=3)
            if r.status_code != 200:
                return []
            payload = r.json()
            results = payload.get("results") or []
            for item in results:
                row = _normalize_row(item)
                if row is not None:
                    rows.append(row)

        dedup: List[dict] = []
        seen_keys: set[str] = set()
        for row in rows:
            key = str(row.get("url") or row.get("title") or "")
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)
            dedup.append(row)
        dedup.sort(key=lambda x: str(x.get("published") or ""), reverse=True)
        return dedup[: int(limit)]
    except Exception:
        return []


def _fetch_yahoo_market_movers(limit: int = 7) -> tuple[List[dict], List[dict]]:
    """Best-effort market-wide movers from Yahoo predefined screeners."""

    def _num(row: dict, *keys: str) -> float:
        for key in keys:
            val = row.get(key)
            if isinstance(val, dict):
                val = val.get("raw", val.get("fmt"))
            if val is None:
                continue
            try:
                return float(val)
            except Exception:
                continue
        return 0.0

    def _fetch(scr_id: str) -> List[dict]:
        url = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved"
        params = {"scrIds": scr_id, "count": max(25, int(limit) * 4)}
        try:
            r = requests.get(url, params=params, timeout=3)
            if r.status_code != 200:
                return []
            payload = r.json()
        except Exception:
            return []

        finance = payload.get("finance") if isinstance(payload, dict) else {}
        results = finance.get("result") if isinstance(finance, dict) else []
        if not isinstance(results, list) or not results:
            return []
        first = results[0] if isinstance(results[0], dict) else {}
        quotes = first.get("quotes") if isinstance(first, dict) else []
        if not isinstance(quotes, list):
            return []

        out: List[dict] = []
        for row in quotes:
            if not isinstance(row, dict):
                continue
            symbol = str(row.get("symbol") or "").upper().strip()
            if not symbol:
                continue
            chg_pct = _num(row, "regularMarketChangePercent")
            price = _num(row, "regularMarketPrice")
            vol = int(_num(row, "regularMarketVolume"))
            out.append({
                "symbol": symbol,
                "price": float(price),
                "change_percent": float(chg_pct),
                "volume": int(vol),
            })
        return out

    gainers = [r for r in _fetch("day_gainers") if float(r.get("change_percent", 0.0)) > 0.0]
    losers = [r for r in _fetch("day_losers") if float(r.get("change_percent", 0.0)) < 0.0]
    gainers.sort(key=lambda r: r["change_percent"], reverse=True)
    losers.sort(key=lambda r: r["change_percent"])
    return gainers[: int(limit)], losers[: int(limit)]


def _mini_spark(history: List[OHLCV], max_points: int = 78) -> List[float]:
    # Keep payload tiny; finviz-like micro charts.
    closes = [float(p.close) for p in history if getattr(p, "close", None) is not None]
    if not closes:
        return []
    if len(closes) <= max_points:
        return closes
    step = max(1, len(closes) // max_points)
    return closes[::step][:max_points]


def _latest_open(history: List[OHLCV]) -> Optional[float]:
    """Return the most recent non-null open value from OHLCV history."""
    for bar in reversed(history or []):
        try:
            val = float(getattr(bar, "open", 0.0))
            if val > 0:
                return val
        except Exception:
            continue
    return None


@router.get("/overview", response_model=None)
def get_overview(response: Response) -> MarketOverview:
    client = MarketDataClient()
    out = client.get_market_overview()
    response.headers["X-Market-Data-Provider"] = client.last_provider or "unknown"
    if client.last_detail:
        response.headers["X-Market-Data-Detail"] = client.last_detail
    return out


# ---- Home endpoint cache -----------------------------------------------------
_home_cache: dict = {"payload": None, "fetched_at": 0.0}
_HOME_CACHE_TTL = 300  # 5 minutes


@router.get("/home", response_model=None)
def get_home(
    response: Response,
    live: bool = Query(True),
    refresh: bool = Query(False, description="Bypass in-memory home cache for this request"),
) -> dict:
    """Finviz-like dashboard payload: indexes + movers + headlines.

    Default behavior is live: the endpoint attempts real provider calls with
    per-request timeouts and concurrent fetching. A 5-minute in-memory cache
    avoids hammering providers on repeated page loads.

    Pass `live=false` to bypass cache for this request.
    """
    now = datetime.now(timezone.utc).replace(microsecond=0)

    # Return cached payload if fresh enough (live mode only).
    if live and (not refresh) and _home_cache["payload"] is not None:
        age = _time.monotonic() - _home_cache["fetched_at"]
        if age < _HOME_CACHE_TTL:
            response.headers["X-Market-Data-Provider"] = "cache"
            response.headers["X-Market-Data-Detail"] = f"home_cache_age_{int(age)}s"
            return _home_cache["payload"]

    # Keep home fast and avoid long request tails.
    client = MarketDataClient(timeout=2, max_attempts=1, backoff=0.0, allow_yfinance=True)

    # Use ETFs as proxies for the big index tiles.
    tiles = [
        {"symbol": "DIA", "label": "DOW"},
        {"symbol": "QQQ", "label": "NASDAQ"},
        {"symbol": "SPY", "label": "S&P 500"},
        {"symbol": "IWM", "label": "RUSSELL 2000"},
    ]

    # Movers from a small universe (expand later).
    universe = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "AMD", "NFLX", "JPM", "XOM", "BAC"]

    def _tile_for(t: dict) -> Optional[dict]:
        sym = t["symbol"]
        try:
            q = client.get_stock_quote(sym)
            h = client.get_price_history(sym, period="5d", interval="1d")
        except Exception:
            return None
        move_pct = float(q.change_percent)
        move_abs = float(q.change)
        if move_pct == 0.0:
            open_px = _latest_open(h)
            if open_px is not None:
                move_pct = round(((float(q.price) - float(open_px)) / float(open_px)) * 100.0, 4)
                move_abs = round(float(q.price) - float(open_px), 4)
        return {
            "symbol": sym,
            "label": t["label"],
            "price": float(q.price),
            "change": float(move_abs),
            "change_percent": float(move_pct),
            "spark": _mini_spark(h),
        }

    def _quote_for(sym: str) -> Optional[dict]:
        try:
            q = client.get_stock_quote(sym)
        except Exception:
            return None
        return {
            "symbol": sym,
            "price": float(q.price),
            "change_percent": float(q.change_percent),
            "volume": int(q.volume or 0),
        }

    # Concurrent fetch for tiles + universe quotes.
    out_tiles: List[dict] = []
    quotes: List[dict] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        tile_futures = {pool.submit(_tile_for, t): t["symbol"] for t in tiles}
        quote_futures = {pool.submit(_quote_for, sym): sym for sym in universe}

        done_tiles, pending_tiles = concurrent.futures.wait(
            set(tile_futures.keys()),
            timeout=8,
            return_when=concurrent.futures.ALL_COMPLETED,
        )
        for fut in done_tiles:
            try:
                row = fut.result()
                if row is not None:
                    out_tiles.append(row)
            except Exception:
                continue
        for fut in pending_tiles:
            fut.cancel()

        done_quotes, pending_quotes = concurrent.futures.wait(
            set(quote_futures.keys()),
            timeout=8,
            return_when=concurrent.futures.ALL_COMPLETED,
        )
        for fut in done_quotes:
            try:
                row = fut.result()
                if row is not None:
                    quotes.append(row)
            except Exception:
                continue
        for fut in pending_quotes:
            fut.cancel()

    # Restore data order for tiles (DIA, QQQ, SPY, IWM).
    tile_order = {t["symbol"]: i for i, t in enumerate(tiles)}
    out_tiles.sort(key=lambda x: tile_order.get(x["symbol"], 99))

    gainers: List[dict] = []
    losers: List[dict] = []
    if live:
        # Equity movers must remain non-Massive when MASSIVE_OPTIONS_ONLY policy is active.
        # Use Yahoo market-wide movers first, then local equity quote fallback.
        gainers, losers = _fetch_yahoo_market_movers(limit=7)
    if not gainers or not losers:
        positive_quotes = [q for q in quotes if float(q.get("change_percent", 0.0)) > 0.0]
        negative_quotes = [q for q in quotes if float(q.get("change_percent", 0.0)) < 0.0]
        gainers = sorted(positive_quotes, key=lambda r: r["change_percent"], reverse=True)[:7]
        losers = sorted(negative_quotes, key=lambda r: r["change_percent"])[:7]

    heatmap = [
        {"symbol": r["symbol"], "change_percent": r["change_percent"]}
        for r in sorted(quotes, key=lambda r: abs(r["change_percent"]), reverse=True)[:24]
    ]

    # Headlines are scoped to current mover tickers only.
    mover_symbols: List[str] = []
    for row in gainers + losers:
        sym = str(row.get("symbol") or "").upper().strip()
        if sym and sym not in mover_symbols:
            mover_symbols.append(sym)
    headlines = _fetch_massive_news_for_symbols(mover_symbols, limit=8)

    provider = client.last_provider or "unknown"
    response.headers["X-Market-Data-Provider"] = provider
    if client.last_detail:
        response.headers["X-Market-Data-Detail"] = client.last_detail

    payload = {
        "timestamp": now.isoformat(),
        "tiles": out_tiles,
        "gainers": gainers,
        "losers": losers,
        "heatmap": heatmap,
        "headlines": headlines,
    }

    # Cache the live payload.
    if live:
        _home_cache["payload"] = payload
        _home_cache["fetched_at"] = _time.monotonic()

    return payload



@router.get("/{symbol}", response_model=None)
def get_stock_quote(symbol: str, response: Response) -> StockQuote:
    client = MarketDataClient()
    out = client.get_stock_quote(symbol)
    response.headers["X-Market-Data-Provider"] = client.last_provider or "unknown"
    if client.last_detail:
        response.headers["X-Market-Data-Detail"] = client.last_detail
    return out


@router.get("/{symbol}/history", response_model=None)
def get_price_history(
    symbol: str,
    response: Response,
    period: str = Query("1mo", description="Range: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max"),
    interval: str = Query("1d", description="Interval: 1m, 5m, 15m, 30m, 1h, 1d, 1wk, 1mo"),
) -> List[OHLCV]:
    client = MarketDataClient()
    try:
        out = client.get_price_history(symbol, period=period, interval=interval)
    except MarketDataError:
        out = []
    response.headers["X-Market-Data-Provider"] = client.last_provider or "unknown"
    if client.last_detail:
        response.headers["X-Market-Data-Detail"] = client.last_detail
    return out


@router.get("/{symbol}/options/expirations", response_model=None)
def get_options_expirations(symbol: str, response: Response) -> List[str]:
    client = MarketDataClient()
    out = client.get_options_expirations(symbol)
    response.headers["X-Market-Data-Provider"] = client.last_provider or "unknown"
    if client.last_detail:
        response.headers["X-Market-Data-Detail"] = client.last_detail
    return out


@router.get("/{symbol}/options", response_model=None)
def get_options_chain(
    symbol: str,
    response: Response,
    expiration: Optional[str] = Query(None, description="Expiration date (YYYY-MM-DD)"),
) -> OptionsChain:
    client = MarketDataClient()
    out = client.get_options_chain(symbol, expiration=expiration)
    response.headers["X-Market-Data-Provider"] = client.last_provider or "unknown"
    if client.last_detail:
        response.headers["X-Market-Data-Detail"] = client.last_detail
    return out


@router.get("/{symbol}/technical", response_model=None)
def get_technical_analysis(
    symbol: str,
    period: str = Query("1y", description="Historical period for analysis"),
) -> TrendAnalysis:
    client = MarketDataClient()
    history = client.get_price_history(symbol, period=period, interval="1d")
    prices = [p.close for p in history]
    return technical_indicator_service.analyze_trend(prices=prices, symbol=symbol.upper())


@router.get("/{symbol}/volatility", response_model=None)
def get_volatility_analysis(
    symbol: str,
    period: str = Query("1y", description="Historical period for analysis"),
) -> VolatilityAnalysis:
    client = MarketDataClient()
    history = client.get_price_history(symbol, period=period, interval="1d")
    prices = [p.close for p in history]
    # Keep this endpoint fast and reliable; avoid options-chain calls here.
    return volatility_service.analyze(prices=prices, symbol=symbol.upper(), current_iv=None)


@router.get("/{symbol}/news", response_model=None)
def get_news(
    symbol: str,
    limit: int = Query(5, ge=1, le=50),
) -> List[dict]:
    """Best-effort news list: Massive -> yfinance."""
    symbol = symbol.upper().strip()
    return _fetch_news(symbol, limit=limit)


@router.get("/{symbol}/analysis", response_model=None)
def get_combined_analysis(
    symbol: str,
    response: Response,
    history_period: str = Query("1mo"),
    history_interval: str = Query("1d"),
    lookback_period: str = Query("6mo", description="Period for technical/vol analysis"),
    news_limit: int = Query(5, ge=0, le=50),
) -> dict:
    """Single-call analysis payload for a lightweight UI.

    Returns quote + history + technical + volatility + news + a small set of heuristic strategies.
    """
    symbol = symbol.upper().strip()
    client = MarketDataClient()

    quote = client.get_stock_quote(symbol)
    try:
        history = client.get_price_history(symbol, period=history_period, interval=history_interval)
    except MarketDataError:
        history = []

    # Tech/vol computed from a separate lookback (daily) to keep intraday history small.
    try:
        lookback = client.get_price_history(symbol, period=lookback_period, interval="1d")
    except MarketDataError:
        lookback = []
    prices = [p.close for p in lookback]
    tech = technical_indicator_service.analyze_trend(prices=prices, symbol=symbol)
    vol = volatility_service.analyze(prices=prices, symbol=symbol, current_iv=None)

    # News: Massive -> yfinance.
    news = _fetch_news(symbol, limit=int(news_limit))

    spot = float(quote.price)
    # Use a fixed short-dated expiry placeholder (3 weeks) for payoff diagrams if UI wants it.
    exp_str = (date.today() + timedelta(days=21)).isoformat()

    strategies = [
        {
            "strategy_name": "Covered Call",
            "strategy_type": "covered_call",
            "score": 70.0 if vol.volatility_level in {"high", "extreme"} else 55.0,
            "probability_of_profit": 0.65,
            "max_profit": round(((spot * 1.02 - spot) + (spot * 0.005)) * 100.0, 2),
            "max_loss": round((spot * 100.0) - (spot * 0.005 * 100.0), 2),
            "risk_reward_ratio": 0.0,
            "market_conditions_fit": "Neutral to slightly bullish; better when IV is elevated.",
            "legs": [
                {"action": "buy", "quantity": 100, "option_type": "stock", "premium": spot},
                {"action": "sell", "quantity": 1, "expiration": exp_str, "strike": round(spot * 1.02, 2), "option_type": "call", "premium": round(max(0.1, spot * 0.005), 4)},
            ],
        }
    ]
    if tech.direction == "bullish":
        strategies.append(
            {
                "strategy_name": "Bull Call Spread",
                "strategy_type": "bull_call_spread",
                "score": 72.0,
                "probability_of_profit": 0.45,
                "max_profit": 0.0,
                "max_loss": 0.0,
                "risk_reward_ratio": 0.0,
                "market_conditions_fit": "Bullish outlook; defined risk.",
                "legs": [
                    {"action": "buy", "quantity": 1, "expiration": exp_str, "strike": round(spot, 2), "option_type": "call", "premium": round(max(0.2, spot * 0.01), 4)},
                    {"action": "sell", "quantity": 1, "expiration": exp_str, "strike": round(spot * 1.03, 2), "option_type": "call", "premium": round(max(0.1, spot * 0.006), 4)},
                ],
            }
        )
    if tech.direction == "neutral" or vol.volatility_level in {"high", "extreme"}:
        strategies.append(
            {
                "strategy_name": "Iron Condor",
                "strategy_type": "iron_condor",
                "score": 75.0 if vol.volatility_level in {"high", "extreme"} else 60.0,
                "probability_of_profit": 0.60,
                "max_profit": 0.0,
                "max_loss": 0.0,
                "risk_reward_ratio": 0.0,
                "market_conditions_fit": "Neutral/range-bound; premium selling in higher IV.",
                "legs": [
                    {"action": "sell", "quantity": 1, "expiration": exp_str, "strike": round(spot * 1.02, 2), "option_type": "call", "premium": round(max(0.1, spot * 0.004), 4)},
                    {"action": "buy", "quantity": 1, "expiration": exp_str, "strike": round(spot * 1.04, 2), "option_type": "call", "premium": round(max(0.05, spot * 0.0025), 4)},
                    {"action": "sell", "quantity": 1, "expiration": exp_str, "strike": round(spot * 0.98, 2), "option_type": "put", "premium": round(max(0.1, spot * 0.004), 4)},
                    {"action": "buy", "quantity": 1, "expiration": exp_str, "strike": round(spot * 0.96, 2), "option_type": "put", "premium": round(max(0.05, spot * 0.0025), 4)},
                ],
            }
        )

    response.headers["X-Market-Data-Provider"] = client.last_provider or "unknown"
    if client.last_detail:
        response.headers["X-Market-Data-Detail"] = client.last_detail

    return {
        "symbol": symbol,
        "quote": quote,
        "history": history,
        "technical": tech,
        "volatility": vol,
        "news": news,
        "strategies": strategies,
    }
