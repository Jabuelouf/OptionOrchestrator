# Execution Flow

## Standard Flow
1. API receives payload.
2. Input layer validates and normalizes payload.
3. Orchestrator pulls market snapshot from configured live providers (Massive/Yahoo/Finnhub strategy by endpoint).
4. Orchestrator computes Greeks and scenarios.
5. Orchestrator sends the normalized snapshot to the fine-tuned Gemma 2 9B adapter through RunPod.
6. The model returns a structured rescue plan; malformed output is rejected at the JSON contract boundary.
7. Deterministic rules validate risk, sizing, triggers, and guardrails for each candidate plan.
8. If model inference is unavailable or invalid, the orchestrator falls back to conservative deterministic candidate generation.
9. Orchestrator returns ranked, validated options for human review.

## Failure Handling
- Invalid input -> `InputValidationError`
- Missing market data -> `MarketDataError`
- Invalid plan constraints -> `ValidationError`
- Orchestration runtime failure -> `OrchestrationError`

