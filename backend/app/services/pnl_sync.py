from __future__ import annotations

import logging
from datetime import datetime, date, timedelta, timezone
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    BrokerName,
    BrokerPnLDaily,
    LinkedBroker,
    PnLRecord,
    PnLSource,
    User,
)
from app.services.broker_base import BrokerError
from app.services.angel_one import AngelOneClient
from app.services.upstox import UpstoxClient
from app.services.zerodha import ZerodhaClient

logger = logging.getLogger(__name__)

BrokerClient = UpstoxClient | ZerodhaClient | AngelOneClient

try:
    from zoneinfo import ZoneInfo

    IST = ZoneInfo("Asia/Kolkata")
except Exception:  # pragma: no cover - zoneinfo ships with CPython 3.9+
    IST = timezone.utc


def trading_day_for(now: datetime | None = None) -> date:
    """The exchange session date a broker sync should be attributed to."""
    current = now or datetime.now(timezone.utc)
    ist = current.astimezone(IST)
    if ist.weekday() >= 5:  # Saturday / Sunday -> attribute to the last weekday
        ist = ist - timedelta(days=ist.weekday() - 4)
    return ist.date()


def calendar_day_for(now: datetime | None = None) -> date:
    """Return the current IST calendar date for manual community posts."""
    current = now or datetime.now(timezone.utc)
    return current.astimezone(IST).date()


async def ensure_fresh_token(db: AsyncSession, link: LinkedBroker) -> str:
    """Return a valid access token, refreshing it when it is close to expiry."""
    client = _client_for(link)
    token = link.auth_token
    label = link.broker_name.value

    expires_at = link.token_expires_at
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    if token and expires_at is not None and expires_at <= now and not link.refresh_token:
        raise BrokerError(
            f"Your {label} session has expired. Reconnect the broker to fetch "
            "today's P&L.",
            status_code=401,
        )

    needs_refresh = (
        not token
        or (
            expires_at is not None
            and expires_at <= now + timedelta(minutes=5)
        )
    )

    if needs_refresh and link.refresh_token:
        try:
            tokens = await client.refresh_access_token(link.refresh_token)
        except BrokerError as exc:
            logger.warning("Token refresh failed for link %s: %s", link.link_id, exc)
            link.is_active = False
            await db.flush()
            raise BrokerError(
                f"Your {label} session has expired. Reconnect the broker to fetch "
                "today's P&L.",
                status_code=401,
            ) from exc
        link.auth_token = tokens.access_token
        link.refresh_token = tokens.refresh_token or link.refresh_token
        link.token_expires_at = tokens.expires_at
        await db.flush()
        token = tokens.access_token

    if not token:
        raise BrokerError(
            f"No {label} session is connected to this account. Reconnect the "
            "broker on the Publish page to fetch today's P&L.",
            status_code=401,
        )

    return token


def _client_for(link: LinkedBroker) -> BrokerClient:
    """Return the broker API client for a link."""
    if link.broker_name == BrokerName.UPSTOX:
        return UpstoxClient()
    if link.broker_name == BrokerName.ZERODHA:
        return ZerodhaClient()
    if link.broker_name == BrokerName.ANGEL_ONE:
        return AngelOneClient()
    broker_label = getattr(link.broker_name, "value", link.broker_name)
    raise BrokerError(
        f"{broker_label} sync is not yet supported",
        status_code=501,
    )


async def _recalculate_daily_record(
    db: AsyncSession, user: User, target: date
) -> PnLRecord | None:
    """Recompute the daily PnLRecord from all broker fetches + manual entry.

    net_pnl   = sum of all broker PnLs for the day + manual_net_pnl
    is_verified = at least one broker fetch exists AND no manual entry for the day
    """
    broker_rows = (
        await db.scalars(
            select(BrokerPnLDaily).where(
                BrokerPnLDaily.user_id == user.user_id,
                BrokerPnLDaily.date == target,
                BrokerPnLDaily.net_pnl != 0,
            )
        )
    ).all()

    total_broker_pnl = sum(float(r.net_pnl) for r in broker_rows)
    total_trades = sum(r.trade_count for r in broker_rows)
    broker_names = [r.broker_name.value for r in broker_rows if r.net_pnl != 0]

    record = await db.scalar(
        select(PnLRecord).where(
            PnLRecord.user_id == user.user_id, PnLRecord.date == target
        )
    )

    manual_pnl = float(record.manual_net_pnl) if record and record.manual_net_pnl is not None else 0.0
    manual_trades = record.manual_trade_count if record and record.manual_trade_count else 0
    net_pnl = round(total_broker_pnl + manual_pnl, 2)
    has_broker_fetch = len(broker_rows) > 0
    has_manual = bool(record and record.has_manual_entry) if record else False

    # If there are no active broker fetches and no manual entry, or if net_pnl is 0 without manual entry,
    # remove any existing daily record so 0 is never posted.
    if (not has_broker_fetch and not has_manual) or (net_pnl == 0.0 and not has_manual):
        if record is not None:
            await db.delete(record)
            await db.flush()
        return None

    trade_count = total_trades + (manual_trades if has_manual else 0)

    # is_verified only when there is at least one broker fetch and no manual entry
    is_verified = has_broker_fetch and not has_manual
    if has_broker_fetch:
        first_broker = min(broker_rows, key=lambda r: r.broker_name.name)
        source = PnLSource[first_broker.broker_name.name]
    else:
        source = PnLSource.MANUAL

    win_rows = [
        (float(r.win_rate), r.trade_count)
        for r in broker_rows
        if r.win_rate is not None and r.trade_count
    ]
    if win_rows and not has_manual:
        weighted_trades = sum(count for _, count in win_rows)
        win_rate = round(
            sum(rate * count for rate, count in win_rows) / weighted_trades, 2
        )
    else:
        win_rate = None

    if record is None:
        record = PnLRecord(
            user_id=user.user_id,
            date=target,
            net_pnl=net_pnl,
            is_verified=is_verified,
            broker_source=", ".join(broker_names) or None,
            source=source,
            trade_count=trade_count,
            win_rate=win_rate,
            manual_net_pnl=manual_pnl or None,
            manual_trade_count=manual_trades,
            has_manual_entry=has_manual,
        )
        db.add(record)
    else:
        record.net_pnl = net_pnl
        record.is_verified = is_verified
        record.broker_source = ", ".join(broker_names) or None
        record.source = source
        record.trade_count = trade_count
        record.win_rate = win_rate
        record.manual_net_pnl = manual_pnl or None
        record.manual_trade_count = manual_trades if has_manual else 0
        record.has_manual_entry = has_manual

    await db.flush()
    return record


async def sync_user_broker(
    db: AsyncSession,
    user: User,
    broker_name: str,
    *,
    session_date: date | None = None,
) -> tuple[PnLRecord, float, str]:
    """Fetch realised P&L from ONE broker and store it separately.

    Returns (daily_record, broker_fetched_pnl, broker_name_label).
    """
    target = session_date or trading_day_for()

    try:
        broker_enum = BrokerName[broker_name.upper()]
    except KeyError:
        raise BrokerError(
            f"{broker_name} is not a supported broker.",
            status_code=400,
        )

    # Check if this specific broker is connected
    link = await db.scalar(
        select(LinkedBroker).where(
            LinkedBroker.user_id == user.user_id,
            LinkedBroker.broker_name == broker_enum,
            LinkedBroker.is_active.is_(True),
        )
    )
    if link is None:
        # No active broker at all
        any_link = await db.scalar(
            select(LinkedBroker).where(
                LinkedBroker.user_id == user.user_id,
                LinkedBroker.is_active.is_(True),
            )
        )
        if any_link is None:
            raise BrokerError(
                f"No broker is connected. Connect {broker_name} on the Publish page first.",
                status_code=400,
            )
        raise BrokerError(
            f"You are linked to {any_link.broker_name.value}, not {broker_name}.",
            status_code=400,
        )

    client = _client_for(link)
    token = await ensure_fresh_token(db, link)
    try:
        snapshot = await client.fetch_snapshot(token)
    except BrokerError as exc:
        if exc.status_code == 401:
            link.is_active = False
            await db.flush()
        raise

    broker_fetched_pnl = round(snapshot.realized_pnl, 2)
    broker_label = link.broker_name.value

    # Do not publish or store zero P&L (e.g. trades still active in unrealised profit/loss).
    if broker_fetched_pnl == 0.0:
        # If an existing broker row with 0 was saved previously, remove it
        old_zero = await db.scalar(
            select(BrokerPnLDaily).where(
                BrokerPnLDaily.user_id == user.user_id,
                BrokerPnLDaily.date == target,
                BrokerPnLDaily.broker_name == broker_enum,
            )
        )
        if old_zero is not None and old_zero.net_pnl == 0:
            await db.delete(old_zero)
            await db.flush()
            await _recalculate_daily_record(db, user, target)

        link.last_synced_at = datetime.now(timezone.utc)
        await db.flush()

        unrealized = round(snapshot.unrealized_pnl, 2)
        if unrealized != 0.0:
            sign = "+" if unrealized > 0 else "-"
            formatted = f"{sign}₹{abs(unrealized):,.2f}"
            raise BrokerError(
                f"Your {broker_label} positions are currently open with unrealised P&L "
                f"({formatted}). There is no realised P&L to post yet while trades are active.",
                status_code=400,
            )
        raise BrokerError(
            f"No realised P&L to publish from {broker_label} yet (realised P&L is ₹0.00). "
            "Only completed trades with realised P&L can be published.",
            status_code=400,
        )

    # Upsert this broker's daily P&L
    broker_row = await db.scalar(
        select(BrokerPnLDaily).where(
            BrokerPnLDaily.user_id == user.user_id,
            BrokerPnLDaily.date == target,
            BrokerPnLDaily.broker_name == broker_enum,
        )
    )
    if broker_row is None:
        broker_row = BrokerPnLDaily(
            user_id=user.user_id,
            date=target,
            broker_name=broker_enum,
            net_pnl=broker_fetched_pnl,
            trade_count=snapshot.trade_count,
            win_rate=snapshot.win_rate,
        )
        db.add(broker_row)
    else:
        broker_row.net_pnl = broker_fetched_pnl
        broker_row.trade_count = snapshot.trade_count
        broker_row.win_rate = snapshot.win_rate
        broker_row.fetched_at = datetime.now(timezone.utc)

    link.last_synced_at = datetime.now(timezone.utc)
    await db.flush()

    # Recompute the daily aggregate record
    record = await _recalculate_daily_record(db, user, target)
    return record, broker_fetched_pnl, broker_label


async def sync_all_linked_brokers(db: AsyncSession) -> int:
    """Background sweep over every user with an active broker link.

    For each user, syncs every active broker link and recomputes the daily
    aggregate. Returns the number of users synced.
    """
    users = (
        await db.scalars(
            select(User)
            .join(LinkedBroker, LinkedBroker.user_id == User.user_id)
            .where(LinkedBroker.is_active.is_(True), User.is_active.is_(True))
            .distinct()
        )
    ).all()

    synced = 0
    for user in users:
        links = (
            await db.scalars(
                select(LinkedBroker).where(
                    LinkedBroker.user_id == user.user_id,
                    LinkedBroker.is_active.is_(True),
                )
            )
        ).all()
        for link in links:
            try:
                await sync_user_broker(db, user, link.broker_name.value)
                synced += 1
            except BrokerError as exc:
                logger.warning(
                    "Skipping user %s broker %s: %s", user.user_id, link.broker_name, exc
                )
            except Exception:
                logger.exception(
                    "Unexpected error syncing user %s broker %s",
                    user.user_id,
                    link.broker_name,
                )
    return synced

async def backfill_user_history(
    db: AsyncSession, link: LinkedBroker, days: int = 30
) -> Sequence[PnLRecord]:
    """Best-effort historical backfill from completed trade history."""
    if link.broker_name == BrokerName.ZERODHA:
        raise BrokerError(
            "Zerodha does not publish per-trade realised P&L, so historical "
            "days cannot be backfilled. Only today's figure is available.",
            status_code=501,
        )
    client = _client_for(link)
    token = await ensure_fresh_token(db, link)
    snapshot = await client.fetch_snapshot(token)

    cutoff = trading_day_for() - timedelta(days=days)
    by_day: dict[date, float] = {}
    wins: dict[date, tuple[int, int]] = {}

    for trade in snapshot.trades:
        if trade.trade_date.tzinfo is None:
            trade_date = trade.trade_date.replace(tzinfo=timezone.utc).astimezone(IST).date()
        else:
            trade_date = trade.trade_date.astimezone(IST).date()
        if trade_date < cutoff:
            continue
        by_day[trade_date] = by_day.get(trade_date, 0.0) + trade.pnl
        total, won = wins.get(trade_date, (0, 0))
        wins[trade_date] = (total + 1, won + (1 if trade.pnl > 0 else 0))

    records: list[PnLRecord] = []
    for trade_date, pnl in by_day.items():
        broker_row = await db.scalar(
            select(BrokerPnLDaily).where(
                BrokerPnLDaily.user_id == link.user_id,
                BrokerPnLDaily.date == trade_date,
                BrokerPnLDaily.broker_name == link.broker_name,
            )
        )
        if broker_row is None:
            broker_row = BrokerPnLDaily(
                user_id=link.user_id,
                date=trade_date,
                broker_name=link.broker_name,
                net_pnl=round(pnl, 2),
                trade_count=0,
                win_rate=None,
            )
            db.add(broker_row)
        else:
            broker_row.net_pnl = round(pnl, 2)
        await db.flush()

        record = await _recalculate_daily_record(db, link.user, trade_date)
        if record is not None:
            records.append(record)

    return records

