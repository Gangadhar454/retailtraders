"""Checks the two Upstox deployment modes without contacting Upstox.

  unconfigured : no API key, mock off -> the picker says "not set up" and
                 connecting is refused with a readable message.
  live         : API key present, mock off -> the browser is handed Upstox's
                 own login dialog (no request leaves the app here).

Run:  python tests/upstox_mode_test.py unconfigured
      python tests/upstox_mode_test.py live
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

SCENARIO = sys.argv[1] if len(sys.argv) > 1 else "unconfigured"

DB_PATH = Path(tempfile.gettempdir()) / f"netpnl_upstox_{SCENARIO}.db"
DB_PATH.unlink(missing_ok=True)

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{DB_PATH.as_posix()}"
os.environ["SECRET_KEY"] = "upstox-mode-test-secret"
os.environ["UPI_PROVIDER"] = "mock"
os.environ["SYNC_ENABLED"] = "false"
os.environ["DEBUG"] = "false"

if SCENARIO == "live":
    os.environ["UPSTOX_CLIENT_ID"] = "test-api-key"
    os.environ["UPSTOX_CLIENT_SECRET"] = "test-api-secret"
    os.environ["UPSTOX_REDIRECT_URI"] = "http://localhost:3000/settings/brokers/callback"
else:
    os.environ["UPSTOX_CLIENT_ID"] = ""
    os.environ["UPSTOX_CLIENT_SECRET"] = ""

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
        print(f"\n[upstox mode: {SCENARIO}]")

        res = client.get(f"{API}/brokers/supported")
        check("catalogue is public", res.status_code == 200, res.text)
        upstox = next(b for b in res.json() if b["key"] == "upstox")
        print(f"        upstox option: {upstox}")

        res = client.post(
            f"{API}/auth/register",
            json={
                "email": f"{SCENARIO}@example.com",
                "password": "terminal123",
                "display_name": "Mode Tester",
            },
        )
        check("register", res.status_code in (200, 201), res.text)
        token = res.json()["access_token"]
        auth = {"Authorization": f"Bearer {token}"}

        res = client.get(f"{API}/brokers/upstox/authorize", headers=auth)
        print(f"        authorize -> {res.status_code} {res.text[:220]}")

        if SCENARIO == "live":
            check("authorize succeeds", res.status_code == 200, res.text)
            url = res.json()["authorization_url"]
            check(
                "browser goes to the upstox login dialog",
                url.startswith("https://api.upstox.com/v2/login/authorization/dialog"),
                url,
            )
            check("dialog carries the client id", "client_id=test-api-key" in url, url)
            check(
                "dialog carries the registered redirect uri",
                "redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fsettings%2Fbrokers%2Fcallback" in url,
                url,
            )
            check("dialog asks for a code", "response_type=code" in url, url)
            check("dialog carries the state nonce", "state=" in url, url)
        else:
            check("authorize is refused with 503", res.status_code == 503, res.text)
            detail = str(res.json().get("detail", ""))
            check(
                "refusal is human readable",
                "upstox" in detail.lower() and "api key" in detail.lower() and "{" not in detail,
                detail,
            )

        res = client.post(f"{API}/pnl/sync?broker=upstox", headers=auth)
        check("sync without a broker link is refused", res.status_code == 400, res.text)
        detail = str(res.json().get("detail", ""))
        check(
            "sync refusal is human readable",
            "upstox" in detail.lower() and "{" not in detail,
            detail,
        )

        res = client.post(f"{API}/pnl/", headers=auth, json={"net_pnl": 1000})
        check("manual entry still works", res.status_code == 201, res.text)

    print("\n" + "=" * 62)
    print(f"PASSED {len(PASSES)}   FAILED {len(FAILURES)}")
    print("=" * 62)
    for failure in FAILURES:
        print(f"  - {failure}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    raise SystemExit(main())
