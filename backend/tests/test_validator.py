"""Unit tests for validator_layer.rules.PlanValidator (6-rule collect-all implementation)."""

from shared.schemas import AccountConstraints, RescueCandidate
from validator_layer import PlanValidator


def _candidate(
    action: str = "roll_down_and_out",
    rationale: str = "Test rationale.",
    net_cost: float | None = 500.0,
    risk_rating: str = "moderate",
) -> RescueCandidate:
    return RescueCandidate(action=action, rationale=rationale, net_cost=net_cost, risk_rating=risk_rating)


def _constraints(
    buying_power: float = 10_000.0,
    max_loss_tolerance: float = 1_000.0,
    risk_preference: str = "moderate",
) -> AccountConstraints:
    return AccountConstraints(
        buying_power=buying_power,
        max_loss_tolerance=max_loss_tolerance,
        risk_preference=risk_preference,
    )


# ── Rule 1: net_cost vs max_loss_tolerance ───────────────────────────────────


def test_cost_exceeds_max_loss_tolerance_is_blocked() -> None:
    v = PlanValidator()
    result = v.validate(_candidate(net_cost=1500.0), _constraints(max_loss_tolerance=1000.0))
    assert not result.valid
    assert "max loss tolerance" in (result.blocked_reason or "").lower()


# ── Rule 2: net_cost vs buying_power ─────────────────────────────────────────


def test_cost_exceeds_buying_power_is_blocked() -> None:
    v = PlanValidator()
    result = v.validate(_candidate(net_cost=800.0), _constraints(buying_power=500.0, max_loss_tolerance=1000.0))
    assert not result.valid
    assert "buying power" in (result.blocked_reason or "").lower()


def test_buying_power_zero_skips_gate() -> None:
    """buying_power=0 means unconfigured — gate must not fire."""
    v = PlanValidator()
    result = v.validate(_candidate(net_cost=9999.0), _constraints(buying_power=0, max_loss_tolerance=10_000.0))
    assert result.valid


def test_both_limits_exceeded_blocked_reason_contains_both() -> None:
    v = PlanValidator()
    result = v.validate(
        _candidate(net_cost=2000.0),
        _constraints(buying_power=500.0, max_loss_tolerance=1000.0),
    )
    assert not result.valid
    reason = result.blocked_reason or ""
    assert "max loss tolerance" in reason.lower()
    assert "buying power" in reason.lower()


# ── Rule 3: risk preference hard gates ───────────────────────────────────────


def test_conservative_high_rating_is_blocked() -> None:
    v = PlanValidator()
    result = v.validate(_candidate(risk_rating="high"), _constraints(risk_preference="conservative"))
    assert not result.valid
    assert "conservative" in (result.blocked_reason or "").lower()


def test_conservative_very_high_rating_is_blocked() -> None:
    v = PlanValidator()
    result = v.validate(_candidate(risk_rating="very_high"), _constraints(risk_preference="conservative"))
    assert not result.valid
    assert "conservative" in (result.blocked_reason or "").lower()


def test_moderate_very_high_is_valid_with_warning() -> None:
    v = PlanValidator()
    result = v.validate(_candidate(risk_rating="very_high"), _constraints(risk_preference="moderate"))
    assert result.valid
    assert any("very_high" in w.lower() for w in result.warnings)


def test_aggressive_high_is_valid_no_warnings() -> None:
    v = PlanValidator()
    result = v.validate(_candidate(risk_rating="high"), _constraints(risk_preference="aggressive"))
    assert result.valid
    assert result.warnings == []


# ── Rule 4: naked strategy hard gates ────────────────────────────────────────


def test_sell_naked_call_conservative_is_blocked() -> None:
    v = PlanValidator()
    result = v.validate(
        _candidate(action="sell_naked_call", risk_rating="moderate"),
        _constraints(risk_preference="conservative"),
    )
    assert not result.valid
    assert "Naked strategies" in (result.blocked_reason or "")


def test_naked_put_moderate_is_blocked() -> None:
    v = PlanValidator()
    result = v.validate(
        _candidate(action="naked_put", risk_rating="moderate"),
        _constraints(risk_preference="moderate"),
    )
    assert not result.valid
    assert "Naked strategies" in (result.blocked_reason or "")


def test_sell_naked_call_aggressive_is_valid_with_warning() -> None:
    v = PlanValidator()
    result = v.validate(
        _candidate(action="sell_naked_call", risk_rating="moderate"),
        _constraints(risk_preference="aggressive"),
    )
    assert result.valid
    assert any("Naked strategy" in w for w in result.warnings)


# ── Rule 5: negative net_cost advisory ───────────────────────────────────────


def test_negative_net_cost_is_valid_with_warning() -> None:
    v = PlanValidator()
    result = v.validate(_candidate(net_cost=-200.0), _constraints())
    assert result.valid
    assert any("credit strategy" in w.lower() for w in result.warnings)


# ── Rule 6: unclassified risk in conservative accounts ───────────────────────


def test_unknown_risk_conservative_is_valid_with_warning() -> None:
    v = PlanValidator()
    result = v.validate(_candidate(risk_rating="unknown"), _constraints(risk_preference="conservative"))
    assert result.valid
    assert any("unclassified" in w.lower() for w in result.warnings)


# ── net_cost=None edge case ───────────────────────────────────────────────────


def test_none_net_cost_is_valid_no_cost_warnings() -> None:
    v = PlanValidator()
    result = v.validate(_candidate(net_cost=None), _constraints())
    assert result.valid
    assert not any("cost" in w.lower() for w in result.warnings)
