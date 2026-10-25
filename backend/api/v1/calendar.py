"""Calendar endpoint: earnings + economic events."""

from __future__ import annotations

import concurrent.futures
from datetime import date, datetime, timedelta
from typing import List

from fastapi import APIRouter, Query

try:
    import yfinance as yf
    _HAS_YFINANCE = True
except ImportError:
    _HAS_YFINANCE = False


router = APIRouter()


# ---- Static economic calendar ------------------------------------------------
# Recurring US macro events with approximate monthly dates.
# day_of_month is approximate; the real dates shift but this gives a useful baseline.
ECONOMIC_EVENTS = [
    {"event": "FOMC Rate Decision",    "day_approx": 28, "time": "14:00", "months": [1, 3, 5, 6, 7, 9, 11, 12]},
    {"event": "CPI m/m",               "day_approx": 12, "time": "08:30", "months": list(range(1, 13))},
    {"event": "Core CPI m/m",          "day_approx": 12, "time": "08:30", "months": list(range(1, 13))},
    {"event": "PPI m/m",               "day_approx": 13, "time": "08:30", "months": list(range(1, 13))},
    {"event": "Non-Farm Payrolls",     "day_approx": 7,  "time": "08:30", "months": list(range(1, 13))},
    {"event": "Unemployment Rate",     "day_approx": 7,  "time": "08:30", "months": list(range(1, 13))},
    {"event": "JOLTS Job Openings",    "day_approx": 10, "time": "10:00", "months": list(range(1, 13))},
    {"event": "Retail Sales m/m",      "day_approx": 15, "time": "08:30", "months": list(range(1, 13))},
    {"event": "GDP q/q (Advance)",     "day_approx": 27, "time": "08:30", "months": [1, 4, 7, 10]},
    {"event": "ISM Manufacturing PMI", "day_approx": 1,  "time": "10:00", "months": list(range(1, 13))},
    {"event": "Consumer Confidence",   "day_approx": 25, "time": "10:00", "months": list(range(1, 13))},
    {"event": "Initial Jobless Claims","day_approx": 0,  "time": "08:30", "months": []},  # weekly - handled separately
]


def _economic_events_for_week(week_start: date, week_end: date) -> List[dict]:
    """Return static economic events whose approximate date falls within the week."""
    out: List[dict] = []
    for ev in ECONOMIC_EVENTS:
        if not ev["months"]:
            # Weekly event (Initial Jobless Claims): place on Thursday of each week.
            thursday = week_start + timedelta(days=(3 - week_start.weekday()) % 7)
            if week_start <= thursday <= week_end:
                out.append({
                    "date": thursday.isoformat(),
                    "time": ev["time"],
                    "symbol": "-",
                    "event": ev["event"],
                    "estimate": "-",
                    "actual": "-",
                })
            continue

        for m in ev["months"]:
            # Build approximate date for the event this year.
            try:
                approx = date(week_start.year, m, min(ev["day_approx"], 28))
            except ValueError:
                continue
            # Shift weekends to Monday.
            if approx.weekday() == 5:  # Saturday
                approx += timedelta(days=2)
            elif approx.weekday() == 6:  # Sunday
                approx += timedelta(days=1)
            if week_start <= approx <= week_end:
                out.append({
                    "date": approx.isoformat(),
                    "time": ev["time"],
                    "symbol": "-",
                    "event": ev["event"],
                    "estimate": "-",
                    "actual": "-",
                })
    # Sort by date then time.
    out.sort(key=lambda e: (e["date"], e["time"]))
    return out


# ---- Earnings via yfinance ---------------------------------------------------

# Same core universe as the home endpoint, plus a few high-interest names.
EARNINGS_WATCHLIST = [
    "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "AMD", "NFLX",
    "JPM", "BAC", "XOM", "WMT", "UNH", "V", "MA", "COST", "HD", "DIS",
    "CRM", "ORCL", "CSCO", "INTC", "QCOM", "SHOP", "AMAT", "DE", "KO", "PEP",
]


def _fetch_earnings_for_symbol(symbol: str, week_start: date, week_end: date) -> List[dict]:
    """Fetch upcoming earnings date for one symbol via yfinance."""
    if not _HAS_YFINANCE:
        return []
    try:
        ticker = yf.Ticker(symbol)
        cal = ticker.calendar
        if cal is None or (hasattr(cal, 'empty') and cal.empty):
            return []

        # yfinance returns calendar as a DataFrame or dict depending on version.
        earnings_date = None
        if isinstance(cal, dict):
            ed = cal.get("Earnings Date")
            if isinstance(ed, list) and ed:
                earnings_date = ed[0]
            elif ed is not None:
                earnings_date = ed
        else:
            # DataFrame format.
            if "Earnings Date" in cal.columns:
                vals = cal["Earnings Date"].dropna().tolist()
                if vals:
                    earnings_date = vals[0]
            elif "Earnings Date" in cal.index:
                earnings_date = cal.loc["Earnings Date"].iloc[0] if hasattr(cal.loc["Earnings Date"], 'iloc') else cal.loc["Earnings Date"]

        if earnings_date is None:
            return []

        # Normalize to date.
        if isinstance(earnings_date, datetime):
            ed = earnings_date.date()
        elif isinstance(earnings_date, date):
            ed = earnings_date
        else:
            ed = date.fromisoformat(str(earnings_date)[:10])

        if week_start <= ed <= week_end:
            # Estimate: try to get EPS estimate.
            estimate = "-"
            if isinstance(cal, dict):
                eps_est = cal.get("Earnings Average") or cal.get("EPS Estimate")
                if eps_est is not None:
                    estimate = str(round(float(eps_est), 2)) if not isinstance(eps_est, list) else str(eps_est[0])
            return [{
                "date": ed.isoformat(),
                "time": "BMO",  # yfinance doesn't provide time; default to Before Market Open.
                "symbol": symbol,
                "event": "Earnings",
                "estimate": estimate,
                "actual": "-",
            }]
    except Exception:
        pass
    return []


def _fetch_all_earnings(week_start: date, week_end: date) -> List[dict]:
    """Fetch earnings for the full watchlist concurrently."""
    events: List[dict] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(_fetch_earnings_for_symbol, sym, week_start, week_end): sym
            for sym in EARNINGS_WATCHLIST
        }
        for fut in concurrent.futures.as_completed(futures, timeout=10):
            try:
                events.extend(fut.result())
            except Exception:
                continue
    events.sort(key=lambda e: (e["date"], e["symbol"]))
    return events


# ---- Main endpoint -----------------------------------------------------------

@router.get("/", response_model=None)
def get_calendar(
    week_offset: int = Query(0, description="Week offset from current week (0 = this week, -1 = last week, 1 = next week)"),
) -> dict:
    """Return earnings + economic events for the requested week.

    Response shape: {"events": [...], "week_start": "YYYY-MM-DD", "week_end": "YYYY-MM-DD"}
    """
    today = date.today()
    # Monday of the target week.
    monday = today - timedelta(days=today.weekday()) + timedelta(weeks=week_offset)
    friday = monday + timedelta(days=4)

    # Economic events (instant, no network).
    econ = _economic_events_for_week(monday, friday)

    # Earnings (network calls, bounded by ThreadPoolExecutor timeout).
    earnings = _fetch_all_earnings(monday, friday)

    # Merge and deduplicate by (date, event, symbol).
    seen = set()
    merged: List[dict] = []
    for ev in earnings + econ:
        key = (ev["date"], ev["event"], ev["symbol"])
        if key not in seen:
            seen.add(key)
            merged.append(ev)
    merged.sort(key=lambda e: (e["date"], e["time"], e["symbol"]))

    return {
        "events": merged,
        "week_start": monday.isoformat(),
        "week_end": friday.isoformat(),
    }
