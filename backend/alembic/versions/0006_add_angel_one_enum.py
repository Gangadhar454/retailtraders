"""add Angel One to broker and P&L source enums

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-24
"""
from __future__ import annotations

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE broker_name_enum ADD VALUE IF NOT EXISTS 'ANGEL_ONE'")
        op.execute("ALTER TYPE pnl_source_enum ADD VALUE IF NOT EXISTS 'ANGEL_ONE'")
    elif bind.dialect.name == "mysql":
        op.execute("ALTER TABLE linked_brokers MODIFY COLUMN broker_name ENUM('UPSTOX', 'ZERODHA', 'ANGEL_ONE') NOT NULL")
        op.execute("ALTER TABLE pnl_records MODIFY COLUMN source ENUM('MANUAL', 'UPSTOX', 'ZERODHA', 'ANGEL_ONE') NOT NULL")
        op.execute("ALTER TABLE broker_pnl_daily MODIFY COLUMN broker_name ENUM('UPSTOX', 'ZERODHA', 'ANGEL_ONE') NOT NULL")


def downgrade() -> None:
    pass
