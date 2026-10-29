from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Force test configuration
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-zero-pnl"
os.environ["UPI_PROVIDER"] = "mock"
os.environ["SYNC_ENABLED"] = "false"
os.environ["DEBUG"] = "false"

from fastapi.testclient import TestClient

from app.main import app
from app.models import BrokerName, BrokerPnLDaily, LinkedBroker, PnLRecord, User
from app.services.upstox import UpstoxSnapshot, UpstoxTrade
from app.services.zerodha import ZerodhaSnapshot
from app.services.pnl_sync import trading_day_for
from app.core.database import AsyncSessionLocal, init_models


class TestZeroPnLPrevention(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        asyncio.run(init_models())
        cls.client = TestClient(app)

    def test_unrealised_profit_zero_realised_rejected(self):
        email = f"trader_upstox_{int(datetime.now().timestamp())}@example.com"
        res = self.client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "Password123!",
                "display_name": "Upstox Trader",
            },
        )
        self.assertEqual(res.status_code, 201)
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Add an active linked broker in DB
        async def link_broker():
            async with AsyncSessionLocal() as db:
                from sqlalchemy import select
                user = await db.scalar(select(User).where(User.email == email))
                link = LinkedBroker(
                    user_id=user.user_id,
                    broker_name=BrokerName.UPSTOX,
                    auth_token="dummy-auth-token",
                    broker_legal_name="Upstox Trader",
                    broker_user_id="UP12345",
                    is_active=True,
                )
                db.add(link)
                await db.commit()

        asyncio.run(link_broker())

        # 1. Active trade with unrealised profit of ₹1,500 and realised P&L = 0.0
        snapshot_active_profit = UpstoxSnapshot(
            realized_pnl=0.0,
            unrealized_pnl=1500.0,
            trade_count=1,
            trades=[
                UpstoxTrade(
                    symbol="RELIANCE",
                    trade_date=datetime.now(timezone.utc),
                    pnl=0.0,
                )
            ],
        )

        with patch("app.services.upstox.UpstoxClient.fetch_snapshot", new=AsyncMock(return_value=snapshot_active_profit)):
            res = self.client.post("/api/v1/pnl/sync?broker=upstox", headers=headers)
            self.assertEqual(res.status_code, 400)
            detail = res.json().get("detail", "")
            self.assertIn("open with unrealised P&L", detail)
            self.assertIn("+₹1,500.00", detail)
            self.assertIn("trades are active", detail)

        # 2. Verify no zero PnL record was posted to leaderboard
        leaderboard_res = self.client.get("/api/v1/leaderboard/?mode=today")
        self.assertEqual(leaderboard_res.status_code, 200)
        entries = leaderboard_res.json().get("entries", [])
        self.assertEqual(len(entries), 0, "No zero P&L entry should be posted on the leaderboard")

        # 3. Simulate trades closed with realised P&L of +₹1,500.00
        snapshot_closed_trade = UpstoxSnapshot(
            realized_pnl=1500.0,
            unrealized_pnl=0.0,
            trade_count=2,
            trades=[
                UpstoxTrade(
                    symbol="RELIANCE",
                    trade_date=datetime.now(timezone.utc),
                    pnl=1500.0,
                )
            ],
        )

        with patch("app.services.upstox.UpstoxClient.fetch_snapshot", new=AsyncMock(return_value=snapshot_closed_trade)):
            res = self.client.post("/api/v1/pnl/sync?broker=upstox", headers=headers)
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["status"], "VERIFIED")
            self.assertEqual(data["broker_fetched_pnl"], 1500.0)
            self.assertEqual(data["record"]["net_pnl"], 1500.0)

        # 4. Verify now the entry DOES appear on the leaderboard
        leaderboard_res = self.client.get("/api/v1/leaderboard/?mode=today")
        self.assertEqual(leaderboard_res.status_code, 200)
        entries = leaderboard_res.json().get("entries", [])
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["net_pnl"], 1500.0)
        self.assertTrue(entries[0]["is_verified"])

    def test_zerodha_unrealised_loss_zero_realised_rejected(self):
        email = f"trader_zerodha_{int(datetime.now().timestamp())}@example.com"
        res = self.client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "Password123!",
                "display_name": "Zerodha Trader",
            },
        )
        self.assertEqual(res.status_code, 201)
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Add active Zerodha link
        async def link_zerodha():
            async with AsyncSessionLocal() as db:
                from sqlalchemy import select
                user = await db.scalar(select(User).where(User.email == email))
                link = LinkedBroker(
                    user_id=user.user_id,
                    broker_name=BrokerName.ZERODHA,
                    auth_token="dummy-kite-token",
                    broker_legal_name="Zerodha Trader",
                    broker_user_id="ZD12345",
                    is_active=True,
                )
                db.add(link)
                await db.commit()

        asyncio.run(link_zerodha())

        # Active trade in unrealised loss of -₹850.50 with 0 realised
        snapshot_zerodha_loss = ZerodhaSnapshot(
            realized_pnl=0.0,
            unrealized_pnl=-850.5,
            trade_count=1,
            trades=[],
        )

        with patch("app.services.zerodha.ZerodhaClient.fetch_snapshot", new=AsyncMock(return_value=snapshot_zerodha_loss)):
            res = self.client.post("/api/v1/pnl/sync?broker=zerodha", headers=headers)
            self.assertEqual(res.status_code, 400)
            detail = res.json().get("detail", "")
            self.assertIn("open with unrealised P&L", detail)
            self.assertIn("-₹850.50", detail)

    def test_zero_realised_and_zero_unrealised_rejected(self):
        email = f"trader_flat_{int(datetime.now().timestamp())}@example.com"
        res = self.client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "Password123!",
                "display_name": "Flat Trader",
            },
        )
        self.assertEqual(res.status_code, 201)
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        async def link():
            async with AsyncSessionLocal() as db:
                from sqlalchemy import select
                user = await db.scalar(select(User).where(User.email == email))
                link = LinkedBroker(
                    user_id=user.user_id,
                    broker_name=BrokerName.UPSTOX,
                    auth_token="dummy-auth-token-flat",
                    broker_legal_name="Flat Trader",
                    broker_user_id="FLAT123",
                    is_active=True,
                )
                db.add(link)
                await db.commit()

        asyncio.run(link())

        snapshot_zero = UpstoxSnapshot(
            realized_pnl=0.0,
            unrealized_pnl=0.0,
            trade_count=0,
            trades=[],
        )

        with patch("app.services.upstox.UpstoxClient.fetch_snapshot", new=AsyncMock(return_value=snapshot_zero)):
            res = self.client.post("/api/v1/pnl/sync?broker=upstox", headers=headers)
            self.assertEqual(res.status_code, 400)
            detail = res.json().get("detail", "")
            self.assertIn("No realised P&L to publish", detail)
            self.assertIn("₹0.00", detail)


if __name__ == "__main__":
    unittest.main()

