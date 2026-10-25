# Architecture Overview

## Goal
Produce rescue recommendations for options positions by coordinating specialized layers.

## Layer Interaction
1. Input layer normalizes user position and account payloads.
2. Market data layer fetches underlying, IV, and chain context.
3. Analysis layer computes Greeks and scenario metrics.
4. Knowledge layer provides strategy and mechanics reasoning.
5. Validator layer blocks unsafe or constraint-violating plans.
6. Orchestrator layer assembles ranked recommendations.
7. API layer exposes entrypoints for external clients.

## Boundaries
- `knowledge_layer/` is model-centric and may include large data/artifacts.
- All other layers should remain lightweight, testable, and source-only.
