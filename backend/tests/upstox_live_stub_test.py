"""Exercises the live Upstox code path against a local stand-in for Upstox.

The stub speaks the same shapes as the real broker, so the OAuth exchange, the
positions read and the published figure can be checked without any Upstox
account:

  * the token request must be form-encoded and carry the client secret
  * realised P&L must come from positions, never from holdings
  * the published number must be the broker's realised figure, as-is
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

DB_PATH = Path(tempfile.gettempdir()) / "netpnl_upstox_stub.db"
DB_PATH.unlink(missing_ok=True)

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{DB_PATH.as_posix()}"
os.environ["SECRET_KEY"] = "upstox-stub-test-secret"
os.environ["UPI_PROVIDER"] = "mock"
os.environ["SYNC_ENABLED"] = "false"
os.environ["DEBUG"] = "false"
os.environ["UPSTOX_CLIENT_ID"] = "stub-api-key"
os.environ["UPSTOX_CLIENT_SECRET"] = "stub-api-secret"
os.environ["UPSTOX_REDIRECT_URI"] = "http://localhost:3000/settings/brokers/callback"

REQUESTS: list[dict[str, str]] = []


class StubUpstox(BaseHTTPRequestHandler):
    """Answers like Upstox v2 does, and records every call."""

    def log_message(self, *args):  # noqa: A003 - silence the default logging
        return

    def _record(self, body: str = "") -> None:
        REQUESTS.append(
            {
                "method": self.command,
                "path": self.path,
                "content_type": self.headers.get("Content-Type", ""),
                "authorization": self.headers.get("Authorization", ""),
                "body": body,
            }
        )

    def _send(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self) -> None:  # noqa: N802 - http.server API
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode()
        self._record(body)

        if self.path == "/v2/login/authorization/token":
            self._send(
                200,
                {
                    "status": "success",
                    "data": {
                        "access_token": "stub-access-token",
                        "refresh_token": "stub-refresh-token",
                        "token_type": "bearer",
                        "expires_in": 3600,
                        "scope": "read",
                        "user_id": "STUB_USER_1",
                        "user_name": "Stub Trader",
                        "email": "stub.trader@example.com",
                    },
                },
            )
            return
        self._send(404, {"status": "error", "errors": [{"errorCode": "UDAPI100060"}]})

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        self._record()

        if self.path.startswith("/v2/portfolio/positions"):
            self._send(
                200,
                {
                    "status": "success",
                    "data": {
                        "positions": [
                            {
                                "tradingsymbol": "SBIN",
                                "realised": 1500.75,
                                "unrealised": -250.5,
                            },
                            {
                                "tradingsymbol": "INFY",
                                "realised": -400.25,
                                "unrealised": 75.0,
                            },
                        ]
                    },
                },
            )
            return
        if self.path.startswith("/v2/order/trades/get-trades-for-day"):
            self._send(
                200,
                {
                    "status": "success",
                    "data": {
                        "trades": [
                            {
                                "tradingsymbol": "SBIN",
                                "trade_timestamp": "2026-10-22T10:00:00+05:30",
                                "pnl": 300.5,
                            },
                            {
                                "tradingsymbol": "INFY",
                                "trade_timestamp": "2026-10-22T11:30:00+05:30",
                                "pnl": -120.0,
                            },
                            {
                                "tradingsymbol": "TCS",
                                "trade_timestamp": "2026-10-22T12:45:00+05:30",
                                "pnl": 90.25,
                            },
                        ]
                    },
                },
            )
            return
        if self.path.startswith("/v2/user/profile"):
            self._send(
                200,
                {
                    "status": "success",
                    "data": {
                        "user_id": "STUB_USER_1",
                        "user_name": "Stub Trader",
                        "email": "stub.trader@example.com",
                    },
                },
            )
            return
        self._send(404, {"status": "error", "errors": [{"errorCode": "UDAPI100060"}]})


def start_stub() -> tuple[ThreadingHTTPServer, int]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), StubUpstox)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, server.server_address[1]


server, port = start_stub()
os.environ["UPSTOX_API_BASE"] = f"http://127.0.0.1:{port}/v2"
os.environ["UPSTOX_AUTH_BASE"] = f"http://127.0.0.1:{port}/v2/login/authorization"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

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
        print("\n[upstox live path, stubbed broker]")

        res = client.post(
            f"{API}/auth/register",
            json={
                "email": "stub@example.com",
                "password": "terminal123",
                "display_name": "Stub Trader",
            },
        )
        check("register", res.status_code in (200, 201), res.text)
        auth = {"Authorization": f"Bearer {res.json()['access_token']}"}

        res = client.get(f"{API}/brokers/upstox/authorize", headers=auth)
        check("authorize succeeds", res.status_code == 200, res.text)
        url = res.json()["authorization_url"]
        check("authorize url opens the broker dialog", "/dialog?" in url, url)
        state = res.json()["state"]

        res = client.post(
            f"{API}/brokers/upstox/callback",
            headers=auth,
            json={"code": "stub-code", "state": state},
        )
        check("callback links the broker", res.status_code == 200, res.text)
        check("broker name captured", res.json().get("broker_name") == "Upstox", res.text)
        check(
            "broker legal name comes from the token",
            res.json().get("broker_legal_name") == "Stub Trader",
            res.text,
        )

        token_call = next(
            (r for r in REQUESTS if r["path"].startswith("/v2/login/authorization/token")),
            None,
        )
        check("token endpoint was called", token_call is not None, str(REQUESTS))
        if token_call:
            check(
                "token request is form encoded",
                "application/x-www-form-urlencoded" in token_call["content_type"],
                token_call["content_type"],
            )
            check(
                "token request carries the client id",
                "client_id=stub-api-key" in token_call["body"],
                token_call["body"],
            )
            check(
                "token request carries the client secret",
                "client_secret=stub-api-secret" in token_call["body"],
                token_call["body"],
            )
            check(
                "token request asks for an authorization code grant",
                "grant_type=authorization_code" in token_call["body"],
                token_call["body"],
            )

        res = client.post(f"{API}/pnl/sync?broker=upstox", headers=auth)
        check("sync succeeds", res.status_code == 200, res.text)
        record = res.json().get("record") if isinstance(res.json(), dict) else None
        check("record published", bool(record), res.text)
        if record:
            check("record is verified", record.get("is_verified") is True, str(record))
            check(
                "published figure is the broker's realised p&l",
                abs(float(record.get("net_pnl", 0)) - 1100.5) < 0.01,
                str(record.get("net_pnl")),
            )
            check(
                "trade count comes from the day's trades",
                int(record.get("trade_count", 0)) == 3,
                str(record.get("trade_count")),
            )
            check(
                "win rate comes from the day's trades",
                abs(float(record.get("win_rate") or 0) - 66.67) < 0.1,
                str(record.get("win_rate")),
            )

        paths = [r["path"] for r in REQUESTS]
        check(
            "positions were read",
            any(p.startswith("/v2/portfolio/positions") for p in paths),
            str(paths),
        )
        check(
            "holdings were never read",
            not any("holding" in p for p in paths),
            str(paths),
        )
        positions_call = next(
            (r for r in REQUESTS if r["path"].startswith("/v2/portfolio/positions")),
            None,
        )
        if positions_call:
            check(
                "positions are fetched with the broker token",
                positions_call["authorization"] == "Bearer stub-access-token",
                positions_call["authorization"],
            )

    print("\n" + "=" * 62)
    print(f"PASSED {len(PASSES)}   FAILED {len(FAILURES)}")
    print("=" * 62)
    for failure in FAILURES:
        print(f"  - {failure}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    raise SystemExit(main())
