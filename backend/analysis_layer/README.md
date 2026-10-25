# Analysis Layer

Computes position risk metrics (Greeks and coarse stress scenarios).

## Entry Point
- `greeks.py`

## Current State
- Black-Scholes-based per-leg Greeks aggregation is implemented.
- Scenario PnL uses a delta-gamma approximation.
- Assumptions:
  - constant implied volatility (override per call),
  - constant risk-free rate (override per call),
  - European-style approximation for options.

## Validation
- `tests/test_greeks.py` provides baseline sign/behavior checks.
