"""SQLAlchemy database wiring for Train/Test runtime.

This is scaffolding for persistence (portfolio, alerts, saved analyses, caches).
The single source-of-truth env file is repo-root `.env` (see `shared.env`).
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from functools import lru_cache
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .env import load_root_env

load_root_env()


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        # Default to a local sqlite file under Train/Test. This stays out of git via `.gitignore`.
        url = "sqlite+pysqlite:///./.local/dev.db"
    return url


def get_engine() -> Engine:
    return _engine_for(get_database_url())


@lru_cache(maxsize=8)
def _engine_for(url: str) -> Engine:
    connect_args = {}
    if url.startswith("sqlite"):
        # Required for sqlite when used from multiple threads (FastAPI dev server).
        connect_args["check_same_thread"] = False
    return create_engine(url, future=True, pool_pre_ping=True, connect_args=connect_args)

def get_sessionmaker() -> sessionmaker[Session]:
    engine = get_engine()
    return sessionmaker(bind=engine, class_=Session, autoflush=False, autocommit=False, future=True)


@contextmanager
def db_session() -> Iterator[Session]:
    session = get_sessionmaker()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
