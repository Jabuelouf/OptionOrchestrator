from __future__ import annotations

from fastapi import APIRouter

from .alerts import router as alerts_router
from .backtest import router as backtest_router
from .calendar import router as calendar_router
from .fundamentals import router as fundamentals_router
from .market import router as market_router
from .portfolio import router as portfolio_router
from .strategies import router as strategies_router
from .tools import router as tools_router

router = APIRouter()
router.include_router(market_router, prefix="/market", tags=["market"])
router.include_router(strategies_router, prefix="/strategies", tags=["strategies"])
router.include_router(tools_router, prefix="/tools", tags=["tools"])
router.include_router(portfolio_router, prefix="/portfolio", tags=["portfolio"])
router.include_router(fundamentals_router, prefix="/fundamentals", tags=["fundamentals"])
router.include_router(alerts_router, prefix="/alerts", tags=["alerts"])
router.include_router(backtest_router, prefix="/backtest", tags=["backtest"])
router.include_router(calendar_router, prefix="/calendar", tags=["calendar"])


@router.get("/")
def api_root() -> dict:
    return {"message": "Option-Orchestrator API v1", "endpoints": {"market": "/api/v1/market"}}
