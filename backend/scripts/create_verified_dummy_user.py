from __future__ import annotations

import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models import BrokerName, BrokerPnLDaily, LinkedBroker, PnLRecord, PnLSource, User


async def create_dummy_user():
    username = "verified_pro"
    email = "verified_pro@example.com"
    display_name = "Verified Pro Trader"
    plain_password = "Password123!"

    async with AsyncSessionLocal() as session:
        # Check if user already exists
        user = await session.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                user_id=uuid.uuid4(),
                email=email,
                username=username,
                display_name=display_name,
                password_hash=hash_password(plain_password),
                bio="100% verified algorithmic & momentum trades.",
                avatar_seed=username,
                is_active=True,
                verified_upi_id="verifiedpro@okhdfcbank",
                upi_verified_name=display_name,
                upi_verification_status="VERIFIED",
                upi_verified_at=datetime.now(timezone.utc) - timedelta(days=5),
                created_at=datetime.now(timezone.utc) - timedelta(days=10),
            )
            session.add(user)
            await session.flush()
            print(f"[+] Created user {user.username} ({user.email}) id={user.user_id}")
        else:
            print(f"[*] Found existing user {user.username} ({user.email}) id={user.user_id}")
            user.verified_upi_id = "verifiedpro@okhdfcbank"
            user.upi_verified_name = display_name
            user.upi_verification_status = "VERIFIED"
            user.upi_verified_at = datetime.now(timezone.utc) - timedelta(days=5)
            # Reset existing PnL and BrokerPnLDaily rows for this user
            await session.execute(delete(BrokerPnLDaily).where(BrokerPnLDaily.user_id == user.user_id))
            await session.execute(delete(PnLRecord).where(PnLRecord.user_id == user.user_id))
            await session.flush()

        # Ensure linked broker exists
        link = await session.scalar(
            select(LinkedBroker).where(
                LinkedBroker.user_id == user.user_id,
                LinkedBroker.broker_name == BrokerName.ANGEL_ONE,
            )
        )
        if link is None:
            link = LinkedBroker(
                link_id=uuid.uuid4(),
                user_id=user.user_id,
                broker_name=BrokerName.ANGEL_ONE,
                broker_legal_name="Verified Pro Trader",
                broker_user_id="K56352512",
                is_active=True,
                created_at=datetime.now(timezone.utc) - timedelta(days=5),
            )
            session.add(link)
            await session.flush()
            print(f"[+] Linked Angel One broker to user")

        # 5 days of verified PnL records including today
        today = date.today()
        pnl_data = [
            (today - timedelta(days=4), 35400.00, 8, 75.0),
            (today - timedelta(days=3), 21850.50, 11, 63.6),
            (today - timedelta(days=2), 48900.00, 14, 78.6),
            (today - timedelta(days=1), 16750.00, 9, 66.7),
            (today, -18500.00, 12, 33.3),
        ]

        total_net_pnl = 0.0
        for day_date, net_pnl, trade_count, win_rate in pnl_data:
            total_net_pnl += net_pnl
            # 1. Broker daily fetch record
            broker_daily = BrokerPnLDaily(
                id=uuid.uuid4(),
                user_id=user.user_id,
                date=day_date,
                broker_name=BrokerName.ANGEL_ONE,
                net_pnl=net_pnl,
                trade_count=trade_count,
                win_rate=win_rate,
                fetched_at=datetime.combine(day_date, datetime.min.time(), tzinfo=timezone.utc)
                + timedelta(hours=15, minutes=30),
            )
            session.add(broker_daily)

            # 2. Daily PnLRecord (marked verified, no manual entry)
            pnl_record = PnLRecord(
                record_id=uuid.uuid4(),
                user_id=user.user_id,
                date=day_date,
                net_pnl=net_pnl,
                is_verified=True,
                broker_source="Angel One",
                source=PnLSource.ANGEL_ONE,
                trade_count=trade_count,
                win_rate=win_rate,
                manual_net_pnl=None,
                manual_trade_count=0,
                has_manual_entry=False,
                created_at=datetime.combine(day_date, datetime.min.time(), tzinfo=timezone.utc)
                + timedelta(hours=15, minutes=35),
            )
            session.add(pnl_record)
            print(f"  - {day_date}: Net PnL = INR {net_pnl:,.2f} | Verified: True | Trades: {trade_count}")

        await session.commit()
        print(f"\n[+] Successfully created 5 verified days for {user.username}!")
        print(f"    Total 5-day Verified P&L: INR {total_net_pnl:,.2f}")
        print(f"    Login credentials:")
        print(f"      Email: {email}")
        print(f"      Password: {plain_password}")


if __name__ == "__main__":
    asyncio.run(create_dummy_user())
