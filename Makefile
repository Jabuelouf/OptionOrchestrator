.PHONY: install test lint build smoke api frontend

install:
	python -m pip install -r requirements-dev.txt
	cd frontend && npm ci

test:
	cd backend && python -m pytest -q
	cd llm/evaluation && python scripts/validate_snapshot.py --snapshot scripts/example_snapshot.json
	cd llm/evaluation && python scripts/validate_plan.py --snapshot scripts/example_snapshot.json --plan scripts/example_plan.json

lint:
	python -m ruff check backend llm
	cd frontend && npm run lint

build:
	cd frontend && npm run build

smoke:
	cd backend && MARKET_DATA_PROVIDER=mock python -m api.main

api:
	cd backend && python -m uvicorn api.server:app --reload --host 127.0.0.1 --port 8000

frontend:
	cd frontend && npm run dev
