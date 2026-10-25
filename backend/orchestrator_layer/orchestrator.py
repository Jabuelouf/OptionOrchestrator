"""Core orchestration flow for rescue generation."""

import json
import re
from typing import Any, Dict, List

from analysis_layer import GreeksAnalyzer
from input_layer import normalize_payload
from market_data_layer import MarketDataClient
from shared.schemas import OrchestrationResult, RescueCandidate
from validator_layer import PlanValidator

from .knowledge_gateway import KnowledgeGateway


class RescueOrchestrator:
    """Coordinates layer calls and assembles a result payload."""

    def __init__(self) -> None:
        self.market = MarketDataClient()
        self.greeks = GreeksAnalyzer()
        self.validator = PlanValidator()
        self.knowledge = KnowledgeGateway()

    def run(self, payload: Dict[str, Any]) -> OrchestrationResult:
        position, constraints = normalize_payload(payload)
        market = self.market.get_snapshot(position.symbol)
        greeks = self.greeks.calculate(position, spot_price=market.spot_price)

        candidates = self._generate_candidates(
            symbol=position.symbol,
            spot_price=market.spot_price,
            max_loss_tolerance=constraints.max_loss_tolerance,
        )

        validations = [self.validator.validate(candidate, constraints) for candidate in candidates]

        recommendation_index = None
        for idx, result in enumerate(validations):
            if result.valid:
                recommendation_index = idx
                break

        assessment = (
            f"{position.symbol}: spot={market.spot_price}, "
            f"delta={greeks.delta}, gamma={greeks.gamma}, "
            f"valid_candidates={sum(1 for v in validations if v.valid)}"
        )

        return OrchestrationResult(
            assessment=assessment,
            candidates=candidates,
            validations=validations,
            recommendation_index=recommendation_index,
        )

    def _generate_candidates(self, symbol: str, spot_price: float, max_loss_tolerance: float) -> List[RescueCandidate]:
        """Build candidates from knowledge output with deterministic fallback."""
        knowledge_text = self.knowledge.query_rescue_strategies(
            symbol=symbol,
            spot_price=spot_price,
            max_loss_tolerance=max_loss_tolerance,
        )

        if knowledge_text:
            parsed = self._parse_knowledge_candidates(knowledge_text, max_loss_tolerance=max_loss_tolerance)
            if parsed:
                return parsed

        return [
            RescueCandidate(
                action="roll_down_and_out",
                rationale="Adds time and lowers strike exposure",
                net_cost=max_loss_tolerance * 0.35,
                risk_rating="moderate",
            ),
            RescueCandidate(
                action="close_position",
                rationale="Stop further downside exposure immediately",
                net_cost=max_loss_tolerance * 0.15,
                risk_rating="low",
            ),
        ]

    def _parse_knowledge_candidates(self, text: str, max_loss_tolerance: float) -> List[RescueCandidate]:
        """Extract up to two candidates from knowledge output.

        Preferred contract is JSON (see KnowledgeGateway.JSON_CONTRACT); heuristics remain as a fallback.
        """
        parsed = self._try_parse_json_candidates(text, max_loss_tolerance=max_loss_tolerance)
        if parsed:
            return parsed[:2]

        lower = text.lower()
        candidates: List[RescueCandidate] = []

        if "roll" in lower:
            candidates.append(
                RescueCandidate(
                    action="roll_adjustment",
                    rationale="Knowledge model suggested rolling to improve strike/time profile.",
                    net_cost=max_loss_tolerance * 0.30,
                    risk_rating="moderate",
                )
            )

        if "close" in lower or "exit" in lower:
            candidates.append(
                RescueCandidate(
                    action="close_position",
                    rationale="Knowledge model flagged risk reduction via full exit.",
                    net_cost=max_loss_tolerance * 0.10,
                    risk_rating="low",
                )
            )

        if not candidates and ("spread" in lower or "hedge" in lower):
            candidates.append(
                RescueCandidate(
                    action="define_risk_spread",
                    rationale="Knowledge model suggested converting to a defined-risk structure.",
                    net_cost=max_loss_tolerance * 0.20,
                    risk_rating="moderate",
                )
            )

        return candidates[:2]

    def _try_parse_json_candidates(self, text: str, max_loss_tolerance: float) -> List[RescueCandidate]:
        cleaned = text.strip()
        if "```" in cleaned:
            cleaned = re.sub(r"```[a-z]*\n?", "", cleaned)
            cleaned = cleaned.strip()

        obj = self._json_from_text(cleaned)
        if obj is None:
            return []

        if isinstance(obj, dict):
            obj = obj.get("candidates")

        if not isinstance(obj, list):
            return []

        candidates: List[RescueCandidate] = []
        for item in obj:
            if not isinstance(item, dict):
                continue

            action = item.get("action")
            if not isinstance(action, str) or not action.strip():
                continue

            rationale = item.get("rationale")
            if not isinstance(rationale, str) or not rationale.strip():
                rationale = "No rationale provided."

            risk_rating = item.get("risk_rating")
            risk = str(risk_rating).strip().lower() if risk_rating is not None else "unknown"
            if risk not in {"low", "moderate", "high"}:
                risk = "unknown"

            net_cost_raw = item.get("net_cost")
            net_cost = None
            if net_cost_raw is not None:
                try:
                    net_cost = float(net_cost_raw)
                    if net_cost < 0:
                        net_cost = None
                    elif net_cost > max_loss_tolerance:
                        net_cost = float(max_loss_tolerance)
                except (TypeError, ValueError):
                    net_cost = None

            candidates.append(
                RescueCandidate(
                    action=action.strip(),
                    rationale=rationale.strip(),
                    net_cost=net_cost,
                    risk_rating=risk,
                )
            )

        return candidates[:2]

    @staticmethod
    def _json_from_text(text: str) -> object | None:
        decoder = json.JSONDecoder()
        starts = []
        for ch in ("{", "["):
            idx = text.find(ch)
            if idx != -1:
                starts.append(idx)
        for idx in sorted(starts):
            try:
                obj, _end = decoder.raw_decode(text[idx:])
                return obj
            except json.JSONDecodeError:
                continue
        return None
