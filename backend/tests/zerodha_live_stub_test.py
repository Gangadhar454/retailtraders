"""Exercises the live Zerodha code path against a local stand-in for Kite.

The stub speaks Kite Connect v3 shapes, so the checksum exchange, the positions
read and the published figure can be checked without a broker account:

  * the token request must be form-encoded and carry the SHA-256 checksum
  * realised P&L must come from net positions, never from unrealised/holdings
  * Kite's trade book has no P&L, so the win rate stays empty
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

DB_PATH = Path(tempfile.gettempdir()) / "netpnl_zerodha_stub.db"
DB_PATH.unlink(missing_ok=True)

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{DB_PATH.as_posix()}"
os.environ["SECRET_KEY"] = "zerodha-stub-test-secret"
os.environ["UPI_PROVIDER"] = "mock"
os.environ["SYNC_ENABLED"] = "false"
os.environ["DEBUG"] = "false"
os.environ["ZERODHA_API_KEY"] = "stub-key"
os.environ["ZERODHA_API_SECRET"] = "stub-secret"
os.environ["ZERODHA_REDIRECT_URI"] = "http://localhost:3000/settings/brokers/callback"

REQUESTS: list[dict[str, str]] = []

API_KEY = "stub-key"
API_SECRET = "stub-secret"
REQUEST_TOKEN = "stub-request-token"
CHECKSUM = hashlib.sha256(
    f"{API_KEY}{REQUEST_TOKEN}{API_SECRET}".encode()
).hexdigest()


class StubZerodha(BaseHTTPRequestHandler):
    """Answers like Kite Connect v3 and records every call."""

    def log_message(self, *args):  # noqa: A003 - silence the default logging
        return

    def _record(self, body: str = "") -> None:
        REQUESTS.append(
            {
                "method": self.command,
                "path": self.path,
                "content_type": self.headers.get("Content-Type", ""),
                "authorization": self.headers.get("Authorization", ""),
                "kite_version": self.headers.get("X-Kite-Version", ""),
                "body": body,
            }
        )

    def _send(self, status: int, payload) -> None:
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

        if self.path == "/session/token":
            self._send(
                200,
                {
                    "status": "success",
                    "data": {
                        "access_token": "stub-access-token",
                        "public_token": "stub-public-token",
                        "refresh_token": "stub-refresh-token",
                        "user_id": "STUB_USER_1",
                        "user_name": "Stub Trader",
                        "email": "stub.trader@example.com",
                        "login_time": "2026-10-23 09:15:00",
                    },
                },
            )
            return
        self._send(
            404,
            {
                "status": "error",
                "message": "not found",
                "error_type": "InputException",
            },
        )

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        self._record()

        if self.path == "/portfolio/positions":
            self._send(
                200,
                {
                    "status": "success",
                    "data": {
                        "net": [
                            {
                                "tradingsymbol": "SBIN",
                                "realised": 1250.5,
                                "unrealised": -300.0,
                                "quantity": 10,
                            },
                            {
                                "tradingsymbol": "INFY",
                                "realised": -320.25,
                                "unrealised": 90.0,
                                "quantity": -5,
                            },
                        ],
                        "day": [],
                    },
                },
            )
            return
        if self.path == "/trades":
            self._send(
                200,
                {
                    "status": "success",
                    "data": [
                        {
                            "tradingsymbol": "SBIN",
                            "fill_timestamp": "2026-10-23 09:30:00",
                            "quantity": 10,
                        },
                        {
                            "tradingsymbol": "INFY",
                            "fill_timestamp": "2026-10-23 10:15:00",
                            "quantity": -5,
                        },
                        {
                            "tradingsymbol": "TCS",
                            "fill_timestamp": "2026-10-23 11:00:00",
                            "quantity": 3,
                        },
                    ],
                },
            )
            return
        if self.path == "/user/profile":
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
        self._send(
            404,
            {
                "status": "error",
                "message": "not found",
                "error_type": "InputException",
            },
        )


def start_stub() -> tuple[ThreadingHTTPServer, int]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), StubZerodha)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, server.server_address[1]


server, port = start_stub()
os.environ["ZERODHA_API_BASE"] = f"http://127.0.0.1:{port}"
os.environ["ZERODHA_LOGIN_BASE"] = f"http://127.0.0.1:{port}"

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
        print("\n[zerodha live path, stubbed broker]")

        res = client.post(
            f"{API}/auth/register",
            json={
                "email": "zerodha.stub@example.com",
                "password": "terminal123",
                "display_name": "Stub Trader",
            },
        )
        check("register", res.status_code in (200, 201), res.text)
        auth = {"Authorization": f"Bearer {res.json()['access_token']}"}

        res = client.get(f"{API}/brokers/zerodha/authorize", headers=auth)
        check("authorize succeeds", res.status_code == 200, res.text)
        body = res.json()
        url = body["authorization_url"]
        check("authorize uses the Kite login host", "/connect/login?" in url, url)
        check("authorize carries api_key", "api_key=stub-key" in url, url)
        check(
            "authorize round-trips the broker in redirect_params",
            "redirect_params=" in url and "broker%3Dzerodha" in url,
            url,
        )
        state = body["state"]
        check("authorize returns the state", bool(state), str(body))
        check(
            "authorize echoes the broker name",
            body.get("broker_name") == "Zerodha",
            str(body),
        )

        res = client.post(
            f"{API}/brokers/zerodha/callback",
            headers=auth,
            json={"request_token": REQUEST_TOKEN, "state": state},
        )
        check("callback links the broker", res.status_code == 200, res.text)
        check("broker name captured", res.json().get("broker_name") == "Zerodha", res.text)
        check(
            "broker legal name comes from the token",
            res.json().get("broker_legal_name") == "Stub Trader",
            res.text,
        )

        token_call = next(
            (r for r in REQUESTS if r["path"] == "/session/token"), None
        )
        check("token endpoint was called", token_call is not None, str(REQUESTS))
        if token_call:
            check(
                "token request is form encoded",
                "application/x-www-form-urlencoded" in token_call["content_type"],
                token_call["content_type"],
            )
            check(
                "token request carries the api key",
                f"api_key={API_KEY}" in token_call["body"],
                token_call["body"],
            )
            check(
                "token request carries the request token",
                f"request_token={REQUEST_TOKEN}" in token_call["body"],
                token_call["body"],
            )
            check(
                "token request carries the sha256 checksum",
                f"checksum={CHECKSUM}" in token_call["body"],
                token_call["body"],
            )
            check(
                "token request does not leak the api secret",
                API_SECRET not in token_call["body"],
                token_call["body"],
            )

        res = client.post(f"{API}/pnl/sync?broker=zerodha", headers=auth)
        check("sync succeeds", res.status_code == 200, res.text)
        record = res.json().get("record") if isinstance(res.json(), dict) else None
        check("record published", bool(record), res.text)
        if record:
            check("record is verified", record.get("is_verified") is True, str(record))
            check(
                "published figure is net realised p&l",
                abs(float(record.get("net_pnl", 0)) - 930.25) < 0.01,
                str(record.get("net_pnl")),
            )
            check(
                "unrealised p&l is not published",
                abs(float(record.get("net_pnl", 0)) - 1110.5) > 0.01,
                str(record.get("net_pnl")),
            )
            check(
                "trade count comes from the trade book",
                int(record.get("trade_count", 0)) == 3,
                str(record.get("trade_count")),
            )
            check(
                "kite trades carry no pnl so win rate stays empty",
                record.get("win_rate") is None,
                str(record.get("win_rate")),
            )
            check(
                "source is marked Zerodha",
                record.get("source") == "ZERODHA",
                str(record.get("source")),
            )

        paths = [r["path"] for r in REQUESTS]
        check("positions were read", "/portfolio/positions" in paths, str(paths))
        check("trade book was read", "/trades" in paths, str(paths))
        check(
            "holdings were never read",
            not any("holding" in p for p in paths),
            str(paths),
        )
        positions_call = next(
            (r for r in REQUESTS if r["path"] == "/portfolio/positions"), None
        )
        if positions_call:
            check(
                "positions are fetched with the broker token",
                positions_call["authorization"]
                == f"token {API_KEY}:stub-access-token",
                positions_call["authorization"],
            )
            check(
                "requests declare Kite v3",
                positions_call["kite_version"] == "3",
                positions_call["kite_version"],
            )

    print("\n" + "=" * 62)
    print(f"PASSED {len(PASSES)}   FAILED {len(FAILURES)}")
    print("=" * 62)
    for failure in FAILURES:
        print(f"  - {failure}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    raise SystemExit(main())
