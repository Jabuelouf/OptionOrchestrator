from __future__ import annotations

from datetime import datetime, timezone
from math import sqrt
from statistics import mean, pstdev
from typing import Any, Dict, List

from analysis_layer.technicals import TechnicalIndicatorService
from fastapi import APIRouter, Body
from market_data_layer import MarketDataClient

router = APIRouter()


@router.post("/run", response_model=None)
def run_backtest(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Minimal backtest endpoint for UI parity.

    Supports: SMA crossover (20/50) on daily closes.
    """
    symbol = str(payload.get("symbol") or "").upper().strip()
    strategy = str(payload.get("strategy") or "sma_crossover").lower().strip()
    config = payload.get("config") if isinstance(payload.get("config"), dict) else {}

    initial_capital = float(config.get("initial_capital") or 10000.0)
    commission = float(config.get("commission") or 0.0)
    start_date = str(config.get("start_date") or "2023-01-01")

    client = MarketDataClient()
    history = client.get_price_history(symbol, period="2y", interval="1d")
    # Filter by start_date best-effort (timestamps are ISO strings).
    filtered = [p for p in history if str(p.date)[:10] >= start_date]
    if len(filtered) < 60 or strategy != "sma_crossover":
        equity_curve = []
        cash = initial_capital
        for p in filtered:
            equity_curve.append({"date": str(p.date)[:10], "equity": round(cash, 2)})
        return {
            "symbol": symbol,
            "strategy": strategy,
            "total_return": 0.0,
            "total_return_pct": 0.0,
            "sharpe_ratio": 0.0,
            "max_drawdown": 0.0,
            "win_rate": 0.0,
            "winning_trades": 0,
            "total_trades": 0,
            "daily_returns": [],
            "trade_pnl_series": [],
            "equity_curve": equity_curve,
            "trades": [],
            "note": "Insufficient data or unsupported strategy (stub).",
            "ran_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        }

    prices = [p.close for p in filtered]
    dates = [str(p.date)[:10] for p in filtered]
    tech = TechnicalIndicatorService()

    cash = initial_capital
    shares = 0.0
    entry_price = None
    total_trades = 0
    winning_trades = 0
    trades: List[Dict[str, Any]] = []

    equity_curve: List[Dict[str, Any]] = []
    position = "flat"
    prev_fast = None
    prev_slow = None
    entry_date = None
    entry_qty = 0

    for i in range(len(prices)):
        px = float(prices[i])
        # Compute SMA on prefix to keep it causal.
        fast = tech.sma(prices[: i + 1], 20)
        slow = tech.sma(prices[: i + 1], 50)

        cross_up = prev_fast is not None and prev_slow is not None and prev_fast <= prev_slow and fast > slow
        cross_dn = prev_fast is not None and prev_slow is not None and prev_fast >= prev_slow and fast < slow

        if position == "flat" and cross_up:
            # Buy as many shares as possible.
            qty = int(cash // px)
            if qty > 0:
                cost = qty * px + commission
                cash -= cost
                shares += qty
                entry_price = px
                entry_date = dates[i]
                entry_qty = qty
                position = "long"
                total_trades += 1

        elif position == "long" and cross_dn:
            # Sell all shares.
            qty = float(shares)
            proceeds = qty * px - commission
            cash += proceeds
            if entry_price is not None:
                if px > entry_price:
                    winning_trades += 1
                trade_pnl = (px - float(entry_price)) * qty - (commission * 2.0)
                trades.append({
                    "entry_date": entry_date or dates[i],
                    "exit_date": dates[i],
                    "side": "long",
                    "quantity": int(entry_qty or qty),
                    "entry_price": round(float(entry_price), 4),
                    "exit_price": round(float(px), 4),
                    "pnl": round(float(trade_pnl), 2),
                })
            shares = 0.0
            entry_price = None
            entry_date = None
            entry_qty = 0
            position = "flat"

        equity = cash + shares * px
        equity_curve.append({"date": dates[i], "equity": round(float(equity), 2)})

        prev_fast = fast
        prev_slow = slow

    # Close any open position at last price.
    if shares > 0:
        px = float(prices[-1])
        qty = float(shares)
        proceeds = qty * px - commission
        cash += proceeds
        if entry_price is not None and px > entry_price:
            winning_trades += 1
        if entry_price is not None:
            trade_pnl = (px - float(entry_price)) * qty - (commission * 2.0)
            trades.append({
                "entry_date": entry_date or dates[-1],
                "exit_date": dates[-1],
                "side": "long",
                "quantity": int(entry_qty or qty),
                "entry_price": round(float(entry_price), 4),
                "exit_price": round(float(px), 4),
                "pnl": round(float(trade_pnl), 2),
            })
        shares = 0.0

    final_equity = float(equity_curve[-1]["equity"]) if equity_curve else float(initial_capital)
    total_return = final_equity - initial_capital
    total_return_pct = (total_return / initial_capital * 100.0) if initial_capital else 0.0

    # Sharpe from daily equity returns.
    returns = []
    for i in range(1, len(equity_curve)):
        prev = float(equity_curve[i - 1]["equity"])
        cur = float(equity_curve[i]["equity"])
        if prev > 0:
            returns.append((cur - prev) / prev)
    if returns and pstdev(returns) > 0:
        sharpe = (mean(returns) / pstdev(returns)) * sqrt(252.0)
    else:
        sharpe = 0.0

    # Max drawdown.
    peak = -1e18
    max_dd = 0.0
    for pt in equity_curve:
        eq = float(pt["equity"])
        peak = max(peak, eq)
        dd = (peak - eq) / peak * 100.0 if peak > 0 else 0.0
        max_dd = max(max_dd, dd)

    win_rate = (winning_trades / total_trades * 100.0) if total_trades else 0.0
    daily_returns = [round(float(r) * 100.0, 4) for r in returns]
    trade_pnl_series = [round(float(t.get("pnl", 0.0)), 2) for t in trades]
    return {
        "symbol": symbol,
        "strategy": strategy,
        "total_return": round(float(total_return), 2),
        "total_return_pct": round(float(total_return_pct), 2),
        "sharpe_ratio": round(float(sharpe), 2),
        "max_drawdown": round(float(max_dd), 2),
        "win_rate": round(float(win_rate), 2),
        "winning_trades": int(winning_trades),
        "total_trades": int(total_trades),
        "daily_returns": daily_returns,
        "trade_pnl_series": trade_pnl_series,
        "equity_curve": equity_curve,
        "trades": trades,
        "ran_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }
