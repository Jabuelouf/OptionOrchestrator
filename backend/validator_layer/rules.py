"""Rule-based validation for rescue candidates."""

from shared.schemas import AccountConstraints, RescueCandidate, ValidationResult

_NAKED_KEYWORDS = {"naked", "uncovered", "sell_naked"}


class PlanValidator:
    """Evaluates whether a candidate is allowed under account constraints."""

    def validate(self, candidate: RescueCandidate, constraints: AccountConstraints) -> ValidationResult:
        blocked_reasons: list[str] = []
        warnings: list[str] = []

        pref = constraints.risk_preference.lower()
        rating = candidate.risk_rating.lower()

        # Rule 1: net_cost vs max_loss_tolerance
        if candidate.net_cost is not None and candidate.net_cost > constraints.max_loss_tolerance:
            blocked_reasons.append("Candidate cost exceeds max loss tolerance")

        # Rule 2: net_cost vs buying_power (buying_power=0 skips the gate)
        if constraints.buying_power > 0 and candidate.net_cost is not None and candidate.net_cost > constraints.buying_power:
            blocked_reasons.append("Candidate cost exceeds available buying power")

        # Rule 3: risk preference hard gates
        if pref == "conservative" and rating in {"high", "very_high"}:
            blocked_reasons.append(f"risk_rating '{rating}' is not permitted under conservative risk preference")
        elif pref == "moderate" and rating == "very_high":
            warnings.append("risk_rating 'very_high' is elevated for a moderate risk preference")

        # Rule 4: naked strategy hard gates
        action_lower = candidate.action.lower()
        is_naked = any(kw in action_lower for kw in _NAKED_KEYWORDS)
        if is_naked:
            if pref in {"conservative", "moderate"}:
                blocked_reasons.append(f"Naked strategies not permitted under {pref} risk preference")
            else:
                warnings.append("Naked strategy — verify margin requirements before executing")

        # Rule 5: negative net_cost advisory
        if candidate.net_cost is not None and candidate.net_cost < 0:
            warnings.append("Negative net_cost — potential credit strategy; verify margin impact")

        # Rule 6: unclassified risk in conservative accounts
        if rating == "unknown" and pref == "conservative":
            warnings.append("Risk rating unclassified; verify before executing in conservative account")

        if blocked_reasons:
            return ValidationResult(valid=False, warnings=warnings, blocked_reason="; ".join(blocked_reasons))
        return ValidationResult(valid=True, warnings=warnings)
