"""widen pnl to double precision

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-25
"""
from __future__ import annotations

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "mysql":
        op.execute("ALTER TABLE pnl_records MODIFY COLUMN net_pnl DOUBLE NOT NULL")
        op.execute("ALTER TABLE pnl_records MODIFY COLUMN manual_net_pnl DOUBLE NULL")
        op.execute("ALTER TABLE broker_pnl_daily MODIFY COLUMN net_pnl DOUBLE NOT NULL DEFAULT 0.0")
    elif bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE pnl_records ALTER COLUMN net_pnl TYPE DOUBLE PRECISION")
        op.execute("ALTER TABLE pnl_records ALTER COLUMN manual_net_pnl TYPE DOUBLE PRECISION")
        op.execute("ALTER TABLE broker_pnl_daily ALTER COLUMN net_pnl TYPE DOUBLE PRECISION")


def downgrade() -> None:
    pass

