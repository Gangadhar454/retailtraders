"""add broker_pnl_daily and manual pnl fields

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-23
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "pnl_records",
        sa.Column("manual_net_pnl", sa.Float(), nullable=True),
    )
    op.add_column(
        "pnl_records",
        sa.Column("has_manual_entry", sa.Boolean(), nullable=False, server_default="0"),
    )
    op.create_table(
        "broker_pnl_daily",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "broker_name",
            sa.Enum("UPSTOX", name="broker_name_enum"),
            nullable=False,
        ),
        sa.Column("net_pnl", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("trade_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("win_rate", sa.Float(), nullable=True),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "date", "broker_name", name="uq_broker_pnl_daily"
        ),
    )
    # Index is created via SQLAlchemy model metadata (create_all); not duplicated here.


def downgrade() -> None:
    op.drop_table("broker_pnl_daily")
    op.drop_column("pnl_records", "has_manual_entry")
    op.drop_column("pnl_records", "manual_net_pnl")
