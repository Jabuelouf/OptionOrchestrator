from orchestrator_layer.orchestrator import RescueOrchestrator


def test_parse_candidates_from_json_list() -> None:
    orch = RescueOrchestrator()
    text = (
        '['
        '{"action":"roll_down_and_out","rationale":"Add time.","net_cost":1200,"risk_rating":"moderate"},'
        '{"action":"close_position","rationale":"Cut risk.","net_cost":500,"risk_rating":"low"}'
        ']'
    )

    got = orch._parse_knowledge_candidates(text, max_loss_tolerance=2000)
    assert len(got) == 2
    assert got[0].action == "roll_down_and_out"
    assert got[1].risk_rating == "low"


def test_parse_candidates_from_wrapped_json_dict() -> None:
    orch = RescueOrchestrator()
    text = (
        '{"candidates": ['
        '{"action":"define_risk_spread","rationale":"Define risk.","net_cost":2500,"risk_rating":"high"},'
        '{"action":"close_position","rationale":"Exit.","net_cost":100,"risk_rating":"low"}'
        "]} "
    )

    got = orch._parse_knowledge_candidates(text, max_loss_tolerance=1000)
    assert len(got) == 2
    # net_cost gets capped to max_loss_tolerance
    assert got[0].net_cost == 1000.0


def test_parse_candidates_ignores_non_json_and_falls_back() -> None:
    orch = RescueOrchestrator()
    got = orch._parse_knowledge_candidates("Consider a roll or a close.", max_loss_tolerance=1000)
    assert len(got) >= 1
    assert any(c.action in {"roll_adjustment", "close_position"} for c in got)


def test_parse_candidates_from_fenced_json_block() -> None:
    orch = RescueOrchestrator()
    text = (
        "```json\n"
        '{"candidates": ['
        '{"action":"roll_down_and_out","rationale":"Extend time.","net_cost":600,"risk_rating":"moderate"}'
        "]}\n"
        "```"
    )
    got = orch._parse_knowledge_candidates(text, max_loss_tolerance=2000)
    assert len(got) == 1
    assert got[0].action == "roll_down_and_out"


def test_parse_candidates_from_plain_fence_block() -> None:
    orch = RescueOrchestrator()
    text = (
        "```\n"
        '['
        '{"action":"close_position","rationale":"Limit loss.","net_cost":300,"risk_rating":"low"}'
        "]\n"
        "```"
    )
    got = orch._parse_knowledge_candidates(text, max_loss_tolerance=2000)
    assert len(got) == 1
    assert got[0].action == "close_position"
    assert got[0].risk_rating == "low"

