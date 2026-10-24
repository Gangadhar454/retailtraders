"""End-to-end smoke test for the NetPnL API.

Runs the real ASGI app against a throwaway SQLite database and walks the
whole product flow: register -> manual P&L -> broker link -> verified P&L ->
UPI verification -> leaderboard -> profile -> export payload.
"""

from __future__ import annotations

import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

DB_PATH = Path(tempfile.gettempdir()) / "netpnl_smoke.db"
DB_PATH.unlink(missing_ok=True)

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{DB_PATH.as_posix()}"
os.environ["SECRET_KEY"] = "smoke-test-secret"
os.environ["UPSTOX_CLIENT_ID"] = ""
os.environ["UPSTOX_CLIENT_SECRET"] = ""
os.environ["ZERODHA_API_KEY"] = ""
os.environ["ZERODHA_API_SECRET"] = ""
os.environ["UPI_PROVIDER"] = "mock"
os.environ["SYNC_ENABLED"] = "false"
os.environ["DEBUG"] = "false"
os.environ["SQL_ECHO"] = "false"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.pnl_sync import calendar_day_for, trading_day_for  # noqa: E402

API = "/api/v1"
PASSES: list[str] = []
FAILURES: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    if condition:
        PASSES.append(label)
        print(f"  PASS  {label}")
    else:
        FAILURES.append(f"{label} :: {detail}")
        print(f"  FAIL  {label} :: {detail}")


def main() -> int:
    with TestClient(app) as client:
        print("\n[1] health")
        res = client.get("/health")
        check("health returns ok", res.status_code == 200 and res.json()["status"] == "ok", res.text)

        print("\n[2] registration + auth")
        res = client.post(
            f"{API}/auth/register",
            json={
                "email": "trader@example.com",
                "password": "terminal123",
                "display_name": "Ravi Sharma",
            },
        )
        check("register succeeds", res.status_code == 201, res.text)
        tokens = res.json()
        access = tokens["access_token"]
        auth = {"Authorization": f"Bearer {access}"}

        res = client.post(
            f"{API}/auth/register",
            json={"email": "trader@example.com", "password": "terminal123", "display_name": "Dup"},
        )
        check("duplicate email rejected", res.status_code == 409, res.text)

        res = client.post(
            f"{API}/auth/login",
            json={"email": "trader@example.com", "password": "wrongpass1"},
        )
        check("bad password rejected", res.status_code == 401, res.text)

        res = client.post(
            f"{API}/auth/login",
            json={"email": "trader@example.com", "password": "terminal123"},
        )
        check("login succeeds", res.status_code == 200, res.text)

        res = client.get(f"{API}/auth/me", headers=auth)
        check("me returns profile", res.status_code == 200, res.text)
        me = res.json()
        username = me["username"]
        check("username generated", bool(username), str(me))

        res = client.get(f"{API}/auth/me")
        check("me requires auth", res.status_code in (401, 403), res.text)

        res = client.post(
            f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        )
        check("refresh returns a new pair", res.status_code == 200, res.text)
        if res.status_code == 200:
            refreshed = res.json()
            check("refresh has an access token", bool(refreshed["access_token"]), res.text)
            new_auth = {"Authorization": f"Bearer {refreshed['access_token']}"}
            res2 = client.get(f"{API}/auth/me", headers=new_auth)
            check("refreshed token works", res2.status_code == 200, res2.text)

        res = client.post(f"{API}/auth/refresh", json={"refresh_token": "not-a-token"})
        check("bad refresh token rejected", res.status_code == 401, res.text)

        res = client.post(f"{API}/auth/refresh", json={})
        check("refresh requires a body", res.status_code == 422, res.text)

        print("\n[3] manual (unverified) P&L")
        res = client.post(
            f"{API}/pnl/",
            headers=auth,
            json={"net_pnl": -12500.50, "notes": "Broke on a gap down", "trade_count": 9},
        )
        check("manual P&L accepted", res.status_code == 201, res.text)
        manual = res.json()
        check("manual record is unverified", manual["is_verified"] is False, res.text)
        check("manual source is MANUAL", manual["source"] == "MANUAL", res.text)
        check(
            "manual posting uses the IST calendar date",
            manual["date"] == calendar_day_for().isoformat(),
            res.text,
        )
        saturday = datetime(2026, 10, 24, 12, tzinfo=timezone.utc)
        check(
            "calendar day stays Saturday while broker sync uses Friday",
            calendar_day_for(saturday).isoformat() == "2026-10-24"
            and trading_day_for(saturday).isoformat() == "2026-10-23",
            str((calendar_day_for(saturday), trading_day_for(saturday))),
        )

        res = client.post(f"{API}/pnl/", headers=auth, json={"net_pnl": 0})
        check("zero P&L rejected", res.status_code == 422, res.text)

        print("\n[4] Upstox OAuth link (no credentials configured)")
        res = client.get(f"{API}/brokers/upstox/authorize", headers=auth)
        check("authorize refused when not configured", res.status_code == 503, res.text)
        detail = str(res.json().get("detail", ""))
        check(
            "refusal is human readable",
            "upstox" in detail.lower() and "api key" in detail.lower(),
            detail,
        )

        print("\n[4b] Zerodha OAuth link (no credentials configured)")
        res = client.get(f"{API}/brokers/zerodha/authorize", headers=auth)
        check("zerodha authorize refused when not configured", res.status_code == 503, res.text)
        detail = str(res.json().get("detail", ""))
        check(
            "zerodha refusal is human readable",
            "zerodha" in detail.lower() and "api key" in detail.lower(),
            detail,
        )

        res = client.post(f"{API}/pnl/sync", headers=auth)
        check("sync refused without a broker link", res.status_code == 400, res.text)
        detail = str(res.json().get("detail", ""))
        check(
            "sync refusal is human readable",
            "connect" in detail.lower() and "{" not in detail,
            detail,
        )

        print("\n[5] manual entry (no broker linked, so manual is allowed)")
        res = client.post(f"{API}/pnl/", headers=auth, json={"net_pnl": -500})
        check("manual P&L accepted", res.status_code == 201, res.text)
        manual = res.json()
        check("manual record is unverified", manual["is_verified"] is False, res.text)
        check("manual source is MANUAL", manual["source"] == "MANUAL", res.text)

        print("\n[7] UPI verification")
        res = client.post(f"{API}/upi/verify", headers=auth, json={"upi_id": "not-a-upi"})
        check("malformed UPI rejected", res.status_code == 422, res.text)

        res = client.post(
            f"{API}/upi/verify", headers=auth, json={"upi_id": "ravi.sharma@okhdfcbank"}
        )
        check("penny drop runs", res.status_code == 200, res.text)
        upi = res.json()
        check("UPI verified", upi["status"] == "VERIFIED", res.text)
        check("resolved name returned", bool(upi["resolved_name"]), res.text)
        check("tipping enabled", upi["can_tip"] is True, res.text)

        res = client.get(f"{API}/upi/status", headers=auth)
        check("upi status readable", res.status_code == 200 and res.json()["can_tip"], res.text)

        res = client.get(f"{API}/upi/intent?amount=500", headers=auth)
        check("upi intent built", res.status_code == 200, res.text)
        intent = res.json()
        check("intent is a upi:// url", intent["intent_url"].startswith("upi://pay?"), res.text)
        check("intent carries amount", "am=500.00" in intent["intent_url"], res.text)

        print("\n[8] public leaderboard + sentiment")
        res = client.get(f"{API}/leaderboard/sentiment")
        check("sentiment is public", res.status_code == 200, res.text)
        sent = res.json()
        check(
            "sentiment date uses the IST calendar day",
            sent["date"] == calendar_day_for().isoformat(),
            res.text,
        )
        check("sentiment counts trader", sent["trader_count"] >= 1, res.text)
        check("verified bucket populated", sent["unverified_count"] == 1, res.text)
        check(
            "since-launch total includes today's P&L",
            sent["since_launch_net_pnl"] == sent["net_pnl_total"],
            res.text,
        )

        res = client.post(
            f"{API}/auth/register",
            json={
                "email": "second.trader@example.com",
                "password": "terminal123",
                "display_name": "Second Trader",
            },
        )
        check("second trader registers", res.status_code == 201, res.text)
        second_auth = {"Authorization": f"Bearer {res.json()['access_token']}"}
        res = client.post(
            f"{API}/pnl/", headers=second_auth, json={"net_pnl": 500}
        )
        check("second trader publishes", res.status_code == 201, res.text)

        res = client.post(
            f"{API}/pnl/",
            headers=second_auth,
            json={"net_pnl": 1000, "date": "2026-10-25"},
        )
        check("launch-day P&L is accepted", res.status_code == 201, res.text)
        res = client.post(
            f"{API}/pnl/",
            headers=second_auth,
            json={"net_pnl": -250, "date": "2026-10-26"},
        )
        check("following-day P&L is accepted", res.status_code == 201, res.text)
        res = client.post(
            f"{API}/pnl/",
            headers=second_auth,
            json={"net_pnl": 200, "date": "2026-10-23"},
        )
        check("pre-label-date P&L is accepted", res.status_code == 201, res.text)

        res = client.get(f"{API}/leaderboard/sentiment?day=2026-10-26")
        check(
            "total P&L sums every published day",
            res.status_code == 200
            and res.json()["since_launch_date"] == "2026-10-25"
            and res.json()["since_launch_net_pnl"] == 950,
            res.text,
        )

        res = client.get(f"{API}/leaderboard/?sort=worst")
        check("leaderboard is public", res.status_code == 200, res.text)
        board = res.json()
        check("leaderboard has both traders", len(board["entries"]) == 2, res.text)
        check("entry is unverified", board["entries"][0]["is_verified"] is False, res.text)
        check("entry has rank", board["entries"][0]["rank"] == 1, res.text)

        res = client.get(
            f"{API}/leaderboard/?sort=worst&verified_only=false&limit=1&offset=1"
        )
        check(
            "leaderboard offset returns the next page",
            res.status_code == 200
            and len(res.json()["entries"]) == 1
            and res.json()["entries"][0]["rank"] == 2
            and res.json()["total"] == 2,
            res.text,
        )

        res = client.get(f"{API}/leaderboard/?scope=cumulative&sort=worst")
        check(
            "cumulative leaderboard returns all-time entries",
            res.status_code == 200
            and res.json()["scope"] == "cumulative"
            and len(res.json()["entries"]) == 2,
            res.text,
        )

        res = client.get(f"{API}/pnl/feed?sort=worst")
        check("feed is public", res.status_code == 200, res.text)
        check("feed has both traders", len(res.json()["entries"]) == 2, res.text)

        print("\n[9] public profile")
        res = client.get(f"{API}/users/{username}")
        check("profile is public", res.status_code == 200, res.text)
        profile = res.json()
        check("profile has stats", profile["stats"]["total_records"] == 1, res.text)
        check("profile has timeline", len(profile["timeline"]) == 1, res.text)
        check("profile exposes upi", profile["upi"]["can_tip"] is True, res.text)
        check("profile exposes broker", profile["linked_broker"] is None, res.text)
        check("volatility computed", isinstance(profile["stats"]["volatility"], float), res.text)
        check("max drawdown computed", profile["stats"]["max_drawdown"] >= 0, res.text)

        res = client.get(f"{API}/users/does-not-exist")
        check("unknown user 404s", res.status_code == 404, res.text)

        print("\n[10] record can be managed")
        res = client.get(f"{API}/pnl/mine", headers=auth)
        record_id = res.json()[0]["record_id"]
        res = client.delete(f"{API}/pnl/{record_id}", headers=auth)
        check("unverified record can be deleted", res.status_code == 204, res.text)

        res = client.get(f"{API}/users/does-not-exist")
        check("unknown user 404s", res.status_code == 404, res.text)

    print("\n" + "=" * 62)
    print(f"PASSED {len(PASSES)}   FAILED {len(FAILURES)}")
    for failure in FAILURES:
        print(f"  ! {failure}")
    print("=" * 62)
    return 1 if FAILURES else 0


if __name__ == "__main__":
    raise SystemExit(main())
