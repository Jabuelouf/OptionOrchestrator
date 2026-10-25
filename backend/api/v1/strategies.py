from __future__ import annotations

from dataclasses import asdict, is_dataclass
from datetime import date, datetime, timedelta, timezone
from math import erf, exp, log, sqrt
from typing import Any, Dict, List, Optional

from analysis_layer import technical_indicator_service, volatility_service
from analysis_layer.greeks import black_scholes_price
from fastapi import APIRouter, Body, Query
from market_data_layer import MarketDataClient
from shared.schemas import (
    SimulationLeg,
    SimulationPoint,
    SimulationResponse,
    StrategyComparisonResponse,
    StrategyLeg,
    StrategyScore,
)

router = APIRouter()


def _to_dict(obj: Any) -> Any:
    if is_dataclass(obj):
        return asdict(obj)
    if isinstance(obj, list):
        return [_to_dict(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _to_dict(v) for k, v in obj.items()}
    return obj


def _pick_expiration(expirations: List[str], min_dte: int = 7, max_dte: int = 45) -> Optional[str]:
    today = date.today()
    best = None
    for expiration in expirations:
        try:
            d = date.fromisoformat(expiration)
        except Exception:
            continue
        dte = (d - today).days
        if min_dte <= dte <= max_dte:
            best = expiration
            break
    return best or (expirations[0] if expirations else None)


def _mid(bid: float, ask: float, last: float) -> float:
    if bid > 0 and ask > 0:
        return (bid + ask) / 2.0
    if last > 0:
        return last
    return 0.0


def _dte(expiration: str) -> Optional[int]:
    try:
        return (date.fromisoformat(expiration) - date.today()).days
    except Exception:
        return None


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _cdf(x: float) -> float:
    return 0.5 * (1.0 + erf(x / sqrt(2.0)))


def _norm_pdf(x: float) -> float:
    return exp(-0.5 * x * x) / sqrt(2.0 * 3.141592653589793)


def _bs_greeks(option_type: str, spot: float, strike: float, t: float, rate: float, sigma: float) -> Dict[str, float]:
    """Per-contract greeks (delta/gamma/theta/vega), approx Black-Scholes.

    - theta is per day (not per year)
    - vega is per 1 vol point (1%) per share; we multiply by 100 for contract scaling at the call site
    """
    sigma = max(float(sigma), 1e-6)
    t = max(float(t), 1.0 / 365.0)
    spot = float(spot)
    strike = max(float(strike), 1e-6)
    rate = float(rate)

    sigma_sqrt_t = sigma * sqrt(t)
    d1 = (log(spot / strike) + (rate + 0.5 * sigma * sigma) * t) / sigma_sqrt_t
    d2 = d1 - sigma_sqrt_t

    nd1 = _cdf(d1)
    nd2 = _cdf(d2)
    pdf_d1 = _norm_pdf(d1)

    if option_type == "call":
        delta = nd1
        theta = (-(spot * pdf_d1 * sigma) / (2 * sqrt(t)) - rate * strike * exp(-rate * t) * nd2) / 365.0
    else:
        delta = nd1 - 1.0
        theta = (-(spot * pdf_d1 * sigma) / (2 * sqrt(t)) + rate * strike * exp(-rate * t) * _cdf(-d2)) / 365.0

    gamma = pdf_d1 / (spot * sigma * sqrt(t))
    vega = (spot * pdf_d1 * sqrt(t)) / 100.0  # per 1% vol point
    return {"delta": float(delta), "gamma": float(gamma), "theta": float(theta), "vega": float(vega)}


@router.get("/{symbol}/overview", response_model=None)
def strategy_overview(symbol: str) -> Dict[str, Any]:
    symbol = symbol.upper().strip()
    market = MarketDataClient()
    quote = market.get_stock_quote(symbol)
    history = market.get_price_history(symbol, period="6mo", interval="1d")
    prices = [p.close for p in history]
    tech = technical_indicator_service.analyze_trend(prices=prices, symbol=symbol)
    vol = volatility_service.analyze(prices=prices, symbol=symbol, current_iv=None)
    return {
        "symbol": symbol,
        "current_price": float(quote.price),
        "trend": str(tech.direction),
        "volatility_level": str(vol.volatility_level),
        "available": [
            "covered-calls",
            "cash-secured-puts",
            "vertical-spreads",
            "iron-condors",
            "long-options",
            "protective-puts",
            "wheel",
            "butterfly",
            "time-spreads",
            "ratio-spreads",
            "jade-lizards",
            "straddles-strangles",
        ],
        "note": "Strategy endpoints are heuristics for UI parity; replace with orchestrated reasoning later.",
    }


@router.get("/{symbol}/covered-calls", response_model=None)
def covered_calls(
    symbol: str,
    objective: str = Query("balanced"),
    min_dte: int = Query(14, ge=0, le=365),
    max_dte: int = Query(60, ge=1, le=365),
) -> Dict[str, Any]:
    symbol = symbol.upper().strip()
    market = MarketDataClient()
    quote = market.get_stock_quote(symbol)
    expirations = market.get_options_expirations(symbol)
    exp = _pick_expiration(expirations, min_dte=min_dte, max_dte=max_dte)
    if not exp:
        return {"analysis_date": datetime.now(timezone.utc).isoformat(), "iv_rank": 50.0, "recommendations": []}

    chain = market.get_options_chain(symbol, expiration=exp)
    spot = float(quote.price)

    obj = str(objective).lower().strip()
    mult = 1.03
    if obj == "income":
        mult = 1.01
    elif obj == "growth":
        mult = 1.06

    calls = sorted(chain.calls, key=lambda c: c.strike)
    if not calls:
        return {"analysis_date": datetime.now(timezone.utc).isoformat(), "iv_rank": 50.0, "recommendations": []}

    target = spot * mult
    picks = [c for c in calls if c.strike >= target] or calls[-3:]
    recs = []
    for c in picks[:5]:
        prem = _mid(c.bid, c.ask, c.last_price)
        dte = _dte(chain.expiration_date) or 0
        max_profit = ((c.strike - spot) + prem) * 100.0
        capital = max(1.0, (spot * 100.0) - (prem * 100.0))
        roc = max_profit / capital
        breakeven = spot - prem
        # Score: premium yield + upside room, penalize very long dte.
        score = 50.0 + _clamp((prem / max(spot, 1.0)) * 5000.0, 0.0, 30.0) + _clamp((c.strike - spot) / max(spot, 1.0) * 1000.0, 0.0, 20.0)
        score -= _clamp(dte / 10.0, 0.0, 10.0)
        recs.append(
            {
                "expiration": chain.expiration_date,
                "days_to_expiration": dte,
                "strike": float(c.strike),
                "premium": round(float(prem), 4),
                "max_profit": round(float(max_profit), 2),
                "return_on_capital": round(float(roc), 4),
                "breakeven": round(float(breakeven), 4),
                "score": round(float(_clamp(score, 0.0, 100.0)), 2),
            }
        )

    recs.sort(key=lambda r: r["score"], reverse=True)
    return {"analysis_date": datetime.now(timezone.utc).isoformat(), "iv_rank": 50.0, "recommendations": recs}


@router.get("/{symbol}/cash-secured-puts", response_model=None)
def cash_secured_puts(
    symbol: str,
    objective: str = Query("balanced"),
    min_dte: int = Query(14, ge=0, le=365),
    max_dte: int = Query(60, ge=1, le=365),
) -> Dict[str, Any]:
    symbol = symbol.upper().strip()
    market = MarketDataClient()
    quote = market.get_stock_quote(symbol)
    expirations = market.get_options_expirations(symbol)
    exp = _pick_expiration(expirations, min_dte=min_dte, max_dte=max_dte)
    if not exp:
        return {"analysis_date": datetime.now(timezone.utc).isoformat(), "recommendations": [], "volatility_assessment": None}

    chain = market.get_options_chain(symbol, expiration=exp)
    spot = float(quote.price)
    obj = str(objective).lower().strip()
    mult = 0.95
    if obj == "income":
        mult = 0.92
    elif obj == "acquisition":
        mult = 0.98

    puts = sorted(chain.puts, key=lambda p: p.strike)
    if not puts:
        return {"analysis_date": datetime.now(timezone.utc).isoformat(), "recommendations": [], "volatility_assessment": None}

    target = spot * mult
    candidates = [p for p in puts if p.strike <= target] or puts[:3]
    recs = []
    for p in reversed(candidates[-8:])[:5]:
        prem = _mid(p.bid, p.ask, p.last_price)
        dte = _dte(chain.expiration_date) or 0
        cost_basis = p.strike - prem
        downside_prot = ((spot - p.strike) / spot * 100.0) if spot else 0.0
        ann_ret = ((prem / max(p.strike, 1.0)) * (365.0 / max(dte, 1))) * 100.0
        score = 50.0 + _clamp(ann_ret / 2.0, 0.0, 30.0) + _clamp(downside_prot, 0.0, 20.0)
        recs.append(
            {
                "expiration": chain.expiration_date,
                "days_to_expiration": dte,
                "strike": float(p.strike),
                "premium": round(float(prem), 4),
                "cost_basis_if_assigned": round(float(cost_basis), 4),
                "annualized_return": round(float(ann_ret), 2),
                "downside_protection": round(float(downside_prot), 2),
                "score": round(float(_clamp(score, 0.0, 100.0)), 2),
            }
        )

    recs.sort(key=lambda r: r["score"], reverse=True)
    return {
        "analysis_date": datetime.now(timezone.utc).isoformat(),
        "recommendations": recs,
        "volatility_assessment": "Placeholder: add IV rank/history to refine premium-selling timing.",
    }


@router.get("/{symbol}/vertical-spreads", response_model=None)
def vertical_spreads(
    symbol: str,
    spread_type: str = Query("bull_call"),
    min_dte: int = Query(14, ge=0, le=365),
    max_dte: int = Query(60, ge=1, le=365),
    min_width: float = Query(2.0, gt=0),
    max_width: float = Query(10.0, gt=0),
) -> Dict[str, Any]:
    symbol = symbol.upper().strip()
    market = MarketDataClient()
    quote = market.get_stock_quote(symbol)
    expirations = market.get_options_expirations(symbol)
    exp = _pick_expiration(expirations, min_dte=min_dte, max_dte=max_dte)
    if not exp:
        return {"analysis_date": datetime.now(timezone.utc).isoformat(), "iv_rank": 50.0, "recommendations": []}

    chain = market.get_options_chain(symbol, expiration=exp)
    spot = float(quote.price)
    st = str(spread_type).lower().strip()
    dte = _dte(chain.expiration_date) or 0

    calls = sorted(chain.calls, key=lambda c: c.strike)
    puts = sorted(chain.puts, key=lambda p: p.strike)
    recs = []

    def pick_pair(strikes: List[float], center: float, width: float) -> Optional[tuple[float, float]]:
        if not strikes:
            return None
        # Find closest to center, then closest to center+/-width.
        long_strike = min(strikes, key=lambda s: abs(s - center))
        target = center + width
        short_strike = min(strikes, key=lambda s: abs(s - target))
        if abs(short_strike - long_strike) < min_width or abs(short_strike - long_strike) > max_width:
            # Fall back to nearest width within bounds.
            for w in [min_width, (min_width + max_width) / 2.0, max_width]:
                target2 = center + w
                short2 = min(strikes, key=lambda s: abs(s - target2))
                if min_width <= abs(short2 - long_strike) <= max_width:
                    short_strike = short2
                    break
        return (float(long_strike), float(short_strike))

    if st == "bull_call" and calls:
        # Debit: buy ATM call, sell OTM call.
        pair = pick_pair([c.strike for c in calls], center=spot, width=min_width)
        if pair:
            long_k, short_k = pair
            long_c = min(calls, key=lambda c: abs(c.strike - long_k))
            short_c = min(calls, key=lambda c: abs(c.strike - max(long_k, short_k)))
            long_p = _mid(long_c.bid, long_c.ask, long_c.last_price)
            short_p = _mid(short_c.bid, short_c.ask, short_c.last_price)
            debit = max(0.0, long_p - short_p)
            width = abs(short_c.strike - long_c.strike)
            max_profit = max(0.0, (width - debit) * 100.0)
            max_loss = max(0.01, debit * 100.0)
            breakeven = long_c.strike + debit
            score = 60.0 + _clamp(max_profit / max_loss * 10.0, 0.0, 30.0) - _clamp(dte / 12.0, 0.0, 10.0)
            recs.append(
                {
                    "expiration": chain.expiration_date,
                    "days_to_expiration": dte,
                    "long_strike": float(long_c.strike),
                    "short_strike": float(short_c.strike),
                    "width": float(width),
                    "net_premium": round(float(debit), 4),
                    "max_profit": round(float(max_profit), 2),
                    "max_loss": round(float(max_loss), 2),
                    "breakeven": round(float(breakeven), 4),
                    "score": round(float(_clamp(score, 0.0, 100.0)), 2),
                }
            )

    elif st == "bear_put" and puts:
        # Debit: buy ATM put, sell lower strike put.
        strikes = [p.strike for p in puts]
        pair = pick_pair(strikes, center=spot, width=-min_width)
        if pair:
            # For puts, we want (long higher strike, short lower strike)
            long_k = max(pair)
            short_k = min(pair)
            long_pu = min(puts, key=lambda p: abs(p.strike - long_k))
            short_pu = min(puts, key=lambda p: abs(p.strike - short_k))
            long_p = _mid(long_pu.bid, long_pu.ask, long_pu.last_price)
            short_p = _mid(short_pu.bid, short_pu.ask, short_pu.last_price)
            debit = max(0.0, long_p - short_p)
            width = abs(long_pu.strike - short_pu.strike)
            max_profit = max(0.0, (width - debit) * 100.0)
            max_loss = max(0.01, debit * 100.0)
            breakeven = long_pu.strike - debit
            score = 60.0 + _clamp(max_profit / max_loss * 10.0, 0.0, 30.0) - _clamp(dte / 12.0, 0.0, 10.0)
            recs.append(
                {
                    "expiration": chain.expiration_date,
                    "days_to_expiration": dte,
                    "long_strike": float(long_pu.strike),
                    "short_strike": float(short_pu.strike),
                    "width": float(width),
                    "net_premium": round(float(debit), 4),
                    "max_profit": round(float(max_profit), 2),
                    "max_loss": round(float(max_loss), 2),
                    "breakeven": round(float(breakeven), 4),
                    "score": round(float(_clamp(score, 0.0, 100.0)), 2),
                }
            )

    elif st == "bull_put" and puts:
        # Credit: sell put (higher strike), buy put (lower strike).
        strikes = [p.strike for p in puts]
        short_strike = min(strikes, key=lambda s: abs(s - (spot * 0.98)))
        long_target = short_strike - max(min_width, 1.0)
        long_strike = min(strikes, key=lambda s: abs(s - long_target))
        short_pu = min(puts, key=lambda p: abs(p.strike - short_strike))
        long_pu = min(puts, key=lambda p: abs(p.strike - long_strike))
        credit = max(0.0, _mid(short_pu.bid, short_pu.ask, short_pu.last_price) - _mid(long_pu.bid, long_pu.ask, long_pu.last_price))
        width = abs(short_pu.strike - long_pu.strike)
        max_profit = credit * 100.0
        max_loss = max(0.01, (width - credit) * 100.0)
        breakeven = short_pu.strike - credit
        score = 62.0 + _clamp(max_profit / max_loss * 12.0, 0.0, 28.0) - _clamp(dte / 12.0, 0.0, 10.0)
        recs.append(
            {
                "expiration": chain.expiration_date,
                "days_to_expiration": dte,
                "long_strike": float(long_pu.strike),
                "short_strike": float(short_pu.strike),
                "width": float(width),
                "net_premium": round(float(credit), 4),
                "max_profit": round(float(max_profit), 2),
                "max_loss": round(float(max_loss), 2),
                "breakeven": round(float(breakeven), 4),
                "score": round(float(_clamp(score, 0.0, 100.0)), 2),
            }
        )

    elif st == "bear_call" and calls:
        # Credit: sell call (lower strike), buy call (higher strike).
        strikes = [c.strike for c in calls]
        short_strike = min(strikes, key=lambda s: abs(s - (spot * 1.02)))
        long_target = short_strike + max(min_width, 1.0)
        long_strike = min(strikes, key=lambda s: abs(s - long_target))
        short_c = min(calls, key=lambda c: abs(c.strike - short_strike))
        long_c = min(calls, key=lambda c: abs(c.strike - long_strike))
        credit = max(0.0, _mid(short_c.bid, short_c.ask, short_c.last_price) - _mid(long_c.bid, long_c.ask, long_c.last_price))
        width = abs(long_c.strike - short_c.strike)
        max_profit = credit * 100.0
        max_loss = max(0.01, (width - credit) * 100.0)
        breakeven = short_c.strike + credit
        score = 62.0 + _clamp(max_profit / max_loss * 12.0, 0.0, 28.0) - _clamp(dte / 12.0, 0.0, 10.0)
        recs.append(
            {
                "expiration": chain.expiration_date,
                "days_to_expiration": dte,
                "long_strike": float(long_c.strike),
                "short_strike": float(short_c.strike),
                "width": float(width),
                "net_premium": round(float(credit), 4),
                "max_profit": round(float(max_profit), 2),
                "max_loss": round(float(max_loss), 2),
                "breakeven": round(float(breakeven), 4),
                "score": round(float(_clamp(score, 0.0, 100.0)), 2),
            }
        )

    recs.sort(key=lambda r: r["score"], reverse=True)
    return {"analysis_date": datetime.now(timezone.utc).isoformat(), "iv_rank": 50.0, "recommendations": recs}


@router.get("/{symbol}/iron-condors", response_model=None)
def iron_condors(
    symbol: str,
    min_dte: int = Query(21, ge=0, le=365),
    max_dte: int = Query(60, ge=1, le=365),
    wing_width: float = Query(5.0, gt=0.0),
) -> Dict[str, Any]:
    symbol = symbol.upper().strip()
    market = MarketDataClient()
    quote = market.get_stock_quote(symbol)
    expirations = market.get_options_expirations(symbol)
    exp = _pick_expiration(expirations, min_dte=min_dte, max_dte=max_dte)
    if not exp:
        return {"analysis_date": datetime.now(timezone.utc).isoformat(), "iv_rank": 50.0, "recommendations": []}

    chain = market.get_options_chain(symbol, expiration=exp)
    spot = float(quote.price)
    dte = _dte(chain.expiration_date) or 0
    calls = sorted(chain.calls, key=lambda c: c.strike)
    puts = sorted(chain.puts, key=lambda p: p.strike)
    if not calls or not puts:
        return {"analysis_date": datetime.now(timezone.utc).isoformat(), "iv_rank": 50.0, "recommendations": []}

    # Choose short strikes around +/-2% then apply wing width.
    short_put_k = min([p.strike for p in puts], key=lambda s: abs(s - (spot * 0.98)))
    long_put_k = short_put_k - float(wing_width)
    short_call_k = min([c.strike for c in calls], key=lambda s: abs(s - (spot * 1.02)))
    long_call_k = short_call_k + float(wing_width)

    short_put = min(puts, key=lambda p: abs(p.strike - short_put_k))
    long_put = min(puts, key=lambda p: abs(p.strike - long_put_k))
    short_call = min(calls, key=lambda c: abs(c.strike - short_call_k))
    long_call = min(calls, key=lambda c: abs(c.strike - long_call_k))

    sp = _mid(short_put.bid, short_put.ask, short_put.last_price)
    lp = _mid(long_put.bid, long_put.ask, long_put.last_price)
    sc = _mid(short_call.bid, short_call.ask, short_call.last_price)
    lc = _mid(long_call.bid, long_call.ask, long_call.last_price)
    credit = max(0.0, (sp - lp) + (sc - lc))
    max_profit = credit * 100.0
    max_loss = max(0.01, (float(wing_width) - credit) * 100.0)
    lower_be = short_put.strike - credit
    upper_be = short_call.strike + credit
    score = 65.0 + _clamp(max_profit / max_loss * 15.0, 0.0, 25.0) - _clamp(dte / 10.0, 0.0, 10.0)

    rec = {
        "expiration": chain.expiration_date,
        "days_to_expiration": dte,
        "put_long_strike": float(long_put.strike),
        "put_short_strike": float(short_put.strike),
        "call_short_strike": float(short_call.strike),
        "call_long_strike": float(long_call.strike),
        "total_credit": round(float(credit), 4),
        "max_profit": round(float(max_profit), 2),
        "max_loss": round(float(max_loss), 2),
        "lower_breakeven": round(float(lower_be), 4),
        "upper_breakeven": round(float(upper_be), 4),
        "score": round(float(_clamp(score, 0.0, 100.0)), 2),
    }
    return {"analysis_date": datetime.now(timezone.utc).isoformat(), "iv_rank": 50.0, "recommendations": [rec]}


@router.get("/{symbol}/long-options", response_model=None)
def long_options(
    symbol: str,
    option_type: str = Query("call"),
    objective: str = Query("balanced"),
    min_dte: int = Query(14, ge=0, le=365),
    max_dte: int = Query(90, ge=1, le=365),
) -> Dict[str, Any]:
    symbol = symbol.upper().strip()
    market = MarketDataClient()
    quote = market.get_stock_quote(symbol)
    expirations = market.get_options_expirations(symbol)
    exp = _pick_expiration(expirations, min_dte=min_dte, max_dte=max_dte)
    if not exp:
        return {"analysis_date": datetime.now(timezone.utc).isoformat(), "recommendations": [], "volatility_assessment": None}

    chain = market.get_options_chain(symbol, expiration=exp)
    spot = float(quote.price)
    ot = str(option_type).lower().strip()
    obj = str(objective).lower().strip()
    dte = _dte(chain.expiration_date) or 0
    t = max(dte / 365.0, 1.0 / 365.0)
    rate = 0.04

    contracts = chain.calls if ot == "call" else chain.puts
    if not contracts:
        return {"analysis_date": datetime.now(timezone.utc).isoformat(), "recommendations": [], "volatility_assessment": None}

    if ot == "call":
        if obj == "aggressive":
            target = spot * 0.99
        elif obj == "speculative":
            target = spot * 1.05
        else:
            target = spot * 1.02
    else:
        if obj == "aggressive":
            target = spot * 1.01
        elif obj == "speculative":
            target = spot * 0.95
        else:
            target = spot * 0.98

    pick = min(contracts, key=lambda c: abs(c.strike - target))
    prem = _mid(pick.bid, pick.ask, pick.last_price)
    iv = float(pick.implied_volatility or 0.30)
    if iv > 1.0:
        iv = iv / 100.0
    iv = max(iv, 0.01)

    greeks = _bs_greeks(ot, spot, float(pick.strike), t, rate, iv)
    # Approx per-contract scaling for display:
    delta = greeks["delta"]
    gamma = greeks["gamma"]
    theta = greeks["theta"] * 100.0  # per contract per day
    vega = greeks["vega"] * 100.0   # per contract per 1 vol point

    if ot == "call":
        breakeven = float(pick.strike) + prem
    else:
        breakeven = float(pick.strike) - prem

    moneyness = "ATM"
    if ot == "call":
        if pick.strike < spot * 0.98:
            moneyness = "ITM"
        elif pick.strike > spot * 1.02:
            moneyness = "OTM"
    else:
        if pick.strike > spot * 1.02:
            moneyness = "ITM"
        elif pick.strike < spot * 0.98:
            moneyness = "OTM"

    max_loss = prem * 100.0
    leverage = (spot / max(prem, 0.01))
    score = 60.0 + _clamp(abs(delta) * 30.0, 0.0, 25.0) + _clamp(1.0 / max(prem, 0.05), 0.0, 10.0) - _clamp(dte / 15.0, 0.0, 10.0)

    rec = {
        "expiration": chain.expiration_date,
        "days_to_expiration": dte,
        "strike": float(pick.strike),
        "moneyness": moneyness,
        "premium": round(float(prem), 4),
        "breakeven": round(float(breakeven), 4),
        "delta": round(float(delta), 4),
        "gamma": round(float(gamma), 6),
        "theta": round(float(theta), 4),
        "vega": round(float(vega), 4),
        "implied_volatility": round(float(iv * 100.0), 2),
        "leverage_ratio": round(float(leverage), 2),
        "max_loss": round(float(max_loss), 2),
        "score": round(float(_clamp(score, 0.0, 100.0)), 2),
    }

    return {
        "analysis_date": datetime.now(timezone.utc).isoformat(),
        "recommendations": [rec],
        "volatility_assessment": "Placeholder: add IV rank/history to time long-vol entries.",
    }


@router.get("/{symbol}/protective-puts", response_model=None)
def protective_puts(
    symbol: str,
    protection_level: str = Query("moderate"),
    shares: int = Query(100, ge=1, le=100000),
    min_dte: int = Query(14, ge=0, le=365),
    max_dte: int = Query(90, ge=1, le=365),
) -> Dict[str, Any]:
    symbol = symbol.upper().strip()
    market = MarketDataClient()
    quote = market.get_stock_quote(symbol)
    expirations = market.get_options_expirations(symbol)
    exp = _pick_expiration(expirations, min_dte=min_dte, max_dte=max_dte)
    if not exp:
        return {"shares_to_protect": shares, "recommendations": [], "summary": None, "volatility_assessment": None}

    chain = market.get_options_chain(symbol, expiration=exp)
    spot = float(quote.price)
    lvl = str(protection_level).lower().strip()
    mult = 0.90
    if lvl == "aggressive":
        mult = 0.85
    elif lvl == "conservative":
        mult = 0.95

    puts = sorted(chain.puts, key=lambda p: p.strike)
    if not puts:
        return {"shares_to_protect": shares, "recommendations": [], "summary": None, "volatility_assessment": None}

    target = spot * mult
    pick = min(puts, key=lambda p: abs(p.strike - target))
    prem = _mid(pick.bid, pick.ask, pick.last_price)
    dte = _dte(chain.expiration_date) or 0

    prot_pct = ((spot - pick.strike) / spot * 100.0) if spot else 0.0
    total_cost = prem * float(shares)
    max_loss_total = ((spot - pick.strike) * float(shares)) + total_cost
    breakeven = spot + prem
    score = 60.0 + _clamp(prot_pct, 0.0, 25.0) - _clamp((total_cost / max(spot * shares, 1.0)) * 500.0, 0.0, 20.0)

    rec = {
        "expiration": chain.expiration_date,
        "days_to_expiration": dte,
        "strike": float(pick.strike),
        "protection_level": round(float(prot_pct), 2),
        "premium": round(float(prem), 4),
        "total_cost": round(float(total_cost), 2),
        "max_loss_total": round(float(max_loss_total), 2),
        "breakeven": round(float(breakeven), 4),
        "score": round(float(_clamp(score, 0.0, 100.0)), 2),
    }

    return {
        "shares_to_protect": int(shares),
        "summary": "Protective puts cap downside at the strike (plus premium) while preserving upside.",
        "volatility_assessment": "Placeholder: add IV rank/history to time hedges cost-effectively.",
        "recommendations": [rec],
    }


@router.get("/{symbol}/wheel", response_model=None)
def wheel(
    symbol: str,
    phase: str = Query("cash_secured_put"),
    objective: str = Query("balanced"),
    cost_basis: float = Query(0.0),
    min_dte: int = Query(21, ge=0, le=365),
    max_dte: int = Query(60, ge=1, le=365),
) -> Dict[str, Any]:
    symbol = symbol.upper().strip()
    market = MarketDataClient()
    quote = market.get_stock_quote(symbol)
    spot = float(quote.price)
    capital_required = round(float(spot * 100.0), 2)
    return {
        "symbol": symbol,
        "analysis_date": datetime.now(timezone.utc).isoformat(),
        "capital_required": capital_required,
        "wheel_summary": "Wheel is currently stubbed; wire CSP/CC pickers into a phased recommender next.",
        "volatility_assessment": None,
        "recommendation": None,
        "phase": str(phase),
        "objective": str(objective),
        "cost_basis": float(cost_basis),
    }


@router.get("/{symbol}/butterfly", response_model=None)
def butterfly(symbol: str) -> Dict[str, Any]:
    return {"analysis_date": datetime.now(timezone.utc).isoformat(), "iv_rank": 50.0, "recommendations": []}


@router.get("/{symbol}/time-spreads", response_model=None)
def time_spreads(symbol: str) -> Dict[str, Any]:
    return {"analysis_date": datetime.now(timezone.utc).isoformat(), "iv_rank": 50.0, "recommendations": []}


@router.get("/{symbol}/ratio-spreads", response_model=None)
def ratio_spreads(symbol: str) -> Dict[str, Any]:
    return {"analysis_date": datetime.now(timezone.utc).isoformat(), "iv_rank": 50.0, "recommendations": []}


@router.get("/{symbol}/jade-lizards", response_model=None)
def jade_lizards(symbol: str) -> Dict[str, Any]:
    return {"analysis_date": datetime.now(timezone.utc).isoformat(), "iv_rank": 50.0, "recommendations": []}


@router.get("/{symbol}/straddles-strangles", response_model=None)
def straddles_strangles(symbol: str) -> Dict[str, Any]:
    return {"analysis_date": datetime.now(timezone.utc).isoformat(), "iv_rank": 50.0, "recommendations": []}


@router.post("/calculate-greeks", response_model=None)
def calculate_greeks(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """UI compatibility endpoint (currently unused by the migrated UI)."""
    # Keep this simple: echo back with a note.
    return {"note": "calculate-greeks is a stub. Use /simulate-performance for now.", "input": payload}


@router.post("/compare-strategies", response_model=None)
def compare_strategies(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    symbol = str(payload.get("symbol", "")).upper().strip()
    risk_tolerance = str(payload.get("risk_tolerance", "moderate")).lower().strip()
    if not symbol:
        return {"detail": "symbol is required"}

    market = MarketDataClient()
    quote = market.get_stock_quote(symbol)
    # Keep this endpoint fast: it's called in the initial StockAnalysis Promise.all.
    # Use a shorter lookback than 1y; the dedicated technical/volatility endpoints can use longer periods.
    history = market.get_price_history(symbol, period="6mo", interval="1d")
    prices = [p.close for p in history]

    tech = technical_indicator_service.analyze_trend(prices=prices, symbol=symbol)
    vol = volatility_service.analyze(prices=prices, symbol=symbol, current_iv=None)
    iv_rank = 50.0  # placeholder until we have IV history feed

    spot = float(quote.price)
    # Avoid expensive options snapshot calls here; return reasonable placeholder legs.
    exp = (date.today() + timedelta(days=21)).isoformat()

    strategy_scores: List[StrategyScore] = []

    # Covered Call
    target_strike = round(spot * 1.02, 2)
    prem = round(max(0.1, spot * 0.005), 4)
    max_profit = max(0.0, (target_strike - spot) * 100.0 + prem * 100.0)
    max_loss = max(0.01, spot * 100.0 - prem * 100.0)
    rr = max_profit / max_loss if max_loss else 0.01
    pop = 0.65
    score = 70.0 if vol.volatility_level in {"high", "extreme"} else 55.0
    strategy_scores.append(
        StrategyScore(
            strategy_name="Covered Call",
            strategy_type="covered_call",
            score=score,
            probability_of_profit=pop,
            max_profit=round(max_profit, 2),
            max_loss=round(max_loss, 2),
            risk_reward_ratio=round(rr, 4),
            market_conditions_fit="Good for neutral to slightly bullish, elevated IV",
            legs=[
                StrategyLeg(action="buy", quantity=100, option_type="stock", premium=spot),
                StrategyLeg(action="sell", quantity=1, expiration=exp, strike=target_strike, option_type="call", premium=prem),
            ],
        )
    )

    # Bull Call Spread (bullish regimes)
    if tech.direction == "bullish":
        long_k = round(spot, 2)
        short_k = round(spot * 1.03, 2)
        long_p = round(max(0.2, spot * 0.01), 4)
        short_p = round(max(0.1, spot * 0.006), 4)
        net_debit = max(0.0, long_p - short_p)
        width = max(0.01, short_k - long_k)
        max_profit = max(0.0, (width - net_debit) * 100.0)
        max_loss = max(0.01, net_debit * 100.0)
        rr = max_profit / max_loss if max_loss else 0.01
        pop = 0.45
        score = 72.0
        strategy_scores.append(
            StrategyScore(
                strategy_name="Bull Call Spread",
                strategy_type="bull_call_spread",
                score=score,
                probability_of_profit=pop,
                max_profit=round(max_profit, 2),
                max_loss=round(max_loss, 2),
                risk_reward_ratio=round(rr, 4),
                market_conditions_fit="Best for bullish outlook, defined risk",
                legs=[
                    StrategyLeg(action="buy", quantity=1, expiration=exp, strike=long_k, option_type="call", premium=long_p),
                    StrategyLeg(action="sell", quantity=1, expiration=exp, strike=short_k, option_type="call", premium=short_p),
                ],
            )
        )

    # Iron Condor (neutral / higher vol)
    if tech.direction == "neutral" or vol.volatility_level in {"high", "extreme"}:
        short_call_k = round(spot * 1.02, 2)
        long_call_k = round(spot * 1.04, 2)
        short_put_k = round(spot * 0.98, 2)
        long_put_k = round(spot * 0.96, 2)

        sc_p = round(max(0.1, spot * 0.004), 4)
        lc_p = round(max(0.05, spot * 0.0025), 4)
        sp_p = round(max(0.1, spot * 0.004), 4)
        lp_p = round(max(0.05, spot * 0.0025), 4)

        credit = max(0.0, (sc_p - lc_p) + (sp_p - lp_p))
        width_call = max(0.01, long_call_k - short_call_k)
        width_put = max(0.01, short_put_k - long_put_k)
        max_width = max(width_call, width_put)
        max_profit = credit * 100.0
        max_loss = max(0.01, (max_width - credit) * 100.0)
        rr = max_profit / max_loss if max_loss else 0.01
        pop = 0.60 if risk_tolerance != "conservative" else 0.65
        score = 75.0 if vol.volatility_level in {"high", "extreme"} else 60.0
        strategy_scores.append(
            StrategyScore(
                strategy_name="Iron Condor",
                strategy_type="iron_condor",
                score=score,
                probability_of_profit=pop,
                max_profit=round(max_profit, 2),
                max_loss=round(max_loss, 2),
                risk_reward_ratio=round(rr, 4),
                market_conditions_fit="Best for neutral outlook, elevated IV",
                legs=[
                    StrategyLeg(action="sell", quantity=1, expiration=exp, strike=short_call_k, option_type="call", premium=sc_p),
                    StrategyLeg(action="buy", quantity=1, expiration=exp, strike=long_call_k, option_type="call", premium=lc_p),
                    StrategyLeg(action="sell", quantity=1, expiration=exp, strike=short_put_k, option_type="put", premium=sp_p),
                    StrategyLeg(action="buy", quantity=1, expiration=exp, strike=long_put_k, option_type="put", premium=lp_p),
                ],
            )
        )

    strategy_scores.sort(key=lambda s: s.score, reverse=True)
    recommended = strategy_scores[0].strategy_name if strategy_scores else "No suitable strategies found"

    resp = StrategyComparisonResponse(
        symbol=symbol,
        current_price=float(quote.price),
        market_trend=str(tech.direction),
        volatility_level=str(vol.volatility_level),
        iv_rank=float(iv_rank),
        recommended_strategy=recommended,
        strategy_scores=strategy_scores,
    )
    return _to_dict(resp)


@router.post("/simulate-performance", response_model=None)
def simulate_performance(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    # Payload shape matches the old UI's request structure.
    current_price = float(payload.get("current_price") or payload.get("currentPrice") or 0.0)
    legs = payload.get("legs") or []
    implied_vol = float(payload.get("implied_volatility") or payload.get("impliedVolatility") or 0.0)
    risk_free_rate = float(payload.get("risk_free_rate") or payload.get("riskFreeRate") or 0.05)

    if implied_vol > 1.0:
        implied_vol = implied_vol / 100.0
    implied_vol = max(implied_vol, 0.01)

    parsed_legs: List[SimulationLeg] = []
    expirations: List[date] = []
    for raw in legs:
        if not isinstance(raw, dict):
            continue
        exp = raw.get("expiration")
        exp_str = str(exp) if exp else None
        exp_date = None
        if exp_str:
            try:
                exp_date = date.fromisoformat(exp_str)
                expirations.append(exp_date)
            except Exception:
                exp_date = None

        parsed_legs.append(
            SimulationLeg(
                action=str(raw.get("action", "buy")),
                quantity=int(raw.get("quantity") or 1),
                option_type=str(raw.get("option_type") or raw.get("optionType") or "stock"),
                strike=float(raw["strike"]) if raw.get("strike") is not None else None,
                expiration=exp_str,
                premium=float(raw.get("premium") or 0.0),
                implied_volatility=float(raw.get("implied_volatility") or raw.get("impliedVolatility") or 0.0) or None,
            )
        )

    if not expirations:
        return _to_dict(SimulationResponse(data_points=[]))

    target_exp = min(expirations)
    today = date.today()
    days_total = (target_exp - today).days
    if days_total <= 0:
        return _to_dict(SimulationResponse(data_points=[]))

    points: List[SimulationPoint] = []
    for i in range(days_total + 1):
        d = today + timedelta(days=i)
        days_remaining = max((target_exp - d).days, 0)
        t = max(days_remaining / 365.0, 1.0 / 365.0)

        total_pl = 0.0
        for leg in parsed_legs:
            qty = int(leg.quantity or 1)
            prem = float(leg.premium or 0.0)
            if leg.option_type == "stock":
                # Assume premium is entry price per share.
                pl = (current_price - prem) * qty
                if leg.action == "sell":
                    pl = -pl
                total_pl += pl
                continue

            strike = float(leg.strike or 0.0)
            iv_leg = leg.implied_volatility
            sigma = implied_vol
            if iv_leg is not None:
                sigma = float(iv_leg)
                if sigma > 1.0:
                    sigma = sigma / 100.0
                sigma = max(sigma, 0.01)

            opt_type = "call" if "call" in leg.option_type.lower() else "put"
            value = black_scholes_price(opt_type, current_price, strike, t, risk_free_rate, sigma)
            if days_remaining == 0:
                if opt_type == "call":
                    value = max(0.0, current_price - strike)
                else:
                    value = max(0.0, strike - current_price)

            if leg.action == "buy":
                pl = (value - prem) * 100.0 * qty
            else:
                pl = (prem - value) * 100.0 * qty
            total_pl += pl

        points.append(
            SimulationPoint(
                date=datetime(d.year, d.month, d.day, tzinfo=timezone.utc).isoformat(),
                stock_price=float(current_price),
                projected_profit=round(total_pl, 2),
                days_to_expiry=days_remaining,
            )
        )

    return _to_dict(SimulationResponse(data_points=points))
