"""Local API smoke entrypoint."""

from orchestrator_layer import RescueOrchestrator


def run_demo() -> None:
    payload = {
        "position": {
            "symbol": "AAPL",
            "legs": [
                {
                    "type": "short_put",
                    "strike": 180,
                    "expiry": "2026-03-20",
                    "quantity": -2,
                    "entry_price": 3.5,
                }
            ],
        },
        "account": {
            "buying_power": 50000,
            "max_loss_tolerance": 5000,
            "risk_preference": "moderate",
        },
    }

    orchestrator = RescueOrchestrator()
    result = orchestrator.run(payload)

    print("Assessment:", result.assessment)
    print("Recommendation index:", result.recommendation_index)
    for idx, candidate in enumerate(result.candidates):
        validation = result.validations[idx]
        print(f"[{idx}] {candidate.action} | valid={validation.valid} | warnings={validation.warnings}")


if __name__ == "__main__":
    run_demo()
