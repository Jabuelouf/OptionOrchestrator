# Option Orchestrator

An options analytics workbench built around a domain-adapted LLM, quantitative market analysis, and deterministic risk controls.

> **Portfolio project:** Option Orchestrator is an educational decision-support system. It does not execute trades and its output is not financial advice.

![Option Orchestrator market dashboard](docs/images/dashboard.png)

_The dashboard above uses the repository's deterministic demo-data provider, so the interface can be evaluated without paid API credentials._

## The model at the center of the system

Option Orchestrator is built around a domain-adapted **Gemma 2 9B** model. The
model is not a decorative chat layer: it consumes normalized position, market,
and account context and generates structured rescue plans for distressed options
positions. Those proposals then pass through JSON-schema checks and deterministic
risk rules before they can be shown to a user.

| Model detail | Recorded value |
| --- | --- |
| Base model | `google/gemma-2-9b-it` |
| Fine-tuning method | 4-bit QLoRA / PEFT |
| LoRA configuration | rank 64, alpha 128, dropout 0.05; attention and MLP projections |
| Selected checkpoint | `checkpoint-1050` |
| Selection metric | validation loss `1.18061` |
| Serving path | private Hugging Face adapter on a 4-bit RunPod worker |

The training state identifies checkpoint 1050 as the best validation checkpoint;
checkpoint 1300 is retained as the final saved checkpoint for comparative
evaluation. Validation loss is a selection signal, not a claim of financial
correctness. See the [model card](docs/MODEL_CARD.md) for provenance, limitations,
and evaluation guidance.

## What it demonstrates

- A layered FastAPI backend with explicit boundaries for input normalization, market data, analytics, validation, and orchestration
- Options pricing, Greeks, volatility analysis, technical indicators, scenario analysis, and strategy comparison
- Provider adapters with deterministic mock behavior for local development and automated testing
- A React dashboard for market exploration, portfolio analysis, backtesting, alerts, and options-strategy visualization
- An end-to-end model lifecycle: Gemma 2 9B QLoRA training, checkpoint selection, 4-bit RunPod inference, structured generation, and deterministic verification
- PostgreSQL persistence with SQLAlchemy and Alembic migrations

## Architecture

```mermaid
flowchart LR
    UI[React client] --> API[FastAPI boundary]
    API --> ORCH[Orchestrator]
    ORCH --> INPUT[Input normalization]
    ORCH --> DATA[Market-data adapters]
    ORCH --> ANALYSIS[Greeks and scenarios]
    ORCH --> KNOWLEDGE[Gemma 2 9B + LoRA adapter]
    ORCH --> VALIDATOR[Deterministic risk validator]
    API --> DB[(PostgreSQL / SQLite)]
```

The LLM is the strategy-generation engine; the deterministic fallback exists for offline development and degraded operation. Probabilistic output remains advisory: deterministic validation is the final software safety boundary, and no component submits orders.

## Repository layout

```text
backend/                 FastAPI application, domain layers, migrations, and tests
frontend/                React and Vite client
llm/                     QLoRA training, inference worker, prompts, schemas, and evaluation
docs/                    Architecture, flow, and data-contract documentation
.github/workflows/       Continuous integration
docker-compose.yml       Optional local PostgreSQL service
```

## Quick start

Requirements: Python 3.11+, Node.js 20+, and npm.

```powershell
git clone https://github.com/Jabuelouf/OptionOrchestrator.git
cd OptionOrchestrator
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
cd frontend
npm ci
cd ..
```

Start the API:

```powershell
cd backend
python -m uvicorn api.server:app --reload
```

In a second terminal, start the client:

```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173`. Mock market data is enabled in `.env.example`, so the project can be explored without vendor credentials.

## Verification

```powershell
cd backend
python -m pytest -q
cd ..
python -m ruff check backend
cd frontend
npm run lint
npm run build
```

## API surface

The FastAPI application exposes health, market overview, historical prices, options chains, technical analysis, volatility, strategy comparison, portfolio analytics, alerts, calendar events, and backtesting endpoints. Interactive API documentation is available at `http://127.0.0.1:8000/docs` while the backend is running.

The orchestration endpoint accepts a normalized options position and account constraints:

```http
POST /v1/rescue
Content-Type: application/json
```

It returns candidate adjustments together with quantitative context and validator results.

## Configuration

Copy `.env.example` to `.env` and add only the providers you intend to use. The interface runs with deterministic demo data locally; live LLM generation requires a RunPod endpoint. The referenced adapter is private, so independent deployments must have authorized Hugging Face access or substitute their own compatible adapter. Never commit real credentials or portfolio data.

For local persistence, start PostgreSQL with:

```powershell
docker compose up -d postgres
cd backend
python -m alembic upgrade head
```

Without `DATABASE_URL`, local migrations use SQLite.

## Current scope

- Provider availability and rate limits affect live-data features.
- Backtests are analytical simulations, not brokerage-grade execution models.
- Deterministic strategies remain available for offline development when the LLM endpoint is unavailable.
- Authentication, multi-user tenancy, and order execution are intentionally outside the current scope.

See [Architecture](docs/ARCHITECTURE.md), [LLM architecture](docs/LLM_ARCHITECTURE.md), [Model card](docs/MODEL_CARD.md), [Data contracts](docs/DATA_CONTRACTS.md), and [Request flow](docs/FLOW.md) for implementation details.

## License

Released under the [MIT License](LICENSE).
