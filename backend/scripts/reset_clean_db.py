"""
Resets the database completely to a clean slate and seeds the 130 persistent cohort
with trading history strictly starting from LAUNCH_DATE (October 25, 2026).
"""
import asyncio
import os
import sys

# Ensure backend directory is in sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

from sqlalchemy import delete, func, select
from app.core.database import AsyncSessionLocal, init_models
from app.models import BrokerPnLDaily, LinkedBroker, OAuthState, PnLRecord, UpiVerification, User
from app.simulation.engine import LAUNCH_DATE, ensure_cohort_seeded, trigger_burst, get_admin_metrics


async def main():
    print("=" * 60)
    print("  NETPNL FRESH DATABASE RESET & LAUNCH-DATE SEEDER (OCT 25)")
    print("=" * 60)

    await init_models()

    async with AsyncSessionLocal() as db:
        print("\n1. Purging all existing users, posts, and broker records...")
        await db.execute(delete(PnLRecord))
        await db.execute(delete(BrokerPnLDaily))
        await db.execute(delete(LinkedBroker))
        await db.execute(delete(OAuthState))
        await db.execute(delete(UpiVerification))
        await db.execute(delete(User))
        await db.commit()
        print("   [OK] Database completely cleaned to 0 users and 0 posts.")

        print(f"\n2. Seeding 130 persistent cohort strictly from Launch Date ({LAUNCH_DATE})...")
        total_seeded = await ensure_cohort_seeded(db)
        print(f"   [OK] Cohort seeded: {total_seeded} authentic Indian personas created.")

        print("\n3. Triggering initial burst for today's live session...")
        burst_entries = await trigger_burst(db, count=25)
        print(f"   [OK] Published {len(burst_entries)} trades for today.")

        print("\n4. Verifying database integrity & date boundaries:")
        min_user_created = await db.scalar(select(func.min(User.created_at)))
        max_user_created = await db.scalar(select(func.max(User.created_at)))
        min_pnl_date = await db.scalar(select(func.min(PnLRecord.date)))
        max_pnl_date = await db.scalar(select(func.max(PnLRecord.date)))
        total_pnl_count = await db.scalar(select(func.count(PnLRecord.record_id)))
        notes_count = await db.scalar(select(func.count(PnLRecord.record_id)).where(PnLRecord.notes.is_not(None)))

        print(f"   * User Creation Date Range: {min_user_created} to {max_user_created}")
        print(f"   * P&L Record Date Range:    {min_pnl_date} to {max_pnl_date}")
        print(f"   * Total Posts in DB:        {total_pnl_count}")
        print(f"   * Posts with Comments:      {notes_count} ({round(notes_count / total_pnl_count * 100, 1)}%)")

        metrics = await get_admin_metrics(db)
        print("\n5. Telemetry Verification:")
        print(f"   * Total Users:              {metrics['cumulative']['total_users']}")
        print(f"   * All-Time Posts:           {metrics['cumulative']['total_posts']}")
        print(f"   * Today's Posts:            {metrics['daily']['total_posts']}")
        print("=" * 60)
        print("  [OK] FRESH DATABASE READY STRICTLY FROM OCT 25, 2026!")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
