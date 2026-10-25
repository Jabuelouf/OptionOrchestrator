"""Database models (SQLAlchemy) for persisted app state.

Keep these models small and stable; domain contracts live in `shared.schemas`.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class OrchestrationRun(Base):
    """Persisted record of an orchestration invocation.

    Useful for:
    - auditability and debugging
    - training dataset generation (tool-trace + outcome labeling)
    """

    __tablename__ = "orchestration_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)

    # e.g. "rescue" | "compare_strategies" | "market_snapshot"
    kind: Mapped[str] = mapped_column(String(64), default="rescue", index=True)

    # Optional user or session reference (wire later)
    session_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)

    symbol: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)

    request_json: Mapped[dict] = mapped_column(JSON, default=dict)
    response_json: Mapped[dict] = mapped_column(JSON, default=dict)

    # Small, human-readable summary for quick inspection
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

