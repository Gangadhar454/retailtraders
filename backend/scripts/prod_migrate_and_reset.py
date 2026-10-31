import asyncio
from app.core.database import engine, AsyncSessionLocal
from sqlalchemy import text, delete, func, select
from app.models import User, LinkedBroker, PnLRecord, BrokerPnLDaily, OAuthState, UpiVerification
from app.simulation.engine import LAUNCH_DATE, ensure_cohort_seeded, trigger_burst, get_admin_metrics

async def main():
    print("Step 1: Adding is_simulated columns to MySQL tables if missing...")
    async with engine.connect() as conn:
        for tbl in ["users", "linked_brokers", "pnl_records"]:
            try:
                await conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN is_simulated BOOLEAN DEFAULT FALSE"))
                await conn.commit()
                print(f"Added is_simulated column to {tbl}")
            except Exception as e:
                print(f"{tbl}: {e}")

    print("\nStep 2: Wiping prior records for fresh start...")
    async with AsyncSessionLocal() as db:
        await db.execute(delete(PnLRecord))
        await db.execute(delete(BrokerPnLDaily))
        await db.execute(delete(LinkedBroker))
        await db.execute(delete(OAuthState))
        await db.execute(delete(UpiVerification))
        await db.execute(delete(User))
        await db.commit()
        print("Database wiped clean.")

        print(f"\nStep 3: Seeding 627 persistent cohort strictly from Launch Date ({LAUNCH_DATE})...")
        total_seeded = await ensure_cohort_seeded(db)
        print(f"Cohort seeded: {total_seeded} personas created.")

        print("\nStep 4: Triggering initial burst for today...")
        burst_entries = await trigger_burst(db, count=25)
        print(f"Published {len(burst_entries)} trades for today.")

        min_u = await db.scalar(select(func.min(User.created_at)))
        max_u = await db.scalar(select(func.max(User.created_at)))
        min_p = await db.scalar(select(func.min(PnLRecord.date)))
        max_p = await db.scalar(select(func.max(PnLRecord.date)))
        tot_p = await db.scalar(select(func.count(PnLRecord.record_id)))

        print(f"\nVerification:")
        print(f"User created: {min_u} to {max_u}")
        print(f"P&L dates:    {min_p} to {max_p}")
        print(f"Total posts:  {tot_p}")

asyncio.run(main())

