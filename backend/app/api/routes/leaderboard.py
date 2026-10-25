from __future__ import annotations

import uuid
from datetime import datetime, date, timezone

from fastapi import APIRouter, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession
from app.models import LinkedBroker, PnLRecord, User
from app.schemas import (
    LeaderboardEntry,
    LeaderboardResponse,
    PublicUser,
    SentimentResponse,
)
from app.services.pnl_sync import calendar_day_for

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])
# Display-only copy for the dashboard ("Total P&L since …"). Not a filter.
LAUNCH_DATE = date(2026, 10, 25)


def _public(user: User) -> PublicUser:
    has_verified_publish = any(b.is_active for b in user.linked_brokers)
    return PublicUser(
        user_id=user.user_id,
        display_name=user.display_name,
        username=user.username,
        bio=user.bio,
        avatar_seed=user.avatar_seed,
        created_at=user.created_at,
        is_verified_publisher=has_verified_publish,
    )


@router.get("/sentiment", response_model=SentimentResponse)
async def sentiment(db: DbSession, day: date | None = Query(default=None)) -> SentimentResponse:
    """Aggregate the day's retail P&L into a single market-sentiment counter."""
    target = day or calendar_day_for()
    # Lifetime community total — every published day, including dates
    # before the static "since Oct 25" label.
    since_launch_total = await db.scalar(select(func.sum(PnLRecord.net_pnl)))
    since_launch_verified_total = await db.scalar(
        select(func.sum(PnLRecord.net_pnl)).where(PnLRecord.is_verified.is_(True))
    )

    rows = (
        await db.execute(
            select(
                PnLRecord.is_verified,
                func.sum(PnLRecord.net_pnl),
                func.count(PnLRecord.record_id),
                func.min(PnLRecord.net_pnl),
                func.max(PnLRecord.net_pnl),
            )
            .where(PnLRecord.date == target)
            .group_by(PnLRecord.is_verified)
        )
    ).all()

    total = 0.0
    count = 0
    verified_total = 0.0
    unverified_total = 0.0
    verified_count = 0
    unverified_count = 0
    biggest_loss = 0.0
    biggest_gain = 0.0

    for is_verified, sum_pnl, n, min_pnl, max_pnl in rows:
        sum_value = float(sum_pnl or 0)
        row_count = int(n or 0)
        total += sum_value
        count += row_count
        if is_verified:
            verified_total += sum_value
            verified_count += row_count
        else:
            unverified_total += sum_value
            unverified_count += row_count
        biggest_loss = min(biggest_loss, float(min_pnl or 0))
        biggest_gain = max(biggest_gain, float(max_pnl or 0))

    profitable = await db.scalar(
        select(func.count())
        .select_from(PnLRecord)
        .where(PnLRecord.date == target, PnLRecord.net_pnl > 0)
    )
    losing = await db.scalar(
        select(func.count())
        .select_from(PnLRecord)
        .where(PnLRecord.date == target, PnLRecord.net_pnl < 0)
    )

    return SentimentResponse(
        date=target,
        net_pnl_total=round(total, 2),
        since_launch_net_pnl=round(float(since_launch_total or 0), 2),
        since_launch_verified_pnl=round(float(since_launch_verified_total or 0), 2),
        since_launch_date=LAUNCH_DATE,
        trader_count=count,
        verified_net_pnl=round(verified_total, 2),
        unverified_net_pnl=round(unverified_total, 2),
        verified_count=verified_count,
        unverified_count=unverified_count,
        profitable_count=int(profitable or 0),
        losing_count=int(losing or 0),
        average_pnl=round(total / count, 2) if count else 0.0,
        biggest_loss=round(biggest_loss, 2),
        biggest_gain=round(biggest_gain, 2),
        updated_at=datetime.now(timezone.utc),
    )


@router.get("/", response_model=LeaderboardResponse)
async def leaderboard(
    db: DbSession,
    day: date | None = Query(default=None),
    scope: str = Query(default="today", pattern="^(today|all_time|cumulative)$"),
    verified_only: bool | None = Query(default=None),
    sort: str = Query(default="worst", pattern="^(worst|best)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> LeaderboardResponse:
    if scope in ("all_time", "cumulative") and day is None:
        subq = (
            select(
                PnLRecord.user_id,
                func.sum(PnLRecord.net_pnl).label("cumulative_pnl"),
                func.sum(PnLRecord.trade_count).label("cumulative_trades"),
                func.count(PnLRecord.record_id).label("session_count"),
                func.max(PnLRecord.date).label("latest_date"),
                func.max(case((PnLRecord.is_verified.is_(True), 1), else_=0)).label("has_verified"),
            )
            .group_by(PnLRecord.user_id)
            .subquery()
        )

        is_verified_cond = or_(
            subq.c.has_verified == 1,
            User.linked_brokers.any(LinkedBroker.is_active.is_(True)),
        )

        filters = [User.is_active.is_(True)]
        if verified_only is not None:
            if verified_only:
                filters.append(is_verified_cond)
            else:
                filters.append(~is_verified_cond)

        order = subq.c.cumulative_pnl.asc() if sort == "worst" else subq.c.cumulative_pnl.desc()

        query = (
            select(
                User,
                subq.c.cumulative_pnl,
                subq.c.cumulative_trades,
                subq.c.latest_date,
                subq.c.has_verified,
            )
            .join(subq, User.user_id == subq.c.user_id)
            .options(selectinload(User.linked_brokers))
            .where(*filters)
            .order_by(order, User.created_at.asc(), User.user_id.asc())
            .offset(offset)
            .limit(limit)
        )

        rows = (await db.execute(query)).all()

        total = await db.scalar(
            select(func.count())
            .select_from(User)
            .join(subq, User.user_id == subq.c.user_id)
            .where(*filters)
        )

        user_ids = [u.user_id for u, *_ in rows]
        notes_by_user: dict[uuid.UUID, str | None] = {}
        broker_sources_by_user: dict[uuid.UUID, str | None] = {}
        if user_ids:
            records = (
                await db.scalars(
                    select(PnLRecord)
                    .where(PnLRecord.user_id.in_(user_ids))
                    .order_by(PnLRecord.date.desc(), PnLRecord.created_at.desc())
                )
            ).all()
            for r in records:
                if r.user_id not in notes_by_user:
                    notes_by_user[r.user_id] = r.notes
                if r.user_id not in broker_sources_by_user and r.broker_source:
                    broker_sources_by_user[r.user_id] = r.broker_source

        entries = []
        for index, (u, cum_pnl, cum_trades, latest_date, has_v) in enumerate(rows):
            active_brokers = [b.broker_name.value for b in u.linked_brokers if b.is_active]
            is_entry_verified = bool(active_brokers or has_v)
            broker_src = (
                ", ".join(active_brokers)
                if active_brokers
                else broker_sources_by_user.get(u.user_id)
            )
            val = round(float(cum_pnl or 0.0), 2)
            entries.append(
                LeaderboardEntry(
                    rank=offset + index + 1,
                    user=_public(u),
                    net_pnl=val,
                    total_pnl=val,
                    is_verified=is_entry_verified,
                    broker_source=broker_src,
                    trade_count=int(cum_trades or 0),
                    record_date=latest_date,
                    note=notes_by_user.get(u.user_id),
                )
            )

        return LeaderboardResponse(
            entries=entries, total=int(total or 0), scope="cumulative"
        )

    target = day or calendar_day_for()

    query = (
        select(PnLRecord)
        .join(PnLRecord.user)
        .options(selectinload(PnLRecord.user).selectinload(User.linked_brokers))
        .where(PnLRecord.date == target)
    )
    if verified_only is not None:
        query = query.where(PnLRecord.is_verified.is_(verified_only))

    order = PnLRecord.net_pnl.asc() if sort == "worst" else PnLRecord.net_pnl.desc()
    records = (
        await db.scalars(
            query.order_by(order, PnLRecord.created_at.asc(), PnLRecord.record_id.asc())
            .offset(offset)
            .limit(limit)
        )
    ).all()

    user_ids = [record.user_id for record in records]
    total_by_user: dict[uuid.UUID, float] = {}
    if user_ids:
        totals = (
            await db.execute(
                select(PnLRecord.user_id, func.sum(PnLRecord.net_pnl))
                .where(PnLRecord.user_id.in_(user_ids))
                .group_by(PnLRecord.user_id)
            )
        ).all()
        for uid, total_sum in totals:
            total_by_user[uid] = round(float(total_sum or 0.0), 2)

    entries = [
        LeaderboardEntry(
            rank=offset + index + 1,
            user=_public(record.user),
            net_pnl=record.net_pnl,
            total_pnl=total_by_user.get(record.user_id, record.net_pnl),
            is_verified=record.is_verified,
            broker_source=record.broker_source,
            trade_count=record.trade_count,
            record_date=record.date,
            note=record.notes,
        )
        for index, record in enumerate(records)
    ]

    total = await db.scalar(
        select(func.count())
        .select_from(PnLRecord)
        .join(PnLRecord.user)
        .where(
            PnLRecord.date == target,
            *(
                [PnLRecord.is_verified.is_(verified_only)]
                if verified_only is not None
                else []
            ),
        )
    )

    return LeaderboardResponse(
        entries=entries, total=int(total or 0), scope=f"{target.isoformat()}"
    )
