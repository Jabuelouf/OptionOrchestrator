# Execution Flow

## Standard Flow
1. API receives payload.
2. Input layer validates and normalizes payload.
3. Orchestrator pulls market snapshot from configured live providers (Massive/Yahoo/Finnhub strategy by endpoint).
4. Orchestrator computes Greeks and scenarios.
5. Orchestrator requests strategy ideas from knowledge layer (RunPod); if unavailable, falls back to local deterministic candidate generation.
6. Validator checks each candidate plan.
7. Orchestrator returns ranked, validated options.

## Failure Handling
- Invalid input -> `InputValidationError`
- Missing market data -> `MarketDataError`
- Invalid plan constraints -> `ValidationError`
- Orchestration runtime failure -> `OrchestrationError`

