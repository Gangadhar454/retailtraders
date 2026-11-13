"""add post_reactions table for emoji reactions

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-13
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "post_reactions",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("record_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("reaction_type", sa.String(20), nullable=False),
        sa.Column("client_id", sa.String(64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["record_id"],
            ["pnl_records.record_id"],
            name="fk_post_reactions_record_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_post_reactions"),
        sa.UniqueConstraint(
            "record_id",
            "client_id",
            "reaction_type",
            name="uq_post_reaction_client",
        ),
    )
    op.create_index(
        "ix_post_reactions_record_id", "post_reactions", ["record_id"]
    )
    op.create_index(
        "ix_post_reactions_client_id", "post_reactions", ["client_id"]
    )
    op.create_index(
        "ix_post_reactions_reaction_type", "post_reactions", ["reaction_type"]
    )
    op.create_index(
        "ix_post_reactions_record_type",
        "post_reactions",
        ["record_id", "reaction_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_post_reactions_record_type", table_name="post_reactions")
    op.drop_index("ix_post_reactions_reaction_type", table_name="post_reactions")
    op.drop_index("ix_post_reactions_client_id", table_name="post_reactions")
    op.drop_index("ix_post_reactions_record_id", table_name="post_reactions")
    op.drop_table("post_reactions")
