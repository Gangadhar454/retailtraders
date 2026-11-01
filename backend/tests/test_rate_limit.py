import os
import sys
import unittest

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.core.rate_limit import InMemoryRateLimiter, RateLimitMiddleware


class RateLimitTestCase(unittest.TestCase):
    def setUp(self):
        # Create a small standalone test app with small limits for easy assertion
        self.app = FastAPI()
        self.limiter = InMemoryRateLimiter(
            general_limit_per_minute=5,
            auth_limit_per_minute=2,
            window_seconds=60,
        )
        self.app.add_middleware(RateLimitMiddleware, limiter=self.limiter)

        @self.app.get("/health")
        def health():
            return {"status": "ok"}

        @self.app.get("/api/v1/leaderboard")
        def leaderboard():
            return {"data": []}

        @self.app.post("/api/v1/auth/login")
        def login():
            return {"token": "test"}

        self.client = TestClient(self.app)

    def test_health_check_exempt(self):
        # 20 requests to health check should all pass without 429
        for _ in range(20):
            res = self.client.get("/health")
            self.assertEqual(res.status_code, 200)

    def test_general_rate_limit(self):
        headers = {"x-forwarded-for": "203.0.113.10"}
        # First 5 should succeed
        for i in range(5):
            res = self.client.get("/api/v1/leaderboard", headers=headers)
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.headers.get("x-ratelimit-limit"), "5")
            self.assertEqual(res.headers.get("x-ratelimit-remaining"), str(5 - (i + 1)))

        # 6th should be rejected with 429
        res = self.client.get("/api/v1/leaderboard", headers=headers)
        self.assertEqual(res.status_code, 429)
        self.assertIn("Retry-After", res.headers)
        data = res.json()
        self.assertIn("detail", data)
        self.assertIn("retry_after", data)

    def test_auth_route_strict_limit(self):
        headers = {"x-forwarded-for": "203.0.113.20"}
        # First 2 should succeed
        for _ in range(2):
            res = self.client.post("/api/v1/auth/login", headers=headers)
            self.assertEqual(res.status_code, 200)

        # 3rd should be rejected with 429
        res = self.client.post("/api/v1/auth/login", headers=headers)
        self.assertEqual(res.status_code, 429)
        self.assertIn("Retry-After", res.headers)

    def test_separate_ip_quotas(self):
        headers_a = {"x-forwarded-for": "198.51.100.1"}
        headers_b = {"x-forwarded-for": "198.51.100.2"}

        # Exhaust IP A
        for _ in range(5):
            self.assertEqual(self.client.get("/api/v1/leaderboard", headers=headers_a).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/leaderboard", headers=headers_a).status_code, 429)

        # IP B should still have fresh quota
        res_b = self.client.get("/api/v1/leaderboard", headers=headers_b)
        self.assertEqual(res_b.status_code, 200)
        self.assertEqual(res_b.headers.get("x-ratelimit-remaining"), "4")

    def test_cors_options_exempt(self):
        headers = {"x-forwarded-for": "203.0.113.30"}
        # Exhaust quota
        for _ in range(5):
            self.client.get("/api/v1/leaderboard", headers=headers)
        self.assertEqual(self.client.get("/api/v1/leaderboard", headers=headers).status_code, 429)

        # OPTIONS preflight should still succeed
        res = self.client.options("/api/v1/leaderboard", headers=headers)
        self.assertNotEqual(res.status_code, 429)


if __name__ == "__main__":
    unittest.main()

