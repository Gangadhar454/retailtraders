"""Exercises Angel One Publisher Login and SmartAPI against a local stub."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

DB_PATH = Path(tempfile.gettempdir()) / "netpnl_angel_one_stub.db"
DB_PATH.unlink(missing_ok=True)

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{DB_PATH.as_posix()}"
os.environ["SECRET_KEY"] = "angel-one-stub-test-secret"
os.environ["UPI_PROVIDER"] = "mock"
os.environ["SYNC_ENABLED"] = "false"
os.environ["DEBUG"] = "false"
os.environ["ANGEL_ONE_API_KEY"] = "stub-api-key"
os.environ["ANGEL_ONE_API_BASE"] = "http://127.0.0.1"
os.environ["ANGEL_ONE_REDIRECT_URI"] = (
    "https://api.example.test/api/v1/brokers/angel_one/callback"
)
os.environ["ANGEL_ONE_CLIENT_LOCAL_IP"] = "127.0.0.1"
os.environ["ANGEL_ONE_CLIENT_PUBLIC_IP"] = "203.0.113.10"
os.environ["ANGEL_ONE_MAC_ADDRESS"] = "00:11:22:33:44:55"

REQUESTS: list[dict[str, str]] = []
AUTH_TOKEN = "stub-angel-jwt-token"


class StubAngelOne(BaseHTTPRequestHandler):
    def log_message(self, *args):
        return

    def _record(self) -> None:
        REQUESTS.append(
            {
                "method": self.command,
                "path": self.path,
                "authorization": self.headers.get("Authorization", ""),
                "private_key": self.headers.get("X-PrivateKey", ""),
                "user_type": self.headers.get("X-UserType", ""),
                "source_id": self.headers.get("X-SourceID", ""),
                "local_ip": self.headers.get("X-ClientLocalIP", ""),
                "public_ip": self.headers.get("X-ClientPublicIP", ""),
                "mac_address": self.headers.get("X-MACAddress", ""),
            }
        )

    def _send(self, payload: dict) -> None:
        raw = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        self._record()
        if self.path.endswith("/user/v1/getProfile"):
            self._send(
                {
                    "status": True,
                    "message": "SUCCESS",
                    "data": {
                        "clientcode": "STUB_CLIENT_1",
                        "name": "Stub Trader",
                        "email": "stub.trader@example.com",
                    },
                }
            )
            return
        if self.path.endswith("/order/v1/getPosition"):
            self._send(
                {
                    "status": True,
                    "message": "SUCCESS",
                    "data": [
                        {"tradingsymbol": "SBIN-EQ", "realised": "250.50", "unrealised": "900"},
                        {"tradingsymbol": "INFY-EQ", "realised": "-40.25", "unrealised": "-100"},
                    ],
                }
            )
            return
        if self.path.endswith("/order/v1/getTradeBook"):
            self._send(
                {
                    "status": True,
                    "message": "SUCCESS",
                    "data": [
                        {"tradingsymbol": "SBIN-EQ", "filltime": "10:00:00"},
                        {"tradingsymbol": "INFY-EQ", "filltime": "11:00:00"},
                    ],
                }
            )
            return
        self.send_error(404)


def start_stub() -> tuple[ThreadingHTTPServer, int]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), StubAngelOne)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, server.server_address[1]


server, port = start_stub()
os.environ["ANGEL_ONE_API_BASE"] = f"http://127.0.0.1:{port}"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.angel_one import AngelOneClient  # noqa: E402

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
    invalid_redirect = AngelOneClient()
    invalid_redirect.redirect_uri = (
        "http://127.0.0.1:8010/api/v1/brokers/angel_one/callback"
    )
    check("localhost redirect is rejected", not invalid_redirect.is_configured)

    with TestClient(app) as client:
        print("\n[angel one Publisher Login, stubbed SmartAPI]")
        res = client.post(
            f"{API}/auth/register",
            json={
                "email": "angel.one.stub@example.com",
                "password": "terminal123",
                "display_name": "Stub Trader",
            },
        )
        check("register", res.status_code == 201, res.text)
        auth = {"Authorization": f"Bearer {res.json()['access_token']}"}

        res = client.get(
            f"{API}/brokers/angel_one/authorize?origin=http://localhost:3000",
            headers=auth,
        )
        check("authorize succeeds", res.status_code == 200, res.text)
        body = res.json()
        url = body["authorization_url"]
        query = parse_qs(urlparse(url).query)
        check("uses Angel One Publisher Login", urlparse(url).path.endswith("/publisher-login"), url)
        check("includes app API key", query.get("api_key") == ["stub-api-key"], url)
        check(
            "registers backend callback URL",
            query.get("redirect_url") == [os.environ["ANGEL_ONE_REDIRECT_URI"]],
            url,
        )
        check("includes state", query.get("state") == [body["state"]], url)

        res = client.get(
            f"{API}/brokers/angel_one/callback",
            params={"auth_token": AUTH_TOKEN, "feed_token": "unused-feed-token", "state": body["state"]},
            follow_redirects=False,
        )
        check("callback redirects to frontend", res.status_code == 303, res.text)
        location = res.headers.get("location", "")
        check("redirect does not expose token", AUTH_TOKEN not in location, location)
        check("redirect preserves Angel One selection", "broker=angel_one" in location, location)
        check("frontend gets a success flag", "connected=1" in location, location)

        linked = client.get(f"{API}/brokers/", headers=auth)
        check(
            "broker linked to account",
            linked.status_code == 200
            and len(linked.json()) == 1
            and linked.json()[0]["broker_name"] == "Angel One",
            linked.text,
        )

        res = client.post(f"{API}/pnl/sync?broker=angel_one", headers=auth)
        check("P&L sync succeeds", res.status_code == 200, res.text)
        record = res.json().get("record") if res.status_code == 200 else None
        check("record is verified", bool(record) and record["is_verified"], str(record))
        check(
            "only realised P&L is published",
            bool(record) and abs(float(record["net_pnl"]) - 210.25) < 0.01,
            str(record),
        )
        check("trade count comes from trade book", bool(record) and record["trade_count"] == 2, str(record))
        check("source is Angel One", bool(record) and record["source"] == "ANGEL_ONE", str(record))

        expected_paths = {
            "/rest/secure/angelbroking/user/v1/getProfile",
            "/rest/secure/angelbroking/order/v1/getPosition",
            "/rest/secure/angelbroking/order/v1/getTradeBook",
        }
        check("profile, positions, and trade book read", expected_paths.issubset({r["path"] for r in REQUESTS}), str(REQUESTS))
        check(
            "SmartAPI auth headers set",
            all(
                r["authorization"] == f"Bearer {AUTH_TOKEN}"
                and r["private_key"] == "stub-api-key"
                and r["user_type"] == "USER"
                and r["source_id"] == "WEB"
                for r in REQUESTS
            ),
            str(REQUESTS),
        )

    print("\n" + "=" * 62)
    print(f"PASSED {len(PASSES)}   FAILED {len(FAILURES)}")
    print("=" * 62)
    for failure in FAILURES:
        print(f"  - {failure}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    raise SystemExit(main())