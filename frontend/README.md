# Option-Orchestrator Frontend

Vite + React UI for the Option Orchestrator backend.

Design goals:
- Lightweight, table-first presentation (Finviz-inspired).
- Fast initial render; expensive sections are lazy-loaded on demand.

## Run

```bash
npm ci
npm run dev
```

## Backend Contract

The UI talks to the compatibility API under `/api/v1/*`:
- Dashboard: `GET /api/v1/market/home`
- Ticker analysis: `GET /api/v1/market/{symbol}/analysis`
- Options chain: `GET /api/v1/market/{symbol}/options` (lazy-loaded)
- Screener: `GET /api/v1/tools/screener`
- Portfolio: `GET /api/v1/portfolio/*`
- Alerts: `GET /api/v1/alerts/*`
- Backtest: `POST /api/v1/backtest/run`

## Structure

```text
frontend/
  src/
    components/
    pages/
    services/
    App.jsx
    main.jsx
```

