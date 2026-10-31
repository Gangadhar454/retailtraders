"""
CLI script to trigger an instant burst of simulated trades.

Usage:
    python backend/scripts/run_burst.py --count 5
"""
import argparse
import asyncio
import os
import sys

# Ensure backend directory is in sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

from app.core.database import AsyncSessionLocal
from app.simulation.engine import trigger_burst, get_admin_metrics


async def main(count: int):
    print(f"Triggering burst of {count} traders from cohort...")
    async with AsyncSessionLocal() as db:
        trades = await trigger_burst(db, count=count)
        print(f"Successfully published {len(trades)} trades today:")
        for t in trades:
            print(f"  * {t['display_name']} (@{t['username']}): Rs. {t['net_pnl']} | {t['notes']}")

        metrics = await get_admin_metrics(db)
        print("\nUpdated Today's Metrics:")
        print(f"  Total Posts: {metrics['daily']['total_posts']} (Real: {metrics['daily']['real_posts']}, Sim: {metrics['daily']['simulated_posts']})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Trigger instant simulated trade burst.")
    parser.add_argument("--count", type=int, default=5, help="Number of traders to burst (default: 5)")
    args = parser.parse_args()
    asyncio.run(main(args.count))

