"""
Deletes all PnL records for today (Saturday/weekend test session)
so the platform returns to a clean post-market state with history
strictly from Oct 26 to Friday Oct 30.
"""
import asyncio
import os
import sys
from datetime import date

# Ensure backend directory is in sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

from sqlalchemy import delete, func, select
from app.core.database import AsyncSessionLocal
from app.models import BrokerPnLDaily, PnLRecord, User
from app.simulation.engine import get_admin_metrics


async def main():
    today = date.today()
    print(f"Cleaning all posts for today ({today})...")
    async with AsyncSessionLocal() as db:
        res_pnl = await db.execute(delete(PnLRecord).where(PnLRecord.date == today))
        res_broker = await db.execute(delete(BrokerPnLDaily).where(BrokerPnLDaily.date == today))
        await db.commit()
        print(f"Deleted {res_pnl.rowcount} P&L records and {res_broker.rowcount} broker daily records for {today}.")

        tot_pnl = await db.scalar(select(func.count(PnLRecord.record_id)))
        tot_users = await db.scalar(select(func.count(User.user_id)))
        min_pnl = await db.scalar(select(func.min(PnLRecord.date)))
        max_pnl = await db.scalar(select(func.max(PnLRecord.date)))

        print("\nVerification:")
        print(f"  * Total Users in DB:    {tot_users}")
        print(f"  * Total Posts in DB:    {tot_pnl}")
        print(f"  * History Date Range:   {min_pnl} to {max_pnl}")

        metrics = await get_admin_metrics(db)
        print(f"  * Today's Posts:        {metrics['daily']['total_posts']}")
        print(f"  * Market Open Status:   {metrics['is_market_open']}")
        print("Done!")


if __name__ == "__main__":
    asyncio.run(main())

