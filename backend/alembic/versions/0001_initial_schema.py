"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-21
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=64), nullable=False),
        sa.Column("username", sa.String(length=32), nullable=False),
        sa.Column("verified_upi_id", sa.String(length=128), nullable=True),
        sa.Column("upi_verified_name", sa.String(length=128), nullable=True),
        sa.Column("upi_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("upi_verification_status", sa.String(length=24), nullable=False),
        sa.Column("avatar_seed", sa.String(length=16), nullable=False),
        sa.Column("bio", sa.String(length=280), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_display_name", "users", ["display_name"], unique=False)
    op.create_index("ix_users_created_at", "users", ["created_at"], unique=False)

    op.create_table(
        "linked_brokers",
        sa.Column("link_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "broker_name",
            sa.Enum("UPSTOX", name="broker_name_enum"),
            nullable=False,
        ),
        sa.Column("broker_legal_name", sa.String(length=128), nullable=True),
        sa.Column("broker_user_id", sa.String(length=64), nullable=True),
        sa.Column("auth_token", sa.Text(), nullable=True),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scopes", sa.Text(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("link_id"),
        sa.UniqueConstraint("user_id", "broker_name", name="uq_user_broker"),
    )
    op.create_index(
        "ix_linked_brokers_user_id", "linked_brokers", ["user_id"], unique=False
    )

    op.create_table(
        "oauth_states",
        sa.Column("state", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("redirect_to", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("state"),
    )
    op.create_index("ix_oauth_states_user_id", "oauth_states", ["user_id"], unique=False)

    op.create_table(
        "pnl_records",
        sa.Column("record_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("net_pnl", sa.Float(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.Column("broker_source", sa.String(length=32), nullable=True),
        sa.Column(
            "source",
            sa.Enum("MANUAL", "UPSTOX", name="pnl_source_enum"),
            nullable=False,
        ),
        sa.Column("trade_count", sa.Integer(), nullable=False),
        sa.Column("win_rate", sa.Float(), nullable=True),
        sa.Column("notes", sa.String(length=280), nullable=True),
        sa.Column("shareable_image_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("record_id"),
        sa.UniqueConstraint("user_id", "date", name="uq_user_pnl_date"),
    )
    op.create_index("ix_pnl_records_user_id", "pnl_records", ["user_id"], unique=False)
    op.create_index("ix_pnl_records_date", "pnl_records", ["date"], unique=False)
    op.create_index(
        "ix_pnl_records_is_verified", "pnl_records", ["is_verified"], unique=False
    )
    op.create_index(
        "ix_pnl_date_verified", "pnl_records", ["date", "is_verified"], unique=False
    )

    op.create_table(
        "upi_verifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("upi_id", sa.String(length=128), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("resolved_name", sa.String(length=128), nullable=True),
        sa.Column("reference_id", sa.String(length=128), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_upi_verifications_user_id", "upi_verifications", ["user_id"], unique=False
    )
    op.create_index(
        "ix_upi_verifications_created_at",
        "upi_verifications",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_upi_verifications_created_at", table_name="upi_verifications")
    op.drop_index("ix_upi_verifications_user_id", table_name="upi_verifications")
    op.drop_table("upi_verifications")

    op.drop_index("ix_pnl_date_verified", table_name="pnl_records")
    op.drop_index("ix_pnl_records_is_verified", table_name="pnl_records")
    op.drop_index("ix_pnl_records_date", table_name="pnl_records")
    op.drop_index("ix_pnl_records_user_id", table_name="pnl_records")
    op.drop_table("pnl_records")

    op.drop_index("ix_oauth_states_user_id", table_name="oauth_states")
    op.drop_table("oauth_states")

    op.drop_index("ix_linked_brokers_user_id", table_name="linked_brokers")
    op.drop_table("linked_brokers")

    op.drop_index("ix_users_created_at", table_name="users")
    op.drop_index("ix_users_display_name", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    sa.Enum(name="pnl_source_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="broker_name_enum").drop(op.get_bind(), checkfirst=True)
