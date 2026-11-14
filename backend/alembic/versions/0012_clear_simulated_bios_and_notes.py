"""clear bio from simulated users and notes from simulated pnl records

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-14
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    # Clear bio for simulated users
    bind.execute(
        sa.text("UPDATE users SET bio = NULL WHERE is_simulated = 1")
    )
    # Clear comments/notes for simulated records
    bind.execute(
        sa.text("UPDATE pnl_records SET notes = NULL WHERE is_simulated = 1")
    )


def downgrade() -> None:
    pass
