"""repair legacy daily aggregates into per-source rows

Records written before broker fetches were stored separately have an
aggregate PnLRecord but no BrokerPnLDaily row (verified) or a manual figure
without the manual flags (unverified). Reconstruct the missing rows so the
publish-history accordion always has something to show and manage.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-23
"""
from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    rows = (
        bind.execute(
            sa.text(
                """
                SELECT r.record_id, r.user_id, r.date, r.net_pnl, r.is_verified,
                       r.source, r.trade_count, r.win_rate, r.broker_source,
                       r.created_at, r.has_manual_entry, r.manual_net_pnl
                FROM pnl_records r
                LEFT JOIN broker_pnl_daily b
                  ON b.user_id = r.user_id AND b.date = r.date
                WHERE b.id IS NULL
                """
            )
        )
        .mappings()
        .all()
    )

    for row in rows:
        if row["is_verified"] and row["source"] == "UPSTOX":
            broker_source = (row["broker_source"] or "UPSTOX").strip().upper()
            broker_name = (
                broker_source if broker_source.startswith("UPSTOX") else "UPSTOX"
            )
            bind.execute(
                sa.text(
                    """
                    INSERT INTO broker_pnl_daily
                        (id, user_id, date, broker_name, net_pnl, trade_count,
                         win_rate, fetched_at)
                    VALUES
                        (:id, :user_id, :date, :broker_name, :net_pnl,
                         :trade_count, :win_rate,
                         COALESCE(:fetched_at, CURRENT_TIMESTAMP))
                    """
                ),
                {
                    "id": uuid.uuid4().hex,
                    "user_id": row["user_id"],
                    "date": row["date"],
                    "broker_name": broker_name,
                    "net_pnl": row["net_pnl"],
                    "trade_count": row["trade_count"],
                    "win_rate": row["win_rate"],
                    "fetched_at": row["created_at"],
                },
            )
        elif not row["has_manual_entry"]:
            bind.execute(
                sa.text(
                    """
                    UPDATE pnl_records
                    SET has_manual_entry = 1,
                        manual_net_pnl = :net_pnl,
                        manual_trade_count = :trade_count
                    WHERE record_id = :record_id
                    """
                ),
                {
                    "record_id": row["record_id"],
                    "net_pnl": row["net_pnl"],
                    "trade_count": row["trade_count"],
                },
            )
        elif row["manual_net_pnl"] is None:
            bind.execute(
                sa.text(
                    """
                    UPDATE pnl_records
                    SET manual_net_pnl = :net_pnl,
                        manual_trade_count = COALESCE(manual_trade_count, :trade_count)
                    WHERE record_id = :record_id
                    """
                ),
                {
                    "record_id": row["record_id"],
                    "net_pnl": row["net_pnl"],
                    "trade_count": row["trade_count"],
                },
            )


def downgrade() -> None:
    # Data repair; the original orphaned aggregates cannot be distinguished
    # from genuinely split rows, so this is intentionally irreversible.
    pass
