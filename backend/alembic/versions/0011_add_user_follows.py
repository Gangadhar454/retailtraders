"""add user_follows table for trader followers and following

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-14
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_follows",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("follower_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("following_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["follower_id"],
            ["users.user_id"],
            name="fk_user_follows_follower_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["following_id"],
            ["users.user_id"],
            name="fk_user_follows_following_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_user_follows"),
        sa.UniqueConstraint(
            "follower_id",
            "following_id",
            name="uq_user_follows",
        ),
    )
    op.create_index(
        "ix_user_follows_follower_id", "user_follows", ["follower_id"]
    )
    op.create_index(
        "ix_user_follows_following_id", "user_follows", ["following_id"]
    )
    op.create_index(
        "ix_user_follows_follower_created",
        "user_follows",
        ["follower_id", "created_at"],
    )
    op.create_index(
        "ix_user_follows_following_created",
        "user_follows",
        ["following_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_follows_following_created", table_name="user_follows")
    op.drop_index("ix_user_follows_follower_created", table_name="user_follows")
    op.drop_index("ix_user_follows_following_id", table_name="user_follows")
    op.drop_index("ix_user_follows_follower_id", table_name="user_follows")
    op.drop_table("user_follows")
