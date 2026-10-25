from __future__ import annotations

import concurrent.futures
from typing import Any, Dict, List, Optional

from analysis_layer import technical_indicator_service
from fastapi import APIRouter, Query
from market_data_layer import MarketDataClient

router = APIRouter()

# ── Default Universe ─────────────────────────────────────────────────────────
# S&P 500 top components + high-volume names across all sectors.
# Pass `symbols=AAPL,TSLA` to override with your own list.
_RAW_UNIVERSE = [
    # Mega-cap tech / semiconductors
    "AAPL", "MSFT", "NVDA", "AVGO", "AMD", "INTC", "QCOM", "TXN", "AMAT", "LRCX",
    "KLAC", "MRVL", "MU", "SNPS", "CDNS", "MCHP", "ADI", "NXPI", "ON",
    # Software / cloud / cybersecurity
    "ADBE", "CRM", "NOW", "INTU", "ORCL", "SAP", "ANSS", "FTNT", "PANW", "CRWD",
    "ZS", "DDOG", "NET", "SNOW", "PLTR", "WDAY", "VEEV", "TEAM", "HUBS", "OKTA",
    "ZI", "SMAR", "BOX", "DOCN",
    # Internet / e-commerce / media
    "AMZN", "GOOGL", "META", "NFLX", "UBER", "LYFT", "SHOP", "MELI", "BIDU", "JD",
    "ABNB", "DASH", "RBLX", "PINS", "SNAP", "TWTR", "RDDT",
    # EV / autos
    "TSLA", "RIVN", "LCID", "F", "GM", "TM", "HMC", "STLA",
    # Financials — banks / brokers / payments
    "JPM", "BAC", "WFC", "GS", "MS", "C", "BLK", "SCHW", "AXP", "V", "MA",
    "PYPL", "SQ", "COF", "USB", "PNC", "TFC", "DFS", "KEY", "RF", "HBAN",
    "AIG", "MET", "PRU", "AFL", "ALL", "TRV", "CB",
    # Healthcare / pharma / biotech
    "UNH", "JNJ", "LLY", "ABBV", "MRK", "PFE", "BMY", "AMGN", "GILD", "BIIB",
    "REGN", "VRTX", "ISRG", "EW", "DXCM", "ILMN", "MRNA", "BNTX", "TMO", "DHR",
    "MDT", "BSX", "SYK", "BDX", "ZBH", "HCA", "CI", "CVS", "WBA", "MCK", "ABC",
    "CAH", "HOLX", "IQV", "A", "WAT",
    # Consumer discretionary
    "WMT", "COST", "HD", "TGT", "LOW", "BKNG", "EXPE", "MAR", "HLT", "WYNN",
    "MGM", "LVS", "MCD", "SBUX", "YUM", "QSR", "DPZ", "CMG",
    "NKE", "LULU", "TPR", "PVH", "VFC", "RH", "M", "KSS", "JWN",
    "AMZN", "EBAY", "ETSY", "W", "CHWY",
    # Consumer staples / beverages / tobacco
    "PG", "KO", "PEP", "PM", "MO", "KMB", "CL", "EL", "ULTA", "SYY",
    "MNST", "STZ", "TAP", "BF.B", "K", "GIS", "CPB", "HRL", "MKC",
    # Energy
    "XOM", "CVX", "COP", "EOG", "SLB", "MPC", "PSX", "VLO", "HES", "DVN",
    "OXY", "HAL", "BKR", "LNG", "KMI", "WMB", "ET", "TRGP",
    # Industrials
    "CAT", "DE", "HON", "MMM", "GE", "RTX", "LMT", "NOC", "BA", "GD",
    "UPS", "FDX", "CSX", "UNP", "NSC", "DAL", "UAL", "AAL", "LUV",
    "EMR", "ETN", "ROK", "PH", "ITW", "DOV", "XYL", "ROP", "CTAS",
    # Materials
    "FCX", "NEM", "AA", "X", "NUE", "CLF", "LIN", "APD", "SHW", "ECL", "DD",
    "CF", "MOS", "ICL", "ALB", "SQM",
    # Real estate
    "AMT", "PLD", "EQIX", "CCI", "SPG", "O", "WELL", "PSA", "EXR", "AVB",
    # Utilities / telecom
    "NEE", "DUK", "SO", "D", "AEP", "EXC", "SRE", "PCG", "XEL",
    "T", "VZ", "TMUS",
    # ETFs (tradeable universe anchors)
    "SPY", "QQQ", "IWM", "DIA", "GLD", "SLV", "TLT", "HYG", "XLK", "XLF",
    "XLE", "XLV", "XLP", "XLI", "XLU", "XLRE", "XLY", "XLB", "XLC",
    # Other large-cap
    "BRK.B", "BX", "KKR", "APO", "CG", "ARES",
    "TSMC", "ASML", "ARM",
]
# De-duplicate while preserving order
_seen: set = set()
_UNIVERSE: List[str] = []
for _s in _RAW_UNIVERSE:
    if _s not in _seen:
        _seen.add(_s)
        _UNIVERSE.append(_s)


def _fetch_row(sym: str, client: MarketDataClient) -> Optional[Dict[str, Any]]:
    """Fetch quote + history + technicals for one symbol. Returns None on error."""
    try:
        quote = client.get_stock_quote(sym)
        history = client.get_price_history(sym, period="3mo", interval="1d")
        prices = [p.close for p in history]
        if not prices:
            return None
        tech = technical_indicator_service.analyze_trend(prices=prices, symbol=sym)
        svc = technical_indicator_service
        sma_20 = round(svc.sma(prices, 20), 2)
        sma_50 = round(svc.sma(prices, 50), 2)
        sma_200 = round(svc.sma(prices, 200), 2)
        macd_res = svc.macd(prices)
        rsi_val = float(tech.rsi.value) if tech and tech.rsi else 50.0
        rsi_cond = str(tech.rsi.condition) if tech and tech.rsi else "neutral"
        px = float(quote.price)
        chg_pct = float(quote.change_percent)
        vol = int(quote.volume)
        return {
            "symbol": sym,
            "price": round(px, 2),
            "change_pct": round(chg_pct, 2),
            "volume": vol,
            "iv_rank": 50.0,  # placeholder until IV history feed
            "rsi": round(rsi_val, 2),
            "rsi_cond": rsi_cond,
            "trend": str(tech.direction),
            "macd_trend": str(macd_res.trend),
            "sma_20": sma_20,
            "sma_50": sma_50,
            "sma_200": sma_200,
        }
    except Exception:
        return None


@router.get("/screener", response_model=None)
def screener(
    # Universe override — comma-separated tickers e.g. AAPL,TSLA,NVDA
    symbols: Optional[str] = Query(None),
    # Descriptive
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    min_change_pct: Optional[float] = Query(None),
    max_change_pct: Optional[float] = Query(None),
    # RSI
    min_rsi: Optional[float] = Query(None),
    max_rsi: Optional[float] = Query(None),
    rsi_cond: Optional[str] = Query(None),  # overbought|oversold|not_overbought|not_oversold|neutral
    # Trend / MACD / SMA
    trend: Optional[str] = Query(None),       # bullish|bearish|neutral
    macd_trend: Optional[str] = Query(None),  # bullish|bearish|neutral
    sma20_pos: Optional[str] = Query(None),   # above|below
    sma50_pos: Optional[str] = Query(None),   # above|below
    sma200_pos: Optional[str] = Query(None),  # above|below
    sma_cross: Optional[str] = Query(None),   # golden|death
    # Options
    min_iv_rank: Optional[float] = Query(None),
    max_iv_rank: Optional[float] = Query(None),
) -> List[Dict[str, Any]]:
    """Screener covering the full S&P 500 / major US equities universe.

    Pass ``symbols=AAPL,TSLA,NVDA`` to screen a custom list.
    Fetches concurrently (10 threads, 12-second timeout).
    """
    universe = (
        [s.strip().upper() for s in symbols.split(",") if s.strip()]
        if symbols
        else _UNIVERSE
    )

    client = MarketDataClient()
    raw: List[Dict[str, Any]] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(_fetch_row, sym, client): sym for sym in universe}
        done, pending = concurrent.futures.wait(
            futures.keys(), timeout=12, return_when=concurrent.futures.ALL_COMPLETED
        )
        for f in pending:
            f.cancel()
        for f in done:
            result = f.result()
            if result is not None:
                raw.append(result)

    out: List[Dict[str, Any]] = []
    for r in raw:
        px = float(r["price"])
        rsi_val = float(r["rsi"])
        chg = float(r["change_pct"])
        sma20 = float(r["sma_20"])
        sma50 = float(r["sma_50"])
        sma200 = float(r["sma_200"])

        if min_price is not None and px < min_price:
            continue
        if max_price is not None and px > max_price:
            continue
        if min_change_pct is not None and chg < min_change_pct:
            continue
        if max_change_pct is not None and chg > max_change_pct:
            continue
        if min_rsi is not None and rsi_val < min_rsi:
            continue
        if max_rsi is not None and rsi_val > max_rsi:
            continue
        if rsi_cond:
            rc = rsi_cond.lower()
            if rc == "overbought" and rsi_val < 70:
                continue
            if rc == "oversold" and rsi_val > 30:
                continue
            if rc == "not_overbought" and rsi_val >= 70:
                continue
            if rc == "not_oversold" and rsi_val <= 30:
                continue
            if rc == "neutral" and (rsi_val >= 70 or rsi_val <= 30):
                continue
        if trend and r["trend"] != trend.lower():
            continue
        if macd_trend and r["macd_trend"] != macd_trend.lower():
            continue
        if sma20_pos:
            if sma20_pos == "above" and px < sma20:
                continue
            if sma20_pos == "below" and px > sma20:
                continue
        if sma50_pos:
            if sma50_pos == "above" and px < sma50:
                continue
            if sma50_pos == "below" and px > sma50:
                continue
        if sma200_pos:
            if sma200_pos == "above" and px < sma200:
                continue
            if sma200_pos == "below" and px > sma200:
                continue
        if sma_cross:
            if sma_cross == "golden" and sma50 <= sma200:
                continue
            if sma_cross == "death" and sma50 >= sma200:
                continue
        iv = float(r["iv_rank"])
        if min_iv_rank is not None and iv < min_iv_rank:
            continue
        if max_iv_rank is not None and iv > max_iv_rank:
            continue

        out.append(r)

    out.sort(key=lambda r: (
        -abs(float(r.get("change_pct") or 0.0)),
        -abs(float(r.get("rsi") or 50.0) - 50.0),
        str(r.get("symbol") or ""),
    ))
    return out
