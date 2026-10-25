# Orchestrator Layer

Coordinates all layers and returns a ranked rescue response payload.

## Entry Point
- `orchestrator.py`
- `knowledge_gateway.py`

## Current State
- End-to-end scaffold with market + analysis + validation integration.
- Candidate generation now attempts a real RunPod knowledge call first.
- Falls back to deterministic local candidates when knowledge endpoint is unavailable.

## Environment Variables
- `RUNPOD_API_KEY` (optional, enables live knowledge calls)
- `KNOWLEDGE_ENDPOINT_ID` (required only when live knowledge calls are enabled)
