from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession
from app.models import BrokerName, BrokerPnLDaily, LinkedBroker, PnLRecord, PnLSource, User
from app.schemas import (
    PnLCreateRequest,
    PnLFeedEntry,
    PnLFeedResponse,
    PnLRecordOut,
    PublicUser,
    PublishDayOut,
    PublishHistoryResponse,
    PublishItemOut,
    VerifyPnlResponse,
)
from app.services.pnl_sync import (
    _recalculate_daily_record,
    calendar_day_for,
    sync_user_broker,
    trading_day_for,
)
from app.services.broker_base import BrokerError

router = APIRouter(prefix="/pnl", tags=["pnl"])


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


async def _prune_empty_day(db: DbSession, user: User, target: date) -> None:
    """Drop the day's aggregate record when no publish contributes to it."""
    broker_count = await db.scalar(
        select(func.count())
        .select_from(BrokerPnLDaily)
        .where(
            BrokerPnLDaily.user_id == user.user_id,
            BrokerPnLDaily.date == target,
            BrokerPnLDaily.net_pnl != 0,
        )
    )
    record = await db.scalar(
        select(PnLRecord).where(
            PnLRecord.user_id == user.user_id, PnLRecord.date == target
        )
    )
    if record is not None and (
        (not broker_count and not record.has_manual_entry)
        or (record.net_pnl == 0 and not record.has_manual_entry)
    ):
        await db.delete(record)


@router.post("/", response_model=PnLRecordOut, status_code=status.HTTP_201_CREATED)
async def create_manual_pnl(
    payload: PnLCreateRequest, user: CurrentUser, db: DbSession
) -> PnLRecordOut:
    """Publish a manually entered daily P&L.

    A manual entry can coexist with broker-fetched P&L for the same day.
    The daily net P&L is recomputed as the sum of all broker fetches plus
    the manual amount. A record with any manual entry is never verified.
    """
    target = payload.date or calendar_day_for()

    record = await db.scalar(
        select(PnLRecord).where(
            PnLRecord.user_id == user.user_id, PnLRecord.date == target
        )
    )

    if record is None:
        record = PnLRecord(
            user_id=user.user_id,
            date=target,
            net_pnl=payload.net_pnl,
            is_verified=False,
            source=PnLSource.MANUAL,
            notes=payload.notes,
            trade_count=payload.trade_count,
            win_rate=payload.win_rate,
            manual_net_pnl=payload.net_pnl,
            manual_trade_count=payload.trade_count,
            has_manual_entry=True,
        )
        db.add(record)
    else:
        record.manual_net_pnl = payload.net_pnl
        record.manual_trade_count = payload.trade_count
        record.has_manual_entry = True
        record.notes = payload.notes
        record.trade_count = payload.trade_count
        record.win_rate = payload.win_rate
        record.source = PnLSource.MANUAL

    await db.flush()
    # Recompute the daily aggregate from all broker fetches + manual entry.
    record = await _recalculate_daily_record(db, user, target)
    return PnLRecordOut.model_validate(record)


@router.post("/sync", response_model=VerifyPnlResponse)
async def sync_pnl(
    user: CurrentUser,
    db: DbSession,
    broker: str = Query(default="upstox", pattern="^[a-z_]+$"),
) -> VerifyPnlResponse:
    """Fetch today's realised P&L from ONE connected broker.

    Each broker's P&L is stored separately; the daily post is recomputed as
    the sum of all broker fetches plus any manual entry.
    """
    try:
        record, broker_fetched_pnl, broker_label = await sync_user_broker(
            db, user, broker
        )
    except BrokerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    total_pnl = record.net_pnl
    return VerifyPnlResponse(
        status="VERIFIED",
        message=(
            f"Fetched {broker_fetched_pnl:+.2f} from {broker_label} — "
            f"today's total P&L is {total_pnl:+.2f}."
        ),
        record=PnLRecordOut.model_validate(record),
        broker_fetched_pnl=broker_fetched_pnl,
        broker_name=broker_label,
    )


@router.get("/mine", response_model=list[PnLRecordOut])
async def my_records(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=90, ge=1, le=365),
) -> list[PnLRecordOut]:
    records = (
        await db.scalars(
            select(PnLRecord)
            .where(PnLRecord.user_id == user.user_id)
            .order_by(PnLRecord.date.desc())
            .limit(limit)
        )
    ).all()
    return [PnLRecordOut.model_validate(r) for r in records]


@router.get("/history", response_model=PublishHistoryResponse)
async def publish_history(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> PublishHistoryResponse:
    """The user's day-by-day publish history, newest day first.

    Each day carries every individual publish that contributes to its total:
    the manual entry (editable) and each broker fetch (delete-only).
    """
    total = await db.scalar(
        select(func.count())
        .select_from(PnLRecord)
        .where(PnLRecord.user_id == user.user_id)
    )
    total = int(total or 0)

    records = (
        await db.scalars(
            select(PnLRecord)
            .where(PnLRecord.user_id == user.user_id)
            .order_by(PnLRecord.date.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()

    dates = [r.date for r in records]
    broker_by_date: dict[date, list[BrokerPnLDaily]] = {}
    if dates:
        broker_rows = (
            await db.scalars(
                select(BrokerPnLDaily)
                .where(
                    BrokerPnLDaily.user_id == user.user_id,
                    BrokerPnLDaily.date.in_(dates),
                )
                .order_by(BrokerPnLDaily.fetched_at.asc())
            )
        ).all()
        for row in broker_rows:
            broker_by_date.setdefault(row.date, []).append(row)

    days: list[PublishDayOut] = []
    for record in records:
        items: list[PublishItemOut] = []
        if record.has_manual_entry and record.manual_net_pnl is not None:
            items.append(
                PublishItemOut(
                    kind="manual",
                    id=record.record_id,
                    net_pnl=record.manual_net_pnl,
                    notes=record.notes,
                    trade_count=record.manual_trade_count,
                    win_rate=None,
                    source=PnLSource.MANUAL,
                    broker_name=None,
                    created_at=record.created_at,
                    can_edit=True,
                    can_delete=True,
                )
            )
        for row in broker_by_date.get(record.date, []):
            items.append(
                PublishItemOut(
                    kind="broker",
                    id=row.id,
                    net_pnl=row.net_pnl,
                    notes=None,
                    trade_count=row.trade_count,
                    win_rate=row.win_rate,
                    source=PnLSource[row.broker_name.name],
                    broker_name=row.broker_name.value,
                    created_at=row.fetched_at,
                    can_edit=False,
                    can_delete=True,
                )
            )
        if not items:
            # Safety net: an aggregate with no per-source rows (data written
            # before broker fetches were split out). It stays deletable so a
            # day never expands to an empty, unmanageable panel.
            items.append(
                PublishItemOut(
                    kind="legacy",
                    id=record.record_id,
                    net_pnl=record.net_pnl,
                    notes=record.notes,
                    trade_count=record.trade_count,
                    win_rate=record.win_rate,
                    source=record.source,
                    broker_name=None,
                    created_at=record.created_at,
                    can_edit=False,
                    can_delete=True,
                )
            )
        days.append(
            PublishDayOut(
                date=record.date,
                net_pnl=record.net_pnl,
                is_verified=record.is_verified,
                broker_source=record.broker_source,
                trade_count=record.trade_count,
                notes=record.notes if record.has_manual_entry else None,
                items=items,
            )
        )

    return PublishHistoryResponse(
        days=days,
        total=total,
        has_more=offset + len(records) < total,
    )


@router.delete(
    "/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_record(
    record_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> Response:
    record = await db.scalar(
        select(PnLRecord).where(
            PnLRecord.record_id == record_id, PnLRecord.user_id == user.user_id
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    broker_row_count = await db.scalar(
        select(func.count())
        .select_from(BrokerPnLDaily)
        .where(
            BrokerPnLDaily.user_id == user.user_id,
            BrokerPnLDaily.date == record.date,
        )
    )
    if record.is_verified and broker_row_count:
        raise HTTPException(
            status_code=400,
            detail="Verified records are owned by the broker and cannot be deleted",
        )

    # Clearing a manual entry: remove the manual figure and its metadata, then
    # recompute the daily aggregate. If broker fetches exist the record stays
    # (and becomes verified again); otherwise it is pruned entirely.
    target = record.date
    record.manual_net_pnl = None
    record.manual_trade_count = 0
    record.has_manual_entry = False
    record.notes = None
    await db.flush()

    await _recalculate_daily_record(db, user, target)
    await _prune_empty_day(db, user, target)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/broker/{broker_pnl_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_broker_fetch(
    broker_pnl_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> Response:
    """Remove one broker's fetched figure and recompute the day."""
    row = await db.scalar(
        select(BrokerPnLDaily).where(
            BrokerPnLDaily.id == broker_pnl_id,
            BrokerPnLDaily.user_id == user.user_id,
        )
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Broker fetch not found")

    target = row.date
    await db.delete(row)
    await db.flush()

    await _recalculate_daily_record(db, user, target)
    await _prune_empty_day(db, user, target)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/feed", response_model=PnLFeedResponse)
async def feed(
    db: DbSession,
    day: date | None = Query(default=None),
    verified_only: bool = Query(default=False),
    sort: str = Query(default="worst", pattern="^(worst|best|recent)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> PnLFeedResponse:
    """The public 'Hall of Pain' feed."""
    target = day or calendar_day_for()

    query = (
        select(PnLRecord)
        .join(PnLRecord.user)
        .options(selectinload(PnLRecord.user))
        .where(PnLRecord.date == target, PnLRecord.net_pnl != 0)
    )
    if verified_only:
        query = query.where(PnLRecord.is_verified.is_(True))

    if sort == "worst":
        query = query.order_by(PnLRecord.net_pnl.asc())
    elif sort == "best":
        query = query.order_by(PnLRecord.net_pnl.desc())
    else:
        query = query.order_by(PnLRecord.created_at.desc())

    records = (await db.scalars(query.offset(offset).limit(limit + 1))).all()
    has_more = len(records) > limit
    records = records[:limit]

    entries = [
        PnLFeedEntry(
            record=PnLRecordOut.model_validate(r),
            user=_public(r.user),
            rank=(offset + index + 1) if sort != "recent" else None,
        )
        for index, r in enumerate(records)
    ]

    total = await db.scalar(
        select(func.count())
        .select_from(PnLRecord)
        .join(PnLRecord.user)
        .where(
            PnLRecord.date == target,
            *([PnLRecord.is_verified.is_(True)] if verified_only else []),
        )
    )

    return PnLFeedResponse(
        entries=entries, total=int(total or 0), has_more=has_more
    )
