from __future__ import annotations

import asyncio
import os
import sys
import unittest
import uuid

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, backend_dir)
site_packages = os.path.join(backend_dir, ".venv", "Lib", "site-packages")
if os.path.exists(site_packages) and site_packages not in sys.path:
    sys.path.insert(0, site_packages)

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-reactions"
os.environ["UPI_PROVIDER"] = "mock"
os.environ["SYNC_ENABLED"] = "false"
os.environ["DEBUG"] = "false"
os.environ["SIMULATION_ENABLED"] = "false"

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import init_models


class TestReactions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        asyncio.run(init_models())
        cls.client = TestClient(app)

    def _create_user_and_post(self, username: str, pnl: float = 5000.0) -> tuple[str, str]:
        email = f"{username}@test.com"
        reg = self.client.post(
            "/api/v1/auth/register",
            json={"email": email, "username": username, "password": "Password123!", "display_name": username.title()},
        )
        self.assertEqual(reg.status_code, 201)
        token = reg.json()["access_token"]

        # Create a manual PnL record
        pnl_res = self.client.post(
            "/api/v1/pnl/",
            headers={"Authorization": f"Bearer {token}"},
            json={"net_pnl": pnl, "trade_count": 5, "notes": f"Trade by {username}"},
        )
        self.assertEqual(pnl_res.status_code, 201)
        record_id = pnl_res.json()["record_id"]
        return token, record_id

    def test_anonymous_reactions_toggle(self):
        _, record_id = self._create_user_and_post("trader_anon1", 12000.0)
        client_a = "anon_client_abc123"

        # 1. Visitor reacts with thumbsup
        res1 = self.client.post(
            f"/api/v1/pnl/records/{record_id}/reactions",
            headers={"X-Client-Id": client_a},
            json={"reaction_type": "thumbsup"},
        )
        self.assertEqual(res1.status_code, 200)
        data1 = res1.json()
        self.assertEqual(data1["reactions"].get("thumbsup"), 1)
        self.assertIn("thumbsup", data1["user_reactions"])

        # 2. Same visitor reacts with heart
        res2 = self.client.post(
            f"/api/v1/pnl/records/{record_id}/reactions",
            headers={"X-Client-Id": client_a},
            json={"reaction_type": "heart"},
        )
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json()
        self.assertEqual(data2["reactions"].get("thumbsup"), 1)
        self.assertEqual(data2["reactions"].get("heart"), 1)
        self.assertIn("thumbsup", data2["user_reactions"])
        self.assertIn("heart", data2["user_reactions"])

        # 3. Same visitor toggles thumbsup off
        res3 = self.client.post(
            f"/api/v1/pnl/records/{record_id}/reactions",
            headers={"X-Client-Id": client_a},
            json={"reaction_type": "thumbsup"},
        )
        self.assertEqual(res3.status_code, 200)
        data3 = res3.json()
        self.assertNotIn("thumbsup", data3["reactions"])
        self.assertEqual(data3["reactions"].get("heart"), 1)
        self.assertNotIn("thumbsup", data3["user_reactions"])
        self.assertIn("heart", data3["user_reactions"])

    def test_multiple_clients_reacting(self):
        _, record_id = self._create_user_and_post("trader_multi", -4500.0)
        client_1 = "client_alpha"
        client_2 = "client_beta"
        client_3 = "client_gamma"

        # All 3 react with 'sad'
        for c in [client_1, client_2, client_3]:
            r = self.client.post(
                f"/api/v1/pnl/records/{record_id}/reactions",
                headers={"X-Client-Id": c},
                json={"reaction_type": "sad"},
            )
            self.assertEqual(r.status_code, 200)

        # Client 2 also reacts with 'care'
        r_care = self.client.post(
            f"/api/v1/pnl/records/{record_id}/reactions",
            headers={"X-Client-Id": client_2},
            json={"reaction_type": "care"},
        )
        self.assertEqual(r_care.status_code, 200)

        # Check summary for client 1
        summary_1 = self.client.get(
            f"/api/v1/pnl/records/{record_id}/reactions",
            headers={"X-Client-Id": client_1},
        ).json()
        self.assertEqual(summary_1["reactions"].get("sad"), 3)
        self.assertEqual(summary_1["reactions"].get("care"), 1)
        self.assertEqual(summary_1["user_reactions"], ["sad"])

        # Check summary for client 2
        summary_2 = self.client.get(
            f"/api/v1/pnl/records/{record_id}/reactions",
            headers={"X-Client-Id": client_2},
        ).json()
        self.assertEqual(summary_2["reactions"].get("sad"), 3)
        self.assertEqual(summary_2["reactions"].get("care"), 1)
        self.assertIn("sad", summary_2["user_reactions"])
        self.assertIn("care", summary_2["user_reactions"])

    def test_invalid_reaction_type(self):
        _, record_id = self._create_user_and_post("trader_inv", 100.0)
        res = self.client.post(
            f"/api/v1/pnl/records/{record_id}/reactions",
            headers={"X-Client-Id": "anon_test"},
            json={"reaction_type": "invalid_emoji"},
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Invalid reaction_type", res.json()["detail"])

    def test_leaderboard_includes_reactions_and_record_id(self):
        _, record_id = self._create_user_and_post("trader_board", -9999.0)
        client_x = "anon_leaderboard_tester"

        # React with 'wow'
        self.client.post(
            f"/api/v1/pnl/records/{record_id}/reactions",
            headers={"X-Client-Id": client_x},
            json={"reaction_type": "wow"},
        )

        # Call leaderboard
        lb_res = self.client.get(
            "/api/v1/leaderboard/",
            headers={"X-Client-Id": client_x},
        )
        self.assertEqual(lb_res.status_code, 200)
        entries = lb_res.json()["entries"]
        found = next((e for e in entries if e["user"]["username"] == "trader_board"), None)
        self.assertIsNotNone(found)
        self.assertEqual(found["record_id"], record_id)
        self.assertEqual(found["reactions"].get("wow"), 1)
        self.assertEqual(found["user_reactions"], ["wow"])


if __name__ == "__main__":
    unittest.main()
