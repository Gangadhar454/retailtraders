"""add Zerodha to broker and P&L source enums

SQLite stores these columns as VARCHAR, so no schema change is needed there.
Postgres uses native enum types created by the initial migration; new members
must be added explicitly before any row can reference them.

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
    if bind.dialect.name != "postgresql":
        return
    # SQLAlchemy stores enum *names* ("UPSTOX"), not values ("Upstox").
    op.execute("ALTER TYPE broker_name_enum ADD VALUE IF NOT EXISTS 'ZERODHA'")
    op.execute("ALTER TYPE pnl_source_enum ADD VALUE IF NOT EXISTS 'ZERODHA'")


def downgrade() -> None:
    # PostgreSQL cannot remove an enum member without recreating the type,
    # which would require rewriting every dependent column. Intentionally
    # irreversible.
    pass
