from __future__ import annotations

import asyncio
from datetime import datetime
import os
import sys
import unittest

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, backend_dir)
site_packages = os.path.join(backend_dir, ".venv", "Lib", "site-packages")
if os.path.exists(site_packages) and site_packages not in sys.path:
    sys.path.insert(0, site_packages)

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-manual-limits"
os.environ["ADMIN_USERNAME"] = "testadmin"
os.environ["ADMIN_PASSWORD"] = "testadminpass123"
os.environ["UPI_PROVIDER"] = "mock"
os.environ["SYNC_ENABLED"] = "false"
os.environ["DEBUG"] = "false"

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import init_models


class TestManualPostingLimitsAndAdmin(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        asyncio.run(init_models())
        cls.client = TestClient(app)

    def _get_admin_token(self) -> str:
        res = self.client.post(
            "/api/v1/admin/login",
            json={"username": "testadmin", "password": "testadminpass123"},
        )
        self.assertEqual(res.status_code, 200)
        return res.json()["access_token"]

    def _register_user(self, name: str) -> tuple[str, str]:
        email = f"{name.lower().replace(' ', '_')}_{int(datetime.now().timestamp()*1000)}@example.com"
        res = self.client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "Password123!",
                "display_name": name,
            },
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        token = data["access_token"]
        me_res = self.client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(me_res.status_code, 200)
        user_id = me_res.json()["user_id"]
        return token, user_id

    def test_01_manual_posting_bounds_validation(self):
        token, _ = self._register_user("Limit Tester")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Reject +10,000,000 (over +99,99,999)
        res_high = self.client.post("/api/v1/pnl/", json={"net_pnl": 10000000.0}, headers=headers)
        self.assertIn(res_high.status_code, [400, 422])

        # 2. Reject -10,000,000 (below -99,99,999)
        res_low = self.client.post("/api/v1/pnl/", json={"net_pnl": -10000000.0}, headers=headers)
        self.assertIn(res_low.status_code, [400, 422])

        # 3. Reject 0 (zero pnl)
        res_zero = self.client.post("/api/v1/pnl/", json={"net_pnl": 0.0}, headers=headers)
        self.assertIn(res_zero.status_code, [400, 422])

        # 4. Accept +99,99,999 (exact max bound: 9,999,999)
        res_max = self.client.post("/api/v1/pnl/", json={"net_pnl": 9999999.0, "notes": "Max profit"}, headers=headers)
        self.assertEqual(res_max.status_code, 201)
        self.assertEqual(res_max.json()["net_pnl"], 9999999.0)

        # 5. Accept -99,99,999 (exact min bound: -9,999,999)
        res_min = self.client.post("/api/v1/pnl/", json={"net_pnl": -9999999.0, "notes": "Max loss"}, headers=headers)
        self.assertEqual(res_min.status_code, 201)
        self.assertEqual(res_min.json()["net_pnl"], -9999999.0)

    def test_02_admin_postings_and_delete(self):
        admin_token = self._get_admin_token()
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        token, _ = self._register_user("Suspicious Poster")
        user_headers = {"Authorization": f"Bearer {token}"}

        # User posts a manual entry
        post_res = self.client.post("/api/v1/pnl/", json={"net_pnl": 450000.0, "notes": "Suspicious profit"}, headers=user_headers)
        self.assertEqual(post_res.status_code, 201)
        record_id = post_res.json()["record_id"]

        # Admin fetches real postings
        admin_postings_res = self.client.get("/api/v1/admin/real-postings", headers=admin_headers)
        self.assertEqual(admin_postings_res.status_code, 200)
        postings = admin_postings_res.json()
        matching = [p for p in postings if p["record_id"] == record_id]
        self.assertEqual(len(matching), 1)
        self.assertIn("is_manual_blocked", matching[0])
        self.assertFalse(matching[0]["is_manual_blocked"])

        # Admin deletes the suspicious posting
        del_res = self.client.delete(f"/api/v1/admin/postings/{record_id}", headers=admin_headers)
        self.assertEqual(del_res.status_code, 200)
        self.assertTrue(del_res.json()["success"])

        # Verify it's gone
        admin_postings_res_after = self.client.get("/api/v1/admin/real-postings", headers=admin_headers)
        self.assertEqual(admin_postings_res_after.status_code, 200)
        postings_after = admin_postings_res_after.json()
        self.assertEqual(len([p for p in postings_after if p["record_id"] == record_id]), 0)

    def test_03_admin_block_and_unblock_manual_postings(self):
        admin_token = self._get_admin_token()
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        token, user_id = self._register_user("Block Target")
        user_headers = {"Authorization": f"Bearer {token}"}

        # 1. Check real users list includes this user
        users_res = self.client.get("/api/v1/admin/real-users", headers=admin_headers)
        self.assertEqual(users_res.status_code, 200)
        users = users_res.json()
        matching_user = next((u for u in users if u["user_id"] == user_id), None)
        self.assertIsNotNone(matching_user)
        self.assertFalse(matching_user["is_manual_blocked"])

        # 2. Block the user from posting manual entries
        block_res = self.client.post(
            f"/api/v1/admin/users/{user_id}/block-manual",
            json={"blocked": True},
            headers=admin_headers,
        )
        self.assertEqual(block_res.status_code, 200)
        self.assertTrue(block_res.json()["is_manual_blocked"])

        # 3. Check /auth/me returns is_manual_blocked = True
        me_res = self.client.get("/api/v1/auth/me", headers=user_headers)
        self.assertEqual(me_res.status_code, 200)
        self.assertTrue(me_res.json()["is_manual_blocked"])

        # 4. User attempts manual posting -> Must be rejected with 403 Forbidden
        attempt_post = self.client.post(
            "/api/v1/pnl/",
            json={"net_pnl": 5000.0, "notes": "Blocked attempt"},
            headers=user_headers,
        )
        self.assertEqual(attempt_post.status_code, 403)
        self.assertIn("blocked", attempt_post.json()["detail"].lower())

        # 5. Unblock the user
        unblock_res = self.client.post(
            f"/api/v1/admin/users/{user_id}/block-manual",
            json={"blocked": False},
            headers=admin_headers,
        )
        self.assertEqual(unblock_res.status_code, 200)
        self.assertFalse(unblock_res.json()["is_manual_blocked"])

        # 6. Check /auth/me returns is_manual_blocked = False
        me_res2 = self.client.get("/api/v1/auth/me", headers=user_headers)
        self.assertEqual(me_res2.status_code, 200)
        self.assertFalse(me_res2.json()["is_manual_blocked"])

        # 7. User attempts manual posting again -> Must succeed with 201 Created
        allowed_post = self.client.post(
            "/api/v1/pnl/",
            json={"net_pnl": 5000.0, "notes": "Unblocked success"},
            headers=user_headers,
        )
        self.assertEqual(allowed_post.status_code, 201)
        self.assertEqual(allowed_post.json()["net_pnl"], 5000.0)


if __name__ == "__main__":
    unittest.main()
