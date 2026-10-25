"""init persistence tables

Revision ID: 0001_init_persistence
Revises: 
Create Date: 2026-02-09
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001_init_persistence"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "orchestration_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("session_id", sa.String(length=128), nullable=True),
        sa.Column("symbol", sa.String(length=16), nullable=True),
        sa.Column("request_json", sa.JSON(), nullable=False),
        sa.Column("response_json", sa.JSON(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
    )
    op.create_index("ix_orchestration_runs_created_at", "orchestration_runs", ["created_at"])
    op.create_index("ix_orchestration_runs_kind", "orchestration_runs", ["kind"])
    op.create_index("ix_orchestration_runs_session_id", "orchestration_runs", ["session_id"])
    op.create_index("ix_orchestration_runs_symbol", "orchestration_runs", ["symbol"])


def downgrade() -> None:
    op.drop_index("ix_orchestration_runs_symbol", table_name="orchestration_runs")
    op.drop_index("ix_orchestration_runs_session_id", table_name="orchestration_runs")
    op.drop_index("ix_orchestration_runs_kind", table_name="orchestration_runs")
    op.drop_index("ix_orchestration_runs_created_at", table_name="orchestration_runs")
    op.drop_table("orchestration_runs")

