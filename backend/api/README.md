# API Layer

Defines callable interface for local and future HTTP entrypoints.

## Entry Point
- `main.py`
- `server.py`

## Current State
- CLI-friendly smoke entrypoint invoking orchestrator flow.
- FastAPI server exists for frontend integration without changing internal layer contracts.

## Run FastAPI
From `backend/`:

```powershell
python -m uvicorn api.server:app --reload --host 127.0.0.1 --port 8000
```

Endpoints (core):
- `GET /health`
- `POST /v1/rescue` (payload matches the smoke shape used in `api/main.py`)

Endpoints (UI compatibility, `/api/v1`):
- `GET /api/v1/`

Market:
- `GET /api/v1/market/home` (Finviz-like dashboard payload)
- `GET /api/v1/market/overview`
- `GET /api/v1/market/{symbol}`
- `GET /api/v1/market/{symbol}/history`
- `GET /api/v1/market/{symbol}/options/expirations`
- `GET /api/v1/market/{symbol}/options`
- `GET /api/v1/market/{symbol}/technical`
- `GET /api/v1/market/{symbol}/volatility`
- `GET /api/v1/market/{symbol}/news` (currently stubbed)
- `GET /api/v1/market/{symbol}/analysis` (single-call combined payload for the UI)

Strategies:
- `GET /api/v1/strategies/{symbol}/overview`
- `GET /api/v1/strategies/{symbol}/covered-calls`
- `GET /api/v1/strategies/{symbol}/cash-secured-puts`
- `GET /api/v1/strategies/{symbol}/vertical-spreads`
- `GET /api/v1/strategies/{symbol}/iron-condors`
- `GET /api/v1/strategies/{symbol}/long-options`
- `GET /api/v1/strategies/{symbol}/protective-puts`
- `GET /api/v1/strategies/{symbol}/wheel`
- `GET /api/v1/strategies/{symbol}/butterfly`
- `GET /api/v1/strategies/{symbol}/time-spreads`
- `GET /api/v1/strategies/{symbol}/ratio-spreads`
- `GET /api/v1/strategies/{symbol}/jade-lizards`
- `GET /api/v1/strategies/{symbol}/straddles-strangles`
- `POST /api/v1/strategies/calculate-greeks`
- `POST /api/v1/strategies/compare-strategies`
- `POST /api/v1/strategies/simulate-performance`

Tools:
- `GET /api/v1/tools/screener`

Portfolio (in-memory placeholders for UI parity):
- `GET /api/v1/portfolio/`
- `POST /api/v1/portfolio/`
- `POST /api/v1/portfolio/correlation`
- `GET /api/v1/portfolio/var`

Fundamentals (currently stubbed):
- `GET /api/v1/fundamentals/{symbol}`
- `GET /api/v1/fundamentals/{symbol}/filings`
- `GET /api/v1/fundamentals/{symbol}/filings/{filing_id}/analysis`

Alerts (in-memory placeholders for UI parity):
- `GET /api/v1/alerts/`
- `POST /api/v1/alerts/`
- `DELETE /api/v1/alerts/{alert_id}`
- `POST /api/v1/alerts/check`

Backtest (placeholder):
- `POST /api/v1/backtest/run`

Provider diagnostics:
- Most market endpoints set `X-Market-Data-Provider` (and sometimes `X-Market-Data-Detail`) for debugging provider selection/fallback.

## Persistence (Optional)

If `DATABASE_URL` is set (or `PERSIST_RUNS=1`), the server will best-effort persist `/v1/rescue`
runs to the database and return headers:
- `X-Orchestration-Persisted: 0|1`
- `X-Orchestration-Run-Id: <id>` (when persisted)
