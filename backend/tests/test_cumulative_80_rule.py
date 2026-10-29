from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-80-rule"
os.environ["UPI_PROVIDER"] = "mock"
os.environ["SYNC_ENABLED"] = "false"
os.environ["DEBUG"] = "false"

from fastapi.testclient import TestClient

from app.main import app
from app.models import BrokerName, BrokerPnLDaily, LinkedBroker, PnLRecord, PnLSource, User
from app.core.database import AsyncSessionLocal, init_models


class TestCumulative80Rule(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        asyncio.run(init_models())
        cls.client = TestClient(app)

    def test_80_percent_rule(self):
        # Create 3 users:
        # User A: 4 verified sessions (₹1,000 each = ₹4,000) + 1 manual session (₹500).
        #         Session ratio: 4/5 = 80%. Amount ratio: 4,000 / 4,500 = 88.9%.
        #         -> MUST BE VERIFIED.
        # User B: 4 verified sessions (₹100 each = ₹400) + 1 manual session (₹5,000).
        #         Session ratio: 4/5 = 80%. Amount ratio: 400 / 5,400 = 7.4% (< 80%).
        #         -> MUST BE UNVERIFIED (Self-reported).
        # User C: 1 verified session (₹10,000) + 1 manual session (₹200).
        #         Session ratio: 1/2 = 50% (< 80%). Amount ratio: 10,000 / 10,200 = 98%.
        #         -> MUST BE UNVERIFIED (Self-reported).

        async def setup_data():
            async with AsyncSessionLocal() as db:
                base_date = date(2026, 10, 1)

                # User A
                ua = User(email="user_a@example.com", username="user_a", display_name="User A", password_hash="hash")
                db.add(ua)
                await db.flush()
                for i in range(4):
                    db.add(PnLRecord(user_id=ua.user_id, date=base_date + timedelta(days=i), net_pnl=1000.0, is_verified=True, source=PnLSource.UPSTOX))
                db.add(PnLRecord(user_id=ua.user_id, date=base_date + timedelta(days=4), net_pnl=500.0, is_verified=False, source=PnLSource.MANUAL, has_manual_entry=True))

                # User B
                ub = User(email="user_b@example.com", username="user_b", display_name="User B", password_hash="hash")
                db.add(ub)
                await db.flush()
                for i in range(4):
                    db.add(PnLRecord(user_id=ub.user_id, date=base_date + timedelta(days=i), net_pnl=100.0, is_verified=True, source=PnLSource.UPSTOX))
                db.add(PnLRecord(user_id=ub.user_id, date=base_date + timedelta(days=4), net_pnl=5000.0, is_verified=False, source=PnLSource.MANUAL, has_manual_entry=True))

                # User C
                uc = User(email="user_c@example.com", username="user_c", display_name="User C", password_hash="hash")
                db.add(uc)
                await db.flush()
                db.add(PnLRecord(user_id=uc.user_id, date=base_date, net_pnl=10000.0, is_verified=True, source=PnLSource.UPSTOX))
                db.add(PnLRecord(user_id=uc.user_id, date=base_date + timedelta(days=1), net_pnl=200.0, is_verified=False, source=PnLSource.MANUAL, has_manual_entry=True))

                # User D: Losses verified (-1000 * 4 = 4000 volume verified), manual gain (+500 = 500 volume manual)
                # Session ratio: 4/5 = 80%. Amount ratio: 4000 / 4500 = 88.9%.
                # -> MUST BE VERIFIED
                ud = User(email="user_d@example.com", username="user_d", display_name="User D", password_hash="hash")
                db.add(ud)
                await db.flush()
                for i in range(4):
                    db.add(PnLRecord(user_id=ud.user_id, date=base_date + timedelta(days=i), net_pnl=-1000.0, is_verified=True, source=PnLSource.UPSTOX))
                db.add(PnLRecord(user_id=ud.user_id, date=base_date + timedelta(days=4), net_pnl=500.0, is_verified=False, source=PnLSource.MANUAL, has_manual_entry=True))

                # User E: Small verified gains (100 * 4 = 400 volume), large manual loss (-5000 = 5000 volume)
                # Session ratio: 4/5 = 80%. Amount ratio: 400 / 5400 = 7.4%.
                # -> MUST BE UNVERIFIED
                ue = User(email="user_e@example.com", username="user_e", display_name="User E", password_hash="hash")
                db.add(ue)
                await db.flush()
                for i in range(4):
                    db.add(PnLRecord(user_id=ue.user_id, date=base_date + timedelta(days=i), net_pnl=100.0, is_verified=True, source=PnLSource.UPSTOX))
                db.add(PnLRecord(user_id=ue.user_id, date=base_date + timedelta(days=4), net_pnl=-5000.0, is_verified=False, source=PnLSource.MANUAL, has_manual_entry=True))

                await db.commit()

        asyncio.run(setup_data())

        # Query all cumulative leaderboard entries
        res = self.client.get("/api/v1/leaderboard/?scope=cumulative&sort=best")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        entries = {e["user"]["display_name"]: e for e in data["entries"]}

        self.assertTrue(entries["User A"]["is_verified"], "User A has >=80% sessions and >=80% volume, should be verified")
        self.assertFalse(entries["User B"]["is_verified"], "User B has <80% volume, should be unverified")
        self.assertFalse(entries["User C"]["is_verified"], "User C has <80% sessions, should be unverified")
        self.assertTrue(entries["User D"]["is_verified"], "User D with verified losses has >=80% sessions and >=80% volume, should be verified")
        self.assertFalse(entries["User E"]["is_verified"], "User E with manual loss has <80% volume, should be unverified")

        # Test verified_only=true filter
        res_v = self.client.get("/api/v1/leaderboard/?scope=cumulative&sort=best&verified_only=true")
        self.assertEqual(res_v.status_code, 200)
        v_entries = [e["user"]["display_name"] for e in res_v.json()["entries"]]
        self.assertIn("User A", v_entries)
        self.assertNotIn("User B", v_entries)
        self.assertNotIn("User C", v_entries)
        self.assertIn("User D", v_entries)
        self.assertNotIn("User E", v_entries)

        # Test verified_only=false filter
        res_u = self.client.get("/api/v1/leaderboard/?scope=cumulative&sort=best&verified_only=false")
        self.assertEqual(res_u.status_code, 200)
        u_entries = [e["user"]["display_name"] for e in res_u.json()["entries"]]
        self.assertNotIn("User A", u_entries)
        self.assertIn("User B", u_entries)
        self.assertIn("User C", u_entries)
        self.assertNotIn("User D", u_entries)
        self.assertIn("User E", u_entries)


if __name__ == "__main__":
    unittest.main()
