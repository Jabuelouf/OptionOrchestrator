"""Public.com broker adapter scaffold."""

import os
import re
from collections import defaultdict
from typing import Any, Dict, List, Optional

import requests
from shared.exceptions import BrokerError
from shared.schemas import AccountConstraints, OptionLeg, OrderRequest, OrderResult, PositionSnapshot

_OCC_RE = re.compile(r"^([A-Z]{1,5})(\d{6})([CP])(\d{8})$")
_BASE_URL = "https://api.public.com/v1"


def _parse_occ_symbol(symbol: str) -> tuple[str, str, str, float]:
    """Parse OCC option symbol → (underlying, expiry YYYY-MM-DD, option_type, strike).

    OCC format: {TICKER}{YYMMDD}{C|P}{STRIKE8}
    Strike is 8 digits with 3 implied decimal places (divide by 1000).
    Examples:
      AAPL231215C00190000 → ("AAPL", "2023-12-15", "call", 190.0)
      SPY240119P00450000  → ("SPY",  "2024-01-19", "put",  450.0)
    """
    m = _OCC_RE.match(symbol.upper())
    if not m:
        raise BrokerError(f"Cannot parse OCC symbol: {symbol!r}")
    ticker, yymmdd, cp, strike_raw = m.groups()
    expiry = f"20{yymmdd[:2]}-{yymmdd[2:4]}-{yymmdd[4:]}"
    return ticker, expiry, "call" if cp == "C" else "put", int(strike_raw) / 1000.0


class PublicComAdapter:
    """Scaffold adapter for Public.com brokerage API.

    Translates Public.com portfolio/account responses into shared layer schemas.
    HTTP calls require PUBLIC_COM_API_KEY env var (or pass api_key directly).
    place_order() is a stub until live order-placement is wired.
    """

    def __init__(self, api_key: Optional[str] = None, base_url: str = _BASE_URL) -> None:
        self._api_key = api_key or os.getenv("PUBLIC_COM_API_KEY", "")
        self._base_url = base_url.rstrip("/")

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self._api_key}", "Accept": "application/json"}

    def _get(self, path: str) -> Any:
        try:
            resp = requests.get(f"{self._base_url}{path}", headers=self._headers(), timeout=10)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            raise BrokerError(f"Public.com GET {path} failed: {exc}") from exc

    @staticmethod
    def _map_leg(raw: Dict[str, Any]) -> OptionLeg:
        symbol = str(raw.get("symbol", ""))
        _, expiry, option_type, strike = _parse_occ_symbol(symbol)
        qty = int(raw.get("quantity", 0))
        cost = raw.get("cost_basis")
        return OptionLeg(
            option_type=option_type,
            strike=strike,
            expiry=expiry,
            quantity=abs(qty),
            side="short" if qty < 0 else "long",
            entry_price=float(cost) if cost is not None else None,
        )

    def get_positions(self) -> List[PositionSnapshot]:
        """Fetch open option positions and group legs by underlying symbol."""
        data = self._get("/portfolio/positions")
        positions_raw = data.get("positions", []) if isinstance(data, dict) else data
        groups: Dict[str, List[OptionLeg]] = defaultdict(list)
        for raw in positions_raw:
            try:
                underlying, *_ = _parse_occ_symbol(str(raw.get("symbol", "")))
                groups[underlying].append(self._map_leg(raw))
            except BrokerError:
                continue  # skip non-option rows (e.g. stock legs)
        return [PositionSnapshot(symbol=sym, legs=legs) for sym, legs in groups.items()]

    def get_account(self) -> AccountConstraints:
        """Fetch account summary and map to AccountConstraints."""
        data = self._get("/account")
        buying_power = float(data.get("buying_power", 0.0))
        max_loss = float(data.get("options_buying_power", buying_power))
        pref = str(data.get("risk_preference", "moderate")).lower()
        if pref not in {"conservative", "moderate", "aggressive"}:
            pref = "moderate"
        return AccountConstraints(
            buying_power=buying_power,
            max_loss_tolerance=max_loss,
            risk_preference=pref,
        )

    def place_order(self, order: OrderRequest) -> OrderResult:
        """Scaffold stub — wire to POST /orders when live credentials are configured."""
        # TODO: POST /orders with order payload once API credentials are available
        return OrderResult(
            order_id="stub",
            status="stub",
            message="Order placement not yet wired to live Public.com API",
        )
