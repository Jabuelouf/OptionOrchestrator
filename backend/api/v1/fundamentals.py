from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from fastapi import APIRouter

router = APIRouter()


@router.get("/{symbol}", response_model=None)
def get_financials(symbol: str) -> Dict[str, Any]:
    """Stub fundamentals payload for UI parity."""
    symbol = symbol.upper().strip()
    return {
        "symbol": symbol,
        "note": "Fundamentals provider not configured yet (stub).",
        "as_of": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }


@router.get("/{symbol}/filings", response_model=None)
def get_filings(symbol: str) -> List[Dict[str, Any]]:
    symbol = symbol.upper().strip()
    now = datetime.now(timezone.utc).replace(microsecond=0)
    # Deterministic-looking recent filings.
    filings = [
        {
            "filing_id": f"{symbol}-10Q-{now.strftime('%Y%m%d')}",
            "filing_type": "10-Q",
            "filing_date": (now - timedelta(days=30)).isoformat(),
            "report_period": (now - timedelta(days=60)).date().isoformat(),
        },
        {
            "filing_id": f"{symbol}-10K-{now.strftime('%Y%m%d')}",
            "filing_type": "10-K",
            "filing_date": (now - timedelta(days=120)).isoformat(),
            "report_period": (now - timedelta(days=365)).date().isoformat(),
        },
    ]
    return filings


@router.get("/{symbol}/filings/{filing_id}/analysis", response_model=None)
def analyze_filing(symbol: str, filing_id: str) -> Dict[str, Any]:
    """Stub filing analysis payload shaped for the migrated UI."""
    symbol = symbol.upper().strip()
    filing_id = str(filing_id)
    return {
        "symbol": symbol,
        "filing_id": filing_id,
        "sentiment": {
            "verdict": "Neutral",
            "polarity": 0.02,
            "subjectivity": 0.35,
            "positive_score": 3,
            "negative_score": 2,
        },
        "key_risks": [
            "Stub analysis: configure fundamentals + filings provider to enable real extraction.",
        ],
        "key_opportunities": [
            "Stub analysis: integrate SEC filings ingestion and summarization layer.",
        ],
    }

