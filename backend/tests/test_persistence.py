import os
from pathlib import Path


def _setup_sqlite(tmp_path: Path) -> None:
    os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{tmp_path / 'test.db'}"
    from shared.db import get_engine
    from shared.models import Base

    engine = get_engine()
    Base.metadata.create_all(bind=engine)


def test_try_persist_run_noop_when_not_enabled(tmp_path: Path) -> None:
    # Ensure no implicit enablement
    os.environ.pop("DATABASE_URL", None)
    os.environ["PERSIST_RUNS"] = "0"

    from shared.persistence import try_persist_run

    run_id = try_persist_run(
        kind="rescue",
        payload={"position": {"symbol": "SPY", "legs": []}, "account": {}},
        response={"assessment": "ok", "candidates": [], "validations": []},
        symbol="SPY",
        session_id="abc",
    )
    assert run_id is None


def test_try_persist_run_persists_when_database_url_set(tmp_path: Path) -> None:
    _setup_sqlite(tmp_path)
    os.environ["PERSIST_RUNS"] = "0"

    from shared.persistence import try_persist_run

    run_id = try_persist_run(
        kind="rescue",
        payload={"position": {"symbol": "SPY", "legs": []}, "account": {}},
        response={"assessment": "ok", "candidates": [], "validations": []},
        symbol="SPY",
        session_id="abc",
    )
    assert isinstance(run_id, int)
    assert run_id > 0


def test_try_persist_run_persists_when_explicitly_enabled(tmp_path: Path) -> None:
    _setup_sqlite(tmp_path)
    os.environ["PERSIST_RUNS"] = "1"

    from shared.persistence import try_persist_run

    run_id = try_persist_run(
        kind="rescue",
        payload={"position": {"symbol": "SPY", "legs": []}, "account": {}},
        response={"assessment": "ok", "candidates": [], "validations": []},
        symbol="SPY",
        session_id="abc",
    )
    assert isinstance(run_id, int)
    assert run_id > 0

