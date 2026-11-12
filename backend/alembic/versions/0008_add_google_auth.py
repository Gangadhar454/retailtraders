"""add google auth to users

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-11
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "mysql":
        op.execute("ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL")
        op.execute("ALTER TABLE users ADD COLUMN google_id VARCHAR(128) NULL UNIQUE")
        op.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT NULL")
    elif bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL")
        op.execute("ALTER TABLE users ADD COLUMN google_id VARCHAR(128) UNIQUE")
        op.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT")
        op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)
    else:
        with op.batch_alter_table("users") as batch_op:
            batch_op.alter_column("password_hash", existing_type=sa.String(255), nullable=True)
            batch_op.add_column(sa.Column("google_id", sa.String(128), nullable=True, unique=True))
            batch_op.add_column(sa.Column("avatar_url", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "mysql":
        op.execute("ALTER TABLE users DROP COLUMN google_id")
        op.execute("ALTER TABLE users DROP COLUMN avatar_url")
        op.execute("ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NOT NULL")
    elif bind.dialect.name == "postgresql":
        op.drop_index("ix_users_google_id", table_name="users")
        op.execute("ALTER TABLE users DROP COLUMN google_id")
        op.execute("ALTER TABLE users DROP COLUMN avatar_url")
        op.execute("ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL")
    else:
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_column("google_id")
            batch_op.drop_column("avatar_url")
            batch_op.alter_column("password_hash", existing_type=sa.String(255), nullable=False)

