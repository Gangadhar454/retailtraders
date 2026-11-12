"""add is_manual_blocked to users

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "mysql":
        op.execute("ALTER TABLE users ADD COLUMN is_manual_blocked BOOLEAN NOT NULL DEFAULT FALSE")
    elif bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE users ADD COLUMN is_manual_blocked BOOLEAN NOT NULL DEFAULT FALSE")
    else:
        with op.batch_alter_table("users") as batch_op:
            batch_op.add_column(
                sa.Column("is_manual_blocked", sa.Boolean(), server_default=sa.text("0"), nullable=False)
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name in ("mysql", "postgresql"):
        op.execute("ALTER TABLE users DROP COLUMN is_manual_blocked")
    else:
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_column("is_manual_blocked")
