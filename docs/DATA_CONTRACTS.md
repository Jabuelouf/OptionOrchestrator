# Data Contracts

## Core Inputs
- Position snapshot (symbol, legs, expiries, strikes, quantity, entry prices)
- Account constraints (buying power, max loss tolerance, risk preference)
- Optional context (urgency, notes)

## Core Outputs
- Situation assessment (risk summary, urgency)
- Candidate rescue actions (2-3 structured plans)
- Validation results per candidate
- Ranked recommendation with warnings

## Shared Types
Defined in `shared/schemas.py`:
- `OptionLeg`
- `PositionSnapshot`
- `AccountConstraints`
- `MarketSnapshot`
- `PositionGreeks`
- `RescueCandidate`
- `ValidationResult`
- `OrchestrationResult`
