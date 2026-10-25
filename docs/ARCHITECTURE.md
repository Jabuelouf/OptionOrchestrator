# Architecture overview

Option Orchestrator combines a domain-adapted language model with quantitative
analysis and deterministic verification to produce advisory rescue plans for
options positions.

## Layer interaction

1. Input layer normalizes user position and account payloads.
2. Market data layer fetches underlying, IV, and chain context.
3. Analysis layer computes Greeks and scenario metrics.
4. The Gemma 2 9B knowledge model proposes structured strategy candidates.
5. Schema and validator layers block malformed, unsafe, or constraint-violating plans.
6. Orchestrator layer assembles ranked recommendations.
7. API layer exposes entrypoints for external clients.

## Model boundary

The public `llm/` directory contains training, inference, evaluation, prompts,
and schemas. Large weights and private training data remain outside Git. Runtime
access is explicit through `HF_ADAPTER_ID` and `HF_ADAPTER_SUBFOLDER`; generated
plans cross back into deterministic code through a strict JSON contract.

The model can propose actions, but it cannot submit orders. If it is unavailable,
the orchestrator uses deterministic candidates so local development and tests do
not depend on GPU infrastructure.
