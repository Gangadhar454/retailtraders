"""add Zerodha to broker and P&L source enums

SQLite stores these columns as VARCHAR, so no schema change is needed there.
Postgres uses native enum types created by the initial migration; new members
must be added explicitly before any row can reference them.
MySQL uses native ENUM columns that must be altered to add new allowed values.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-23
"""
from __future__ import annotations

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # SQLAlchemy stores enum *names* ("UPSTOX"), not values ("Upstox").
        op.execute("ALTER TYPE broker_name_enum ADD VALUE IF NOT EXISTS 'ZERODHA'")
        op.execute("ALTER TYPE pnl_source_enum ADD VALUE IF NOT EXISTS 'ZERODHA'")
    elif bind.dialect.name == "mysql":
        op.execute("ALTER TABLE linked_brokers MODIFY COLUMN broker_name ENUM('UPSTOX', 'ZERODHA') NOT NULL")
        op.execute("ALTER TABLE pnl_records MODIFY COLUMN source ENUM('MANUAL', 'UPSTOX', 'ZERODHA') NOT NULL")
        op.execute("ALTER TABLE broker_pnl_daily MODIFY COLUMN broker_name ENUM('UPSTOX', 'ZERODHA') NOT NULL")


def downgrade() -> None:
    # PostgreSQL and MySQL cannot safely shrink an enum without checking data.
    # Intentionally irreversible.
    pass
