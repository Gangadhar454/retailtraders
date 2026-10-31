"""
Simulation Engine for NetPnL / RetailTraders.

Manages the 130-trader persistent cohort, backfilled historical equity curves,
live market-hours staggered posting, and instant admin burst triggers.
"""
from __future__ import annotations

import logging
import random
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import BrokerName, LinkedBroker, PnLRecord, PnLSource, User, utcnow
from app.core.security import hash_password
from app.simulation.cohort import PERSONAS, Persona

logger = logging.getLogger("netpnl.simulation")

# Indian Standard Time offset (+05:30)
IST = timezone(timedelta(hours=5, minutes=30))

# Official Launch Date of RetailTraders (Oct 25, 2026)
LAUNCH_DATE = date(2026, 10, 25)

# Authentic Indian trader session notes
AUTHENTIC_NOTES = {
    "loss_small": [
        "Small SL hit in BankNifty morning range. Closed system.",
        "1 trade, 1 SL. Discipline kept intact.",
        "Market was choppy, gave back morning gains. Flat to small red.",
        "Trailed SL got triggered on a sharp pullback.",
        "Tight risk management today. -1R.",
    ],
    "loss_medium": [
        "Overtraded in 24500 CE. Need to work on emotional control.",
        "Hero-zero expiry trade went straight to zero as usual.",
        "Revenge traded after first SL. Costly mistake.",
        "Fought the trend today. Bad execution on Bank Nifty.",
        "Held onto losing position hoping for a V-shape reversal.",
        "Decay ate up option buyers in the afternoon session.",
    ],
    "loss_large": [
        "Brutal expiry day. Sized up too much on the breakdown.",
        "Worst trading session this month. Breached daily loss limit.",
        "Averaged down on losing calls. Hard lesson learned.",
        "Zero risk management today. Stepping away from screen for 2 days.",
    ],
    "profit_modest": [
        "Clean 1:2 RR on Nifty morning 15-min opening range breakout.",
        "2 trades, both green. Locked profit and shut terminal.",
        "VWAP bounce trade worked well. Booked at first resistance.",
        "Quick morning scalp on Bank Nifty opening bell.",
        "Followed trading rules: 1 lot, strict stop loss, green day.",
    ],
    "profit_good": [
        "Rode the afternoon trend in Nifty. Great risk reward today.",
        "Expiry gamma spike favored long calls. Partial booked.",
        "Patiently waited for the 2 PM breakout. Beautiful move.",
        "Big trend day. Let the winner run till 3:15 PM.",
    ],
}


def now_ist() -> datetime:
    """Current time in Indian Standard Time."""
    return datetime.now(IST)


def is_market_open_ist() -> bool:
    """Checks if current IST time falls within NSE/BSE market hours (09:15 to 15:45 Mon-Fri)."""
    current = now_ist()
    # Monday = 0, Friday = 4, Saturday = 5, Sunday = 6
    if current.weekday() >= 5:
        return False
    market_open = time(9, 15)
    market_close = time(15, 45)
    return market_open <= current.time() <= market_close


def _generate_pnl(
    archetype: str,
    is_large_event: bool = False,
    note_probability: float = 0.10,
) -> tuple[float, int, str | None]:
    """
    Generates realistic P&L amount, trade count, and authentic notes based on trader archetype.
    By default, only ~10% of trades include a note/comment, reflecting authentic retail trader behavior.
    """
    has_note = random.random() < note_probability
    note: str | None = None

    if archetype == "options_seller":
        # 68% win rate, steady small greens, occasional loss
        is_profit = random.random() < 0.68
        if is_profit:
            pnl = round(random.uniform(1200, 9500), 2)
            trades = random.randint(2, 6)
            if has_note:
                note = random.choice(AUTHENTIC_NOTES["profit_modest"])
        else:
            pnl = round(-random.uniform(2500, 16000), 2)
            trades = random.randint(2, 6)
            if has_note:
                note = random.choice(AUTHENTIC_NOTES["loss_small"] + AUTHENTIC_NOTES["loss_medium"])

    elif archetype == "scalper":
        # 52% win rate, tight stops, modest numbers
        is_profit = random.random() < 0.52
        trades = random.randint(3, 10)
        if is_profit:
            pnl = round(random.uniform(900, 6800), 2)
            if has_note:
                note = random.choice(AUTHENTIC_NOTES["profit_modest"])
        else:
            pnl = round(-random.uniform(700, 4800), 2)
            if has_note:
                note = random.choice(AUTHENTIC_NOTES["loss_small"])

    elif archetype == "expiry_gambler":
        # High volatility, loss-heavy, occasional windfall or Hall of Pain
        is_profit = random.random() < 0.22
        trades = random.randint(6, 32)
        if is_profit:
            pnl = round(random.uniform(8000, 52000), 2)
            if has_note:
                note = random.choice(AUTHENTIC_NOTES["profit_good"])
        else:
            if is_large_event and random.random() < 0.15:
                # Hall of pain loss
                pnl = round(-random.uniform(45000, 140000), 2)
                if has_note:
                    note = random.choice(AUTHENTIC_NOTES["loss_large"])
            else:
                pnl = round(-random.uniform(3500, 26000), 2)
                if has_note:
                    note = random.choice(AUTHENTIC_NOTES["loss_medium"])

    elif archetype == "swing_trader":
        # Lower trade count, balanced
        is_profit = random.random() < 0.48
        trades = random.randint(1, 3)
        if is_profit:
            pnl = round(random.uniform(3000, 18000), 2)
            if has_note:
                note = "Positional target achieved. Trailed SL."
        else:
            pnl = round(-random.uniform(2000, 11000), 2)
            if has_note:
                note = "Swing stop loss hit at key support."

    else:
        # Default options_buyer: ~86% loss rate (reflects SEBI retail realities)
        is_profit = random.random() < 0.14
        trades = random.randint(4, 22)
        if is_profit:
            pnl = round(random.uniform(1800, 24000), 2)
            if has_note:
                note = random.choice(AUTHENTIC_NOTES["profit_modest"] + AUTHENTIC_NOTES["profit_good"])
        else:
            if random.random() < 0.08:
                pnl = round(-random.uniform(25000, 65000), 2)
                if has_note:
                    note = random.choice(AUTHENTIC_NOTES["loss_large"])
            elif random.random() < 0.40:
                pnl = round(-random.uniform(5000, 18000), 2)
                if has_note:
                    note = random.choice(AUTHENTIC_NOTES["loss_medium"])
            else:
                pnl = round(-random.uniform(800, 4500), 2)
                if has_note:
                    note = random.choice(AUTHENTIC_NOTES["loss_small"])

    return pnl, trades, note


INTRADAY_NOTES = {
    "profit": [
        "Added a second scalp on BankNifty retest.",
        "Afternoon momentum breakout worked well.",
        "Trailing stop loss locked in gains.",
        "Booked remaining lots at resistance 2.",
        "Locked profit on second entry and closed screens.",
    ],
    "loss": [
        "Gave back some morning profits on false breakout.",
        "SL hit on afternoon reversal. Done for the day.",
        "Choppy post-lunch session. Trailed SL triggered.",
        "Overtraded in expiry afternoon. Shutting terminal.",
        "Fought the 2 PM reversal. Small red day now.",
    ],
}


def _generate_intraday_delta(
    archetype: str,
    current_pnl: float,
    current_trades: int,
    note_probability: float = 0.10,
) -> tuple[float, int, str | None]:
    """Generates an authentic intraday P&L adjustment, extra trades, and optional note."""
    has_note = random.random() < note_probability
    note: str | None = None

    if archetype == "options_seller":
        is_profit = random.random() < 0.70
        trades = 1 if current_trades >= 12 else random.randint(1, 2)
        if is_profit:
            delta = round(random.uniform(400, 2200), 2)
            if has_note:
                note = "Theta decay working nicely into the afternoon."
        else:
            delta = round(-random.uniform(800, 3800), 2)
            if has_note:
                note = "Adjusted leg after sudden index move."

    elif archetype == "scalper":
        is_profit = random.random() < 0.50
        trades = 1 if current_trades >= 20 else random.randint(1, 3)
        if is_profit:
            delta = round(random.uniform(350, 2000), 2)
            if has_note:
                note = random.choice(INTRADAY_NOTES["profit"])
        else:
            delta = round(-random.uniform(400, 1800), 2)
            if has_note:
                note = random.choice(INTRADAY_NOTES["loss"])

    elif archetype == "expiry_gambler":
        is_profit = random.random() < 0.25
        trades = 1 if current_trades >= 35 else random.randint(2, 6)
        if is_profit:
            delta = round(random.uniform(3500, 22000), 2)
            if has_note:
                note = "Zero-hero call doubled into the close."
        else:
            delta = round(-random.uniform(2500, 18000), 2)
            if has_note:
                note = "Out-of-the-money premium decayed to zero."

    elif archetype == "swing_trader":
        is_profit = random.random() < 0.50
        trades = 0 if current_trades >= 4 else 1
        delta = round(random.uniform(500, 1800), 2) if is_profit else round(-random.uniform(400, 1400), 2)
        if has_note:
            note = "Partial profit booked on swing basket."

    else:
        # Default options_buyer
        is_profit = random.random() < 0.20
        trades = 1 if current_trades >= 22 else random.randint(1, 4)
        if is_profit:
            delta = round(random.uniform(1200, 7500), 2)
            if has_note:
                note = random.choice(INTRADAY_NOTES["profit"])
        else:
            delta = round(-random.uniform(1500, 8500), 2)
            if has_note:
                note = random.choice(INTRADAY_NOTES["loss"])

    return delta, trades, note


async def ensure_cohort_seeded(db: AsyncSession) -> int:
    """
    Ensures all 130 persistent personas exist in the `users` table with `is_simulated = True`.
    Persona creation dates and trading session history strictly start from LAUNCH_DATE (Oct 25, 2026).
    """
    # 0. Clean up any legacy records prior to LAUNCH_DATE
    legacy_recs = await db.execute(select(PnLRecord).where(PnLRecord.date < LAUNCH_DATE))
    legacy_list = list(legacy_recs.scalars().all())
    if legacy_list:
        for lr in legacy_list:
            await db.delete(lr)
        await db.commit()
        logger.info("Purged %d legacy records prior to launch date %s", len(legacy_list), LAUNCH_DATE)

    # Fetch existing simulated users
    result = await db.execute(select(User).where(User.is_simulated.is_(True)))
    existing_users = {u.username: u for u in result.scalars().all()}

    dummy_hash = hash_password("SimulatedCohortAccount123!")
    users_created = 0

    # 1. Create missing personas with created_at on Oct 25, 2026
    for p in PERSONAS:
        if p["username"] not in existing_users:
            created_hour = random.randint(8, 18)
            created_minute = random.randint(0, 59)
            user_created_at = datetime(
                LAUNCH_DATE.year,
                LAUNCH_DATE.month,
                LAUNCH_DATE.day,
                created_hour,
                created_minute,
                tzinfo=timezone.utc,
            )
            user = User(
                user_id=uuid.uuid4(),
                email=f"{p['username']}@community.retailtraders.in",
                password_hash=dummy_hash,
                display_name=p["display_name"],
                username=p["username"],
                bio=p["bio"],
                avatar_seed=p["avatar_seed"],
                verified_upi_id=p["upi_id"],
                upi_verified_name=p["display_name"] if p["upi_id"] else None,
                upi_verification_status="VERIFIED" if p["upi_id"] else "UNVERIFIED",
                is_active=True,
                is_simulated=True,
                created_at=user_created_at,
            )
            db.add(user)
            existing_users[p["username"]] = user
            users_created += 1

    if users_created:
        await db.commit()
        logger.info("Created %d persistent simulated users (launch date %s)", users_created, LAUNCH_DATE)

    # 2. Backfill realistic history strictly from LAUNCH_DATE (Oct 25, 2026) up to yesterday
    yesterday = date.today() - timedelta(days=1)
    trading_days: list[date] = []
    curr = LAUNCH_DATE
    while curr <= yesterday:
        if curr.weekday() < 5:  # Mon to Fri
            trading_days.append(curr)
        curr += timedelta(days=1)

    records_created = 0
    persona_map = {p["username"]: p for p in PERSONAS}

    # Ensure linked broker accounts exist for verified personas
    for username, user in existing_users.items():
        persona_info = persona_map.get(username)
        if not persona_info or not persona_info.get("verified_broker"):
            continue

        broker_str = persona_info["verified_broker"]
        broker_enum = BrokerName.UPSTOX if broker_str == "Upstox" else BrokerName.ANGEL_ONE

        # Check existing link
        link_res = await db.execute(
            select(LinkedBroker).where(
                and_(
                    LinkedBroker.user_id == user.user_id,
                    LinkedBroker.broker_name == broker_enum,
                )
            )
        )
        if not link_res.scalars().first():
            link = LinkedBroker(
                link_id=uuid.uuid4(),
                user_id=user.user_id,
                broker_name=broker_enum,
                broker_user_id=f"SIM_{user.username[:8].upper()}",
                broker_legal_name=user.display_name,
                is_active=True,
                created_at=user.created_at,
            )
            db.add(link)

    for username, user in existing_users.items():
        persona_info = persona_map.get(username)
        if not persona_info:
            continue

        # Check existing records for this user
        rec_res = await db.execute(
            select(PnLRecord.date).where(PnLRecord.user_id == user.user_id)
        )
        existing_dates = set(rec_res.scalars().all())

        for t_day in trading_days:
            if t_day in existing_dates:
                continue

            # Check if this persona traded on this day
            if random.random() > persona_info["activity_prob"]:
                continue

            pnl, trades, note = _generate_pnl(persona_info["archetype"], note_probability=0.10)
            # Generate realistic timestamp during market hours for that day
            hour = random.randint(9, 15)
            minute = random.randint(15, 55)
            created_dt = datetime(t_day.year, t_day.month, t_day.day, hour, minute, tzinfo=IST)

            # 40% verified logic
            is_verified_trader = bool(persona_info.get("verified_broker"))
            record_verified = is_verified_trader and (random.random() < 0.88)
            broker_name_str = persona_info.get("verified_broker") if record_verified else None
            source_enum = (
                PnLSource.UPSTOX
                if broker_name_str == "Upstox"
                else PnLSource.ANGEL_ONE
                if broker_name_str == "Angel One"
                else PnLSource.MANUAL
            )

            rec = PnLRecord(
                record_id=uuid.uuid4(),
                user_id=user.user_id,
                date=t_day,
                net_pnl=pnl,
                is_verified=record_verified,
                broker_source=broker_name_str,
                source=source_enum,
                has_manual_entry=not record_verified,
                manual_net_pnl=None if record_verified else pnl,
                trade_count=trades,
                notes=note,
                is_simulated=True,
                created_at=created_dt.astimezone(timezone.utc),
            )
            db.add(rec)
            records_created += 1

    if records_created:
        await db.commit()
        logger.info("Backfilled %d historical records for simulated cohort", records_created)

    # Normalize notes ratio in existing simulated records to ~10%
    sim_records_with_notes = (
        await db.scalars(
            select(PnLRecord).where(
                and_(
                    PnLRecord.is_simulated.is_(True),
                    PnLRecord.notes.is_not(None),
                )
            )
        )
    ).all()
    total_sim_count = await db.scalar(
        select(func.count(PnLRecord.record_id)).where(PnLRecord.is_simulated.is_(True))
    )
    if total_sim_count and len(sim_records_with_notes) > 0:
        ratio = len(sim_records_with_notes) / total_sim_count
        if ratio > 0.15:
            target_keep = max(1, int(total_sim_count * 0.10))
            to_clear_count = len(sim_records_with_notes) - target_keep
            if to_clear_count > 0:
                to_clear = random.sample(list(sim_records_with_notes), to_clear_count)
                for r in to_clear:
                    r.notes = None
                await db.commit()
                logger.info(
                    "Normalized simulated notes: cleared %d notes to achieve ~10%% comment ratio",
                    to_clear_count,
                )

    return len(existing_users)


async def trigger_burst(db: AsyncSession, count: int = 5) -> list[dict[str, Any]]:
    """
    Publishes or updates `count` realistic sessions from the persistent 130-cohort.
    Supports both initial publishes for unposted traders and live intraday trade updates
    for active traders, keeping the Live Tape buzzing dynamically.
    """
    await ensure_cohort_seeded(db)

    today = date.today()
    now_utc = datetime.now(timezone.utc)
    persona_map = {p["username"]: p for p in PERSONAS}
    created_entries: list[dict[str, Any]] = []

    # 1. Check for unposted simulated users today
    subq = select(PnLRecord.user_id).where(PnLRecord.date == today)
    query_unposted = (
        select(User)
        .where(
            and_(
                User.is_simulated.is_(True),
                User.user_id.not_in(subq),
            )
        )
    )
    res_unposted = await db.execute(query_unposted)
    available_users = list(res_unposted.scalars().all())

    # 2. Check for existing simulated records today (for intraday updates)
    query_existing = (
        select(PnLRecord)
        .join(User, PnLRecord.user_id == User.user_id)
        .options(selectinload(PnLRecord.user))
        .where(
            and_(
                PnLRecord.date == today,
                PnLRecord.is_simulated.is_(True),
            )
        )
    )
    res_existing = await db.execute(query_existing)
    existing_records = list(res_existing.scalars().all())

    # Decide allocation between initial publishes and intraday updates
    unposted_to_take = 0
    if available_users:
        if not existing_records:
            unposted_to_take = min(count, len(available_users))
        else:
            # 75% initial publishes, remainder intraday updates
            target_unposted = max(1, int(count * 0.75))
            unposted_to_take = min(target_unposted, len(available_users))
            if count - unposted_to_take > len(existing_records):
                unposted_to_take = min(count - len(existing_records), len(available_users))

    updates_to_take = count - unposted_to_take
    if updates_to_take > 0 and not existing_records:
        unposted_to_take = min(count, len(available_users))
        updates_to_take = 0

    # A. Initial posts for selected unposted users
    if unposted_to_take > 0:
        selected_unposted = random.sample(available_users, unposted_to_take)
        for user in selected_unposted:
            persona_info = persona_map.get(user.username, {
                "archetype": "options_buyer",
                "display_name": user.display_name,
            })

            pnl, trades, note = _generate_pnl(persona_info["archetype"], is_large_event=True, note_probability=0.10)

            # 40% verified logic based on persona
            is_verified_trader = bool(persona_info.get("verified_broker"))
            record_verified = is_verified_trader and (random.random() < 0.90)
            broker_name_str = persona_info.get("verified_broker") if record_verified else None
            source_enum = (
                PnLSource.UPSTOX
                if broker_name_str == "Upstox"
                else PnLSource.ANGEL_ONE
                if broker_name_str == "Angel One"
                else PnLSource.MANUAL
            )

            record = PnLRecord(
                record_id=uuid.uuid4(),
                user_id=user.user_id,
                date=today,
                net_pnl=pnl,
                is_verified=record_verified,
                broker_source=broker_name_str,
                source=source_enum,
                has_manual_entry=not record_verified,
                manual_net_pnl=None if record_verified else pnl,
                trade_count=trades,
                notes=note,
                is_simulated=True,
                created_at=now_utc,
                updated_at=now_utc,
            )
            db.add(record)

            created_entries.append({
                "record_id": str(record.record_id),
                "username": user.username,
                "display_name": user.display_name,
                "net_pnl": pnl,
                "is_verified": record_verified,
                "broker_source": broker_name_str,
                "trade_count": trades,
                "notes": note,
                "date": str(today),
                "created_at": now_utc.isoformat(),
                "is_update": False,
            })

    # B. Intraday progression updates for existing records
    if updates_to_take > 0 and existing_records:
        selected_existing = random.sample(existing_records, min(updates_to_take, len(existing_records)))
        for rec in selected_existing:
            user = rec.user
            persona_info = persona_map.get(user.username, {
                "archetype": "options_buyer",
                "display_name": user.display_name,
            })

            delta, extra_trades, note = _generate_intraday_delta(
                persona_info["archetype"],
                rec.net_pnl,
                rec.trade_count,
                note_probability=0.10,
            )

            rec.trade_count += extra_trades
            rec.net_pnl = round(rec.net_pnl + delta, 2)
            if rec.has_manual_entry:
                rec.manual_net_pnl = rec.net_pnl
            if note:
                rec.notes = note
            rec.created_at = now_utc
            rec.updated_at = now_utc

            created_entries.append({
                "record_id": str(rec.record_id),
                "username": user.username,
                "display_name": user.display_name,
                "net_pnl": rec.net_pnl,
                "is_verified": rec.is_verified,
                "broker_source": rec.broker_source,
                "trade_count": rec.trade_count,
                "notes": rec.notes,
                "date": str(today),
                "created_at": now_utc.isoformat(),
                "is_update": True,
            })

    if created_entries:
        await db.commit()
        logger.info("Triggered burst/update of %d simulated trades", len(created_entries))

    return created_entries


async def get_admin_metrics(db: AsyncSession) -> dict[str, Any]:
    """
    Computes both Daily (Today) and Total Cumulative (All-Time) statistics,
    clearly separating real users from simulated cohort.
    """
    today = date.today()

    # 1. User stats
    total_users = await db.scalar(select(func.count(User.user_id))) or 0
    real_users_total = await db.scalar(
        select(func.count(User.user_id)).where(User.is_simulated.is_(False))
    ) or 0
    sim_users_total = await db.scalar(
        select(func.count(User.user_id)).where(User.is_simulated.is_(True))
    ) or 0

    # New users created today
    start_today = datetime.combine(today, time.min, tzinfo=timezone.utc)
    real_users_today = await db.scalar(
        select(func.count(User.user_id)).where(
            and_(
                User.is_simulated.is_(False),
                User.created_at >= start_today,
            )
        )
    ) or 0

    # 2. Today's Postings
    today_records = (
        await db.execute(
            select(
                func.count(PnLRecord.record_id).label("total"),
                func.sum(case((PnLRecord.is_simulated.is_(False), 1), else_=0)).label("real"),
                func.sum(
                    case(
                        (
                            and_(
                                PnLRecord.is_simulated.is_(False),
                                or_manual := (PnLRecord.is_verified.is_(False) | PnLRecord.has_manual_entry.is_(True)),
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ).label("real_manual"),
                func.sum(
                    case(
                        (
                            and_(
                                PnLRecord.is_simulated.is_(False),
                                PnLRecord.is_verified.is_(True),
                                PnLRecord.has_manual_entry.is_(False),
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ).label("real_verified"),
                func.sum(case((PnLRecord.is_simulated.is_(True), 1), else_=0)).label("sim"),
            ).where(PnLRecord.date == today)
        )
    ).first()

    today_total = today_records.total if today_records and today_records.total else 0
    today_real = today_records.real if today_records and today_records.real else 0
    today_real_manual = today_records.real_manual if today_records and today_records.real_manual else 0
    today_real_verified = today_records.real_verified if today_records and today_records.real_verified else 0
    today_sim = today_records.sim if today_records and today_records.sim else 0

    # 3. All-Time Cumulative Postings
    all_records = (
        await db.execute(
            select(
                func.count(PnLRecord.record_id).label("total"),
                func.sum(case((PnLRecord.is_simulated.is_(False), 1), else_=0)).label("real"),
                func.sum(
                    case(
                        (
                            and_(
                                PnLRecord.is_simulated.is_(False),
                                (PnLRecord.is_verified.is_(False) | PnLRecord.has_manual_entry.is_(True)),
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ).label("real_manual"),
                func.sum(
                    case(
                        (
                            and_(
                                PnLRecord.is_simulated.is_(False),
                                PnLRecord.is_verified.is_(True),
                                PnLRecord.has_manual_entry.is_(False),
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ).label("real_verified"),
                func.sum(case((PnLRecord.is_simulated.is_(True), 1), else_=0)).label("sim"),
            )
        )
    ).first()

    all_total = all_records.total if all_records and all_records.total else 0
    all_real = all_records.real if all_records and all_records.real else 0
    all_real_manual = all_records.real_manual if all_records and all_records.real_manual else 0
    all_real_verified = all_records.real_verified if all_records and all_records.real_verified else 0
    all_sim = all_records.sim if all_records and all_records.sim else 0

    return {
        "date": str(today),
        "is_market_open": is_market_open_ist() or settings.simulation_all_hours,
        "simulation_enabled": settings.simulation_enabled,
        "daily": {
            "total_users": total_users,
            "new_real_users": real_users_today,
            "total_posts": int(today_total),
            "real_posts": int(today_real),
            "real_manual_posts": int(today_real_manual),
            "real_verified_posts": int(today_real_verified),
            "simulated_posts": int(today_sim),
        },
        "cumulative": {
            "total_users": total_users,
            "total_real_users": real_users_total,
            "total_simulated_users": sim_users_total,
            "total_posts": int(all_total),
            "real_posts": int(all_real),
            "real_manual_posts": int(all_real_manual),
            "real_verified_posts": int(all_real_verified),
            "simulated_posts": int(all_sim),
        },
    }


async def purge_simulated_data(db: AsyncSession) -> dict[str, int]:
    """
    Safely wipes all simulated records and users from the database.
    Real user data is 100% untouched.
    """
    # Delete records first
    res_rec = await db.execute(
        select(PnLRecord.record_id).where(PnLRecord.is_simulated.is_(True))
    )
    rec_ids = res_rec.scalars().all()
    for rid in rec_ids:
        r = await db.get(PnLRecord, rid)
        if r:
            await db.delete(r)

    # Delete users
    res_u = await db.execute(
        select(User.user_id).where(User.is_simulated.is_(True))
    )
    u_ids = res_u.scalars().all()
    for uid in u_ids:
        u = await db.get(User, uid)
        if u:
            await db.delete(u)

    await db.commit()
    logger.info("Purged %d simulated records and %d simulated users", len(rec_ids), len(u_ids))
    return {
        "deleted_records": len(rec_ids),
        "deleted_users": len(u_ids),
    }
